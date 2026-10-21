import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BACKUP_HEADER_BYTES, BACKUP_TAG_BYTES, backupEncryptionKey } from './backup-crypto';

type Environment = Record<string, string | undefined>;

function restoreConnection(value: string): { host: string; port: string; user: string; password: string; name: string } {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('BACKUP_RESTORE_DATABASE_URL is invalid.'); }
  if (!['mysql:', 'mariadb:'].includes(url.protocol) || !url.hostname || !url.username || !url.pathname || url.pathname === '/') throw new Error('BACKUP_RESTORE_DATABASE_URL is not a MariaDB connection URL.');
  return { host: url.hostname, port: url.port || '3306', user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), name: decodeURIComponent(url.pathname.slice(1)) };
}

export function assertRestoreTargetAllowed(env: Environment = process.env): void {
  const target = restoreConnection(env.BACKUP_RESTORE_DATABASE_URL ?? '');
  const testTarget = env.NODE_ENV === 'test' && /(?:^|_)test$/i.test(target.name);
  if (testTarget) return;
  const danger = env.ALLOW_PRODUCTION_RESTORE === 'DANGER_I_UNDERSTAND_PRODUCTION_RESTORE';
  if (!danger || env.BACKUP_RESTORE_APPROVED !== 'true') throw new Error('Restore is limited to an isolated test database unless explicit production danger approval is configured.');
}

async function decryptStream(source: string, keyValue: string | undefined, destination: Writable): Promise<void> {
  const info = await stat(source);
  if (info.size < BACKUP_HEADER_BYTES + BACKUP_TAG_BYTES) throw new Error('Invalid backup envelope.');
  const handle = await open(source, 'r');
  try {
    const header = Buffer.alloc(BACKUP_HEADER_BYTES);
    const tag = Buffer.alloc(BACKUP_TAG_BYTES);
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, info.size - BACKUP_TAG_BYTES);
    if (header.subarray(0, 5).toString('ascii') !== 'RPBK1') throw new Error('Invalid backup envelope.');
    const decipher = createDecipheriv('aes-256-gcm', backupEncryptionKey(keyValue), header.subarray(5));
    decipher.setAuthTag(tag);
    await pipeline(createReadStream(source, { start: BACKUP_HEADER_BYTES, end: info.size - BACKUP_TAG_BYTES - 1 }), decipher, destination);
  } finally {
    await handle.close();
  }
}

/** Authenticates and decrypts an artifact without connecting to a database. */
export async function verifyEncryptedBackup(source: string, keyValue: string | undefined): Promise<void> {
  await decryptStream(source, keyValue, new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
}

export async function restoreEncryptedBackup(source: string, env: Environment = process.env): Promise<void> {
  assertRestoreTargetAllowed(env);
  // GCM authenticates at stream end. Verify first, before starting a SQL process.
  await verifyEncryptedBackup(source, env.BACKUP_ENCRYPTION_KEY);
  const connection = restoreConnection(env.BACKUP_RESTORE_DATABASE_URL ?? '');
  const command = env.MARIADB_BIN || 'mariadb';
  const restore = spawn(command, ['--host', connection.host, '--port', connection.port, '--user', connection.user, connection.name], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MYSQL_PWD: connection.password },
  });
  let stderr = '';
  restore.stderr?.on('data', (chunk: Buffer) => { if (stderr.length < 512) stderr += chunk.toString('utf8', 0, 512 - stderr.length); });
  try {
    await Promise.all([
      decryptStream(source, env.BACKUP_ENCRYPTION_KEY, restore.stdin!),
      new Promise<void>((resolve, reject) => {
        restore.once('error', reject);
        restore.once('close', (code) => code === 0 ? resolve() : reject(new Error('MariaDB restore failed.')));
      }),
    ]);
  } finally {
    void stderr;
    restore.kill('SIGTERM');
  }
}

async function main() {
  dotenv.config({ path: '.env.local', quiet: true });
  const source = process.argv.find((value) => value.endsWith('.aesgcm'));
  if (!source) throw new Error('Provide one encrypted backup artifact path.');
  if (!process.argv.includes('--execute')) {
    await verifyEncryptedBackup(source, process.env.BACKUP_ENCRYPTION_KEY);
    process.stdout.write(JSON.stringify({ ok: true, mode: 'dry-run', file: path.basename(source) }) + '\n');
    return;
  }
  await restoreEncryptedBackup(source);
  process.stdout.write(JSON.stringify({ ok: true, mode: 'restore-complete', file: path.basename(source) }) + '\n');
}

if (process.argv[1]?.endsWith('backup-restore.ts')) main().catch(() => { process.stderr.write('Encrypted restore failed.\n'); process.exitCode = 1; });
