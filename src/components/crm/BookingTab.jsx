import React, { useEffect, useState } from "react";
import { CalendarPlus, Video, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { triggerAutomations } from "@/lib/crm";

export default function BookingTab({ contact, users, onSaved }) {
  const [closerId, setCloserId] = useState(contact.owner_id || "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [bookings, setBookings] = useState([]);

  const loadBookings = async () => {
    const list = await base44.entities.Booking.filter({ contact_id: contact.id }, "-start", 20).catch(() => []);
    setBookings(list);
  };

  useEffect(() => { loadBookings(); }, [contact.id]);

  const book = async () => {
    if (!closerId || !date || !time) {
      setResult({ error: "Válaszd ki a closert, a dátumot és az időpontot." });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("crmContactBooking", {
        contact_id: contact.id,
        closer_id: closerId,
        date,
        time,
        duration_minutes: Number(duration) || 30,
      });
      setResult(res.data);
      if (res.data && res.data.ok) {
        await triggerAutomations("booking_created", contact.id, { booking_id: res.data.booking_id });
        await loadBookings();
        onSaved && onSaved();
      }
    } catch (e) {
      setResult({ error: (e && e.response && e.response.data && e.response.data.error) || e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-3">
        <div className="text-sm font-medium">Időpont foglalása a kontaktnak</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Foglaláskor automatikusan létrejön a Google Meet link, kimegy e-mailben a kontaktnak, és a closer naptárában is megjelenik a meeting.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Closer *</Label>
            <Select value={closerId || "none"} onValueChange={(v) => setCloserId(v === "none" ? "" : v)}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Válassz closert" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nincs</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Hossz (perc)</Label>
            <Input type="number" min={10} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Dátum *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label>Időpont *</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1.5" />
          </div>
        </div>
        {!contact.email && (
          <p className="mt-2 text-xs text-red-500">A kontaktnak nincs e-mail címe — az Adatok fülön add meg, különben a Meet linket nem tudjuk kiküldeni.</p>
        )}
        <div className="mt-3 flex justify-end">
          <Button onClick={book} disabled={saving || !contact.email} className="gradient-brand text-white">
            <CalendarPlus className="mr-1.5 h-4 w-4" />
            {saving ? "Foglalás…" : "Foglalás és Meet link küldése"}
          </Button>
        </div>
        {result && result.error && (
          <p className="mt-2 rounded-lg bg-red-100 px-2 py-1 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-400">{result.error}</p>
        )}
        {result && result.ok && (
          <p className="mt-2 rounded-lg bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            {result.warning || `Időpont rögzítve (${result.closer_name}) — a Meet linket elküldtük a kontaktnak.`}
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 text-sm font-medium">A kontakt foglalásai</div>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Még nincs foglalása ennek a kontaktnak.</p>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg gradient-brand text-white">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{formatDateTime(b.start)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {b.status === "cancelled" ? "Lemondva" : "Megerősítve"}{b.note ? ` · ${b.note}` : ""}
                  </div>
                </div>
                {b.meeting_link && (
                  <a href={b.meeting_link} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
                    <Video className="h-3.5 w-3.5" /> Meet link
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}