// Base44 szerver-SDK kompatibilitási réteg Supabase Edge Functions alá.
// A háttérfüggvények ugyanúgy hívják (createClientFromRequest, asServiceRole.entities,
// auth.me, secrets.get ...), de a hívások Supabase-re, Resendre és a saját OAuth
// kulcsainkra mennek.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export const secrets = {
  get: (name: string): string => Deno.env.get(name) ?? '',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Deno.serve burkoló: CORS + OPTIONS; a handler egy Request -> Response függvény.
export function serve(handler: (req: Request) => Promise<Response> | Response) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    let res: Response;
    try {
      res = await handler(req);
    } catch (e) {
      res = Response.json({ error: (e as Error).message || 'Szerverhiba' }, { status: 500 });
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  });
}

const rpc = (db: any, fn: string, args: Record<string, unknown>) =>
  db.rpc(fn, args).then(({ data, error }: any) => {
    if (error) throw Object.assign(new Error(error.message), { status: error.code === '42501' ? 403 : 400, data: error });
    return data;
  });

function entityApi(db: any, name: string) {
  const find = (filter: any, sort?: string | null, limit?: number, skip?: number) =>
    rpc(db, 'entity_find', { p_entity: name, p_filter: filter || {}, p_sort: sort || null, p_limit: limit ?? 50, p_skip: skip ?? 0 });
  return {
    list: (sort?: string, limit?: number, skip?: number) => find({}, sort, limit, skip),
    filter: (query?: any, sort?: string, limit?: number, skip?: number) => find(query, sort, limit, skip),
    get: (id: string) => rpc(db, 'entity_get', { p_entity: name, p_id: String(id) }),
    create: (data: any) => rpc(db, 'entity_create', { p_entity: name, p_data: data || {} }),
    bulkCreate: async (rows: any[]) => {
      const out = [];
      for (const r of rows || []) out.push(await rpc(db, 'entity_create', { p_entity: name, p_data: r }));
      return out;
    },
    update: (id: string, patch: any) => rpc(db, 'entity_update', { p_entity: name, p_id: String(id), p_patch: patch || {} }),
    updateMany: (query: any, patch: any) => rpc(db, 'entity_update_many', { p_entity: name, p_filter: query || {}, p_patch: patch || {} }),
    delete: (id: string) => rpc(db, 'entity_delete', { p_entity: name, p_id: String(id) }),
    deleteMany: (query: any) => rpc(db, 'entity_delete_many', { p_entity: name, p_filter: query || {} }),
    count: (query?: any) => rpc(db, 'entity_count', { p_entity: name, p_filter: query || {} }).then(Number),
    aggregate: ({ query, groupBy, sum, limit }: any = {}) =>
      rpc(db, 'entity_aggregate', { p_entity: name, p_filter: query || {}, p_group_by: groupBy || null, p_sum: sum || [], p_limit: limit ?? 100 }),
  };
}

const PROFILE_FIELDS = 'id,email,full_name,role,account_id,avatar_color,created_date,updated_date';
const normProfile = (r: any) => r && { ...r, account_id: r.account_id || '' };

function userApi(db: any) {
  return {
    list: async (sort?: string) => {
      const desc = typeof sort === 'string' && sort.startsWith('-');
      const col = typeof sort === 'string' && sort.replace(/^-/, '') === 'created_date' ? 'created_date' : 'full_name';
      const { data, error } = await db.from('profiles').select(PROFILE_FIELDS).order(col, { ascending: !desc }).limit(1000);
      if (error) throw new Error(error.message);
      return data.map(normProfile);
    },
    filter: async (query: Record<string, unknown> = {}) => {
      let q = db.from('profiles').select(PROFILE_FIELDS);
      for (const [k, v] of Object.entries(query)) if (typeof v !== 'object') q = q.eq(k, v);
      const { data, error } = await q.limit(1000);
      if (error) throw new Error(error.message);
      return data.map(normProfile);
    },
    get: async (id: string) => {
      const { data, error } = await db.from('profiles').select(PROFILE_FIELDS).eq('id', id).single();
      if (error) throw new Error(error.message);
      return normProfile(data);
    },
    update: async (id: string, patch: any) => {
      const { data, error } = await db.from('profiles').update(patch).eq('id', id).select(PROFILE_FIELDS).single();
      if (error) throw new Error(error.message);
      return normProfile(data);
    },
  };
}

