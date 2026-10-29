import { createClientFromRequest, serve } from '../_shared/base44.ts';
import { slotTimes, toIsoDate, budapestIsoDate, budapestToUtc } from '../_shared/crm.ts';

const MAX_BOOKINGS = 500;
const MAX_TYPES = 20;
const MAX_SLOTS = 600;
const GOOGLE_EVENT_LIMIT = 250;
const MAX_RANGE_DAYS = 62;

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function ms(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

// Local date (YYYY-MM-DD) of an instant, using the same offset convention as the
// booking flow: new Date().getTimezoneOffset().
// (Az időzóna mindig Europe/Budapest, az adott nap valós eltolásával; a tzOffset paraméter nem használt.)
function localIsoDate(msValue, _tzOffset) {
  return budapestIsoDate(msValue);
}

function dayStartMs(isoDate, _tzOffset) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  return budapestToUtc(y, m, d, 0, 0);
}

function overlaps(startMs, endMs, busy) {
  for (const b of busy) {
    if (startMs < b.end && endMs > b.start) return true;
  }
  return false;
}

// Cancelled, explicitly free and declined events do not block anything.
function blocksTime(event) {
  if (!event || event.status === 'cancelled') return false;
  if (event.transparency === 'transparent') return false;
  const declined = (event.attendees || []).some((a) => a && a.self === true && a.responseStatus === 'declined');
  return !declined;
}

function mapGoogleEvents(items, tzOffset) {
  const events = [];
  const busy = [];
  for (const item of items || []) {
    if (!blocksTime(item)) continue;
    const allDay = !!(item.start && item.start.date);
    let start = null;
    let end = null;
    if (allDay) {
      start = dayStartMs(item.start.date, tzOffset);
      end = dayStartMs((item.end && item.end.date) || item.start.date, tzOffset);
      if (end <= start) end = start + 86400000;
    } else {
      start = ms(item.start && item.start.dateTime);
      end = ms(item.end && item.end.dateTime);
    }
    if (start == null || end == null || end <= start) continue;
    events.push({
      id: item.id,
      title: clean(item.summary || 'Foglalt', 120),
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      all_day: allDay,
    });
    busy.push({ start, end });
  }
  return { events, busy };
}

