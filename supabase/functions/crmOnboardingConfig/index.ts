import { createClientFromRequest, serve } from '../_shared/base44.ts';

// Az onboarding során az ügyfélnek csak a partner-azonosítónkra van szüksége,
// a teljes workspace beállítást (e-mail, küldési limitek) nem adjuk ki neki.
async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { items } = await base44.asServiceRole.entities.WorkspaceSettings.filter(
      {},
      { sort: '-created_date', limit: 1 }
    );
    const settings = (items && items[0]) || null;

    return Response.json({
      meta_business_id: (settings && settings.meta_business_id) || '',
      app_name: 'FunnelFlow',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

serve(handler);
