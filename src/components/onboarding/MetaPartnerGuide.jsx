import React, { useState } from "react";
import { KeyRound, Copy, Check } from "lucide-react";

const STEPS = [
  "A Business Managerben: Beállítások → Felhasználók → Partnerek → „Hozzáadás” → „Partner hozzáférés adása az eszközeidhez”.",
  "Írd be a partner azonosítónkat, majd nyomd meg a „Tovább” gombot.",
  "Jelöld ki a hirdetési fiókodat, és a jogosultságnál a „Kampányok kezelése” (Manage campaigns) opciót válaszd.",
  "Ha az oldaladról is hirdetünk, ugyanitt a Facebook oldaladat is add hozzá, majd mentsd el.",
];

export default function MetaPartnerGuide({ partnerId }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(partnerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h3 className="font-heading text-sm font-semibold">Add nekünk hozzáférést a hirdetési fiókodhoz</h3>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Partner azonosítónk</span>
        {partnerId ? (
          <>
            <code className="flex-1 truncate font-mono text-sm font-semibold">{partnerId}</code>
            <button onClick={copy} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
              {copied ? <><Check className="h-3.5 w-3.5 text-emerald-600" /> Kimásolva</> : <><Copy className="h-3.5 w-3.5" /> Másolás</>}
            </button>
          </>
        ) : (
          <span className="flex-1 text-xs text-muted-foreground">
            Az azonosítót a kapcsolattartódtól kapod meg — addig is küldd be lent az adataidat, és visszajelezzük.
          </span>
        )}
      </div>

      <ol className="mt-3 space-y-2.5">
        {STEPS.map((text, i) => (
          <li key={text} className="flex gap-3 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              {i + 1}
            </span>
            <span className="text-muted-foreground">{text}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">
        Ezzel a hozzáféréssel tudjuk elindítani és optimalizálni a hirdetéseidet, és minden lead automatikusan a te tábládra kerül.
      </p>
    </div>
  );
}