# RetirementExpert — proposed implementation plan

Prepared for Jesse Ramirez, October 20, 2026. Source specification: `output_spec_full.html`, Sections 1–17. This is the approval package required by Sections 1 and 17, not a claim that the platform has been built.

## 1. Preserve the current website and brand

The existing website is a static HTML/CSS/JavaScript site in `brokerjesse247/retirementexpert`. Its documented production deployment is GitHub `main` to Hostinger. The repository was inspected at commit `f26ca34`; no source changes, pushes, or live deployment were made during this planning work.

Keep the public homepage at **retirementexpert.si** intact while the application is developed. Put the planning workspace at the proposed **plan.retirementexpert.si** subdomain, hosted on Hostinger as a server-backed application. This subdomain is proposed, not configured. Connect the homepage’s client-intake and advisor-login actions only after the corresponding application functions actually work. Do not publish fake login, fake reports, or financial output from unfinished modules.

Develop the platform on a separate `platform` branch of the existing GitHub repository so unfinished application work does not trigger the existing `main` homepage deployment. Verify Hostinger’s branch selection, available application capacity, database connectivity and domain binding before establishing a staging deployment. Preserve unrelated websites and DNS settings. Do not purchase or upgrade hosting without separate approval, and do not replace the live homepage’s hosting mode during Phase 1.

### Design direction — locked to the existing site

**Design movement:** restrained dark financial-workspace design, continuing the existing site rather than rebranding it.

**Core principles:** clarity before decoration; consistent blue identity; readable financial information; visible advisor control over client-facing output.

**Color philosophy:** reuse the current luminous blues against near-black surfaces. Blue identifies primary actions and brand emphasis, not a promise of investment performance. The uploaded document’s navy/gold brand instructions, including Sections 11 and 17, are overridden.

**Exact tokens:** background `#080A0E`; surface `#0D1016`; primary blue `#168CFF`; light blue `#47B5FF`; primary text `#F6F7FB`; muted text `#929AA8`. Preserve the current headline gradient `#168CFF → #3CA5FF → #68C7FF` and existing blue button glow. Do not introduce `#C9A84C` gold as a brand accent.

**Layout:** preserve the current homepage composition. Use an uncluttered, guided single-column mobile intake and an advisor workspace with compact navigation and a broad working area. Keep report sections readable on Letter portrait pages. Reports may use white page bodies for print legibility while preserving the same blue branding, rather than printing every page on a dark background.

**Signature elements:** existing blue wordmark suffix, blue gradient emphasis, and restrained luminous primary buttons. Reuse current graphic concepts and SVG chart types; adapt brand-colored elements to the locked palette. Charts must remain distinguishable through labels and line styles, not color alone. Green/amber/red are reserved for explicitly labeled status or warnings, not a replacement brand palette.

**Interaction and animation:** clear focus and loading states, explicit save/submit/report actions, subtle existing-style transitions, reduced-motion support, and no animation that obscures data. Autosave must show whether data is saved or failed.

**Typography:** keep Manrope for headings and DM Sans for interface/body text. Use tabular numerals for financial values and clear screen/print hierarchies.

**Brand essence:** a retirement-analysis workspace that helps LSRT prepare understandable, advisor-reviewed client plans. Personality: clear, careful, professional.

**Voice:** educational and specific, never guaranteed or inflated. Example interface lines: “Your information is saved. Continue when you’re ready.” and “Review these assumptions before generating the report.” Preserve existing homepage wording during foundation development; use LSRT Insurance and the supplied tagline within the planning workflow and reports.

**Logo:** preserve the RetirementExpert wordmark; support Jesse’s LSRT logo upload in Settings. Do not invent a replacement logo. Signature brand color: `#168CFF`.

## 2. Proposed technology and deployment

Use **Next.js and TypeScript** for application screens and server routes, **Prisma with a MySQL-compatible MariaDB database**, a shared **Zod** validation contract, and **Vitest** for pure calculation-module tests. Money persists as integer cents or database decimals; rates and projection calculations use deliberate precision and rounding rules.

Hostinger documents Node.js/Next.js hosting on Business Web Hosting and Cloud plans [1], and MariaDB for its Web/Cloud databases [2]. These are general platform capabilities, not proof that the specific account has already been configured. PostgreSQL is recommended, not mandatory, in the upload; MariaDB avoids introducing a separate database hosting service solely to follow that example. Verify the account’s actual application limits, database access, TLS, encryption and backup behavior before storing real client data.

