import React, { useEffect, useMemo, useState } from "react";
import {
  startOfMonth, endOfMonth, subMonths, subDays, format, parseISO, isWithinInterval, eachDayOfInterval, startOfDay, endOfDay
} from "date-fns";
import { hu } from "date-fns/locale";
import { DollarSign, TrendingUp, Users, Target, Plus, Wallet, RefreshCw, Activity as ActivityIcon } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import Modal from "@/components/Modal";
import { useAccountScope } from "@/lib/accountScope";
import { logActivity } from "@/lib/activity";
import { formatCurrency, formatCurrencyShort, formatNumber, formatDateShort, pctChange } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "this_month", label: "Ez a hónap" },
  { key: "last_month", label: "Előző hónap" },
  { key: "last_7", label: "Elmúlt 7 nap" },
  { key: "last_30", label: "Elmúlt 30 nap" },
  { key: "last_90", label: "Elmúlt 90 nap" },
];

const EVENT_TYPES = ["lead", "booked", "held", "noshow", "cancel", "quote", "signed", "closed", "payment", "refund"];
const EVENT_LABELS = { lead: "Lead", booked: "Foglalt", held: "Tartott", noshow: "Nem jött", cancel: "Lemondva", quote: "Ajánlat", signed: "Szerződött", closed: "Lezárt", payment: "Fizetés", refund: "Visszatérítés" };
const SOURCES = ["Meta Ads", "Website", "Referral", "Other"];
const SOURCE_LABELS = { "Meta Ads": "Meta Ads", Website: "Weboldal", Referral: "Ajánlás", Other: "Egyéb" };

function getRange(key) {
  const today = new Date();
  let start, end, compStart, compEnd, compLabel;
  if (key === "this_month") {
    start = startOfMonth(today); end = today;
    const daysElapsed = Math.max(1, Math.round((end - start) / 86400000) + 1);
    compEnd = subDays(start, 1); compStart = subDays(compEnd, daysElapsed - 1);
    compLabel = "tavalyi azonos napok";
  } else if (key === "last_month") {
    start = startOfMonth(subMonths(today, 1)); end = endOfMonth(subMonths(today, 1));
    compStart = startOfMonth(subMonths(today, 2)); compEnd = endOfMonth(subMonths(today, 2));
    compLabel = "azelőtti hónap";
  } else {
    const days = key === "last_7" ? 7 : key === "last_30" ? 30 : 90;
    end = today; start = subDays(today, days - 1);
    compEnd = subDays(start, 1); compStart = subDays(compEnd, days - 1);
    compLabel = `előző ${days} nap`;
  }
  return { start: startOfDay(start), end: endOfDay(end), compStart: startOfDay(compStart), compEnd: endOfDay(compEnd), compLabel };
}

function inRange(dateStr, start, end) {
  if (!dateStr) return false;
  const d = parseISO(dateStr);
  return isWithinInterval(d, { start, end });
}

function ChangePill({ current, previous, invert = false }) {
  const change = pctChange(current, previous);
  if (change == null) return null;
  const positive = invert ? change < 0 : change > 0;
  return (
    <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold", positive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400")}>
      {change > 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
    </span>
  );
}

