# RetirementExpert implementation outcomes

Approved by Jesse October 20, 2026. Build Phase 1 now; present it before starting Phase 2. Existing retirementexpert.si is untouched. Approved application destination: plan.retirementexpert.si on Hostinger. Latest deployment constraint: FTP only; do not silently replace it with Git/ZIP deployment. No purchases, upgrades, production cutover or real-client report delivery authorized.

- [x] **Brand and site preservation.** Preserve the current homepage, wording, graphics, layout and functionality. New planning pages use primary #168CFF, light #47B5FF, background #080A0E, surface #0D1016, text #F6F7FB, muted #929AA8, existing blue gradient and Manrope/DM Sans. No gold rebrand. Do not delete existing content. Production remains Hostinger, not Manus. Save platform work separately from existing auto-deployed main.
- [x] **Advisor-only authentication.** Real email/password login with hashed passwords, TOTP two-factor authentication and hashed recovery codes; invitation/bootstrap-only advisor provisioning, no public advisor signup, password reset, server sessions with a 30-minute idle timeout, rate limiting, CSRF and advisor ownership checks. Never fake a logged-in Preview user. Protected dashboard, client and settings routes fail closed.
- [x] **Persistent relational foundation.** Prisma/MySQL-compatible MariaDB, decimal or integer-cents money. Advisor, Client, Person, Account, IncomeStream, Expense, Goal, Debt, EstateDocs, RiskProfile plus session, draft/access, consent, upload, outbox and audit records. Preserve future scenario/analysis/recommendation/report/note/task/assumption models without implying later functionality exists.
- [x] **About you — Step 1.** Required first/last name, valid email/phone, DOB age 18–90, state, marital status Single/Married/Divorced/Widowed, filing status Single/MFJ/MFS/HoH preselected from marital status. Married spouse name/DOB required and only shown when married. Dependents/special needs, employment status you/spouse Employed/Self-employed/Retired/Not working. No SSN/account number/password collection.
- [x] **Income — Step 2.** Required annual earned income you/spouse. Monthly pension/start age/survivor percentage 0/50/75/100 and COLA you/spouse. Monthly annuity/start age, rental/other income/end age, retirement part-time income/end age. Persist validated fields.
- [x] **Savings — Step 3.** Account balances by owner: pretax 401k/403b/457/TSP, Roth401k, Traditional/SEP/SIMPLE IRA, Roth IRA, HSA, taxable brokerage and basis, cash/CDs, fixed/indexed annuity cash value, cash-value life insurance. Employee contribution %, employer match %, IRA/Roth dollars. Household stock/bond/cash percentages or explicit unknown. Include qualified/nonqualified annuity and HSA eligibility clarifications; distinguish investable assets from insurance cash value. Whole-dollar UI, commas, help tips; precision-safe persistence.
- [x] **Expenses — Step 4.** Required current/retirement monthly spending in today's dollars; optional 80% of current helper and essential/discretionary split. Repeatable one-time goals item/amount/year. Home value, mortgage balance/payment/payoff year. Repeatable debts balance/rate/payment. Do not fabricate essential spending from total.
- [x] **Social Security — Step 5.** Required monthly benefit at FRA you/spouse, existing benefits amount/start age, planned claiming age 62–70 or advise me, government noncovered pension informational flag. Optional privately handled PDF SSA upload, redact sensitive identifiers warning, file size/type checks, no public storage/AI forwarding.
- [x] **Goals — Step 6.** Required retirement age you/spouse 50–80, Simple/Comfortable/Active-travel/Luxury lifestyle, rank top 3 concerns from Running out of money/Taxes/Healthcare/Market crash/Legacy/LTC/Inflation, legacy amount, annual charity.
- [x] **Health and protection — Step 7.** Health Excellent/Good/Fair/Poor you/spouse; family longevity, employer/ACA/retiree/COBRA/spouse health coverage and pre-Medicare plan, life insurance type Term/Whole/Universal/IUL/Group/death benefit you/spouse, LTC yes/no/daily benefit, disability yes/no. Five risk questions scored 1–5; 5–11 Conservative,12–18 Moderate,19–25 Aggressive. No health underwriting claims.
- [x] **Estate, review and consent — Step 8.** Will/trust/financial POA/healthcare directive/beneficiaries yes/no/unsure with update years. Full review summary and edit-step links. Required exact consent: “I agree LSRT Insurance may use this information to prepare my retirement analysis and contact me. I understand this is not tax or legal advice.” Store consent timestamp and privacy version.
- [ ] **Secure guided intake.** Public no-login mobile eight-step form, progress, validation client/server, help tips on financial fields, visible server autosave/saved/error states, retry without silent loss. Save-and-continue-later uses emailed high-entropy hashed expiring/revocable grants exchanged for a restricted draft cookie. No PII in URLs/logs, no recoverable draft from a guessed ID. Review→Submit→thank-you, honeypot/rate limits. Submission creates a New client without duplicate retries. Phone user target under15minutes.
- [ ] **Transactional email.** Persist outbox for advisor alert, client confirmation, draft resume and password reset. Verify LSRT sender and recipient. Server-only credentials. Clearly show pending/failed delivery; never claim sent before provider succeeds. No marketing sends. Operational delivery must survive development process exit.
- [ ] **Advisor dashboard and client editing.** KPI new intakes7days/reports this month/reviews due30days/in review; table name/age/date/status and available fields, search/status filter/sort/CSV export. Never fabricate readiness/Monte Carlo for undelivered engine. Client profile edit validated against intake with change/audit records, status NEW/IN_REVIEW/REPORT_GENERATED/PRESENTED/IMPLEMENTING/ANNUAL_REVIEW_DUE/ARCHIVED. Status presentation/send events separate from PDF generation. Settings advisor profile/default branding/security and privacy page; analysis/reports clearly unavailable until delivered.
- [ ] **Future calculation engine.** Every Section8 module, exact SSA/IRS/CMS verified rules, source/versioned annual assumptions no hardcoded yearly numbers, deterministic 5000 seeded Monte Carlo, snapshot lineage, all Section14.1 tests and two clearly labeled isolated fixtures. Missing inputs/unsupported cases explicit. Phase2 only after Phase1 review.
- [ ] **Future reports.** Section11 Letter portrait 16–22 page server HTML/Chromium PDF, SVG charts/numbers matching analysis, blue branding not gold, disclaimer every page, section selection/cover options, immutable inputs/scenario/assumption/source/engine/RNG/results/approved-text/branding/disclosure snapshots plus checksum, version history and private expiring download. No automatic send on generation. Phase3.
- [ ] **Future advisor-controlled advice.** R01–R25 rule triggers/priority/client-specific dollar impact, approve/edit/remove/add; up to3 scenarios, notes/follow-up tasks, flags, optional AI narrative calculated numbers only, numeric validation/template fallback and advisor approval. Educational licensing-aware recommendations, no fabricated product guarantees. Phase4.
- [ ] **Launch security and operations.** Approved disclosures/compliance, encryption/TLS/private storage, retention/deletion/holds reconcile six-year records, backup and restore, approved domain integration, annual review reminder30days prior/update link, security checks and approved real-client run. No purchases or unrelated site/DNS changes. Phase5.
- [x] **Read-only implementation review.** One read-only validation agent traces requirements, authentication/data access, intake persistence and UI connections after implementation. Fix confirmed defects; no redundant full review cycles.

## Evidence and operational gates

