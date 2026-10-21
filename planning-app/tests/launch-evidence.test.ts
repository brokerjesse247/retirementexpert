import { describe, expect, it } from 'vitest';
import { hasVerifiedLaunchEvidence, validateLaunchEvidence } from '../lib/operations/launch-evidence';
import { productionIntakeBlockers } from '../lib/operations/status';
const hash = 'a'.repeat(64);
const env = { APP_ORIGIN: 'https://plan.example.test', INTAKE_ADVISOR_ID: 'advisor-own', LAUNCH_POLICY_SHA256: hash };
const evidence = {
  version: 1,
  origin: env.APP_ORIGIN,
  ownerApproval: { advisorId: env.INTAKE_ADVISOR_ID, policySha256: hash, policyVersion: '2026-10-21', approvedAt: '2026-10-21T20:00:00.000Z', choice: 'APPROVE_WITHOUT_IMPORT' },
  offhostRecovery: { provider: 'GOOGLE_DRIVE', artifactId: 'private-artifact', cipherSha256: hash, restoreVerifiedAt: '2026-10-21T20:10:00.000Z', databaseRestoreVerified: true, applicationRestoreVerified: true, separateKeyCustodyVerified: true, encryptedRecoveryKitId: 'private-kit' },
  mail: { providerHttp: 204, recipient: 'brokerjesse247@gmail.com', acceptedAt: '2026-10-21T19:00:00.000Z' },
};
describe('protected launch evidence', () => {
  it('accepts only complete evidence bound to the configured owner, origin and approved policy', () => {
    expect(validateLaunchEvidence(evidence, env, new Date('2026-10-21T21:00:00.000Z'))).toBe(true);
    expect(validateLaunchEvidence(evidence, { ...env, LAUNCH_POLICY_SHA256: 'b'.repeat(64) })).toBe(false);
    expect(validateLaunchEvidence(evidence, { ...env, INTAKE_ADVISOR_ID: 'another-owner' })).toBe(false);
  });
  it('rejects missing evidence, unapproved choices, false recovery checks and future approvals', () => {
    expect(validateLaunchEvidence({}, env)).toBe(false);
    expect(validateLaunchEvidence({ ...evidence, ownerApproval: { ...evidence.ownerApproval, choice: 'TECHNICAL_ONLY' } }, env)).toBe(false);
    expect(validateLaunchEvidence({ ...evidence, offhostRecovery: { ...evidence.offhostRecovery, separateKeyCustodyVerified: false } }, env)).toBe(false);
    expect(validateLaunchEvidence(evidence, env, new Date('2026-10-21T19:30:00.000Z'))).toBe(false);
  });
  it('does not accept app-writable or missing record paths', () => {
    expect(hasVerifiedLaunchEvidence({ ...env, LAUNCH_EVIDENCE_PATH: '/var/lib/retireplan/launch.json' })).toBe(false);
    expect(hasVerifiedLaunchEvidence({ ...env, LAUNCH_EVIDENCE_PATH: '/etc/retireplan-evidence/missing-test-record.json' })).toBe(false);
  });
  it('does not open production merely because all operator booleans are true', () => {
    const flags = { NODE_ENV: 'production', REAL_CLIENT_INTAKE_ENABLED: 'true', COMPLIANCE_APPROVED_REAL_CLIENT_INTAKE: 'true', PRIVATE_STORAGE_VERIFIED: 'true', DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), REPORT_DOWNLOAD_HMAC_CONFIGURED: 'true', BACKUP_RESTORE_APPROVED: 'true', BACKUP_RESTORE_TESTED_AT: '2026-10-21T20:00:00.000Z', BACKUP_OFFHOST_VERIFIED: 'true', RETENTION_POLICY_APPROVED: 'true', LEGAL_HOLD_PROCESS_APPROVED: 'true', DATABASE_URL: 'mysql://u:p@localhost/test', HOSTINGER_RUNTIME_CONFIGURED: 'true', ...env, LAUNCH_EVIDENCE_PATH: '/etc/retireplan-evidence/missing-test-record.json' };
    expect(productionIntakeBlockers(flags)).toContain('Protected owner-policy and actual off-host restore evidence is not recorded.');
  });
});
