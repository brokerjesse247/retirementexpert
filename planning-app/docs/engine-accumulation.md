# Accumulation engine

`calculateAccumulation(input, assumptions)` in `lib/calculations/accumulation.ts` is a pure, deterministic annual accumulation projection. It returns annual rows, a household retirement-year portfolio value, and account-by-owner ending balances for use by the retirement cash-flow engine.

## Timing and rounding

- The input balance is treated as the opening balance for the **as-of calendar year**. Each active investment account is grown by the selected risk-profile return and then receives that year's contributions:

  ```text
  ending balance = opening balance × (1 + expected return) + contributions
  ```

- Salary begins at `earnedIncomeAnnual` in the as-of year and compounds at `assumptions.inflation` in each following year. Salary, account-growth results, each contribution, bucket totals, and reported totals are rounded **half-up to cents** using `roundMoney` at their annual calculation boundaries.
- The projection is annual, not monthly. A person whose target retirement date is after January 1 receives the full annual contribution in that calendar year; the person receives no ongoing employee, employer-match, or IRA contribution thereafter. The model does **not** invent a fractional-year convention from inputs that do not specify a retirement month or payroll timing.
- `portfolioAtRetirement` is the balance at the latest household retirement year. When everyone is already retired as of the input date, it is a current snapshot; the engine does not add an invented extra year of market growth.

## Annual limits and future rules

The engine uses `assumptions.annual.contributions` for every contribution limit; it contains no year-specific contribution number or formula. For every year after the supplied base annual-rule year, it calls the parent-owned `projectAnnualRules(base, year, inflation)` helper. Those future rules are planning projections under the configured policy, **not verified future law**.

| Contribution | Calculation |
|---|---|
| Employee workplace deferral | `salary × employeeContributionRate`, capped at workplace limit plus the age-specific catch-up. |
| Workplace catch-up | Age 50+ uses `workplaceCatchup50`; ages 60–63 use `workplaceCatchup60to63` instead of the regular age-50 catch-up. Age is completed as of December 31 of the rule year. |
| Employer match | `salary × employerMatchRate`, deposited once (and only when there is an employee deferral). It is not counted a second time and is not incorrectly limited by the employee elective-deferral cap. The supplied annual rules do not contain a plan-wide employer-additions cap or a plan-specific matching formula. |
| IRA / Roth IRA | The supplied combined annual amount is capped at `ira` plus `iraCatchup50` from the annual rules. It is only added to a known `TRAD_IRA` or `ROTH_IRA` destination. |

The current intake has one workplace employee-contribution rate but no Roth-elective allocation. The engine therefore records ongoing workplace employee deposits and employer matches in the distinct `K401_PRETAX` bucket. If a Roth 401(k) balance also exists, the result warns that the continuing Roth/pre-tax split is not captured. Existing Roth 401(k) balances remain separate and grow normally.

The intake similarly has no annual HSA contribution amount or coverage tier. An HSA balance grows in the tax-free/HSA bucket, but the engine adds **no fabricated HSA contribution**. HSA qualified-medical-use eligibility is surfaced as a warning when it is not confirmed.

## Tax buckets and accounts

Ending accounts are aggregated by owner and account type because the input model has no account identifier. The returned buckets preserve the following distinctions:

| Bucket | Included accounts |
|---|---|
| `taxDeferred` | Pretax 401(k), traditional IRA, qualified annuity |
| `taxFree` / `roth` | Roth 401(k), Roth IRA |
| `taxFree` / `hsa` | HSA |
| `taxable` | Brokerage, cash, nonqualified annuity |
| `unclassified` | Annuity whose qualification is unknown |
| `nonPortfolio` | Cash-value life insurance |

Cash-value life insurance is kept visible in `endingAccounts` and `nonPortfolio`, but it is not grown at the portfolio return and is excluded from `portfolioAtRetirement`. An annuity with no supplied qualification is not silently assigned to tax-deferred or taxable assets.

## Explicit limitations and warnings

- A combined IRA/Roth contribution with a `null` destination is **not** assigned to either IRA type and is omitted from projected deposits. The result is marked `PARTIAL` and warns why.
- The engine does not determine IRA deductibility, Roth IRA MAGI eligibility, HSA eligibility or coverage tier, an employer plan's matching formula, plan-wide employer-addition caps, or a Roth employer-match election; those details are absent from the calculation input and must not be inferred.
- An `earnedIncomeAnnual` value supplied for a person already at or beyond the selected retirement date does not produce ongoing employee contributions. The warning makes that treatment visible.
- Input annual limits and source URLs come from `PlanningAssumptions`; the returned `sources` are the URLs attached to those annual rules. Annual source verification and defaults are owned by the assumptions module.
