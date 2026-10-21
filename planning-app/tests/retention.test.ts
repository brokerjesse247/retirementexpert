import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '../lib/auth/http';
import { decryptJson } from '../lib/auth/crypto';

const db = vi.hoisted(() => ({
  client: { findFirst: vi.fn() },
  report: { aggregate: vi.fn() },
  $transaction: vi.fn(),
}));
const requireAdvisor = vi.hoisted(() => vi.fn());

vi.mock('../lib/db', () => ({ db }));
vi.mock('../lib/auth/session', () => ({ requireAdvisor }));

import { changeRetentionHold as changeHoldService, retentionOverview as retentionOverviewService } from '../lib/retention/service';
import { GET, PATCH } from '../app/api/clients/[id]/retention/route';

const advisorSession = { advisor: { id: 'advisor-own', name: 'Advisor', email: 'advisor@example.test', phone: null, licenseNumbers: null }, csrfToken: 'csrf-token' };
const context = { params: Promise.resolve({ id: 'client-own' }) };

function request(method: string, body: unknown, origin = 'https://app.example.test') {
  return new NextRequest('https://app.example.test/api/clients/client-own/retention', {
    method,
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('retention service', () => {
  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', Buffer.alloc(32, 47).toString('base64'));
    vi.clearAllMocks();
    db.client.findFirst.mockResolvedValue({ id: 'client-own', retentionHold: false, revision: 4 });
    db.report.aggregate.mockResolvedValue({ _count: { _all: 0 }, _min: { retainUntil: null }, _max: { retainUntil: null } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns only owned hold state and aggregate immutable report-retention dates', async () => {
    db.report.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _min: { retainUntil: new Date('2032-01-10T00:00:00.000Z') },
      _max: { retainUntil: new Date('2033-01-10T00:00:00.000Z') },
    });
    await expect(retentionOverviewService('client-own', 'advisor-own')).resolves.toEqual({
      retentionHold: false,
      revision: 4,
      reportRetention: {
        reportCount: 2,
        earliestRetainUntil: '2032-01-10T00:00:00.000Z',
        latestRetainUntil: '2033-01-10T00:00:00.000Z',
      },
    });
    expect(db.client.findFirst).toHaveBeenCalledWith({ where: { id: 'client-own', advisorId: 'advisor-own' }, select: { id: true, retentionHold: true, revision: true } });
    expect(db.report.aggregate).toHaveBeenCalledWith({ where: { clientId: 'client-own', client: { advisorId: 'advisor-own' } }, _count: { _all: true }, _min: { retainUntil: true }, _max: { retainUntil: true } });
  });

  it('places a hold with an exact revision, encrypts the reason in advisor settings, and preserves reports', async () => {
    const claim = vi.fn().mockResolvedValue({ count: 1 });
    const advisorFind = vi.fn().mockResolvedValue({ reportSettingsEncrypted: null });
    const advisorUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const auditCreate = vi.fn().mockResolvedValue({});
    db.$transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback({
      client: { updateMany: claim },
      advisor: { findFirst: advisorFind, updateMany: advisorUpdate },
      auditLog: { create: auditCreate },
    }));

    await expect(changeHoldService('client-own', 'advisor-own', { action: 'hold', reason: 'Preserve records for a private review.', revision: 4 })).resolves.toEqual({ retentionHold: true, revision: 5 });
    expect(claim).toHaveBeenCalledWith({
      where: { id: 'client-own', advisorId: 'advisor-own', revision: 4, retentionHold: false },
      data: { retentionHold: true, revision: { increment: 1 } },
    });
    expect(advisorUpdate.mock.calls[0][0].where).toEqual({ id: 'advisor-own', reportSettingsEncrypted: null });
    const encryptedSettings = advisorUpdate.mock.calls[0][0].data.reportSettingsEncrypted;
    expect(decryptJson<Record<string, { events: Array<{ action: string; reason: string }> }>>(encryptedSettings)['retention-client-own'].events[0]).toMatchObject({ action: 'hold', reason: 'Preserve records for a private review.' });
    expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'RETENTION_HOLD_PLACED', summary: 'RETENTION_HOLD_PLACED' }) });
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain('Preserve records for a private review.');
    expect(db.report.aggregate).not.toHaveBeenCalled();
  });

  it('allows an archived owned client to be held and returns a conflict rather than overwriting a stale revision', async () => {
    db.client.findFirst.mockResolvedValueOnce({ id: 'client-own', retentionHold: false, revision: 5, status: 'ARCHIVED' });
    await expect(changeHoldService('client-own', 'advisor-own', { action: 'hold', reason: 'Archive is not a deletion path.', revision: 4 })).rejects.toMatchObject({ status: 409 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing or overlong private reason before any write', async () => {
    await expect(changeHoldService('client-own', 'advisor-own', { action: 'hold', reason: ' ', revision: 4 })).rejects.toMatchObject({ status: 422 });
    await expect(changeHoldService('client-own', 'advisor-own', { action: 'release', reason: 'x'.repeat(501), revision: 4 })).rejects.toMatchObject({ status: 422 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('retention API route', () => {
  beforeEach(() => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example.test');
    vi.clearAllMocks();
    db.client.findFirst.mockReset();
    db.report.aggregate.mockReset();
    db.$transaction.mockReset();
    requireAdvisor.mockResolvedValue(advisorSession);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires the trusted origin, exact CSRF token, explicit action, and strict body before calling the service', async () => {
    const badOrigin = await PATCH(request('PATCH', { action: 'hold', reason: 'Review', revision: 4, csrfToken: 'csrf-token' }, ''), context);
    expect(badOrigin.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();

    const badCsrf = await PATCH(request('PATCH', { action: 'hold', reason: 'Review', revision: 4, csrfToken: 'incorrect' }), context);
    expect(badCsrf.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();

    const extraField = await PATCH(request('PATCH', { action: 'hold', reason: 'Review', revision: 4, csrfToken: 'csrf-token', retentionHold: true }), context);
    expect(extraField.status).toBe(422);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('returns no-store owned metadata and forwards only the authenticated advisor id to the service', async () => {
    db.client.findFirst.mockResolvedValueOnce({ id: 'client-own', retentionHold: true, revision: 5 });
    db.report.aggregate.mockResolvedValueOnce({ _count: { _all: 1 }, _min: { retainUntil: new Date('2032-01-10T00:00:00.000Z') }, _max: { retainUntil: new Date('2032-01-10T00:00:00.000Z') } });
    const response = await GET(request('GET', undefined), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(db.client.findFirst).toHaveBeenCalledWith({ where: { id: 'client-own', advisorId: 'advisor-own' }, select: { id: true, retentionHold: true, revision: true } });
    expect(await response.json()).toEqual(expect.objectContaining({ csrfToken: 'csrf-token', retention: expect.objectContaining({ retentionHold: true }) }));
  });

  it('surfaces an ownership-protecting 404 from the retention service', async () => {
    db.client.findFirst.mockResolvedValueOnce(null);
    const response = await GET(request('GET', undefined), { params: Promise.resolve({ id: 'other-client' }) });
    expect(response.status).toBe(404);
  });
});
