import { CALENDAR_TZ } from './crm.ts';

// Naptárbejegyzés a közös Google Naptárban, Meet linkkel. A résztvevők meghívót
// kapnak, így a meeting a saját naptárukban is megjelenik.
export async function createMeetEvent(base44, { summary, description, startMs, endMs, attendees }) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
  if (!accessToken) return { link: '', eventId: '', error: 'A Google Naptár nincs összekötve.' };
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: new Date(startMs).toISOString(), timeZone: CALENDAR_TZ },
        end: { dateTime: new Date(endMs).toISOString(), timeZone: CALENDAR_TZ },
        attendees,
        conferenceData: {
          createRequest: {
            requestId: `funnelflow-${crypto.randomUUID()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { link: '', eventId: '', error: (data && data.error && data.error.message) || `A Google Naptár hibát adott vissza (${res.status}).` };
  }
  const entry = ((data.conferenceData && data.conferenceData.entryPoints) || []).find((e) => e.entryPointType === 'video');
  return { link: data.hangoutLink || (entry && entry.uri) || '', eventId: data.id || '', error: '' };
}

// Naptáresemény törlése lemondáskor; a Google értesíti a résztvevőket.
// A már törölt (404/410) esemény nem hiba.
export async function deleteMeetEvent(base44, eventId) {
  if (!eventId) return { ok: false, error: 'Nincs eltárolt Google esemény.' };
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlecalendar');
  if (!accessToken) return { ok: false, error: 'A Google Naptár nincs összekötve.' };
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.ok || res.status === 404 || res.status === 410) return { ok: true, error: '' };
  const data = await res.json().catch(() => ({}));
  return { ok: false, error: (data && data.error && data.error.message) || `A Google Naptár hibát adott vissza (${res.status}).` };
}