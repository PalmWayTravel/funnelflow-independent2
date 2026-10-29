import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, KanbanSquare, CalendarCheck, CalendarDays, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";

// Compact bottom navigation for phones and small tablets (< 1024px).
const TABS = [
  { to: "/dashboard", label: "Áttekintés", icon: LayoutDashboard, adminOnly: true },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare, adminOnly: true },
  { to: "/crm", label: "Lead tábla", icon: KanbanSquare, clientOnly: true },
  { to: "/bookings", label: "Foglalások", icon: CalendarCheck },
  { to: "/calendar", label: "Naptár", icon: CalendarDays },
  { to: "/settings", label: "Beállítások", icon: SettingsIcon, adminOnly: true },
];

const isWithin = (pathname, base) => pathname === base || pathname.startsWith(`${base}/`);

export default function MobileTabBar() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Remembers where the user was inside each tab, so switching tabs keeps the sub-path.
  const memory = useRef({});

  const currentTo = TABS.find((tab) => isWithin(location.pathname, tab.to))?.to;

  useEffect(() => {
    if (!currentTo) return;
    const where = `${location.pathname}${location.search}`;
    if (where !== currentTo) memory.current[currentTo] = where;
  }, [currentTo, location.pathname, location.search]);

  const isAdmin = user?.role === "admin";
  const tabs = TABS.filter((tab) => (isAdmin ? !tab.clientOnly : !tab.adminOnly));

  const handleTap = (tab) => {
    if (isWithin(location.pathname, tab.to)) {
      memory.current[tab.to] = ""; // tapping the active tab resets it to its root
      navigate(tab.to);
      return;
    }
    navigate(memory.current[tab.to] || tab.to);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="flex items-stretch gap-1 px-1.5 pt-1.5">
        {tabs.map((tab) => {
          const active = isWithin(location.pathname, tab.to);
          return (
            <button
              key={tab.to}
              type="button"
              onClick={() => handleTap(tab)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold transition-colors",
                active
                  ? "gradient-brand text-white shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span className="max-w-full truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}