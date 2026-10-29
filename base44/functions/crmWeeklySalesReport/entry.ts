import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendEmail } from '../../shared/crm.ts';

// Heti értékesítési jelentés: minden hétfő reggel elküldi a havi célokhoz mért
// legfontosabb értékesítési mutatókat az adminoknak.
const GOAL_DEFAULTS = {
  cash_target: 7500000,
  closed_deals_target: 40,
  booked_meetings_target: 260,
  monthly_commission: 240000,
};

const HU_MONTHS = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];

// A jelentés a csapat időzónája (Budapest) szerint számol.
const HU_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' });

function formatHuf(n) {
  return Math.round(Number(n) || 0).toLocaleString('hu-HU') + ' Ft';
}

// Ugyanaz a rövidítés, amit az Értékesítés oldal használ.
function formatHufShort(n) {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  if (abs >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M Ft';
  if (abs >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'e Ft';
  return num.toLocaleString('hu-HU') + ' Ft';
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('hu-HU');
}

function formatHuDate(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return y && m && d ? `${y}.${m}.${d}.` : '—';
}

function startOfDayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function rowsHtml(rows) {
  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">${rows
    .map(([label, value]) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eeecef;color:#4d4560;">${label}</td><td style="padding:6px 0;border-bottom:1px solid #eeecef;text-align:right;font-weight:bold;white-space:nowrap;">${value}</td></tr>`)
    .join('')}</table>`;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // Az ütemezett futásnál nincs felhasználói munkamenet; appból csak admin hívhatja.
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const today = HU_DATE.format(new Date());
    const [year, month, day] = today.split('-').map(Number);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const elapsed = Math.min(1, Math.max(0.01, day / daysInMonth));
    const monthLabel = `${year}. ${HU_MONTHS[month - 1]}`;
    const periodLine = `${formatHuDate(monthStart)} – ${formatHuDate(today)} · a hónap ${Math.round(elapsed * 100)}%-a telt el`;

    const [events, spends, goalsList, members, settingsList] = await Promise.all([
      base44.asServiceRole.entities.SalesEvent.filter({ date: { $gte: monthStart, $lte: today } }, 'date', 5000).catch(() => []),
      base44.asServiceRole.entities.AdSpend.filter({ date: { $gte: monthStart, $lte: today } }, '-created_date', 500).catch(() => []),
      base44.asServiceRole.entities.Goals.list('-created_date', 1).catch(() => []),
      base44.asServiceRole.entities.User.list().catch(() => []),
      base44.asServiceRole.entities.WorkspaceSettings.list('-created_date', 1).catch(() => []),
    ]);

    const count = (type) => events.filter((e) => e.type === type).length;
    const sumAmount = (type) => events.filter((e) => e.type === type).reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const netRevenue = sumAmount('closed') + sumAmount('payment') - sumAmount('refund');
    const closedDeals = count('closed');
    const booked = count('booked');
    const held = count('held');
    const noshow = count('noshow');
    const leads = count('lead');
    const avgFirstPayment = closedDeals > 0 ? sumAmount('closed') / closedDeals : 0;
    const closeRate = pct(closedDeals, held);
    const leadToClose = pct(closedDeals, leads);
    const showUp = pct(held, held + noshow);

    const adSpend = spends.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const goals = goalsList[0] || GOAL_DEFAULTS;
    const commission = Number(goals.monthly_commission) || 0;
    const totalAcqCost = adSpend + commission;
    const cpl = leads > 0 ? adSpend / leads : 0;
    const cac = closedDeals > 0 ? totalAcqCost / closedDeals : 0;
    const roas = adSpend > 0 ? netRevenue / adSpend : 0;

    const goalRows = [
      { label: 'Cash (nettó bevétel)', value: netRevenue, target: Number(goals.cash_target) || 0, fmt: formatHufShort },
      { label: 'Lezárt üzletek', value: closedDeals, target: Number(goals.closed_deals_target) || 0, fmt: formatNumber },
      { label: 'Foglalt meetingek', value: booked, target: Number(goals.booked_meetings_target) || 0, fmt: formatNumber },
    ].map((g) => {
      const expected = g.target * elapsed;
      const diff = g.value - expected;
      return {
        ...g,
        donePct: pct(g.value, g.target),
        ahead: diff >= 0,
        expectedLabel: `várt: ${g.fmt(Math.round(expected))}`,
        diffLabel: diff >= 0 ? `+${g.fmt(Math.abs(diff))} előny` : `${g.fmt(Math.abs(diff))} lemaradás`,
      };
    });

    const metrics = [
      ['Nettó bevétel', formatHuf(netRevenue)],
      ['Lezárt üzletek', formatNumber(closedDeals)],
      ['Foglalt meetingek', formatNumber(booked)],
      ['Tartott meetingek', formatNumber(held)],
      ['Új leadek', formatNumber(leads)],
      ['Átlag első fizetés', formatHuf(Math.round(avgFirstPayment))],
      ['Lead → lezárás', `${leadToClose}%`],
      ['Tartott → lezárás', `${closeRate}%`],
      ['Megjelenési arány', `${showUp}%`],
    ];

    const funnel = `Lead: ${formatNumber(leads)} · Foglalt: ${formatNumber(booked)} · Tartott: ${formatNumber(held)} · Nem jött: ${formatNumber(noshow)} · Ajánlat: ${formatNumber(count('quote'))} · Szerződött: ${formatNumber(count('signed'))} · Lezárt: ${formatNumber(closedDeals)}`;

    const acquisition = [
      ['Hirdetési költés', formatHuf(adSpend)],
      ['Lead-enkénti költség (CPL)', formatHuf(Math.round(cpl))],
      ['CAC', formatHuf(Math.round(cac))],
      ['ROAS', adSpend > 0 ? `${roas.toFixed(2)}×` : '—'],
      ['Teljes akvizíciós költség', formatHuf(totalAcqCost)],
    ];

    const already = await base44.asServiceRole.entities.ActivityLog
      .count({ type: 'sales_report', created_date: { $gte: startOfDayIso() } })
      .catch(() => 1);

    const recipients = members.filter((u) => u.role === 'admin' && u.email).map((u) => u.email);
    const cashRow = goalRows[0];
    const emails = [];

    if (recipients.length && already === 0) {
      const subject = `Heti értékesítési jelentés: ${cashRow.donePct}% cash cél · ${closedDeals} lezárt üzlet · ${booked} foglalt meeting`;

      const text = [
        'Szia!',
        '',
        `Íme a heti értékesítési jelentés (${monthLabel}) — hogyan állunk a havi célokhoz:`,
        periodLine,
        '',
        'HAVI CÉLOK',
        ...goalRows.map((g) => `• ${g.label}: ${g.fmt(g.value)} / ${g.fmt(g.target)} — ${g.donePct}% teljesítve (${g.expectedLabel}, ${g.diffLabel})`),
        '',
        'FŐ MUTATÓK',
        ...metrics.map(([label, value]) => `• ${label}: ${value}`),
        '',
        'TÖLCSÉR',
        funnel,
        '',
        'AKVIZÍCIÓS KÖLTSÉG',
        ...acquisition.map(([label, value]) => `• ${label}: ${value}`),
        '',
        'A teljes elemzés: FunnelFlow → Értékesítés.',
      ].join('\n');

      const goalHtml = goalRows.map((g) => `
      <div style="padding:10px 0;border-bottom:1px solid #eeecef;">
        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:0;">${g.label}</td>
            <td style="padding:0;text-align:right;font-weight:bold;white-space:nowrap;">${g.fmt(g.value)} <span style="font-weight:normal;color:#8a829c;">/ ${g.fmt(g.target)}</span></td>
          </tr>
        </table>
        <div style="margin-top:6px;height:6px;background:#f1eef7;border-radius:99px;overflow:hidden;">
          <div style="height:6px;width:${Math.min(100, g.donePct)}%;background:${g.ahead ? '#10B981' : '#F59E0B'};"></div>
        </div>
        <div style="margin-top:4px;font-size:12px;color:#8a829c;">${g.donePct}% teljesítve · ${g.expectedLabel} · ${g.diffLabel}</div>
      </div>`).join('');

      const html = `<div style="margin:0;padding:24px;background:#f6f4fb;font-family:Arial,Helvetica,sans-serif;color:#1f1a33;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;">
    <h1 style="margin:0 0 6px;font-size:20px;font-family:Arial,Helvetica,sans-serif;color:#8549DE;">Heti értékesítési jelentés</h1>
    <p style="margin:0 0 22px;font-size:13px;color:#6b6383;">${monthLabel} · ${periodLine}</p>

    <h2 style="margin:0 0 8px;font-size:15px;font-family:Arial,Helvetica,sans-serif;">Havi célok</h2>
    ${goalHtml}

    <h2 style="margin:22px 0 8px;font-size:15px;font-family:Arial,Helvetica,sans-serif;">Fő mutatók</h2>
    ${rowsHtml(metrics)}

    <h2 style="margin:22px 0 8px;font-size:15px;font-family:Arial,Helvetica,sans-serif;">Tölcsér</h2>
    <p style="margin:0;font-size:14px;color:#4d4560;">${funnel}</p>

    <h2 style="margin:22px 0 8px;font-size:15px;font-family:Arial,Helvetica,sans-serif;">Akvizíciós költség</h2>
    ${rowsHtml(acquisition)}

    <p style="margin:22px 0 0;font-size:12px;color:#8a829c;">A teljes elemzés: FunnelFlow → Értékesítés.</p>
  </div>
</div>`;

      const settings = settingsList[0] || null;
      for (const to of recipients) {
        const result = await sendEmail(base44, { to, subject, html, text, fromName: settings?.email_from_name || '' });
        emails.push({ to, status: result.status });
      }

      if (emails.some((e) => e.status === 'sent')) {
        await base44.asServiceRole.entities.ActivityLog.create({
          message: `Heti értékesítési jelentés elküldve: ${cashRow.donePct}% cash cél, ${closedDeals} lezárt üzlet, ${booked} foglalt meeting.`,
          type: 'sales_report',
          entity_type: 'SalesEvent',
          entity_id: '',
          read: false,
        }).catch(() => null);
      }
    }

    return Response.json({
      month: monthLabel,
      period: periodLine,
      recipients: recipients.length,
      alreadySent: already > 0,
      netRevenue,
      closedDeals,
      booked,
      cashPct: cashRow.donePct,
      emails,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}