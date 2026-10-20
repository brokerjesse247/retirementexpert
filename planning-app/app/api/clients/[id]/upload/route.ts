import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createDownloadGrant } from '@/lib/services/uploads';
import { errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { requireAdvisor } from '@/lib/auth/session';

async function ownedClient(id: string, advisorId: string) {
  return db.client.findFirst({ where: { id, advisorId }, include: { upload: { select: { id: true, name: true, size: true } } } });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await context.params;
    const client = await ownedClient(id, session.advisor.id);
    if (!client) return noStore(NextResponse.json({ error: 'Client not found.' }, { status: 404 }));
    return noStore(NextResponse.json({ upload: client.upload }));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = await jsonBody(request);
    requireCsrf(session.csrfToken, body.csrfToken);
    const { id } = await context.params;
    const client = await ownedClient(id, session.advisor.id);
    if (!client || !client.upload) return noStore(NextResponse.json({ error: 'Upload not found.' }, { status: 404 }));
    return noStore(NextResponse.json({ downloadUrl: `/api/uploads/${client.upload.id}?token=${encodeURIComponent(createDownloadGrant(client.upload.id, session.advisor.id))}` }));
  } catch (error) { return errorResponse(error); }
}
