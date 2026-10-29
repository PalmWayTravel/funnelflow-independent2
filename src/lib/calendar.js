import { format } from "date-fns";
import { hu } from "date-fns/locale";

// Height of one hour on the day grid.
export const HOUR_PX = 46;

// Same convention the booking flow uses when it asks for slots.
export function tzOffset() {
  return new Date().getTimezoneOffset();
}

export function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function weekDays(anchor) {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthWeeks(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
}

// Every visible day of the current view, plus the absolute range they cover (end is exclusive).
export function visibleRange(view, anchor) {
  const days = view === "week" ? weekDays(anchor) : monthWeeks(anchor).flat();
  const start = new Date(days[0]);
  start.setHours(0, 0, 0, 0);
  const end = addDays(new Date(days[days.length - 1]), 1);
  return { start, end, days };
}

export function rangeLabel(view, anchor) {
  if (view === "month") return format(anchor, "yyyy. MMMM", { locale: hu });
  const days = weekDays(anchor);
  return `${format(days[0], "MMM d.", { locale: hu })} – ${format(days[6], "yyyy. MMM d.", { locale: hu })}`;
}

// Vertical span the day grid must show: whatever the week holds, at least 8 hours.
export function hourRange(items) {
  let from = 8;
  let to = 18;
  items.forEach((item) => {
    const start = new Date(item.start);
    from = Math.min(from, start.getHours());
    const end = item.end ? new Date(item.end) : null;
    const endHour = end ? end.getHours() + (end.getMinutes() > 0 ? 1 : 0) : start.getHours() + 1;
    to = Math.max(to, endHour);
  });
  from = Math.max(0, from);
  to = Math.min(24, Math.max(to, from + 8));
  return { from, to, count: to - from };
}

export function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function timeLabel(value) {
  return format(value instanceof Date ? value : new Date(value), "HH:mm");
}

// Foglalások, Google események és szabad időpontok napokra bontva.
export function groupEntries(data) {
  const map = new Map();
  const bucket = (key) => {
    if (!map.has(key)) map.set(key, { bookings: [], events: [], slots: [] });
    return map.get(key);
  };
  (data?.bookings || []).forEach((b) => bucket(dayKey(b.start)).bookings.push(b));
  (data?.events || []).forEach((e) => bucket(dayKey(e.start)).events.push(e));
  (data?.slots || []).forEach((s) => bucket(dayKey(s.start)).slots.push(s));
  return map;
}