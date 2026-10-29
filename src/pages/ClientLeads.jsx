import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KanbanSquare, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAccountScope } from "@/lib/accountScope";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { timeAgo } from "@/lib/format";
import { ensureDefaultStages, triggerAutomations } from "@/lib/crm";

const SOURCE_LABELS = { "Meta Ads": "Meta Ads", Website: "Weboldal", Referral: "Ajánlás", Form: "Űrlap", Foglalás: "Foglalás", Egyéb: "Egyéb", Other: "Egyéb" };

// Az ügyfél a közös pipeline-ból látja a saját accountjához tartozó leadeket.
export default function ClientLeads() {
  const { accountId } = useAccountScope();
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await base44.entities.Contact.filter({ account_id: accountId }, "-created_date", 500);
      setLeads(rows);
      // A fázisok külön kérésből jönnek, hogy egy esetleges hiba ne blankolja a lead listát.
      const stageRows = await ensureDefaultStages(accountId).catch(() => []);
      setStages([...stageRows].sort((a, b) => (a.order || 0) - (b.order || 0)));
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  const changeStage = async (lead, stageId) => {
    if (!stageId || stageId === lead.stage_id) return;
    setSavingId(lead.id);
    const stageName = stages.find((s) => s.id === stageId)?.name || "";
    try {
      await base44.entities.Contact.update(lead.id, {
        stage_id: stageId,
        activity: [...(lead.activity || []), `Fázis módosítva: ${stageName}`].slice(-100),
      });
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage_id: stageId } : l)));
      await triggerAutomations("stage_changed", lead.id, { stage_id: stageId });
    } catch (e) {
      alert(e.message);
    } finally {
      setSavingId("");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.name, l.email, l.phone, l.company].some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [leads, search]);

  const finalIds = new Set(stages.filter((s) => s.is_final).map((s) => s.id));
  const openCount = leads.filter((l) => l.stage_id && !finalIds.has(l.stage_id)).length;
  const closedCount = leads.filter((l) => finalIds.has(l.stage_id)).length;
  const noStageCount = leads.filter((l) => !stages.some((s) => s.id === l.stage_id)).length;

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;
  }

  return (
    <div>
      <PageHeader title="Lead tábla" subtitle="A saját accountodhoz tartozó leadek — a fázist itt tudod állítani" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={KanbanSquare} label="Összes lead" value={leads.length} gradient="violet" />
        <StatCard icon={KanbanSquare} label="Nyitott" value={openCount} gradient="blue" />
        <StatCard icon={KanbanSquare} label="Lezárt" value={closedCount} gradient="emerald" />
        <StatCard icon={KanbanSquare} label="Nincs fázis" value={noStageCount} gradient="pink" />
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Lead-ek keresése…" className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title={leads.length === 0 ? "Még nincs lead" : "Nincs találat"}
          description={leads.length === 0 ? "Az accountodhoz még nem rögzítettek leadet." : "Próbálj más keresést."}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Lead</th>
                <th className="px-4 py-3 font-semibold">Elérhetőség</th>
                <th className="px-4 py-3 font-semibold">Forrás</th>
                <th className="px-4 py-3 font-semibold">Fázis</th>
                <th className="px-4 py-3 font-semibold">Frissítve</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{l.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{[l.email, l.phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{SOURCE_LABELS[l.source] || l.source || "—"}</td>
                  <td className="px-4 py-3">
                    <Select value={l.stage_id || ""} onValueChange={(v) => changeStage(l, v)} disabled={savingId === l.id}>
                      <SelectTrigger className="h-8 w-[172px] text-xs"><SelectValue placeholder="Nincs fázis" /></SelectTrigger>
                      <SelectContent>
                        {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{timeAgo(l.updated_date || l.created_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}