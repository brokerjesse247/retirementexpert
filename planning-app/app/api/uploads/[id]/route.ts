import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decryptBytes } from '@/lib/auth/crypto';
import { ApiError, errorResponse } from '@/lib/auth/http';
import { requireAdvisor } from '@/lib/auth/session';
import { verifyDownloadGrant } from '@/lib/services/uploads';

function attachmentName(name: string) { return name.replace(/[\\"\r\n]/g, '_'); }

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await context.params;
    const token = request.nextUrl.searchParams.get('token') ?? '';
    if (!verifyDownloadGrant(token, id, session.advisor.id)) throw new ApiError(403, 'Download link is invalid or expired.');
    const upload = await db.upload.findUnique({ where: { id }, include: { client: { select: { advisorId: true } } } });
    if (!upload || !upload.client || upload.client.advisorId !== session.advisor.id) throw new ApiError(404, 'Upload not found.');
    const bytes = decryptBytes(upload.encryptedBytes);
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${attachmentName(upload.name)}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return errorResponse(error); }
}
