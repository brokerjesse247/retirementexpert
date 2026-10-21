import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { createEncryptedBackup } from './backup-create';
import { restoreEncryptedBackup } from './backup-restore';

let stage = 'configuration';
async function main() {
  const env: Record<string,string|undefined> = { ...process.env, ...dotenv.parse(readFileSync('.env.test')), ...dotenv.parse(readFileSync('.env.backup-test')), NODE_ENV: 'test', BACKUP_EXECUTE: 'true', BACKUP_RETENTION_DAYS: '30', BACKUP_OUTPUT_DIR: '/home/ubuntu/retireplan/private-storage/backup-drill' };
  if (!new URL(env.DATABASE_URL!).pathname.endsWith('/retireplan_test') || !new URL(env.BACKUP_RESTORE_DATABASE_URL!).pathname.endsWith('/retireplan_restore_test')) throw new Error('Backup drill is restricted to dedicated test databases.');
  const source = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const target = new PrismaClient({ datasources: { db: { url: env.BACKUP_RESTORE_DATABASE_URL } } });
  const fingerprint = 'f'.repeat(64);
  try {
    stage = 'source-marker';
    await source.operationsReplayNonce.upsert({ where: { fingerprint }, create: { fingerprint, expiresAt: new Date(Date.now() + 60000) }, update: {} });
    const before = await source.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE()`;
    stage = 'encrypted-dump';
    const backup = await createEncryptedBackup(env);
    stage = 'authenticated-restore';
    await restoreEncryptedBackup(backup.file, env);
    stage = 'restore-verification';
    const after = await target.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE()`;
    if (String(before[0].count) !== String(after[0].count)) throw new Error('Restored table count mismatch.');
    if (!await target.operationsReplayNonce.findUnique({ where: { fingerprint } })) throw new Error('Restore marker not found.');
    await source.operationsReplayNonce.deleteMany({ where: { fingerprint } });
    await target.operationsReplayNonce.deleteMany({ where: { fingerprint } });
    await rm(backup.file);
    console.log('PASS: authenticated encrypted SQL backup restored successfully to an isolated test database; tables and marker match. No production data was accessed.');
  } finally { await source.$disconnect(); await target.$disconnect(); }
}
main().catch(() => { console.error(`Test-only backup restore drill failed at ${stage}.`); process.exitCode = 1; });