function entitiesOf(db: any) {
  const cache = new Map<string, unknown>();
  return new Proxy({} as Record<string, any>, {
    get(_, name) {
      if (typeof name !== 'string') return undefined;
      if (!cache.has(name)) cache.set(name, name === 'User' ? userApi(db) : entityApi(db, name));
      return cache.get(name);
    },
  });
}

// ---- E-mail (Resend) -------------------------------------------------------
async function sendEmailViaResend({ to, subject, body, html, text, from_name, reply_to }: any) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY nincs beállítva');
  const fromAddr = Deno.env.get('MAIL_FROM') || 'ertesites@withmotionagency.com';
  const looksHtml = /<[a-z][\s\S]*>/i.test(String(body || ''));
  const payload: Record<string, unknown> = {
    from: `${from_name || Deno.env.get('MAIL_FROM_NAME') || 'FunnelFlow'} <${fromAddr}>`,
    to: Array.isArray(to) ? to : [to],
    subject: subject || 'Üzenet',
    ...(html ? { html, ...(text ? { text } : {}) } : looksHtml ? { html: body } : { text: body || '' }),
  };
  const replyTo = reply_to || Deno.env.get('MAIL_REPLY_TO');
  if (replyTo) payload.reply_to = replyTo;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend hiba ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json().catch(() => ({}));
}

// ---- Külső kapcsolatok (a Base44 "connectors" helyett saját kulcsokkal) ---------
let gToken: { value: string; exp: number } | null = null;
async function googleAccessToken(): Promise<string> {
  if (gToken && gToken.exp > Date.now() + 60_000) return gToken.value;
  const id = Deno.env.get('GOOGLE_CLIENT_ID'), secret = Deno.env.get('GOOGLE_CLIENT_SECRET'), refresh = Deno.env.get('GOOGLE_REFRESH_TOKEN');
  if (!id || !secret || !refresh) throw new Error('A Google Naptár kapcsolat nincs beállítva');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google token hiba: ${j.error_description || j.error || res.status}`);
  gToken = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return gToken.value;
}

const connectors = {
  getConnection: async (type: string) => {
    if (type === 'googlecalendar') return { accessToken: await googleAccessToken() };
    if (type === 'meta_ads') {
      const t = Deno.env.get('META_ACCESS_TOKEN');
      if (!t) throw new Error('A Meta kapcsolat nincs beállítva');
      return { accessToken: t };
    }
    throw new Error(`Ismeretlen kapcsolat: ${type}`);
  },
};

const aiGateway = {
  connection: () => ({
    baseURL: Deno.env.get('AI_BASE_URL') || 'https://api.anthropic.com/v1',
    token: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
    headers: {},
  }),
};

// ---- Kliens ----------------------------------------------------------------
export function createClientFromRequest(req: Request) {
  const authz = req.headers.get('authorization') || '';
  const bearer = authz.replace(/^Bearer\s+/i, '');
  const cronSecret = req.headers.get('x-cron-secret') || '';
  const isCron = !!cronSecret && cronSecret === Deno.env.get('CRON_SECRET');

  const service = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const userDb = createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: authz || `Bearer ${SB_ANON}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const functions = {
    invoke: async (name: string, body: unknown = {}) => {
      const res = await fetch(`${SB_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SB_SERVICE}`,
          'x-cron-secret': Deno.env.get('CRON_SECRET') ?? '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data?.error || `Függvényhiba (${res.status})`), { status: res.status, data });
      return { data };
    },
  };

  return {
    auth: {
      me: async () => {
        if (isCron) return { id: 'system', email: 'system', role: 'admin', account_id: '', full_name: 'Rendszer' };
        if (!bearer || bearer === SB_ANON) return null;
        const { data, error } = await service.auth.getUser(bearer);
        if (error || !data?.user) return null;
        const { data: p } = await service.from('profiles').select(PROFILE_FIELDS).eq('id', data.user.id).single();
        return p ? normProfile(p) : null;
      },
    },
    entities: entitiesOf(userDb),
    functions,
    asServiceRole: {
      entities: entitiesOf(service),
      functions,
      connectors,
      aiGateway,
      integrations: { Core: { SendEmail: sendEmailViaResend } },
    },
  };
}
