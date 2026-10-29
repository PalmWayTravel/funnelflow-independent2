import React, { useState } from "react";
import { ArrowLeft, ArrowRight, LifeBuoy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeAdAccountId } from "@/lib/onboarding";

export default function MetaAccountForm({ hasAccount, record, onSubmit, saving, onBack }) {
  const [form, setForm] = useState({
    ad_account_id: record?.meta_ad_account_id || "",
    ad_account_name: record?.meta_ad_account_name || "",
    business_id: record?.meta_business_id || "",
    page_name: record?.meta_page_name || "",
    note: record?.meta_note || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    const adAccountId = normalizeAdAccountId(form.ad_account_id);
    if (!adAccountId) {
      setError("Add meg a hirdetési fiók azonosítóját (act_…), vagy kérj segítséget lent.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSubmit({
        has_meta_account: true,
        meta_status: "pending_review",
        meta_ad_account_id: adAccountId,
        meta_ad_account_name: form.ad_account_name.trim(),
        meta_business_id: form.business_id.trim(),
        meta_page_name: form.page_name.trim(),
        meta_note: form.note.trim(),
      });
    } catch (e) {
      setError(e.message || "Nem sikerült elmenteni az adatokat.");
    } finally {
      setBusy(false);
    }
  };

  const requestHelp = async () => {
    setError("");
    setBusy(true);
    try {
      await onSubmit({
        has_meta_account: !!hasAccount,
        meta_status: "help_requested",
        meta_note: form.note.trim() || "Az ügyfél segítséget kért a Meta hirdetési fiók létrehozásában.",
      });
    } catch (e) {
      setError(e.message || "Nem sikerült elküldeni a kérést.");
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || saving;

  return (
    <div>
      <h2 className="font-heading text-xl font-bold">Add meg a hirdetési fiók adatait</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Ezekből tudjuk azonosítani a fiókodat, és összekötni a saját munkaterületeddel, hogy minden lead ide érkezzen.
      </p>

      <div className="mt-5 space-y-3">
        <div>
          <Label>Hirdetési fiók azonosítója *</Label>
          <Input value={form.ad_account_id} onChange={(e) => set("ad_account_id", e.target.value)}
            placeholder="act_1234567890" className="mt-1.5 font-mono" />
          <p className="mt-1 text-xs text-muted-foreground">
            A Business Managerben a hirdetési fiók neve mellett látszik — az „act_” előtagot nem kell beírni.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Hirdetési fiók neve</Label>
            <Input value={form.ad_account_name} onChange={(e) => set("ad_account_name", e.target.value)}
              placeholder="pl. Példa Kft." className="mt-1.5" />
          </div>
          <div>
            <Label>Business Manager azonosító</Label>
            <Input value={form.business_id} onChange={(e) => set("business_id", e.target.value)}
              placeholder="pl. 1234567890123456" className="mt-1.5 font-mono" />
          </div>
        </div>
        <div>
          <Label>Facebook oldal neve</Label>
          <Input value={form.page_name} onChange={(e) => set("page_name", e.target.value)}
            placeholder="Ha az oldaladról is hirdetünk" className="mt-1.5" />
        </div>
        <div>
          <Label>Megjegyzés</Label>
          <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={3}
            placeholder="Bármi, amit tudnunk kell (pl. most indítjuk az első kampányt)" className="mt-1.5" />
        </div>
      </div>

      {error && (
        <div className="mt-4 flex gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 space-y-2">
        <Button onClick={submit} disabled={disabled} className="h-11 w-full gradient-brand text-white">
          {busy || saving ? "Mentés…" : "Beküldöm és befejezem"} <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={requestHelp} disabled={disabled} className="h-11 w-full">
          <LifeBuoy className="mr-1.5 h-4 w-4" /> Nincs még fiókom, kérem a segítségeteket
        </Button>
      </div>

      <div className="mt-5 flex justify-start">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Vissza az útmutatóhoz
        </Button>
      </div>
    </div>
  );
}