import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import {
  Users, MessageSquareWarning, CheckSquare, Contact, CalendarCheck, CalendarDays, Clock,
  ArrowRight, Activity, Video, KanbanSquare,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import StatCard from "@/components/StatCard";
import { formatNumber, timeAgo, isDateToday, isDateThisWeek, formatDateShort } from "@/lib/format";
import PullToRefresh from "@/components/PullToRefresh";

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      // Egy-egy sikertelen lekérdezés nem boríthatja fel a teljes áttekintést:
      // minden lista külön védelemmel fut, üres listára esik vissza.
      const [clients, complaints, tasks, logs, contacts, bookings, stages] = await Promise.all([
        base44.entities.Client.list("-created_date", 500).catch(() => []),
        base44.entities.Complaint.list("-created_date", 500).catch(() => []),
        base44.entities.Task.list("-created_date", 500).catch(() => []),
        base44.entities.ActivityLog.list("-created_date", 7).catch(() => []),
        base44.entities.Contact.list("-created_date", 500).catch(() => []),
        base44.entities.Booking.list("-start", 300).catch(() => []),
        base44.entities.PipelineStage.list("order", 50).catch(() => []),
      ]);
      setData({ clients, complaints, tasks, logs, contacts, bookings, stages });
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;
  }

  const firstName = (user?.full_name || user?.email || "vendég").split(" ")[0].split("@")[0];
  const d = data || {};
  const contacts = d.contacts || [];
  const bookings = d.bookings || [];
  const stages = [...(d.stages || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

  const complaintsToday = (d.complaints || []).filter((c) => isDateToday(c.created_date)).length;
  const tasksDoneToday = (d.tasks || []).filter((t) => t.done && isDateToday(t.done_at)).length;
  const tasksDoneThisWeek = (d.tasks || []).filter((t) => t.done && isDateThisWeek(t.done_at)).length;
  const openTasks = (d.tasks || []).filter((t) => !t.done).sort((a, b) => (a.due_date || "9999") > (b.due_date || "9999") ? 1 : -1).slice(0, 5);

  const now = Date.now();
  const activeBookings = bookings.filter((b) => b.status === "confirmed" && new Date(b.start).getTime() >= now - 3600000);
  const newBookingsThisMonth = bookings.filter((b) => {
    const d = new Date(b.start); const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  }).length;
  const upcoming = activeBookings.sort((a, b) => new Date(a.start) - new Date(b.start)).slice(0, 5);
  const nextBooking = upcoming[0];

  const stageCounts = stages.map((s) => ({ ...s, count: contacts.filter((c) => c.stage_id === s.id).length }));
  const maxStageCount = Math.max(1, ...stageCounts.map((s) => s.count));
  const unassigned = contacts.filter((c) => !c.stage_id).length;

  return (
    <PullToRefresh onRefresh={load} className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl gradient-brand p-6 text-white shadow-card md:p-8">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <h1 className="font-heading text-2xl font-bold md:text-3xl">Szia, {firstName}! 👋</h1>
        <p className="mt-1 max-w-lg text-white/80">Íme, mi történik a kontaktjaid, a pipeline és a csapatod körében ma.</p>
      </div>

      {/* CRM metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Contact} label="Összes kontakt" value={formatNumber(contacts.length)} gradient="violet" to="/contacts" />
        <StatCard icon={CalendarCheck} label="Aktív foglalás" value={formatNumber(activeBookings.length)} gradient="emerald" to="/bookings" />
        <StatCard icon={CalendarDays} label="E havi foglalás" value={formatNumber(newBookingsThisMonth)} gradient="blue" to="/bookings" />
        <StatCard icon={Clock} label="Következő időpont"
          value={nextBooking ? format(new Date(nextBooking.start), "MMM d. HH:mm", { locale: hu }) : "—"}
          sub={nextBooking ? nextBooking.name : "Nincs közelgő foglalás"}
          gradient="pink" to="/bookings" />
      </div>

      {/* Pipeline + upcoming bookings */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KanbanSquare className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-base font-semibold">Kontaktok fázisonként</h2>
            </div>
            <Link to="/pipeline" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Tábla <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {stageCounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Még nincs pipeline fázis.</p>
          ) : (
            <div className="space-y-3">
              {stageCounts.map((s) => (
                <div key={s.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">{formatNumber(s.count)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(s.count / maxStageCount) * 100}%`, background: s.color }} />
                  </div>
                </div>
              ))}
              {unassigned > 0 && <p className="pt-1 text-xs text-muted-foreground">{formatNumber(unassigned)} kontakt még nincs fázisban.</p>}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-base font-semibold">Közelgő foglalások</h2>
            </div>
            <Link to="/bookings" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Összes <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nincs közelgő foglalás.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl gradient-brand-soft text-primary">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{b.name || "Névtelen"}</div>
                    <div className="truncate text-xs text-muted-foreground">{format(new Date(b.start), "yyyy. MMM d. (EEE) HH:mm", { locale: hu })}</div>
                  </div>
                  {b.meeting_link && (
                    <a href={b.meeting_link} target="_blank" rel="noreferrer" className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-accent" title="Videóhívás">
                      <Video className="h-4 w-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Team metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="Összes ügyfél" value={formatNumber((d.clients || []).length)} gradient="violet" to="/clients" />
        <StatCard icon={MessageSquareWarning} label="Panaszok ma" value={formatNumber(complaintsToday)} gradient="rose" to="/complaints" />
        <StatCard icon={CheckSquare} label="Ma teljesített feladatok" value={formatNumber(tasksDoneToday)} gradient="emerald" to="/tasks" />
        <StatCard icon={CalendarDays} label="Ezen a héten teljesítve" value={formatNumber(tasksDoneThisWeek)} gradient="blue" to="/tasks" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">Nyitott feladatok</h2>
            <Link to="/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Összes <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {openTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nincs nyitott feladat. Minden rendben! 🎉</p>
          ) : (
            <div className="space-y-2">
              {openTasks.map((t) => (
                <Link key={t.id} to="/tasks" className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-accent">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="flex-1 text-sm font-medium">{t.title}</span>
                  {t.due_date && <span className="text-xs text-muted-foreground">{formatDateShort(t.due_date)}</span>}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-base font-semibold">Legutóbbi tevékenység</h2>
          </div>
          {(d.logs || []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nincs friss tevékenység.</p>
          ) : (
            <div className="space-y-3">
              {(d.logs || []).map((l) => (
                <div key={l.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full gradient-brand" />
                  <div className="flex-1">
                    <p className="text-sm text-foreground">{l.message}</p>
                    <p className="text-xs text-muted-foreground">{timeAgo(l.created_date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}