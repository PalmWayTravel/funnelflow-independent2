import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const MAX_TEXT = 4000;

// Only an admin may change these: account binding, role, marketing flag and consent fields.
const PROTECTED_FIELDS = ['account_id', 'role', 'marketing', 'marketing_consent', 'unsubscribed'];

// The client role may only switch its own account's automation on/off and rewrite the
// subject/body of its e-mail steps — every other field is out of reach, enforced server-side.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const automationId = String(body.automation_id == null ? '' : body.automation_id);
    if (!automationId) return Response.json({ error: 'Hiányzó automatizáció azonosító' }, { status: 400 });

    // Fields the client role may never change through this endpoint.
    const attempted = PROTECTED_FIELDS.filter((field) => body[field] !== undefined);
    if (attempted.length) {
      return Response.json(
        { error: `Ezeket a mezőket csak admin módosíthatja: ${attempted.join(', ')}` },
        { status: 403 }
      );
    }

    const automation = await base44.asServiceRole.entities.Automation.get(automationId).catch(() => null);
    if (!automation) return Response.json({ error: 'Az automatizáció nem található' }, { status: 404 });

    const accountId = user.account_id || '';
    if (!accountId || automation.account_id !== accountId) {
      return Response.json({ error: 'Ehhez az automatizációhoz nincs jogosultságod' }, { status: 403 });
    }

    if (body.action === 'toggle') {
      const active = body.active === true;
      await base44.asServiceRole.entities.Automation.update(automation.id, { active });
      return Response.json({ ok: true, active });
    }

    if (body.action === 'save_content') {
      const edits = Array.isArray(body.content) ? body.content : [];
      const steps = (automation.steps || []).map((step, index) => {
        const edit = edits.find((item) => Number(item.index) === index);
        if (!edit || step.type !== 'email') return step;
        const subject = edit.subject === undefined || edit.subject === null ? (step.subject || '') : String(edit.subject);
        const text = edit.body === undefined || edit.body === null ? (step.body || '') : String(edit.body);
        return { ...step, subject: subject.slice(0, 250), body: text.slice(0, MAX_TEXT) };
      });
      await base44.asServiceRole.entities.Automation.update(automation.id, { steps });
      return Response.json({ ok: true, edited: edits.length });
    }

    return Response.json({ error: 'Ismeretlen művelet' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}