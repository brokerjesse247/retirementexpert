import crypto from 'node:crypto';

export class SecurityConfigurationError extends Error {}

function encryptionKey(): Buffer {
  const value = process.env.DATA_ENCRYPTION_KEY;
  if (!value) throw new SecurityConfigurationError('Encryption is not configured');
  const key = /^[a-fA-F0-9]{64}$/.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new SecurityConfigurationError('Encryption is not configured');
  return key;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Authenticated AES-256-GCM envelope. The database never receives plaintext intake/client JSON. */
export function encryptText(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptText(envelope: string): string {
  const [version, ivPart, tagPart, bodyPart] = envelope.split('.');
  if (version !== 'v1' || !ivPart || !tagPart || !bodyPart) throw new SecurityConfigurationError('Encrypted data is invalid');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(bodyPart, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new SecurityConfigurationError('Encrypted data is invalid');
  }
}

export function encryptJson(value: unknown): string {
  return encryptText(JSON.stringify(value));
}

export function decryptJson<T>(value: string): T {
  return JSON.parse(decryptText(value)) as T;
}

/** Binary form for LongBlob uploads: version byte + IV + tag + ciphertext. */
export function encryptBytes(input: Uint8Array): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
}

export function decryptBytes(envelope: Uint8Array): Buffer {
  const data = Buffer.from(envelope);
  if (data.length < 30 || data[0] !== 1) throw new SecurityConfigurationError('Encrypted upload is invalid');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(1, 13));
    decipher.setAuthTag(data.subarray(13, 29));
    return Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]);
  } catch {
    throw new SecurityConfigurationError('Encrypted upload is invalid');
  }
}

/** HMAC is keyed with the separately managed encryption key; signed links carry no PII. */
export function signPayload(payload: string): string {
  return crypto.createHmac('sha256', encryptionKey()).update(payload).digest('base64url');
}
