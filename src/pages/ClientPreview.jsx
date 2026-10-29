import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { AccountScopeProvider } from "@/lib/accountScope";
import ClientDashboard from "@/pages/ClientDashboard";
import ClientLeads from "@/pages/ClientLeads";
import Calendar from "@/pages/Calendar";
import Reports from "@/pages/Reports";

export default function ClientPreview() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const acc = await base44.entities.Account.get(id).catch(() => null);
      if (active) { setAccount(acc); setLoading(false); }
    })();
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" /></div>;
  }

  if (!account) {
    return (
      <div>
        <PageHeader title="Ügyfél nézet" subtitle="Account megtekintése" />
        <EmptyState icon={Building2} title="Az account nem található" description="Lehet, hogy törölték."
          action={<Button asChild variant="outline"><Link to="/accounts"><ArrowLeft className="mr-1.5 h-4 w-4" /> Vissza az accountokhoz</Link></Button>} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={account.name} subtitle="Ügyfél nézet"
        action={<Button asChild variant="outline"><Link to="/accounts"><ArrowLeft className="mr-1.5 h-4 w-4" /> Accountok</Link></Button>} />

      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl gradient-brand-soft text-primary"><Eye className="h-4 w-4" /></div>
        <p className="text-xs text-muted-foreground">
          Pontosan ez a nézet jelenik meg a(z) {account.name} ügyfélnél: minden adat erre az accountra szűrve, az admin felületek nélkül.
          {account.status !== "active" && " Az account jelenleg inaktív."}
        </p>
      </div>

      <AccountScopeProvider accountId={account.id}>
        <Tabs defaultValue="dashboard">
          <div className="mb-4 overflow-x-auto pb-1 scrollbar-thin">
            <TabsList className="w-max">
              <TabsTrigger value="dashboard">Vezérlőpult</TabsTrigger>
              <TabsTrigger value="leads">CRM – lead tábla</TabsTrigger>
              <TabsTrigger value="calendar">Naptár</TabsTrigger>
              <TabsTrigger value="reports">Riport</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="dashboard" className="mt-0"><ClientDashboard /></TabsContent>
          <TabsContent value="leads" className="mt-0"><ClientLeads /></TabsContent>
          <TabsContent value="calendar" className="mt-0"><Calendar /></TabsContent>
          <TabsContent value="reports" className="mt-0"><Reports /></TabsContent>
        </Tabs>
      </AccountScopeProvider>
    </div>
  );
}