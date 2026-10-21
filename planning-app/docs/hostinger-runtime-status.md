# Hostinger runtime status — October 21, 2026

## Verified on the existing KVM 2

Jesse approved the task-specific SSH key. It was added without replacing the existing key. Existing applications, PM2, nginx, PHP, database services, DNS and homepage files were preserved.

The isolated RetirementExpert release installed its own pinned pnpm 10.18.0 and locked dependencies, applied all additive migrations to its separate database, and passed the actual Hostinger production build. The new database has 31 schema tables; no Preview clients, old queued emails or other applications’ data were imported.

The native Next.js service is running as non-root user `retireplan`, with a separate DML-only database identity. Its listener is **127.0.0.1:3117 only**. Login returned HTTP 200; unauthenticated client-data access returned HTTP 401; production intake remained blocked with HTTP 503. Source files are root-owned with service-group read access; private state/cache paths are writable only where required. Runtime encryption and signing keys were generated on the VPS and never printed or committed.

Chromium installed in the isolated service cache and generated a valid synthetic Letter PDF as the non-root runtime user. The systemd queue service completed a real signed request successfully, and its durable timer is active. Outgoing email remains held at the backend; this queue verification did not send an email or generate a client report.

The daily encrypted backup timer is installed but remains disabled pending retention, key-custody and private off-host destination approval. A real AES-256-GCM backup was authenticated and restored into the separate test database: all 31 schema tables matched, with zero clients in source and target. Application encryption round-tripped successfully. The tested-at timestamp was recorded, but backup approval/off-host/compliance flags were not inferred or enabled. This does not prove off-host recovery.

## Not yet active

- Public `plan.retirementexpert.si` HTTPS routing and homepage links. No DNS/nginx/public cutover was made.
- A production advisor/account or client-data migration. The database setup is not a claim that the Preview login/data is already copied to production.
- Verified LSRT Mail API credentials, sender attestation, actual test-message delivery or live outbox release. Every portal email destination remains brokerjesse247@gmail.com.
- Approved off-host backups, key recovery, retention/legal holds and real-client compliance policy. Real intake remains closed.

These are verified native prerequisites, not a public production launch. Only this task-specific SSH key is removed when pausing or finishing server work; existing access remains intact.

Local final verification: TypeScript passed and 250 tests across 49 files passed. Native Hostinger build/browser/scheduler/database checks are separate evidence.
