import { createClientFromRequest, serve } from '../_shared/base44.ts';

const GRAPH = 'https://graph.facebook.com/v25.0';
const MAX_ACCOUNTS = 25;
const BATCH = 5;

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// A Meta Graph API mindig 'act_' előtaggal várja a hirdetési fiók azonosítót.
function actId(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  return raw.startsWith('act_') ? raw : `act_${raw}`;
}

// Napi bontású költés egy hirdetési fiókra.
async function fetchDailySpend(accessToken, act, since, until) {
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const url = `${GRAPH}/${act}/insights?level=account&time_increment=1&fields=spend&limit=200&time_range=${timeRange}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(json?.error?.message || `Meta hiba (${res.status})`);
  }
  return json.data || [];
}

async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const until = /^\d{4}-\d{2}-\d{2}$/.test(body.until || '') ? body.until : isoDate(Date.now());
    const since = /^\d{4}-\d{2}-\d{2}$/.test(body.since || '') ? body.since : isoDate(Date.now() - 29 * 86400000);

    let accessToken = '';
    try {
      const connection = await base44.asServiceRole.connectors.getConnection('meta_ads');
      accessToken = connection?.accessToken || '';
    } catch (e) {
      return Response.json({ error: 'A Meta hirdetési kapcsolat nem elérhető. Kapcsold újra a Meta hirdetéseket.' }, { status: 400 });
    }
    if (!accessToken) {
      return Response.json({ error: 'A Meta hirdetési kapcsolat nem elérhető. Kapcsold újra a Meta hirdetéseket.' }, { status: 400 });
    }

    const mappings = await base44.asServiceRole.entities.MetaAdAccountMapping.filter(
      { status: 'active' }, '-created_date', MAX_ACCOUNTS
    ).catch(() => []);
    const usable = mappings.filter((m) => actId(m.ad_account_id));
    if (!usable.length) {
      return Response.json({ since, until, accounts: 0, days: 0, errors: ['Nincs aktív hirdetési fiók hozzárendelve.'] });
    }

    const errors = [];
    let accounts = 0;
    let days = 0;

    for (let i = 0; i < usable.length; i += BATCH) {
      const chunk = usable.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        chunk.map((m) => fetchDailySpend(accessToken, actId(m.ad_account_id), since, until))
      );
      for (let j = 0; j < chunk.length; j += 1) {
        const mapping = chunk[j];
        const act = actId(mapping.ad_account_id);
        const result = results[j];
        if (result.status !== 'fulfilled') {
          errors.push(`${mapping.ad_account_name || act}: ${result.reason?.message || 'ismeretlen hiba'}`);
          continue;
        }
        // Az "agency" munkaterület költése nem tartozik ügyfélhez: globális marad.
        const accountId = mapping.workspace_id === 'agency' ? '' : (mapping.workspace_id || '');
        const records = result.value
          .map((row) => {
            const date = String(row.date_start || '').slice(0, 10);
            return {
              date,
              amount: Number(row.spend) || 0,
              account_id: accountId,
              source: 'meta',
              sync_key: `meta:${act}:${date}`,
            };
          })
          .filter((r) => r.date);
        if (records.length) {
          await base44.asServiceRole.entities.AdSpend.upsert(records, { key: 'sync_key' });
        }
        accounts += 1;
        days += records.length;
      }
    }

    return Response.json({ since, until, accounts, days, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

serve(handler);
