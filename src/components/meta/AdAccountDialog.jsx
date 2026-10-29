import React, { useEffect, useState } from "react";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import Modal from "@/components/Modal";
import ResponsiveSelect from "@/components/ResponsiveSelect";
import { AGENCY_WORKSPACE, workspaceOptions } from "@/lib/meta";

const EMPTY = {
  workspace_id: AGENCY_WORKSPACE, ad_account_id: "", ad_account_name: "",
  page_id: "", page_name: "", status: "active", note: "",
};

// Új hirdetési fiók bekötése: workspace kiválasztása, majd a Meta fiók/Oldal
// kijelölése. Ha az OAuth kapcsolat még nincs meg, az azonosítók kézzel is megadhatók.
export default function AdAccountDialog({ open, onClose, mapping, accounts, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [assets, setAssets] = useState(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setForm(mapping ? { ...EMPTY, ...mapping } : EMPTY); setAssets(null); }
  }, [open, mapping]);

  const loadAssets = async () => {
    setLoadingAssets(true);
    try {
      const res = await base44.functions.invoke("crmMetaAdAccounts", {});
      setAssets(res.data);
    } catch (e) {
      setAssets({ connected: false, error: e.message });
    } finally { setLoadingAssets(false); }
  };

  const pickAccount = (value) => {
    const item = (assets?.ad_accounts || []).find((a) => a.ad_account_id === value);
    setForm({ ...form, ad_account_id: value, ad_account_name: item?.ad_account_name || form.ad_account_name });
  };

  const pickPage = (value) => {
    const item = (assets?.pages || []).find((p) => p.page_id === value);
    setForm({ ...form, page_id: value, page_name: item?.page_name || form.page_name });
  };

  const save = async () => {
    if (!form.ad_account_id.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        workspace_id: form.workspace_id || AGENCY_WORKSPACE,
        ad_account_id: form.ad_account_id.trim(),
        ad_account_name: form.ad_account_name.trim(),
        page_id: form.page_id.trim(),
        page_name: form.page_name.trim(),
      };
      if (mapping) await base44.entities.MetaAdAccountMapping.update(mapping.id, payload);
      else await base44.entities.MetaAdAccountMapping.create(payload);
      onClose();
      onSaved && onSaved();
    } catch (e) {
      alert(e.message);
    } finally { setSaving(false); }
  };

  const accountOptions = (assets?.ad_accounts || []).map((a) => ({
    value: a.ad_account_id,
    label: a.ad_account_name ? `${a.ad_account_name} (${a.ad_account_id})` : a.ad_account_id,
  }));
  const pageOptions = (assets?.pages || []).map((p) => ({
    value: p.page_id,
    label: p.page_name ? `${p.page_name} (${p.page_id})` : p.page_id,
  }));

  return (
    <Modal open={open} onClose={onClose} title={mapping ? "Hirdetési fiók szerkesztése" : "Új hirdetési fiók hozzáadása"} size="lg"
      description="A lead mindig abba a workspace-be kerül, amelyikhez az adott Meta hirdetési fiók itt be van kötve."
      footer={<>
        <Button variant="outline" onClick={onClose}>Mégse</Button>
        <Button onClick={save} disabled={saving || !form.ad_account_id.trim()} className="gradient-brand text-white">
          {saving ? "Mentés…" : "Mentés"}
        </Button>
      </>}>
      <div className="space-y-4">
        <div>
          <Label>Melyik workspace-hez tartozik? *</Label>
          <ResponsiveSelect className="mt-1.5" value={form.workspace_id} onValueChange={(v) => setForm({ ...form, workspace_id: v })}
            options={workspaceOptions(accounts)} placeholder="Válassz workspace-t" />
          <p className="mt-1 text-xs text-muted-foreground">
            A saját cég hirdetési fiókja is ide kerül, a saját (agency) workspace-re.
          </p>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Meta fiókok betöltése</div>
              <p className="text-xs text-muted-foreground">A hirdetési fiók és a Facebook oldal kiválasztása a Meta kapcsolaton keresztül.</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadAssets} disabled={loadingAssets}>
              {loadingAssets ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Betöltés
            </Button>
          </div>

          {assets && !assets.connected && (
            <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>A Meta kapcsolat még nincs engedélyezve{assets.error ? ` (${assets.error})` : ""}. Az azonosítókat kézzel is megadhatod.</span>
            </div>
          )}

          {assets?.connected && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Hirdetési fiók</Label>
                <Select value={form.ad_account_id} onValueChange={pickAccount}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Válassz hirdetési fiókot" /></SelectTrigger>
                  <SelectContent>
                    {accountOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Facebook oldal (Lead Ads)</Label>
                <Select value={form.page_id} onValueChange={pickPage}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Válassz oldalt" /></SelectTrigger>
                  <SelectContent>
                    {pageOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {pageOptions.length === 0 && <p className="mt-1 text-[11px] text-muted-foreground">Nincs oldal a kapcsolatban — add meg kézzel.</p>}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>Hirdetési fiók azonosító (act_…) *</Label><Input value={form.ad_account_id} onChange={(e) => setForm({ ...form, ad_account_id: e.target.value })} placeholder="act_1234567890" className="mt-1.5" /></div>
          <div><Label>Megjelenítési név</Label><Input value={form.ad_account_name} onChange={(e) => setForm({ ...form, ad_account_name: e.target.value })} placeholder="pl. KoromGumi - Meta Ads" className="mt-1.5" /></div>
          <div><Label>Facebook oldal azonosító</Label><Input value={form.page_id} onChange={(e) => setForm({ ...form, page_id: e.target.value })} placeholder="pl. 1029384756" className="mt-1.5" /></div>
          <div><Label>Állapot</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Aktív</SelectItem><SelectItem value="inactive">Inaktív</SelectItem></SelectContent>
            </Select>
          </div>
        </div>

        <div><Label>Megjegyzés</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1.5" /></div>
      </div>
    </Modal>
  );
}