**Revised by Jesse October 20, 2026 at 11:07:** use **email/password advisor authentication only**, minimum 8 characters, with hashed passwords, password-reset tokens, server-side sessions, rate limiting and a 30-minute idle timeout. Remove TOTP/QR/recovery-code setup and verification, disable obsolete endpoints, and invalidate existing setup secrets/challenges. Password-only login is less secure; recommend a unique 12+ character passphrase without changing the approved minimum. Advisor access remains invitation/bootstrap-controlled; a public signup must never create an advisor. Use HTTPS-only production cookies, CSRF protection and ownership checks on every client, scenario, report and settings operation. No development login bypass.

Use transactional email for advisor alerts, client confirmations, draft-resume links and password resets. Prefer the already authorized LSRT Hostinger Mail integration if its documented send contract and mailbox restrictions cover the requested delivery. Verify the mailbox’s sender identity and Jesse’s recipient address during setup. Credentials remain server-side and never enter Git or browser code. If sending is unavailable, show an explicit pending/failed state rather than reporting a sent message.

For SSA uploads and report files, use storage that supports private authenticated access, expiring links and retention controls. Determine the suitable account-backed private storage during setup; do not put client files under the website’s public assets. Server-side **Playwright/Chromium HTML-to-PDF** and **SVG charts** are the Phase 3 target. Validate Chromium’s runtime availability in Hostinger before that phase; if unavailable, present the specific hosting/service choice instead of silently replacing the requested PDF generation with browser printing.

No hosting upgrade, new paid service, domain purchase, production cutover, or real-client report delivery is included in this plan approval.

## 3. Project structure

The existing homepage remains in its current static deployment. The `platform` branch holds the full application with these responsibilities:

- `app/`: public landing/intake/confirmation/privacy routes, password-only login/reset screens, dashboard, client workspace and settings routes.
- `components/`: reusable brand controls, accessible form fields, progress/navigation, workspace tabs and SVG charts.
- `lib/auth/`: session verification, advisor authorization, password verification/reset and retained security controls.
- `lib/intake/`: the shared eight-step field contract, validation, secure draft access and normalization.
- `lib/calculations/`: pure, network-free functions for all Section 8 modules; reproducible Monte Carlo seed and explicit engine version.
- `lib/assumptions/`: verified yearly tables, source metadata, versioning and scenario resolution.
- `lib/recommendations/`: rules R01–R25, priorities and advisor approval state.
- `lib/reports/`: snapshot assembly, report templates, chart rendering, PDF generation and checksums.
- `lib/services/`: transactional email, private storage and scheduled-work adapters.
- `prisma/`: relational schema and additive, recorded migrations.
- `tests/`: specification fixtures and calculation/authorization checks.
- `public/`: public brand assets only; never client uploads, reports or credentials.

Background work such as PDF generation and annual reviews must use a durable job/outbox mechanism with retry tracking, not a timer left running in the development sandbox.

## 4. Data model

Use the supplied relational entities: **Advisor, Client, Person, Account, IncomeStream, Expense, Goal, Debt, EstateDocs, RiskProfile, Scenario, AnalysisResult, Recommendation, Report, Note, AssumptionYear and AuditLog**. Add **FollowUpTask** for workspace tasks and **Job/EmailOutbox** for durable processing. Every client-owned record is scoped to its advisor. Allow PRIMARY/SPOUSE ownership and future multiple advisors without enabling a public multi-advisor business model now.

Preserve the client status flow: NEW → IN_REVIEW → REPORT_GENERATED → PRESENTED → IMPLEMENTING → ANNUAL_REVIEW_DUE, with ARCHIVED supported. Separate report generation, actual send/download events and meeting presentation status; generating a PDF must not falsely claim the report was presented.

Add **IntakeDraft, DraftAccessGrant, AdvisorSession, PasswordResetToken, Upload and ConsentRecord**. Resume grants use high-entropy hashed tokens, expiry and revocation, with a token exchange into a restricted draft session. No personal information goes into URLs or logs. Record consent timestamp and privacy-notice version. Do not collect SSNs, account numbers or passwords from clients.

Store DOBs and financial information behind authorized server access. For uploads, enforce size/type limits, private storage and safe handling. Warn clients to redact sensitive identifiers on SSA statements, and do not pass uploaded documents to an AI service automatically.

**AnalysisResult and Report require immutable snapshots**, not merely a year pointer to mutable assumptions. Save inputs, scenario overrides, resolved assumption values/source metadata, engine version, RNG seed, results, approved recommendation/narrative text, branding/disclosures version and report checksum. Append report versions; edits to a client or assumption table must not rewrite an old report. Keep approved report blobs protected from ordinary editing/deletion.

