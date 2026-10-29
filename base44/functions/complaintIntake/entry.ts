import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { ToolLoopAgent, tool, stepCountIs, hasToolCall } from 'npm:ai@7.0.16';
import { createOpenAICompatible } from 'npm:@ai-sdk/openai-compatible@3.0.5';
import { z } from 'npm:zod@4.4.3';

const CATEGORIES = ['Számlázás', 'Szolgáltatásminőség', 'Technikai hiba', 'Kommunikáció', 'Késedelem', 'Egyéb'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // Triage reads client records and rewrites complaints for the whole workspace,
    // so it stays restricted to admins.
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const complaintId = body.complaint_id;
    if (!complaintId || typeof complaintId !== 'string') {
      return Response.json({ error: 'Hiányzó complaint_id' }, { status: 400 });
    }

    const complaint = await base44.entities.Complaint.get(complaintId).catch(() => null);
    if (!complaint) return Response.json({ error: 'A panasz nem található' }, { status: 404 });

    const client = complaint.client_id
      ? await base44.entities.Client.get(complaint.client_id).catch(() => null)
      : null;

    const { baseURL, token, headers } = base44.asServiceRole.aiGateway.connection();
    const gateway = createOpenAICompatible({ name: 'base44', baseURL, apiKey: token, headers });

    let triage = null;

    const agent = new ToolLoopAgent({
      model: gateway('automatic'),
      instructions: `A FunnelFlow CRM panaszkezelő asszisztense vagy. Egy beérkező panaszt kell feldolgoznod magyarul.
Lépések: 1) Ha szükséges, kérd le az ügyfél adatait a getClient eszközzel. 2) Ha hasznos, nézd meg a legutóbbi panaszokat a listRecentComplaints eszközzel (ismétlődő probléma-e). 3) Végül pontosan egyszer hívd meg a submitTriage eszközt a végeredménnyel.
Kategóriák: ${CATEGORIES.join(', ')}.
Prioritás: high = üzleti kockázat, dühös vagy fizetéssel fenyegető ügyfél, számlázási vagy jogi probléma; medium = általános minőségi vagy kommunikációs probléma; low = apró kérés vagy kozmetikai hiba.
Az összefoglaló legfeljebb 2-3 mondat. A válaszjavaslat udvarias, tárgyszerű magyar válasz az ügyfélnek, amely ha lehet konkrét megoldást vagy következő lépést ígér.`,
      tools: {
        getClient: tool({
          description: 'Egy ügyfél adatai azonosító alapján.',
          inputSchema: z.object({ client_id: z.string() }),
          execute: async ({ client_id }) => {
            const found = await base44.entities.Client.get(client_id).catch(() => null);
            if (!found) return { error: 'Az ügyfél nem található' };
            return { name: found.name, status: found.status, email: found.email, phone: found.phone, note: found.note };
          },
        }),
        listRecentComplaints: tool({
          description: 'A legutóbbi panaszok rövid listája, ismétlődő problémák kereséséhez.',
          inputSchema: z.object({ limit: z.number().optional() }),
          execute: async ({ limit }) => {
            const size = Math.min(Math.max(Number(limit) || 10, 1), 25);
            const items = await base44.entities.Complaint.list('-created_date', size).catch(() => []);
            return items.map((c) => ({
              id: c.id, title: c.title, status: c.status, priority: c.priority || '', created_date: c.created_date,
            }));
          },
        }),
        submitTriage: tool({
          description: 'A panasz feldolgozásának lezárása: kategória, prioritás, összefoglaló, válaszjavaslat és opcionális utókövetési feladat.',
          inputSchema: z.object({
            category: z.enum(['Számlázás', 'Szolgáltatásminőség', 'Technikai hiba', 'Kommunikáció', 'Késedelem', 'Egyéb']),
            priority: z.enum(['low', 'medium', 'high']),
            summary: z.string(),
            draft_response: z.string(),
            follow_up_title: z.string().optional(),
            follow_up_days: z.number().optional(),
          }),
          execute: async (input) => {
            const patch = {
              category: input.category,
              priority: input.priority,
              agent_summary: input.summary,
              draft_response: input.draft_response,
              status: 'in_progress',
              triaged_at: new Date().toISOString(),
            };
            await base44.entities.Complaint.update(complaintId, patch);

            if (input.follow_up_title) {
              const days = Math.min(Math.max(Number(input.follow_up_days) || 3, 1), 30);
              const due = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
              await base44.entities.Task.create({
                title: `Panasz utókövetés: ${input.follow_up_title}`,
                due_date: due,
                done: false,
                assigned_to_id: complaint.created_by_id || '',
              }).catch(() => null);
            }

            await base44.entities.ActivityLog.create({
              message: `Asszisztens feldolgozta a panaszt: "${complaint.title}" — ${input.category}, ${input.priority} prioritás`,
              type: 'agent',
              entity_type: 'Complaint',
              entity_id: complaintId,
              read: false,
            }).catch(() => null);

            triage = {
              category: input.category,
              priority: input.priority,
              summary: input.summary,
              draft_response: input.draft_response,
              follow_up: input.follow_up_title || '',
            };
            return { ok: true };
          },
        }),
      },
      stopWhen: [stepCountIs(8), hasToolCall('submitTriage')],
    });

    await agent.generate({
      prompt: `Új panasz érkezett, dolgozd fel a folyamat szerint, és zárd le a submitTriage hívással.
Cím: ${complaint.title}
Leírás: ${complaint.description || '(nincs megadva)'}
Ügyfél: ${client ? `${client.name} (státusz: ${client.status || 'ismeretlen'})` : 'nincs megadva'}
Beérkezett: ${complaint.created_date || ''}`,
    });

    if (!triage) return Response.json({ error: 'A feldolgozás nem fejeződött be' }, { status: 502 });

    return Response.json({
      ok: true,
      complaint_id: complaintId,
      category: triage.category,
      priority: triage.priority,
      summary: triage.summary,
      draft_response: triage.draft_response,
      follow_up: triage.follow_up,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}