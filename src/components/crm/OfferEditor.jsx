import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import Modal from "@/components/Modal";
import TwoStepDelete from "@/components/TwoStepDelete";
import { DEFAULT_TEMPLATE, TEMPLATE_VARS } from "@/lib/contracts";

const EMPTY = {
  name: "", description: "", servicesText: "", setup_fee: 0, monthly_fee: 0,
  payment_url: "", contract_template: "", active: true,
};

export default function OfferEditor({ open, onClose, offer, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (offer) {
      setForm({
        ...EMPTY, ...offer,
        servicesText: (offer.services || []).join("\n"),
        setup_fee: offer.setup_fee || 0,
        monthly_fee: offer.monthly_fee || 0,
        payment_url: offer.payment_url || "",
        contract_template: offer.contract_template || "",
      });
    } else {
      setForm({ ...EMPTY, contract_template: DEFAULT_TEMPLATE });
    }
  }, [open, offer]);

  const save = async () => {
    if (!form.name.trim()) { setError("Adj nevet a csomagnak."); return; }
    if (form.payment_url.trim() && !/^https:\/\//i.test(form.payment_url.trim())) {
      setError("A fizetési link csak https:// címmel kezdődhet."); return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      services: form.servicesText.split("\n").map((s) => s.trim()).filter(Boolean),
      setup_fee: Math.max(0, Number(form.setup_fee) || 0),
      monthly_fee: Math.max(0, Number(form.monthly_fee) || 0),
      payment_url: form.payment_url.trim(),
      contract_template: form.contract_template,
      active: !!form.active,
    };
    try {
      if (offer) await base44.entities.Offer.update(offer.id, payload);
      else await base44.entities.Offer.create(payload);
      onClose();
      onSaved && onSaved();
    } catch (e) { setError(e.message || "Nem sikerült menteni."); } finally { setSaving(false); }
  };

  const remove = async () => {
    await base44.entities.Offer.delete(offer.id);
    onClose();
    onSaved && onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={offer ? "Ajánlat szerkesztése" : "Új ajánlat"} size="lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>Mégse</Button>
        {offer && <TwoStepDelete onDelete={remove} />}
        <Button onClick={save} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>Csomag neve *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" /></div>
          <div className="flex items-end justify-between gap-3 rounded-xl border border-border px-3 py-2">
            <div><div className="text-sm font-medium">Aktív</div><div className="text-xs text-muted-foreground">Csak az aktív ajánlat küldhető</div></div>
            <Switch checked={!!form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>
        </div>
        <div><Label>Rövid leírás</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1.5" /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>Setup díj (Ft)</Label><Input type="number" min="0" value={form.setup_fee} onChange={(e) => setForm({ ...form, setup_fee: e.target.value })} className="mt-1.5" /></div>
          <div><Label>Havi díj (Ft)</Label><Input type="number" min="0" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })} className="mt-1.5" /></div>
        </div>
        <div><Label>Tartalom (soronként egy elem)</Label>
          <Textarea value={form.servicesText} onChange={(e) => setForm({ ...form, servicesText: e.target.value })} rows={4} className="mt-1.5" placeholder={"Meta hirdetéskezelés\nHavi riport\nCRM hozzáférés"} />
        </div>
        <div><Label>Kézi fizetési link (tartalék, opcionális, https://)</Label>
          <Input value={form.payment_url} onChange={(e) => setForm({ ...form, payment_url: e.target.value })} className="mt-1.5" placeholder="https://" />
          <p className="mt-1 text-xs text-muted-foreground">Ha a Stripe be van kötve, az aláírás után a rendszer automatikusan fizetési linket készít a díjakból (setup díj + havi előfizetés, HUF). Ez a kézi link csak akkor jelenik meg, ha a Stripe nincs bekötve.</p>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label>Szerződés szövege (sablon)</Label>
            <button type="button" onClick={() => setForm({ ...form, contract_template: DEFAULT_TEMPLATE })} className="text-xs font-medium text-primary hover:underline">Kiinduló váz betöltése</button>
          </div>
          <Textarea value={form.contract_template} onChange={(e) => setForm({ ...form, contract_template: e.target.value })} rows={12} className="mt-1.5 font-mono text-xs" />
          <p className="mt-1 text-xs text-muted-foreground">Változók: {TEMPLATE_VARS.join(" ")}</p>
          <p className="mt-1 rounded-lg bg-amber-100 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            A kiinduló váz csak minta. A szögletes zárójeles részeket töltsd ki, és az egész szöveget jogásszal nézesd át, mielőtt ügyfélnek küldöd.
          </p>
        </div>
        {error && <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
