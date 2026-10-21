import { SecurityConfigurationError } from '@/lib/auth/crypto';

export const HOSTINGER_MAIL_API_BASE = 'https://api.mail.hostinger.com';
export const HOSTINGER_MAILBOX_ID = 'ACa3656503d597985bc359324043d7';
// Official AccountApi.getCurrentAccount: account and allowed-mailbox metadata only.
export const HOSTINGER_METADATA_URL = `${HOSTINGER_MAIL_API_BASE}/api/v1/me`;
const METADATA_TIMEOUT_MS = 10_000;

type Environment = Record<string, string | undefined>;
export type ProviderVerificationState = 'VERIFIED' | 'NOT_CONFIGURED' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'MAILBOX_NOT_AUTHORIZED' | 'UNAVAILABLE' | 'HTTP_ERROR';

export type ProviderVerification = {
  state: ProviderVerificationState;
  code: string;
  checkedAt: string;
};

export type OutboxCounts = { pending: number | null; failed: number | null };

export type OperationsConfiguration = {
  production: boolean;
  intakeAllowed: boolean;
  complianceApproved: boolean;
  storageVerified: boolean;
  encryptedStorageKeyConfigured: boolean;
  reportDownloadSigningConfigured: boolean;
  backupRestoreTestRecorded: boolean;
  retentionPolicyApproved: boolean;
  legalHoldProcessApproved: boolean;
  databaseConfigured: boolean;
  appOriginConfigured: boolean;
  runtimeConfigured: boolean;
  mailTokenConfigured: boolean;
  senderAttested: boolean;
  cronReplayProtectionAvailable: boolean;
};

export type OperationsStatus = {
  checkedAt: string;
  operational: boolean;
  configuration: OperationsConfiguration;
  provider: ProviderVerification;
  outbox: OutboxCounts;
  blockers: string[];
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function enabled(value: string | undefined): boolean {
  return value === 'true';
}

function validIsoDate(value: string | undefined): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function validAppOrigin(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.origin === value.replace(/\/$/, '');
  } catch {
    return false;
  }
}

function hasEncryptionKey(value: string | undefined): boolean {
  if (!value) return false;
  const key = /^[a-fA-F0-9]{64}$/.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  return key.length === 32;
}

/**
 * The intake route remains parent-owned. Parent wiring must call this only at
 * production intake submission time; development and test intake stay usable.
 */
export function productionIntakeBlockers(env: Environment = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const blockers: string[] = [];
  if (!enabled(env.REAL_CLIENT_INTAKE_ENABLED)) blockers.push('REAL_CLIENT_INTAKE_ENABLED is not approved.');
  if (!enabled(env.COMPLIANCE_APPROVED_REAL_CLIENT_INTAKE)) blockers.push('Compliance approval is not recorded.');
  if (!enabled(env.PRIVATE_STORAGE_VERIFIED)) blockers.push('Private encrypted storage is not verified.');
  if (!hasEncryptionKey(env.DATA_ENCRYPTION_KEY)) blockers.push('Encryption key is not configured.');
  if (!enabled(env.REPORT_DOWNLOAD_HMAC_CONFIGURED)) blockers.push('Private report download signing is not configured.');
  if (!enabled(env.BACKUP_RESTORE_APPROVED) || !validIsoDate(env.BACKUP_RESTORE_TESTED_AT)) blockers.push('A successful restore test is not recorded.');
  if (!enabled(env.BACKUP_OFFHOST_VERIFIED)) blockers.push('Encrypted off-host backup recovery is not verified.');
  if (!enabled(env.RETENTION_POLICY_APPROVED)) blockers.push('The six-year retention policy is not approved.');
  if (!enabled(env.LEGAL_HOLD_PROCESS_APPROVED)) blockers.push('The legal-hold process is not approved.');
  if (!env.DATABASE_URL) blockers.push('Database runtime is not configured.');
  if (!validAppOrigin(env.APP_ORIGIN)) blockers.push('The HTTPS application origin is not configured.');
  if (!enabled(env.HOSTINGER_RUNTIME_CONFIGURED)) blockers.push('The Hostinger application runtime is not configured.');
  return blockers;
}

/** Fail closed for real-client production intake without changing the intake route itself. */
export function assertProductionIntakeAllowed(env: Environment = process.env): void {
  const blockers = productionIntakeBlockers(env);
  if (blockers.length) throw new SecurityConfigurationError('Production intake operations are not approved.');
}

export function inspectOperationsConfiguration(env: Environment = process.env, replayStorageVerified = false): OperationsConfiguration {
  const blockers = productionIntakeBlockers(env);
  return {
    production: env.NODE_ENV === 'production',
    intakeAllowed: blockers.length === 0,
    complianceApproved: enabled(env.COMPLIANCE_APPROVED_REAL_CLIENT_INTAKE),
    storageVerified: enabled(env.PRIVATE_STORAGE_VERIFIED),
    encryptedStorageKeyConfigured: hasEncryptionKey(env.DATA_ENCRYPTION_KEY),
    reportDownloadSigningConfigured: enabled(env.REPORT_DOWNLOAD_HMAC_CONFIGURED),
    backupRestoreTestRecorded: enabled(env.BACKUP_RESTORE_APPROVED) && validIsoDate(env.BACKUP_RESTORE_TESTED_AT),
    retentionPolicyApproved: enabled(env.RETENTION_POLICY_APPROVED),
    legalHoldProcessApproved: enabled(env.LEGAL_HOLD_PROCESS_APPROVED),
    databaseConfigured: Boolean(env.DATABASE_URL),
    appOriginConfigured: validAppOrigin(env.APP_ORIGIN),
    runtimeConfigured: enabled(env.HOSTINGER_RUNTIME_CONFIGURED),
    mailTokenConfigured: Boolean(env.HOSTINGER_MAIL_API_TOKEN),
    senderAttested: enabled(env.HOSTINGER_MAIL_SENDER_VERIFIED),
    // A read-only schema/database probe is evidence; an environment flag is not.
    cronReplayProtectionAvailable: replayStorageVerified,
  };
}

