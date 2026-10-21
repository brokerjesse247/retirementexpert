import { ClientStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/auth/crypto';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin, setSessionCookie } from '@/lib/auth/http';
import { requireAdvisor } from '@/lib/auth/session';
import { intakeSchema, type IntakeData } from '@/lib/intake/schema';
import { clientStatus } from '@/lib/services/clients';
import { intakeIdentity, normalizedIntake } from '@/lib/services/normalize';

function fields(issues: Array<{ path: (string | number)[]; message: string }>) { const out: Record<string, string> = {}; for (const issue of issues) out[issue.path.join('.')] ??= issue.message; return out; }
async function owned(id: string, advisorId: string) { return db.client.findFirst({ where: { id, advisorId } }); }

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await context.params;
    const client = await owned(id, session.advisor.id);
    if (!client) throw new ApiError(404, 'Client not found.');
    const response = NextResponse.json({ client: { id: client.id, name: `${client.firstName} ${client.lastName}`.trim(), email: client.email, status: client.status, submittedAt: client.submittedAt, updatedAt: client.updatedAt, nextReviewDate: client.nextReviewDate }, data: decryptJson<IntakeData>(client.encryptedData), csrfToken: session.csrfToken, revision: client.revision });
    setSessionCookie(response, request, 'rp_advisor_session', request.cookies.get('rp_advisor_session')!.value);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = await jsonBody(request);
    requireCsrf(session.csrfToken, body.csrfToken);
    const { id } = await context.params;
    const revision = typeof body.revision === 'number' && Number.isInteger(body.revision) ? body.revision : -1;
    const existing = await owned(id, session.advisor.id);
    if (!existing) throw new ApiError(404, 'Client not found.');
    const status = typeof body.status === 'string' ? (body.status === existing.status ? existing.status : clientStatus(body.status)) : undefined;
    if (!status) throw new ApiError(400, 'Invalid client status.');
    if (status !== existing.status && ['REPORT_GENERATED', 'PRESENTED', 'IMPLEMENTING'].includes(status)) throw new ApiError(422, 'Use Reports or Annual review to record generation, presentation or implementation.');
    const parsed = intakeSchema.safeParse(body.data);
    if (!parsed.success) throw new ApiError(422, 'Please correct the highlighted fields.', fields(parsed.error.issues));
    const data = parsed.data as IntakeData;
    const identity = intakeIdentity(data);
    const updated = await db.$transaction(async (tx) => {
      const claim = await tx.client.updateMany({ where: { id, advisorId: session.advisor.id, revision }, data: { ...identity, status: status as ClientStatus, encryptedData: encryptJson(data), revision: { increment: 1 } } });
      if (!claim.count) return false;
      await tx.client.update({ where: { id }, data: normalizedIntake(data) });
      await tx.auditLog.create({ data: { advisorId: session.advisor.id, clientId: id, action: 'CLIENT_PROFILE_EDITED', entity: 'Client', entityId: id, summary: 'Advisor updated client profile.' } });
      return true;
    });
    if (!updated) {
      if (!await owned(id, session.advisor.id)) throw new ApiError(404, 'Client not found.');
      throw new ApiError(409, 'This client was updated elsewhere. Reload and try again.');
    }
    const response = NextResponse.json({ ok: true, revision: revision + 1 });
    setSessionCookie(response, request, 'rp_advisor_session', request.cookies.get('rp_advisor_session')!.value);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
