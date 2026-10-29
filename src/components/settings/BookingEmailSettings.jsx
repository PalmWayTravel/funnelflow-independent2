import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getWorkspaceSettings, saveWorkspaceSettings } from "@/lib/crm";
import { logActivity } from "@/lib/activity";

const DEFAULT_SUBJECT = "Időpontod megerősítve — {{foglalas_idopont}}";

const DEFAULT_BODY = "Kedves {{nev}}!\n\nAz időpontod rögzítettük: {{foglalas_idopont}} ({{hossz}} perc).\nA megbeszélést {{closer}} tartja.\n\nGoogle Meet link: {{meeting_link}}\n\nHa nem megfelelő az időpont, válaszolj erre az e-mailre.\n\nÜdvözlettel,\n{{felado}}";

const PLACEHOLDERS = [
  ["{{nev}}", "kontakt neve"],
  ["{{ceg}}", "cégnév"],
  ["{{foglalas_idopont}}", "foglalt időpont (dátum, nap, óra)"],
  ["{{meeting_link}}", "Google Meet link"],
  ["{{closer}}", "a closer neve"],
  ["{{hossz}}", "meeting hossza percben"],
  ["{{felado}}", "feladó név"],
];

export default function BookingEmailSettings() {
  const [ws, setWs] = useState(null);
  const [form, setForm] = useState({ booking_email_subject: "", booking_email_body: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getWorkspaceSettings().then((data) => {
      if (!data) return;
      setWs(data);
      // Ha még nincs mentett sablon, az alapértelmezett szöveget töltjük be, hogy
      // pontosan látszódjon, mi megy ki foglaláskor — innen átírható.
      setForm({
        booking_email_subject: data.booking_email_subject || DEFAULT_SUBJECT,
        booking_email_body: data.booking_email_body || DEFAULT_BODY,
      });
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveWorkspaceSettings(ws, form);
      setWs(saved);
      await logActivity("Foglalás e-mail sablon frissítve", "update", "WorkspaceSettings");
      setSaving(false);
    } catch (e) { alert(e.message); setSaving(false); }
  };

  return (
    <div className="max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-card">
      <h3 className="mb-1 font-heading font-semibold">Foglalás visszaigazoló e-mail</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Ezt a levelet kapja a kontakt, amikor a kontakt ablak „Időpont” fülén foglalunk neki időpontot — benne a Google Meet linkkel.
        Ha üresen hagyod, az alábbi alapértelmezett szöveget küldjük.
      </p>
      <div className="space-y-3">
        <div>
          <Label>Tárgy</Label>
          <Input value={form.booking_email_subject} onChange={(e) => setForm({ ...form, booking_email_subject: e.target.value })}
            placeholder={DEFAULT_SUBJECT} className="mt-1.5" />
        </div>
        <div>
          <Label>Szöveg</Label>
          <Textarea value={form.booking_email_body} onChange={(e) => setForm({ ...form, booking_email_body: e.target.value })}
            rows={10} placeholder={DEFAULT_BODY} className="mt-1.5 font-mono text-xs" />
        </div>
        <div className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Helyőrzők: {PLACEHOLDERS.map(([key, desc]) => `${key} (${desc})`).join(" · ")}
        </div>
      </div>
      <Button onClick={save} disabled={saving} className="mt-4 h-11 w-full gradient-brand text-white sm:h-9 sm:w-auto">
        {saving ? "Mentés…" : "E-mail sablon mentése"}
      </Button>
    </div>
  );
}