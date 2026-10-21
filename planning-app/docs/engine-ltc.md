# Long-term care calculation module

`lib/calculations/ltc.ts` implements the **Section 8.11 LTC cost illustration and stress wrapper**. It is a pure function: it does not read a database, use the current clock, generate random values, mutate the input, or make network calls.

```ts
calculateLongTermCare(input, assumptions, engines?)
```

The first two arguments are the Phase 2 public contract. The optional `engines` adapter is the explicit integration boundary for the sibling cash-flow and Monte Carlo modules. Without that adapter, the module returns the correctly computed LTC cost/coverage fields and sets legacy/probability comparison fields to `null` with `meta.status: 'PARTIAL'`. It never substitutes a local cash-flow or simulation approximation.

## Inputs and source policy

All annual/source values are supplied by `PlanningAssumptions`; this module does not hardcode a care-cost quote or an inflation rate.

| Input | Used for |
|---|---|
| `ltcMonthly` | Base monthly care cost in the assumptions base year |
| `ltcYears` | Hypothetical event duration; must be a positive whole number to construct calendar dates |
| `ltcEventAge` | Primary person's age at the event start |
| `healthcareInflation` | Compounds the supplied care cost by calendar year |
| `year` | Base year for the supplied monthly-care assumption |
| `ltcInsured`, `ltcDailyBenefit` | Existing policy-status/benefit information from the intake |

> The default figures (such as the planning $9,000 monthly cost and three-year duration) belong to the editable assumptions source managed elsewhere. This module makes no claim that those planning values are a carrier quote or an official LTC price.

## Cost and timing method

The single contract event is assigned to the `PRIMARY` person. Its start is their actual calendar birthday at `ltcEventAge`, not an approximation based on completed age today. A February 29 birthday uses February 28 in non-leap years. A spouse triggers a warning because the current contract has no event-person selection or second-event output.

`costAt85` is a three-year illustrative total expressed in the primary person's age-85 calendar-year dollars:

```text
ltcMonthly × 12 × ltcYears × (1 + healthcareInflation)^(yearTurning85 − assumptions.year)
```

The stress event starts at `ltcEventAge` and lasts for the supplied whole number of calendar anniversary years. The module prorates each calendar-year expense by actual eligible days, including leap years. This permits an event that begins late in a year to flow to the correct cash-flow year instead of charging a full year immediately.

## Coverage and gap semantics

| Intake state | `existingCoverage` / `coverageGap` | Stress rerun |
|---|---|---|
| `ltcInsured: false` | `$0` coverage and the full projected event cost as the gap | Runs with the full event expense |
| `ltcInsured: null` | Both fields are `null`, **not `$0`** | Does not run; treating unknown coverage as zero would invent a result |
| `ltcInsured: true`, no daily benefit | Both fields are `null` | Does not run |
| `ltcInsured: true`, supplied daily benefit | Sums `min(daily benefit × eligible days, care expense)` by calendar year; gap is gross cost less that supported amount | Runs with only the calculated net gap |

The daily benefit is treated as a **level nominal amount**. No benefit indexation is inferred. The module always warns that policy benefit duration, elimination period, reimbursement method, and riders were not supplied. Thus, the daily-benefit result is an event-period illustration of the only supported policy quantity; it is not a verification of actual policy eligibility or entitlement.

## Cash-flow and Monte Carlo integration

The analysis orchestrator supplies:

```ts
interface LongTermCareEngineDependencies {
  calculateCashFlow(input, assumptions, options?): {
    endingLegacy: number;
    portfolioAtRetirement: number;
    rows: Array<{ age: number; portfolioWithdrawal: number }>;
  };
  calculateMonteCarlo(input: MonteCarloInput, assumptions?): {
    successPercent: number;
  };
}
```

When present, the LTC module:

1. Runs the unmodified baseline cash flow.
2. Reruns cash flow with `CashFlowOptions.extraExpenses`, using the calendar-year **net** LTC gap after only the supported coverage offset.
3. Builds each Monte Carlo input from that engine's actual `portfolioAtRetirement` and `portfolioWithdrawal` rows, then calls the supplied Monte Carlo engine with the plan’s return, volatility, run count, and seed.
4. Reports actual baseline/stress legacy and success values plus `legacyChange` and `successPercentChange`.

The module rejects malformed engine results rather than fabricating a comparison. It also intentionally does not rerun a prospective stress scenario when the event begins on/before the plan as-of date or after the primary person's planning age.

## Current integration limitation

At implementation time `monte-carlo.ts` was available, but the required sibling `cash-flow.ts` was not yet available in the shared calculation directory. This module therefore uses the explicit adapter above rather than importing an absent cash-flow module or creating a duplicate engine. The parent/orchestrator must pass the public cash-flow and Monte Carlo exports as `engines` to populate the comparison fields.
