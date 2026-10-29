import React, { useEffect, useState } from "react";
import { Plus, ArrowUp, ArrowDown, Copy, Check, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import Modal from "@/components/Modal";
import TwoStepDelete from "@/components/TwoStepDelete";
import { FIELD_TYPES, MAP_OPTIONS, STAGE_COLORS, embedSnippet, publicUrl } from "@/lib/crm";

const DEFAULT_FIELDS = [
  { label: "Név", field_type: "text", required: true, map_to: "name", placeholder: "Teljes név", options: "" },
  { label: "E-mail", field_type: "email", required: true, map_to: "email", placeholder: "email@pelda.com", options: "" },
  { label: "Telefon", field_type: "phone", required: false, map_to: "phone", placeholder: "+36 30 123 4567", options: "" },
  { label: "Üzenet", field_type: "textarea", required: false, map_to: "note", placeholder: "Miben segíthetünk?", options: "" },
  { label: "Hozzájárulok, hogy marketing e-mailt kapjak", field_type: "checkbox", required: false, map_to: "consent", placeholder: "Kérek hírlevelet és ajánlatokat", options: "" },
];

const EMPTY = {
  name: "", account_id: "", title: "Kapcsolatfelvétel", description: "", button_text: "Küldés",
  accent_color: STAGE_COLORS[0], success_message: "Köszönjük, hamarosan keresünk!",
  target_stage_id: "", active: true, fields: DEFAULT_FIELDS,
};

export default function FormBuilder({ open, onClose, form, accounts, stages, onSaved }) {
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newType, setNewType] = useState("text");

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setDraft(form ? { ...EMPTY, ...form, fields: form.fields || [] } : EMPTY);
  }, [open, form]);

  const setField = (index, patch) => setDraft({ ...draft, fields: draft.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) });
  const addField = () => setDraft({ ...draft, fields: [...draft.fields, { label: "Új mező", field_type: newType, required: false, map_to: "none", placeholder: "", options: "" }] });
  const removeField = (index) => setDraft({ ...draft, fields: draft.fields.filter((f, i) => i !== index) });
  const moveField = (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= draft.fields.length) return;
    const fields = [...draft.fields];
    const tmp = fields[index]; fields[index] = fields[target]; fields[target] = tmp;
    setDraft({ ...draft, fields });
  };

  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    const payload = { ...draft, name: draft.name.trim() };
    try {
      if (form) await base44.entities.FormDef.update(form.id, payload);
      else await base44.entities.FormDef.create(payload);
      onClose();
      onSaved && onSaved();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    await base44.entities.FormDef.delete(form.id);
    onClose();
    onSaved && onSaved();
  };

  const snippet = form ? embedSnippet(`/f/${form.id}`, 640) : "";
  const copySnippet = () => {
    navigator.clipboard?.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={onClose} title={form ? "Űrlap szerkesztése" : "Új űrlap"} size="xl"
      description="Kód nélkül építhető, egy beágyazó kóddal bármely weboldalra elhelyezhető."
      footer={<>
        <Button variant="outline" onClick={onClose}>Mégse</Button>
        {form && <TwoStepDelete onDelete={remove} />}
        <Button onClick={save} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button>
      </>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Űrlap neve (belső) *</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="pl. Weboldal kapcsolat" className="mt-1.5" /></div>
          <div><Label>Account</Label>
            <Select value={draft.account_id || "none"} onValueChange={(v) => setDraft({ ...draft, account_id: v === "none" ? "" : v })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Nincs</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 font-heading text-sm font-semibold">Megjelenés</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Cím</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-1.5" /></div>
            <div><Label className="text-xs">Gomb szövege</Label><Input value={draft.button_text} onChange={(e) => setDraft({ ...draft, button_text: e.target.value })} className="mt-1.5" /></div>
          </div>
          <div className="mt-3"><Label className="text-xs">Leírás</Label><Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} className="mt-1.5" /></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div><Label className="text-xs">Kiemelőszín</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <input type="color" value={draft.accent_color} onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })} className="h-9 w-10 cursor-pointer rounded-lg border border-border bg-transparent" />
                <span className="text-xs text-muted-foreground">{draft.accent_color}</span>
              </div>
            </div>
            <div><Label className="text-xs">Sikeres üzenet</Label><Input value={draft.success_message} onChange={(e) => setDraft({ ...draft, success_message: e.target.value })} className="mt-1.5" /></div>
            <div><Label className="text-xs">Besorolás fázisba</Label>
              <Select value={draft.target_stage_id || "none"} onValueChange={(v) => setDraft({ ...draft, target_stage_id: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nincs" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Nincs</SelectItem>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
            <span className="text-sm">{draft.active ? "Aktív — fogadja a kitöltéseket" : "Szüneteltetve"}</span>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="font-heading text-sm font-semibold">Mezők</span>
            <div className="flex gap-2">
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" onClick={addField} className="gradient-brand text-white"><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="space-y-2">
            {draft.fields.map((field, i) => (
              <div key={i} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{i + 1}. mező</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveField(i, -1)} disabled={i === 0} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                    <button onClick={() => moveField(i, 1)} disabled={i === draft.fields.length - 1} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    <button onClick={() => removeField(i)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">✕</button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <Input value={field.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="Címke" />
                  <Select value={field.field_type} onValueChange={(v) => setField(i, { field_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={field.map_to || "none"} onValueChange={(v) => setField(i, { map_to: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MAP_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 rounded-lg border border-border px-3">
                    <Switch checked={!!field.required} onCheckedChange={(v) => setField(i, { required: v })} />
                    <span className="text-xs">Kötelező</span>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Input value={field.placeholder || ""} onChange={(e) => setField(i, { placeholder: e.target.value })} placeholder="Halvány segédszöveg" />
                  {field.field_type === "select" && (
                    <Input value={field.options || ""} onChange={(e) => setField(i, { options: e.target.value })} placeholder="Opciók vesszővel: A, B, C" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {form && (
          <div className="rounded-xl border border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-heading text-sm font-semibold">Beágyazó kód</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => window.open(publicUrl(`/f/${form.id}`), "_blank")}><ExternalLink className="mr-1 h-3.5 w-3.5" /> Előnézet</Button>
                <Button size="sm" onClick={copySnippet}>{copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />} {copied ? "Kimásolva" : "Másolás"}</Button>
              </div>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground scrollbar-thin">{snippet}</pre>
          </div>
        )}
      </div>
    </Modal>
  );
}