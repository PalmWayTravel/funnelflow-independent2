import React, { useEffect, useState } from "react";
import { Building2, Plus, Users, UserCheck, CalendarCheck, ShieldCheck, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import AccountDialog from "@/components/crm/AccountDialog";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Accounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, u, c, b] = await Promise.all([
        base44.entities.Account.list("-created_date", 200),
        base44.entities.User.list().catch(() => []),
        base44.entities.Contact.list("-created_date", 500),
        base44.entities.Booking.list("-start", 300),
      ]);
      setAccounts(a); setUsers(u); setContacts(c); setBookings(b);
    } catch (e) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const contactCount = (id) => contacts.filter((c) => c.account_id === id).length;
  const bookingCount = (id) => bookings.filter((b) => b.account_id === id).length;

  if (user?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Accountok" subtitle="Ügynökségi szintű kezelés" />
        <EmptyState icon={ShieldCheck} title="Admin jogosultság szükséges" description="Ez a felület csak adminisztrátorok számára érhető el." />
      </div>
    );
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;

  const active = accounts.filter((a) => a.status === "active").length;
  const assignedUsers = new Set(accounts.flatMap((a) => a.user_ids || [])).size;

  return (
    <div>
      <PageHeader title="Accountok" subtitle="Az ügynökség minden ügyfél-accountja egy helyen"
        action={<Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gradient-brand text-white"><Plus className="mr-1.5 h-4 w-4" /> Új account</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Building2} label="Accountok" value={formatNumber(accounts.length)} gradient="violet" />
        <StatCard icon={Building2} label="Aktív" value={formatNumber(active)} gradient="emerald" />
        <StatCard icon={Users} label="Hozzárendelt munkatárs" value={formatNumber(assignedUsers)} gradient="blue" />
        <StatCard icon={UserCheck} label="Kontakt összesen" value={formatNumber(contacts.length)} gradient="pink" to="/contacts" />
      </div>

      {accounts.length === 0 ? (
        <EmptyState icon={Building2} title="Még nincs account" description="Hozz létre ügyfél-accountokat, és rendeld hozzá a munkatársakat."
          action={<Button onClick={() => setDialogOpen(true)} className="gradient-brand text-white">Account létrehozása</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl gradient-brand-soft text-primary"><Building2 className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <h3 className="truncate font-heading font-semibold">{a.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">{a.industry || "—"} · {a.plan}</p>
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  a.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-400")}>
                  {a.status === "active" ? "aktív" : "inaktív"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/60 px-2 py-2">
                  <div className="text-lg font-bold font-heading">{formatNumber(contactCount(a.id))}</div>
                  <div className="text-[11px] text-muted-foreground">kontakt</div>
                </div>
                <div className="rounded-xl bg-muted/60 px-2 py-2">
                  <div className="text-lg font-bold font-heading">{formatNumber(bookingCount(a.id))}</div>
                  <div className="text-[11px] text-muted-foreground">foglalás</div>
                </div>
                <div className="rounded-xl bg-muted/60 px-2 py-2">
                  <div className="text-lg font-bold font-heading">{(a.user_ids || []).length}</div>
                  <div className="text-[11px] text-muted-foreground">munkatárs</div>
                </div>
              </div>

              {(a.user_ids || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {(a.user_ids || []).map((id) => {
                    const u = users.find((x) => x.id === id);
                    return <span key={id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{u?.full_name || u?.email || "ismeretlen"}</span>;
                  })}
                </div>
              )}

              {a.contact_email && <p className="mt-3 text-xs text-muted-foreground">{a.contact_email}</p>}

              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" asChild>
                  <Link to={`/accounts/${a.id}/view`}><Eye className="mr-1.5 h-4 w-4" /> Ügyfél nézet</Link>
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditing(a); setDialogOpen(true); }}>Szerkesztés</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AccountDialog open={dialogOpen} onClose={() => setDialogOpen(false)} account={editing} users={users} onSaved={load} />
    </div>
  );
}