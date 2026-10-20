import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const rawLimit = Number(process.env.EMAIL_WORKER_LIMIT ?? '25');
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 25;
  const { deliverDueOutbox } = await import('@/lib/services/email');
  // A deliberate single durable pass. Invoke from host scheduler/worker infrastructure; never create a dev timer.
  const result = await deliverDueOutbox(limit);
  process.stdout.write(JSON.stringify(result) + '\n');
}

main().catch((error) => { process.stderr.write(`Email worker failed: ${error instanceof Error ? error.message : 'unknown error'}\n`); process.exitCode = 1; });
