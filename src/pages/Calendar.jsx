import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/PageHeader";
import CalendarToolbar from "@/components/calendar/CalendarToolbar";
import WeekView from "@/components/calendar/WeekView";
import MonthView from "@/components/calendar/MonthView";
import CalendarLegend from "@/components/calendar/CalendarLegend";
import { useAccountScope } from "@/lib/accountScope";
import { addDays, dayKey, groupEntries, hourRange, monthWeeks, rangeLabel, tzOffset, visibleRange } from "@/lib/calendar";

export default function Calendar() {
  const { accountId, isClient } = useAccountScope();
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const range = useMemo(() => visibleRange(view, anchor), [view, anchor]);
  const rangeKey = `${range.start.toISOString()}|${range.end.toISOString()}`;

  const load = async (silent) => {
    if (silent) setBusy(true); else setLoading(true);
    try {
      const res = await base44.functions.invoke("crmCalendar", {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        tz_offset: tzOffset(),
        scope_account_id: accountId,
      });
      if (res.data?.error) {
        setError(res.data.error);
      } else {
        setError("");
        setData(res.data);
      }
    } catch (e) {
      setError(e.message || "Nem sikerült betölteni a naptárat.");
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  useEffect(() => { load(false); }, [rangeKey]);

  const entries = useMemo(() => groupEntries(data), [data]);
  const hours = useMemo(
    () => hourRange([...(data?.bookings || []), ...(data?.events || []), ...(data?.slots || [])]),
    [data]
  );
  const weeks = useMemo(() => (view === "month" ? monthWeeks(anchor) : []), [view, anchor]);
  const todayKey = dayKey(new Date());

  const step = (dir) =>
    setAnchor((prev) => (view === "week" ? addDays(prev, dir * 7) : new Date(prev.getFullYear(), prev.getMonth() + dir, 1)));

  return (
    <div>
      <PageHeader
        title="Naptár"
        subtitle={isClient
          ? "A saját accountod foglalásai és szabad időpontjai"
          : "Időbeosztás: foglalások, Google Naptár elfoglaltságok és szabad időpontok"}
      />

      <CalendarToolbar
        view={view}
        onView={setView}
        label={rangeLabel(view, anchor)}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onToday={() => setAnchor(new Date())}
        onRefresh={() => load(true)}
        busy={busy}
        google={data?.google}
      />

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        </div>
      ) : view === "week" ? (
        <WeekView days={range.days} hours={hours} entries={entries} todayKey={todayKey} />
      ) : (
        <MonthView weeks={weeks} month={anchor.getMonth()} entries={entries} todayKey={todayKey} />
      )}

      <CalendarLegend />
    </div>
  );
}