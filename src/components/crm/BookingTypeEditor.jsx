import React, { useEffect, useState } from "react";
import { Plus, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import Modal from "@/components/Modal";
import TwoStepDelete from "@/components/TwoStepDelete";

const DAYS = [
  { value: 1, label: "Hétfő" }, { value: 2, label: "Kedd" }, { value: 3, label: "Szerda" },
  { value: 4, label: "Csütörtök" }, { value: 5, label: "Péntek" }, { value: 6, label: "Szombat" }, { value: 7, label: "Vasárnap" },
];

const DEFAULT_AVAILABILITY = [1, 2, 3, 4, 5].map((day) => ({ day, from: "09:00", to: "17:00" }));

const EMPTY = {
  name: "", account_id: "", description: "", duration_minutes: 30, buffer_minutes: 10,
  notice_hours: 12, days_ahead: 30, max_per_day: 6, meeting_link: "", active: true,
  availability: DEFAULT_AVAILABILITY, excluded_dates: [],
};

export default function BookingTypeEditor({ open, onClose, bookingType, accounts, onSaved }) {
  const [draft, setDraft] = useState(EMPTY);
  const [excludedText, setExcludedText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = bookingType ? { ...EMPTY, ...bookingType } : EMPTY;
    setDraft(next);
    setExcludedText((next.excluded_dates || []).join(", "));
  }, [open, bookingType]);

  const setWindow = (index, patch) => setDraft({ ...draft, availability: draft.availability.map((w, i) => (i === index ? { ...w, ...patch } : w)) });
  const addWindow = () => setDraft({ ...draft, availability: [...draft.availability, { day: 1, from: "09:00", to: "17:00" }] });
  const removeWindow = (index) => setDraft({ ...draft, availability: draft.availability.filter((w, i) => i !== index) });

  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    const payload = {
      ...draft, name: draft.name.trim(),
      duration_minutes: Number(draft.duration_minutes) || 30,
      buffer_minutes: Number(draft.buffer_minutes) || 0,
      notice_hours: Number(draft.notice_hours) || 0,
      days_ahead: Number(draft.days_ahead) || 30,
      max_per_day: Number(draft.max_per_day) || 6,
      excluded_dates: excludedText.split(",").map((d) => d.trim()).filter(Boolean),
    };
    try {
      if (bookingType) await base44.entities.BookingType.update(bookingType.id, payload);
      else await base44.entities.BookingType.create(payload);
      onClose();
      onSaved && onSaved();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    await base44.entities.BookingType.delete(bookingType.id);
    onClose();
    onSaved && onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={bookingType ? "Időpont típus szerkesztése" : "Új időpont típus"} size="xl"
      description="A foglalási felület egy beágyazó kóddal kerülhet a weboldalra."
      footer={<>
        <Button variant="outline" onClick={onClose}>Mégse</Button>
        {bookingType && <TwoStepDelete onDelete={remove} />}
        <Button onClick={save} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button>
      </>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Név *</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="pl. Konzultáció" className="mt-1.5" /></div>
          <div><Label>Account</Label>
            <Select value={draft.account_id || "none"} onValueChange={(v) => setDraft({ ...draft, account_id: v === "none" ? "" : v })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Nincs</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Leírás</Label><Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="mt-1.5" /></div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label className="text-xs">Hossz (perc)</Label><Input type="number" value={draft.duration_minutes} onChange={(e) => setDraft({ ...draft, duration_minutes: Number(e.target.value) })} className="mt-1.5" /></div>
          <div><Label className="text-xs">Szünet két foglalás közt (perc)</Label><Input type="number" value={draft.buffer_minutes} onChange={(e) => setDraft({ ...draft, buffer_minutes: Number(e.target.value) })} className="mt-1.5" /></div>
          <div><Label className="text-xs">Előzetes bejelentkezés (óra)</Label><Input type="number" value={draft.notice_hours} onChange={(e) => setDraft({ ...draft, notice_hours: Number(e.target.value) })} className="mt-1.5" /></div>
          <div><Label className="text-xs">Hány nappal előre foglalható</Label><Input type="number" value={draft.days_ahead} onChange={(e) => setDraft({ ...draft, days_ahead: Number(e.target.value) })} className="mt-1.5" /></div>
          <div><Label className="text-xs">Napi maximum</Label><Input type="number" value={draft.max_per_day} onChange={(e) => setDraft({ ...draft, max_per_day: Number(e.target.value) })} className="mt-1.5" /></div>
          <div><Label className="text-xs">Találkozó link (opcionális)</Label><Input value={draft.meeting_link} onChange={(e) => setDraft({ ...draft, meeting_link: e.target.value })} placeholder="Automatikus, ha üres" className="mt-1.5" /></div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 font-heading text-sm font-semibold"><Clock className="h-4 w-4 text-primary" /> Heti elérhetőség</span>
            <Button size="sm" variant="outline" onClick={addWindow}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-2">
            {draft.availability.map((w, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select value={String(w.day)} onValueChange={(v) => setWindow(i, { day: Number(v) })}>
                  <SelectTrigger className="w-[124px] sm:w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map((d) => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="time" value={w.from} onChange={(e) => setWindow(i, { from: e.target.value })} className="w-[106px] sm:w-[120px]" />
                <span className="text-muted-foreground">–</span>
                <Input type="time" value={w.to} onChange={(e) => setWindow(i, { to: e.target.value })} className="w-[106px] sm:w-[120px]" />
                <button onClick={() => removeWindow(i)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">✕</button>
              </div>
            ))}
            {draft.availability.length === 0 && <p className="text-sm text-muted-foreground">Nincs beállított idősáv — nem lesz foglalható időpont.</p>}
          </div>
        </div>

        <div>
          <Label className="text-xs">Kizárt napok (éééé-hh-nn, vesszővel)</Label>
          <Input value={excludedText} onChange={(e) => setExcludedText(e.target.value)} placeholder="2026-12-24, 2026-12-25" className="mt-1.5" />
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
          <span className="text-sm">{draft.active ? "Aktív — fogad foglalásokat" : "Szüneteltetve"}</span>
        </div>
      </div>
    </Modal>
  );
}