Checked outcomes above are development implementation outcomes, not production-launch claims. Five unit/security/regression files passed 17 tests; a dedicated isolated-database harness passed 13 real-authentication/intake/dashboard checks. Recorded migrations applied only to development/test. Read-only review completed and confirmed defects corrected. Preview remains without a fictitious advisor. Secure-guided-intake stays open for real resume-email delivery; transactional email stays open for sender verification/HTTP403 and durable production dispatch; advisor workspace stays open for real Jesse onboarding and report-logo/branding settings. All later phases/launch remain open. No live homepage or Hostinger production changes.

Detailed original clauses are preserved below by section; these are source requirements, not claims of completion.


## Original specification — 1. How to use this document with Manus

Give Manus this entire PDF, then paste the
Master Prompt
from Section 17. Build in the phases from Section 14. Do
not
ask for everything in one request: a phased build is easier to check and gives far more accurate calculations.

Step | What you do | What “done” looks like
1. Kick-off | Upload this PDF to Manus and paste the Master Prompt. Ask Manus to confirm its plan, tech choices, and phase list before it writes code. | Manus repeats back the phases and confirms it will follow the formulas exactly.
2. Phase 1 | Foundation: login, database, intake form, dashboard. | You can submit a test intake and see it in your dashboard.
3. Phase 2 | Calculation engine + automated tests using the sample client in Section 14. | Every acceptance test passes with the expected numbers.
4. Phase 3 | PDF report generation with your branding. | One click produces a 15–20 page branded PDF.
5. Phase 4 | Recommendations, AI narrative, advisor notes, scenario comparison. | You can edit or approve every recommendation before the PDF goes out.
6. Launch | Compliance review (Section 13), real-domain deployment, update the tax table for the current year. | Your compliance contact has approved the disclaimers and report language.
The one rule to repeat to Manus:
“All tax numbers, contribution limits, Medicare premiums and Social Security figures must come from the editable Assumptions Table (Section 7), never from numbers hard-coded in the formulas. Every calculation must have an automated test that matches the expected values in Section 14.”



## Original specification — 2. Product overview, users & goals

2.1 What the platform does

A prospect or client opens your public link and fills out a guided, multi-step
intake questionnaire
. It saves as they go, so they can stop and return.
You get an email alert. The client appears in your
advisor dashboard
with the status “New”.
You open the client, check and correct their data, add advisor notes, and optionally adjust assumptions (returns, inflation, retirement age).
The
calculation engine
runs every module: Social Security, income, Monte Carlo, tax, Roth, RMD, Medicare, LTC, allocation, estate, and insurance gaps.
The
recommendation engine
proposes prioritized action items. You approve, edit, or remove each one.
You click
Generate Report
. The system builds a branded PDF and saves it to the client record. You download it or send it to the client.
You track each client through: New → In Review → Report Generated → Presented → Implementing → Annual Review Due.

2.2 Users

Role | Access
Advisor (you) | Full access: dashboard, all clients, assumptions table, report generation, settings, branding. Phase 1 has one advisor account; the data model should allow more advisors later.
Client / prospect | Public intake form only. No login needed for v1. Optional Phase 2: a client portal to download their own reports.
2.3 Goals for an outstanding advisor tool

Accurate:
formulas follow official SSA, IRS and CMS rules (Section 8), not rough rules of thumb.
Personal:
every recommendation cites the client’s own numbers, for example “Delaying to 70 adds $X over your lifetime if you live to 90.”
Actionable:
each recommendation has a priority, a dollar impact, and a clear next step, including the insurance or annuity solution LSRT can provide where one fits.
Advisor-controlled:
nothing reaches the client until you approve it.
Compliant:
clear disclaimers, stated assumptions, and a saved audit copy of every report sent.



## Original specification — 3. Technical requirements

Manus can choose the exact technology, but the build must meet these requirements. A modern web stack such as Next.js + PostgreSQL + Prisma works well.

Area | Requirement
Hosting | Online web app on a custom domain (for example, plan.lsrtinsurance.com) with HTTPS. It must work well on phones, because many clients will fill the form on a phone.
Database | A relational database (PostgreSQL recommended) with daily backups.
Authentication | Email + password advisor login with hashed passwords (bcrypt/argon2), password reset, and session timeout. Two-factor authentication is strongly recommended.
PDF generation | Server-side HTML-to-PDF with a headless browser (for example Playwright/Chromium). Charts are rendered as SVG so they stay sharp. Use page breaks and a branded header and footer on every page.
Charts | An SVG chart library (Recharts, Chart.js-to-SVG, or hand-built SVG) that renders both on screen and inside the PDF.
File storage | Cloud storage (for example S3) for generated PDFs and optional client uploads such as an SSA statement. Use private links that expire.
Email | Transactional email for “new intake submitted” alerts to you and a “thank you” confirmation to the client.
AI (optional, Phase 4) | An LLM API used only to turn calculated results into plain-English narrative, under the guardrails in Section 10. The AI never calculates numbers.
Calculation engine | One pure module with no database or network calls (for example lib/calculations/ ). Each module is its own function with unit tests. Use a seeded random-number generator for Monte Carlo so results can be reproduced.
Assumptions | All yearly figures (tax brackets, limits, premiums, SS figures) are stored in a database table keyed by year and editable from an advisor Settings screen.


## Original specification — 4. Pages, screens & user flows

Page / route | Access | Contents
Landing / | Public | LSRT branding, tagline, a 3-step “How it works” section, what the client receives (sample report pages), a trust/privacy statement, and a “Start My Retirement Plan” button. Include an advisor login link in the footer.
Intake /intake | Public | An 8-step questionnaire (Section 5) with a progress bar, field validation, plain-language help tips (ⓘ), autosave, and a “Save & continue later” option that emails a resume link.
Confirmation /intake/thank-you | Public | Thank-you message, what happens next, and an optional booking link (Calendly).
Advisor login /login | Public | Email/password login, forgot password, LSRT branding.
Dashboard /dashboard | Advisor | KPI cards (new intakes, reports this month, reviews due), and a client table with search, status filter, sort, and quick actions (Section 12).
Client workspace /dashboard/clients/[id] | Advisor | Tabs: Profile (editable intake data), Analysis (live results and charts for every module), Scenarios (side-by-side what-ifs), Recommendations (approve/edit), Notes , and Reports (history and downloads).
Settings /dashboard/settings | Advisor | Advisor profile and signature, logo upload, report cover text, disclosures text, default assumptions, and the yearly Assumptions Table editor.
4.1 Key flow: from intake to delivered report

Client: Landing → Intake steps 1–8 → Review → Submit → Thank-you
   ↓  (email alert to advisor; status = NEW)
Advisor: Dashboard → open client → verify/correct data → status = IN_REVIEW
   → Analysis tab (engine runs live) → Scenarios (optional)
   → Recommendations: approve / edit / add custom
   → Generate Report → PDF saved (version N) → status = REPORT_GENERATED
   → Download / email to client → status = PRESENTED
   → (12 months later) status = ANNUAL_REVIEW_DUE, reminder email to advisor



## Original specification — 5. Client intake form — every field

The form is divided into 8 short steps. Required fields are marked
*
. Dollar fields accept whole numbers and format with commas. Show a short ⓘ tip on every financial field (for example, “Find this on your latest 401(k) statement”). Spouse fields only appear when the marital status is Married.

Step 1 — About you

