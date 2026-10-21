import type { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/auth/http';
import { encryptJson } from '@/lib/auth/crypto';
import type { DraftContext } from '@/lib/services/drafts';
import type { IntakeData } from '@/lib/intake/schema';
import { intakeIdentity, normalizedIntake } from '@/lib/services/normalize';

export async function submitAnnualUpdate(tx: Prisma.TransactionClient, context: DraftContext, data: IntakeData) {
  const source = context.draft;
  if (!source.originClientId || !source.originAdvisorId || !source.originRevision || !source.updateExpiresAt || source.updateExpiresAt <= new Date()) throw new ApiError(410, 'This annual update is no longer valid. Ask your advisor for a fresh link.');
  if (data.ssaUploadId) throw new ApiError(422, 'The existing SSA document is retained separately. Do not attach a different client document.');
  const updated = await tx.client.updateMany({ where: { id: source.originClientId, advisorId: source.originAdvisorId, revision: source.originRevision, status: { not: 'ARCHIVED' } }, data: { ...intakeIdentity(data), encryptedData: encryptJson(data), status: 'IN_REVIEW', revision: { increment: 1 } } });
  if (!updated.count) throw new ApiError(409, 'Your advisor updated this record after the link was prepared. Ask them for a fresh update link; your saved answers have not been lost.');
  await tx.client.update({ where: { id: source.originClientId }, data: normalizedIntake(data) });
  const consentedAt = new Date();
  await tx.consentRecord.upsert({ where: { clientId: source.originClientId }, create: { clientId: source.originClientId, version: 'annual-update-2026-10', consentedAt }, update: { version: 'annual-update-2026-10', consentedAt } });
  await tx.intakeDraft.update({ where: { id: source.id }, data: { consentVersion: 'annual-update-2026-10', consentedAt } });
  await tx.auditLog.create({ data: { advisorId: source.originAdvisorId, clientId: source.originClientId, action: 'ANNUAL_UPDATE_SUBMITTED', entity: 'IntakeDraft', entityId: source.id, summary: 'Client reviewed prefilled answers and consented again. Existing client updated with revision check; prior reports unchanged.' } });
  return { clientId: source.originClientId, duplicate: false };
}
