# Production activation status — October 21, 2026

## Email transport now verified

The actual Hostinger application's Node mail helper submitted one controlled owner-only test at **20:42:01 UTC**. Hostinger accepted it with exactly **HTTP 204**. Sender: **jesse@lsrtinsurance.com**. Recipient: **brokerjesse247@gmail.com**. The test contained no client information. No inbox messages were read.

The earlier Python request returned HTTP 403; that did not establish a failure of the application's Node transport. The corrected test used the existing authorized token and documented mailbox-scoped endpoint. No token was regenerated, recipient policy broadened or provider restriction bypassed. A narrow outbound-metadata query had no indexed log entry at the time; HTTP 204 alone proves provider acceptance, not Gmail folder placement. At **21:11 UTC**, Jesse confirmed receipt and supplied a Gmail Inbox screenshot showing the approved connection test. Receipt of that single test is now confirmed by the owner; automatic portal sending and report sending are still not activated.

Metadata verification uses the official SDK's **GET /api/v1/me** endpoint. The mailbox-scoped send request uses the documented recipient array. Source: https://raw.githubusercontent.com/hostinger/mail-api-typescript-sdk/main/docs/AccountApi.md and https://raw.githubusercontent.com/hostinger/mail-api-typescript-sdk/main/docs/V1SendRequest.md . The token remains in an encrypted systemd credential and is not printed, committed or bundled with backups.

## General dispatch and real collection remain held

Jesse has a pending approval card for **docs/proposed-launch-policy.md**. It asks for the actual private Google Drive backup destination, separate protected recovery kit, six-year minimum records policy/legal holds, and whether to copy the single submitted Preview record. Silence is not approval.

At **21:13 UTC**, Jesse specified **brokerjesse247@gmail.com** for every Google Drive folder created for this project. The proposed policy now requires that owner and forbids another-account fallback. A metadata-only Drive identity check at 21:14 UTC returned a different account, so no folders were created, no files were uploaded and no existing Drive files were moved. Connect the required account and verify its identity before any Drive write. This destination instruction does not approve the remaining retention/recovery policy, Preview import, intake activation or outbox release, and it does not change the existing advisor login.

Owner-only routing remains hard-coded to brokerjesse247@gmail.com. A production activation timestamp now excludes all pre-activation queued messages from both scheduled and direct claims. Unknown acceptance and stale send leases are not automatically repeated. The new source prohibits provider redirects, preserves sequential two-message default batches and does not automatically send reports.

Real-client intake still requires an actual off-host download/decrypt/isolated restore, separate key custody and explicit owner policy approval. A root-controlled, policy/owner-bound launch-evidence record is required in addition to configuration flags; toggling booleans alone cannot open collection. No such record has been fabricated.

## New technical safeguards

- Advisor-scoped legal hold placement/release requires a reason, exact revision, CSRF and trusted origin. Reasons are encrypted; audit summaries contain only action codes. No submitted-record deletion was added.
- Report branding and legal-hold history share exact compare-and-swap updates. Concurrent changes return 409 and roll back; private reasons do not appear in report branding.
- The application recovery bundle authenticates the whole AES-GCM envelope before extraction into a fresh isolated directory. It includes the actual component source, package/lockfile, schema/migrations, public assets and native service code. It excludes env/credential/key files, PDFs, logs, caches and symlink escapes. The separate encrypted database dump covers database-resident profiles/uploads/PDFs; the source bundle is not a substitute for that dump.
- The public privacy notice is runtime-evaluated and distinguishes encrypted profile/report/upload blobs from private normalized database fields. It does not certify legal compliance.

TypeScript and **277 tests across 55 files** passed after the confirmed review fixes. The independent read-only review found and helped close the evidence-by-boolean and log-exclusion issues; component coverage was corrected separately. Off-host destination/deployment, operator recovery kit and a real off-host restore are still pending, not complete merely because these tests passed.

## Public portal and Preview records

Public advisor access remains https://plan.retirementexpert.si/login with the same verified password and blue branding. Root/www website routing and unrelated VPS applications are not changed by this work. Public intake remains closed before rendering data-collection controls.

Preview metadata shows one submitted client, five drafts and no reports. The submitted record is not explicitly named Test/Sample/Demo. None of those records, sessions, passwords or queues has been imported into production without Jesse's migration decision.

The native safeguard release succeeded at **20:57 UTC**, using the unchanged generated Prisma client instead of modifying the previous release's read-only dependencies. Its login/privacy checks passed, anonymous retention access returned 401, and intake contained no personal-input controls. The first failed build had rolled back successfully before this corrected release.

At **20:59 UTC**, the native application service was active on release `20261021T205639Z-safeguards`. `HOSTINGER_MAIL_SENDER_VERIFIED=true`; dispatch, real intake, off-host verification, retention approval, compliance approval and legal-hold policy approval were all `false`. `OUTBOX_ACTIVATED_AT` was not set and the protected launch-evidence file did not exist. These are observed runtime facts, not inferred approvals.

Only the task-specific SSH key with fingerprint `SHA256:hIfelRwbzzFzRAkngjvi6EYBkHTUdSWSJPIYnYU+8jY` was removed. Seven pre-existing authorized-key lines were preserved. A fresh connection using only that task key received **Permission denied (publickey)**. No replacement access, service restart or unrelated server change was made during cleanup.
