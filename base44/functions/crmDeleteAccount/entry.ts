import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Self-service account deletion: removes the caller's own app profile so access ends
// immediately. Only the caller's own record is ever touched.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const users = await base44.asServiceRole.entities.User.list();
    const admins = users.filter((u) => u.role === 'admin');
    if (user.role === 'admin' && admins.length <= 1) {
      return Response.json(
        { error: 'Ez az utolsó admin fiók. Előbb adj meg egy másik admint, különben senki sem tudná kezelni a munkaterületet.' },
        { status: 400 }
      );
    }

    await base44.asServiceRole.entities.User.delete(user.id);
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}