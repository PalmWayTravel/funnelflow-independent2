import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Users, UserPlus, CalendarCheck, KanbanSquare, Tag } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import ContactDialog from "@/components/crm/ContactDialog";
import { formatNumber, initials, timeAgo, isDateThisWeek } from "@/lib/format";
import { stageStyle } from "@/lib/crm";
import { cn } from "@/lib/utils";

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [stages, setStages] = useState([]);
  const [users, setUsers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, a, s, u, b] = await Promise.all([
        base44.entities.Contact.list("-created_date", 500),
        base44.entities.Account.list("-created_date", 100),
        base44.entities.PipelineStage.list("order", 50),
        base44.entities.User.list().catch(() => []),
        base44.entities.Booking.list("-start", 300).catch(() => []),
      ]);
      setContacts(c); setAccounts(a); setStages(s); setUsers(u); setBookings(b);
    } catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const allTags = useMemo(() => Array.from(new Set(contacts.flatMap((c) => c.tags || []))).sort(), [contacts]);
  const stageById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || "—";
  const ownerName = (id) => users.find((u) => u.id === id)?.full_name || "—";

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    if (q && !`${c.name} ${c.email} ${c.phone} ${c.company}`.toLowerCase().includes(q)) return false;
    if (accountFilter !== "all" && c.account_id !== accountFilter) return false;
    if (stageFilter !== "all" && c.stage_id !== stageFilter) return false;
    if (tagFilter !== "all" && !(c.tags || []).includes(tagFilter)) return false;
    return true;
  });

  const now = new Date();
  const newThisMonth = contacts.filter((c) => {
    const d = c.created_date ? new Date(c.created_date) : null;
    return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const withBooking = new Set(bookings.map((b) => b.contact_id)).size;
  const contactedThisWeek = contacts.filter((c) => isDateThisWeek(c.last_contacted_at)).length;

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (c) => { setEditing(c); setDialogOpen(true); };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  return (
    <div>
      <PageHeader title="Kontaktok" subtitle="Minden érdeklődő és ügyfél egy helyen, teljes aktivitás-idővonallal"
        action={<Button onClick={openNew} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Új kontakt</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="Összes kontakt" value={formatNumber(contacts.length)} gradient="violet" />
        <StatCard icon={UserPlus} label="Új ebben a hónapban" value={formatNumber(newThisMonth)} gradient="blue" />
        <StatCard icon={CalendarCheck} label="Foglalással rendelkező" value={formatNumber(withBooking)} gradient="emerald" to="/bookings" />
        <StatCard icon={Tag} label="Megkeresve ezen a héten" value={formatNumber(contactedThisWeek)} gradient="pink" />
      </div>

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés név, e-mail, cég szerint…" className="pl-9" />
        </div>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="lg:w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Minden account</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="lg:w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Minden fázis</SelectItem>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="lg:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Minden címke</SelectItem>{allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Link to="/pipeline" className="lg:ml-auto">
          <Button variant="outline"><KanbanSquare className="mr-1.5 h-4 w-4" /> Pipeline tábla</Button>
        </Link>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Nincs találat" description="Módosítsd a szűrőket, vagy hozz létre új kontaktot."
          action={<Button onClick={openNew} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Új kontakt</Button>} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card scrollbar-thin">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Kontakt</th>
                <th className="px-4 py-3 font-semibold">Elérhetőség</th>
                <th className="px-4 py-3 font-semibold">Fázis</th>
                <th className="px-4 py-3 font-semibold">Címkék</th>
                <th className="px-4 py-3 font-semibold">Account</th>
                <th className="px-4 py-3 font-semibold">Utolsó megkeresés</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const stage = stageById[c.stage_id];
                return (
                  <tr key={c.id} onClick={() => openEdit(c)} className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-brand text-xs font-bold text-white">{initials(c.name)}</div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{c.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{c.company || c.industry || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="truncate">{c.email || "—"}</div>
                      <div className="truncate text-xs">{c.phone || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      {stage ? (
                        <span className="inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold" style={stageStyle(stage)}>{stage.name}</span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags || []).slice(0, 3).map((t) => (
                          <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t}</span>
                        ))}
                        {(c.tags || []).length > 3 && <span className="text-[11px] text-muted-foreground">+{(c.tags || []).length - 3}</span>}
                        {(c.tags || []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{accountName(c.account_id)}</td>
                    <td className="px-4 py-3">
                      <div className="text-muted-foreground">{c.last_contacted_at ? timeAgo(c.last_contacted_at) : "Még nem"}</div>
                      {c.owner_id && <div className={cn("text-xs text-muted-foreground")}>{ownerName(c.owner_id)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ContactDialog open={dialogOpen} onClose={() => setDialogOpen(false)} contact={editing}
        accounts={accounts} stages={stages} users={users} onSaved={load} />
    </div>
  );
}