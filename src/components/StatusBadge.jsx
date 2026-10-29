import React from "react";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  prospect: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  inactive: "bg-zinc-200 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400",
  open: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  "New Lead": "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  Contacted: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  Proposal: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Negotiation: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  Won: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Lost: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  connected: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  disconnected: "bg-zinc-200 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400",
  error: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

export default function StatusBadge({ status, className }) {
  const cls = STATUS_STYLES[status] || "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400";
  const label = (status || "").replace(/_/g, " ");
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", cls, className)}>
      {label}
    </span>
  );
}