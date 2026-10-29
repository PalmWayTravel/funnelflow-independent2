import React from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "week", label: "Hét" },
  { id: "month", label: "Hónap" },
];

export default function CalendarToolbar({ view, onView, label, onPrev, onNext, onToday, onRefresh, busy, google }) {
  const connected = !!google?.connected;

  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="tap-lg" onClick={onPrev} aria-label="Előző időszak">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="tap-lg" onClick={onToday}>Ma</Button>
        <Button variant="outline" size="icon" className="tap-lg" onClick={onNext} aria-label="Következő időszak">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="ml-1 font-heading text-base font-semibold">{label}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
            connected
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          )}
        >
          {connected ? "Google Naptár összekötve" : google?.error || "Google Naptár nincs összekötve"}
        </span>

        <Button variant="outline" size="sm" className="tap-lg" onClick={onRefresh} disabled={busy}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", busy && "animate-spin")} /> Frissítés
        </Button>

        <div className="flex rounded-xl border border-border p-0.5">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onView(item.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                view === item.id ? "gradient-brand text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}