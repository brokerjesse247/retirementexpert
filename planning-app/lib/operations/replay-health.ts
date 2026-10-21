import { db } from '@/lib/db';

/** No writes, nonce consumption, email dispatch or sensitive database output. */
export async function verifyDatabaseReplayStorage(): Promise<boolean> {
  try {
    await db.operationsReplayNonce.count();
    const indexes = await db.$queryRaw<Array<{ COLUMN_NAME: string; NON_UNIQUE: number | bigint }>>`
      SELECT COLUMN_NAME, NON_UNIQUE
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'OperationsReplayNonce'
        AND INDEX_NAME = 'PRIMARY'
    `;
    return indexes.length === 1 && indexes[0].COLUMN_NAME === 'fingerprint'
      && Number(indexes[0].NON_UNIQUE) === 0;
  } catch {
    return false;
  }
}