function metadataResult(status: number, checkedAt: string): ProviderVerification {
  if (status === 401) return { state: 'UNAUTHORIZED', code: 'MAIL_HTTP_401', checkedAt };
  if (status === 403) return { state: 'FORBIDDEN', code: 'MAIL_HTTP_403', checkedAt };
  if (status === 429) return { state: 'RATE_LIMITED', code: 'MAIL_HTTP_429', checkedAt };
  return { state: 'HTTP_ERROR', code: `MAIL_HTTP_${status}`, checkedAt };
}

function mailboxIdsFromMetadata(value: unknown): string[] {
  const outer = value && typeof value === 'object' ? value as { data?: unknown; mailboxes?: unknown } : null;
  const data = outer?.data;
  const mailboxes = Array.isArray(value) ? value : Array.isArray(data) ? data : data && typeof data === 'object' ? (data as { mailboxes?: unknown }).mailboxes : outer?.mailboxes;
  if (!Array.isArray(mailboxes)) return [];
  return mailboxes.flatMap((mailbox) => {
    if (!mailbox || typeof mailbox !== 'object') return [];
    const resourceId = (mailbox as { resourceId?: unknown }).resourceId;
    return typeof resourceId === 'string' ? [resourceId] : [];
  });
}

/**
 * Performs only the documented authenticated-account metadata GET. It never
 * reads an inbox, returns mailbox addresses, provider body text, or credentials.
 */
export async function verifyHostingerMailMetadata(args: {
  env?: Environment;
  fetcher?: FetchLike;
  now?: Date;
} = {}): Promise<ProviderVerification> {
  const env = args.env ?? process.env;
  const checkedAt = (args.now ?? new Date()).toISOString();
  const token = env.HOSTINGER_MAIL_API_TOKEN;
  if (!token) return { state: 'NOT_CONFIGURED', code: 'MAIL_CONFIGURATION', checkedAt };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
  try {
    const response = await (args.fetcher ?? fetch)(HOSTINGER_METADATA_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (response.status !== 200) return metadataResult(response.status, checkedAt);
    const mailboxIds = mailboxIdsFromMetadata(await response.json().catch(() => null));
    return mailboxIds.includes(HOSTINGER_MAILBOX_ID)
      ? { state: 'VERIFIED', code: 'MAIL_METADATA_VERIFIED', checkedAt }
      : { state: 'MAILBOX_NOT_AUTHORIZED', code: 'MAILBOX_NOT_AUTHORIZED', checkedAt };
  } catch {
    return { state: 'UNAVAILABLE', code: 'MAIL_METADATA_UNAVAILABLE', checkedAt };
  } finally {
    clearTimeout(timer);
  }
}

/** Removes accidental secret values from any diagnostics before an API response or a log. */
export function redactOperationsDiagnostic(value: unknown): unknown {
  const secretKey = /(?:token|secret|password|authorization|cookie|key|database_url)/i;
  if (Array.isArray(value)) return value.map(redactOperationsDiagnostic);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    secretKey.test(key) ? '[REDACTED]' : redactOperationsDiagnostic(entry),
  ]));
}

export async function collectOperationsStatus(args: {
  env?: Environment;
  fetcher?: FetchLike;
  now?: Date;
  loadOutboxCounts: () => Promise<OutboxCounts>;
  verifyReplayStorage?: () => Promise<boolean>;
}): Promise<OperationsStatus> {
  const env = args.env ?? process.env;
  const checkedAt = (args.now ?? new Date()).toISOString();
  const [provider, outbox, replayVerified] = await Promise.all([
    verifyHostingerMailMetadata({ env, fetcher: args.fetcher, now: args.now }),
    args.loadOutboxCounts().catch((): OutboxCounts => ({ pending: null, failed: null })),
    args.verifyReplayStorage?.().catch(() => false) ?? Promise.resolve(false),
  ]);
  const configuration = inspectOperationsConfiguration(env, replayVerified);
  const blockers = productionIntakeBlockers(env);
  if (!configuration.production) blockers.push('This is not the production application runtime.');
  if (!configuration.cronReplayProtectionAvailable) blockers.push('Persistent scheduled-operation replay storage is not verified.');
  if (!env.OPERATIONS_CRON_HMAC_SECRET || env.OPERATIONS_CRON_HMAC_SECRET.length < 32) blockers.push('Scheduler signing authentication is not configured.');
  if (!enabled(env.OPERATIONS_SCHEDULER_VERIFIED)) blockers.push('The production scheduler is not verified.');
  if (!enabled(env.BACKUP_OFFHOST_VERIFIED)) blockers.push('Encrypted off-host backup recovery is not verified.');
  if (!enabled(env.OPERATIONS_OUTBOX_DISPATCH_APPROVED)) blockers.push('Outbound email dispatch remains on hold.');
  if (provider.state !== 'VERIFIED') blockers.push(`Hostinger metadata verification: ${provider.code}.`);
  if (!configuration.senderAttested) blockers.push('Hostinger sender verification attestation is not recorded.');
  if (outbox.pending === null || outbox.failed === null) blockers.push('Outbox database status is unavailable.');
  return {
    checkedAt,
    operational: blockers.length === 0,
    configuration,
    provider,
    outbox,
    blockers: [...new Set(blockers)],
  };
}
