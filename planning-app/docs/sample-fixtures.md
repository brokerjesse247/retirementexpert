# Section 14 sample-fixture coverage

## Scope and safety boundary

`tests/fixtures/section-14-sample-households.ts` contains **two `SYNTHETIC` test-only submissions** derived from the original specification at `TODO.md` §14.2. They are deliberately not Prisma seed data, are not written to Preview, and contain `.example.invalid` contact addresses. `tests/engine/specification-samples.test.ts` only maps in-memory arrays through `mapPlanningInput`; it makes no database, browser, or network call.

The source names and ages are authoritative:

| Source client | Supplied source facts retained in raw intake | Deterministic mapped checks |
|---|---|---|
| **James & Linda Mitchell** | MFJ; ages 58 / 56; earned income $120,000 / $45,000; 401(k) $620,000; traditional IRA $90,000; Roth IRA $40,000; brokerage $85,000; cash $30,000; home $450,000; mortgage $110,000; current/retirement spending $7,500 / $6,500 monthly; PIA $2,900 / $1,300; retirement ages 63 / 62; moderate risk; no LTC coverage; will yes; trust no. | `totalInvestable` **$865,000**; tax-deferred **$710,000**; tax-free **$40,000**; taxable **$115,000**; home equity **$340,000**; net worth **$1,205,000**; PIA, retirement ages, and risk score/profile **15 / MODERATE**. |
| **Sarah Thompson** | Single; age 45; earned income $85,000; 401(k) $140,000; Roth IRA $25,000; cash $8,000; current spending $4,800 monthly; PIA $2,100; retirement age 67; 3% employee contribution; 5% match; no estate documents; aggressive risk. | `totalInvestable` **$173,000**; tax-deferred **$140,000**; tax-free **$25,000**; taxable **$8,000**; PIA, retirement age, contribution rates **3% / 5%**, and risk score/profile **20 / AGGRESSIVE**. |

The fixture uses `2026-01-15` as its test-only mapping date. Synthetic dates of birth establish the supplied ages on that date; the source gives ages, not dates of birth. Likewise, the form requires contact details, residence, ranked concerns, and five risk responses that §14.2 does not supply. Those values are marked as synthetic supplements in each fixture rather than represented as client facts.

### Deliberate unknowns and the sole illustration

The raw values preserve the following omissions as blanks/`NOT_SURE`, which map to `null` (or mapper warnings) rather than invented facts:

| Missing source fact | Raw representation | Mapped behavior checked |
|---|---|---|
| Social Security claim age | Empty `claimAge` for each source person | `claimAgeMonths: null` and the mapper's “claiming age is not selected” warning |
| Health coverage | Empty current/pre-Medicare coverage | `currentHealthCoverage: null` |
| Investment allocation | `allocation.status: 'NOT_SURE'` | `allocation: null` |
| Essential retirement spending | Empty `essentialMonthly` | `essentialMonthlySpending: null` and the mapper's incomplete-readiness warning |
| Annuity tax basis/qualification | Empty `annuityTaxQualification`; no annuity balance supplied | `annuityQualification: null`; no annuity is fabricated |

The Mitchell specification gives household assets but no owner-by-owner allocation. The synthetic fixture convention assigns each listed account to James only so `PlanningInput.accounts` has a required owner; it is documented in fixture metadata and is not a claim about the household.

Sarah's source provides one monthly spending number but no retirement-spending value, while the final intake schema requires both. The fixture explicitly uses **$4,800/month** for `retirementMonthly` as an illustration only. It does **not** infer essential spending, allocation, claim age, health coverage, LTC coverage, home ownership, or an annuity basis.

## Original Section 14.1 numerical acceptance map

This matrix links each original §14.1 clause to its existing pure calculation-module assertion. The sample-fixture test is additive; it does not duplicate or replace these unit cases.

| Original §14.1 clause | Existing assertion file and location | Module exercised | Expected result asserted |
|---|---|---|---|
| FRA birth years 1954 / 1957 / 1960 | `tests/engine/social-security.test.ts:107-112` | `social-security` | 66y0m / 66y6m / 67y0m |
| $2,000 PIA, FRA 67, claim 62 / 67 / 70 | `tests/engine/social-security.test.ts:114-120` | `social-security` | $1,400 / $2,000 / $2,480 |
| $2,000 PIA, FRA 67, claim 64 | `tests/engine/social-security.test.ts:114-120` | `social-security` | $1,600 |
| $2,000 PIA, FRA 66y6m, claim 62 | `tests/engine/social-security.test.ts:114-120` | `social-security` | $1,450 |
| Spousal worker PIA $2,000, own PIA $600, at FRA | `tests/engine/social-security.test.ts:122-126` | `social-security` | $1,000 |
| Spousal only, own PIA $0, claim 62, FRA 67 | `tests/engine/social-security.test.ts:122-126` | `social-security` | $650 |
| Break-even 62 vs 67 / 67 vs 70, no COLA | `tests/engine/social-security.test.ts:128-131` | `social-security` | 78.67 / 82.5 years (`toBeCloseTo`) |
| Federal tax, MFJ 2026, $150,000 gross, standard deduction only | `tests/engine/tax.test.ts:60-68` | `tax` | Taxable **$117,800**; federal tax **$15,340**; marginal 22% |
| Taxable SS, MFJ $40,000 SS and $30,000 other income | `tests/engine/tax.test.ts:70-81` | `tax` | Provisional income $50,000; taxable SS $11,100 |
| RMD, $500,000 at age 75 / 73 | `tests/engine/rmd.test.ts:47-58` | `rmd` | $20,325.20 / $18,867.92 |
| RMD start, born 1955 / 1962 | `tests/engine/rmd.test.ts:47-58` | `rmd` | 73 / 75 |
| 4% rule, $1,000,000 | `tests/engine/withdrawals.test.ts:39-43` | `withdrawals` | $40,000 in year 1 |
| IRMAA 2026, single MAGI $120,000 | `tests/engine/healthcare.test.ts:148-151` | `healthcare` | Part B $284.10/month; Part D $14.50/month |
| Monte Carlo seed 42 repeatability | `tests/engine/monte-carlo.test.ts:7-25` | `monte-carlo` | identical result |
| Monte Carlo: $2M / $40k / 30 years / 6.5% / 11% | `tests/engine/monte-carlo.test.ts:7-25` | `monte-carlo` | success > 90% |
| Monte Carlo: $300k / $60k / 30 years | `tests/engine/monte-carlo.test.ts:27-41` | `monte-carlo` | success < 10% |

> The tax golden is **$15,340**, not an inferred alternative figure: the linked test invokes `calculateTax` against the explicit 2026 MFJ brackets and asserts the module result for $117,800 taxable income.

## What is and is not accepted

- The focused fixture test has **3 test cases**: fixture inventory plus one deterministic mapping/balance-sheet case for each source household. It checks source income/assets/PIA/retirement/risk facts, input unknowns, and tax buckets. It intentionally does **not** assert a readiness headline or tax-diversification score from incomplete source information.
- The table above maps all **16 numerical rows** in original §14.1 to existing module assertions. This documentation is a link inventory, not a claim that a full-suite run was performed by this change.
- §14.2's listed recommendation triggers (Mitchell: R03/R04, R06, R14, R16, R22; Thompson: R07, R10, R12, R18, R21) have **no acceptance assertions in this fixture test**. This work also intentionally does **not** “load as seed data,” because persistence/Preview writes are out of scope. Those two original §14.2 acceptance expectations remain unverified here.

Run only the focused, non-persistent coverage with:

```bash
pnpm vitest run tests/engine/specification-samples.test.ts
```
