import React from "react";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { timeLabel } from "@/lib/calendar";

export default function MonthCell({ day, inMonth, entries, isToday }) {
  const bookings = entries?.bookings || [];
  const events = entries?.events || [];
  const slots = entries?.slots || [];
  const shown = bookings.length + events.length;

  return (
    <div className={cn("min-h-[92px] border-b border-r border-border p-1.5", !inMonth && "bg-muted/30")}>
      <div className="flex items-center justify-between gap-1">
        <span className={cn("text-xs font-semibold", !inMonth && "text-muted-foreground/60", isToday && "gradient-brand rounded-full px-1.5 text-white")}>
          {format(day, "d", { locale: hu })}
        </span>
        {slots.length > 0 && (
          <span className="shrink-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">{slots.length} szabad</span>
        )}
      </div>

      <div className="mt-1 space-y-0.5">
        {bookings.slice(0, 2).map((booking) => (
          <div
            key={booking.id}
            title={`${booking.name} · ${timeLabel(booking.start)} · ${booking.type_name}`}
            className="truncate rounded gradient-brand px-1.5 py-0.5 text-[10px] font-medium text-white"
          >
            {timeLabel(booking.start)} {booking.name}
          </div>
        ))}
        {events.slice(0, 1).map((event) => (
          <div key={event.id} title={event.title} className="truncate rounded bg-muted px-1.5 py-0.5 text-[10px]">
            {event.title}
          </div>
        ))}
        {shown > 3 && <div className="text-[10px] text-muted-foreground">+{shown - 3} további</div>}
      </div>
    </div>
  );
}