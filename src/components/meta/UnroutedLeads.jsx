import React, { useState } from "react";
import { Inbox } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import ResponsiveSelect from "@/components/ResponsiveSelect";
import EmptyState from "@/components/EmptyState";
import { ensureDefaultStages } from "@/lib/crm";
import { formatDateTime } from "@/lib/format";
import { AGENCY_WORKSPACE, UNROUTED_TAG, workspaceAccountId, workspaceLabel, workspaceOptions } from "@/lib/meta";

// "Besorolatlan leadek" gyűjtő: azok a Meta leadek, amelyek hirdetési fiókja
// még nincs egyetlen workspace-hez sem bekötve. Csak admin látja és rendelheti hozzá.
export default function UnroutedLeads({ contacts, accounts, onAssigned }) {
  const [targets, setTargets] = useState({});
  const [busyId, setBusyId] = useState("");

  const assign = async (contact) => {
    const workspaceId = targets[contact.id] || AGENCY_WORKSPACE;
    setBusyId(contact.id);
    try {
      const accountId = workspaceAccountId(workspaceId);
      const stages = await ensureDefaultStages(accountId);
      const first = [...stages].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
      await base44.entities.Contact.update(contact.id, {
        account_id: accountId,
        stage_id: first?.id || "",
        tags: (contact.tags || []).filter((t) => String(t).toLowerCase() !== UNROUTED_TAG.toLowerCase()),
        activity: [...(contact.activity || []), `Besorolatlan lead hozzárendelve: ${workspaceLabel(workspaceId, accounts)}`].slice(-100),
      });
      onAssigned && onAssigned();
    } catch (e) {
      alert(e.message);
    } finally { setBusyId(""); }
  };

  if (contacts.length === 0) {
    return (
      <EmptyState icon={Inbox} title="Nincs besorolatlan lead"
        description="Minden beérkező Meta lead olyan hirdetési fiókhoz tartozik, amely már be van kötve egy workspace-hez." />
    );
  }

  return (
    <div className="space-y-3">
      {contacts.map((contact) => (
        <div key={contact.id} className="rounded-2xl border border-amber-300/60 bg-amber-50/50 p-4 dark:border-amber-500/30 dark:bg-amber-500/5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-heading text-sm font-semibold">{contact.name}</span>
                <span className="rounded-md bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-300">{UNROUTED_TAG}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {[contact.company, contact.phone, contact.email].filter(Boolean).join(" · ") || "Nincs elérhetőség"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Beérkezett: {formatDateTime(contact.created_date)}</p>
            </div>
            <div className="flex items-end gap-2">
              <ResponsiveSelect className="w-48" value={targets[contact.id] || AGENCY_WORKSPACE}
                onValueChange={(v) => setTargets({ ...targets, [contact.id]: v })}
                options={workspaceOptions(accounts)} placeholder="Workspace" />
              <Button size="sm" onClick={() => assign(contact)} disabled={busyId === contact.id} className="gradient-brand text-white">
                {busyId === contact.id ? "Hozzárendelés…" : "Hozzárendelés"}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}