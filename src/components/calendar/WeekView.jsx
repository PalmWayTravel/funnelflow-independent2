import React from "react";
import DayColumn from "./DayColumn";
import { HOUR_PX, dayKey } from "@/lib/calendar";

export default function WeekView({ days, hours, entries, todayKey }) {
  return (
    <div className="overflow-x-auto scrollbar-thin rounded-2xl border border-border bg-card shadow-card">
      <div className="flex min-w-[570px] sm:min-w-[760px]">
        <div className="sticky left-0 z-20 w-12 shrink-0 border-r border-border bg-card">
          <div className="h-12 border-b border-border" />
          {Array.from({ length: hours.count }, (_, i) => (
            <div key={i} className="relative" style={{ height: HOUR_PX }}>
              <span className="absolute right-1.5 top-0 text-[10px] text-muted-foreground">
                {String(hours.from + i).padStart(2, "0")}:00
              </span>
            </div>
          ))}
        </div>

        {days.map((day) => (
          <DayColumn
            key={dayKey(day)}
            day={day}
            hours={hours}
            entries={entries.get(dayKey(day))}
            isToday={dayKey(day) === todayKey}
          />
        ))}
      </div>
    </div>
  );
}