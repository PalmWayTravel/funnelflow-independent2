import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, Sun, Moon, Monitor, Bell, X, ArrowLeft } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Topbar({ onMenu }) {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const popRef = useRef(null);
  const isClient = user?.role !== "admin";

  useEffect(() => {
    if (isClient) return;
    (async () => {
      try {
        const items = await base44.entities.ActivityLog.list("-created_date", 12);
        setLogs(items);
        setUnread(items.filter((l) => !l.read).length);
      } catch (e) {}
    })();
  }, [isClient]);

  const markAllRead = async () => {
    try {
      await base44.entities.ActivityLog.updateMany({ read: false }, { $set: { read: true } });
      setUnread(0);
      setLogs((prev) => prev.map((l) => ({ ...l, read: true })));
    } catch (e) {}
  };

  // Sub-pages (for example /clients/:id) get a back arrow instead of the menu icon.
  const segments = location.pathname.split("/").filter(Boolean);
  const isChildPage = segments.length > 1;
  const goBack = () => {
    if (location.key !== "default") navigate(-1);
    else navigate(`/${segments[0]}`);
  };

  const themeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const ThemeIcon = themeIcon;
  const cycleTheme = () => setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");

  return (
    <header className="sticky top-0 z-30 flex min-h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md md:min-h-[4rem] md:px-6">
      {isChildPage ? (
        <div className="flex items-center gap-1 lg:hidden">
          <button onClick={goBack} title="Vissza" className="tap-lg rounded-lg p-2 text-muted-foreground hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button onClick={onMenu} title="Menü" className="tap-lg rounded-lg p-2 text-muted-foreground hover:bg-accent">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <button onClick={onMenu} className="tap-lg rounded-lg p-2 text-muted-foreground hover:bg-accent lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          onClick={cycleTheme}
          title={`Téma: ${theme === "light" ? "világos" : theme === "dark" ? "sötét" : "rendszer"}`}
          className="tap-lg rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ThemeIcon className="h-[18px] w-[18px]" />
        </button>

        {/* Internal activity feed — admins only */}
        {!isClient && (
        <div className="relative" ref={popRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="tap-lg relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink-500 px-1 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw_-_2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-card animate-scale-in">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="font-heading text-sm font-semibold">Értesítések</span>
                  <button onClick={markAllRead} className="text-xs font-medium text-primary hover:underline">
                    Összes olvasottnak jelöl
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto scrollbar-thin">
                  {logs.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">Még nincs tevékenység</div>
                  )}
                  {logs.map((l) => (
                    <div key={l.id} className={cn("border-b border-border px-4 py-2.5 text-sm", !l.read && "bg-primary/5")}>
                      <div className="text-foreground">{l.message}</div>
                      <div className="text-[11px] text-muted-foreground">{timeAgo(l.created_date)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        )}

        <button
          onClick={() => navigate(isClient ? "/crm" : "/settings")}
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-full gradient-brand text-sm font-bold text-white shadow-sm"
          title={user?.email}
        >
          {(user?.full_name || user?.email || "U")[0]?.toUpperCase()}
        </button>
      </div>
    </header>
  );
}