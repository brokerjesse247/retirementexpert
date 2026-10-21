import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, noStore } from '@/lib/auth/http';
import { authorizeOperationsDispatch, dispatchOperationsJobs } from '@/lib/operations/jobs';
import { databaseReplayStore } from '@/lib/operations/replay-store';

export async function POST(request: NextRequest) {
  try {
    await authorizeOperationsDispatch({ headers: request.headers, method: request.method, pathname: request.nextUrl.pathname, replayStore: databaseReplayStore });
    const { deliverDueOutbox } = await import('@/lib/services/email');
    const { deliverDueReports } = await import('@/lib/reports/service');
    if (process.env.OPERATIONS_ANNUAL_REVIEW_QUEUE_APPROVED === 'true') {
      const { queueDueAnnualReviewReminders } = await import('@/lib/annual-review/service');
      await queueDueAnnualReviewReminders();
    }
    const result = await dispatchOperationsJobs({ deliverDueOutbox, deliverDueReports });
    return noStore(NextResponse.json({ ok: true, result }));
  } catch (error) { return errorResponse(error); }
}