## 5. Specification clarifications included for approval

The upload is a strong feature brief, but some inputs and formulas are simplified or incomplete. Implementing every sentence literally would produce misleading output.

1. **Essential expenses:** add an essential-versus-discretionary retirement spending split. Sections 8.4 and R02 require essential spending, but Step 4 currently only collects total spending. Do not assume all expenses are essential or fabricate an income-floor recommendation.
2. **Allocation precision:** store the collected stock/bond/cash percentages as a household-level estimate with an explicit “not sure” state. Only present household-level illustrative rebalancing amounts from those inputs; do not imply holding-specific trades or account-level allocation data that was never collected.
3. **Tax and account treatment:** distinguish taxable brokerage gains from the return of cost basis, qualified versus nonqualified annuities, HSA eligibility/qualified withdrawals, and cash-value insurance from spendable investable assets. Avoid double-counting cash-value insurance in Section 8.1. Missing data must be flagged rather than treated as a precise tax result.
4. **Official-rule validation:** verify SSA/IRS/CMS rules and yearly figures during Phase 2 before they are represented as verified. Store sources and verification dates in the editable assumptions system. Cover filing-status exceptions, historical MAGI/IRMAA lookback, RMD tables through the chosen planning age and the input requirements for survivor/spousal cases. The upload’s checkmarks alone do not prove source verification. Report-supported scope and any unresolved case must be explicit.
5. **Retention versus deletion:** require Jesse’s compliance-approved retention schedule before launch. Client deletion requests must respect required report retention/legal holds, private uploads and backup expiry; do not promise immediate deletion of every record while also promising six-year immutable retention.

The recommendation layer remains educational and advisor-controlled. Insurance/annuity illustrations need explicit product assumptions and must distinguish hypothetical estimates from carrier-backed contractual guarantees. Investment allocation content defaults to educational unless Jesse’s licensing/compliance authorization supports more.

## 6. Delivery phases

### Phase 1 — Foundation

Deliver the blue-branded planning application, protected password-only advisor login/reset/session controls per Jesse’s latest revision, relational database, all eight intake steps from Section 5, conditional spouse fields, shared validation, visible autosave, secure save-and-resume, review/consent/submit/thank-you flow, transactional email status, dashboard KPIs/client search/status filters, and editable client profiles. Include privacy notice and private optional SSA upload handling. The foundation must save a submitted intake that Jesse can actually open and edit. Financial analysis and reports remain clearly unavailable until their phases are delivered.

### Phase 2 — Calculation engine

Deliver editable/versioned yearly assumptions and all Section 8 modules: balance sheet; Social Security by month with claiming comparisons/spousal/survivor modeling; accumulation; tax-aware cash flow; seeded 5,000-run Monte Carlo and sequence stress; withdrawal strategies; tax; Roth conversion comparisons; RMDs; Medicare/IRMAA; LTC stress; allocation/glide path; estate/insurance gaps; readiness score. Use all Section 14.1 expected-value tests and the two sample clients in isolated test/demo data. Do not seed fictional clients into a live client list without clear labeling. Resolve official-rule differences rather than forcing a test to conceal a known defect. Persist calculation lineage and expose missing-input/unsupported-case states.

### Phase 3 — Analysis and PDF reporting

Deliver the Analysis workspace and charts tied to the engine, selectable report sections, Letter portrait report layout following Section 11, blue-branded cover/headers/accents, readable SVG charts, disclosures on every report page, server-side PDF generation, immutable version history and protected downloads. Typical report length remains 16–22 pages; charts and numbers must agree with the saved analysis snapshot. No automatic sending merely because generation succeeded.

### Phase 4 — Advisor-controlled recommendations

Deliver rules R01–R25, approve/edit/remove/add workflow, opportunity flags, advisor notes/follow-up tasks, up to three side-by-side scenarios and optional AI narrative. AI writes from calculated results only and never performs financial calculations. Validate generated numeric claims, expose narrative for advisor approval and fall back to approved templates when needed. No client delivery without Jesse’s approval.

### Phase 5 — Launch

Deliver the approved subdomain integration and working homepage links, annual-review workflow/reminders 30 days before review, approved disclosures, private-storage controls, retention/deletion process, backup and restore arrangements, and security hardening. Real client data and report delivery require the compliance/data-handling gate to be satisfied. Preserve the current homepage and rollback path throughout deployment. Optional Section 15 upgrades are not silently added to the initial five phases.

