import crypto from 'node:crypto';

const MAGIC = Buffer.from('RPBK1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function backupEncryptionKey(value: string | undefined): Buffer {
  if (!value) throw new Error('BACKUP_ENCRYPTION_KEY is required.');
  const key = /^[a-fA-F0-9]{64}$/.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be a 32-byte base64 or hex value.');
  return key;
}

/** Format: fixed magic + 96-bit IV + AES-256-GCM ciphertext + 128-bit tag. */
export function encryptBackupBytes(plaintext: Uint8Array, keyValue: string | undefined): Buffer {
  const key = backupEncryptionKey(keyValue);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, iv, ciphertext, cipher.getAuthTag()]);
}

export function decryptBackupBytes(envelope: Uint8Array, keyValue: string | undefined): Buffer {
  const data = Buffer.from(envelope);
  const headerLength = MAGIC.length + IV_BYTES;
  if (data.length < headerLength + TAG_BYTES || !data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid backup envelope.');
  const key = backupEncryptionKey(keyValue);
  const iv = data.subarray(MAGIC.length, headerLength);
  const tag = data.subarray(data.length - TAG_BYTES);
  const ciphertext = data.subarray(headerLength, data.length - TAG_BYTES);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Backup authentication failed.');
  }
}

export const BACKUP_HEADER_BYTES = MAGIC.length + IV_BYTES;
export const BACKUP_TAG_BYTES = TAG_BYTES;
