import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { decryptText } from './crypto';

const ISSUER = 'LSRT Insurance';

function totpFor(secret: string, label: string) {
  return new OTPAuth.TOTP({ issuer: ISSUER, label, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
}

export async function enrollmentForSecret(secret: string, email: string) {
  const uri = totpFor(secret, email).toString();
  return { secret, uri, qrDataUrl: await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 256 }) };
}

export async function createEnrollment(email: string) {
  return enrollmentForSecret(new OTPAuth.Secret({ size: 20 }).base32, email);
}

export function verifyTotp(encryptedSecret: string, email: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return totpFor(decryptText(encryptedSecret), email).validate({ token: code, window: 1 }) !== null;
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => `${cryptoRandom(5)}-${cryptoRandom(5)}`.toUpperCase());
}
function cryptoRandom(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(code, 12)));
}

export async function consumeRecoveryCode(serialized: string | null, supplied: string): Promise<{ ok: boolean; remaining: string[] }> {
  const hashes: string[] = serialized ? JSON.parse(serialized) : [];
  const normalized = supplied.trim().toUpperCase();
  for (let index = 0; index < hashes.length; index += 1) {
    if (await bcrypt.compare(normalized, hashes[index])) return { ok: true, remaining: hashes.filter((_, i) => i !== index) };
  }
  return { ok: false, remaining: hashes };
}
