import React from "react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";

export default function TeamMemberTable({ members, accountOptions, roleLabels, onAssignAccount }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <th className="px-4 py-3 font-semibold">Név</th>
            <th className="px-4 py-3 font-semibold">E-mail</th>
            <th className="px-4 py-3 font-semibold">Szerep</th>
            <th className="px-4 py-3 font-semibold">Account</th>
            <th className="px-4 py-3 font-semibold">Utolsó belépés</th>
          </tr>
        </thead>
        <tbody>
          {members.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 font-medium">{u.full_name || "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">
                  {roleLabels[u.role] || u.role || "Ügyfél"}
                </span>
              </td>
              <td className="px-4 py-3">
                <Select value={u.account_id || "none"} onValueChange={(v) => onAssignAccount(u.id, v)}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accountOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{u.last_login_at ? formatDateTime(u.last_login_at) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}