## 7. Approval requested

Approve this architecture, data model additions/clarifications and Phase 1 scope. Approval authorizes foundation implementation and setup inspection, not a paid purchase or production cutover. Build one phase at a time and present what works before advancing, as the upload requests.

**References**

[1]: https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/ "Hostinger Node.js application deployment"
[2]: https://www.hostinger.com/support/1583226-which-database-management-system-is-used-at-hostinger/ "Hostinger database management system"


## Approval and later constraints

Jesse approved this plan and plan.retirementexpert.si on October 20, 2026. Phase 1 may proceed. Later supplied preferences require FTP for deployments and preservation of all existing wording/graphics/design/functionality. Do not use the previous Git auto-deployment proposal for deployment without resolving this later constraint. No production cutover or purchases authorized. Development uses an isolated workspace and external MySQL-compatible database; no production Manus dependency is introduced.

Jesse further clarified: no Manus publishing; Hostinger direct and GitHub direct through connected tools. The development Preview/checkpoint is separate from production and must not be represented as publication. Existing main auto-deployment remains untouched.

## October 20, 2026 at 16:28 — authorized continuation

Jesse considers intake closed and explicitly authorizes completion of the prior response’s Step 2 (the full calculation engine, analysis interface and personalized server-generated PDF) and Step 3 (transactional email and production data protection). Work proceeds across original Phases 2 and 3 plus the relevant email/storage/backup controls without another phase approval. The intake is not disabled. Existing blue design, password-only advisor login and no Manus publication remain unchanged. Homepage/domain deployment, purchases and client-report sending are still outside this authorization.

Independent calculation units use shared immutable inputs and annual sourced assumptions. Analysis results capture the client revision, resolved annual rules, assumption version, engine version, seed, results and checksum. Reports add an encrypted private PDF, durable build state, idempotency key, retention date and full immutable approved branding/text snapshot. The existing cloud database can privately store encrypted PDFs without a new public asset service; production deployment and daily off-host backup still require account configuration. Future tax/premium values are explicitly projected assumptions, never falsely marked as official future law. Unknown inputs produce warnings or unavailable scores rather than fabricated precision.

## October 21 advisor completion

Jesse approved remaining advisor feature implementation and confirmed `brokerjesse247/retirementexpert` → `platform` as the source destination. Recommendations, independent scenarios, private notes/tasks, numeric-validated narrative review, report enrichment and explicit annual-review/update workflows are connected in development. Production activation, optional AI-provider approval, actual email dispatch, KVM 2 deployment and domain/homepage linkage remain separate launch work.

## October 21 production safeguard activation

Jesse requests production email/data-protection activation, with all outgoing portal mail restricted to brokerjesse247@gmail.com. A separate root-access approval is required before adding this task-specific VPS key. Existing applications/keys, blue homepage and DNS are preserved. Technical readiness must be evidenced on the real Hostinger runtime; privacy/compliance/retention, backup recovery and live sender approval are not inferred from this implementation request.

## October 21 at 09:18 approved VPS access

Jesse approved the exact task-specific SSH key. The existing VPS already has Node 22, MySQL 8 and nginx/PM2 applications. Reuse those native prerequisites without Docker installation or replacing services. Prepare a separate non-root runtime and DML-only planning database; keep the staged application loopback-only on port 3117. All intake/mail/compliance/backup attestations remain false until their actual checks complete. No public routing, DNS or homepage deployment is included in this access approval.

## October 21 at 13:15 — authorized public advisor connection

Jesse explicitly authorized connecting retirementexpert.si to the planning portal. The earlier no-DNS/no-homepage-cutover limits now permit only this scoped connection: a plan A record to the existing KVM 2, its own nginx HTTPS host to the loopback application, and direct advisor links plus truthful availability text in the existing homepage index. Root/www/ftp records, other host configurations, blue styling, SVGs and asset references remain unchanged. Native Hostinger routing and the provider's single-file upload API are used; no Manus publication, purchase, reinstall, broad website import or GitHub main deployment occurs.

Jesse's owner name/email and existing verified password hash are provisioned without changing the password, importing clients, copying documents or releasing old queues. Public intake is runtime-gated before rendering the questionnaire. Real intake, compliance/retention/off-host backup approvals and outgoing delivery remain closed; the recorded Mail API 403 is not bypassed or retried. Code and minimally updated homepage source stay in retirementexpert/platform. Temporary task-specific server access is removed after verification. Current operational evidence and sign-in instructions are in docs/public-access-status.md.
