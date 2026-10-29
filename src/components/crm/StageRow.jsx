import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import TwoStepDelete from "@/components/TwoStepDelete";

// A sor a saját piszkozatát szerkeszti, és csak kilépéskor (vagy Enterre) ment,
// így gépelés közben nem indul újratöltés.
export default function StageRow({ stage, index, total, contactCount, onRename, onRecolor, onEmoji, onMove, onRemove }) {
  const [name, setName] = useState(stage.name || "");
  const [color, setColor] = useState(stage.color || "#8549DE");
  const [emoji, setEmoji] = useState(stage.emoji || "");
  const nameFocused = useRef(false);
  const colorFocused = useRef(false);
  const emojiFocused = useRef(false);

  // Háttérben frissülő adat ne írja felül azt, amit épp ír.
  useEffect(() => { if (!nameFocused.current) setName(stage.name || ""); }, [stage.name]);
  useEffect(() => { if (!colorFocused.current) setColor(stage.color || "#8549DE"); }, [stage.color]);
  useEffect(() => { if (!emojiFocused.current) setEmoji(stage.emoji || ""); }, [stage.emoji]);

  const commitName = () => {
    const next = name.trim();
    if (!next) { setName(stage.name || ""); return; }
    if (next !== stage.name) onRename(stage, next);
  };

  const commitEmoji = () => {
    const next = emoji.trim();
    if (next !== (stage.emoji || "")) onEmoji(stage, next);
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border p-2">
      <input type="color" value={color}
        onChange={(e) => setColor(e.target.value)}
        onFocus={() => { colorFocused.current = true; }}
        onBlur={() => { colorFocused.current = false; if (color !== stage.color) onRecolor(stage, color); }}
        className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent" />
      <Input value={emoji} placeholder="🙂"
        onChange={(e) => setEmoji(e.target.value)}
        onFocus={() => { emojiFocused.current = true; }}
        onBlur={() => { emojiFocused.current = false; commitEmoji(); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="w-14 shrink-0 text-center" />
      <Input value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={() => { nameFocused.current = true; }}
        onBlur={() => { nameFocused.current = false; commitName(); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="flex-1" />
      <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground sm:inline">
        {contactCount} kontakt
      </span>
      <button onClick={() => onMove(index, -1)} disabled={index === 0} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
      <button onClick={() => onMove(index, 1)} disabled={index === total - 1} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
      <TwoStepDelete onDelete={() => onRemove(stage)} label="" />
    </div>
  );
}