Field | Type | Notes / validation
First name*, Last name* | text |
Email*, Phone* | email / tel | Valid formats
Date of birth* | date | Age 18–90
State of residence* | select | Used for state tax notes and state estate/inheritance tax flags
Marital status* | select | Single / Married / Divorced / Widowed
Tax filing status* | select | Single / Married Filing Jointly / Married Filing Separately / Head of Household (pre-select from marital status)
Spouse first/last name, DOB | text / date | Required if married
Number of dependents; any dependents with special needs? | number / yes-no | The special-needs answer triggers the special needs trust recommendation
Employment status (you / spouse) | select | Employed / Self-employed / Retired / Not working
Step 2 — Income

Field | Type | Notes
Annual gross earned income* (you / spouse) | $ |
Expected pension at retirement (monthly), start age, survivor % (you / spouse) | $ / age / % | Survivor options: 0, 50, 75, 100%
Pension cost-of-living adjustment? | yes/no |
Existing annuity income (monthly), start age | $ / age |
Rental / other income in retirement (monthly) and end age | $ / age |
Plan to work part-time in retirement? Income and until what age | $ / age | Used for the Social Security earnings-test warning
Step 3 — Savings & investments (by tax type)

Field | Type | Tax bucket
401(k)/403(b)/457/TSP — pre-tax balance (you / spouse) | $ | Tax-deferred
Roth 401(k) balance | $ | Tax-free
Traditional IRA / SEP / SIMPLE balance | $ | Tax-deferred
Roth IRA balance | $ | Tax-free
HSA balance | $ | Tax-free (for medical costs)
Brokerage / taxable investments and estimated cost basis | $ | Taxable
Cash / savings / CDs | $ | Taxable (emergency fund)
Fixed or indexed annuity cash value | $ | Tax-deferred
Cash value life insurance | $ | Other
Current yearly contributions: employee %, employer match %, IRA/Roth $ | % / $ | Used for growth projection and the “capture the full match” rule
Approximate current mix: % stocks / bonds / cash (or “not sure”) | % | Used for allocation comparison
Step 4 — Expenses, home & debts

Field | Type | Notes
Current monthly spending* | $ |
Expected monthly spending in retirement* (today’s dollars) | $ | Offer “Not sure — use 80% of current”
Big one-time goals (item, amount, year): travel, home repair, car, wedding | repeatable rows |
Home value, mortgage balance, monthly payment, payoff year | $ / year |
Other debts (balance, rate, monthly payment) | repeatable rows | Flag any debt with an interest rate above 8%
Step 5 — Social Security

Field | Type | Notes
Estimated monthly benefit at Full Retirement Age* (you / spouse) | $ | Tip: “Log in at ssa.gov/myaccount and use the amount shown at your full retirement age.” This is your PIA.
Already receiving benefits? Amount and start age | yes/no / $ |
Planned claiming age (or “advise me”) | 62–70 |
Upload SSA statement (optional) | file (PDF) | Stored privately
Government pension from non-covered work? | yes/no | Informational only (WEP/GPO were repealed in January 2025)
Step 6 — Retirement goals

Field | Type | Notes
Desired retirement age* (you / spouse) | number | 50–80
Retirement lifestyle | select | Simple / Comfortable / Active-travel / Luxury
Top concern (rank top 3) | rank | Running out of money / Taxes / Healthcare / Market crash / Leaving a legacy / Long-term care / Inflation
Desired amount to leave heirs or charity | $ |
Charitable giving each year | $ | Triggers QCD / donor-advised fund rules
Step 7 — Health, insurance & risk

Field | Type | Notes
Health status (you / spouse) | select | Excellent / Good / Fair / Poor
Family longevity (parents lived past 85?) | yes/no | Used to set the planning age (90 / 95 / 100)
Current health coverage; plan before Medicare | select | Employer / ACA / Retiree plan / COBRA / Spouse’s plan
Life insurance: type, death benefit (you / spouse) | select / $ | Term / Whole / Universal / IUL / Group
Long-term care insurance? Daily benefit | yes/no / $ |
Disability insurance? (if still working) | yes/no |
Risk questionnaire (5 questions, scored 1–5 each) | radio | Score 5–11 = Conservative, 12–18 = Moderate, 19–25 = Aggressive. Example question: “If your portfolio fell 20% in a year you would: sell all / sell some / hold / buy a little / buy more.”
Step 8 — Estate documents, consent & review

Field | Type | Notes
Do you have: Will / Living trust / Financial POA / Healthcare directive / Updated beneficiaries (and year last updated)? | yes/no/unsure each | Drives the estate checklist
Review screen | summary | All answers with “Edit” links for each step
Consent checkbox* | checkbox | “I agree LSRT Insurance may use this information to prepare my retirement analysis and contact me. I understand this is not tax or legal advice.”
Never collect
Social Security numbers, account numbers, or passwords in the intake form.



## Original specification — 6. Database / data model

Suggested tables. Field names are guidance; Manus may adjust them. Store money as decimals or integer cents, never as floating-point numbers.

Table | Key fields
Advisor | id, name, email, passwordHash, phone, licenseNumbers, signatureImageUrl, logoUrl, createdAt
Client | id, advisorId, status (enum: NEW, IN_REVIEW, REPORT_GENERATED, PRESENTED, IMPLEMENTING, ANNUAL_REVIEW_DUE, ARCHIVED), source, submittedAt, nextReviewDate, plus all personal fields from Step 1
Person | id, clientId, role (PRIMARY / SPOUSE), dob, income, piaAtFRA (SS benefit at FRA), plannedClaimAge, retirementAge, healthStatus, pension fields, life/LTC/disability coverage
Account | id, clientId, ownerRole, type (401K_PRETAX, ROTH_401K, TRAD_IRA, ROTH_IRA, HSA, BROKERAGE, CASH, ANNUITY, CASH_VALUE_LIFE), balance, costBasis, annualContribution, employerMatchPct
IncomeStream | id, clientId, type (PENSION, ANNUITY, RENTAL, PART_TIME, OTHER), monthlyAmount, startAge, endAge, colaPct, survivorPct
Expense / Goal / Debt | monthly spending (current and retirement), one-time goals (amount, year), debts (balance, rate, payment)
EstateDocs | will, trust, financialPOA, healthcareDirective, beneficiariesUpdatedYear (yes/no/unsure each)
RiskProfile | answers JSON, score, profile
Scenario | id, clientId, name (“Base”, “Retire at 67”, “Delay SS to 70”), overrides JSON (any assumption or input), isBase
AnalysisResult | id, scenarioId, engineVersion, assumptionsYear, inputsSnapshot JSON, results JSON, createdAt
Recommendation | id, clientId, ruleId, priority (HIGH/MEDIUM/LOW), category, title, body, dollarImpact, status (PROPOSED/APPROVED/EDITED/REMOVED), advisorEditedText, sortOrder
Report | id, clientId, version, pdfStoragePath, analysisResultId, generatedAt, sentAt (an immutable audit copy)
Note | id, clientId, body, createdAt
AssumptionYear | year, key, value (JSON), sourceUrl, verifiedAt — see Section 7
AuditLog | who, action, entity, entityId, timestamp


## Original specification — 7. Planning assumptions & annual tax/limit table

7.1 Default planning assumptions (editable per client and scenario)

