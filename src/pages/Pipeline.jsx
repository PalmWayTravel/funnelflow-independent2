import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { ArrowUpDown, Building2, KanbanSquare, Plus, Search, Settings2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PullToRefresh from "@/components/PullToRefresh";
import EmptyState from "@/components/EmptyState";
import ContactDialog from "@/components/crm/ContactDialog";
import StageManager from "@/components/crm/StageManager";
import PipelineColumn from "@/components/crm/PipelineColumn";
import { ensureDefaultStages, triggerAutomations } from "@/lib/crm";
import { formatNumber } from "@/lib/format";

// Az "Elveszett" címkét viselő kapcsolatok az oszlop összecsukható gyűjtőjébe kerülnek.
const LOST_TAG = /elveszett|lost/i;
const isLost = (c) => (c.tags || []).some((t) => LOST_TAG.test(String(t)));
const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A cég egyetlen közös pipeline-ja: minden admin ugyanezt a táblát látja.
// Ide futnak be a leadek (Meta, űrlap, foglalás), a fázisváltás pedig automatizációkat indíthat.
export default function Pipeline() {
  const [contacts, setContacts] = useState([]);
  const [stages, setStages] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [managerOpen, setManagerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);

  // Gépelés közben nem indul kérés minden leütésre.
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // A keresés a szerveren fut, így mindig a találatok kerülnek a táblára.
  const query = useMemo(() => {
    if (!term) return {};
    const rx = { $regex: escapeRegex(term), $options: "i" };
    return { $or: [{ name: rx }, { company: rx }, { email: rx }, { phone: rx }] };
  }, [term]);

  // silent=true: háttérben frissítünk, így a tábla nem villan el minden mentésnél.
  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const [page, a, u, count] = await Promise.all([
        base44.entities.Contact.filter(query, { sort: newestFirst ? "-created_date" : "created_date", limit: 500 }),
        base44.entities.Account.list("-created_date", 100),
        base44.entities.User.list().catch(() => []),
        base44.entities.Contact.count(query),
      ]);
      setContacts(page.items || []);
      setAccounts(a); setUsers(u); setTotal(count);
      setStages(await ensureDefaultStages(""));
    } catch (e) {} finally { setLoading(false); }
  }, [query, newestFirst]);
  useEffect(() => { load(); }, [load]);

  const sortedStages = useMemo(() => [...stages].sort((a, b) => (a.order || 0) - (b.order || 0)), [stages]);
  const stageIds = useMemo(() => new Set(sortedStages.map((s) => s.id)), [sortedStages]);
  // Ami nem a közös fáziskészletben van (pl. egy ügyfél saját fázisa), a "Nincs fázis" oszlopba kerül, így nem tűnik el.
  const unassigned = contacts.filter((c) => !c.stage_id || !stageIds.has(c.stage_id));

  const contactCounts = useMemo(() => {
    const map = {};
    contacts.forEach((c) => { if (c.stage_id) map[c.stage_id] = (map[c.stage_id] || 0) + 1; });
    return map;
  }, [contacts]);

  const accountName = (accountId) => accounts.find((a) => a.id === accountId)?.name || "";

  // A kártya azonnal átkerül a cél oszlopba, és visszaáll, ha a mentés nem sikerül.
  const applyStage = useCallback(async (contact, stage) => {
    if (!contact || !stage || contact.stage_id === stage.id) return;
    const activity = [...(contact.activity || []), `Fázis módosítva: ${stage.name}`];
    const previous = contacts;
    setContacts((list) => list.map((c) => (c.id === contact.id ? { ...c, stage_id: stage.id, activity } : c)));
    try {
      await base44.entities.Contact.update(contact.id, { stage_id: stage.id, activity });
      await triggerAutomations("stage_changed", contact.id, { stage_id: stage.id });
      load(true);
    } catch (e) {
      setContacts(previous);
      alert(e.message);
    }
  }, [contacts, load]);

  const onDragEnd = (result) => {
    if (!result.destination) return;
    applyStage(contacts.find((c) => c.id === result.draggableId), sortedStages[Number(result.destination.droppableId)]);
  };

  // A kártya nyilakkal is léptethető egy fázissal előre vagy hátra.
  const moveByArrow = (contact, direction) => {
    const idx = sortedStages.findIndex((s) => s.id === contact.stage_id);
    applyStage(contact, sortedStages[idx + direction]);
  };

  const openContact = (contact) => { setEditing(contact); setDialogOpen(true); };
  const openNew = () => { setEditing(null); setDialogOpen(true); };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  return (
    <PullToRefresh onRefresh={load}>
      <div className="mb-5 flex items-center gap-3">
        <div className="gradient-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-card">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-bold tracking-tight">
            LegTech Zrt. <span className="font-semibold text-muted-foreground">— Saját sales</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Belső marketing CRM. A lead beérkezéséről a fiók létrehozásáig, egy helyen.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <span className="shrink-0 text-sm font-semibold">
          {formatNumber(total)} kapcsolat · {formatNumber(sortedStages.length)} szakasz
        </span>
        <div className="relative lg:ml-3 lg:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Keresés: név, cég, e-mail, telefon" className="pl-8" />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <Button variant="outline" onClick={() => setNewestFirst((v) => !v)}>
            <ArrowUpDown className="mr-1.5 h-4 w-4" /> {newestFirst ? "Legújabb elől" : "Legrégebbi elől"}
          </Button>
          <Button variant="outline" onClick={() => setManagerOpen(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" /> Új szakasz
          </Button>
          <Button onClick={openNew} className="gradient-brand text-white">
            <Plus className="mr-1.5 h-4 w-4" /> Új kapcsolat
          </Button>
        </div>
      </div>

      {sortedStages.length === 0 ? (
        <EmptyState icon={KanbanSquare} title="Nincs pipeline fázis" description="Hozz létre fázisokat az értékesítési folyamatodhoz."
          action={<Button onClick={() => setManagerOpen(true)} className="gradient-brand text-white">Fázisok létrehozása</Button>} />
      ) : (
        <div className="overflow-x-auto pb-4 scrollbar-thin">
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex items-start gap-3" style={{ minWidth: "max-content" }}>
              {sortedStages.map((stage, idx) => {
                const columnItems = contacts.filter((c) => c.stage_id === stage.id);
                return (
                  <PipelineColumn key={stage.id} name={stage.name} emoji={stage.emoji} color={stage.color}
                    items={columnItems.filter((c) => !isLost(c))} lostItems={columnItems.filter(isLost)}
                    droppableId={String(idx)} stageIndex={idx} stageTotal={sortedStages.length}
                    onOpenContact={openContact} onMoveContact={moveByArrow} onOpenStage={() => setManagerOpen(true)}
                    accountNameOf={accountName} />
                );
              })}
              {unassigned.length > 0 && (
                <PipelineColumn name="Nincs fázis" color="#94A3B8"
                  items={unassigned.filter((c) => !isLost(c))} lostItems={unassigned.filter(isLost)}
                  droppableId={null} stageIndex={-1} stageTotal={sortedStages.length}
                  onOpenContact={openContact} onMoveContact={moveByArrow} accountNameOf={accountName} />
              )}
            </div>
          </DragDropContext>
        </div>
      )}

      <StageManager open={managerOpen} onClose={() => setManagerOpen(false)} accountId=""
        stages={stages} contactCounts={contactCounts} onChanged={() => load(true)} />
      <ContactDialog open={dialogOpen} onClose={() => setDialogOpen(false)} contact={editing}
        accounts={accounts} stages={sortedStages} users={users} onSaved={load} defaultAccountId="" />
    </PullToRefresh>
  );
}