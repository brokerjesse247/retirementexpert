import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { appendFile, chmod, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { finished, pipeline } from 'node:stream/promises';
import { BACKUP_HEADER_BYTES, BACKUP_TAG_BYTES, backupEncryptionKey } from './backup-crypto';

const MAGIC = Buffer.from('RPBK1', 'ascii');
const FILE_PATTERN = /^retireplan-\d{8}T\d{6}Z\.sql\.aesgcm$/;
type Environment = Record<string, string | undefined>;

function required(env: Environment, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

export function retentionDays(env: Environment = process.env): number {
  const value = Number(required(env, 'BACKUP_RETENTION_DAYS'));
  if (!Number.isInteger(value) || value < 7 || value > 365) throw new Error('BACKUP_RETENTION_DAYS must be an integer from 7 through 365.');
  return value;
}

function backupDirectory(env: Environment): string {
  const directory = path.resolve(required(env, 'BACKUP_OUTPUT_DIR'));
  if (directory.split(path.sep).includes('public')) throw new Error('Backup output must not be under a public directory.');
  return directory;
}

function database(urlValue: string): { host: string; port: string; user: string; password: string; name: string } {
  let url: URL;
  try { url = new URL(urlValue); } catch { throw new Error('DATABASE_URL is invalid.'); }
  if (!['mysql:', 'mariadb:'].includes(url.protocol) || !url.hostname || !url.username || !url.pathname || url.pathname === '/') throw new Error('DATABASE_URL is not a MariaDB connection URL.');
  return { host: url.hostname, port: url.port || '3306', user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), name: decodeURIComponent(url.pathname.slice(1)) };
}

export function assertBackupCreateAllowed(env: Environment = process.env): void {
  if (env.BACKUP_EXECUTE !== 'true') throw new Error('Backup execution is disabled; set BACKUP_EXECUTE=true only in the approved job environment.');
  if (env.NODE_ENV === 'production' && env.BACKUP_APPROVED !== 'true') throw new Error('Production backup requires BACKUP_APPROVED=true.');
  if (env.NODE_ENV === 'production' && env.BACKUP_RETENTION_APPROVED !== 'true') throw new Error('Production backup retention requires BACKUP_RETENTION_APPROVED=true.');
  backupEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
  retentionDays(env);
  backupDirectory(env);
  database(required(env, 'DATABASE_URL'));
}

/** Deletes only recognized encrypted backup files outside the approved retention window. */
export async function pruneEncryptedBackups(directory: string, days: number, now = Date.now()): Promise<number> {
  const cutoff = now - days * 24 * 60 * 60_000;
  let removed = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !FILE_PATTERN.test(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if ((await stat(target)).mtimeMs < cutoff) {
      await rm(target, { force: true });
      removed += 1;
    }
  }
  return removed;
}

function utcFileStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function waitForDump(child: ReturnType<typeof spawn>): Promise<void> {
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => { if (stderr.length < 512) stderr += chunk.toString('utf8', 0, 512 - stderr.length); });
  const [code] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolve([exitCode, signal]));
  });
  // Never emit stderr: it can contain infrastructure details. The generic error is safe.
  void stderr;
  if (code !== 0) throw new Error('MariaDB dump failed.');
}

export async function createEncryptedBackup(env: Environment = process.env, now = new Date()): Promise<{ file: string; pruned: number }> {
  assertBackupCreateAllowed(env);
  const directory = backupDirectory(env);
  const connection = database(required(env, 'DATABASE_URL'));
  const key = backupEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const fileName = `retireplan-${utcFileStamp(now)}.sql.aesgcm`;
  const finalFile = path.join(directory, fileName);
  const temporaryFile = path.join(directory, `.${fileName}.tmp`);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const output = createWriteStream(temporaryFile, { mode: 0o600, flags: 'wx' });
  const command = env.MARIADB_DUMP_BIN || 'mariadb-dump';
  const compatibilityArgs = path.basename(command) === 'mysqldump' ? ['--no-tablespaces', '--set-gtid-purged=OFF'] : [];
  const dump = spawn(command, ['--single-transaction', '--skip-comments', ...compatibilityArgs, '--host', connection.host, '--port', connection.port, '--user', connection.user, connection.name], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MYSQL_PWD: connection.password },
  });
  try {
    output.write(Buffer.concat([MAGIC, iv]));
    await Promise.all([pipeline(dump.stdout!, cipher, output), waitForDump(dump)]);
    await appendFile(temporaryFile, cipher.getAuthTag(), { mode: 0o600 });
    await chmod(temporaryFile, 0o600);
    await rename(temporaryFile, finalFile);
    const pruned = await pruneEncryptedBackups(directory, retentionDays(env));
    return { file: finalFile, pruned };
  } catch (error) {
    dump.kill('SIGTERM');
    await rm(temporaryFile, { force: true });
    throw error;
  } finally {
    // These exports make the backup envelope format explicit to the streaming restore script.
    void BACKUP_HEADER_BYTES;
    void BACKUP_TAG_BYTES;
    await finished(output).catch(() => undefined);
  }
}

async function main() {
  dotenv.config({ path: '.env.local', quiet: true });
  if (process.argv.includes('--dry-run')) {
    retentionDays(process.env);
    backupEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
    backupDirectory(process.env);
    process.stdout.write(JSON.stringify({ ok: true, mode: 'dry-run', operation: 'encrypted-backup' }) + '\n');
    return;
  }
  const result = await createEncryptedBackup();
  process.stdout.write(JSON.stringify({ ok: true, file: path.basename(result.file), pruned: result.pruned }) + '\n');
}

if (process.argv[1]?.endsWith('backup-create.ts')) main().catch(() => { process.stderr.write('Encrypted backup failed.\n'); process.exitCode = 1; });
