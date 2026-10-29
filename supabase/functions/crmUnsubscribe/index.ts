import { createClientFromRequest, serve } from '../_shared/base44.ts';

// Public endpoint behind the unsubscribe link in every marketing e-mail.
async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = String(body.token == null ? '' : body.token).trim().slice(0, 80);
    if (!token) return Response.json({ error: 'Hiányzó leiratkozási kód' }, { status: 400 });

    const found = await base44.asServiceRole.entities.Contact.filter({ unsubscribe_token: token }).catch(() => []);
    const contact = found[0];
    if (!contact) return Response.json({ error: 'Érvénytelen vagy lejárt leiratkozási link' }, { status: 404 });

    if (contact.unsubscribed !== true) {
      await base44.asServiceRole.entities.Contact.update(contact.id, {
        unsubscribed: true,
        activity: [...(contact.activity || []), 'Leiratkozott a marketing e-mailekről'].slice(-100),
      });
      await base44.asServiceRole.entities.ActivityLog.create({
        message: `Leiratkozás: ${contact.name}`,
        type: 'unsubscribe', entity_type: 'Contact', entity_id: contact.id, read: false,
      }).catch(() => null);
    }

    // The token is the only credential — never echo contact data back.
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

serve(handler);
