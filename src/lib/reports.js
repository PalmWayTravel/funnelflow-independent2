import { endOfMonth, format, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";
import { hu } from "date-fns/locale";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { base44 } from "@/api/base44Client";
import { formatCurrency, formatDateFull, formatDateTime, formatNumber } from "@/lib/format";

export const REPORT_PERIODS = [
  { key: "this_month", label: "Ez a hónap" },
  { key: "last_month", label: "Előző hónap" },
  { key: "last_30", label: "Elmúlt 30 nap" },
  { key: "this_year", label: "Ez az év" },
];

export const REPORT_TYPES = [
  { key: "summary", label: "Összefoglaló", description: "Az időszak fő eredményei és a teljes tölcsér egy oldalon." },
  { key: "pipeline", label: "Lead fázisok", description: "Pillanatkép arról, hol tartanak most a leadjeid fázisonként." },
  { key: "leads", label: "Lead lista", description: "Az időszakban beérkezett leadek adatai." },
  { key: "bookings", label: "Foglalások", description: "Az időszakra eső foglalások adatai." },
];

const SOURCE_LABELS = { "Meta Ads": "Meta Ads", Website: "Weboldal", Referral: "Ajánlás", Form: "Űrlap", Foglalás: "Foglalás", Egyéb: "Egyéb", Other: "Egyéb" };
const BOOKING_STATUS = { confirmed: "Megerősítve", cancelled: "Lemondva", completed: "Teljesítve" };

const EVENTS = ["lead", "booked", "held", "noshow", "cancel", "quote", "signed", "closed"];

const EMPTY = "";

export function periodRange(key) {
  const today = new Date();
  if (key === "last_month") {
    const prev = subMonths(today, 1);
    return { start: startOfMonth(prev), end: endOfMonth(prev) };
  }
  if (key === "last_30") return { start: subDays(today, 29), end: today };
  if (key === "this_year") return { start: startOfYear(today), end: today };
  return { start: startOfMonth(today), end: endOfMonth(today) };
}

const countsFrom = (rows) => Object.fromEntries((rows || []).map((r) => [r.type, r.count || 0]));
const amountsFrom = (rows) => Object.fromEntries((rows || []).map((r) => [r.type, r.sum_amount || 0]));
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

async function stageNames(accountId) {
  const stages = await base44.entities.PipelineStage.filter({ account_id: accountId }, "order", 50).catch(() => []);
  return { stages, byId: Object.fromEntries(stages.map((s) => [s.id, s.name])) };
}

// Egy riport "dokumentum" leírása: a képernyő és a letöltések ugyanebből dolgoznak.
export async function loadReport(type, periodKey, accountId) {
  const { start, end } = periodRange(periodKey);
  const startDate = format(start, "yyyy-MM-dd");
  const endDate = format(end, "yyyy-MM-dd");
  const startISO = start.toISOString();
  const endISO = end.toISOString();
  const periodLabel = `${format(start, "yyyy. MMM d.", { locale: hu })} – ${format(end, "yyyy. MMM d.", { locale: hu })}`;
  const generatedAt = format(new Date(), "yyyy. MMM d. HH:mm", { locale: hu });
  const typeDef = REPORT_TYPES.find((t) => t.key === type);
  const base = { title: typeDef?.label || "Riport", periodLabel, generatedAt, summary: [], columns: null, rows: null, note: EMPTY };

  if (!accountId) return { ...base, note: "Ehhez a fiókhoz nincs hozzárendelt munkaterület." };

  if (type === "leads") {
    const [page, total] = await Promise.all([
      base44.entities.Contact.filter(
        { account_id: accountId, created_date: { $gte: startISO, $lte: endISO } },
        { sort: "-created_date", limit: 300 }
      ),
      base44.entities.Contact.count({ account_id: accountId, created_date: { $gte: startISO, $lte: endISO } }),
    ]);
    const { byId } = await stageNames(accountId);
    return {
      ...base,
      title: "Lead lista",
      summary: [{ label: "Összes lead az időszakban", value: formatNumber(total) }],
      columns: [
        { key: "name", label: "Név" },
        { key: "email", label: "E-mail" },
        { key: "phone", label: "Telefon" },
        { key: "company", label: "Cég" },
        { key: "source", label: "Forrás" },
        { key: "stage", label: "Fázis" },
        { key: "created", label: "Beérkezett" },
      ],
      rows: page.items.map((c) => ({
        name: c.name || "—",
        email: c.email || "—",
        phone: c.phone || "—",
        company: c.company || "—",
        source: SOURCE_LABELS[c.source] || c.source || "—",
        stage: byId[c.stage_id] || "Nincs fázis",
        created: formatDateFull(c.created_date),
      })),
      note: page.items.length === 0
        ? "Ebben az időszakban nem érkezett lead."
        : page.has_more ? "A lista az első 300 tételt tartalmazza." : EMPTY,
    };
  }

  if (type === "bookings") {
    const [page, total] = await Promise.all([
      base44.entities.Booking.filter(
        { account_id: accountId, start: { $gte: startISO, $lte: endISO } },
        { sort: "start", limit: 300 }
      ),
      base44.entities.Booking.count({ account_id: accountId, start: { $gte: startISO, $lte: endISO } }),
    ]);
    return {
      ...base,
      title: "Foglalások",
      summary: [{ label: "Összes foglalás az időszakban", value: formatNumber(total) }],
      columns: [
        { key: "start", label: "Időpont" },
        { key: "name", label: "Név" },
        { key: "email", label: "E-mail" },
        { key: "phone", label: "Telefon" },
        { key: "status", label: "Állapot" },
      ],
      rows: page.items.map((b) => ({
        start: formatDateTime(b.start),
        name: b.name || "—",
        email: b.email || "—",
        phone: b.phone || "—",
        status: BOOKING_STATUS[b.status] || b.status || "—",
      })),
      note: page.items.length === 0
        ? "Ebben az időszakban nincs foglalás."
        : page.has_more ? "A lista az első 300 tételt tartalmazza." : EMPTY,
    };
  }

  if (type === "pipeline") {
    const [agg, stageRows] = await Promise.all([
      base44.entities.Contact.aggregate({ query: { account_id: accountId }, groupBy: "stage_id", limit: 200 }),
      base44.entities.PipelineStage.filter({ account_id: accountId }, "order", 50).catch(() => []),
    ]);
    const byStage = Object.fromEntries((agg.rows || []).map((r) => [r.stage_id || "", r.count || 0]));
    const known = new Set(stageRows.map((s) => s.id));
    const unassigned = (agg.rows || []).filter((r) => !known.has(r.stage_id || "")).reduce((s, r) => s + (r.count || 0), 0);
    const rows = stageRows.map((s) => ({ stage: s.name, leads: formatNumber(byStage[s.id] || 0) }));
    if (unassigned > 0) rows.push({ stage: "Nincs fázis", leads: formatNumber(unassigned) });
    const total = rows.reduce((s, r) => s + Number(String(r.leads).replace(/\s/g, "")) || 0, 0);
    return {
      ...base,
      title: "Lead fázisok",
      summary: [{ label: "Összes lead a táblán", value: formatNumber(total) }],
      columns: [
        { key: "stage", label: "Fázis" },
        { key: "leads", label: "Leadek", right: true },
      ],
      rows,
      note: rows.length === 0 ? "Még nincs fázis beállítva." : EMPTY,
    };
  }

  // Összefoglaló
  const [evAgg, newLeads, bookings] = await Promise.all([
    base44.entities.SalesEvent.aggregate({
      query: { account_id: accountId, date: { $gte: startDate, $lte: endDate } },
      groupBy: "type",
      sum: ["amount"],
      limit: 100,
    }),
    base44.entities.Contact.count({ account_id: accountId, created_date: { $gte: startISO, $lte: endISO } }),
    base44.entities.Booking.count({ account_id: accountId, start: { $gte: startISO, $lte: endISO } }),
  ]);
  const rows = evAgg.rows || [];
  const counts = countsFrom(rows);
  const amounts = amountsFrom(rows);
  const revenue = (amounts.closed || 0) + (amounts.payment || 0) - (amounts.refund || 0);
  const closed = counts.closed || 0;

  const summary = [
    { label: "Új lead a CRM-ben", value: formatNumber(newLeads) },
    { label: "Foglalás a naptárban", value: formatNumber(bookings) },
    ...EVENTS.map((t) => ({ label: EVENT_LABELS_SHORT[t], value: formatNumber(counts[t] || 0) })),
    { label: "Nettó bevétel", value: formatCurrency(revenue) },
    { label: "Átlag első fizetés", value: closed > 0 ? formatCurrency((amounts.closed || 0) / closed) : "—" },
    { label: "Lead → foglalt meeting", value: pct(counts.booked || 0, counts.lead || 0) },
    { label: "Megtartott → lezárt üzlet", value: pct(closed, counts.held || 0) },
  ];

  return { ...base, title: "Összefoglaló", summary };
}

const EVENT_LABELS_SHORT = {
  lead: "Lead esemény",
  booked: "Foglalt meeting",
  held: "Megtartott meeting",
  noshow: "Nem jelent meg",
  cancel: "Lemondott meeting",
  quote: "Ajánlat elküldve",
  signed: "Szerződés aláírva",
  closed: "Lezárt üzlet",
};

const esc = (v) => {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function exportCsv(report, periodKey) {
  const lines = [];
  if (report.rows?.length) {
    lines.push(report.columns.map((c) => esc(c.label)).join(";"));
    report.rows.forEach((r) => lines.push(report.columns.map((c) => esc(r[c.key])).join(";")));
  } else {
    lines.push("Mutató;Érték");
    (report.summary || []).forEach((s) => lines.push([esc(s.label), esc(s.value)].join(";")));
  }
  downloadBlob(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" }), `${reportFileName(report, periodKey)}.csv`);
}

export function reportFileName(report, periodKey) {
  return `funnelflow-${slug(report.title)}-${periodKey}`;
}

export async function exportPdf(node, filename) {
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;
  const data = canvas.toDataURL("image/png");
  const usable = pageH - margin * 2;
  let offset = 0;
  while (offset < imgH) {
    pdf.addImage(data, "PNG", margin, margin - offset, imgW, imgH);
    offset += usable;
    if (offset < imgH) pdf.addPage();
  }
  pdf.save(`${filename}.pdf`);
}