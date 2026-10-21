import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptJson, encryptJson } from '../lib/auth/crypto';

const db = vi.hoisted(() => ({ advisor: { findUniqueOrThrow: vi.fn() }, $transaction: vi.fn() }));
vi.mock('../lib/db', () => ({ db }));
import { DEFAULT_BRANDING, loadBrandingSettings, saveBrandingSettings } from '../lib/reports/branding';

describe('private retention history and report branding', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('DATA_ENCRYPTION_KEY', Buffer.alloc(32, 61).toString('base64')); });
  afterEach(() => vi.unstubAllEnvs());
  const privateEntry = { events: [{ action: 'hold', reason: 'A private legal review', recordedAt: '2026-10-21T00:00:00.000Z' }] };

  it('uses default branding after a first hold and never returns the private reason as report branding', async () => {
    db.advisor.findUniqueOrThrow.mockResolvedValue({ reportSettingsEncrypted: encryptJson({ 'retention-client-one': privateEntry }) });
    const loaded = await loadBrandingSettings('advisor-one');
    expect(loaded).toEqual(DEFAULT_BRANDING);
    expect(JSON.stringify(loaded)).not.toContain('private legal review');
    expect(loaded).not.toHaveProperty('retention-client-one');
  });
  it('preserves encrypted reasons with an exact compare-and-swap while returning only branding', async () => {
    const old = encryptJson({ ...DEFAULT_BRANDING, 'retention-client-one': privateEntry });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const audit = vi.fn();
    db.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ advisor: { findUniqueOrThrow: vi.fn().mockResolvedValue({ reportSettingsEncrypted: old }), updateMany }, auditLog: { create: audit } }));
    const result = await saveBrandingSettings('advisor-one', DEFAULT_BRANDING);
    const update = updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'advisor-one', reportSettingsEncrypted: old });
    expect(decryptJson<Record<string, unknown>>(update.data.reportSettingsEncrypted)['retention-client-one']).toEqual(privateEntry);
    expect(result).not.toHaveProperty('retention-client-one');
    expect(audit).toHaveBeenCalledTimes(1);
  });
  it('rejects a concurrent hold/settings change without an audit success or overwrite', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const audit = vi.fn();
    db.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ advisor: { findUniqueOrThrow: vi.fn().mockResolvedValue({ reportSettingsEncrypted: null }), updateMany }, auditLog: { create: audit } }));
    await expect(saveBrandingSettings('advisor-one', DEFAULT_BRANDING)).rejects.toMatchObject({ status: 409 });
    expect(audit).not.toHaveBeenCalled();
  });
});
