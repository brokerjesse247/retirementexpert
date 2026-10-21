import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { loadEmailTemplates, saveEmailTemplates } from '@/lib/email-templates/service';
export async function GET(request: NextRequest) {
  try { const s = await requireAdvisor(request); return noStore(NextResponse.json({ ...await loadEmailTemplates(s.advisor.id), csrfToken: s.csrfToken })); } catch (error) { return errorResponse(error); }
}
const schema = z.object({ templates: z.unknown(), revision: z.number().int().nonnegative(), csrfToken: z.string() }).strict();
export async function PATCH(request: NextRequest) {
  try {
    requireTrustedOrigin(request); const s = await requireAdvisor(request);
    const checked = schema.safeParse(await jsonBody(request)); if (!checked.success) throw new ApiError(422, 'Invalid template update.');
    requireCsrf(s.csrfToken, checked.data.csrfToken);
    return noStore(NextResponse.json({ ...await saveEmailTemplates(s.advisor.id, checked.data.templates, checked.data.revision), csrfToken: s.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
