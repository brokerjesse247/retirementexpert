# Bounded encrypted recovery bundle

## Purpose and current boundary

`scripts/recovery-bundle.ts` creates a **portable, AES-256-GCM encrypted recovery bundle for application recovery inputs only**. It is intentionally a supplement to, not a replacement for, the separately owned encrypted database-backup flow.

This implementation **does not approve, configure, deploy, upload, schedule, or claim** off-host backup, key custody, retention/legal-hold compliance, a restore drill, real-client intake, or email delivery. In particular, it does not contact a destination, activate a native unit, load `.env.local`, or read production/client records.

The current bundle does **not** contain:

- MariaDB/database dumps (the parent-owned database backup remains separate)
- client uploads, generated/private PDFs, report copies, drafts, sessions, email queues, or logs
- `runtime.env`, `.env*`, credentials, token/key/password values, SSH material, certificates, or private keys
- `node_modules`, `.git`, `.next`, or any `cache` directory

## Included, bounded recovery coverage

The collector has a fixed source-root allowlist; it never accepts arbitrary source paths:

| Coverage | Allowlisted location |
| --- | --- |
| Runtime application | `app/`, `components/`, `lib/`, and source-extension-allowlisted scripts under `scripts/` |
| Schema/migrations | `prisma/` |
| Public build assets | `public/`, except PDFs, logs, env files, sensitive filenames, dependencies, and caches |
| Native runtime/scheduling/proxy units | `deploy/native/` (app, dispatch, backup units/timers, nginx, and startup source) |
| Package/configuration inputs | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `next.config.ts`, `app.config.ts`, `tsconfig.json`, `vitest.config.ts` |

Only an explicit source-file extension allowlist is collected. Source traversal rejects usable symbolic links, requires regular files, canonicalizes every saved relative path, has a maximum of **8 MiB per file** and **64 MiB total source content**, and removes its unique temporary/final files if generation fails. The private output directory is created with mode `0700`; artifact and sidecar manifest files use mode `0600`.

## Sanitized runtime metadata

An operator may pass `RECOVERY_BUNDLE_RUNTIME_ENV_PATH` to *read* a runtime environment file for narrow recovery metadata. The environment file itself is not included. The encrypted payload may retain only these validated values:

- `APP_ORIGIN` without credentials, query, fragment, or non-root path
- `NODE_ENV` (`development`, `test`, or `production`)
- boolean feature/scheduler flags: `INTAKE_ENABLED`, `PUBLIC_INTAKE_ENABLED`, `MAIL_DISPATCH_ENABLED`, `OUTBOX_DISPATCH_ENABLED`, `OPERATIONS_SCHEDULER_ENABLED`, `BACKUP_SCHEDULE_ENABLED`, `MAINTENANCE_MODE`
- internal ports: `PORT`, `INTERNAL_PORT`, `APP_PORT`, `OPERATIONS_PORT` (1024–65535)
- date identifiers: `APP_DEPLOYED_AT`, `DEPLOYED_AT`, `DEPLOYMENT_DATE`, `BUILD_DATE`
- release identifiers: `DEPLOYMENT_ID`, `RELEASE_ID`, `BUILD_ID`

All other settings are omitted. Any key with `KEY`, `TOKEN`, `PASSWORD`, `SECRET`, or `CREDENTIAL` in its name is omitted, regardless of value. The unencrypted sidecar manifest exposes only the **names** of retained metadata fields, not their values.

## Encryption and separate custody

The artifact format is:

```text
RPRB1 || 96-bit random nonce || AES-256-GCM ciphertext || 128-bit authentication tag
```

Each creation uses a new random nonce. `BACKUP_ENCRYPTION_KEY` must be a 32-byte base64 or hexadecimal key and is accepted only from the explicitly supplied process environment. It is never serialized to the encrypted payload, the unencrypted manifest, a destination configuration, or command output.

The sidecar manifest records the required external custody item by **name only**:

```json
{"requiredSeparateKeyCustody":["BACKUP_ENCRYPTION_KEY"]}
```

The actual key must remain with a separately approved key custodian and must never be copied alongside the artifact or an eventual off-host destination. Key custody approval and a distinct encrypted operator key kit remain deferred to the parent-owned operations work.

## Closed execution gate

Generation and extraction both fail unless all of the following are true:

1. `RECOVERY_BUNDLE_EXECUTE=true` is explicitly present in the operator environment.
2. A valid `BACKUP_ENCRYPTION_KEY` is supplied.
3. When `NODE_ENV=production`, `RECOVERY_BUNDLE_APPROVED=true` is also explicitly present.

The script deliberately does **not** load `.env.local`, so an incidental local file cannot open the gate.

## Commands

Use only an approved, private operator environment. These examples show interfaces, not authorization to run production operations.

```bash
# Create the code/configuration bundle; output must be an absolute private directory outside the source root.
RECOVERY_BUNDLE_EXECUTE=true \
BACKUP_ENCRYPTION_KEY='<separately-custodied-32-byte-key>' \
RECOVERY_BUNDLE_OUTPUT_DIR=/private/recovery-output \
pnpm exec tsx scripts/recovery-bundle.ts

# Authenticate and validate a complete artifact without extracting it.
RECOVERY_BUNDLE_EXECUTE=true \
BACKUP_ENCRYPTION_KEY='<separately-custodied-32-byte-key>' \
pnpm exec tsx scripts/recovery-bundle.ts --verify /private/recovery-output/retireplan-recovery-....bundle.aesgcm

# Extract only after full authentication into a non-existent, isolated directory.
RECOVERY_BUNDLE_EXECUTE=true \
BACKUP_ENCRYPTION_KEY='<separately-custodied-32-byte-key>' \
pnpm exec tsx scripts/recovery-bundle.ts --restore /private/recovery-output/retireplan-recovery-....bundle.aesgcm \
  --restore-dir /private/isolated-recovery-drill
```

`--verify` authenticates and validates the entire envelope before returning metadata. `--restore` does the same complete authentication, JSON/path/digest validation **before it creates the destination**, then writes only inside a new, non-public, absolute destination. Existing destinations are rejected rather than overwritten. Extraction rejects invalid, duplicate, traversal, non-allowlisted, or integrity-failing records and deletes the new extraction directory if a write fails.

## Required follow-up before operational use

This code is not evidence that operational recovery is approved. Before any real-client recovery posture can be represented as complete, the owner must separately approve and evidence:

1. the off-host encrypted destination and retention lifecycle;
2. actual separate key custody and the parent-owned encrypted operator/server key kit;
3. the parent-owned encrypted database dump and database restore procedure;
4. native activation/scheduling and a documented, isolated restore drill;
5. retention, deletion, legal-hold, privacy, and compliance policy approval.

No action in this implementation enables real-client intake or email dispatch.

Confirmed collector corrections: component source is included so page imports can be rebuilt; log/logs directories and log-like text/JSON basenames are excluded individually. The restore drill must still verify the actual application build, not merely decrypt a synthetic payload.
