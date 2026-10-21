# RetirementExpert completion status

Updated October 20, 2026. The existing blue retirementexpert.si website is preserved. The planning app is still in development Preview, not accessible through the regular website yet.

## What is connected

A submitted client can be opened in the advisor workspace. The Analysis tab runs the retirement modules using versioned SSA/IRS/CMS annual assumptions and a reproducible 5,000-run Monte Carlo simulation. Unknown inputs and unsupported cases are identified for advisor review.

The Reports tab supports report-section selection, an editable advisor letter with explicit approval, personalized blue-branded PDF generation, saved immutable versions and private downloads. Generating a report does not email it or mark it as sent.

Advisor Settings includes report branding, mandatory disclosures, editable planning/annual assumptions and a redacted operations status panel. Login remains email/password only, as requested, with the existing eight-character minimum and no authenticator.

## How to try it

1. In Manus Preview, use `/login` and sign in with the existing advisor credentials.
2. Open **Clients**, then choose a successfully submitted fictional client.
3. Choose **Analysis** to inspect the model, sources, warnings and optional planning clarifications.
4. Choose **Reports**, select sections, review the advisor letter, check its approval box and generate the PDF.
5. Wait for Ready, then download the saved version. The report is not automatically sent.

A saved incomplete draft is not a dashboard client. Required intake answers and consent must pass before submission succeeds. Use fictional data until launch protections are approved.

## Verified so far

TypeScript checks and 197 module/security tests across 34 files pass. Twenty isolated integration checks exercised actual password login, intake submission, advisor edits, analysis caching, approved PDF generation, encrypted storage, private downloads and immutable history, including simultaneous cold-cache recalculation. The full default PDF has 22 Letter pages, complete citations/warnings and disclaimers on every page; actual Chromium overflow checks and focused appendix inspection passed. An authenticated encrypted MariaDB backup was successfully restored to a separate test database; tables and a synthetic marker matched. Test fixtures were kept out of the live advisor database and no provider email was sent.

## What is not complete

Actual production transactional email is not verified: the authorized Mail API credential is unavailable, and sender verification/dispatch remain held. Production Node.js/Chromium runtime, planning database/environment, scheduler, encrypted off-host backups, production restore evidence and retention/compliance approval still need activation on Hostinger.

The existing homepage’s daily Hostinger backup does not prove coverage for the new planning database, private reports or encryption keys. FTP upload into the existing static public_html folder is not enough to run this server application. The compatible Hostinger runtime and transfer/start procedure must be settled without replacing the homepage.

Production intake is deliberately blocked until privacy, storage, encryption, retention, legal-hold, restore and runtime gates are approved. Domain linking and a homepage button remain a separate launch action. No publishing, homepage changes, DNS/domain cutover, purchases or client report emails were performed.

Later-phase recommendation approval, notes/tasks, multi-scenario comparison and optional AI narrative are not included in this calculation/report delivery.
