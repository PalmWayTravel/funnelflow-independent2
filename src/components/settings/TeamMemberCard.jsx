import React from "react";
import { Clock } from "lucide-react";
import { Label } from "@/components/ui/label";
import ResponsiveSelect from "@/components/ResponsiveSelect";
import { formatDateTime } from "@/lib/format";

export default function TeamMemberCard({ member, accountOptions, roleLabel, onAssignAccount }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-heading font-semibold">{member.full_name || "—"}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{member.email}</div>
        </div>
        <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">
          {roleLabel}
        </span>
      </div>

      <div className="mt-4">
        <Label className="text-xs text-muted-foreground">Account</Label>
        <ResponsiveSelect
          value={member.account_id || "none"}
          onValueChange={(v) => onAssignAccount(member.id, v)}
          options={accountOptions}
          placeholder="Account választása"
          className="mt-1.5 h-11"
        />
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        Utolsó belépés: {member.last_login_at ? formatDateTime(member.last_login_at) : "—"}
      </div>
    </div>
  );
}