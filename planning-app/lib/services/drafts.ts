import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { emptyIntake, type IntakeData } from '@/lib/intake/schema';
import { safeDraftStep } from '@/lib/intake/navigation';
import { decryptJson, encryptJson, randomToken, tokenHash } from '@/lib/auth/crypto';
import { ApiError } from '@/lib/auth/http';
import { getDraftSessionToken } from '@/lib/auth/session';

export type DraftContext = { draft: Awaited<ReturnType<typeof db.intakeDraft.findUniqueOrThrow>>; token: string; data: IntakeData };

export async function createDraft(): Promise<{ token: string; draft: Awaited<ReturnType<typeof db.intakeDraft.create>>; data: IntakeData }> {
  const token = randomToken();
  const draft = await db.intakeDraft.create({ data: { sessionTokenHash: tokenHash(token), csrfToken: randomToken(), encryptedData: encryptJson(emptyIntake), step: 1, revision: 0 } });
  return { token, draft, data: emptyIntake };
}

export async function requireDraft(request: NextRequest): Promise<DraftContext> {
  const token = await getDraftSessionToken(request);
  if (!token) throw new ApiError(404, 'Draft not found.');
  const draft = await db.intakeDraft.findUnique({ where: { sessionTokenHash: tokenHash(token) } });
  if (!draft) throw new ApiError(404, 'Draft not found.');
  if (draft.originClientId) {
    if (!draft.updateExpiresAt || draft.updateExpiresAt <= new Date()) throw new ApiError(410, 'This annual update link expired. Ask your advisor for a fresh link.');
    const origin = await db.client.findFirst({ where: { id: draft.originClientId, advisorId: draft.originAdvisorId ?? '', status: { not: 'ARCHIVED' } }, select: { id: true } });
    if (!origin) throw new ApiError(410, 'This annual update is no longer available.');
  }
  return { draft, token, data: decryptJson<IntakeData>(draft.encryptedData) };
}

export function draftResponse(context: { draft: { step: number; revision: number; submittedAt: Date | null; csrfToken: string; originClientId?: string | null }; data: IntakeData }) {
  const step = context.draft.submittedAt ? context.draft.step : safeDraftStep(context.data, context.draft.step);
  return { data: context.data, step, revision: context.draft.revision, submitted: Boolean(context.draft.submittedAt), annualUpdate: Boolean(context.draft.originClientId), csrfToken: context.draft.csrfToken };
}
