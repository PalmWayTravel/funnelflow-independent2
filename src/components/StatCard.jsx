import React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const GRADIENTS = {
  violet: "from-violet-500 to-fuchsia-500",
  pink: "from-fuchsia-500 to-pink-500",
  amber: "from-amber-500 to-orange-500",
  emerald: "from-emerald-500 to-teal-500",
  blue: "from-blue-500 to-indigo-500",
  rose: "from-rose-500 to-pink-500",
};

export default function StatCard({ icon: Icon, label, value, sub, gradient = "violet", to, onClick }) {
  const Comp = to ? Link : "div";
  const props = to ? { to } : onClick ? { onClick, role: "button" } : {};
  return (
    <Comp
      {...props}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card transition-all",
        (to || onClick) && "cursor-pointer hover:-translate-y-0.5 hover:border-primary/40"
      )}
    >
      <div className={cn("inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm", GRADIENTS[gradient])}>
        {Icon && <Icon className="h-5 w-5" />}
      </div>
      <div className="mt-4">
        <div className="text-2xl font-bold tracking-tight font-heading">{value}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">{label}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground/80">{sub}</div>}
      </div>
    </Comp>
  );
}