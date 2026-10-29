import React from "react";
import { cn } from "@/lib/utils";

export default function OnboardingProgress({ steps, current }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex flex-1 items-center gap-2">
          <div className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
            i <= current ? "gradient-brand text-white" : "bg-muted text-muted-foreground"
          )}>
            {i + 1}
          </div>
          <span className={cn("hidden text-xs font-medium sm:block", i === current ? "text-foreground" : "text-muted-foreground")}>
            {label}
          </span>
          {i < steps.length - 1 && (
            <div className={cn("h-0.5 flex-1 rounded-full", i < current ? "gradient-brand" : "bg-muted")} />
          )}
        </div>
      ))}
    </div>
  );
}