Assumption | Default | Notes
General inflation | 2.5% | Applied to expenses
Healthcare inflation | 5.0% | Applied to premiums and out-of-pocket costs
Social Security COLA | 2.5% |
Expected return — Conservative / Moderate / Aggressive | 5.0% / 6.5% / 7.5% | Nominal yearly arithmetic mean
Volatility (std. dev.) — Conservative / Moderate / Aggressive | 7% / 11% / 15% | Used by Monte Carlo
Planning age (life expectancy) | 95 (100 if excellent health + family longevity; 90 if poor health) | Per person
Monte Carlo runs | 5,000 | Seeded random-number generator
Monte Carlo target | ≥ 85% = On Track (green), 70–84% = Caution (amber), < 70% = At Risk (red) |
Pre-Medicare health premium (per person per month) | $900 | Advisor-editable; varies by state, age, and subsidy
Medigap / Medicare Advantage + Part D premium (per person per month) | $250 | Editable
Out-of-pocket medical (per person per year, 65+) | $2,500 | Editable
Long-term care cost (per month), duration | $9,000, 3 years | Editable by state
State income tax rate (flat estimate) | From state table | Editable
7.2 Assumptions Table — 2026 values (store in database, edit every January)

Values marked ✓ were confirmed against IRS, Medicare, or tax-reference sources in October 2026. Values marked ⚠ are from memory and
must be checked against the listed official source before launch
. Each January, check and update the whole table from IRS.gov, SSA.gov, and Medicare.gov.

Item | 2026 value | Source
Federal brackets — Married Filing Jointly ✓ | 10% ≤ 24,800; 12% ≤ 100,800; 22% ≤ 211,400; 24% ≤ 403,550; 32% ≤ 512,450; 35% ≤ 768,700; 37% above | IRS / Tax Foundation
Federal brackets — Single ⚠ | 10% ≤ 12,400; 12% ≤ 50,400; 22% ≤ 105,700; 24% ≤ 201,775; 32% ≤ 256,225; 35% ≤ 640,600; 37% above | IRS Rev. Proc. for 2026
Standard deduction ✓ | MFJ $32,200 · Single $16,100 · HoH $24,150 | IRS
Additional standard deduction, age 65+ ⚠ | Check the current amount (per person; higher for single filers) | IRS
“Senior bonus” deduction, age 65+ (2025–2028) ⚠ | $6,000 per person, phases out above MAGI $75k single / $150k joint | OBBBA 2025 / IRS
Long-term capital gains 0% / 15% / 20% thresholds ⚠ | Load the current-year thresholds | IRS
401(k)/403(b)/457/TSP employee limit ✓ | $24,500 | IRS
401(k) catch-up age 50+ ✓ / ages 60–63 ✓ | $8,000 / $11,250 | IRS
IRA limit ✓ / IRA catch-up 50+ ✓ | $7,500 / $1,100 | IRS
HSA limits (self / family / 55+ catch-up) ⚠ | Load current values | IRS
Medicare Part B standard premium ✓ | $202.90 / month | CMS / Medicare.gov
IRMAA tiers (based on MAGI from 2 years earlier) ✓ | Single: ≤109k $202.90; ≤137k $284.10; ≤171k $405.80; ≤205k $527.50; <500k $649.20; ≥500k $689.90. Joint: thresholds 218k / 274k / 342k / 410k / 750k. Part D surcharges: $0 / 14.50 / 37.50 / 60.40 / 83.30 / 91.00 | CMS
Federal estate exemption ✓ / annual gift exclusion ✓ | $15,000,000 per person / $19,000 per recipient | IRS (OBBBA)
SS earnings-test limits, taxable maximum, COLA ⚠ | Load current values | SSA.gov
Social Security taxation thresholds (fixed by law, not indexed) | Single 25,000 / 34,000 · MFJ 32,000 / 44,000 | IRC §86
RMD start age (SECURE 2.0) | 73 if born 1951–1959; 75 if born 1960 or later | IRS
QCD annual limit ⚠ | Load current indexed value (age 70½+) | IRS


## Original specification — 8. Calculation engine — formulas by module

Each module is a pure function:
(inputs, assumptions) → results
. Every output in the report must trace back to one of these functions. Run the engine for each person (primary and spouse) and for the household. Projections are yearly, from the current age to the planning age.

8.1 Net worth & balance sheet

totalInvestable = sum(all Account balances)
buckets: taxDeferred = 401k pre-tax + Trad IRA + annuity; taxFree = Roth 401k + Roth IRA + HSA;
         taxable = brokerage + cash
netWorth = totalInvestable + homeValue + cashValueLife − mortgage − otherDebts
emergencyFundMonths = cash / currentMonthlySpending

8.2 Social Security (use exact SSA rules)

Full Retirement Age (FRA)

Birth year | FRA
1943–1954 | 66
1955 | 66 + 2 months
1956 | 66 + 4 months
1957 | 66 + 6 months
1958 | 66 + 8 months
1959 | 66 + 10 months
1960 and later | 67
People born on January 1 use the prior year. Use age in months for every claiming calculation.

Own (worker) benefit at any claim age

m = months between claim age and FRA
If claiming EARLY:   reduction = (5/9 of 1%) × min(m,36) + (5/12 of 1%) × max(m−36, 0)
                     benefit = PIA × (1 − reduction)
If claiming LATE:    credit = (2/3 of 1%) × m  (8% per year, stops at age 70)
                     benefit = PIA × (1 + credit)
Check (FRA 67, PIA $2,000): age 62 → $1,400 (70%); age 67 → $2,000; age 70 → $2,480 (124%)

Spousal benefit

Maximum spousal = 50% of the worker's PIA (at the spouse's FRA), and only once the worker has filed.
If the spouse's own PIA < 50% of the worker's PIA: excess = 50%×workerPIA − ownPIA
Early spousal reduction: 25/36 of 1% per month for the first 36 months, then 5/12 of 1%
(spousal benefits get NO delayed credits after FRA)
Check: worker PIA $2,000, spouse own PIA $600, both at FRA → spouse gets $600 + $400 = $1,000

Survivor benefit

When the first spouse dies, the survivor keeps the larger of the two benefits (including any delayed credits the deceased earned). Model this in the cash-flow projection at each spouse’s planning age, and show the “survivor income drop” as a dollar amount.

Claiming-strategy optimizer

Test every combination of claim ages 62–70 (in yearly steps; monthly steps are optional) for the primary and the spouse. That is 81 combinations for a couple.
For each combination, calculate cumulative lifetime household benefits with COLA, including spousal and survivor benefits, to each planning age. Also show the present value at a 3% real discount rate.
Report the best strategy, the planned strategy, and “claim both at 62”, with the dollar difference between them.
Show cumulative-benefit curves for 62, FRA, and 70, plus the break-even ages.

Break-even (simple, no COLA): age where cumulative(later) ≥ cumulative(earlier)
Check (PIA $2,000, FRA 67): 62 vs 67 → ~78.7 ; 67 vs 70 → ~82.5

Earnings test and taxation

If the client claims before FRA and plans to keep working, apply the earnings-test limit ($1 withheld for every $2 over the limit; $1 for every $3 in the year FRA is reached). Show a warning.
Taxable Social Security (provisional income method):

PI = other AGI + tax-exempt interest + 0.5 × SS
MFJ (base1=32,000, base2=44,000, cap=6,000) | Single (25,000, 34,000, 4,500)
if PI ≤ base1: taxable = 0
elif PI ≤ base2: taxable = min(0.5×SS, 0.5×(PI − base1))
else: taxable = min(0.85×SS, 0.85×(PI − base2) + min(0.5×SS, cap))

