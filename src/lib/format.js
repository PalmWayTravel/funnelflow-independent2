import { differenceInCalendarDays, format, formatDistanceToNow, isToday, isThisWeek, parseISO } from "date-fns";
import { hu } from "date-fns/locale";

export function formatCurrency(n) {
  if (n == null || isNaN(n)) return "0 Ft";
  const num = Math.round(Number(n));
  return num.toLocaleString("hu-HU") + " Ft";
}

export function formatCurrencyShort(n) {
  if (n == null || isNaN(n)) return "0 Ft";
  const num = Number(n);
  if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M Ft";
  if (Math.abs(num) >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "e Ft";
  return num.toLocaleString("hu-HU") + " Ft";
}

export function formatNumber(n) {
  if (n == null || isNaN(n)) return "0";
  return Number(n).toLocaleString("hu-HU");
}

export function formatDateShort(d) {
  if (!d) return "—";
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, "MMM d", { locale: hu });
}

export function formatDateFull(d) {
  if (!d) return "—";
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, "yyyy. MMM d.", { locale: hu });
}

export function formatDateTime(d) {
  if (!d) return "—";
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, "yyyy. MMM d. HH:mm", { locale: hu });
}

export function timeAgo(d) {
  if (!d) return "";
  const date = typeof d === "string" ? parseISO(d) : d;
  return formatDistanceToNow(date, { addSuffix: true, locale: hu });
}

// Rövid, "0 napja" típusú címke a kártyákhoz.
export function daysAgoLabel(d) {
  if (!d) return "";
  const date = typeof d === "string" ? parseISO(d) : d;
  const days = Math.max(0, differenceInCalendarDays(new Date(), date));
  return `${days} napja`;
}

export function isDateToday(d) {
  if (!d) return false;
  const date = typeof d === "string" ? parseISO(d) : d;
  return isToday(date);
}

export function isDateThisWeek(d) {
  if (!d) return false;
  const date = typeof d === "string" ? parseISO(d) : d;
  return isThisWeek(date, { weekStartsOn: 1 });
}

export function initials(name) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

export function pctChange(current, previous) {
  if (previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}