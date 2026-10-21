# Net-worth calculation module

`calculateNetWorth(input, assumptions)` in `lib/calculations/net-worth.ts` is a **network-free, pure household balance-sheet calculation**. The supplied `PlanningAssumptions` argument is retained for the shared engine interface but this module deliberately consumes no annual figures or legal constants.

## Returned values

- `totalInvestable`: every account balance **except** `CASH_VALUE_LIFE`.
- `taxDeferred`: pre-tax workplace accounts, traditional IRAs, and **qualified** annuities only.
- `taxFree`: Roth workplace accounts, Roth IRAs, and HSAs confirmed as usable for qualified expenses.
- `taxable`: brokerage and cash/CD balances.
- `homeEquity`: `homeValue − mortgageBalance`; it may be negative.
- `netWorth`: `totalInvestable + cashValueLife + homeEquity − otherDebtBalances`.
- `emergencyFundMonths`: cash/CD balance divided by current monthly spending, rounded to two decimals; `null` when spending is zero.
- `accountBreakdown`: reconciles tax buckets, tax-treatment exclusions, and cash-value life insurance.

All dollar outputs use the shared deterministic `roundMoney` half-up cent rounding at returned monetary boundaries. Inputs are not mutated; non-finite or negative balance-sheet amounts throw rather than being silently interpreted.

## Account treatment safeguards

| Account condition | Investable total | Tax bucket | Treatment / disclosure |
|---|---:|---|---|
| Cash-value life insurance | Excluded | None | Added **once** to net worth as `accountBreakdown.cashValueLife`. |
| Qualified annuity | Included | Tax-deferred | Eligible pretax balance only; downstream RMD logic must use this balance, not all annuities. |
| Nonqualified annuity | Included | Excluded from three buckets | Reported separately; it is not placed in the pretax/RMD balance. |
| Annuity with unknown qualification | Included | Excluded from three buckets | `PARTIAL` meta status and an explicit warning. |
| HSA confirmed for qualified expenses | Included | Tax-free | Included in the tax-free bucket. |
| HSA qualified-use unknown or not confirmed | Included | Excluded from three buckets | Separate balance plus `PARTIAL` warning; never assumed tax-free. |

## Tax-diversification score

The readiness-compatible `taxDiversificationScore` is a 0–100 normalized concentration score over **only confirmed** taxable, tax-deferred, and tax-free balances:

```text
score = 100 × (1 − sum(bucketShare²)) / (1 − 1/3)
```

One populated confirmed bucket scores 0; equal values in all three score 100. Equal values in two buckets score 75. `taxDiversification` exposes the method, confirmed balance, excluded balance, bucket count, and shares, so any readiness presentation can disclose what the score did—and did not—measure. Nonqualified annuities and unresolved HSA/annuity treatment remain in `totalInvestable` but never inflate this score.
