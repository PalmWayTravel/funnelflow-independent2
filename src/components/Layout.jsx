import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import MobileTabBar from "@/components/MobileTabBar";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { processAutomationQueue } from "@/lib/crm";
import { useAuth } from "@/lib/AuthContext";

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role !== "admin") return;
    const timer = setTimeout(() => { processAutomationQueue(); }, 1500);
    return () => clearTimeout(timer);
  }, [location.pathname, user?.role]);

  return (
    <div className="flex h-screen overflow-hidden bg-background supports-[height:100dvh]:h-[100dvh]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full animate-fade-in supports-[height:100dvh]:h-[100dvh]">
            <div className="relative h-full">
              <Sidebar onNavigate={() => setMobileOpen(false)} />
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute -right-12 top-4 rounded-lg bg-white/10 p-2 text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className={cn("flex-1 overflow-y-auto overscroll-none scrollbar-thin")}>
          <div key={location.pathname} className="mx-auto animate-fade-in px-4 pt-4 pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:px-6 md:pt-6 lg:px-8 lg:pb-6" style={{ maxWidth: "var(--content-max, 1200px)" }}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom tab bar — mobile and small tablets only */}
      <MobileTabBar />
    </div>
  );
}