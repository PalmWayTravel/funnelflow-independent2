import React from "react";
import TeamMemberCard from "@/components/settings/TeamMemberCard";
import TeamMemberTable from "@/components/settings/TeamMemberTable";

export default function TeamMemberList({ members, accounts, roleLabels, onAssignAccount }) {
  const accountOptions = [
    { value: "none", label: "Nincs hozzárendelve" },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  if (members.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Még nincs csapattag ebben a munkaterületen.
      </p>
    );
  }

  return (
    <>
      {/* Phones: one card per member, easy to read and tap */}
      <div className="space-y-3 sm:hidden">
        {members.map((u) => (
          <TeamMemberCard
            key={u.id}
            member={u}
            accountOptions={accountOptions}
            roleLabel={roleLabels[u.role] || u.role || "Ügyfél"}
            onAssignAccount={onAssignAccount}
          />
        ))}
      </div>

      {/* Tablets and desktop: compact table */}
      <div className="hidden sm:block">
        <TeamMemberTable
          members={members}
          accountOptions={accountOptions}
          roleLabels={roleLabels}
          onAssignAccount={onAssignAccount}
        />
      </div>
    </>
  );
}