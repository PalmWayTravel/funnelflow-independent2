import React, { useState } from "react";
import { Plus, Flag } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Modal from "@/components/Modal";
import StageRow from "@/components/crm/StageRow";
import { STAGE_COLORS, ensureDefaultStages } from "@/lib/crm";

export default function StageManager({ open, onClose, accountId, stages, contactCounts, onChanged }) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(STAGE_COLORS[0]);
  const [busy, setBusy] = useState(false);

  const sorted = [...stages].sort((a, b) => (a.order || 0) - (b.order || 0));

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    await base44.entities.PipelineStage.create({
      name: newName.trim(), color: newColor, order: sorted.length, account_id: accountId || "",
    });
    setNewName("");
    setBusy(false);
    onChanged && onChanged();
  };

  const rename = async (stage, name) => {
    await base44.entities.PipelineStage.update(stage.id, { name });
    onChanged && onChanged();
  };

  const recolor = async (stage, color) => {
    await base44.entities.PipelineStage.update(stage.id, { color });
    onChanged && onChanged();
  };

  const setEmoji = async (stage, emoji) => {
    await base44.entities.PipelineStage.update(stage.id, { emoji });
    onChanged && onChanged();
  };

  const move = async (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= sorted.length) return;
    await base44.entities.PipelineStage.update(sorted[index].id, { order: sorted[target].order });
    await base44.entities.PipelineStage.update(sorted[target].id, { order: sorted[index].order });
    onChanged && onChanged();
  };

  const remove = async (stage) => {
    await base44.entities.PipelineStage.delete(stage.id);
    onChanged && onChanged();
  };

  return (
    <Modal open={open} onClose={onClose} title="Pipeline fázisok" size="lg"
      description="A fázisok szabadon elnevezhetők és sorrendbe állíthatók."
      footer={<>
        <Button variant="outline" onClick={async () => { setBusy(true); await ensureDefaultStages(accountId); setBusy(false); onChanged && onChanged(); }}>Alap fázisok</Button>
        <Button onClick={onClose} className="gradient-brand text-white">Kész</Button>
      </>}>
      <div className="space-y-2">
        {sorted.map((stage, i) => (
          <StageRow key={stage.id} stage={stage} index={i} total={sorted.length}
            contactCount={contactCounts[stage.id] || 0}
            onRename={rename} onRecolor={recolor} onEmoji={setEmoji} onMove={move} onRemove={remove} />
        ))}
        {sorted.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Még nincs fázis.</p>}
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-border p-3">
        <Label className="mb-2 block">Új fázis hozzáadása</Label>
        <div className="flex items-center gap-2">
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent" />
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="pl. Tárgyalás"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <Button onClick={add} disabled={busy} className="gradient-brand text-white"><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Flag className="h-3.5 w-3.5" /> A sorrend a táblán balról jobbra követi ezt a listát.</div>
      </div>
    </Modal>
  );
}