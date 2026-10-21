import dotenv from 'dotenv';
import { collectOperationsStatus, redactOperationsDiagnostic } from '@/lib/operations/status';

dotenv.config({ path: '.env.local', quiet: true });

async function main() {
  const status = await collectOperationsStatus({
    // This script never opens the application database. The status route supplies live aggregate counts.
    loadOutboxCounts: async () => ({ pending: null, failed: null }),
  });
  process.stdout.write(JSON.stringify(redactOperationsDiagnostic(status)) + '\n');
  if (status.provider.state !== 'VERIFIED') process.exitCode = 2;
}

main().catch(() => {
  process.stderr.write('Operations verification failed.\n');
  process.exitCode = 1;
});
