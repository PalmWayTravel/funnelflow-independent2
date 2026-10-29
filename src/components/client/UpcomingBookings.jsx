import React from "react";
import { CalendarCheck } from "lucide-react";
import { formatDateTime } from "@/lib/format";

const STATUS_LABELS = { confirmed: "Megerősítve", cancelled: "Lemondva", completed: "Teljesítve" };

export default function UpcomingBookings({ bookings }) {
  if (bookings.length === 0) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <CalendarCheck className="h-4 w-4 shrink-0" />
        <span>Nincs közelgő foglalás.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bookings.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{b.name || b.email || "Foglalás"}</div>
            <div className="text-xs text-muted-foreground">{formatDateTime(b.start)}</div>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {STATUS_LABELS[b.status] || b.status}
          </span>
        </div>
      ))}
    </div>
  );
}