import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  LayoutDashboard, Users, Contact, MessageSquareWarning, CheckSquare, KanbanSquare, BarChart3,
  Settings as SettingsIcon, LogOut, Zap, Megaphone, FileText, CalendarCheck, CalendarDays, Building2, Facebook, FileSignature,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

const NAV_GROUPS = [
  {
    label: "Munkaterület",
    items: [
      { to: "/dashboard", label: "Áttekintés", icon: LayoutDashboard },
      { to: "/contacts", label: "Kontaktok", icon: Contact },
      { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
      { to: "/clients", label: "Ügyfelek", icon: Users },
      { to: "/tasks", label: "Feladatok", icon: CheckSquare, countKey: "tasks" },
      { to: "/complaints", label: "Panaszok", icon: MessageSquareWarning, countKey: "complaints" },
    ],
  },
  {
    label: "Növekedés",
    items: [
      { to: "/automations", label: "Automatizációk", icon: Zap },
      { to: "/broadcasts", label: "Kampányok", icon: Megaphone },
      { to: "/forms", label: "Űrlapok", icon: FileText },
      { to: "/bookings", label: "Foglalások", icon: CalendarCheck },
      { to: "/contracts", label: "Szerződések", icon: FileSignature, adminOnly: true },
      { to: "/calendar", label: "Naptár", icon: CalendarDays },
    ],
  },
  {
    label: "Elemzés",
    items: [{ to: "/sales", label: "Értékesítés", icon: BarChart3 }],
  },
  {
    label: "Rendszer",
    items: [
      { to: "/accounts", label: "Accountok", icon: Building2, adminOnly: true },
      { to: "/meta-ads", label: "Meta hirdetések", icon: Facebook, adminOnly: true },
      { to: "/settings", label: "Beállítások", icon: SettingsIcon },
    ],
  },
];

// Az ügyfél kizárólag a saját munkaterületét látja: vezérlőpult, CRM, naptár, riport.
const CLIENT_GROUPS = [
  {
    label: "Saját munkaterület",
    items: [
      { to: "/dashboard", label: "Vezérlőpult", icon: LayoutDashboard },
      { to: "/crm", label: "CRM – lead tábla", icon: KanbanSquare },
      { to: "/calendar", label: "Naptár", icon: CalendarDays },
      { to: "/reports", label: "Riport", icon: BarChart3 },
    ],
  },
];

export default function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [counts, setCounts] = useState({ complaints: 0, tasks: 0 });

  useEffect(() => {
    if (user?.role !== "admin") { setCounts({ complaints: 0, tasks: 0 }); return; }
    let active = true;
    (async () => {
      try {
        const [openComp, openTasks] = await Promise.all([
          base44.entities.Complaint.count({ status: "open" }),
          base44.entities.Task.count({ done: false }),
        ]);
        if (active) setCounts({ complaints: Number(openComp) || 0, tasks: Number(openTasks) || 0 });
      } catch (e) {}
    })();
    return () => { active = false; };
  }, [location.pathname, user?.role]);

  const groups = (user?.role === "admin" ? NAV_GROUPS : CLIENT_GROUPS)
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.adminOnly || user?.role === "admin") }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className="flex h-full w-[236px] flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-brand text-white shadow-sm">
          <KanbanSquare className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="font-heading text-base font-bold">FunnelFlow</div>
          <div className="text-[11px] text-muted-foreground">CRM Munkaterület</div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-2 scrollbar-thin">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{group.label}</div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const count = counts[item.countKey];
                const active = location.pathname === item.to || (item.to !== "/dashboard" && location.pathname.startsWith(item.to));
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                      active
                        ? "gradient-brand text-white shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px]" />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && (
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", active ? "bg-white/25 text-white" : "bg-primary/15 text-primary")}>
                        {count}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full gradient-brand text-sm font-bold text-white">
            {initials(user?.full_name || user?.email || "U")}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold">{user?.full_name || user?.email}</div>
            <div className="text-[11px] capitalize text-muted-foreground">{user?.role || "user"}</div>
          </div>
          <button
          onClick={() => logout()}
          title="Kijelentkezés"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}