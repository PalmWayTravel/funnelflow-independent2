import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { renderTemplate, buildVars, sendEmail, logMessage, formatLocalDateTime, slotTimes, toIsoDate, budapestParts, budapestIsoDate, DEFAULT_BOOKING_SUBJECT, DEFAULT_BOOKING_BODY } from '../../shared/crm.ts';
import { createMeetEvent } from '../../shared/meet.ts';

const MAX_BOOKINGS_CHECK = 300;

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const typeId = clean(body.booking_type_id, 64);
    if (!typeId) return Response.json({ error: 'Hiányzó időpont típus' }, { status: 400 });
    const bookingType = await base44.asServiceRole.entities.BookingType.get(typeId).catch(() => null);
    if (!bookingType || bookingType.active === false) return Response.json({ error: 'Ez az időpont típus nem elérhető' }, { status: 404 });

    const existing = await base44.asServiceRole.entities.Booking.filter(
      { booking_type_id: typeId, status: 'confirmed' }, '-start', MAX_BOOKINGS_CHECK
    ).catch(() => []);

    if (body.action === 'slots') {
      const today = budapestParts(Date.now());
      const days = [];
      const horizon = Math.min(Number(bookingType.days_ahead) || 30, 60);
      for (let i = 0; i <= horizon; i += 1) {
        const cursor = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
        const iso = toIsoDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate());
        if ((bookingType.excluded_dates || []).includes(iso)) continue;
        // Csak az ADOTT nap (Budapest szerint) foglalásai számítanak a napi maximumba.
        const dayBookings = existing.filter((b) => b.start && budapestIsoDate(new Date(b.start).getTime()) === iso).length;
        if (dayBookings >= (Number(bookingType.max_per_day) || 6)) continue;
        const slots = slotTimes(bookingType, iso).filter((slot) => {
          const taken = existing.some((b) => new Date(b.start).getTime() === slot);
          const tooSoon = slot - Date.now() < (Number(bookingType.notice_hours) || 0) * 3600000;
          return !taken && !tooSoon;
        });
        if (slots.length) days.push({ date: iso, slots: slots.map((s) => new Date(s).toISOString()) });
      }
      return Response.json({
        booking_type: { id: bookingType.id, name: bookingType.name, description: bookingType.description, duration_minutes: bookingType.duration_minutes },
        days,
      });
    }

    const startIso = clean(body.start, 40);
    const start = new Date(startIso);
    if (!startIso || isNaN(start.getTime())) return Response.json({ error: 'Érvénytelen időpont' }, { status: 400 });

    const name = clean(body.name, 150);
    const email = clean(body.email, 200);
    const phone = clean(body.phone, 40);
    const note = clean(body.note, 1000);
    if (!name || !email) return Response.json({ error: 'A név és az e-mail cím megadása kötelező' }, { status: 400 });

    const duration = Number(bookingType.duration_minutes) || 30;
    const endAt = new Date(start.getTime() + duration * 60000);

    if (existing.some((b) => new Date(b.start).getTime() === start.getTime())) {
      return Response.json({ error: 'Ez az időpont időközben elkelt, kérj másikat.' }, { status: 409 });
    }
    if (start.getTime() - Date.now() < (Number(bookingType.notice_hours) || 0) * 3600000) {
      return Response.json({ error: 'Ez az időpont már nem foglalható le.' }, { status: 409 });
    }

    const found = await base44.asServiceRole.entities.Contact.filter({ email }).catch(() => []);
    const contactData = { name, email, phone, notes: note };
    let contact;
    if (found[0]) {
      contact = await base44.asServiceRole.entities.Contact.update(found[0].id, {
        ...contactData,
        phone: phone || found[0].phone,
        tags: Array.from(new Set([...(found[0].tags || []), 'foglalás'])),
        activity: [...(found[0].activity || []), `Időpont foglalva: ${formatLocalDateTime(start.getTime())}`].slice(-100),
      });
    } else {
      contact = await base44.asServiceRole.entities.Contact.create({
        account_id: bookingType.account_id || '', ...contactData, source: 'Foglalás',
        tags: ['foglalás'],
        activity: [`Időpont foglalva: ${formatLocalDateTime(start.getTime())}`, 'Kontakt létrehozva foglalásból'],
      });
    }

    // A foglalás azonnal Meet linket kap: ha az időpont típuson nincs saját link,
    // a közös Google Naptárban hozunk létre bejegyzést Meet linkkel. A foglalás
    // akkor is létrejön, ha a naptár épp nem elérhető.
    let link = clean(bookingType.meeting_link, 500);
    let meetWarning = '';
    let googleEventId = '';
    if (!link) {
      const event = await createMeetEvent(base44, {
        summary: `Konzultáció — ${name}`,
        description: [`Kontakt: ${name}`, phone ? `Telefon: ${phone}` : '', note ? `Megjegyzés: ${note}` : ''].filter(Boolean).join('\n'),
        startMs: start.getTime(),
        endMs: endAt.getTime(),
        attendees: [{ email }],
      }).catch(() => ({ link: '', error: 'A Google Naptár nem elérhető.' }));
      link = event.link;
      googleEventId = event.eventId || '';
      meetWarning = event.error || '';
    }
    if (!link) {
      link = `https://meet.jit.si/funnelflow-${String(contact.id).slice(0, 12)}`;
      meetWarning = meetWarning || 'Nem sikerült Google Meet linket létrehozni.';
    }

    const booking = await base44.asServiceRole.entities.Booking.create({
      account_id: bookingType.account_id || '',
      booking_type_id: bookingType.id,
      contact_id: contact.id,
      name, email, phone,
      start: start.toISOString(),
      end: endAt.toISOString(),
      status: 'confirmed',
      meeting_link: link,
      google_event_id: googleEventId,
      note,
      source: 'booking_page',
    });

    await base44.asServiceRole.entities.ActivityLog.create({
      message: `Új foglalás: ${name} — ${formatLocalDateTime(start.getTime())}`,
      type: 'booking', entity_type: 'Booking', entity_id: booking.id, read: false,
    }).catch(() => null);

    // A foglalás automatikusan bekerül az értékesítési naplóba is (helyi nap szerint).
    await base44.asServiceRole.entities.SalesEvent.create({
      account_id: booking.account_id || '',
      type: 'booked',
      date: budapestIsoDate(start.getTime()),
      contact_id: contact.id,
      booking_id: booking.id,
    }).catch(() => null);

    const settingsList = await base44.asServiceRole.entities.WorkspaceSettings.list('-created_date', 1).catch(() => []);
    const settings = settingsList[0] || null;
    // Ugyanaz a szerkeszthető visszaigazoló sablon, mint a kézi foglalásnál
    // (Beállítások → Küldés). A nyilvános foglalásnál nincs kijelölt closer.
    const vars = {
      ...buildVars(contact, { start: formatLocalDateTime(start.getTime()), meeting_link: link }),
      closer: 'kollégánk',
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
      contact_id: contact.id, account_id: bookingType.account_id || '', channel: 'email',
      to_address: email, subject, body: messageBody, status: mail.status, error: mail.error || '', booking_id: booking.id,
    });

    if (meetWarning) {
      await base44.asServiceRole.entities.ActivityLog.create({
        message: `Foglalás (${name}): a Google Meet link nem jött létre — ${meetWarning}`,
        type: 'booking_warning', entity_type: 'Booking', entity_id: booking.id, read: false,
      }).catch(() => null);
    }

    if (mail.status === 'failed') {
      await base44.asServiceRole.entities.ActivityLog.create({
        message: `Foglalás (${name}): a visszaigazoló e-mail nem ment ki — ${mail.error || 'ismeretlen hiba'}`,
        type: 'booking_warning', entity_type: 'Booking', entity_id: booking.id, read: false,
      }).catch(() => null);
    }

    return Response.json({ ok: true, booking_id: booking.id, meeting_link: link, start: start.toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}