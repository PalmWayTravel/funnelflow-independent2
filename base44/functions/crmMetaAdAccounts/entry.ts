import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const GRAPH = 'https://graph.facebook.com/v25.0';

// Csak admin hívhatja: a Meta hirdetési fiókok és oldalak listája a hozzájuk
// tartozó OAuth tokennel kizárólag a mapping felvételéhez kell.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    let accessToken = '';
    try {
      const connection = await base44.asServiceRole.connectors.getConnection('meta_ads');
      accessToken = (connection && connection.accessToken) || '';
    } catch (e) {
      accessToken = '';
    }

    // A tokent soha nem adjuk vissza a felületnek — csak azt jelezzük, hogy megvan-e.
    if (!accessToken) {
      return Response.json({ connected: false, ad_accounts: [], pages: [], error: 'A Meta kapcsolat még nincs engedélyezve.' });
    }

    const headers = { Authorization: `Bearer ${accessToken}` };
    const [accountsRes, pagesRes] = await Promise.all([
      fetch(`${GRAPH}/me/adaccounts?fields=account_id,name&limit=200`, { headers }),
      fetch(`${GRAPH}/me/accounts?fields=id,name&limit=200`, { headers }),
    ]);
    const accountsData = await accountsRes.json().catch(() => ({}));
    const pagesData = await pagesRes.json().catch(() => ({}));

    const adAccounts = (accountsData.data || []).map((item) => ({
      ad_account_id: item.account_id ? `act_${item.account_id}` : '',
      ad_account_name: item.name || '',
    })).filter((item) => item.ad_account_id);

    const pages = (pagesData.data || []).map((item) => ({
      page_id: String(item.id || ''),
      page_name: item.name || '',
    })).filter((item) => item.page_id);

    return Response.json({
      connected: true,
      ad_accounts: adAccounts,
      pages,
      error: (accountsData.error && accountsData.error.message) || (pagesData.error && pagesData.error.message) || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}