# Production operations activation

**This document is an activation checklist, not a claim that production operations are active.** The current code exposes an advisor-only, no-store status endpoint at `GET /api/operations/status`. It reports aggregate pending/failed outbox counts only. It never exposes recipients, message bodies, account metadata, provider errors, credentials, or mailbox contents.

## Hostinger Mail activation

Hostinger documents a Mail API token that is distinct from its hosting API token. It is created under **Agentic Mail → API access**, can be order/mailbox scoped, and authenticates with a bearer token. The documented `getCurrentAccount` call is the safe first verification because it returns the mailboxes permitted to the token; sending is a different `POST /api/v1/mailboxes/{mailboxResourceId}/send` operation. [1]

1. In the approved Hostinger account, create a **least-privilege Mail API token** scoped only to the authorized LSRT order/mailbox. Store it only in the protected application environment as `HOSTINGER_MAIL_API_TOKEN`; never put it in source, a client bundle, a public build variable, or a scheduler URL.
2. Confirm the sender identity and outbound allow list in Hostinger. A human must then set `HOSTINGER_MAIL_SENDER_VERIFIED=true`; this is an attestation gate, not an inferred claim.
3. From the protected runtime, run `tsx scripts/verify-operations.ts`. It performs only `GET https://api.mail.hostinger.com/api/v1/me`, with a bounded timeout and no redirects. This is the official AccountApi.getCurrentAccount endpoint and returns account/allowed-mailbox metadata only. It does **not** read an inbox and does not print account/mailbox metadata. The earlier `/api/v1/mailboxes` verification URL returned 404 and was corrected against the official SDK reference. `MAIL_HTTP_403` means the actual metadata request was forbidden; it does not guess whether the cause was token scope, token validity, or account configuration.
4. The status must show `MAIL_METADATA_VERIFIED` and `senderAttested: true` before setting `OPERATIONS_OUTBOX_DISPATCH_APPROVED=true`. A queued outbox row is never delivery success. The sender API treats **only HTTP 204** as delivered; a timeout or other ambiguous acceptance is recorded for manual review and is not automatically resent.
5. Jesse must explicitly approve any real verification message before it is queued. This implementation does not send a verification message.

> The official documentation states that a Mail API token is separate from the hosting API, is passed as a bearer token, and that `getCurrentAccount` is the initial authenticated request. It also identifies sending as a separate mailbox-scoped endpoint. [1]

## Advisor operations status and worker dispatch

`GET /api/operations/status` requires an advisor session and returns only operational booleans, redacted provider status, timestamp evidence, and aggregate pending/failed outbox counts. It reports `operational: true` only in the production runtime when independent intake protections, metadata/sender verification, outbox access, scheduler signing and verified scheduling, a read-only fingerprint-primary-key replay probe, off-host backup recovery and explicit outbound-dispatch approval all pass. Missing evidence keeps it false.

`POST /api/operations/dispatch` is intended for a Hostinger-supported application/job runtime, not a sandbox timer. A scheduler must sign `timestamp.nonce.POST./api/operations/dispatch` using `OPERATIONS_CRON_HMAC_SECRET` and send these headers:

- `x-operations-timestamp`: Unix milliseconds, accepted for five minutes.
- `x-operations-nonce`: a fresh 16–128 character URL-safe nonce.
- `x-operations-signature`: base64url HMAC-SHA256 of the canonical payload.

The route validates the timestamp and signature and consumes a nonce fingerprint once. The application route uses the database-backed OperationsReplayNonce unique fingerprint; the additive migration must be applied in the production database. The bundled memory replay store is test-only. Replay-storage failure rejects the operation. It also remains on hold until `OPERATIONS_OUTBOX_DISPATCH_APPROVED=true`; that explicit approval is required because dispatch can cause actual email sends.

No sandbox cron job, in-process timer, or unauthenticated URL constitutes production automation. Configure a Hostinger-supported scheduler only after replay persistence, runtime support, and the explicit delivery approval have been reviewed. The dispatcher runs the parent-owned private `deliverDueReports(limit=2)` queue on an authenticated dispatch; this generates encrypted reports but does **not** email a report. Outbox dispatch stays held separately until its explicit delivery approval is set.

## Private reports, retention, and production intake

Private report bytes belong in the encrypted database blob fields added by the parent schema migration. The parent report service owns the session-bound, ten-minute HMAC download authorization. Do not move report data to public paths, an inbox, or unapproved S3 storage.

The application invokes `assertProductionIntakeAllowed()` before production draft creation, autosave, upload and final submission. Independently validate all of these protected runtime gates before enabling real intake:

- `REAL_CLIENT_INTAKE_ENABLED=true`
- `COMPLIANCE_APPROVED_REAL_CLIENT_INTAKE=true`
- `PRIVATE_STORAGE_VERIFIED=true`
- valid 32-byte `DATA_ENCRYPTION_KEY`
- `REPORT_DOWNLOAD_HMAC_CONFIGURED=true`
- `BACKUP_RESTORE_APPROVED=true`, an ISO `BACKUP_RESTORE_TESTED_AT`, and verified `BACKUP_OFFHOST_VERIFIED=true`
- `RETENTION_POLICY_APPROVED=true` and `LEGAL_HOLD_PROCESS_APPROVED=true`
- `DATABASE_URL`, a canonical HTTPS `APP_ORIGIN`, and `HOSTINGER_RUNTIME_CONFIGURED=true`

The retention policy must preserve sent/final report records for at least six years, suspend deletion for `Client.retentionHold`, define deletion approval/audit steps, and keep backup retention aligned with the approved policy. Tests must not delete user data or exercise deletion/hold actions.

## Encrypted MariaDB backups

The scripts are deliberately inert unless explicitly configured. `scripts/backup-create.ts` requires `BACKUP_EXECUTE=true`; production additionally requires `BACKUP_APPROVED=true`, `BACKUP_RETENTION_APPROVED=true`, a separate `BACKUP_ENCRYPTION_KEY`, absolute non-public `BACKUP_OUTPUT_DIR`, `DATABASE_URL`, and `BACKUP_RETENTION_DAYS` between 7 and 365. It streams `mariadb-dump --single-transaction` into AES-256-GCM and creates mode-0600 `*.sql.aesgcm` artifacts. It prunes only recognized encrypted artifact names older than the approved retention window.

`backup-restore.ts` is dry-run by default: it authenticates and decrypts an artifact without opening a database connection. Actual restore requires `--execute`, a separate `BACKUP_RESTORE_DATABASE_URL`, and an isolated database name ending in `_test` while `NODE_ENV=test`. Any non-test restore additionally requires both `BACKUP_RESTORE_APPROVED=true` and the exact explicit danger value `ALLOW_PRODUCTION_RESTORE=DANGER_I_UNDERSTAND_PRODUCTION_RESTORE`.

Run a documented, isolated restore drill before setting `BACKUP_RESTORE_TESTED_AT`. A real encrypted local backup was restored to a separate retireplan_restore_test database on October 20; table counts and a synthetic marker matched. This is not a Hostinger production restore drill. Keep encryption keys outside Git and outside the backup destination. Backup artifacts are private security records, not downloadable files.

## Production schema/application activation

The parent has already added report bytes/status/retention fields and `Client.retentionHold`. OperationsReplayNonce and its atomic insert/duplicate-rejection store are implemented. Apply all recorded migrations in the verified production database before dispatch. If durable jobs are needed, add `OperationsJobRun` with a unique idempotency key, job type/status, attempt/lease/finished timestamps, and a non-sensitive error code. Do not use `AuditLog` as a replay store because it has no unique concurrency constraint.

The dispatcher imports the parent-owned `deliverDueReports(limit=2)` helper and preserves its no-email behavior. It must not substitute an alternate report service or attach report bytes to any operation response.

**References**

[1]: https://docs.hostinger.com/api-reference/email-sdks "Hostinger Mail API Email SDKs"
[2]: https://api.mail.hostinger.com/ "Hostinger Mail API Reference"

## October 21 owner-only delivery instruction

Jesse directed that every portal email goes to brokerjesse247@gmail.com, including confirmations, resume links, password resets and annual notices. The server replaces recipients at enqueue and send, including legacy queued payloads. The advisor login address is unchanged. Client email input still identifies the client, but no message is sent to that address. Source instruction is independent of live dispatch approval; client messages and prior development queues must not be released automatically.

The provider transport uses `to: ["brokerjesse247@gmail.com"]`, matching the current official typed `V1SendRequest` contract. The internal encrypted outbox keeps a single-recipient string. Only HTTP 204 is success. Permanent 4xx failures, configuration failures and ambiguous/non-204 acceptances require correction/manual review, not blind retries. Transient 429/5xx responses use bounded Retry-After/backoff; batches are sequential, default two, maximum ten. No verification message has been sent.

Additional evidence switches `OPERATIONS_SCHEDULER_VERIFIED` and `BACKUP_OFFHOST_VERIFIED` remain false until a real Hostinger scheduler and an encrypted recovery copy outside the VPS are verified. A local restore drill or Hostinger weekly VPS snapshot alone does not satisfy those checks.

Recovery must separately cover application/configuration, encrypted database/upload/PDF records, scheduler definitions and encryption-key custody. Keys must never be stored with the backup copy or committed to Git. The current database-only dump does not claim recovery of host files or server-level scheduled jobs.

[3]: https://raw.githubusercontent.com/hostinger/mail-api-typescript-sdk/main/docs/V1SendRequest.md "Official Hostinger recipient-array request schema"
