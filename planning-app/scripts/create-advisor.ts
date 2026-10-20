import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '.env.local', quiet: true });

async function readSecret(): Promise<string> {
  if (process.env.ADVISOR_PASSWORD) return process.env.ADVISOR_PASSWORD;
  if (process.stdin.isTTY) {
    process.stderr.write('Advisor password (input is not echoed): ');
    process.stdin.setRawMode?.(true);
  }
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { value += chunk; });
    process.stdin.on('end', () => resolve(value.trim()));
    process.stdin.on('error', reject);
    // Non-interactive callers must close stdin, preventing accidental default credentials.
    if (process.stdin.isTTY) process.stdin.resume();
  });
}

async function main() {
  const name = process.env.ADVISOR_NAME?.trim() ?? '';
  const email = process.env.ADVISOR_EMAIL?.trim().toLowerCase() ?? '';
  if (!name || name.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADVISOR_NAME and ADVISOR_EMAIL are required.');
  const password = await readSecret();
  if (password.length < 12 || password.length > 200) throw new Error('A password of 12–200 characters is required.');
  const { db } = await import('@/lib/db');
  try {
    const existing = await db.advisor.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new Error('An advisor with that email already exists.');
    const advisor = await db.advisor.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 12) }, select: { id: true, email: true } });
    // No password, secret, QR URI, or recovery codes are printed.
    process.stdout.write(JSON.stringify(advisor) + '\n');
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { process.stderr.write(`Unable to create advisor: ${error instanceof Error ? error.message : 'unknown error'}\n`); process.exitCode = 1; });
