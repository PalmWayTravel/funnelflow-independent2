import React from "react";
import { History, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  queued: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

export default function SendLogTable({ logs, automations, accountName, onToggleAutomation }) {
  return (
    <div className="mt-8 rounded-2xl border border-border bg-card shadow-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <History className="h-4 w-4 text-primary" />
        <h2 className="font-heading text-base font-semibold">Küldési napló</h2>
        <span className="ml-auto text-xs text-muted-foreground">account szerint, a legutóbbi {logs.length} kiküldés</span>
      </div>

      {logs.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Még nincs rögzített kiküldés.</p>
      ) : (
        <div className="divide-y divide-border">
          {logs.map((log) => {
            const automation = automations.find((a) => a.id === log.automation_id);
            return (
              <div key={log.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{log.subject || (log.channel === "sms" ? "SMS" : "E-mail")}</span>
                    {log.marketing && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">marketing</span>
                    )}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLES[log.status])}>{log.status}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {log.to_address || "—"} · {accountName(log.account_id)}{automation ? ` · ${automation.name}` : ""} · {formatDateTime(log.created_date)}
                    {log.error ? ` · ${log.error}` : ""}
                  </div>
                </div>
                {automation && (
                  <Button size="sm" variant="outline" disabled={!automation.account_id}
                    title={!automation.account_id ? "Nincs account rendelve — nem indítható" : undefined}
                    onClick={() => onToggleAutomation(automation)}>
                    {automation.active
                      ? <><Pause className="mr-1 h-3.5 w-3.5" /> Szüneteltetés</>
                      : <><Play className="mr-1 h-3.5 w-3.5" /> Indítás</>}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}