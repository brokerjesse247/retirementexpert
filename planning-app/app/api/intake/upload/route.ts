import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { encryptBytes } from '@/lib/auth/crypto';
import { ApiError, clientRateLimitKey, errorResponse, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { requireDraft } from '@/lib/services/drafts';
import { assertPdfUpload, MAX_UPLOAD_BYTES } from '@/lib/services/uploads';
import { enforceRateLimit } from '@/lib/auth/rate-limit';
import { assertProductionIntakeAllowed } from '@/lib/operations/status';

export async function GET(request: NextRequest) {
  try {
    const context = await requireDraft(request);
    const upload = await db.upload.findUnique({ where: { draftId: context.draft.id }, select: { id: true, name: true, size: true } });
    return noStore(NextResponse.json({ upload }));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    assertProductionIntakeAllowed();
    const context = await requireDraft(request);
    if (context.draft.submittedAt) throw new ApiError(409, 'This intake has already been submitted.');
    if (context.draft.originClientId) throw new ApiError(422, 'Your existing SSA document is retained. Contact your advisor if it needs updating.');
    const advertisedLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(advertisedLength) && advertisedLength > MAX_UPLOAD_BYTES + 64 * 1024) throw new ApiError(413, 'Upload is too large.');
    await enforceRateLimit('intake-upload-ip', clientRateLimitKey(request), 12, 60 * 60_000);
    await enforceRateLimit('intake-upload-draft', context.draft.id, 6, 60 * 60_000);
    const form = await request.formData();
    requireCsrf(context.draft.csrfToken, form.get('csrfToken'));
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError(400, 'Choose a PDF file to upload.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    try { assertPdfUpload(file.name, file.type, bytes); } catch { throw new ApiError(400, 'Only a valid PDF under 5 MiB may be uploaded.'); }
    const upload = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.upload.deleteMany({ where: { draftId: context.draft.id } });
      return tx.upload.create({ data: { draftId: context.draft.id, name: file.name, mimeType: file.type, size: file.size, encryptedBytes: Uint8Array.from(encryptBytes(bytes)) } });
    });
    return noStore(NextResponse.json({ id: upload.id, name: upload.name, size: upload.size }));
  } catch (error) { return errorResponse(error); }
}