export default function Sales() {
  const { accountId, isClient } = useAccountScope();
  const [accounts, setAccounts] = useState([]);
  const [events, setEvents] = useState([]);
  const [adSpends, setAdSpends] = useState([]);
  const [leads, setLeads] = useState([]);
  const [pipelineStages, setPipelineStages] = useState([]);
  const [users, setUsers] = useState([]);
  const [goals, setGoals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [rangeKey, setRangeKey] = useState("this_month");
  const [spendOpen, setSpendOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [spendForm, setSpendForm] = useState({ account_id: "none", date: format(new Date(), "yyyy-MM-dd"), amount: 0 });
  const [eventForm, setEventForm] = useState({ account_id: "none", type: "lead", date: format(new Date(), "yyyy-MM-dd"), setter_id: "none", closer_id: "none", source: "Meta Ads", amount: 0, setup_fee: 0, monthly_fee: 0, sales_cycle_days: 0 });
  const [goalsForm, setGoalsForm] = useState({ cash_target: 0, closed_deals_target: 0, booked_meetings_target: 0, monthly_commission: 0 });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Client role: every query is scoped to the user's own account, not filtered in the UI.
      const [ev, stageRows, ad, ld, us, gs, ac] = await Promise.all([
        isClient ? base44.entities.SalesEvent.filter({ account_id: accountId }, "-created_date", 5000) : base44.entities.SalesEvent.list("-created_date", 5000),
        base44.entities.PipelineStage.filter({ account_id: isClient ? accountId : "" }, "order", 100),
        isClient ? Promise.resolve([]) : base44.entities.AdSpend.list("-created_date", 500),
        isClient ? base44.entities.Contact.filter({ account_id: accountId }, "-created_date", 500) : base44.entities.Contact.list("-created_date", 500),
        isClient ? Promise.resolve([]) : base44.entities.User.list().catch(() => []),
        isClient ? Promise.resolve([]) : base44.entities.Goals.list("-created_date", 1),
        isClient ? Promise.resolve([]) : base44.entities.Account.list("-created_date", 200).catch(() => []),
      ]);
      setEvents(ev); setAdSpends(ad); setLeads(ld); setPipelineStages(stageRows || []); setUsers(us); setAccounts(ac);
      const g = isClient ? null : (gs[0] || { cash_target: 7500000, closed_deals_target: 40, booked_meetings_target: 260, monthly_commission: 240000 });
      setGoals(g);
      if (g) setGoalsForm({ cash_target: g.cash_target, closed_deals_target: g.closed_deals_target, booked_meetings_target: g.booked_meetings_target, monthly_commission: g.monthly_commission });
    } catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const range = useMemo(() => getRange(rangeKey), [rangeKey]);
  const userName = (id) => users.find(u => u.id === id)?.full_name || "—";

  const inRangeEvents = events.filter(e => inRange(e.date, range.start, range.end));
  const compEvents = events.filter(e => inRange(e.date, range.compStart, range.compEnd));
  const inRangeAd = adSpends.filter(a => inRange(a.date, range.start, range.end));
  const compAd = adSpends.filter(a => inRange(a.date, range.compStart, range.compEnd));

  const count = (arr, type) => arr.filter(e => e.type === type).length;
  const sumAmount = (arr, type) => arr.filter(e => e.type === type).reduce((s, e) => s + (e.amount || 0), 0);

  const netRevenue = sumAmount(inRangeEvents, "closed") + sumAmount(inRangeEvents, "payment") - sumAmount(inRangeEvents, "refund");
  const compNetRevenue = sumAmount(compEvents, "closed") + sumAmount(compEvents, "payment") - sumAmount(compEvents, "refund");
  const closedDeals = count(inRangeEvents, "closed");
  const compClosed = count(compEvents, "closed");
  const meetingsHeld = count(inRangeEvents, "held");
  const compHeld = count(compEvents, "held");
  const avgFirstPayment = closedDeals > 0 ? sumAmount(inRangeEvents, "closed") / closedDeals : 0;

  const adSpend = inRangeAd.reduce((s, a) => s + (a.amount || 0), 0);
  const compAdSpend = compAd.reduce((s, a) => s + (a.amount || 0), 0);
  const commission = rangeKey === "this_month" || rangeKey === "last_month" ? (goals?.monthly_commission || 0) : 0;
  const totalAcqCost = adSpend + commission;
  const cpl = count(inRangeEvents, "lead") > 0 ? adSpend / count(inRangeEvents, "lead") : 0;
  const cac = closedDeals > 0 ? (adSpend + commission) / closedDeals : 0;
  const roas = adSpend > 0 ? netRevenue / adSpend : 0;
  const roi = totalAcqCost > 0 ? netRevenue / totalAcqCost : 0;

  const fLead = count(inRangeEvents, "lead");
  const fBooked = count(inRangeEvents, "booked");
  const fHeld = count(inRangeEvents, "held");
  const fNoshow = count(inRangeEvents, "noshow");
  const fCancel = count(inRangeEvents, "cancel");
  const fQuote = count(inRangeEvents, "quote");
  const fSigned = count(inRangeEvents, "signed");
  const fClosed = count(inRangeEvents, "closed");
  const showUpPct = fHeld > 0 ? Math.round((fHeld / (fHeld + fNoshow)) * 100) : 0;
  const closeOfHeldPct = fHeld > 0 ? Math.round((fClosed / fHeld) * 100) : 0;

  const conv = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;
  const conversions = {
    leadToBooked: conv(fBooked, fLead),
    bookedToHeld: conv(fHeld, fBooked),
    showUp: showUpPct,
    heldToQuote: conv(fQuote, fHeld),
    quoteToClose: conv(fClosed, fQuote),
    heldToClose: conv(fClosed, fHeld),
    leadToClose: conv(fClosed, fLead),
  };

  const closedEvts = inRangeEvents.filter(e => e.type === "closed");
  const avgSetup = closedEvts.length ? closedEvts.reduce((s, e) => s + (e.setup_fee || 0), 0) / closedEvts.length : 0;
  const avgMonthly = closedEvts.length ? closedEvts.reduce((s, e) => s + (e.monthly_fee || 0), 0) / closedEvts.length : 0;
  const avgContract = avgSetup + avgMonthly;
  const avgCycle = closedEvts.filter(e => e.sales_cycle_days).length ? closedEvts.reduce((s, e) => s + (e.sales_cycle_days || 0), 0) / closedEvts.filter(e => e.sales_cycle_days).length : 0;
  const daysInRange = Math.max(1, Math.round((range.end - range.start) / 86400000) + 1);
  const avgDailyCloses = closedDeals / daysInRange;

  const dailyMap = {};
  eachDayOfInterval({ start: range.start, end: range.end }).forEach(d => {
    const k = format(d, "yyyy-MM-dd");
    dailyMap[k] = { date: format(d, "MMM d", { locale: hu }), revenue: 0, closes: 0, booked: 0, leads: 0, held: 0 };
  });
  inRangeEvents.forEach(e => {
    const k = e.date;
    if (dailyMap[k]) {
      if (e.type === "closed") { dailyMap[k].revenue += (e.amount || 0); dailyMap[k].closes += 1; }
      if (e.type === "payment") dailyMap[k].revenue += (e.amount || 0);
      if (e.type === "refund") dailyMap[k].revenue -= (e.amount || 0);
      if (e.type === "booked") dailyMap[k].booked += 1;
      if (e.type === "lead") dailyMap[k].leads += 1;
      if (e.type === "held") dailyMap[k].held += 1;
    }
  });
  const dailyData = Object.values(dailyMap);
  const step = dailyData.length > 30 ? Math.ceil(dailyData.length / 8) : 1;

  // A leadek a közös pipeline-ból jönnek, ezért a fázisok döntik el, mi nyitott és mi lezárt.
  const finalStageIds = new Set(pipelineStages.filter(s => s.is_final).map(s => s.id));
  const openLeads = leads.filter(l => l.stage_id && !finalStageIds.has(l.stage_id)).length;
  const closedLeads = leads.filter(l => finalStageIds.has(l.stage_id)).length;
  const noStageLeads = leads.filter(l => !l.stage_id || !pipelineStages.some(s => s.id === l.stage_id)).length;
  const sourceCounts = {};
  inRangeEvents.filter(e => e.type === "lead").forEach(e => { sourceCounts[e.source || "egyéb"] = (sourceCounts[e.source || "egyéb"] || 0) + 1; });

  const dealsPerDay = {};
  inRangeEvents.filter(e => e.type === "closed" || e.type === "payment").forEach(e => {
    const k = e.date;
    if (!dealsPerDay[k]) dealsPerDay[k] = { deals: 0, amount: 0 };
    if (e.type === "closed") dealsPerDay[k].deals += 1;
    dealsPerDay[k].amount += (e.amount || 0);
  });
  const dealsDayList = Object.entries(dealsPerDay).sort((a, b) => a[0] < b[0] ? 1 : -1).slice(0, 20);

  const monthProgress = useMemo(() => {
    if (rangeKey !== "this_month" || !goals) return null;
    const now = new Date();
    const msStart = startOfMonth(now).getTime();
    const msEnd = endOfMonth(now).getTime();
    const elapsed = (now.getTime() - msStart) / (msEnd - msStart);
    return { elapsed: Math.min(1, Math.max(0.01, elapsed)) };
  }, [rangeKey, goals]);

  const goalCards = monthProgress && goals ? [
    { label: "Cash", value: netRevenue, target: goals.cash_target, fmt: formatCurrencyShort },
    { label: "Lezárt üzletek", value: closedDeals, target: goals.closed_deals_target, fmt: (v) => formatNumber(v) },
    { label: "Foglalt meetingek", value: fBooked, target: goals.booked_meetings_target, fmt: (v) => formatNumber(v) },
  ] : [];

  const setters = users.filter(u => u.role === "setter" || u.role === "owner" || u.role === "manager");
  const setterRows = setters.map(u => {
    const sEvents = inRangeEvents.filter(e => e.setter_id === u.id);
    const leadsHandled = sEvents.filter(e => e.type === "lead").length;
    const booked = sEvents.filter(e => e.type === "booked").length;
    const held = sEvents.filter(e => e.type === "held").length;
    const noshow = sEvents.filter(e => e.type === "noshow").length;
    const closes = inRangeEvents.filter(e => e.type === "closed" && e.setter_id === u.id).length;
    return { name: u.full_name || u.email, leadsHandled, booked, bookPct: leadsHandled > 0 ? Math.round((booked / leadsHandled) * 100) : 0, showUp: held > 0 ? Math.round((held / (held + noshow)) * 100) : 0, closes };
  }).sort((a, b) => b.booked - a.booked);

  const closers = users.filter(u => u.role === "closer" || u.role === "owner" || u.role === "manager");
  const closerRows = closers.map(u => {
    const cEvents = inRangeEvents.filter(e => e.closer_id === u.id);
    const held = cEvents.filter(e => e.type === "held").length;
    const noshow = cEvents.filter(e => e.type === "noshow").length;
    const quotes = cEvents.filter(e => e.type === "quote").length;
    const signed = cEvents.filter(e => e.type === "signed").length;
    const closes = cEvents.filter(e => e.type === "closed").length;
    const firstPayments = cEvents.filter(e => e.type === "closed").reduce((s, e) => s + (e.amount || 0), 0);
    return { name: u.full_name || u.email, held, noshow, quotes, signed, closes, closeRate: held > 0 ? Math.round((closes / held) * 100) : 0, total: firstPayments, avg: closes > 0 ? firstPayments / closes : 0 };
  }).sort((a, b) => b.total - a.total);

  // Napi költést húz be a Meta hirdetési fiókokból a hozzárendelt accountokra.
  const syncMetaSpend = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("crmMetaInsights", {});
      const data = res.data || {};
      if (data.error) { alert(data.error); return; }
      await logActivity(`Meta hirdetési költés szinkronizálva: ${data.days || 0} nap, ${data.accounts || 0} fiók`, "sync", "AdSpend");
      if (data.errors?.length) alert(`A szinkron lefutott, de ezek a fiókok kimaradtak:\n${data.errors.join("\n")}`);
      load();
    } catch (e) { alert(e.message || "A Meta szinkron nem sikerült."); } finally { setSyncing(false); }
  };

  const saveSpend = async () => {
    setSaving(true);
    try {
      await base44.entities.AdSpend.create({
        date: spendForm.date,
        amount: Number(spendForm.amount),
        account_id: spendForm.account_id === "none" ? "" : spendForm.account_id,
        source: "manual",
      });
      await logActivity(`Hirdetési költés rögzítve: ${formatCurrency(spendForm.amount)} — ${formatDateShort(spendForm.date)}`, "create", "AdSpend");
      setSpendOpen(false); load();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const saveEvent = async () => {
    setSaving(true);
    try {
      const payload = { ...eventForm, account_id: eventForm.account_id === "none" ? "" : (eventForm.account_id || ""), setter_id: eventForm.setter_id === "none" ? "" : eventForm.setter_id, closer_id: eventForm.closer_id === "none" ? "" : eventForm.closer_id };
      await base44.entities.SalesEvent.create(payload);
      await logActivity(`${EVENT_LABELS[eventForm.type] || eventForm.type} esemény rögzítve`, "create", "SalesEvent");
      setEventOpen(false); load();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const saveGoals = async () => {
    setSaving(true);
    try {
      if (goals?.id) await base44.entities.Goals.update(goals.id, goalsForm);
      else { const g = await base44.entities.Goals.create(goalsForm); setGoals(g); }
      setGoalsOpen(false); load();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const fmt = formatCurrencyShort;
  const showAmount = ["closed", "payment", "refund"].includes(eventForm.type);
  const showFees = eventForm.type === "closed";
  const showSource = eventForm.type === "lead";
  const showCycle = eventForm.type === "closed";

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  return (
    <div style={{ maxWidth: "1400px" }}>
      <PageHeader title="Értékesítés" subtitle={isClient ? "A saját accountod értékesítési teljesítménye" : "Marketing és értékesítési teljesítményelemzés"} />

      {/* Control bar */}
      <Tabs value={tab} onValueChange={setTab}>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <TabsList>
          <TabsTrigger value="overview">Áttekintés</TabsTrigger>
          {!isClient && <TabsTrigger value="setter">Setter</TabsTrigger>}
          {!isClient && <TabsTrigger value="closer">Closer</TabsTrigger>}
        </TabsList>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={rangeKey} onValueChange={setRangeKey}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGES.map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          {!isClient && (
            <>
              <Button variant="outline" onClick={syncMetaSpend} disabled={syncing}>
                <RefreshCw className={cn("mr-1.5 h-4 w-4", syncing && "animate-spin")} /> {syncing ? "Szinkron…" : "Meta szinkron"}
              </Button>
              <Button variant="outline" onClick={() => setSpendOpen(true)}><Wallet className="mr-1.5 h-4 w-4" /> Hirdetési költés</Button>
              <Button onClick={() => setEventOpen(true)} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Esemény rögzítése</Button>
            </>
          )}
        </div>
      </div>
      <div className="mb-6 text-sm text-muted-foreground">
        {format(range.start, "MMM d", { locale: hu })} – {format(range.end, "yyyy. MMM d.", { locale: hu })} · összehasonlítva: {range.compLabel} ({format(range.compStart, "MMM d", { locale: hu })} – {format(range.compEnd, "MMM d", { locale: hu })})
      </div>

      <TabsContent value="overview" className="mt-0 space-y-8">
        {/* Monthly goals */}
        {monthProgress && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-base font-semibold">Havi célok</h2>
                <p className="text-xs text-muted-foreground">A hónap eltelt részéhez mérve</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setGoalsOpen(true)}>Célok szerkesztése</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {goalCards.map(g => {
                const pct = g.target > 0 ? Math.min(100, (g.value / g.target) * 100) : 0;
                const expected = g.target * monthProgress.elapsed;
                const diff = g.value - expected;
                const ahead = diff >= 0;
                return (
                  <div key={g.label} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{g.label}</span>
                      <span className="text-xs text-muted-foreground">{Math.round(monthProgress.elapsed * 100)}% a hónapból</span>
                    </div>
                    <div className="mt-2 text-lg font-bold">{g.fmt(g.value)} <span className="text-sm font-normal text-muted-foreground">/ {g.fmt(g.target)}</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", ahead ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">{Math.round(pct)}% teljesítve · {ahead ? `${g.fmt(Math.abs(diff))} előtt` : `${g.fmt(Math.abs(diff))} lemaradás`} (várt: {g.fmt(Math.round(expected))})</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Revenue & closes */}
        <div>
          <h2 className="mb-1 font-heading text-base font-semibold">Bevétel és lezárások</h2>
          <p className="mb-4 text-xs text-muted-foreground">Csak fizetett checkout linkekből</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={DollarSign} label="Nettó bevétel" value={fmt(netRevenue)} gradient="violet" sub={<ChangePill current={netRevenue} previous={compNetRevenue} />} />
            <StatCard icon={Target} label="Lezárt üzletek" value={formatNumber(closedDeals)} gradient="emerald" sub={<ChangePill current={closedDeals} previous={compClosed} />} />
            <StatCard icon={Users} label="Tartott meetingek" value={formatNumber(meetingsHeld)} gradient="blue" sub={<ChangePill current={meetingsHeld} previous={compHeld} />} />
            <StatCard icon={DollarSign} label="Átlag első fizetés" value={fmt(avgFirstPayment)} gradient="pink" />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <h3 className="mb-3 text-sm font-semibold">Bevételi trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailyData}>
                  <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8549DE" stopOpacity={0.4} /><stop offset="100%" stopColor="#E9498F" stopOpacity={0.05} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={step} minTickGap={20} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} width={50} />
                  <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                  <Area type="monotone" dataKey="revenue" stroke="#8549DE" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <h3 className="mb-3 text-sm font-semibold">Lezárások naponta</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={step} minTickGap={20} />
                  <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="closes" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Funnel */}
        <div>
          <h2 className="mb-1 font-heading text-base font-semibold">Tölcsér</h2>
          <p className="mb-4 text-xs text-muted-foreground">Ugyanaz az eseménysorozat lépésről lépésre</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ["Új lead", fLead], ["Foglalt meeting", fBooked], ["Tartott meeting", fHeld], ["Nem jött", fNoshow], ["Lemondva", fCancel], ["Ajánlat elküldve", fQuote], ["Szerződés aláírva", fSigned], ["Lezárt", fClosed],
                  ].map(([label, val], i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-2.5 text-muted-foreground">{label}</td>
                      <td className="py-2.5 text-right font-semibold">{formatNumber(val)}{label === "Tartott meeting" && fHeld > 0 && <span className="ml-2 text-xs text-muted-foreground">({showUpPct}% megjelent)</span>}{label === "Lezárt" && fHeld > 0 && <span className="ml-2 text-xs text-muted-foreground">({closeOfHeldPct}% a tartottakból)</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <h3 className="mb-3 text-sm font-semibold">Foglalt meetingek / nap</h3>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={dailyData}><XAxis dataKey="date" tick={{ fontSize: 10 }} interval={step} minTickGap={20} /><YAxis tick={{ fontSize: 10 }} width={25} allowDecimals={false} /><Tooltip /><Bar dataKey="booked" fill="#C548C0" radius={[3, 3, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
                <h3 className="mb-3 text-sm font-semibold">Új lead-ek / nap</h3>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={dailyData}><XAxis dataKey="date" tick={{ fontSize: 10 }} interval={step} minTickGap={20} /><YAxis tick={{ fontSize: 10 }} width={25} allowDecimals={false} /><Tooltip /><Bar dataKey="leads" fill="#8549DE" radius={[3, 3, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Conversion & deal size */}
        <div>
          <h2 className="mb-1 font-heading text-base font-semibold">Konverzió és üzletméret</h2>
          <p className="mb-4 text-xs text-muted-foreground">Hol esnek ki a lead-ek, és mekkora egy lezárt üzlet</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <h3 className="mb-3 text-sm font-semibold">Konverziók</h3>
              <table className="w-full text-sm">
                <tbody>
                  {[["Lead → Foglalás", conversions.leadToBooked], ["Foglalás → Tartott", conversions.bookedToHeld], ["Megjelenési arány", conversions.showUp], ["Tartott → Ajánlat", conversions.heldToQuote], ["Ajánlat → Lezárás", conversions.quoteToClose], ["Tartott → Lezárás", conversions.heldToClose], ["LEAD → LEZÁRÁS", conversions.leadToClose]].map(([l, v], i) => (
                    <tr key={i} className="border-b border-border last:border-0"><td className="py-2 text-muted-foreground">{l}</td><td className="py-2 text-right font-semibold">{v}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <h3 className="mb-3 text-sm font-semibold">Üzletméret és tempó</h3>
              <table className="w-full text-sm">
                <tbody>
                  {[["Átlag első fizetés", formatCurrency(avgFirstPayment)], ["Átlag szerződésérték", formatCurrency(avgContract)], ["Átlag setup díj", formatCurrency(avgSetup)], ["Átlag havi díj", formatCurrency(avgMonthly)], ["Értékesítési ciklus (lead → lezárás)", `${Math.round(avgCycle)} nap`], ["Átlag napi lezárások", avgDailyCloses.toFixed(1)]].map(([l, v], i) => (
                    <tr key={i} className="border-b border-border last:border-0"><td className="py-2 text-muted-foreground">{l}</td><td className="py-2 text-right font-semibold">{v}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Acquisition cost — agency-level spend, admins only */}
        {!isClient && (
        <div>
          <h2 className="mb-1 font-heading text-base font-semibold">Akvizíciós költség</h2>
          <p className="mb-4 text-xs text-muted-foreground">Hirdetési költés és jutalékok, pontos bevételhez rendelve</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard icon={Wallet} label="Hirdetési költés" value={fmt(adSpend)} gradient="violet" sub={<ChangePill current={adSpend} previous={compAdSpend} invert />} />
            <StatCard icon={TrendingUp} label="Lead-enkénti költség" value={fmt(cpl)} gradient="blue" />
            <StatCard icon={Target} label="CAC" value={fmt(cac)} gradient="pink" />
            <StatCard icon={TrendingUp} label="ROAS" value={roas > 0 ? `${roas.toFixed(2)}×` : "—"} gradient="emerald" />
            <StatCard icon={TrendingUp} label="Teljes ROI" value={roi > 0 ? `${roi.toFixed(2)}×` : "—"} gradient="amber" />
            <StatCard icon={DollarSign} label="Teljes akv. költség" value={fmt(totalAcqCost)} gradient="rose" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">* A havi jutalék a teljes havi összeg, nem arányosított.</p>
        </div>
        )}

        {/* Lead inventory */}
        <div>
          <h2 className="mb-1 font-heading text-base font-semibold">Lead-készlet</h2>
          <p className="mb-4 text-xs text-muted-foreground">Mai tábla-pillanatkép és az időszak forrásai</p>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <h3 className="mb-3 text-sm font-semibold">Sales tábla</h3>
              <table className="w-full text-sm"><tbody>
                {[["Nyitott", openLeads], ["Lezárt", closedLeads], ["Nincs fázis", noStageLeads], ["Összes a táblán", leads.length]].map(([l, v], i) => (
                  <tr key={i} className="border-b border-border last:border-0"><td className="py-2 text-muted-foreground">{l}</td><td className="py-2 text-right font-semibold">{formatNumber(v)}</td></tr>
                ))}
              </tbody></table>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <h3 className="mb-3 text-sm font-semibold">Lead-források ebben az időszakban</h3>
              {Object.keys(sourceCounts).length === 0 ? <p className="text-sm text-muted-foreground">Nincs lead ebben az időszakban.</p> : (
                <table className="w-full text-sm"><tbody>
                  {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([s, v], i) => (
                    <tr key={i} className="border-b border-border last:border-0"><td className="py-2 capitalize text-muted-foreground">{SOURCE_LABELS[s] || s}</td><td className="py-2 text-right font-semibold">{formatNumber(v)}</td></tr>
                  ))}
                </tbody></table>
              )}
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
              <h3 className="mb-3 text-sm font-semibold">Új üzletek és nettó fizetések / nap</h3>
              <div className="max-h-56 space-y-1.5 overflow-y-auto scrollbar-thin">
                {dealsDayList.length === 0 ? <p className="text-sm text-muted-foreground">Nincs ebben az időszakban.</p> : dealsDayList.map(([day, d]) => (
                  <div key={day} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm">
                    <span className="text-muted-foreground">{formatDateShort(day)}</span>
                    <span className="font-semibold">{d.deals} üzlet · {formatCurrencyShort(d.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="setter" className="mt-0 space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Users} label="Kezelt lead-ek" value={formatNumber(count(inRangeEvents, "lead"))} gradient="violet" />
          <StatCard icon={Target} label="Foglalt meetingek" value={formatNumber(count(inRangeEvents, "booked"))} gradient="blue" />
          <StatCard icon={TrendingUp} label="Lead → foglalás arány" value={`${conversions.leadToBooked}%`} gradient="pink" />
          <StatCard icon={ActivityIcon} label="Megjelenési arány" value={`${showUpPct}%`} gradient="emerald" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card"><h3 className="mb-3 text-sm font-semibold">Foglalt meetingek / nap</h3>
            <ResponsiveContainer width="100%" height={200}><BarChart data={dailyData}><CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" /><XAxis dataKey="date" tick={{ fontSize: 11 }} interval={step} minTickGap={20} /><YAxis tick={{ fontSize: 11 }} width={25} allowDecimals={false} /><Tooltip /><Bar dataKey="booked" fill="#C548C0" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card"><h3 className="mb-3 text-sm font-semibold">Új lead-ek / nap</h3>
            <ResponsiveContainer width="100%" height={200}><BarChart data={dailyData}><CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" /><XAxis dataKey="date" tick={{ fontSize: 11 }} interval={step} minTickGap={20} /><YAxis tick={{ fontSize: 11 }} width={25} allowDecimals={false} /><Tooltip /><Bar dataKey="leads" fill="#8549DE" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card scrollbar-thin">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Setter</th><th className="px-4 py-3 text-right font-semibold">Lead-ek</th><th className="px-4 py-3 text-right font-semibold">Foglalt</th><th className="px-4 py-3 text-right font-semibold">Lead→fog %</th><th className="px-4 py-3 text-right font-semibold">Megjelenés %</th><th className="px-4 py-3 text-right font-semibold">Lezárások</th>
            </tr></thead>
            <tbody>
              {setterRows.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nincs setter adat ebben az időszakban.</td></tr> :
                setterRows.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium">{r.name}</td><td className="px-4 py-3 text-right">{r.leadsHandled}</td><td className="px-4 py-3 text-right font-semibold">{r.booked}</td><td className="px-4 py-3 text-right">{r.bookPct}%</td><td className="px-4 py-3 text-right">{r.showUp}%</td><td className="px-4 py-3 text-right">{r.closes}</td></tr>
                ))}
            </tbody>
          </table>
        </div>
      </TabsContent>

      <TabsContent value="closer" className="mt-0 space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Users} label="Tartott meetingek" value={formatNumber(meetingsHeld)} gradient="violet" />
          <StatCard icon={Target} label="Elküldött ajánlatok" value={formatNumber(count(inRangeEvents, "quote"))} gradient="blue" sub={meetingsHeld > 0 ? `${conversions.heldToQuote}%` : ""} />
          <StatCard icon={Target} label="Lezárások" value={formatNumber(closedDeals)} gradient="emerald" />
          <StatCard icon={TrendingUp} label="Lezárási arány" value={`${meetingsHeld > 0 ? Math.round((closedDeals / meetingsHeld) * 100) : 0}%`} gradient="pink" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card"><h3 className="mb-3 text-sm font-semibold">Tartott meetingek / nap</h3>
            <ResponsiveContainer width="100%" height={200}><BarChart data={dailyData}><CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" /><XAxis dataKey="date" tick={{ fontSize: 11 }} interval={step} minTickGap={20} /><YAxis tick={{ fontSize: 11 }} width={25} allowDecimals={false} /><Tooltip /><Bar dataKey="held" fill="#10B981" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card"><h3 className="mb-3 text-sm font-semibold">Lezárások / nap</h3>
            <ResponsiveContainer width="100%" height={200}><BarChart data={dailyData}><CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" /><XAxis dataKey="date" tick={{ fontSize: 11 }} interval={step} minTickGap={20} /><YAxis tick={{ fontSize: 11 }} width={25} allowDecimals={false} /><Tooltip /><Bar dataKey="closes" fill="#E9498F" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card scrollbar-thin">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Closer</th><th className="px-4 py-3 text-right font-semibold">Tartott</th><th className="px-4 py-3 text-right font-semibold">Nem jött</th><th className="px-4 py-3 text-right font-semibold">Ajánlat</th><th className="px-4 py-3 text-right font-semibold">Szerződött</th><th className="px-4 py-3 text-right font-semibold">Lezárás</th><th className="px-4 py-3 text-right font-semibold">Lezárás %</th><th className="px-4 py-3 text-right font-semibold">Első fizetések</th><th className="px-4 py-3 text-right font-semibold">Átlag/üzlet</th>
            </tr></thead>
            <tbody>
              {closerRows.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Nincs closer adat ebben az időszakban.</td></tr> :
                closerRows.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium">{r.name}</td><td className="px-4 py-3 text-right">{r.held}</td><td className="px-4 py-3 text-right">{r.noshow}</td><td className="px-4 py-3 text-right">{r.quotes}</td><td className="px-4 py-3 text-right">{r.signed}</td><td className="px-4 py-3 text-right font-semibold">{r.closes}</td><td className="px-4 py-3 text-right">{r.closeRate}%</td><td className="px-4 py-3 text-right">{formatCurrencyShort(r.total)}</td><td className="px-4 py-3 text-right">{formatCurrencyShort(r.avg)}</td></tr>
                ))}
            </tbody>
          </table>
        </div>
      </TabsContent>
      </Tabs>

      {/* Log ad spend modal */}
      <Modal open={spendOpen} onClose={() => setSpendOpen(false)} title="Hirdetési költés rögzítése"
        footer={<><Button variant="outline" onClick={() => setSpendOpen(false)}>Mégse</Button><Button onClick={saveSpend} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button></>}>
        <div className="space-y-4">
          <div>
            <Label>Account</Label>
            <Select value={spendForm.account_id} onValueChange={v => setSpendForm({ ...spendForm, account_id: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nincs (ügynökségi szint)</SelectItem>
                {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Dátum</Label><Input type="date" value={spendForm.date} onChange={e => setSpendForm({ ...spendForm, date: e.target.value })} className="mt-1.5" /></div>
          <div><Label>Összeg (Ft)</Label><Input type="number" value={spendForm.amount} onChange={e => setSpendForm({ ...spendForm, amount: Number(e.target.value) })} className="mt-1.5" /></div>
        </div>
      </Modal>

      {/* Log event modal */}
      <Modal open={eventOpen} onClose={() => setEventOpen(false)} title="Értékesítési esemény rögzítése" size="lg"
        footer={<><Button variant="outline" onClick={() => setEventOpen(false)}>Mégse</Button><Button onClick={saveEvent} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>Esemény típusa</Label>
              <Select value={eventForm.type} onValueChange={v => setEventForm({ ...eventForm, type: v })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{EVENT_LABELS[t] || t}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label>Dátum</Label><Input type="date" value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} className="mt-1.5" /></div>
          </div>
          <div>
            <Label>Account</Label>
            <Select value={eventForm.account_id} onValueChange={v => setEventForm({ ...eventForm, account_id: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Nincs</SelectItem>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>Setter</Label>
              <Select value={eventForm.setter_id} onValueChange={v => setEventForm({ ...eventForm, setter_id: v })}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs" /></SelectTrigger><SelectContent><SelectItem value="none">Nincs</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label>Closer</Label>
              <Select value={eventForm.closer_id} onValueChange={v => setEventForm({ ...eventForm, closer_id: v })}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs" /></SelectTrigger><SelectContent><SelectItem value="none">Nincs</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          {showSource && <div><Label>Forrás</Label>
            <Select value={eventForm.source} onValueChange={v => setEventForm({ ...eventForm, source: v })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{SOURCE_LABELS[s] || s}</SelectItem>)}</SelectContent></Select>
          </div>}
          {showAmount && <div><Label>Összeg (Ft)</Label><Input type="number" value={eventForm.amount} onChange={e => setEventForm({ ...eventForm, amount: Number(e.target.value) })} className="mt-1.5" /></div>}
          {showFees && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>Setup díj (Ft)</Label><Input type="number" value={eventForm.setup_fee} onChange={e => setEventForm({ ...eventForm, setup_fee: Number(e.target.value) })} className="mt-1.5" /></div>
            <div><Label>Havi díj (Ft)</Label><Input type="number" value={eventForm.monthly_fee} onChange={e => setEventForm({ ...eventForm, monthly_fee: Number(e.target.value) })} className="mt-1.5" /></div>
          </div>}
          {showCycle && <div><Label>Értékesítési ciklus (nap)</Label><Input type="number" value={eventForm.sales_cycle_days} onChange={e => setEventForm({ ...eventForm, sales_cycle_days: Number(e.target.value) })} className="mt-1.5" /></div>}
        </div>
      </Modal>

      {/* Edit goals modal */}
      <Modal open={goalsOpen} onClose={() => setGoalsOpen(false)} title="Havi célok szerkesztése"
        footer={<><Button variant="outline" onClick={() => setGoalsOpen(false)}>Mégse</Button><Button onClick={saveGoals} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button></>}>
        <div className="space-y-4">
          <div><Label>Cash cél (Ft)</Label><Input type="number" value={goalsForm.cash_target} onChange={e => setGoalsForm({ ...goalsForm, cash_target: Number(e.target.value) })} className="mt-1.5" /></div>
          <div><Label>Lezárt üzletek célja</Label><Input type="number" value={goalsForm.closed_deals_target} onChange={e => setGoalsForm({ ...goalsForm, closed_deals_target: Number(e.target.value) })} className="mt-1.5" /></div>
          <div><Label>Foglalt meetingek célja</Label><Input type="number" value={goalsForm.booked_meetings_target} onChange={e => setGoalsForm({ ...goalsForm, booked_meetings_target: Number(e.target.value) })} className="mt-1.5" /></div>
          <div><Label>Havi jutalék (Ft)</Label><Input type="number" value={goalsForm.monthly_commission} onChange={e => setGoalsForm({ ...goalsForm, monthly_commission: Number(e.target.value) })} className="mt-1.5" /></div>
        </div>
      </Modal>
    </div>
  );
}