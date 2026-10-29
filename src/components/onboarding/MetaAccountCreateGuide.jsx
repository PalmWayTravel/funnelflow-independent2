import React from "react";
import { MonitorSmartphone } from "lucide-react";
import { META_AD_ACCOUNTS_LINK, META_BUSINESS_HOME } from "@/lib/onboarding";

const STEPS = [
  "Nyisd meg a business.facebook.com oldalt, és hozz létre egy Business Manager fiókot a céged nevével (ha már van, csak lépj be).",
  "A bal oldali menüben: Beállítások → Fiókok → Hirdetési fiókok → Hozzáadás → „Új hirdetési fiók létrehozása”.",
  "Pénznemnek válaszd a HUF-ot, időzónának pedig a Budapestet — ezt később már nem lehet módosítani.",
  "Add meg a fizetési módot, majd mentsd el a hirdetési fiókot.",
  "A létrejött fiók melletti azonosítót (act_…) a következő lépésben beírod nekünk.",
];

export default function MetaAccountCreateGuide() {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <div className="flex items-center gap-2">
        <MonitorSmartphone className="h-4 w-4 text-primary" />
        <h3 className="font-heading text-sm font-semibold">Nincs még hirdetési fiókod? Így hozd létre</h3>
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
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={META_BUSINESS_HOME} target="_blank" rel="noreferrer"
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent">
          Business Manager megnyitása
        </a>
        <a href={META_AD_ACCOUNTS_LINK} target="_blank" rel="noreferrer"
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent">
          Hirdetési fiókok beállítása
        </a>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Ha elakadsz, a következő lépésben egy gombbal jelezheted, és segítünk a létrehozásban.
      </p>
    </div>
  );
}