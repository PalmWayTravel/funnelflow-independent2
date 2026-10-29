import React from "react";

// Fázisonkénti lead-megoszlás az ügyfél saját táblájáról.
export default function PipelineBreakdown({ items, total }) {
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Még nincs lead a tábládon.</p>;
  }

  const max = Math.max(1, ...items.map((i) => i.count));

  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color || "#94a3b8" }} />
              <span className="text-muted-foreground">{item.label}</span>
            </span>
            <span className="font-semibold">{item.count}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round((item.count / max) * 100)}%`, background: item.color || "#94a3b8" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}