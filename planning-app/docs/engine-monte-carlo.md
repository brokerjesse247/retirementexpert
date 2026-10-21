# Monte Carlo engine

`lib/calculations/monte-carlo.ts` is a **pure**, deterministic retirement-portfolio simulator. It has no database, network, clock, or mutable global state.

## Public contract

```ts
calculateMonteCarlo(input: MonteCarloInput, assumptions?: PlanningAssumptions): MonteCarloResult
```

Required `MonteCarloInput` fields are:

- `portfolio`: portfolio value at the beginning of the first retirement-projection year.
- `annualWithdrawals`: annual, **inflation-adjusted cash-flow withdrawals** in chronological order. The cash-flow module owns the spending/income/tax calculation; this module neither creates a withdrawal formula nor invents a return series.
- `meanReturn` and `volatility`: nominal decimal fractions supplied by the caller (for example, `0.065` and `0.11`).

Optional `startAge` provides ages in the fan chart and depletion output. When omitted, fan-chart ages and `worstDecileDepletionAge` are `null`, rather than fabricated.

## Defaults and repeatability

When `input.runs` and `input.seed` are absent, the engine uses **5,000 runs** and **seed 42**. If an approved `PlanningAssumptions` object is supplied, its `monteCarloRuns` and `monteCarloSeed` are used before those contract defaults. Explicit `input` values take precedence.

The engine uses an isolated Mulberry32 seeded PRNG and a cached Box–Muller standard-normal sampler. A fresh generator is constructed per call. Equal inputs, assumptions, and seed therefore produce equal output exactly.

## Annual model and ruin rule

For every run and projection year:

```text
sampledReturn = meanReturn + volatility × standardNormal
portfolio = (portfolio − cashFlowWithdrawal) × (1 + sampledReturn)
```

Dollar balances and requested withdrawals are rounded to cents at their payment/output boundaries using the project `roundMoney` helper. A withdrawal is deducted **before** that year's return.

A path is ruined only when the scheduled withdrawal is greater than the available portfolio, producing an actual unpaid shortfall. A balance of exactly zero after the final requested withdrawal is a success; it is not a false failure. Ruined paths continue as zero balances in the fan-chart and ending-percentile samples, so terminal percentile values include ruins.

The arithmetic-normal draw can theoretically be below -100%. Such a draw is clamped to `-1` before it is applied. The result warns with the number of affected draws; the returned `methodology` records this floor. This protects against a negative portfolio while retaining the caller's arithmetic-normal mean and volatility specification for the underlying draws.

## Outputs

- `successPercent`: percentage of paths with every scheduled withdrawal funded.
- `p10Ending`, `medianEnding`, `p90Ending`: linear-interpolated percentiles of **all** terminal balances, including zero-valued ruins.
- `fanChart`: yearly p10/median/p90 ending balances. `year` is a 1-based projection-year ordinal.
- `worstDecileDepletionAge`: lower-median age of the first unpaid withdrawal among paths in the bottom terminal-value decile. It is `null` if those paths have no unpaid withdrawal, or if `startAge` was omitted.
- `sequenceStress`: one deterministic path with **-25% in year one** and `meanReturn` in each later year, using the same withdrawal-first ordering and actual-shortfall ruin rule.
- `seed`, `runs`, and `methodology`: values needed for auditability and report disclosure.

## Validation limits

The function rejects invalid inputs rather than returning an invented probability: non-finite rates or money, negative withdrawals, an empty annual schedule, projections over 120 years, invalid seed/runs, and out-of-range portfolio/age values. The operational maximum is 100,000 runs; dollar inputs are limited to $1 trillion and simulated balances to the shared calculation range.

This is an illustrative planning simulation, not a guarantee of investment results. It models only the supplied withdrawal schedule and return distribution; inflation, taxes, income, survivor changes, and spending assumptions belong in the upstream cash-flow schedule.

## Test evidence

`tests/engine/monte-carlo.test.ts` verifies seed repeatability, the required 30-year high/low sanity cases, withdrawal-then-return ordering, the exact-final-withdrawal rule, sequence stress, and input bounds.
