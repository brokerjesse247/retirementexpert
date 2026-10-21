import dotenv from 'dotenv';
import { dispatchOutboxIfApproved } from '../lib/operations/jobs';

dotenv.config({ path: '.env.local', quiet: true });

async function main() {
  const { deliverDueOutbox } = await import('../lib/services/email');
  const result = await dispatchOutboxIfApproved({ deliverDueOutbox });
  process.stdout.write(JSON.stringify(result) + '\n');
}
main().catch(() => { process.stderr.write('Email worker is held or delivery could not be completed.\n'); process.exitCode = 1; });
