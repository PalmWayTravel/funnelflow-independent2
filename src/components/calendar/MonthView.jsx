import React from "react";
import MonthCell from "./MonthCell";
import { dayKey } from "@/lib/calendar";

const WEEKDAY_LABELS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

export default function MonthView({ weeks, month, entries, todayKey }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-[11px] font-semibold text-muted-foreground">{label}</div>
        ))}
      </div>

      {weeks.map((week) => (
        <div key={dayKey(week[0])} className="grid grid-cols-7">
          {week.map((day) => (
            <MonthCell
              key={dayKey(day)}
              day={day}
              inMonth={day.getMonth() === month}
              entries={entries.get(dayKey(day))}
              isToday={dayKey(day) === todayKey}
            />
          ))}
        </div>
      ))}
    </div>
  );
}