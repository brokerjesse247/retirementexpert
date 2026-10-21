# Proposed real-client launch policy

**Status: awaiting Jesse’s approval. Version: 2026-10-21.** This is an operational proposal, not a certification that LSRT meets every applicable insurance, privacy, tax, legal or records-retention requirement. Jesse remains responsible for professional/compliance review and any stricter applicable requirement. Real-client collection stays closed until approval and the technical recovery checks are completed.

## 1. Email

Use the authorized sender `jesse@lsrtinsurance.com`. Every portal-generated email remains restricted to `brokerjesse247@gmail.com`, including confirmations, draft-resume and password-reset links. Clients therefore do not receive these emails directly; Jesse must securely relay an appropriate client resume/update link when needed. Never forward advisor password-reset links to clients. Reports are not emailed automatically.

The corrected test ran through the actual Hostinger Node application helper. The provider accepted exactly one owner-only test with HTTP 204 on October 21 at 20:42 UTC. That is verified submission to Hostinger, not proof of arrival in a particular Gmail folder. The earlier Python 403 test did not establish a failure of the application’s Node transport. No inbox messages were read, and no general outbox was released by this test. Only new post-activation queue work may be delivered automatically; pre-activation queued mail stays held for review.

## 2. Private off-host backups and recovery

Use a new private folder in the already connected Google Drive account **agentjesse247@gmail.com** for daily encrypted database and application/recovery bundles. Do not share the folder or make backup files public. Do not copy a broad Google OAuth credential onto the VPS.

For unattended uploads, create a narrowly implemented Google Apps Script receiver running in that account. Its web endpoint must accept only authenticated, signed encrypted backup uploads; it must not expose a public file-download, inbox, Drive-browse or arbitrary execution operation. The endpoint itself is reachable publicly, but invalid/unsigned requests are rejected. Only the designated private backup folder may be used. No new paid service or hosting purchase is authorized.

Backups include the planning database, encrypted reports/documents, application source/lockfile, schema/migrations and the planning service/proxy/scheduler configuration needed to rebuild it. Credentials and encryption keys do not travel in the ordinary backup bundle.

Create a **separate password-protected recovery kit** containing the necessary recovery secrets/configuration. Jesse supplies its separate recovery passphrase through protected input. Keep the encrypted kit separately from ordinary backup artifacts; do not store its passphrase on the VPS or in the backup folder. Verify recovery by downloading/decrypting an off-host artifact and restoring only into an isolated test destination, never over an existing application.

Retain at least 30 days of rolling encrypted backup copies. Archive older Drive copies rather than permanently deleting Google Drive files. Any active client legal hold suspends normal backup pruning. Monitor capacity and failed uploads; the existing account has finite storage, not unlimited retention. No backup is called verified merely because its upload was attempted.

## 3. Record retention and legal holds

Retain final reports, approved source/analysis snapshots and associated submitted consent records for **at least six years**, extending this for any stricter applicable obligation or active hold. Do not automatically permanently delete submitted clients, final reports or their evidence.

Review inactive, unsubmitted drafts after **30 days**. Any automatic expiry/deletion behavior must be specifically implemented, tested and hold-aware before it is enabled; until then, do not claim those drafts are automatically removed. Client-level hold placement/release requires an owning-advisor action and a recorded reason. Holds block normal expiration/deletion, including associated annual-update evidence and backup pruning. Hold/release events are audited. Release does not itself delete records.

The site uses HTTPS, real password-only advisor login, 30-minute idle session expiration, request validation, ownership checks and restricted server/database access. Full intake profiles, snapshots, uploaded documents and report content use application encryption and encrypted backups. Some contact/search and normalized structured fields are stored as restricted database fields rather than individually encrypted; do not describe every database column as application-encrypted. Password-only login is the simplification Jesse requested, not a claim that it is equivalent to two-factor authentication.

## 4. Optional Preview migration

Preview currently contains **one submitted client**, five drafts and no reports. The submitted record is **not explicitly named Test/Sample/Demo**, so it must not be silently treated as fictional or copied without Jesse’s approval.

If approved, copy only that submitted client and its submitted answers/consent to Jesse’s public advisor account, using fresh production encryption and a recorded, idempotent import. Do not copy five drafts, sessions, passwords, queues, grant/reset links or fabricated reports. No original recipient email is sent by import. The source Preview record is preserved. If not approved, the public client list correctly remains empty until a new real submission.

## 5. Activation conditions

Preserve the existing blue homepage, public advisor URL and unrelated VPS applications. Confirm private storage/signing, owner policy approval, actual off-host recovery, the signed native scheduler, hold controls and successful limited intake-to-dashboard/report checks. Only then enable real-client intake and new owner-only transactional email. Retain an audit/status record of the approvals and tested facts; do not merely flip flags or describe an untested launch as complete.
