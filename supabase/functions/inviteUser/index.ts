import { createClientFromRequest, serve } from '../_shared/base44.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Munkatárs / ügyfél meghívása e-mailben. Csak admin hívhatja.
async function handler(req) {
  const base44 = createClientFromRequest(req);
  const me = await base44.auth.me();
  if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (me.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const role = body.role === 'admin' ? 'admin' : 'user';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Érvénytelen e-mail cím' }, { status: 400 });

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const appUrl = (Deno.env.get('APP_URL') || '').replace(/\/$/, '');
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl}/reset-password` });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  // A profilt a handle_new_user trigger hozza létre; a szerepet itt állítjuk be.
  await admin.from('profiles').upsert({ id: data.user.id, email, role }, { onConflict: 'id' });
  return Response.json({ ok: true, id: data.user.id });
}

serve(handler);
