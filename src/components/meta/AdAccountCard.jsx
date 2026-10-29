import React from "react";
import { Facebook, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import TwoStepDelete from "@/components/TwoStepDelete";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { workspaceLabel } from "@/lib/meta";

// Egy bekötött hirdetési fiók: melyik workspace-hez tartozik, aktív-e, és mikor volt rajta lead.
export default function AdAccountCard({ mapping, accounts, onEdit, onToggleStatus, onDelete }) {
  const active = mapping.status === "active";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="gradient-brand-soft flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
            <Facebook className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-heading font-semibold">{mapping.ad_account_name || mapping.ad_account_id}</h3>
            <p className="truncate text-xs text-muted-foreground">{mapping.ad_account_id}</p>
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
          active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400")}>
          {active ? "aktív" : "inaktív"}
        </span>
      </div>

      <div className="mt-4 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Workspace</span>
          <span className="truncate font-semibold">{workspaceLabel(mapping.workspace_id, accounts)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Facebook oldal</span>
          <span className="truncate font-medium">{mapping.page_name || mapping.page_id || "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Utolsó lead</span>
          <span className="truncate font-medium">{mapping.last_lead_at ? formatDateTime(mapping.last_lead_at) : "még nem volt"}</span>
        </div>
      </div>

      {mapping.note && <p className="mt-3 text-xs text-muted-foreground">{mapping.note}</p>}

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}>
          <Pencil className="mr-1.5 h-4 w-4" /> Szerkesztés
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={onToggleStatus}>
          {active ? "Inaktiválás" : "Aktiválás"}
        </Button>
        <TwoStepDelete onDelete={onDelete} label="" />
      </div>
    </div>
  );
}