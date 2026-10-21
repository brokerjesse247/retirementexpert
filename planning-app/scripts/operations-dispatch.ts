import { randomBytes } from 'node:crypto';
import { signOperationsDispatch } from '../lib/operations/jobs';

export async function runOperationsDispatch(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<{ httpStatus: number }> {
  const secret = env.OPERATIONS_CRON_HMAC_SECRET;
  if (!secret || secret.length < 32) throw new Error('Scheduler signing authentication is missing.');
  const timestamp = String(Date.now());
  const nonce = randomBytes(24).toString('base64url');
  const signature = signOperationsDispatch({ timestamp, nonce, secret });
  const response = await fetcher('http://127.0.0.1:3117/api/operations/dispatch', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(300_000),
    headers: { 'x-operations-timestamp': timestamp, 'x-operations-nonce': nonce, 'x-operations-signature': signature },
  });
  if (!response.ok) throw new Error(`Scheduled dispatch failed: HTTP ${response.status}.`);
  // No response body is printed: this script needs only transport success.
  await response.body?.cancel();
  return { httpStatus: response.status };
}

if (process.argv[1]?.endsWith('operations-dispatch.ts')) {
  runOperationsDispatch().then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(() => {
    process.stderr.write('Signed operations dispatch failed.\n'); process.exitCode = 1;
  });
}
