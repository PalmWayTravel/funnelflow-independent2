import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { CalendarCheck, Clock, CheckCircle2, Loader2, AlertTriangle, Video } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export default function PublicBooking() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("crmPublicBookingCreate", {
          booking_type_id: id, action: "slots", tz_offset: new Date().getTimezoneOffset(),
        });
        if (res.data?.error) setError(res.data.error);
        else setData(res.data);
      } catch (e) {
        setError("A foglalási felület nem érhető el.");
      } finally { setLoading(false); }
    })();
  }, [id]);

  const day = useMemo(() => (data?.days || []).find((d) => d.date === selectedDate) || null, [data, selectedDate]);

  const submit = async () => {
    setError("");
    setSending(true);
    try {
      const res = await base44.functions.invoke("crmPublicBookingCreate", {
        booking_type_id: id, start: selectedSlot, tz_offset: new Date().getTimezoneOffset(), ...form,
      });
      if (res.data?.error) setError(res.data.error);
      else setDone(res.data);
    } catch (e) {
      setError(e.message || "Nem sikerült rögzíteni a foglalást.");
    } finally { setSending(false); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-brand text-white"><CalendarCheck className="h-7 w-7" /></div>
          <h1 className="font-heading text-2xl font-bold">Foglalás rögzítve</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {format(new Date(done.start), "yyyy. MMMM d. (EEEE) HH:mm", { locale: hu })} — visszaigazoló e-mailt küldtünk.
          </p>
          {done.meeting_link && (
            <a href={done.meeting_link} target="_blank" rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-xl gradient-brand px-4 py-2.5 text-sm font-semibold text-white">
              <Video className="h-4 w-4" /> Videóhívás megnyitása
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
          <p className="text-sm text-muted-foreground">{error || "A foglalási felület nem elérhető."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-muted/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
        <h1 className="font-heading text-2xl font-bold">{data.booking_type?.name || "Időpontfoglalás"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.booking_type?.description || "Válassz egy neked megfelelő időpontot."}
          {data.booking_type?.duration_minutes ? ` · ${data.booking_type.duration_minutes} perc` : ""}
        </p>

        {data.days.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">Jelenleg nincs szabad időpont. Kérjük, nézz vissza később.</p>
        ) : (
          <>
            <div className="mt-6">
              <Label className="mb-2 block">1. Válassz napot</Label>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {data.days.map((d) => (
                  <button key={d.date} onClick={() => { setSelectedDate(d.date); setSelectedSlot(""); }}
                    className={cn("shrink-0 rounded-xl border px-3 py-2 text-center transition-colors",
                      selectedDate === d.date ? "gradient-brand border-transparent text-white" : "border-border hover:bg-accent")}>
                    <div className="text-xs font-medium capitalize">{format(new Date(d.date), "EEE", { locale: hu })}</div>
                    <div className="text-sm font-bold">{format(new Date(d.date), "d")}</div>
                    <div className={cn("text-[10px]", selectedDate === d.date ? "text-white/80" : "text-muted-foreground")}>{d.slots.length} időpont</div>
                  </button>
                ))}
              </div>
            </div>

            {day && (
              <div className="mt-5">
                <Label className="mb-2 block">2. Válassz időpontot</Label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {day.slots.map((slot) => (
                    <button key={slot} onClick={() => setSelectedSlot(slot)}
                      className={cn("rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                        selectedSlot === slot ? "gradient-brand border-transparent text-white" : "border-border hover:bg-accent")}>
                      {format(new Date(slot), "HH:mm")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedSlot && (
              <div className="mt-6 space-y-3 rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-primary" />
                  {format(new Date(selectedSlot), "yyyy. MMMM d. (EEEE) HH:mm", { locale: hu })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>Név *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" /></div>
                  <div><Label>E-mail *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" /></div>
                  <div><Label>Telefon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" /></div>
                  <div className="sm:col-span-2"><Label>Megjegyzés</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className="mt-1.5" /></div>
                </div>
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
                <Button onClick={submit} disabled={sending || !form.name.trim() || !form.email.trim()} className="w-full gradient-brand text-white">
                  {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Foglalás…</> : <><CheckCircle2 className="mr-2 h-4 w-4" /> Foglalás megerősítése</>}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}