import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, noStore } from '@/lib/auth/http';
import { requireAdvisor } from '@/lib/auth/session';
import { collectOperationsStatus, type OutboxCounts } from '@/lib/operations/status';
import { verifyDatabaseReplayStorage } from '@/lib/operations/replay-health';

async function loadOutboxCounts(): Promise<OutboxCounts> {
  const groups = await db.emailOutbox.groupBy({
    by: ['status'],
    _count: { _all: true },
    where: { status: { in: ['PENDING', 'RETRY', 'FAILED'] } },
  });
  const count = (statuses: string[]) => groups
    .filter((group) => statuses.includes(group.status))
    .reduce((total, group) => total + group._count._all, 0);
  return { pending: count(['PENDING', 'RETRY']), failed: count(['FAILED']) };
}

/** Advisor-only operational state. It intentionally returns no recipients, bodies, token values, or provider metadata. */
export async function GET(request: NextRequest) {
  try {
    await requireAdvisor(request);
    const status = await collectOperationsStatus({ loadOutboxCounts, verifyReplayStorage: verifyDatabaseReplayStorage });
    return noStore(NextResponse.json({ status }));
  } catch (error) {
    return errorResponse(error);
  }
}
