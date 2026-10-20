# RetirementExpert Planning Workspace

Phase 1 development application for LSRT Insurance. Approved destination: plan.retirementexpert.si on Hostinger. Existing retirementexpert.si is preserved. This development workspace is not a production deployment and does not use Manus hosting/database/login in production.

## Development

Node 22, pnpm 10.18.0, Next.js 15, React 19, Prisma 6/MariaDB and shared Zod intake validation. Install with `pnpm install`. Configure server-only environment from `.env.example`, generate Prisma client (`pnpm db:generate`), then apply recorded migrations with `pnpm db:migrate`. Use an isolated development database, not production, for tests. `pnpm dev` serves port 3000; `pnpm check`, `pnpm test`, `pnpm build` validate source.

## Setup gates

Provision a real authorized advisor using `ADVISOR_NAME`, `ADVISOR_EMAIL`, and protected `ADVISOR_PASSWORD` with `pnpm advisor:create`; never commit or print passwords. Assign the returned ID to `INTAKE_ADVISOR_ID`. Public submission fails closed until an actual advisor is assigned. Advisor’s first verified password login requires TOTP enrollment; no fake Preview account or public signup exists. Password must have 12–200 characters.

Set `DATA_ENCRYPTION_KEY` to a securely backed-up random 32-byte hex key. Loss of this key makes encrypted draft/client/upload/outbox records unreadable. Use explicit HTTPS `APP_ORIGIN` for CSRF and resume/reset links. Default cookies use SameSite=None;Secure to work in HTTPS embedded development Preview; explicit COOKIE_LOCAL_HTTP=true applies only to loopback testing.

Real-data intake is not launch-approved. Complete privacy/retention/backup/encryption/storage and compliance checks before inviting real clients. Use fictional data during development. Optional uploads are encrypted, size-limited PDF bytes stored in the private database; never in public assets. Production database backup/restore and file disposition still need configuration.

## Email

Transactional messages are queued encrypted in EmailOutbox. Dispatch requires `HOSTINGER_MAIL_API_TOKEN`, `HOSTINGER_MAIL_SENDER_VERIFIED=true`, and successful verification of the authorized LSRT mailbox metadata. Authorized mailbox is ACa3656503d597985bc359324043d7. No inbox access or marketing operation is needed. `pnpm email:worker` runs one due-message pass with persisted retry state. Configure a supported durable production job runner before calling email operational. Provider HTTP 204 alone becomes SENT. Do not send tests to invented recipients.

## Production deployment

Jesse requested Hostinger direct and GitHub direct, no Manus publication. No publication or production cutover is authorized by Phase 1 plan approval. Source backup to the existing repository’s platform branch must not modify/push its live main branch. FTP is the stated preference where supported; confirm any incompatible Hostinger Node.js deployment method before using it. A Next.js server is not deployable by merely copying source into the existing static public_html website.

Hostinger application runtime, database, environment, job runner, plan.retirementexpert.si binding and real advisor credentials are separate setup gates. Follow provider documentation and inspect current account resources; do not purchase services or delete/replace existing websites. `pnpm build` produces standalone Next output; assets from `.next/static` and public must accompany it. Private config belongs in server environment, not the uploaded public folder.

## Later phases

The Phase 1 intake/dashboard do not yet calculate financial projections, compare scenarios, create PDFs or issue recommendations. Those functions are clearly labeled as unavailable and remain phased per plan.md/TODO.md. Do not advance phases or deliver client reports without Jesse’s approval.

## Security and integration evidence

`pnpm exec tsx scripts/verify-foundation.ts` uses `.env.test` and refuses any database except `retireplan_test`; it creates/removes isolated fixtures, tests real password/TOTP/submit/dashboard/edit flows, and never sends provider mail. It is not a Preview auto-login or seed command. Fixture data must not be used to pretend a real advisor has been provisioned.

Set `TRUST_PROXY_X_FORWARDED_FOR=true` only behind a trusted ingress that strips supplied forwarded headers and overwrites them. Otherwise rate limits use a conservative shared network key. Passive GETs never extend the advisor’s server-side idle deadline. User pointer/key activity can trigger the same-origin CSRF-protected `/api/auth/activity` path.

Outbox dispatch does not blindly retry uncertain provider acceptance. Stale SENDING leases and ambiguous delivery failures are marked FAILED/Mail delivery uncertain for manual review to avoid duplicate customer messages. Setup/configuration failures and definite provider rejection can use bounded retries. Mail remains unverified while the authorized metadata request returns HTTP 403.
