# Withdrawals engine

`lib/calculations/withdrawals.ts` is a **pure**, deterministic planning module. It takes a supplied `MonteCarloInput` annual withdrawal schedule and `PlanningAssumptions`; it neither reads a database nor derives taxes, income, RMDs, healthcare costs, or spending needs.

## Public interface

```ts
fourPercentRule(portfolio: number): number
calculateWithdrawalStrategies(
  input: MonteCarloInput,
  assumptions: PlanningAssumptions,
): WithdrawalStrategiesResult
```

Dollar results are rounded with shared `roundMoney` (half-up to cents) at output/payment boundaries. The caller-owned `annualWithdrawals` input is never changed.

## Strategy methods and assumptions

| Strategy | Method | Assumptions exposed in result | Limits and disclosures |
|---|---|---|---|
| 4% guideline | First-year withdrawal is exactly `4% × portfolio`; later display values grow by `assumptions.inflation`. | Initial 4% rate and planning inflation. | A guideline only; it is not a longevity guarantee or tax-aware account sequence. |
| Sustainable rate | A bounded binary search finds the largest cent-level first-year draw that reaches `assumptions.monteCarloTarget`. Every candidate rescales the supplied annual withdrawal schedule, preserving its annual shape. Each trial calls the shared Monte Carlo engine with the **same seed** and **5,000 runs**. | Target, seed, fixed run count, cent tolerance, iteration count, achieved success percentage, and scaled schedule. | Hypothetical; depends on supplied return, volatility, schedule, and seed. It is not tax/RMD/IRMAA optimization or a guarantee. |
| Guardrails | Starts at 4%. Before each later-year test, planned spending grows by inflation. Spending is cut 10% above 4.8% (20% above the 4% start rate) and raised 10% below 3.2%. | Expected return and the exact bands/adjustment. | The row schedule uses expected return solely as a deterministic education illustration, not as a market forecast or Monte Carlo path. It separately identifies an unfunded requested withdrawal rather than creating negative assets. |
| Buckets | Cash target is annual withdrawals for years 1–2; bond target is annual withdrawals for years 3–10; only actual assets left after these allocations go to growth. | Supplied base schedule and target/modeled years. | If fewer than 10 withdrawal years are supplied, unmodeled bucket years remain explicitly unknown. If assets are inadequate, cash/bond amounts are clipped to the actual portfolio and `insufficientFunds`/shortfall are set—no assets are fabricated. |

## Required inputs and validation

- `portfolio` and each annual withdrawal must be finite, non-negative dollar amounts.
- `annualWithdrawals` must be non-empty and have a positive first-year withdrawal. This is required to define and rescale an **initial** withdrawal rate without inventing a base schedule.
- `meanReturn` and `inflation` must exceed -100%.
- `monteCarloTarget` is a percentage from 0 through 100. The 85% default belongs in editable planning assumptions.
- A zero portfolio returns a partial result with a `null` sustainable rate and an explicit warning; it does not divide by zero or imply available funding.

## Output interpretation

`method` deliberately carries the annual base schedule, each strategy’s schedule/parameters, and human-readable assumptions and limitations so a report can display the actual modeled basis. The module’s `PARTIAL` status signals a zero portfolio, an incomplete years-1-to-10 bucket schedule, or a partial/unsupported result returned by the shared Monte Carlo engine.

The module has no tax-aware optimization claim. Tax-aware withdrawal order, actual annual cash obligations, taxes, RMDs, and income inputs belong to the cash-flow engine; its resulting annual withdrawal schedule must be supplied here.
