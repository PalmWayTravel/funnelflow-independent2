import React from "react";
import { format } from "date-fns";
import { hu } from "date-fns/locale";
import CalendarBlock from "./CalendarBlock";
import { cn } from "@/lib/utils";
import { HOUR_PX, timeLabel } from "@/lib/calendar";

export default function DayColumn({ day, hours, entries, isToday }) {
  const bookings = entries?.bookings || [];
  const events = entries?.events || [];
  const slots = entries?.slots || [];

  return (
    <div className="min-w-[75px] flex-1 border-r border-border last:border-r-0 sm:min-w-[104px]">
      <div className={cn("h-12 border-b border-border px-2 py-1.5 text-center", isToday && "bg-primary/5")}>
        <div className="text-[10px] uppercase text-muted-foreground">{format(day, "EEE", { locale: hu })}</div>
        <div className={cn("font-heading text-sm font-semibold", isToday && "text-primary")}>
          {format(day, "d", { locale: hu })}
        </div>
      </div>

      <div className="relative" style={{ height: hours.count * HOUR_PX }}>
        {Array.from({ length: hours.count }, (_, i) => (
          <div key={i} className="border-b border-border/50" style={{ height: HOUR_PX }} />
        ))}

        {slots.map((slot) => (
          <CalendarBlock
            key={`${slot.start}-${slot.booking_type_id}`}
            start={slot.start}
            end={new Date(new Date(slot.start).getTime() + (slot.duration_minutes || 30) * 60000)}
            hours={hours}
            tone="slot"
            title={`${slot.type_name} · ${slot.duration_minutes} perc · szabad`}
          >
            {timeLabel(slot.start)}
          </CalendarBlock>
        ))}

        {events.map((event) => (
          <CalendarBlock key={event.id} start={event.start} end={event.end} hours={hours} tone="event" title={event.title}>
            <div className="truncate font-semibold">{event.title}</div>
            <div className="truncate opacity-70">{event.all_day ? "Egész nap" : timeLabel(event.start)}</div>
          </CalendarBlock>
        ))}

        {bookings.map((booking) => (
          <CalendarBlock
            key={booking.id}
            start={booking.start}
            end={booking.end}
            hours={hours}
            tone="booking"
            title={`${booking.name} · ${timeLabel(booking.start)} · ${booking.type_name}`}
          >
            <div className="truncate font-semibold">{booking.name}</div>
            <div className="truncate opacity-80">{timeLabel(booking.start)} · {booking.type_name}</div>
          </CalendarBlock>
        ))}
      </div>
    </div>
  );
}