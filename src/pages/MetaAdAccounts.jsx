import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Facebook, Plus, ShieldCheck, TriangleAlert, Link2, Inbox, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import AdAccountDialog from "@/components/meta/AdAccountDialog";
import AdAccountCard from "@/components/meta/AdAccountCard";
import UnroutedLeads from "@/components/meta/UnroutedLeads";
import ClientMetaRequests from "@/components/meta/ClientMetaRequests";
import MetaPartnerSettings from "@/components/meta/MetaPartnerSettings";
import { formatNumber } from "@/lib/format";
import { UNROUTED_TAG } from "@/lib/meta";

// Admin felület: minden ügyfél Meta hirdetési fiókja egy helyen, workspace-hez kötve.
export default function MetaAdAccounts() {
  const { user } = useAuth();
  const [mappings, setMappings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [unrouted, setUnrouted] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [m, a, u, requestPage] = await Promise.all([
        base44.entities.MetaAdAccountMapping.list("-created_date", 200),
        base44.entities.Account.list("-created_date", 200),
        base44.entities.Contact.filter({ tags: UNROUTED_TAG }, "-created_date", 100),
        base44.entities.ClientOnboarding.filter(
          { status: "completed", meta_status: { $in: ["pending_review", "help_requested"] } },
          { sort: "-updated_date", limit: 100 }
        ),
      ]);
      setMappings(m); setAccounts(a); setUnrouted(u); setRequests(requestPage?.items || []);
    } catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggleStatus = async (mapping) => {
    await base44.entities.MetaAdAccountMapping.update(mapping.id, { status: mapping.status === "active" ? "inactive" : "active" });
    load();
  };

  const remove = async (mapping) => {
    await base44.entities.MetaAdAccountMapping.delete(mapping.id);
    load();
  };

  if (user?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Meta hirdetési fiókok" subtitle="Ügynökségi szintű kezelés" />
        <EmptyState icon={ShieldCheck} title="Admin jogosultság szükséges" description="A hirdetési fiókok és a workspace-hozzárendelés csak adminisztrátorok számára érhető el." />
      </div>
    );
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  const activeCount = mappings.filter((m) => m.status === "active").length;

  return (
    <div>
      <PageHeader title="Meta hirdetési fiókok" subtitle="Melyik Meta hirdetési fiók melyik ügyfél workspace-ébe routolja a leadeket"
        action={<Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Új hirdetési fiók</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Facebook} label="Bekötött fiókok" value={formatNumber(mappings.length)} gradient="violet" />
        <StatCard icon={Link2} label="Aktív kapcsolat" value={formatNumber(activeCount)} gradient="emerald" />
        <StatCard icon={Inbox} label="Besorolatlan lead" value={formatNumber(unrouted.length)} gradient={unrouted.length > 0 ? "pink" : "blue"} />
        <StatCard icon={ShieldCheck} label="Workspace" value={formatNumber(accounts.length + 1)} gradient="blue" />
      </div>

      {unrouted.length > 0 && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold">{formatNumber(unrouted.length)} lead vár hozzárendelésre</div>
            <p className="mt-0.5 text-xs">
              Ezek olyan hirdetési fiókból érkeztek, amely még nincs egyetlen workspace-hez sem bekötve. Rendeld hozzá őket lent,
              vagy vedd fel a hiányzó hirdetési fiókot a mapping listába.
            </p>
          </div>
        </div>
      )}

      {mappings.length === 0 ? (
        <EmptyState icon={Facebook} title="Még nincs bekötött hirdetési fiók"
          description="Add hozzá az első Meta hirdetési fiókot, és kösd a megfelelő ügyfél workspace-hez."
          action={<Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gradient-brand text-white">Hirdetési fiók hozzáadása</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {mappings.map((m) => (
            <AdAccountCard key={m.id} mapping={m} accounts={accounts}
              onEdit={() => { setEditing(m); setDialogOpen(true); }}
              onToggleStatus={() => toggleStatus(m)}
              onDelete={() => remove(m)} />
          ))}
        </div>
      )}

      <div className="mt-8">
        <h2 className="font-heading text-lg font-bold tracking-tight">
          Beérkező ügyfél Meta összekötések {requests.length > 0 && <span className="text-primary">({requests.length})</span>}
        </h2>
        <p className="mb-3 mt-0.5 text-sm text-muted-foreground">
          Ezeket az adatokat az ügyfelek az első belépéses onboarding során küldték be. Az „Összekötés” gombbal egyből
          bekerül a hirdetési fiók a mapping listába, és a leadek ettől kezdve a saját workspace-ükbe routolódnak.
        </p>
        <ClientMetaRequests requests={requests} accounts={accounts} mappings={mappings} onDone={load} />
      </div>

      <div className="mt-8">
        <h2 className="font-heading text-lg font-bold tracking-tight">Besorolatlan leadek</h2>
        <p className="mb-3 mt-0.5 text-sm text-muted-foreground">
          A rendszer ide gyűjti azokat a Meta leadeket, amelyek hirdetési fiókja nincs mappingben — így egy lead sem vész el.
        </p>
        <UnroutedLeads contacts={unrouted} accounts={accounts} onAssigned={load} />
      </div>

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold tracking-tight">Onboarding beállítás</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Az új ügyfelek első belépésénél ez az azonosító jelenik meg „partner azonosítónk"-ként, ezzel adnak
              hozzáférést a hirdetési fiókjukhoz.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/onboarding?preview=1">
              <Eye className="mr-1.5 h-4 w-4" /> Folyamat előnézete
            </Link>
          </Button>
        </div>
        <MetaPartnerSettings />
      </div>

      <AdAccountDialog open={dialogOpen} onClose={() => setDialogOpen(false)} mapping={editing} accounts={accounts} onSaved={load} />
    </div>
  );
}