8.3 Accumulation (until retirement)

For each year until retirement, for each account:
  balance = balance × (1 + expectedReturn) + employeeContribution + employerMatch
  contributions are capped at the current-year limits (with catch-up by age)
  salary grows by inflation (+ an optional raise %)

8.4 Retirement cash-flow projection (core of the report)

Build a year-by-year table from retirement to the planning age with these columns:
Age(s), Spending need (inflated), Healthcare cost, One-time goals, Social Security, Pensions, Annuities, Other income, Portfolio withdrawal, Taxes, Ending balances by bucket
.

need_t = retirementSpending × (1+inflation)^(t) + healthcare_t + goals_t
guaranteedIncome_t = SS_t + pensions_t + annuities_t + other_t
gap_t = need_t − guaranteedIncome_t + taxes_t
Withdrawal ORDER (default, tax-smart):
  1) RMDs (forced)  2) taxable/cash  3) tax-deferred up to top of target bracket
  4) Roth last (unless needed to avoid IRMAA/bracket jump)
Iterate taxes and withdrawals until they converge (2–3 passes)
Outputs: age money runs out (if any), ending legacy value, total lifetime taxes,
         Income Coverage Ratio = guaranteedIncome / essential spending

8.5 Monte Carlo simulation

runs = 5,000 (seeded RNG)
For each run, for each year from retirement to planning age:
  r = random yearly return ~ Normal(mean, stdDev) (or lognormal; optionally a
      fat-tailed bootstrap from historical returns in Phase 2)
  portfolio = (portfolio − withdrawal_t) × (1 + r)
  withdrawal_t comes from the cash-flow model (inflation-adjusted)
  fail if portfolio ≤ 0 before planning age
Outputs: probability of success %, median / 10th / 90th percentile ending balance,
         "fan chart" of percentile bands by age, age of depletion in the worst 10%
Also show a SEQUENCE-OF-RETURNS stress test: −25% in year 1 then average returns.

8.6 Withdrawal strategies

4% rule:
first-year withdrawal = 4% × portfolio at retirement, then raised by inflation each year. Example: $1,000,000 → $40,000.
Sustainable withdrawal rate:
solve for the highest starting rate that keeps Monte Carlo success at or above 85%.
Guardrails (Guyton-Klinger style):
cut spending 10% if the withdrawal rate rises 20% above the start rate; raise it 10% if the rate falls 20% below.
Bucket strategy:
Bucket 1 holds 2 years of gap in cash, Bucket 2 holds years 3–10 in bonds, Bucket 3 holds growth assets. Show the dollar amount for each bucket.

8.7 Taxes

taxableIncome = wages + pension + annuity + taxable SS + IRA/401k withdrawals + Roth conversions
                + ordinary investment income − standardDeduction(age 65+ additions) − senior deduction
federalTax = progressive brackets by filing status (from the Assumptions Table)
marginalRate = bracket containing the last dollar; effectiveRate = federalTax / gross income
Check: MFJ 2026, gross $150,000, standard deduction → taxable $117,800 → tax $15,340, marginal 22%

8.8 Roth conversion analysis

Conversion window = years from retirement (or now) until RMD start age and SS start
For each year in the window:
  room = top of the target bracket (default 22% or 24%) − projected taxable income
  also cap so MAGI stays below the next IRMAA threshold (watch age 63+ because of the 2-year look-back)
  conversion_t = max(0, room), limited by the remaining pre-tax balance
