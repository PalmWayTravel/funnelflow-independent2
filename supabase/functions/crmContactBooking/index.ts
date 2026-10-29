import { createClientFromRequest, serve } from '../_shared/base44.ts';
import { sendEmail, logMessage, appendActivity, formatLocalDateTime, renderTemplate, buildVars, budapestToUtc, budapestIsoDate, DEFAULT_BOOKING_SUBJECT, DEFAULT_BOOKING_BODY } from '../_shared/crm.ts';
import { createMeetEvent } from '../_shared/meet.ts';

const MIN_DURATION = 10;
const MAX_DURATION = 240;

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

// "2026-10-05" + "14:30" Budapest szerint → a valódi UTC pillanat (óraátállítás-biztos).
function instantFromLocal(dateIso, timeText) {
  const [y, m, d] = String(dateIso).split('-').map(Number);
  const [hh, mm] = String(timeText).split(':').map(Number);
  if (!y || !m || !d || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return budapestToUtc(y, m, d, hh, mm);
}

async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Bejelentkezés szükséges' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Ehhez admin jogosultság kell' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const contactId = clean(body.contact_id, 64);
    const closerId = clean(body.closer_id, 64);
    const duration = Math.min(Math.max(Number(body.duration_minutes) || 30, MIN_DURATION), MAX_DURATION);
    const startMs = instantFromLocal(clean(body.date, 10), clean(body.time, 5));
    if (!contactId || !closerId || startMs == null) {
      return Response.json({ error: 'Hiányzik a closer, a dátum vagy az időpont.' }, { status: 400 });
    }
    if (startMs < Date.now() - 60000) {
      return Response.json({ error: 'A kiválasztott időpont már elmúlt.' }, { status: 400 });
    }
    const endMs = startMs + duration * 60000;

    const [contact, closer] = await Promise.all([
      base44.asServiceRole.entities.Contact.get(contactId).catch(() => null),
      base44.asServiceRole.entities.User.get(closerId).catch(() => null),
    ]);
    if (!contact) return Response.json({ error: 'A kontakt nem található.' }, { status: 404 });
    if (!closer) return Response.json({ error: 'A kiválasztott closer nem található.' }, { status: 404 });

    const email = clean(contact.email, 200);
    if (!email) {
      return Response.json({ error: 'A kontaktnak nincs e-mail címe, így a Meet linket nem tudjuk kiküldeni.' }, { status: 400 });
    }

    const closerName = closer.full_name || closer.email || 'kollégánk';
    const when = formatLocalDateTime(startMs);
    const attendees = [{ email }];
    if (closer.email) attendees.push({ email: closer.email });

    const event = await createMeetEvent(base44, {
      summary: `Konzultáció — ${contact.name}`,
      description: [
        `Kontakt: ${contact.name}`,
        contact.company ? `Cég: ${contact.company}` : '',
        contact.phone ? `Telefon: ${contact.phone}` : '',
        `Closer: ${closerName}`,
      ].filter(Boolean).join('\n'),
      startMs,
      endMs,
      attendees,
    });
    if (event.error) {
      return Response.json({ error: `Nem sikerült létrehozni a naptárbejegyzést: ${event.error}` }, { status: 502 });
    }

    const booking = await base44.asServiceRole.entities.Booking.create({
      account_id: contact.account_id || clean(user.account_id, 64),
      contact_id: contact.id,
      name: contact.name,
      email,
      phone: contact.phone || '',
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      status: 'confirmed',
      meeting_link: event.link,
      google_event_id: event.eventId || '',
      note: `Closer: ${closerName}`,
      source: 'manual',
    });

    await appendActivity(base44, contact, `Időpont foglalva: ${when} (${duration} perc) — closer: ${closerName}`);

    await base44.asServiceRole.entities.ActivityLog.create({
      message: `Időpont foglalva: ${contact.name} — ${when} (closer: ${closerName})`,
      type: 'booking', entity_type: 'Booking', entity_id: booking.id, read: false,
    }).catch(() => null);

    // A foglalás automatikusan bekerül az értékesítési naplóba, hogy a riportok
    // ne kézi rögzítésből éljenek. A dátum a hívó helyi napja.
    await base44.asServiceRole.entities.SalesEvent.create({
      account_id: booking.account_id || '',
      type: 'booked',
      date: budapestIsoDate(startMs),
      contact_id: contact.id,
      closer_id: closerId,
      booking_id: booking.id,
    }).catch(() => null);

    const settingsList = await base44.asServiceRole.entities.WorkspaceSettings.list('-created_date', 1).catch(() => []);
    const settings = settingsList[0] || null;
    const vars = {
      ...buildVars(contact, { start: when, meeting_link: event.link }),
      closer: closerName,
      hossz: String(duration),
      felado: settings?.email_from_name || 'FunnelFlow',
    };
    const subject = renderTemplate(settings?.booking_email_subject || DEFAULT_BOOKING_SUBJECT, vars);
    const messageBody = renderTemplate(settings?.booking_email_body || DEFAULT_BOOKING_BODY, vars);

    const mail = await sendEmail(base44, {
      to: email,
      subject,
      body: messageBody,
      fromName: settings?.email_from_name || '',
    });
    await logMessage(base44, {
      contact_id: contact.id, account_id: booking.account_id, channel: 'email',
      to_address: email, subject, body: messageBody, status: mail.status, error: mail.error || '', booking_id: booking.id,
    });

    let warning = '';
    if (mail.status === 'failed') warning = `A naptárbejegyzés elkészült, de a visszaigazoló e-mail nem ment ki: ${mail.error || 'ismeretlen hiba'}`;
    else if (!event.link) warning = 'A naptárbejegyzés elkészült, de a Google nem adott vissza Meet linket.';

    return Response.json({
      ok: true,
      booking_id: booking.id,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      meeting_link: event.link,
      closer_name: closerName,
      email_status: mail.status,
      warning,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

serve(handler);
