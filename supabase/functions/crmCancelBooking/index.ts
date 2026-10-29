import { createClientFromRequest, serve } from '../_shared/base44.ts';
import { appendActivity, formatLocalDateTime, budapestIsoDate } from '../_shared/crm.ts';
import { deleteMeetEvent } from '../_shared/meet.ts';

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

// Foglalás lemondása (csak admin): a foglalás "cancelled" lesz, a hozzá tartozó Google
// Naptár esemény törlődik (a Google értesíti a leadet és a closert), a függőben lévő
// emlékeztetők leállnak, és a lemondás bekerül az értékesítési naplóba.
async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Bejelentkezés szükséges' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Ehhez admin jogosultság kell' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const bookingId = clean(body.booking_id, 64);
    if (!bookingId) return Response.json({ error: 'Hiányzó foglalás azonosító' }, { status: 400 });

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId).catch(() => null);
    if (!booking) return Response.json({ error: 'A foglalás nem található' }, { status: 404 });
    if (booking.status === 'cancelled') return Response.json({ ok: true, already: true, calendar: 'skipped' });

    await base44.asServiceRole.entities.Booking.update(booking.id, { status: 'cancelled' });

    // Google Naptár: csak akkor tudjuk törölni, ha a foglaláskor eltároltuk az esemény azonosítóját.
    let calendar = 'none';
    let calendarError = '';
    if (booking.google_event_id) {
      const res = await deleteMeetEvent(base44, booking.google_event_id).catch((e) => ({ ok: false, error: e.message }));
      calendar = res.ok ? 'deleted' : 'failed';
      calendarError = res.error || '';
    }

    // A még futó (pl. emlékeztető) sorozatok leállnak ehhez a foglaláshoz.
    const runs = await base44.asServiceRole.entities.AutomationRun
      .filter({ booking_id: booking.id, status: 'running' }, '-created_date', 50)
      .catch(() => []);
    for (const run of runs) {
      const history = [...(run.history || []), 'A foglalást lemondták — a sorozat leállt.'].slice(-60);
      await base44.asServiceRole.entities.AutomationRun.update(run.id, { status: 'stopped', history }).catch(() => null);
    }

    const when = booking.start ? formatLocalDateTime(new Date(booking.start).getTime()) : '';
    if (booking.contact_id) {
      const contact = await base44.asServiceRole.entities.Contact.get(booking.contact_id).catch(() => null);
      await appendActivity(base44, contact, `Időpont lemondva: ${when}`);
    }

    await base44.asServiceRole.entities.SalesEvent.create({
      account_id: booking.account_id || '',
      type: 'cancel',
      date: budapestIsoDate(Date.now()),
      contact_id: booking.contact_id || '',
      booking_id: booking.id,
    }).catch(() => null);

    await base44.asServiceRole.entities.ActivityLog.create({
      message: calendar === 'failed'
        ? `Foglalás lemondva (${booking.name || 'Névtelen'}, ${when}) — a Google Naptár eseményt nem sikerült törölni: ${calendarError}`
        : `Foglalás lemondva: ${booking.name || 'Névtelen'} — ${when}`,
      type: calendar === 'failed' ? 'booking_warning' : 'booking',
      entity_type: 'Booking', entity_id: booking.id, read: false,
    }).catch(() => null);

    let warning = '';
    if (calendar === 'none') warning = 'A foglalás lemondva. Ehhez a régebbi foglaláshoz nincs eltárolt Google esemény — a naptárból kézzel töröld.';
    else if (calendar === 'failed') warning = `A foglalás lemondva, de a Google Naptár eseményt nem sikerült törölni: ${calendarError}`;

    return Response.json({ ok: true, calendar, stopped_runs: runs.length, warning });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

serve(handler);
