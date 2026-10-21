import { z } from 'zod';
import { db } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/auth/crypto';
import { ApiError } from '@/lib/auth/http';

const item = z.object({ subject: z.string().trim().min(5).max(150).refine(s => !/[\r\n]/.test(s), 'Subject must be one line.'), text: z.string().trim().min(30).max(3000) }).strict();
export const templatesSchema = z.object({ ANNUAL_UPDATE: item, ANNUAL_REMINDER: item }).strict().superRefine((data, ctx) => {
  for (const [key, template] of Object.entries(data)) {
    const allowed = key === 'ANNUAL_UPDATE' ? ['updateLink', 'reviewDate'] : ['reviewDate'];
    for (const token of (template.subject + '\n' + template.text).matchAll(/\{\{([^}]+)\}\}/g)) if (!allowed.includes(token[1])) ctx.addIssue({ code: 'custom', path: [key, 'text'], message: 'Use only the listed template variables.' });
  }
  if (!data.ANNUAL_UPDATE.text.includes('{{updateLink}}')) ctx.addIssue({ code: 'custom', path: ['ANNUAL_UPDATE', 'text'], message: 'Keep {{updateLink}} in the annual update message.' });
});
export type EmailTemplates = z.infer<typeof templatesSchema>;
export const DEFAULT_EMAIL_TEMPLATES: EmailTemplates = {
  ANNUAL_UPDATE: { subject: 'Your annual retirement information update', text: 'Your advisor has requested an annual information update before your review on {{reviewDate}}. Review your previous answers and consent again before submitting. Your private update link is {{updateLink}}' },
  ANNUAL_REMINDER: { subject: 'Retirement client annual review is approaching', text: 'A client review is scheduled for {{reviewDate}}. Sign in to the advisor workspace to review the record and prepare for the meeting.' },
};
type Stored = { revision: number; templates: EmailTemplates };
const key = 'ADVISOR_EMAIL_TEMPLATES'; const year = 0;
export async function loadEmailTemplates(advisorId: string): Promise<Stored> {
  const row = await db.assumptionYear.findUnique({ where: { advisorId_year_key: { advisorId, year, key } } });
  if (!row) return { revision: 0, templates: structuredClone(DEFAULT_EMAIL_TEMPLATES) };
  const data = decryptJson<Stored>(row.encryptedValue);
  const checked = templatesSchema.safeParse(data.templates);
  if (!checked.success || !Number.isInteger(data.revision)) throw new ApiError(503, 'Saved email templates require review.');
  return { revision: data.revision, templates: checked.data };
}
export async function saveEmailTemplates(advisorId: string, templates: unknown, revision: number) {
  const checked = templatesSchema.safeParse(templates);
  if (!checked.success) throw new ApiError(422, checked.error.issues[0]?.message || 'Review the email template fields.');
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM Advisor WHERE id = ${advisorId} FOR UPDATE`;
    const row = await tx.assumptionYear.findUnique({ where: { advisorId_year_key: { advisorId, year, key } } });
    const current = row ? decryptJson<Stored>(row.encryptedValue) : { revision: 0 };
    if (current.revision !== revision) throw new ApiError(409, 'Email templates changed elsewhere. Reload first.');
    const next = { templates: checked.data, revision: revision + 1 };
    await tx.assumptionYear.upsert({ where: { advisorId_year_key: { advisorId, year, key } }, create: { advisorId, year, key, encryptedValue: encryptJson(next) }, update: { encryptedValue: encryptJson(next) } });
    await tx.auditLog.create({ data: { advisorId, action: 'EMAIL_TEMPLATES_UPDATED', entity: 'Advisor', entityId: advisorId, summary: 'Advisor edited annual communication templates. Existing queued emails unchanged; no email sent.' } });
    return next;
  });
}
function escapeHtml(text: string) { return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
export function renderEmailTemplate(template: { subject: string; text: string }, variables: Record<string, string>, update = false) {
  const substitute = (text: string) => text.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => variables[key] ?? 'Not supplied');
  const safety = update ? '\n\nThis private link expires in seven days. Do not forward it. No report is included. Your existing reports remain unchanged.' : '';
  const text = substitute(template.text) + safety;
  return { subject: substitute(template.subject), text, html: '<p>' + escapeHtml(text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>' };
}
