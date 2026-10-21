# RetirementExpert completion status

Updated October 21, 2026. Public advisor access is now connected at https://plan.retirementexpert.si/login. The regular retirementexpert.si website links directly to it and preserves its blue styling and graphics. Only the planning DNS record, isolated HTTPS host and minimal homepage links/status text changed. Real-client intake and outgoing mail are not activated. No Manus publication was requested.

## Connected advisor features

Submitted clients have sourced retirement analysis and private blue-branded PDF reports. Recommendations evaluates all R01–R25 rules, identifies unavailable facts and supports explicit approve/edit/remove/custom actions. No proposal becomes client advice automatically. Relevant income, tax-free planning, long-term-care, life-insurance and estate/legacy review flags show supporting evidence.

Scenarios saves independent alternatives and compares up to three without rewriting the submitted profile. Supported what-ifs include claiming/retirement ages, spending, returns/inflation, Roth schedules, account balances, supplied LTC events and supplied hypothetical annuity income. Assumptions and unknown tax treatment remain explicit; these are not product quotes.

Notes & tasks provides encrypted timestamped notes, archival, due dates, ownership and complete/reopen actions. Narrative builds client-specific numeric-validated templates, allows edits and requires approval. Optional provider-assisted AI is disabled until credentials, model and data-sharing approval are configured. Recommendation changes clear dependent narrative approval.

Reports can select a saved scenario, an optional comparison, matching approved narrative and approved actions. “How LSRT can help” wording requires an explicit report option. Saved snapshots and PDFs never change after later edits. The baseline full report is 22 pages; additional approved content may require continuation pages rather than clipping. Generating/downloading does not send a report or mark it presented.

Annual review explicitly records presentation of a ready report, sets the one-year review date and supports the implementing status. The signed application dispatcher can queue a deduplicated advisor reminder thirty days before review when enabled. An advisor-requested prefilled annual questionnaire uses a one-use, expiring grant and renewed consent; it updates the same client while preserving old reports and existing private SSA documents. Queued email is not delivered email.

Advisor Settings includes branding, disclosures, annual/planning assumptions, safe editable annual email templates and redacted operations status. Password-only login and the eight-character minimum remain unchanged.

## How to try it

Public sign-in is available at https://plan.retirementexpert.si/login using agentjesse247@gmail.com and the same existing advisor password. No authenticator is required. The public database starts without clients: Preview clients, documents and queued email were not imported. While real-client safeguards remain unapproved, continue fictional questionnaire/report testing in Manus **Preview**. Select **Clients**, open a submitted fictional client and use the advisor tabs. Review and approve actions and narrative before generating an enriched report. See `docs/advisor-feature-help.md` for the detailed flow. Public /intake clearly shows collection closed; do not submit real financial or health information yet.

## Evidence

The dedicated test database exercises twenty-eight real protected API checks through password login, submission, analyses, private reports and the advisor workflow. A synthetic full report with twenty-five approved actions, next steps, explanations and comparison passed real Chromium overflow checks and complete footer/source/warning inspection across thirty-one pages. Read-only integration review found no confirmed meaningful ownership, CSRF, revision or annual-update safety issue. The full module/security suite passed 237 tests across 46 files; the dedicated API harness passed 28 checks. The final Next.js production build also passed. No fake test clients were inserted into Preview and no provider email was sent.

## Still needed for production

The isolated application, planning database, non-root Chromium, signed queue timer, private encrypted storage, local restore drill and public HTTPS now run on the existing Hostinger KVM 2, with unrelated services preserved. Real-client activation still needs approved encrypted off-host backup/key recovery, retention/legal holds, compliance and a real-client verification. The approved one-message Mail API test returned HTTP 403; no delivery was confirmed and outgoing dispatch remains held. Do not reset/reinstall the VPS, disturb existing services or bypass the provider rejection.

The approved planning subdomain and homepage links are now connected. Public advisor access does not remove intake, compliance, backup or email holds. The connection passed the Hostinger route build, 25 focused regressions, ten public endpoint checks and a read-only boundary review. Detailed current login and connection evidence is in `docs/public-access-status.md`.

## Source boundary

Jesse confirmed this project stays in `brokerjesse247/retirementexpert` on `platform`. Do not mix it into mysscoach or push these application changes to the live homepage main branch. Manus checkpoint storage is separate and does not publish this site.