// The shared Google Calendar of the workspace (read-only): events for the schedule
// and busy intervals that free slots must avoid.
async function loadGoogleCalendar(base44, startIso, endIso, tzOffset) {
  try {
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
    if (!accessToken) return { connected: false, error: '', events: [], busy: [] };
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
      + `?singleEvents=true&orderBy=startTime&maxResults=${GOOGLE_EVENT_LIMIT}`
      + `&timeMin=${encodeURIComponent(startIso)}&timeMax=${encodeURIComponent(endIso)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      return { connected: true, error: `A Google Naptár nem válaszolt (${res.status}).`, events: [], busy: [] };
    }
    const data = await res.json();
    const mapped = mapGoogleEvents(data.items, tzOffset);
    return { connected: true, error: '', events: mapped.events, busy: mapped.busy };
  } catch (e) {
    return { connected: false, error: '', events: [], busy: [] };
  }
}

async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Bejelentkezés szükséges' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const tzOffset = Number.isFinite(Number(body.tz_offset)) ? Number(body.tz_offset) : 0;
    const startMs = ms(body.start);
    const endMs = ms(body.end);
    if (startMs == null || endMs == null || endMs <= startMs) {
      return Response.json({ error: 'Érvénytelen időszak' }, { status: 400 });
    }
    const rangeEnd = Math.min(endMs, startMs + MAX_RANGE_DAYS * 86400000);
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(rangeEnd).toISOString();

    const isAdmin = user.role === 'admin';
    const accountId = clean(user.account_id, 64);
    if (!isAdmin && !accountId) return Response.json({ error: 'Nincs account hozzárendelve' }, { status: 403 });

    // Admin az ügyfél nézetben egy konkrét account nevében nyitja meg a naptárat;
    // ilyenkor pontosan az ügyfél számára látható adatokat adjuk vissza.
    const scopeId = isAdmin ? clean(body.scope_account_id, 64) : accountId;

    const bookingQuery = { start: { $gte: startIso, $lt: endIso } };
    if (scopeId) bookingQuery.account_id = scopeId;

    const [bookings, types, accounts, google] = await Promise.all([
      base44.asServiceRole.entities.Booking.filter(bookingQuery, '-start', MAX_BOOKINGS).catch(() => []),
      scopeId
        ? base44.asServiceRole.entities.BookingType.filter({ account_id: scopeId }, 'created_date', 100).catch(() => [])
        : base44.asServiceRole.entities.BookingType.list('created_date', 100).catch(() => []),
      base44.asServiceRole.entities.Account.list('-created_date', 100).catch(() => []),
      loadGoogleCalendar(base44, startIso, endIso, tzOffset),
    ]);

    const typeNames = new Map(types.map((t) => [t.id, t.name]));
    const accountNames = new Map(accounts.map((a) => [a.id, a.name]));

    // Existing bookings block their own account's free slots, Google blocks them all.
    const busyByAccount = new Map();
    const bookedPerDay = new Map();
    for (const booking of bookings) {
      if (booking.status === 'cancelled') continue;
      const start = ms(booking.start);
      const end = ms(booking.end);
      if (start == null) continue;
      const endValue = end != null && end > start ? end : start + 30 * 60000;
      const list = busyByAccount.get(booking.account_id) || [];
      list.push({ start, end: endValue });
      busyByAccount.set(booking.account_id, list);
      const key = `${booking.booking_type_id}|${localIsoDate(start, tzOffset)}`;
      bookedPerDay.set(key, (bookedPerDay.get(key) || 0) + 1);
    }

    const now = Date.now();
    const slots = [];
    const firstKey = localIsoDate(startMs, tzOffset);
    const lastKey = localIsoDate(rangeEnd - 1, tzOffset);

    for (const type of types) {
      if (type.active === false || slots.length >= MAX_SLOTS) continue;
      const duration = Number(type.duration_minutes) || 30;
      const noticeMs = (Number(type.notice_hours) || 0) * 3600000;
      const maxPerDay = Number(type.max_per_day) || 6;
      const excluded = type.excluded_dates || [];
      const busy = (busyByAccount.get(type.account_id) || []).concat(google.busy);
      let [y, m, d] = firstKey.split('-').map(Number);
      let key = firstKey;
      while (key <= lastKey && slots.length < MAX_SLOTS) {
        if (!excluded.includes(key) && (bookedPerDay.get(`${type.id}|${key}`) || 0) < maxPerDay) {
          for (const slot of slotTimes(type, key, tzOffset)) {
            if (slot - now < noticeMs) continue;
            if (overlaps(slot, slot + duration * 60000, busy)) continue;
            slots.push({
              start: new Date(slot).toISOString(),
              booking_type_id: type.id,
              type_name: type.name,
              account_id: type.account_id || '',
              account_name: accountNames.get(type.account_id) || '',
              duration_minutes: duration,
            });
            if (slots.length >= MAX_SLOTS) break;
          }
        }
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        y = next.getUTCFullYear();
        m = next.getUTCMonth() + 1;
        d = next.getUTCDate();
        key = toIsoDate(y, m, d);
      }
    }

    return Response.json({
      range: { start: startIso, end: endIso },
      google: { connected: google.connected, error: google.error },
      bookings: bookings.map((b) => ({
        id: b.id,
        start: b.start,
        end: b.end,
        name: b.name || 'Névtelen',
        email: b.email || '',
        status: b.status || 'confirmed',
        meeting_link: b.meeting_link || '',
        booking_type_id: b.booking_type_id || '',
        type_name: typeNames.get(b.booking_type_id) || 'Foglalás',
        account_id: b.account_id || '',
        account_name: accountNames.get(b.account_id) || '',
      })),
      // The shared calendar belongs to the agency: client accounts see the busy
      // blocks of the same schedule, without the private event titles.
      events: isAdmin && !scopeId ? google.events : google.events.map((e) => ({ ...e, title: 'Foglalt' })),
      slots,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

serve(handler);
