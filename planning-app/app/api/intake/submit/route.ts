import { ClientStatus, type Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { intakeSchema, type IntakeData } from '@/lib/intake/schema';
import { encryptJson } from '@/lib/auth/crypto';
import { ApiError, clientRateLimitKey, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { requireDraft } from '@/lib/services/drafts';
import { intakeIdentity, normalizedIntake } from '@/lib/services/normalize';
import { queueEmail } from '@/lib/services/email';
import { enforceRateLimit } from '@/lib/auth/rate-limit';
import { assertProductionIntakeAllowed } from '@/lib/operations/status';
import { submitAnnualUpdate } from '@/lib/annual-review/submission';

function validationFields(issues: Array<{ path: (string | number)[]; message: string }>) {
  const fields: Record<string, string> = {};
  for (const issue of issues) fields[issue.path.join('.')] ??= issue.message;
  return fields;
}

async function intakeAdvisor() {
  const id = process.env.INTAKE_ADVISOR_ID;
  if (!id) throw new ApiError(503, 'Intake submission is not available yet.');
  const advisor = await db.advisor.findUnique({ where: { id }, select: { id: true, email: true, name: true } });
  if (!advisor) throw new ApiError(503, 'Intake submission is not available yet.');
  return advisor;
}

export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    assertProductionIntakeAllowed();
    const context = await requireDraft(request);
    const body = await jsonBody(request);
    requireCsrf(context.draft.csrfToken, body.csrfToken);
    await enforceRateLimit('intake-submit-ip', clientRateLimitKey(request), 12, 60 * 60_000);
    await enforceRateLimit('intake-submit-draft', context.draft.id, 6, 60 * 60_000);
    const revision = typeof body.revision === 'number' && Number.isInteger(body.revision) ? body.revision : -1;
    if (revision !== context.draft.revision) throw new ApiError(409, 'This draft was updated elsewhere. Reload and try again.');
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new ApiError(400, 'Invalid intake data.');
    const checked = intakeSchema.safeParse(body.data);
    if (!checked.success) throw new ApiError(422, 'Please correct the highlighted fields.', validationFields(checked.error.issues));
    const data = checked.data as IntakeData;
    const advisor = context.draft.originAdvisorId ? await db.advisor.findUnique({ where: { id: context.draft.originAdvisorId }, select: { id: true, email: true, name: true } }) : await intakeAdvisor();
    if (!advisor) throw new ApiError(410, 'The advisor for this update is no longer available.');

    if (context.draft.submittedAt && context.draft.originClientId) return noStore(NextResponse.json({ ok: true, clientId: context.draft.originClientId, annualUpdate: true, emailDelivery: 'queued' }));
    if (context.draft.submittedAt && context.draft.clientId) return noStore(NextResponse.json({ ok: true, clientId: context.draft.clientId, emailDelivery: 'queued' }));
    if (context.draft.submittedAt) throw new ApiError(409, 'This intake is still being finalized. Please try again.');

    const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.intakeDraft.updateMany({ where: { id: context.draft.id, revision, submittedAt: null }, data: { submittedAt: new Date(), consentedAt: new Date(), consentVersion: 'phase1-2026-10', encryptedData: encryptJson(data), email: data.email.toLowerCase() } });
      if (!claimed.count) {
        const latest = await tx.intakeDraft.findUnique({ where: { id: context.draft.id } });
        if (latest?.clientId) return { clientId: latest.clientId, duplicate: true };
        if (latest?.submittedAt && latest.originClientId) return { clientId: latest.originClientId, duplicate: true };
        throw new ApiError(409, 'This draft was updated elsewhere. Reload and try again.');
      }
      await tx.draftAccessGrant.updateMany({ where: { draftId: context.draft.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (context.draft.originClientId) {
        const updated = await submitAnnualUpdate(tx, context, data);
        await queueEmail({ to: advisor.email, displayName: 'LSRT Insurance', subject: 'Annual retirement information updated', text: 'A client submitted their annual information update. Sign in to review the existing client record.', html: '<p>A client submitted their annual information update. Sign in to review the existing client record.</p>' }, 'ADVISOR_ANNUAL_UPDATE_RECEIVED', advisor.id, tx);
        await queueEmail({ to: data.email, displayName: 'LSRT Insurance', subject: 'We received your annual information update', text: 'Your updated information is saved for advisor review. Prior reports remain unchanged.', html: '<p>Your updated information is saved for advisor review. Prior reports remain unchanged.</p>' }, 'CLIENT_ANNUAL_UPDATE_CONFIRMATION', advisor.id, tx);
        return updated;
      }
      const identity = intakeIdentity(data);
      const client = await tx.client.create({ data: { advisorId: advisor.id, status: ClientStatus.NEW, ...identity, encryptedData: encryptJson(data), submittedAt: new Date() } });
      await tx.client.update({ where: { id: client.id }, data: normalizedIntake(data) });
      await tx.consentRecord.create({ data: { clientId: client.id, version: 'phase1-2026-10', consentedAt: new Date() } });
      const upload = await tx.upload.findUnique({ where: { draftId: context.draft.id } });
      if (data.ssaUploadId && (!upload || upload.id !== data.ssaUploadId)) throw new ApiError(422, 'Invalid SSA upload.');
      // Any draft-owned PDF is moved under the newly created client/advisor ownership on submit.
      if (upload) await tx.upload.update({ where: { id: upload.id }, data: { draftId: null, clientId: client.id, advisorId: advisor.id } });
      await tx.intakeDraft.update({ where: { id: context.draft.id }, data: { clientId: client.id } });
      await tx.auditLog.create({ data: { advisorId: advisor.id, clientId: client.id, action: 'INTAKE_SUBMITTED', entity: 'Client', entityId: client.id, summary: 'Client submitted intake.' } });
      await queueEmail({ to: advisor.email, displayName: 'LSRT Insurance', subject: 'New retirement intake submitted', text: 'A new retirement intake is ready for your review.', html: '<p>A new retirement intake is ready for your review.</p>' }, 'ADVISOR_NEW_INTAKE', advisor.id, tx);
      await queueEmail({ to: data.email, displayName: 'LSRT Insurance', subject: 'We received your retirement intake', text: 'Thank you. Your advisor will review your retirement intake.', html: '<p>Thank you. Your advisor will review your retirement intake.</p>' }, 'CLIENT_INTAKE_CONFIRMATION', advisor.id, tx);
      return { clientId: client.id, duplicate: false };
    });
    return noStore(NextResponse.json({ ok: true, clientId: result.clientId, annualUpdate: Boolean(context.draft.originClientId), emailDelivery: 'queued' }));
  } catch (error) { return errorResponse(error); }
}
