import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { type IntakeData, draftSchema } from '@/lib/intake/schema';
import { encryptJson } from '@/lib/auth/crypto';
import { ApiError, clientRateLimitKey, DRAFT_COOKIE, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin, setSessionCookie } from '@/lib/auth/http';
import { createDraft, draftResponse, requireDraft } from '@/lib/services/drafts';
import { enforceRateLimit } from '@/lib/auth/rate-limit';

function draftEmail(data: IntakeData): string | null {
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320 ? email : null;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireDraft(request);
    return noStore(NextResponse.json(draftResponse(context)));
  } catch (error) { return errorResponse(error); }
}

/** Creates an encrypted no-login draft only when this browser has no existing draft session. */
export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    // Apply this before allocation; the key is hashed by the persistent limiter.
    await enforceRateLimit('intake-draft-create-ip', clientRateLimitKey(request), 20, 60 * 60_000);
    try {
      const existing = await requireDraft(request);
      return noStore(NextResponse.json(draftResponse(existing)));
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
    const created = await createDraft();
    const response = NextResponse.json(draftResponse({ draft: created.draft, data: created.data }));
    setSessionCookie(response, request, DRAFT_COOKIE, created.token);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const context = await requireDraft(request);
    if (context.draft.submittedAt) throw new ApiError(409, 'This intake has already been submitted.');
    const body = await jsonBody(request);
    requireCsrf(context.draft.csrfToken, body.csrfToken);
    const revision = typeof body.revision === 'number' && Number.isInteger(body.revision) ? body.revision : -1;
    const step = typeof body.step === 'number' && Number.isInteger(body.step) && body.step >= 1 && body.step <= 8 ? body.step : 0;
    if (!step || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new ApiError(400, 'Invalid draft update.');
    if (revision !== context.draft.revision) throw new ApiError(409, 'This draft was updated elsewhere. Reload and try again.');
    const checked = draftSchema.safeParse(body.data);
    if (!checked.success) throw new ApiError(422, 'Invalid draft data.');
    const data = checked.data as IntakeData;
    const updated = await db.intakeDraft.updateMany({
      where: { id: context.draft.id, revision, submittedAt: null },
      data: { encryptedData: encryptJson(data), email: draftEmail(data), step, revision: { increment: 1 } },
    });
    if (!updated.count) throw new ApiError(409, 'This draft was updated elsewhere. Reload and try again.');
    const fresh = await db.intakeDraft.findUniqueOrThrow({ where: { id: context.draft.id } });
    const response = NextResponse.json(draftResponse({ draft: fresh, data }));
    setSessionCookie(response, request, DRAFT_COOKIE, context.token);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
