import React, { useEffect, useState } from "react";
import { Plus, ArrowUp, ArrowDown, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import Modal from "@/components/Modal";
import TwoStepDelete from "@/components/TwoStepDelete";
import { TRIGGER_OPTIONS, STEP_TYPES, SMS_DISABLED_HINT } from "@/lib/crm";
import { cn } from "@/lib/utils";

const EMPTY = {
  name: "", account_id: "", marketing: true, active: true, trigger: "contact_created",
  trigger_stage_id: "", trigger_form_id: "", trigger_minutes_before: 60,
  condition_tag: "", stop_tag: "", steps: [],
};

const NEW_STEP = {
  email: { type: "email", subject: "", body: "" },
  sms: { type: "sms", body: "" },
  wait: { type: "wait", days: 1, hours: 0, minutes: 0 },
  condition: { type: "condition", tag: "" },
  tag: { type: "tag", tag: "", tag_action: "add" },
  stage: { type: "stage", stage_id: "" },
  notify: { type: "notify", message: "" },
  stop: { type: "stop" },
};

export default function AutomationBuilder({ open, onClose, automation, accounts, stages, forms, onSaved, smsEnabled }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [stepType, setStepType] = useState("email");

  useEffect(() => {
    if (!open) return;
    setForm(automation ? { ...EMPTY, ...automation, steps: automation.steps || [] } : EMPTY);
  }, [open, automation]);

  const setStep = (index, patch) => {
    const steps = form.steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
    setForm({ ...form, steps });
  };
  const addStep = () => setForm({ ...form, steps: [...form.steps, { ...NEW_STEP[stepType] }] });
  const removeStep = (index) => setForm({ ...form, steps: form.steps.filter((s, i) => i !== index) });
  const moveStep = (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= form.steps.length) return;
    const steps = [...form.steps];
    const tmp = steps[index]; steps[index] = steps[target]; steps[target] = tmp;
    setForm({ ...form, steps });
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(), account_id: form.account_id, marketing: !!form.marketing, active: form.account_id ? !!form.active : false, trigger: form.trigger,
      trigger_stage_id: form.trigger_stage_id, trigger_form_id: form.trigger_form_id,
      trigger_minutes_before: Number(form.trigger_minutes_before) || 60,
      condition_tag: form.condition_tag, stop_tag: form.stop_tag, steps: form.steps,
    };
    try {
      if (automation) await base44.entities.Automation.update(automation.id, payload);
      else await base44.entities.Automation.create(payload);
      onClose();
      onSaved && onSaved();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    await base44.entities.Automation.delete(automation.id);
    onClose();
    onSaved && onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={automation ? "Automatizáció szerkesztése" : "Új automatizáció"} size="xl"
      description="Indító esemény, majd lépések sorrendje — a rendszer emberi beavatkozás nélkül végrehajtja őket."
      footer={<>
        <Button variant="outline" onClick={onClose}>Mégse</Button>
        {automation && <TwoStepDelete onDelete={remove} />}
        <Button onClick={save} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button>
      </>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Név *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="pl. Üdvözlő sorozat" className="mt-1.5" /></div>
          <div><Label>Account</Label>
            <Select value={form.account_id || "none"} onValueChange={(v) => setForm({ ...form, account_id: v === "none" ? "" : v })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Válassz accountot" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Nincs account — nem fut</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
            {!form.account_id && (
              <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                Account nélkül az automatizáció egyetlen leadre sem fut le, ezért kikapcsolva mentjük.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-4">
          <div>
            <div className="text-sm font-medium">Marketing automatizáció</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Csak marketing hozzájárulást adott és nem leiratkozott kontaktoknak küld, a napi/havi account limiten belül.
              A levelek végére automatikusan bekerül a leiratkozási link és az account válaszcíme.
              Új automatizációnál alapból bekapcsolt, és ezt a jelzőt kizárólag admin módosíthatja.
            </p>
          </div>
          <Switch checked={!!form.marketing} onCheckedChange={(v) => setForm({ ...form, marketing: v })} />
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /><span className="font-heading text-sm font-semibold">Indító esemény</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={form.trigger} onValueChange={(v) => setForm({ ...form, trigger: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TRIGGER_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            {form.trigger === "stage_changed" && (
              <Select value={form.trigger_stage_id || "any"} onValueChange={(v) => setForm({ ...form, trigger_stage_id: v === "any" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="any">Bármely fázis</SelectItem>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {form.trigger === "form_submitted" && (
              <Select value={form.trigger_form_id || "any"} onValueChange={(v) => setForm({ ...form, trigger_form_id: v === "any" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="any">Bármely űrlap</SelectItem>{forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {form.trigger === "booking_upcoming" && (
              <div><Label className="text-xs">Emlékeztető ennyivel előtte (perc)</Label>
                <Input type="number" value={form.trigger_minutes_before} onChange={(e) => setForm({ ...form, trigger_minutes_before: Number(e.target.value) })} className="mt-1.5" />
              </div>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Belépési feltétel — csak ha van címkéje</Label>
              <Input value={form.condition_tag} onChange={(e) => setForm({ ...form, condition_tag: e.target.value })} placeholder="pl. vip" className="mt-1.5" />
            </div>
            <div><Label className="text-xs">Leállítási feltétel — ha már megvan a címkéje</Label>
              <Input value={form.stop_tag} onChange={(e) => setForm({ ...form, stop_tag: e.target.value })} placeholder="pl. ügyfél-lett" className="mt-1.5" />
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-heading text-sm font-semibold">Lépések</span>
            <div className="flex w-full gap-2 sm:w-auto">
              <Select value={stepType} onValueChange={setStepType}>
                <SelectTrigger className="w-full sm:w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>{STEP_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value} disabled={s.value === "sms" && !smsEnabled}>{s.label}</SelectItem>
                ))}</SelectContent>
              </Select>
              <Button size="sm" onClick={addStep} className="gradient-brand text-white"><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="space-y-2">
            {form.steps.map((step, i) => (
              <div key={i} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{i + 1}. {STEP_TYPES.find((s) => s.value === step.type)?.label || step.type}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                    <button onClick={() => moveStep(i, 1)} disabled={i === form.steps.length - 1} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    <button onClick={() => removeStep(i)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">✕</button>
                  </div>
                </div>

                {step.type === "email" && (
                  <div className="space-y-2">
                    <Input value={step.subject || ""} onChange={(e) => setStep(i, { subject: e.target.value })} placeholder="Tárgy" />
                    <Textarea value={step.body || ""} onChange={(e) => setStep(i, { body: e.target.value })} rows={3}
                      placeholder="Üzenet — változók: {{nev}}, {{ceg}}, {{foglalas_idopont}}, {{meeting_link}}" />
                  </div>
                )}
                {step.type === "sms" && (
                  <div>
                    <Textarea value={step.body || ""} onChange={(e) => setStep(i, { body: e.target.value })} rows={2}
                      placeholder="SMS szövege — változók: {{nev}}, {{foglalas_idopont}}" />
                    {!smsEnabled && <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">{SMS_DISABLED_HINT}</p>}
                  </div>
                )}
                {step.type === "wait" && (
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label className="text-xs">Nap</Label><Input type="number" value={step.days || 0} onChange={(e) => setStep(i, { days: Number(e.target.value) })} className="mt-1" /></div>
                    <div><Label className="text-xs">Óra</Label><Input type="number" value={step.hours || 0} onChange={(e) => setStep(i, { hours: Number(e.target.value) })} className="mt-1" /></div>
                    <div><Label className="text-xs">Perc</Label><Input type="number" value={step.minutes || 0} onChange={(e) => setStep(i, { minutes: Number(e.target.value) })} className="mt-1" /></div>
                  </div>
                )}
                {step.type === "condition" && (
                  <div>
                    <Input value={step.tag || ""} onChange={(e) => setStep(i, { tag: e.target.value })} placeholder="Címke, aminek meg kell lennie" />
                    <p className="mt-1 text-xs text-muted-foreground">Ha a kontaktnak nincs ilyen címkéje, az automatizáció itt leáll.</p>
                  </div>
                )}
                {step.type === "tag" && (
                  <div className="flex gap-2">
                    <Input value={step.tag || ""} onChange={(e) => setStep(i, { tag: e.target.value })} placeholder="Címke" className="flex-1" />
                    <Select value={step.tag_action || "add"} onValueChange={(v) => setStep(i, { tag_action: v })}>
                      <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="add">Hozzáadás</SelectItem><SelectItem value="remove">Levétel</SelectItem></SelectContent>
                    </Select>
                  </div>
                )}
                {step.type === "stage" && (
                  <Select value={step.stage_id || "none"} onValueChange={(v) => setStep(i, { stage_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Válassz fázist" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Nincs</SelectItem>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {step.type === "notify" && (
                  <Textarea value={step.message || ""} onChange={(e) => setStep(i, { message: e.target.value })} rows={2}
                    placeholder="Belső értesítés szövege — pl. {{nev}} új foglalást hozott létre" />
                )}
                {step.type === "stop" && <p className="text-sm text-muted-foreground">Az automatizáció itt leáll ennél a kontaktnál.</p>}
              </div>
            ))}
            {form.steps.length === 0 && (
              <div className={cn("rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground")}>
                Még nincs lépés. Válassz típust, majd kattints a + gombra.
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}