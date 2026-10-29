import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { newToken, sendEmail } from '../../shared/crm.ts';

const AGENCY_WORKSPACE = 'agency';
const UNROUTED_TAG = 'Besorolatlan';

function clean(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function asConsent(value) {
  if (value === true) return true;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  return ['true', '1', 'igen', 'yes', 'on'].includes(normalized);
}

// Az "act_1234567890" és a "1234567890" ugyanazt a hirdetési fiókot jelöli.
function normalizeAdAccountId(value) {
  const raw = clean(value, 60).toLowerCase();
  if (!raw) return '';
  return raw.startsWith('act_') ? raw : `act_${raw}`;
}

function workspaceAccountId(workspaceId) {
  if (!workspaceId || workspaceId === AGENCY_WORKSPACE) return '';
  return workspaceId;
}

function mergeTags(tags, extra) {
  const list = Array.isArray(tags) ? [...tags] : [];
  extra.forEach((tag) => { if (tag && !list.includes(tag)) list.push(tag); });
  return list;
}

// A Meta webhook lapos mezőkkel vagy az entry/changes szerkezettel is küldheti az adatokat.
function readMetaRefs(body) {
  const value = (body && body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value) || {};
  const adAccount = body.ad_account_id || body.adAccountId || body.adaccount_id || value.ad_account_id || value.adAccountId || '';
  const page = body.page_id || body.pageId || value.page_id || value.pageId || '';
  return { adAccountId: normalizeAdAccountId(adAccount), pageId: clean(page, 60) };
}

// A lead ahhoz a workspace-hez tartozik, amelyikhez a hirdetési fiók (vagy oldal) be van kötve.
async function findMapping(base44, refs) {
  if (!refs.adAccountId && !refs.pageId) return null;
  const rows = await base44.asServiceRole.entities.MetaAdAccountMapping.filter({ status: 'active' }).catch(() => []);
  return rows.find((row) => (
    (refs.adAccountId && normalizeAdAccountId(row.ad_account_id) === refs.adAccountId) ||
    (refs.pageId && row.page_id && String(row.page_id) === refs.pageId)
  )) || null;
}

async function firstStageId(base44, accountId) {
  const stages = await base44.asServiceRole.entities.PipelineStage
    .filter({ account_id: accountId }, 'order', 1)
    .catch(() => []);
  return stages[0] ? stages[0].id : '';
}

// A workspace saját felhasználói kapnak értesítést az új leadről.
async function notifyWorkspace(base44, accountId, contact, mapping) {
  const users = await base44.asServiceRole.entities.User.list().catch(() => []);
  const members = users.filter((u) => (u.account_id || '') === (accountId || '')).slice(0, 5);
  if (!members.length) return;
  const subject = `Új Meta lead: ${contact.name}`;
  const body = [
    `Új lead érkezett Meta hirdetésből (${mapping.ad_account_name || mapping.ad_account_id}).`,
    '',
    `Név: ${contact.name}`,
    contact.phone ? `Telefon: ${contact.phone}` : '',
    contact.email ? `E-mail: ${contact.email}` : '',
    contact.company ? `Cég: ${contact.company}` : '',
    '',
    'A lead a pipeline első fázisába került.',
  ].filter(Boolean).join('\n');
  for (const member of members) {
    if (member.email) await sendEmail(base44, { to: member.email, subject, body });
  }
}

// Public webhook: Meta Lead Ads forms post their leads here (token-authenticated).
// A leadet a hirdetési fiókhoz kötött workspace-be routolja; mapping nélkül a
// "Besorolatlan leadek" gyűjtőbe kerül, hogy ne vesszen el.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = clean(body.token, 80);
    if (!token) return Response.json({ error: 'Hiányzó token' }, { status: 400 });

    const integrations = await base44.asServiceRole.entities.Integration
      .filter({ provider: 'meta_lead_ads', status: 'connected' })
      .catch(() => []);
    const integration = integrations.find((item) => item.token && item.token === token);
    if (!integration) return Response.json({ error: 'Érvénytelen vagy inaktív token' }, { status: 401 });

    const refs = readMetaRefs(body);
    const hasRoutingRef = !!(refs.adAccountId || refs.pageId);
    const mapping = hasRoutingRef ? await findMapping(base44, refs) : null;
    const unrouted = hasRoutingRef && !mapping;
    // Mapping nélküli hirdetési fiók: a lead az ügynökségi (admin) nézetben, fázis nélkül vár hozzárendelésre.
    const accountId = hasRoutingRef ? workspaceAccountId(mapping && mapping.workspace_id) : (integration.account_id || '');
    const stageId = unrouted ? '' : await firstStageId(base44, accountId);

    const name = clean(body.name || body.full_name, 120) || 'Meta lead';
    const email = clean(body.email, 160);
    const phone = clean(body.phone, 60);
    const company = clean(body.company, 160);
    const consent = asConsent(body.marketing_consent);

    const routingLine = mapping
      ? `Meta hirdetési fiók: ${refs.adAccountId || refs.pageId} → ${mapping.ad_account_name || mapping.workspace_id}`
      : unrouted
        ? `Besorolatlan lead — nincs workspace mapping ehhez: ${refs.adAccountId || refs.pageId}`
        : '';
    const consentLine = `Meta lead — marketing hozzájárulás: ${consent ? 'igen' : 'nem'}`;
    const newLines = [consentLine, routingLine].filter(Boolean);

    let existing = null;
    if (email) {
      const found = await base44.asServiceRole.entities.Contact.filter({ email }).catch(() => []);
      existing = found[0] || null;
    }

    let contact;
    if (existing) {
      contact = await base44.asServiceRole.entities.Contact.update(existing.id, {
        account_id: existing.account_id || accountId,
        phone: phone || existing.phone,
        company: company || existing.company,
        marketing_consent: existing.marketing_consent === true || consent,
        activity: [...(existing.activity || []), ...newLines].slice(-100),
      });
    } else {
      contact = await base44.asServiceRole.entities.Contact.create({
        account_id: accountId, name, email, phone, company, source: 'Meta Ads',
        stage_id: stageId,
        tags: unrouted ? ['meta', UNROUTED_TAG] : ['meta'],
        marketing_consent: consent, unsubscribed: false,
        unsubscribe_token: newToken(),
        activity: ['Kontakt létrehozva Meta leadből', ...newLines],
      });
    }

    await base44.asServiceRole.entities.Integration.update(integration.id, { last_synced_at: new Date().toISOString() }).catch(() => null);

    if (mapping) {
      await base44.asServiceRole.entities.MetaAdAccountMapping
        .update(mapping.id, { last_lead_at: new Date().toISOString() })
        .catch(() => null);
      await base44.asServiceRole.entities.ActivityLog.create({
        message: `Meta lead érkezett (${mapping.ad_account_name || refs.adAccountId}): ${name}`,
        type: 'meta', entity_type: 'Contact', entity_id: contact.id, read: false,
      }).catch(() => null);
      await notifyWorkspace(base44, accountId, contact, mapping);
    } else if (unrouted) {
      // Admin jelzés: a lead megmarad, de kézi hozzárendelésre vár.
      await base44.asServiceRole.entities.ActivityLog.create({
        message: `Besorolatlan Meta lead: ${name} — a(z) ${refs.adAccountId || refs.pageId} hirdetési fiókhoz nincs workspace mapping.`,
        type: 'meta_unrouted', entity_type: 'Contact', entity_id: contact.id, read: false,
      }).catch(() => null);
    } else {
      await base44.asServiceRole.entities.ActivityLog.create({
        message: `Meta lead érkezett: ${name}`,
        type: 'meta', entity_type: 'Contact', entity_id: contact.id, read: false,
      }).catch(() => null);
    }

    await base44.functions.invoke('crmAutomationEngine', {
      action: 'trigger', event: 'contact_created', contact_id: contact.id, payload: {},
    }).catch(() => null);

    // Webhook acknowledgement only — no stored record data goes back to the caller.
    return Response.json({ ok: true, routed: !!mapping });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}