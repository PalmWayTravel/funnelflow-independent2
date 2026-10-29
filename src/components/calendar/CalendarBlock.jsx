import React from "react";
import { cn } from "@/lib/utils";
import { HOUR_PX, minutesOfDay } from "@/lib/calendar";

const TONES = {
  booking: "gradient-brand text-white",
  event: "bg-muted text-foreground/80 border border-border",
  slot: "border border-dashed border-emerald-500/70 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
};

// One positioned chip on the day grid.
export default function CalendarBlock({ start, end, hours, tone, title, children }) {
  const from = new Date(start);
  const to = end ? new Date(end) : null;
  const minutes = to ? Math.max(15, (to.getTime() - from.getTime()) / 60000) : 30;
  const top = ((minutesOfDay(from) - hours.from * 60) / 60) * HOUR_PX;
  const height = Math.max(14, (minutes / 60) * HOUR_PX);

  return (
    <div
      title={title}
      style={{ top, height }}
      className={cn(
        "absolute left-1 right-1 overflow-hidden rounded-lg px-1.5 py-1 text-[10px] leading-tight",
        TONES[tone] || TONES.event
      )}
    >
      {children}
    </div>
  );
}