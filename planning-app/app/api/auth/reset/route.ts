import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tokenHash } from '@/lib/auth/crypto';
import { ApiError, errorResponse, jsonBody, noStore, requireTrustedOrigin } from '@/lib/auth/http';
import { enforceRateLimit } from '@/lib/auth/rate-limit';
import { PASSWORD_LENGTH_MESSAGE, validPasswordLength } from '@/lib/auth/password-policy';

export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const body = await jsonBody(request);
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!token) throw new ApiError(400, 'Invalid or expired reset link.');
    if (!validPasswordLength(password)) throw new ApiError(400, PASSWORD_LENGTH_MESSAGE);
    await enforceRateLimit('reset-token', token, 5, 15 * 60_000);
    const passwordHash = await bcrypt.hash(password, 12);
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      const reset = await tx.passwordResetToken.findUnique({ where: { tokenHash: tokenHash(token) } });
      if (!reset || reset.usedAt || reset.expiresAt <= now) throw new ApiError(400, 'Invalid or expired reset link.');
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: reset.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (!claimed.count) throw new ApiError(400, 'Invalid or expired reset link.');
      await tx.advisor.update({ where: { id: reset.advisorId }, data: { passwordHash } });
      await tx.advisorSession.updateMany({ where: { advisorId: reset.advisorId, revokedAt: null }, data: { revokedAt: now } });
      await tx.authChallenge.updateMany({ where: { advisorId: reset.advisorId, consumedAt: null }, data: { consumedAt: now } });
    });
    return noStore(NextResponse.json({ ok: true }));
  } catch (error) { return errorResponse(error); }
}
