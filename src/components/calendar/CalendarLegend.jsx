import React from "react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Foglalás", cls: "gradient-brand" },
  { label: "Google Naptár", cls: "bg-muted border border-border" },
  { label: "Szabad időpont", cls: "border border-dashed border-emerald-500/70" },
];

export default function CalendarLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {ITEMS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-6 rounded", item.cls)} />
          {item.label}
        </span>
      ))}
      <span className="w-full sm:w-auto">A szabad időpontok a foglalási időpont típusok heti elérhetőségéből, a már lefoglalt időpontokból és a Google Naptár elfoglaltságaiból számolódnak.</span>
    </div>
  );
}