import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/auth/http';
import { decryptJson, encryptJson, randomToken, tokenHash } from '@/lib/auth/crypto';
import { ownedClient } from '@/lib/calculations/service';
import { queueEmail } from '@/lib/services/email';
import type { IntakeData } from '@/lib/intake/schema';
import { loadEmailTemplates, renderEmailTemplate } from '@/lib/email-templates/service';

export function reviewDate(value: string, now = new Date()): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(422, 'Choose a valid annual review date.');
  const parsed = new Date(value + 'T00:00:00.000Z');
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value || parsed < today || parsed.valueOf() - today.valueOf() > 5 * 366 * 86400000) throw new ApiError(422, 'Review date must be today or within the next five years.');
  return parsed;
}
export function defaultReviewDate(now = new Date()): string {
  const date = new Date(now);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}
export function applicationOrigin(): string {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new ApiError(503, 'The secure application origin is not configured.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new ApiError(503, 'A secure public application origin is required for update links.');
  return url.origin;
}
export async function annualReviewStatus(clientId: string, advisorId: string) {
  const client = await ownedClient(clientId, advisorId);
  const deliveries = await db.reviewDelivery.findMany({ where: { clientId }, orderBy: { requestedAt: 'desc' }, take: 20 });
  const outboxIds = deliveries.flatMap(d => d.outboxId ? [d.outboxId] : []);
  const outbox = await db.emailOutbox.findMany({ where: { id: { in: outboxIds }, advisorId }, select: { id: true, status: true, sentAt: true, lastErrorCode: true } });
  return { client: { status: client.status, revision: client.revision, nextReviewDate: client.nextReviewDate }, defaultReviewDate: defaultReviewDate(), deliveries: deliveries.map(d => ({ id: d.id, kind: d.kind, reviewDate: d.reviewDate, requestedAt: d.requestedAt, delivery: outbox.find(o => o.id === d.outboxId) ?? null })), emailDispatchHeld: process.env.OPERATIONS_OUTBOX_DISPATCH_APPROVED !== 'true' };
}
export async function presentReport(clientId: string, advisorId: string, reportId: string, date: string, revision: number) {
  const nextReviewDate = reviewDate(date);
  await ownedClient(clientId, advisorId);
  return db.$transaction(async tx => {
    const report = await tx.report.findFirst({ where: { id: reportId, clientId, status: 'READY', client: { advisorId } } });
    if (!report) throw new ApiError(422, 'Choose a ready report belonging to this client.');
    const updated = await tx.client.updateMany({ where: { id: clientId, advisorId, revision, status: { not: 'ARCHIVED' } }, data: { status: 'PRESENTED', nextReviewDate, revision: { increment: 1 } } });
    if (!updated.count) throw new ApiError(409, 'The client changed elsewhere or is archived. Reload before recording presentation.');
    await tx.auditLog.create({ data: { advisorId, clientId, action: 'REPORT_PRESENTED', entity: 'Report', entityId: reportId, summary: `Advisor explicitly recorded presentation; next review ${date}. No client email sent.` } });
    return { revision: revision + 1, nextReviewDate, status: 'PRESENTED' };
  });
}
export async function setReviewDate(clientId: string, advisorId: string, date: string, revision: number) {
  const nextReviewDate = reviewDate(date);
  await ownedClient(clientId, advisorId);
  return db.$transaction(async tx => {
    const updated = await tx.client.updateMany({ where: { id: clientId, advisorId, revision, status: { not: 'ARCHIVED' } }, data: { nextReviewDate, revision: { increment: 1 } } });
    if (!updated.count) throw new ApiError(409, 'Client changed elsewhere or is archived. Reload first.');
    await tx.auditLog.create({ data: { advisorId, clientId, action: 'ANNUAL_REVIEW_SCHEDULED', entity: 'Client', entityId: clientId, summary: `Next review date ${date}; no email sent.` } });
    return { revision: revision + 1, nextReviewDate };
  });
}
export async function startImplementation(clientId: string, advisorId: string, revision: number) {
  await ownedClient(clientId, advisorId);
  return db.$transaction(async tx => {
    const updated = await tx.client.updateMany({ where: { id: clientId, advisorId, revision, status: 'PRESENTED' }, data: { status: 'IMPLEMENTING', revision: { increment: 1 } } });
    if (!updated.count) throw new ApiError(409, 'Record presentation first and reload the current client revision.');
    await tx.auditLog.create({ data: { advisorId, clientId, action: 'IMPLEMENTATION_STARTED', entity: 'Client', entityId: clientId, summary: 'Advisor explicitly moved the presented plan into implementation. No product or transaction was submitted.' } });
    return { revision: revision + 1, status: 'IMPLEMENTING' };
  });
}
export async function requestAnnualUpdate(clientId: string, advisorId: string, revision: number) {
  const client = await ownedClient(clientId, advisorId);
  if (client.status === 'ARCHIVED') throw new ApiError(409, 'Archived clients cannot receive an update request.');
  if (client.revision !== revision) throw new ApiError(409, 'Client changed elsewhere. Reload first.');
  if (!client.nextReviewDate) throw new ApiError(422, 'Set the next review date before requesting an annual update.');
  const origin = applicationOrigin();
  const templates = await loadEmailTemplates(advisorId);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM Client WHERE id = ${clientId} AND advisorId = ${advisorId} FOR UPDATE`;
    const current = await tx.client.findFirst({ where: { id: clientId, advisorId, revision, status: { not: 'ARCHIVED' } } });
    if (!current?.nextReviewDate) throw new ApiError(409, 'Client changed during preparation. Reload first.');
    const key = { clientId, reviewDate: current.nextReviewDate, kind: 'UPDATE_REQUEST' };
    const prior = await tx.reviewDelivery.findUnique({ where: { clientId_reviewDate_kind: key } });
    if (prior?.draftId) {
      const draft = await tx.intakeDraft.findUnique({ where: { id: prior.draftId } });
      if ((draft?.submittedAt && draft.originRevision === revision - 1) || (!draft?.submittedAt && draft?.originRevision === revision && draft.updateExpiresAt && draft.updateExpiresAt > new Date())) return { queued: true, duplicate: true, deliveryId: prior.id, expiresAt: draft?.updateExpiresAt ?? null };
      await tx.draftAccessGrant.updateMany({ where: { draftId: prior.draftId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.intakeDraft.updateMany({ where: { id: prior.draftId, submittedAt: null }, data: { updateExpiresAt: new Date() } });
      if (prior.outboxId) await tx.emailOutbox.updateMany({ where: { id: prior.outboxId, status: { in: ['PENDING', 'RETRY'] } }, data: { status: 'FAILED', lastErrorCode: 'UPDATE_LINK_EXPIRED' } });
    }
    const data = { ...decryptJson<IntakeData>(current.encryptedData), consent: false, website: '', ssaUploadId: '' };
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    const draft = await tx.intakeDraft.create({ data: { sessionTokenHash: tokenHash(randomToken()), csrfToken: randomToken(), encryptedData: encryptJson(data), email: current.email, step: 1, originClientId: clientId, originAdvisorId: advisorId, originRevision: revision, updateExpiresAt: expiresAt } });
    await tx.draftAccessGrant.create({ data: { draftId: draft.id, tokenHash: tokenHash(token), expiresAt } });
    const link = `${origin}/intake?resume=${encodeURIComponent(token)}`;
    const payload = { to: current.email, displayName: 'LSRT Insurance', ...renderEmailTemplate(templates.templates.ANNUAL_UPDATE, { updateLink: link, reviewDate: current.nextReviewDate.toISOString().slice(0, 10) }, true) };
    const outbox = await queueEmail(payload, 'CLIENT_ANNUAL_UPDATE', advisorId, tx);
    const delivery = prior ? await tx.reviewDelivery.update({ where: { id: prior.id }, data: { draftId: draft.id, outboxId: outbox.id, requestedAt: new Date() } }) : await tx.reviewDelivery.create({ data: { ...key, draftId: draft.id, outboxId: outbox.id } });
    await tx.auditLog.create({ data: { advisorId, clientId, action: 'ANNUAL_UPDATE_REQUESTED', entity: 'ReviewDelivery', entityId: delivery.id, summary: 'Prefilled update link queued securely; no delivery claimed. Consent reset and prior reports preserved.' } });
    return { queued: true, duplicate: false, deliveryId: delivery.id, expiresAt };
  }, { timeout: 20000 });
}
export async function queueDueAnnualReviewReminders(now = new Date()) {
  const day = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const through = new Date(day.valueOf() + 31 * 86400000);
  const clients = await db.client.findMany({ where: { nextReviewDate: { gte: day, lt: through }, status: { not: 'ARCHIVED' } }, select: { id: true, advisorId: true, nextReviewDate: true, advisor: { select: { email: true } } }, orderBy: { nextReviewDate: 'asc' } });
  let queued = 0;
  for (const client of clients) {
    try {
      const templates = await loadEmailTemplates(client.advisorId);
      const added = await db.$transaction(async tx => {
        const current = await tx.client.findFirst({ where: { id: client.id, advisorId: client.advisorId, nextReviewDate: client.nextReviewDate, status: { not: 'ARCHIVED' } }, select: { id: true } });
        if (!current) return false;
        const key = { clientId: client.id, reviewDate: client.nextReviewDate!, kind: 'ADVISOR_REMINDER' };
        if (await tx.reviewDelivery.findUnique({ where: { clientId_reviewDate_kind: key } })) return false;
        const delivery = await tx.reviewDelivery.create({ data: key });
        const date = client.nextReviewDate!.toISOString().slice(0, 10);
        const outbox = await queueEmail({ to: client.advisor.email, displayName: 'LSRT Insurance', ...renderEmailTemplate(templates.templates.ANNUAL_REMINDER, { reviewDate: date }) }, 'ADVISOR_ANNUAL_REVIEW', client.advisorId, tx);
        await tx.reviewDelivery.update({ where: { id: delivery.id }, data: { outboxId: outbox.id } });
        await tx.auditLog.create({ data: { advisorId: client.advisorId, clientId: client.id, action: 'ANNUAL_REVIEW_REMINDER_QUEUED', entity: 'ReviewDelivery', entityId: delivery.id, summary: 'Thirty-day reminder queued once for this review date; no delivery claimed.' } });
        return true;
      });
      if (added) queued++;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
  await db.client.updateMany({ where: { nextReviewDate: { lt: day }, status: { in: ['PRESENTED', 'IMPLEMENTING', 'REPORT_GENERATED', 'IN_REVIEW'] } }, data: { status: 'ANNUAL_REVIEW_DUE' } });
  return { queued };
}
