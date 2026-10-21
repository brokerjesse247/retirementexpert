import { describe, expect, it } from 'vitest';
import { decryptBackupBytes, encryptBackupBytes } from '../scripts/backup-crypto';
import { assertRestoreTargetAllowed } from '../scripts/backup-restore';

describe('encrypted backup safeguards', () => {
  const key = Buffer.alloc(32, 19).toString('base64');

  it('round-trips backup bytes with authenticated encryption and rejects a tampered artifact', () => {
    const plaintext = Buffer.from('CREATE TABLE private_client_data (id INT);');
    const encrypted = encryptBackupBytes(plaintext, key);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptBackupBytes(encrypted, key)).toEqual(plaintext);
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptBackupBytes(tampered, key)).toThrow('Backup authentication failed.');
  });

  it('allows actual restore targets only for isolated test databases by default', () => {
    expect(() => assertRestoreTargetAllowed({ NODE_ENV: 'test', BACKUP_RESTORE_DATABASE_URL: 'mysql://user:password@db.example.test/retireplan_test' })).not.toThrow();
    expect(() => assertRestoreTargetAllowed({ NODE_ENV: 'production', BACKUP_RESTORE_DATABASE_URL: 'mysql://user:password@db.example.test/retireplan' })).toThrow('Restore is limited');
  });
});