Compare "no conversion" vs "bracket-fill conversion": lifetime federal tax, RMD sizes,
IRMAA years, after-tax value to heirs (assume heirs' tax rate 24%, editable).
Recommend converting only if lifetime tax or after-tax legacy improves.

8.9 Required Minimum Distributions

RMD_age = prior Dec-31 tax-deferred balance / Uniform Lifetime factor(age)
Factors: 73=26.5, 74=25.5, 75=24.6, 76=23.7, 77=22.9, 78=22.0, 79=21.1, 80=20.2,
         81=19.4, 82=18.5, 83=17.7, 84=16.8, 85=16.0, 86=15.2, 87=14.4, 88=13.7,
         89=12.9, 90=12.2, 91=11.5, 92=10.8, 93=10.1, 94=9.5, 95=8.9
(Use the Joint Life table if the spouse beneficiary is more than 10 years younger.)
Check: $500,000 at age 75 → $20,325; at 73 → $18,868
Flag when RMDs push the client into a higher bracket or an IRMAA tier.

8.10 Healthcare & Medicare

gapYears = max(0, 65 − retirementAge) per person → pre-Medicare cost = premium × 12 × gapYears (inflated)
From 65: Part B (+IRMAA by projected MAGI 2 years earlier) + Part D (+IRMAA) + Medigap/MA + OOP
Lifetime healthcare cost (today's $ and future $) per person and for the household
HSA: show how many years of premiums the HSA covers

Also explain enrollment timing (the 7-month Initial Enrollment Period around age 65, late-enrollment penalties) and Medigap vs. Medicare Advantage in plain language.

8.11 Long-term care

LTC risk cost = monthlyCost × 12 × years, inflated to age 85 at healthcare inflation
Stress test: rerun the cash flow with an LTC event at 82 for 3 years; report the change in success % and legacy
Coverage gap = projected cost − existing LTC benefit

8.12 Asset allocation

Risk profile from the questionnaire score, then adjusted for time horizon and Income Coverage Ratio.
Target equity %: Conservative 30–40, Moderate 50–60, Aggressive 70–80 (store these in settings).
Glide path: reduce equities gradually from 10 years before retirement to a floor at retirement. Show a table every 5 years.
Compare current vs. target and show the dollar amount to shift.
Asset location tip: bonds in tax-deferred accounts, growth in Roth, tax-efficient index funds in taxable accounts.

8.13 Estate & insurance

Life insurance need (DIME / needs method):
  need = debts + mortgage + (income replacement: survivor income gap × years) + education + final expenses (≈$15k)
         − liquid assets − existing coverage
Survivor income gap = household need after first death − survivor income (larger SS + survivor pension %)
Estate tax flag: netWorth > federal exemption (or a state threshold) → advise an attorney
Checklist status from EstateDocs: Will, Revocable trust (recommend if >$500k, real estate in
multiple states, minor/special-needs heirs, or privacy concerns), POA, healthcare directive,
beneficiaries updated in the last 3 years, TOD/POD designations, digital assets

8.14 Retirement Readiness Score (0–100)

A single headline number for the cover page:

score = 40% × MonteCarloSuccess + 20% × min(IncomeCoverageRatio,1)×100
      + 15% × taxDiversificationScore + 10% × emergencyFundScore
      + 10% × insuranceProtectionScore + 5% × estateDocsScore
85+ Excellent · 70–84 Good · 55–69 Needs Attention · <55 At Risk



## Original specification — 9. Recommendation engine — rules

Each rule has an ID, a trigger condition, a priority, a dollar impact (when it can be calculated), and a text template filled with the client’s numbers. The engine proposes rules, and
the advisor approves or edits each one
. Sort them by priority, then by dollar impact. Show the top 3 on the Executive Summary and all of them in the Action Plan.

ID | Category | Trigger | Recommendation template (example)
R01 | Income | Monte Carlo < 70% | HIGH — “Your plan has a {p}% chance of lasting to {age}. Retiring {n} years later, saving ${x}/mo more, or trimming spending by ${y}/mo raises it above 85%.” (solve for each lever)
R02 | Income | Income Coverage Ratio < 1.0 for essential expenses | “Guaranteed income covers {c}% of essentials. A guaranteed lifetime income annuity of ${premium} could close the ${gap}/yr floor gap.” (LSRT solution)
R03 | Social Security | Optimal strategy beats planned strategy by > $25k lifetime | “Claiming at {opt} instead of {plan} is projected to add ${diff} in lifetime benefits (to age {pa}).”
R04 | Social Security | Married and higher earner plans to claim before 70 | “Delaying the higher earner to 70 raises the survivor benefit to ${s}/mo, protecting {spouse} for life.”
R05 | Social Security | Claiming before FRA while still working | “Earnings-test warning: about ${w} of benefits would be withheld in {year}.”
R06 | Tax | Roth conversion improves lifetime tax by > $10k | “Convert about ${amt}/yr from {start} to {end}, filling the {b}% bracket. Projected lifetime tax savings: ${s}.”
R07 | Tax | Tax-free bucket < 15% | “Only {t}% of savings is tax-free. Direct new savings to Roth to gain tax flexibility.”
R08 | Tax | Projected RMDs push into a higher bracket or IRMAA tier | “RMDs of ${r} at {age} would trigger IRMAA of ${i}/yr. Start reducing pre-tax balances now.”
R09 | Tax | Charitable giving > 0 and age ≥ 70½ | “Give via Qualified Charitable Distributions from your IRA. They count toward RMDs and are excluded from income.”
R10 | Savings | Employee contribution % < employer match % | “You are leaving ${m}/yr of free employer match on the table.”
R11 | Savings | Age ≥ 50 (or 60–63) and not maxing contributions | “You are eligible for catch-up contributions of up to ${c}/yr.”
R12 | Savings | Emergency fund < 6 months | “Build cash reserves to ${target} (6 months) before taking investment risk.”
R13 | Debt | Any debt with an interest rate > 8%, or mortgage extends past retirement | “Paying off {debt} saves ${interest} in interest and lowers retirement spending by ${pmt}/mo.”
R14 | Healthcare | Retirement age < 65 | “{n} years before Medicare: budget about ${cost} for bridge coverage. Keep income low to qualify for ACA subsidies.”
R15 | Healthcare | HSA-eligible and HSA not maxed | “Max your HSA: it is triple tax-advantaged and covers Medicare premiums later.”
R16 | LTC | No LTC coverage and LTC stress test drops success by > 10 points | “A 3-year care event drops your plan from {a}% to {b}%. Consider a hybrid life/LTC policy.” (LSRT solution)
R17 | Protection | Life insurance gap > $50k, or survivor income drop > 25% | “Your family would face a ${gap} gap. Term or permanent coverage of ${amt} closes it.” (LSRT solution)
R18 | Protection | Working, under 60, no disability coverage | “Your ability to earn is your largest asset. Review disability income insurance.”
R19 | Investments | |current equity % − target| > 15 points | “Rebalance about ${amt} from {from} to {to} to match your {profile} profile.”
R20 | Investments | Within 5 years of retirement and equity > 70% | “Sequence-of-returns risk: a −25% year now would cut your success rate to {s}%. Build a 2-year cash bucket.”
R21 | Estate | Any of Will / POA / Directive missing | “Missing documents: {list}. Meet with an estate attorney.”
R22 | Estate | Trust criteria met and no trust | “A revocable living trust can avoid probate on your ${x} estate.”
R23 | Estate | Beneficiaries not updated in more than 3 years, or “unsure” | “Review beneficiaries on every account and policy. They override your will.”
R24 | Legacy | Desired legacy > projected median ending balance | “To leave ${goal}, consider a dedicated life insurance policy instead of underspending.” (LSRT solution)
R25 | Spending | Success ≥ 95% and legacy goal met | “You could spend about ${extra}/yr more and stay on track. Enjoy your retirement!”
Rules tagged “LSRT solution” should show an optional “How LSRT can help” line that you can turn on or off per report. The wording must stay educational, with no guarantees (see Section 13).



## Original specification — 10. AI narrative layer (with guardrails)

AI is optional, but it makes reports feel personal. Use it
only to write
, never to calculate.

Input to the AI:
the calculated results JSON, the approved recommendations, and the client’s first name and top concerns. Never send SSNs or account numbers.
Output:
(a) a 150–250-word executive summary letter from the advisor; (b) a 2–3 sentence plain-English explanation at the top of each report section.
Guardrails in the prompt:
“Use ONLY numbers present in the JSON. Do not invent figures, products, returns, or guarantees. Do not give legal or tax advice; say ‘discuss with your tax professional’. Write at an 8th-grade reading level, in a warm and confident tone.”
Validation:
after generation, extract every number from the AI text and check it exists in the results JSON. If any does not match, regenerate or fall back to the template text.
Advisor review:
all AI text appears in an editable box. The PDF uses the advisor-approved version.
On-screen helper (Phase 2):
an “Ask about this client” chat that answers advisor questions using the client’s results JSON.



## Original specification — 11. PDF report — page-by-page specification

Letter size, portrait. LSRT logo and navy header bar on every page; gold accent rules; footer with “Prepared by [Advisor], LSRT Insurance · [date] · Page X of Y” and a one-line disclaimer. Charts are SVG. Status colors: green #2E7D32, amber #C77700, red #B3261E. Typical length is 16–22 pages.

# | Page | Contents
1 | Cover | Navy full-bleed page, LSRT logo, “Retirement Plan for [Client & Spouse]”, date, advisor name and contact, tagline, and the large Retirement Readiness Score dial.
2 | Advisor letter + contents | Personal letter (AI or template, advisor-approved) and table of contents.
3 | Executive summary | Score, Monte Carlo %, retirement age, monthly income need vs. projected income, net worth, and top 3 actions with dollar impact. Uses a “traffic light” grid of 8 areas (Income, SS, Tax, Healthcare, LTC, Investments, Protection, Estate).
4 | Your information | Summary of the inputs and assumptions used, so the client can confirm accuracy.
5 | Net worth & tax buckets | Balance sheet table, and a donut chart of taxable / tax-deferred / tax-free with a diversification score.
6–7 | Social Security | FRA, benefit at 62 / FRA / 70 for each spouse, cumulative-benefit line chart with break-even markers, optimizer result vs. planned (lifetime $ difference), survivor benefit, earnings-test and taxation notes.
8–9 | Retirement income plan | Stacked-area chart of income by source per year vs. spending need, a 5-year-step cash-flow table, Income Coverage Ratio, and the “income floor vs. flexible spending” explanation.
10 | Monte Carlo | Success % gauge, percentile fan chart, sequence-risk stress test, and the levers that improve the result.
11 | Withdrawal strategy | 4% rule amount, sustainable rate, guardrails bands, bucket strategy amounts, withdrawal order.
12–13 | Tax plan | Current vs. retirement bracket, effective rate, lifetime tax projection, Roth conversion schedule table (year, amount, tax cost, bracket, IRMAA check), with/without comparison, contribution limits and catch-up eligibility.
14 | RMDs | RMD start age, RMD table by age (73/75 to 95), bracket and IRMAA flags, QCD note.
15 | Healthcare & Medicare | Pre-Medicare gap cost, Medicare cost table by age including IRMAA, lifetime healthcare estimate, enrollment timeline graphic, Medigap vs. Advantage explainer, HSA strategy.
16 | Long-term care | Cost projection, stress test result, coverage gap, funding options (self-fund, traditional LTC, hybrid life/LTC, annuity with LTC rider).
17 | Investments | Current vs. target allocation bars, glide-path table, rebalancing amounts, asset location tips.
18 | Protection & estate | Life insurance needs calculation, survivor income gap, estate checklist with ✓ / ✗ / ? status, beneficiary reminder, estate tax note.
19–20 | Action plan | All approved recommendations grouped by priority, each with a checkbox, a “next step”, an owner (Client / Advisor / CPA / Attorney), and a target date.
21 | Glossary | Terms used in the report (Section 16).
22 | Assumptions & disclosures | All assumptions with values, data sources, methodology summary, full disclaimer, advisor signature block, and license numbers.
Report options panel
(before generating): pick sections to include, show or hide “How LSRT can help”, choose a scenario to report, include a scenario comparison page, and set the cover note. Each generation saves a new version.



## Original specification — 12. Advisor dashboard features

KPI cards:
new intakes (7 days), in review, reports generated this month, annual reviews due in 30 days.
Client table:
name, age, submitted date, status badge, readiness score, Monte Carlo %, investable assets, next review date. Includes search, filter, sort, and CSV export.
Client workspace:
editable profile with change tracking; live analysis that recalculates within 2 seconds of an edit; charts that match the PDF.
Scenarios:
duplicate the base plan, change any input (retirement age, SS age, spending, returns, Roth conversions, LTC event, annuity purchase), and view up to 3 scenarios side by side (success %, lifetime tax, legacy, income).
Opportunity flags:
a badge list on each client (e.g. “Roth candidate”, “Life insurance gap $350k”, “Annuity income gap”, “LTC unprotected”) so you can see business opportunities at a glance.
Notes & tasks:
time-stamped notes, follow-up tasks with due dates.
Annual review:
set a review date when a report is presented; an email reminder fires 30 days before; one click sends the client an “update your info” link prefilled with last year’s answers.
Settings:
branding, disclosures, default assumptions, Assumptions Table editor, email templates.



## Original specification — 13. Compliance, privacy & security

Important:
have your compliance department, broker-dealer, or an attorney review the report language before launch. Recommending specific securities or investment allocations may require investment-adviser registration (RIA/IAR). Insurance-only licenses usually allow educational analysis and insurance and annuity solutions. Set the allocation section to “educational” if you are not securities-licensed.

Disclaimer
(footer, plus the full version on the last page): “This report is for educational and illustrative purposes only. It is based on information you provided and on assumptions that may not occur. Projections are hypothetical, are not guarantees, and do not reflect actual investment results. LSRT Insurance does not provide tax or legal advice; consult a qualified tax professional or attorney. Insurance product guarantees are subject to the claims-paying ability of the issuing company.”
Monte Carlo disclosure explaining what the simulation is and its limitations.
Saved, unchangeable copy of every report sent (audit trail), kept for at least 6 years or as your regulators require.
Data: HTTPS everywhere, encryption at rest, private file storage with expiring links, no SSNs or account numbers collected, role-based access, audit log, daily backups, and a client data-deletion process on request.
Security: rate-limited login, two-factor authentication for the advisor, 30-minute idle timeout, CAPTCHA or honeypot on the public form, input validation on server and client.
Privacy notice and consent checkbox on the intake form, plus a privacy page linked in the footer.



## Original specification — 14. Build phases & acceptance tests

Phase | Scope | Acceptance criteria
1 — Foundation | Branding, landing page, advisor login and 2FA, database, 8-step intake with autosave and validation, email alerts, dashboard list, client profile view/edit. | A phone user can complete the intake in under 15 minutes; the advisor sees it and can edit it.
2 — Engine | Assumptions Table + Settings editor, every module in Section 8, readiness score, unit tests. | All tests in 14.1 pass; results recalculate on edit.
3 — Report | On-screen Analysis tab with charts, PDF generation, report history and versions, download. | The PDF matches Section 11, every page is branded, and there are no cut-off tables.
4 — Advice | Recommendation rules, approve/edit workflow, AI narrative with number validation, scenarios, opportunity flags. | Every recommendation shows client-specific numbers; the AI never introduces a number not found in the results.
5 — Launch | Compliance review, custom domain, annual-review reminders, backups, security checks. | Disclosures approved; real client test run.
14.1 Required unit tests (exact expected values)

Test | Expected
FRA for birth years 1954 / 1957 / 1960 | 66y0m / 66y6m / 67y0m
PIA $2,000, FRA 67, claim at 62 / 67 / 70 | $1,400 / $2,000 / $2,480
PIA $2,000, FRA 67, claim at 64 | $1,600 (20% reduction)
PIA $2,000, FRA 66y6m, claim at 62 (54 months early) | $1,450 (27.5% reduction)
Spousal: worker PIA $2,000, spouse own PIA $600, spouse at FRA | $1,000 total
Spousal only (own PIA $0), claim at 62, FRA 67 | $650 (32.5% of worker PIA)
Break-even 62 vs 67 / 67 vs 70 (PIA $2,000, no COLA) | ≈ 78.7 / ≈ 82.5 years
Federal tax: MFJ 2026, gross $150,000, standard deduction only | Taxable $117,800 → tax $15,340; marginal 22%
Taxable SS: MFJ, SS $40,000, other income $30,000 | PI = $50,000 → taxable SS = min(34,000, 0.85×6,000 + 6,000) = $11,100
RMD: $500,000 balance at 75 / 73 | $20,325.20 / $18,867.92
RMD start age: born 1955 / born 1962 | 73 / 75
4% rule: $1,000,000 | $40,000 in year 1
IRMAA 2026: single MAGI $120,000 | Part B $284.10/mo; Part D surcharge $14.50/mo
Monte Carlo with seed 42: identical inputs run twice | Identical success %
Monte Carlo sanity: $2M portfolio, $40k/yr draw, 30 yrs, 6.5%/11% | Success > 90%
Monte Carlo sanity: $300k portfolio, $60k/yr draw, 30 yrs | Success < 10%
14.2 Sample test clients (load as seed data)

Client A — “James & Linda Mitchell”:
married, MFJ, ages 58 and 56, incomes $120k / $45k, 401(k) $620k, Trad IRA $90k, Roth IRA $40k, brokerage $85k, cash $30k, home $450k with a $110k mortgage, spending $7,500/mo now and $6,500/mo in retirement, SS PIA $2,900 / $1,300, retire at 63 / 62, moderate risk, no LTC coverage, will yes / trust no. This client should trigger R03/R04, R06, R14, R16, and R22.

Client B — “Sarah Thompson”:
single, age 45, income $85k, 401(k) $140k, Roth $25k, cash $8k, spending $4,800/mo, SS PIA $2,100, retire at 67, aggressive risk, contributes 3% with a 5% match, no estate documents. This client should trigger R07, R10, R12, R18, and R21.



## Original specification — 15. Recommended upgrades (Phase 2 & 3)

These features will set your practice apart, roughly in order of value:

Interactive client meeting mode:
a full-screen presentation view with sliders (retirement age, SS age, spending) that update the success % live during meetings.
Annuity / guaranteed income illustrator:
enter a premium and payout rate to see the effect on the income floor, Monte Carlo, and legacy (SPIA, DIA, FIA with an income rider).
Insurance needs module:
deeper life, LTC, and disability analysis, with “before vs. after coverage” plan results.
Client portal:
clients log in to see reports, upload documents, and update information annually.
SSA statement reader:
upload the SSA PDF and use AI to extract the earnings record and PIA (advisor confirms).
e-Signature and scheduling:
Calendly booking from the thank-you page; DocuSign for engagement letters.
CRM sync:
push clients and tasks to your CRM (e.g. HubSpot, Redtail, Wealthbox).
Historical back-testing:
show how the plan would have performed retiring in 1929, 1966, 2000, and 2008.
State tax engine:
full state income-tax brackets, and state-level Social Security and retirement income exclusions.
Lead magnet:
a free 2-minute “Retirement Readiness Quiz” on your website that feeds into the full intake.
Spanish-language intake and report.
Multi-advisor support
with roles, if you add staff.



## Original specification — 16. Glossary of retirement terms (for the report appendix)

Term | Plain-English definition
Primary Insurance Amount (PIA) | Your Social Security benefit if you claim exactly at Full Retirement Age.
Full Retirement Age (FRA) | The age (66–67, based on birth year) when you get 100% of your PIA.
Delayed Retirement Credits | An 8% per year increase for waiting past FRA, up to age 70.
Spousal benefit | Up to 50% of your spouse’s PIA, based on their work record.
Survivor benefit | When a spouse dies, the survivor keeps the larger of the two Social Security checks.
Break-even age | The age when total benefits from waiting catch up to total benefits from claiming early.
Earnings test | A rule that temporarily withholds Social Security benefits if you work and earn above a limit before FRA.
Provisional income | The formula that decides how much of your Social Security is taxable (up to 85%).
COLA | Cost-of-living adjustment: the yearly inflation increase to Social Security.
Monte Carlo simulation | Thousands of random market scenarios used to estimate the chance your money lasts.
Probability of success | The share of simulations in which you never run out of money.
Sequence-of-returns risk | The danger of poor market returns in the first years of retirement.
4% rule | A guideline: withdraw 4% of savings in year one, then adjust for inflation.
Guardrails | Rules that trim or raise spending when markets move a lot.
Bucket strategy | Splitting savings into cash (near-term), bonds (mid-term), and stocks (long-term).
Income floor | Guaranteed income (SS, pension, annuity) that covers essential expenses.
Income Coverage Ratio | Guaranteed income divided by essential expenses.
Tax-deferred account | 401(k)/Traditional IRA: taxes are paid when money is withdrawn.
Tax-free (Roth) account | Taxes are paid up front; qualified withdrawals are tax-free.
Taxable account | A brokerage or bank account; you pay tax on interest, dividends, and gains.
Tax diversification | Holding money in all three tax buckets for flexibility.
Marginal tax bracket | The tax rate on your next dollar of income.
Effective tax rate | Total tax divided by total income.
Roth conversion | Moving money from a pre-tax account to a Roth and paying tax now to avoid it later.
Required Minimum Distribution (RMD) | The yearly withdrawal the IRS requires from pre-tax accounts starting at 73 or 75.
Qualified Charitable Distribution (QCD) | A gift from your IRA directly to charity at age 70½ or older; it is not taxed as income.
Catch-up contribution | Extra retirement contributions allowed at age 50+ (higher at 60–63).
HSA | Health Savings Account: tax-deductible in, tax-free growth, tax-free out for medical costs.
Medicare Parts A / B / D | Hospital / medical / prescription drug coverage starting at age 65.
Medigap vs. Medicare Advantage | Supplement insurance to Original Medicare vs. an all-in-one private plan.
IRMAA | A higher Medicare premium for people with higher income (based on income from 2 years earlier).
Initial Enrollment Period | The 7-month window around your 65th birthday to sign up for Medicare.
Long-term care (LTC) | Help with daily living (home care, assisted living, nursing home), mostly not covered by Medicare.
Hybrid life/LTC policy | Life insurance that can also pay for long-term care.
Annuity (SPIA / DIA / FIA) | An insurance contract that can provide guaranteed lifetime income.
Asset allocation | The mix of stocks, bonds, and cash in your portfolio.
Glide path | Gradually reducing stock exposure as retirement approaches.
Asset location | Placing investments in the account type where they are taxed least.
Rebalancing | Restoring your target mix after markets move.
Inflation | The rising cost of living that reduces purchasing power over time.
Will / Revocable living trust | Documents that direct who gets your assets; a trust can avoid probate.
Power of attorney (POA) | Authorizes someone to handle your finances if you can’t.
Healthcare directive | Your medical wishes and healthcare agent.
Beneficiary designation | Who inherits an account or policy; it overrides your will.
Probate | The court process for settling an estate without a trust.
Estate tax exemption | The amount you can leave free of federal estate tax ($15M per person in 2026).
Step-up in basis | Heirs’ cost basis resets to the value at death, reducing capital gains tax.
Retirement Readiness Score | LSRT’s 0–100 summary of how prepared you are.


## Original specification — 17. Master prompt to paste into Manus

Copy everything in the box below and paste it into Manus together with this PDF.

I am a retirement advisor at LSRT Insurance (solo advisor). Build me a production-quality web platform
exactly as described in the attached specification "LSRT Insurance — Retirement Planning Platform —
Build Specification v1.0". Follow it section by section.

Summary:
- Public, mobile-friendly 8-step client intake (Section 5) with autosave, validation, consent.
- Secure advisor login (2FA) and dashboard (Sections 4, 12).
- Pure, unit-tested calculation engine (Section 8) using exact SSA/IRS/CMS rules: SS by month with
  spousal/survivor benefits and a claiming optimizer, cash-flow projection with tax-smart withdrawal order,
  Monte Carlo (seeded, 5,000 runs), withdrawal strategies, federal tax by filing status, taxable SS,
  Roth conversion bracket-fill with IRMAA check, RMDs (SECURE 2.0 ages), Medicare + IRMAA, LTC stress test,
  allocation/glide path, life insurance needs, estate checklist, Retirement Readiness Score.
- ALL yearly figures come from an editable Assumptions Table by year (Section 7) - never hard-code them.
- Recommendation rules R01-R25 (Section 9); I approve/edit every recommendation before it reaches a report.
- Optional AI narrative (Section 10): the AI writes text only, uses only numbers from the results JSON, and
  every number is validated.
- Branded 16-22 page PDF report (Section 11): navy #1B3A6B, gold #C9A84C, SVG charts, saved versions.
- Compliance, privacy, security (Section 13).

How to work:
1. First reply with your plan, tech stack, data model and the phase list from Section 14. Wait for my OK.
2. Build one phase at a time. At the end of each phase show me what works and how to test it.
3. Implement every unit test in Section 14.1 and show me they pass. Load the two sample clients (14.2).
4. If anything in the spec is unclear or a rule/limit looks outdated, ask me - do not guess.
5. Do not collect SSNs or account numbers. Put disclaimers on every report page.

Brand: LSRT Insurance - "Your Retirement, Expertly Planned". My logo will be uploaded in Settings.

Tips for working with Manus:
review each phase before approving the next; enter the two sample clients yourself and read the PDF as if you were the client; ask Manus to “show the formula and the test” for any number that looks wrong; update the Assumptions Table every January.

This specification is a technical guide for software development. It is not tax, legal, or investment advice. Tax figures are for 2026 as of October 2026 and must be checked against official IRS, SSA, and CMS sources before use and every year after.
