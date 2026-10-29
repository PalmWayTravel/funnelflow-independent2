import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { hu } from "date-fns/locale";
import { BarChart3, CalendarCheck, CalendarDays, DollarSign, KanbanSquare, Target, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAccountScope } from "@/lib/accountScope";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import PipelineBreakdown from "@/components/client/PipelineBreakdown";
import UpcomingBookings from "@/components/client/UpcomingBookings";
import { formatCurrency, formatNumber } from "@/lib/format";

const FUNNEL = [
  ["lead", "Lead esemény"],
  ["booked", "Foglalt meeting"],
  ["held", "Megtartott meeting"],
  ["noshow", "Nem jelent meg"],
  ["cancel", "Lemondott meeting"],
  ["quote", "Ajánlat elküldve"],
  ["signed", "Szerződés aláírva"],
  ["closed", "Lezárt üzlet"],
];

const countsOf = (rows) => Object.fromEntries((rows || []).map((r) => [r.type, r.count || 0]));
const amountsOf = (rows) => Object.fromEntries((rows || []).map((r) => [r.type, r.sum_amount || 0]));
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

// Az ügyfél saját vezérlőpultja: kizárólag a saját accountjához tartozó adatok.
export default function ClientDashboard() {
  const { accountId } = useAccountScope();
  const [sales, setSales] = useState({ current: [], previous: [] });
  const [pipeline, setPipeline] = useState({ items: [], total: 0 });
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) { setLoading(false); return; }
    let active = true;
    (async () => {
      const now = new Date();
      const mStart = format(startOfMonth(now), "yyyy-MM-dd");
      const mEnd = format(endOfMonth(now), "yyyy-MM-dd");
      const pStart = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
      const pEnd = format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
      try {
        const [cur, prev, stageAgg, stageRows, upcoming] = await Promise.all([
          base44.entities.SalesEvent.aggregate({
            query: { account_id: accountId, date: { $gte: mStart, $lte: mEnd } },
            groupBy: "type", sum: ["amount"], limit: 100,
          }),
          base44.entities.SalesEvent.aggregate({
            query: { account_id: accountId, date: { $gte: pStart, $lte: pEnd } },
            groupBy: "type", limit: 100,
          }),
          base44.entities.Contact.aggregate({ query: { account_id: accountId }, groupBy: "stage_id", limit: 200 }),
          base44.entities.PipelineStage.filter({ account_id: accountId }, "order", 50).catch(() => []),
          base44.entities.Booking.filter(
            { account_id: accountId, status: "confirmed", start: { $gte: new Date().toISOString() } },
            { sort: "start", limit: 5 }
          ),
        ]);
        if (!active) return;

        const byStage = Object.fromEntries((stageAgg.rows || []).map((r) => [r.stage_id || "", r.count || 0]));
        const known = new Set((stageRows || []).map((s) => s.id));
        const unassigned = (stageAgg.rows || [])
          .filter((r) => !known.has(r.stage_id || ""))
          .reduce((s, r) => s + (r.count || 0), 0);
        const items = (stageRows || []).map((s) => ({ label: s.name, color: s.color, count: byStage[s.id] || 0 }));
        if (unassigned > 0) items.push({ label: "Nincs fázis", color: "#94a3b8", count: unassigned });

        setSales({ current: cur.rows || [], previous: prev.rows || [] });
        setPipeline({ items, total: items.reduce((s, i) => s + i.count, 0) });
        setBookings(upcoming.items || []);
      } catch (e) {
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [accountId]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;
  }

  const cur = countsOf(sales.current);
  const prev = countsOf(sales.previous);
  const amounts = amountsOf(sales.current);
  const revenue = (amounts.closed || 0) + (amounts.payment || 0) - (amounts.refund || 0);
  const closed = cur.closed || 0;
  const monthLabel = format(new Date(), "yyyy. MMMM", { locale: hu });

  return (
    <div>
      <PageHeader
        title="Vezérlőpult"
        subtitle={`A saját eredményeid — ${monthLabel}`}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/crm"><KanbanSquare className="mr-1.5 h-4 w-4" /> CRM</Link></Button>
            <Button asChild size="sm" className="gradient-brand text-white"><Link to="/reports"><BarChart3 className="mr-1.5 h-4 w-4" /> Riport</Link></Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="Lead esemény" value={formatNumber(cur.lead || 0)} gradient="violet"
          sub={<span className="text-xs text-muted-foreground">Előző hónap: {formatNumber(prev.lead || 0)}</span>} />
        <StatCard icon={CalendarCheck} label="Foglalt meeting" value={formatNumber(cur.booked || 0)} gradient="blue"
          sub={<span className="text-xs text-muted-foreground">Előző hónap: {formatNumber(prev.booked || 0)}</span>} />
        <StatCard icon={Target} label="Megtartott meeting" value={formatNumber(cur.held || 0)} gradient="pink"
          sub={<span className="text-xs text-muted-foreground">Előző hónap: {formatNumber(prev.held || 0)}</span>} />
        <StatCard icon={DollarSign} label="Nettó bevétel" value={formatCurrency(revenue)} gradient="emerald"
          sub={<span className="text-xs text-muted-foreground">{formatNumber(closed)} lezárt üzlet</span>} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="mb-1 font-heading text-base font-semibold">Tölcsér ebben a hónapban</h2>
          <p className="mb-3 text-xs text-muted-foreground">Lépésről lépésre, a saját eseményeid alapján</p>
          <table className="w-full text-sm">
            <tbody>
              {FUNNEL.map(([key, label]) => (
                <tr key={key} className="border-b border-border last:border-0">
                  <td className="py-2 text-muted-foreground">{label}</td>
                  <td className="py-2 text-right font-semibold">{formatNumber(cur[key] || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Lead → foglalás: <span className="font-semibold text-foreground">{pct(cur.booked || 0, cur.lead || 0)}</span></span>
            <span>Megtartott → lezárt: <span className="font-semibold text-foreground">{pct(closed, cur.held || 0)}</span></span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="mb-1 font-heading text-base font-semibold">Lead fázisok</h2>
          <p className="mb-3 text-xs text-muted-foreground">Jelenlegi állapot a saját tábládon · összesen {formatNumber(pipeline.total)} lead</p>
          <PipelineBreakdown items={pipeline.items} total={pipeline.total} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="mb-3 font-heading text-base font-semibold">Következő foglalások</h2>
          <UpcomingBookings bookings={bookings} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="mb-3 font-heading text-base font-semibold">Gyors elérés</h2>
          <div className="space-y-2">
            <Link to="/crm" className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3 text-sm transition-colors hover:bg-accent">
              <KanbanSquare className="h-4 w-4 text-primary" /> CRM – lead tábla
            </Link>
            <Link to="/calendar" className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3 text-sm transition-colors hover:bg-accent">
              <CalendarDays className="h-4 w-4 text-primary" /> Naptár
            </Link>
            <Link to="/reports" className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3 text-sm transition-colors hover:bg-accent">
              <BarChart3 className="h-4 w-4 text-primary" /> Riport kérése és letöltése
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}