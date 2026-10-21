import { describe, expect, it } from 'vitest';
import { SecurityConfigurationError } from '../lib/auth/crypto';
import {
  HOSTINGER_MAILBOX_ID,
  HOSTINGER_METADATA_URL,
  assertProductionIntakeAllowed,
  collectOperationsStatus,
  inspectOperationsConfiguration,
  redactOperationsDiagnostic,
  verifyHostingerMailMetadata,
} from '../lib/operations/status';

const key = Buffer.alloc(32, 11).toString('base64');
const approvedProduction = {
  NODE_ENV: 'production',
  REAL_CLIENT_INTAKE_ENABLED: 'true',
  COMPLIANCE_APPROVED_REAL_CLIENT_INTAKE: 'true',
  PRIVATE_STORAGE_VERIFIED: 'true',
  DATA_ENCRYPTION_KEY: key,
  REPORT_DOWNLOAD_HMAC_CONFIGURED: 'true',
  BACKUP_RESTORE_APPROVED: 'true',
  BACKUP_RESTORE_TESTED_AT: '2026-10-20T00:00:00.000Z',
  RETENTION_POLICY_APPROVED: 'true',
  LEGAL_HOLD_PROCESS_APPROVED: 'true',
  DATABASE_URL: 'mysql://user:password@db.example.test/retireplan',
  APP_ORIGIN: 'https://plan.example.test',
  HOSTINGER_RUNTIME_CONFIGURED: 'true',
};

describe('operations status', () => {
  it('requires explicit production compliance, storage, backup, retention and runtime gates but leaves test intake ungated', () => {
    expect(() => assertProductionIntakeAllowed({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertProductionIntakeAllowed({ NODE_ENV: 'production' })).toThrow(SecurityConfigurationError);
    expect(() => assertProductionIntakeAllowed(approvedProduction)).not.toThrow();
    expect(inspectOperationsConfiguration(approvedProduction).intakeAllowed).toBe(true);
  });

  it('records safe verified and forbidden metadata evidence without returning mailbox data', async () => {
    expect(HOSTINGER_METADATA_URL).toBe('https://api.mail.hostinger.com/api/v1/mailboxes');
    const verified = await verifyHostingerMailMetadata({
      env: { HOSTINGER_MAIL_API_TOKEN: 'token' },
      now: new Date('2026-10-20T00:00:00.000Z'),
      fetcher: async () => new Response(JSON.stringify({ data: { mailboxes: [{ resourceId: HOSTINGER_MAILBOX_ID, address: 'never-returned@example.test' }] } }), { status: 200 }),
    });
    expect(verified).toEqual({ state: 'VERIFIED', code: 'MAIL_METADATA_VERIFIED', checkedAt: '2026-10-20T00:00:00.000Z' });

    const forbidden = await verifyHostingerMailMetadata({
      env: { HOSTINGER_MAIL_API_TOKEN: 'token' },
      now: new Date('2026-10-20T00:00:00.000Z'),
      fetcher: async () => new Response(JSON.stringify({ code: 'ERR_FORBIDDEN', error: 'not exposed' }), { status: 403 }),
    });
    expect(forbidden).toEqual({ state: 'FORBIDDEN', code: 'MAIL_HTTP_403', checkedAt: '2026-10-20T00:00:00.000Z' });
    expect(JSON.stringify(forbidden)).not.toContain('ERR_FORBIDDEN');
  });

  it('accepts only the authorized resource ID from a mailbox metadata list', async () => {
    const result = await verifyHostingerMailMetadata({ env: { HOSTINGER_MAIL_API_TOKEN: 'test' }, fetcher: async () => new Response(JSON.stringify({ data: [{ resourceId: HOSTINGER_MAILBOX_ID }] }), { status: 200 }) });
    expect(result.state).toBe('VERIFIED');
    expect(JSON.stringify(result)).not.toContain(HOSTINGER_MAILBOX_ID);
  });

  it('redacts sensitive values and returns aggregate-only outbox state', async () => {
    const redacted = redactOperationsDiagnostic({ token: 'secret-token', nested: { authorization: 'Bearer secret', normal: 'safe' } });
    expect(redacted).toEqual({ token: '[REDACTED]', nested: { authorization: '[REDACTED]', normal: 'safe' } });
    const status = await collectOperationsStatus({
      env: { NODE_ENV: 'test' },
      now: new Date('2026-10-20T00:00:00.000Z'),
      loadOutboxCounts: async () => ({ pending: 4, failed: 2 }),
    });
    expect(status.outbox).toEqual({ pending: 4, failed: 2 });
    expect(JSON.stringify(status)).not.toContain('HOSTINGER_MAIL_API_TOKEN');
    expect(status.operational).toBe(false);
  });
});
