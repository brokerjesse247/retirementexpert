import { afterEach, describe, expect, it, vi } from 'vitest';
import { decryptBytes, decryptJson, encryptBytes, encryptJson } from '../lib/auth/crypto';
import { createDownloadGrant, validPdfName, verifyDownloadGrant } from '../lib/services/uploads';
import { csvValue } from '../lib/services/clients';
import { sendHostinger } from '../lib/services/email';

describe('backend security primitives', () => {
  const originalKey = process.env.DATA_ENCRYPTION_KEY;
  const originalToken = process.env.HOSTINGER_MAIL_API_TOKEN;
  const originalVerified = process.env.HOSTINGER_MAIL_SENDER_VERIFIED;

  afterEach(() => {
    process.env.DATA_ENCRYPTION_KEY = originalKey;
    process.env.HOSTINGER_MAIL_API_TOKEN = originalToken;
    process.env.HOSTINGER_MAIL_SENDER_VERIFIED = originalVerified;
    vi.unstubAllGlobals();
  });

  it('uses authenticated encryption for JSON and upload bytes', () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const json = encryptJson({ name: 'private', amount: '1000' });
    expect(json).not.toContain('private');
    expect(decryptJson(json)).toEqual({ name: 'private', amount: '1000' });
    const input = new Uint8Array([37, 80, 68, 70, 45]);
    const encrypted = encryptBytes(input);
    expect(encrypted.toString('utf8')).not.toContain('%PDF-');
    expect(Array.from(decryptBytes(encrypted))).toEqual(Array.from(input));
  });

  it('binds a download grant to one advisor and validates safe PDF names', () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    const grant = createDownloadGrant('upload_opaque', 'advisor_opaque');
    expect(verifyDownloadGrant(grant, 'upload_opaque', 'advisor_opaque')).toBe(true);
    expect(verifyDownloadGrant(grant, 'upload_opaque', 'another_advisor')).toBe(false);
    expect(validPdfName('statement.pdf')).toBe(true);
    expect(validPdfName('../statement.pdf')).toBe(false);
  });

  it('formula-protects CSV cells and only treats exactly 204 as delivered', async () => {
    expect(csvValue('=SUM(A1:A2)')).toBe("\"'=SUM(A1:A2)\"");
    process.env.HOSTINGER_MAIL_API_TOKEN = 'token';
    process.env.HOSTINGER_MAIL_SENDER_VERIFIED = 'true';
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendHostinger({ to: 'advisor@example.test', displayName: 'LSRT Insurance', subject: 'Test', text: 'Text', html: '<p>Text</p>' })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('https://api.mail.hostinger.com/api/v1/mailboxes/ACa3656503d597985bc359324043d7/send', expect.objectContaining({ method: 'POST' }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(sendHostinger({ to: 'advisor@example.test', displayName: 'LSRT Insurance', subject: 'Test', text: 'Text', html: '<p>Text</p>' })).rejects.toThrow('MAIL_HTTP_200');
  });
});
