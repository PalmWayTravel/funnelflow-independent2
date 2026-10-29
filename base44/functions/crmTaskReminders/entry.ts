import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendEmail } from '../../shared/crm.ts';

// Napi belső emlékeztető: a lejárt, a mai és a holnapi nyitott feladatokat,
// valamint a következő 48 óra foglalásait jelzi a csapatnak — belső
// értesítésben (harang) és egy összefoglaló e-mailben.
const MAX_LISTED = 25;
const BOOKING_WINDOW_HOURS = 48;

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return isoDate(new Date(Date.UTC(y, m - 1, d + days)));
}

function formatHu(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return y && m && d ? `${y}.${m}.${d}.` : '—';
}

function startOfDayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

// A foglalások idejét a csapat időzónájában (Budapest) mutatjuk.
const HU_DATETIME = new Intl.DateTimeFormat('hu-HU', {
  timeZone: 'Europe/Budapest',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

function formatHuDateTime(iso) {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  // A hu-HU formázás a pont után szóközt tesz: 2026. 10. 02. 00:30 → 2026.10.02. 00:30
  return HU_DATETIME.format(date).replace(/\.\s/g, '.');
}

function bookingLabel(booking) {
  return booking.name || booking.email || 'Névtelen foglalás';
}

// Egy foglalásról is naponta egyszer szólunk.
async function notifyBookingOnce(base44, booking) {
  const already = await base44.asServiceRole.entities.ActivityLog
    .count({ type: 'booking_upcoming', entity_id: booking.id, created_date: { $gte: startOfDayIso() } })
    .catch(() => 1);
  if (already > 0) return false;
  await base44.asServiceRole.entities.ActivityLog.create({
    message: `Közelgő foglalás: ${bookingLabel(booking)} — ${formatHuDateTime(booking.start)}`,
    type: 'booking_upcoming',
    entity_type: 'Booking',
    entity_id: booking.id,
    read: false,
  }).catch(() => null);
  return true;
}

// Egy feladatról naponta egyszer szólunk, így egy ismételt futás sem spammel.
async function notifyOnce(base44, task, message) {
  const already = await base44.asServiceRole.entities.ActivityLog
    .count({ type: 'task_due', entity_id: task.id, created_date: { $gte: startOfDayIso() } })
    .catch(() => 1);
  if (already > 0) return false;
  await base44.asServiceRole.entities.ActivityLog
    .create({ message, type: 'task_due', entity_type: 'Task', entity_id: task.id, read: false })
    .catch(() => null);
  return true;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // A napi ütemezett futásnál nincs felhasználói munkamenet; appból csak admin hívhatja.
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const today = isoDate(new Date());
    const tomorrow = addDays(today, 1);

    const tasks = await base44.asServiceRole.entities.Task
      .filter({ done: { $ne: true }, due_date: { $lte: tomorrow } }, 'due_date', 300)
      .catch(() => []);

    const members = await base44.asServiceRole.entities.User.list().catch(() => []);
    const ownerOf = (id) => members.find((u) => u.id === id)?.full_name || '';

    const groups = [
      {
        label: 'LEJÁRT',
        items: tasks.filter((t) => t.due_date && t.due_date < today),
        notice: (t) => `Határidő lejárt: „${t.title}” (${formatHu(t.due_date)})`,
      },
      {
        label: 'MA ESEDÉKES',
        items: tasks.filter((t) => t.due_date === today),
        notice: (t) => `Ma esedékes: „${t.title}” (${formatHu(t.due_date)})`,
      },
      {
        label: 'HOLNAP ESEDÉKES',
        items: tasks.filter((t) => t.due_date === tomorrow),
        notice: (t) => `Holnap esedékes: „${t.title}” (${formatHu(t.due_date)})`,
      },
    ];
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);

    let notified = 0;
    for (const group of groups) {
      for (const task of group.items) {
        if (await notifyOnce(base44, task, group.notice(task))) notified += 1;
      }
    }

    // Közelgő foglalások: a következő 48 óra megerősített időpontjai.
    const nowMs = Date.now();
    const bookings = await base44.asServiceRole.entities.Booking
      .filter({
        status: 'confirmed',
        start: {
          $gte: new Date(nowMs).toISOString(),
          $lte: new Date(nowMs + BOOKING_WINDOW_HOURS * 3600000).toISOString(),
        },
      }, 'start', 200)
      .catch(() => []);

    for (const booking of bookings) {
      if (await notifyBookingOnce(base44, booking)) notified += 1;
    }

    const digestAlreadySent = await base44.asServiceRole.entities.ActivityLog
      .count({ type: 'task_digest', created_date: { $gte: startOfDayIso() } })
      .catch(() => 1);

    const emails = [];
    if ((total > 0 || bookings.length > 0) && digestAlreadySent === 0) {
      const settingsList = await base44.asServiceRole.entities.WorkspaceSettings.list('-created_date', 1).catch(() => []);
      const settings = settingsList[0] || null;
      const recipients = members.filter((u) => u.role === 'admin' && u.email).map((u) => u.email);
      const subject = `Emlékeztető: ${groups[0].items.length} lejárt, ${groups[1].items.length} mai feladat · ${bookings.length} közelgő foglalás`;

      const lines = [
        'Szia!',
        '',
        `Íme a mai határidő- és foglalás-kép (${formatHu(today)}) — hogy biztosan ne csússzunk ki az ügyfelek határidejéből:`,
        '',
      ];
      for (const group of groups) {
        if (!group.items.length) continue;
        lines.push(`${group.label} (${group.items.length})`);
        for (const task of group.items.slice(0, MAX_LISTED)) {
          const owner = ownerOf(task.assigned_to_id);
          lines.push(`• ${task.title} — ${formatHu(task.due_date)}${owner ? ` (${owner})` : ''}`);
        }
        if (group.items.length > MAX_LISTED) lines.push(`… és további ${group.items.length - MAX_LISTED} feladat.`);
        lines.push('');
      }
      if (bookings.length) {
        lines.push(`KÖZELGŐ FOGLALÁSOK (${bookings.length})`);
        for (const booking of bookings.slice(0, MAX_LISTED)) {
          lines.push(`• ${bookingLabel(booking)} — ${formatHuDateTime(booking.start)}`);
        }
        if (bookings.length > MAX_LISTED) lines.push(`… és további ${bookings.length - MAX_LISTED} foglalás.`);
        lines.push('');
      }
      lines.push('A teljes lista: FunnelFlow → Feladatok, illetve Foglalások.');
      const body = lines.join('\n');

      for (const to of recipients) {
        const result = await sendEmail(base44, { to, subject, body, fromName: settings?.email_from_name || '' });
        emails.push({ to, status: result.status });
      }

      if (emails.some((e) => e.status === 'sent')) {
        await base44.asServiceRole.entities.ActivityLog.create({
          message: `Napi emlékeztető elküldve: ${groups[0].items.length} lejárt, ${groups[1].items.length} mai, ${groups[2].items.length} holnapi feladat · ${bookings.length} közelgő foglalás.`,
          type: 'task_digest',
          entity_type: 'Task',
          entity_id: '',
          read: false,
        }).catch(() => null);
      }
    }

    return Response.json({
      date: today,
      overdue: groups[0].items.length,
      dueToday: groups[1].items.length,
      dueTomorrow: groups[2].items.length,
      upcomingBookings: bookings.length,
      notified,
      digestAlreadySent: digestAlreadySent > 0,
      emails,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}