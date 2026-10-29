import React, { useEffect, useMemo, useState } from "react";
import { Plus, CalendarCheck, Clock, Video, CalendarDays, ExternalLink, Copy, Check, Ban, FileSignature } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import BookingTypeEditor from "@/components/crm/BookingTypeEditor";
import { ContractSendModal } from "@/components/crm/ContractSender";
import TwoStepDelete from "@/components/TwoStepDelete";
import { useAccountScope } from "@/lib/accountScope";
import { embedSnippet, publicUrl, triggerAutomations } from "@/lib/crm";
import { formatNumber, formatDateTime, isDateToday } from "@/lib/format";

export default function Bookings() {
  const { accountId, isClient } = useAccountScope();
  const [types, setTypes] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [copiedId, setCopiedId] = useState("");
  const [contractFor, setContractFor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      // Client role: bookings are scoped to the user's own account at query level.
      const [t, b, a] = await Promise.all([
        isClient ? Promise.resolve([]) : base44.entities.BookingType.list("-created_date", 100),
        isClient ? base44.entities.Booking.filter({ account_id: accountId }, "-start", 300) : base44.entities.Booking.list("-start", 300),
        isClient ? Promise.resolve([]) : base44.entities.Account.list("-created_date", 100),
      ]);
      setTypes(t); setBookings(b); setAccounts(a);
    } catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const now = Date.now();
  const upcoming = useMemo(() => bookings
    .filter((b) => b.status === "confirmed" && new Date(b.start).getTime() >= now - 3600000)
    .sort((a, b) => new Date(a.start) - new Date(b.start)), [bookings, now]);
  const activeBookings = bookings.filter((b) => b.status === "confirmed").length;
  const thisMonth = bookings.filter((b) => {
    const d = new Date(b.start); const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  }).length;
  const todayCount = bookings.filter((b) => isDateToday(b.start)).length;

  const toggleType = async (type) => {
    await base44.entities.BookingType.update(type.id, { active: !type.active });
    load();
  };

  // Lemondás: a szerver törli a Google Naptár eseményt is, és leállítja az emlékeztetőt.
  const cancelBooking = async (booking) => {
    try {
      const res = await base44.functions.invoke("crmCancelBooking", { booking_id: booking.id });
      if (res.data?.error) { alert(res.data.error); return; }
      if (booking.contact_id) await triggerAutomations("booking_cancelled", booking.contact_id, { booking_id: booking.id });
      if (res.data?.warning) alert(res.data.warning);
    } catch (e) {
      alert(e?.response?.data?.error || e.message || "Nem sikerült lemondani a foglalást.");
    } finally {
      load();
    }
  };

  const copy = (type) => {
    navigator.clipboard?.writeText(embedSnippet(`/b/${type.id}`, 780));
    setCopiedId(type.id);
    setTimeout(() => setCopiedId(""), 2000);
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  return (
    <div>
      <PageHeader title="Foglalások"
        subtitle={isClient ? "A saját accountodhoz tartozó foglalások" : "Saját online naptár: időpont típusok, elérhetőség és beágyazható foglalási felület"}
        action={isClient ? null : <Button onClick={() => { setEditing(null); setEditorOpen(true); }} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Új időpont típus</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CalendarCheck} label="Aktív foglalások" value={formatNumber(activeBookings)} gradient="violet" />
        <StatCard icon={CalendarDays} label="Ebben a hónapban" value={formatNumber(thisMonth)} gradient="blue" />
        <StatCard icon={Clock} label="Ma" value={formatNumber(todayCount)} gradient="emerald" />
        {!isClient && <StatCard icon={Video} label="Időpont típusok" value={formatNumber(types.length)} gradient="pink" />}
      </div>

      {!isClient && (types.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Még nincs foglalható időpont típus" description="Hozz létre egyet (pl. 30 perces konzultáció), és ágyazd be a weboldaladra."
          action={<Button onClick={() => setEditorOpen(true)} className="gradient-brand text-white">Időpont típus létrehozása</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {types.map((type) => (
            <div key={type.id} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-heading font-semibold">{type.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{type.duration_minutes} perc · {type.buffer_minutes} perc szünet · napi max {type.max_per_day}</p>
                </div>
                <Switch checked={!!type.active} onCheckedChange={() => toggleType(type)} />
              </div>
              <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                <div>Előzetes bejelentkezés: {type.notice_hours} óra · {type.days_ahead} nappal előre</div>
                <div>Heti idősávok: {(type.availability || []).length} · Kizárt napok: {(type.excluded_dates || []).length}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => copy(type)}>
                  {copiedId === type.id ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                  {copiedId === type.id ? "Kimásolva" : "Beágyazó kód"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.open(publicUrl(`/b/${type.id}`), "_blank")}><ExternalLink className="mr-1 h-3.5 w-3.5" /> Megnyitás</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditing(type); setEditorOpen(true); }}>Szerkesztés</Button>
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="mt-8 rounded-2xl border border-border bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold">Közelgő foglalások</h2>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nincs közelgő foglalás.</p>
        ) : (
          <div className="divide-y divide-border">
            {upcoming.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl gradient-brand text-white"><CalendarCheck className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{b.name || "Névtelen"}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatDateTime(b.start)} · {types.find((t) => t.id === b.booking_type_id)?.name || "—"} · {b.email}
                  </div>
                </div>
                {b.meeting_link && (
                  <a href={b.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
                    <Video className="h-3.5 w-3.5" /> Videóhívás
                  </a>
                )}
                {!isClient && b.contact_id && (
                  <button type="button" onClick={() => setContractFor(b)}
                    className="inline-flex items-center gap-1 rounded-lg gradient-brand px-2.5 py-1.5 text-xs font-semibold text-white">
                    <FileSignature className="h-3.5 w-3.5" /> Szerződés
                  </button>
                )}
                {!isClient && <TwoStepDelete onDelete={() => cancelBooking(b)} label="Lemondás" />}
              </div>
            ))}
          </div>
        )}
      </div>

      <BookingTypeEditor open={editorOpen} onClose={() => setEditorOpen(false)} bookingType={editing}
        accounts={accounts} onSaved={load} />

      {!isClient && (
        <ContractSendModal open={!!contractFor} onClose={() => setContractFor(null)}
          contactId={contractFor?.contact_id} bookingId={contractFor?.id} />
      )}
    </div>
  );
}