import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { POST } from '../app/api/intake/submit/route';
import { dispatchOutboxIfApproved } from '../lib/operations/jobs';

const requireDraft = vi.hoisted(() => vi.fn());
vi.mock('../lib/services/drafts', () => ({ requireDraft }));

afterEach(() => vi.unstubAllEnvs());
describe('production holds', () => {
  it('blocks final intake before reading a draft or writing client data when launch is unapproved', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('APP_ORIGIN', 'https://plan.example.test'); vi.stubEnv('REAL_CLIENT_INTAKE_ENABLED', 'false');
    requireDraft.mockClear();
    const response = await POST(new NextRequest('https://plan.example.test/api/intake/submit', { method: 'POST', headers: { Origin: 'https://plan.example.test' }, body: '{}' }));
    expect(response.status).toBe(503); expect(requireDraft).not.toHaveBeenCalled();
  });
  it('keeps the documented standalone worker behind the same approval gate even if provider credentials exist', async () => {
    const source = readFileSync('scripts/email-worker.ts', 'utf8');
    expect(source).toContain('dispatchOutboxIfApproved({ deliverDueOutbox })');
    const deliverDueOutbox = vi.fn();
    await expect(dispatchOutboxIfApproved({ env: { HOSTINGER_MAIL_API_TOKEN: 'test-only', HOSTINGER_MAIL_SENDER_VERIFIED: 'true' }, deliverDueOutbox })).rejects.toMatchObject({ status: 423 });
    expect(deliverDueOutbox).not.toHaveBeenCalled();
  });
});
