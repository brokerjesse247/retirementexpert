# Allocation engine

`lib/calculations/allocation.ts` implements the **educational-only** Section 8.12 allocation comparison:

```ts
calculateAllocation(input, assumptions, incomeCoverageRatio?)
```

It is a pure deterministic function. It performs no database, network, pricing, account, market-data, or trading operation and does not mutate `input` or `assumptions`.

## Inputs and editable profile settings

`PlanningAssumptions.targetEquity` supplies the editable starting equity target as a **fraction** (for example, `0.55` is 55%). The engine validates all three settings against the approved ranges before calculating:

| Risk profile | Allowed editable equity setting | Retirement floor |
|---|---:|---:|
| Conservative | 30%–40% | 30% |
| Moderate | 50%–60% | 50% |
| Aggressive | 70%–80% | 70% |

The remaining target is displayed as bonds plus a disclosed **5% educational cash sleeve**. Thus each returned stock/bond/cash target totals 100%. The cash sleeve is a transparent planning convention, not an annual legal, tax, or market-data figure and not a security recommendation.

The current household mix comes exclusively from `input.allocation`. When it is `null`, `current` and `rebalancing` are both `null`; the engine does not infer percentages, dollar balances, transactions, or a substitute mix.

## Exposed adjustment policy

The output includes `target.adjustments`, including each rule category, requested adjustment, and the amount that remains after profile bounds. The earliest household retirement date controls the household horizon.

### Horizon adjustment before the ten-year glide path

| Earliest household retirement horizon | Requested equity adjustment |
|---|---:|
| 15 years or more | +5.0 points |
| 10–14 years | +2.5 points |
| 5–9 years | 0.0 points |
| Under 5 years or already retired | −2.5 points |

### Income-coverage adjustment

Income coverage is the supplied guaranteed-income-to-essential-spending ratio. A missing (`null`) coverage result receives **no inferred adjustment** and is warned as unavailable.

| Income coverage ratio | Requested equity adjustment |
|---|---:|
| At least 1.25 | +2.5 points |
| 1.00–1.2499 | 0.0 points |
| 0.75–0.9999 | −2.5 points |
| Under 0.75 | −5.0 points |

Horizon and coverage adjustments are applied sequentially, then clamped to the risk-profile range. `target.adjustmentWasRangeClamped` shows whether a profile guardrail limited either requested adjustment.

## Glide path

The engine takes the post-adjustment equity target at **10 years before retirement** and linearly reduces it to the profile floor at retirement. `glidePath.rows` always shows the required five-year points: 10 years, 5 years, and retirement (0 years). `target.currentEquity` applies the same interpolation at the household’s actual earliest retirement horizon.

For example, a Moderate 55% pre-glide equity target is 55% at 10 years, 52.5% at 5 years, and 50% at retirement. Each row supplies stocks, bonds, and cash and totals exactly 100%.

## Current comparison and dollar illustration

For a known household mix, the function uses the supplied mix against the aggregate eligible household balance to show `currentDollars`, `targetDollars`, and signed `change` amounts. All dollar outputs are rounded with the shared half-up cent function. The cash change is the residual after stock and bond changes, ensuring signed changes sum to **exactly $0.00**.

The eligible illustration excludes `ANNUITY` and `CASH_VALUE_LIFE` account balances because policy liquidity and underlying allocation are not known. `excludedInsurancePolicyValue` makes that exclusion visible. This does not classify policy values as tradable holdings.

> A positive or negative `change` is arithmetic comparison only. It is not a recommendation, model trade list, instruction to buy or sell, tax advice, or account-specific implementation direction.

## Asset-location education

`assetLocation` is explicitly marked `educational: true` and provides only general concepts:

- bonds are commonly considered in tax-deferred accounts;
- longer-term growth assets are commonly considered in Roth accounts; and
- tax-efficient diversified index funds are commonly considered in taxable accounts.

Each concept is subject to tax treatment, account purpose, available choices, cost basis, plan restrictions, trading costs, and professional review. The module does not name actual securities or recommend an account-level allocation.

## Result status and limitations

The result is `COMPLETE` only when the household supplied a current allocation, a non-null income coverage ratio, and a positive eligible balance for a dollar illustration. It is `PARTIAL` when any of those inputs is unavailable, while still returning the bounded profile target and glide-path education.

The module’s source string is the approved internal planning requirement: `TODO.md §8.12`. It contains no annual official figure or hard-coded annual law, tax, or benefit amount.
