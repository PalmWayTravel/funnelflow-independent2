import React, { useEffect, useState } from "react";
import { Mail, Info } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Modal from "@/components/Modal";

const VARIABLES = ["{{nev}}", "{{ceg}}", "{{email}}", "{{telefon}}", "{{iparag}}", "{{foglalas_idopont}}"];

export default function AutomationContentEditor({ open, automation, onClose, onSaved }) {
  const [drafts, setDrafts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !automation) return;
    setDrafts((automation.steps || [])
      .map((step, index) => ({ index, type: step.type, subject: step.subject || "", body: step.body || "" }))
      .filter((step) => step.type === "email"));
  }, [open, automation]);

  const setDraft = (index, patch) => setDrafts(drafts.map((d) => (d.index === index ? { ...d, ...patch } : d)));

  const save = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke("crmAutomationContent", {
        automation_id: automation.id,
        action: "save_content",
        content: drafts.map((d) => ({ index: d.index, subject: d.subject, body: d.body })),
      });
      if (res.data?.error) { alert(res.data.error); return; }
      onClose();
      onSaved && onSaved();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Levél tartalmának szerkesztése" size="lg"
      description="A tárgyat és a szöveget módosíthatod. A triggert, a lépéseket, a címzetteket és a limiteket az adminisztrátor állítja."
      footer={<>
        <Button variant="outline" onClick={onClose}>Mégse</Button>
        <Button onClick={save} disabled={saving} className="gradient-brand text-white">{saving ? "Mentés…" : "Mentés"}</Button>
      </>}>
      <div className="space-y-5">
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">
            Beilleszthető változók: <span className="font-medium text-foreground">{VARIABLES.join(", ")}</span>.
            A levél végére automatikusan bekerül a feladó neve (a cég neve), a válaszcím és a leiratkozási link.
          </p>
        </div>

        {drafts.length === 0 && <p className="text-sm text-muted-foreground">Ennek az automatizációnak nincs e-mail lépése.</p>}

        {drafts.map((draft, i) => (
          <div key={draft.index} className="rounded-xl border border-border p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Mail className="h-4 w-4 text-primary" /> {i + 1}. e-mail
            </div>
            <div className="space-y-3">
              <div><Label className="text-xs">Tárgy</Label>
                <Input value={draft.subject} onChange={(e) => setDraft(draft.index, { subject: e.target.value })} className="mt-1.5" />
              </div>
              <div><Label className="text-xs">Szöveg</Label>
                <Textarea value={draft.body} onChange={(e) => setDraft(draft.index, { body: e.target.value })} rows={5} className="mt-1.5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}