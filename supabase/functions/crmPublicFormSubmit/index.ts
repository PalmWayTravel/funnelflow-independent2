import { createClientFromRequest, serve } from '../_shared/base44.ts';
import { renderTemplate, buildVars, sendEmail } from '../_shared/crm.ts';

const MAX_FIELDS = 30;

function clean(value, max = 500) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function asConsent(value) {
  if (value === true) return true;
  return String(value == null ? '' : value).trim().toLowerCase() === 'true';
}

async function handler(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const formId = clean(body.form_id, 64);
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    if (!formId) return Response.json({ error: 'Hiányzó űrlap azonosító' }, { status: 400 });

    const form = await base44.asServiceRole.entities.FormDef.get(formId).catch(() => null);
    if (!form || form.active === false) return Response.json({ error: 'Az űrlap nem elérhető' }, { status: 404 });

    // A visitor has no CRM access: only the form's public fields are handed out.
    if (body.action === 'form') {
      return Response.json({
        form: {
          title: form.title || '',
          description: form.description || '',
          button_text: form.button_text || '',
          accent_color: form.accent_color || '#8549DE',
          success_message: form.success_message || '',
          fields: (form.fields || []).slice(0, MAX_FIELDS).map((field) => ({
            label: clean(field.label, 120),
            field_type: field.field_type || 'text',
            required: field.required === true,
            placeholder: clean(field.placeholder, 200),
            options: clean(field.options, 500),
          })),
        },
      });
    }

    const fields = (form.fields || []).slice(0, MAX_FIELDS);
    const contactData = { name: '', email: '', phone: '', company: '', industry: '', notes: '' };
    const stored = {};
    let hasConsentField = false;
    let consent = false;
    for (const field of fields) {
      const raw = clean(answers[field.label], 1000);
      const isConsent = field.map_to === 'consent';
      const isChecked = answers[field.label] === true || String(answers[field.label]).toLowerCase() === 'true';
      if (field.required && !raw && !isChecked) {
        return Response.json({ error: `Kötelező mező: ${field.label}` }, { status: 400 });
      }
      stored[field.label] = raw;
      if (isConsent) {
        // Separate marketing opt-in checkbox — it only fills the consent field, never a contact data field.
        hasConsentField = true;
        consent = asConsent(answers[field.label]);
        continue;
      }
      if (!raw) continue;
      if (field.map_to === 'name') contactData.name = raw;
      else if (field.map_to === 'email') contactData.email = raw;
      else if (field.map_to === 'phone') contactData.phone = raw;
      else if (field.map_to === 'company') contactData.company = raw;
      else if (field.map_to === 'industry') contactData.industry = raw;
      else if (field.map_to === 'note') contactData.notes = raw;
    }
    if (!contactData.name) contactData.name = contactData.email || 'Névtelen kitöltő';

    let existing = null;
    if (contactData.email) {
      const found = await base44.asServiceRole.entities.Contact.filter({ email: contactData.email }).catch(() => []);
      existing = found[0] || null;
    }

    const consentLine = hasConsentField ? `Marketing hozzájárulás: ${consent ? 'igen' : 'nem'}` : '';
    const payloadLine = `Űrlap kitöltve: ${form.name}`;
    let contact;
    if (existing) {
      const tags = Array.from(new Set([...(existing.tags || []), 'űrlap']));
      const patch = {
        name: contactData.name || existing.name,
        phone: contactData.phone || existing.phone,
        company: contactData.company || existing.company,
        industry: contactData.industry || existing.industry,
        notes: contactData.notes || existing.notes,
        tags,
        activity: [...(existing.activity || []), payloadLine, consentLine].filter(Boolean).slice(-100),
      };
      if (hasConsentField) patch.marketing_consent = consent;
      if (form.target_stage_id) patch.stage_id = form.target_stage_id;
      contact = await base44.asServiceRole.entities.Contact.update(existing.id, patch);
    } else {
      contact = await base44.asServiceRole.entities.Contact.create({
        account_id: form.account_id || '',
        name: contactData.name, email: contactData.email, phone: contactData.phone,
        company: contactData.company, industry: contactData.industry, notes: contactData.notes,
        source: 'Form', tags: ['űrlap'], marketing_consent: hasConsentField ? consent : false,
        stage_id: form.target_stage_id || '',
        activity: [payloadLine, consentLine, 'Kontakt létrehozva űrlapból'].filter(Boolean),
      });
    }

    await base44.asServiceRole.entities.FormSubmission.create({
      form_def_id: form.id, contact_id: contact.id, account_id: form.account_id || '',
      payload: JSON.stringify(stored).slice(0, 4000),
    });
    await base44.asServiceRole.entities.FormDef.update(form.id, { submission_count: (form.submission_count || 0) + 1 }).catch(() => null);

    await base44.asServiceRole.entities.ActivityLog.create({
      message: `Új űrlapkitöltés: ${form.name} — ${contact.name}`,
      type: 'form', entity_type: 'Contact', entity_id: contact.id, read: false,
    }).catch(() => null);

    await base44.functions.invoke('crmAutomationEngine', {
      action: 'trigger', event: 'form_submitted', contact_id: contact.id, payload: { form_id: form.id },
    }).catch(() => null);
    if (!existing) {
      await base44.functions.invoke('crmAutomationEngine', {
        action: 'trigger', event: 'contact_created', contact_id: contact.id, payload: {},
      }).catch(() => null);
    }

    const settingsList = await base44.asServiceRole.entities.WorkspaceSettings.list('-created_date', 1).catch(() => []);
    const settings = settingsList[0] || null;
    if (settings?.notify_new_contact && settings?.email_from_email) {
      await sendEmail(base44, {
        to: settings.email_from_email,
        subject: `Új űrlapkitöltés: ${form.name}`,
        body: `${contact.name} (${contact.email || 'nincs e-mail'}) kitöltötte a(z) "${form.name}" űrlapot.${consentLine ? ` ${consentLine}.` : ''}`,
        fromName: settings.email_from_name || '',
      });
    }

    const confirmEmail = renderTemplate(form.success_message || 'Köszönjük, hamarosan keresünk!', buildVars(contact, null));
    // Public endpoint: acknowledge the submission, never return stored records.
    return Response.json({ ok: true, message: confirmEmail });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

serve(handler);
