# RetirementExpert Planning Workspace

LSRT Insurance development application: intake, password-only advisor access, sourced retirement analysis and private blue-branded PDF reports. Approved production destination is plan.retirementexpert.si on Hostinger. Existing retirementexpert.si remains unchanged. No Manus publishing, production cutover, real-client report email or purchase was performed.

## Development

Node 22, pnpm 10.18.0, Next.js 15, React 19, Prisma 6/MariaDB, Zod, deterministic calculation modules and Chromium/Playwright server PDF generation. `pnpm install`, configure protected environment from `.env.example`, `pnpm db:generate`, then `pnpm db:migrate` against the intended development database. `pnpm dev` serves port 3000. `pnpm check`, `pnpm test` and `pnpm build` validate source. Never run integration fixtures against a production database.

## Advisor setup and access

Provision an authorized advisor with protected `ADVISOR_NAME`, `ADVISOR_EMAIL`, `ADVISOR_PASSWORD` and `pnpm advisor:create`; remove the plaintext bootstrap secret afterwards. Assign the returned ID to `INTAKE_ADVISOR_ID`. No public signup or fake Preview advisor exists. Jesse requested password-only login with an 8–200-character password: verified email/password issues a real secured session, with no authenticator, QR or recovery-code step. A unique 12+ character passphrase is recommended because password-only access is less secure. Hashing, rate limiting, ownership checks, CSRF and the 30-minute idle timeout remain active. Legacy MFA endpoints return 410.

In Preview, sign in and choose **Clients → open a submitted client → Analysis**. Optional planning clarifications do not rewrite the intake. **Reports** provides section selection, editable advisor letter, mandatory letter approval, generation status, immutable version history and private PDF downloads. Generating a PDF is not emailing it and does not record it as sent. Recommendations, notes and multi-scenario comparison remain later-phase features.

## Calculation and report integrity

Annual 2026 SSA/IRS/CMS values and complete RMD tables are supplied through versioned assumptions; future annual rows are explicitly projected, not future verified law. Modules are pure and network-free. Monte Carlo defaults to 5,000 runs with seed 42. Unknown or unsupported inputs produce warnings/partial results, not fabricated precise advice. Separate-living MFS status requires explicit confirmation before its illustration can be treated as resolved. Advisor-edited official figures are labeled unverified planning assumptions.

Analysis snapshots are revision-aware and uniquely cached. Report snapshots preserve input, scenario, annual assumptions/sources, results, engine/RNG metadata, advisor-approved letter, branding and disclosures. Prior PDFs do not change when profile or assumptions are edited. PDF bytes are encrypted at rest, checksum verified and downloaded only through the owning live advisor session plus a ten-minute signed grant. Loss of `DATA_ENCRYPTION_KEY` makes private records unreadable; securely back it up separately.

## Email and operational holds

Transactional alerts, confirmations, resume links and resets use an encrypted durable EmailOutbox. Dispatch requires the authorized LSRT `HOSTINGER_MAIL_API_TOKEN`, verified sender and explicit `OPERATIONS_OUTBOX_DISPATCH_APPROVED=true`. Mailbox metadata verification uses `GET /api/v1/mailboxes`; no inbox or marketing access is permitted. Only HTTP 204 becomes SENT. Ambiguous acceptance is held for manual review rather than blindly retried. `pnpm email:worker` honors the same approval hold as the signed production dispatcher. Queued is not delivered.

The signed dispatcher uses a database-backed atomic replay nonce and generates due private PDFs separately from email. A supported production scheduler must be configured; sandbox timers are not production operations. The mail token is currently unavailable and actual delivery is not verified. See `docs/production-operations.md` and `docs/hostinger-setup-status.md`.

## Production protections and deployment

Use fictional information until compliance, HTTPS origin, private storage, encryption, retention/legal holds, restore evidence and Hostinger runtime are approved. Production draft creation/autosave/uploads/submission fail closed until these independent gates are recorded. Existing daily Hostinger homepage backups do not establish coverage for the new planning database or keys. Encrypted local backup/restore tooling passed an isolated restore drill; off-host production copy and restore testing remain required.

Jesse requested direct Hostinger hosting and separate GitHub source backup on the existing repository’s platform branch. Never push application changes to its live main. FTP is the stated transfer preference; a Next.js/Chromium server cannot run by copying source into static public_html. Resolve Hostinger runtime/startup/dependency support and the compatible transfer procedure before activation. A production build must include standalone output, `.next/static`, public assets, Prisma runtime and a verified `CHROMIUM_EXECUTABLE_PATH`. Credentials belong in protected server configuration, never public folders.

## Validation and safety

`scripts/verify-foundation.ts` refuses any database except retireplan_test. It exercises real password/intake/profile/analysis/report flows, immutable snapshots and session-bound downloads, then removes dedicated fixtures. It never sends provider mail. `scripts/verify-backup-drill.ts` uses a separate retireplan_restore_test target and private encrypted artifacts. These scripts are not dashboard seeding or auto-login tools.

Set `TRUST_PROXY_X_FORWARDED_FOR=true` only behind a trusted ingress that strips supplied forwarding headers. Passive GETs do not renew idle deadlines. In embedded HTTPS Preview, cookies use SameSite=None;Secure. The development-only `PREVIEW_PROXY_INTERNAL_ORIGIN=http://127.0.0.1:3000` exception requires the exact public forwarded host, HTTPS, same-origin fetch metadata and same-origin referrer; it never bypasses passwords, sessions or CSRF. Do not enable it in production.
