import { signPayload, constantTimeEqual } from '../auth/crypto';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function validPdfName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}\.pdf$/i.test(name) && !name.includes('..');
}

export function assertPdfUpload(name: string, mimeType: string, bytes: Uint8Array): void {
  if (!validPdfName(name) || mimeType !== 'application/pdf' || bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) throw new Error('INVALID_UPLOAD');
  const header = Buffer.from(bytes.subarray(0, 5)).toString('ascii');
  if (header !== '%PDF-') throw new Error('INVALID_UPLOAD');
}

type DownloadGrant = { uploadId: string; advisorId: string; expiresAt: number };

/** No PII is embedded: upload and advisor opaque IDs plus a five-minute expiry are MACed. */
export function createDownloadGrant(uploadId: string, advisorId: string): string {
  const payload = Buffer.from(JSON.stringify({ uploadId, advisorId, expiresAt: Date.now() + 5 * 60_000 } satisfies DownloadGrant)).toString('base64url');
  return `${payload}.${signPayload(payload)}`;
}

export function verifyDownloadGrant(token: string, uploadId: string, advisorId: string): boolean {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !constantTimeEqual(signPayload(payload), signature)) return false;
  try {
    const grant = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as DownloadGrant;
    return grant.uploadId === uploadId && grant.advisorId === advisorId && Number.isSafeInteger(grant.expiresAt) && grant.expiresAt > Date.now();
  } catch { return false; }
}
