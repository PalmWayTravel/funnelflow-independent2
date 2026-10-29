import React from "react";
import { RotateCw } from "lucide-react";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { cn } from "@/lib/utils";

// Wraps page content: on touch devices pulling down reloads the data.
export default function PullToRefresh({ onRefresh, children, className }) {
  const { ref, pull, refreshing, ready } = usePullToRefresh(onRefresh);

  return (
    <div ref={ref}>
      <div style={{ height: pull }} className="overflow-hidden lg:hidden">
        <div className={cn("flex items-center justify-center gap-2 pb-3 text-xs font-semibold", (ready || refreshing) ? "text-primary" : "text-muted-foreground")}>
          <RotateCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          <span>{refreshing ? "Frissítés…" : ready ? "Engedd el a frissítéshez" : "Húzd le a frissítéshez"}</span>
        </div>
      </div>
      <div className={className}>{children}</div>
    </div>
  );
}