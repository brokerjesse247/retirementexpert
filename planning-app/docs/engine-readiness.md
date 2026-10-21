# Retirement Readiness Engine

`lib/calculations/readiness.ts` implements the **Section 8.14 Retirement Readiness Score** as a pure, deterministic aggregation of already-calculated module outputs. It has no database, network, date, random-number, or annual-rule dependency.

## Public function

```ts
calculateReadiness({
  monteCarloSuccess,
  incomeCoverageRatio,
  taxDiversificationScore,
  emergencyFundMonths,
  insuranceProtectionScore,
  estateDocsScore,
})
```

It returns `ModuleMeta` plus the headline `score`, `label`, normalized `components`, `componentWeights`, and a `scoreDerivation` with each weighted contribution and its total.

## Formula and normalizations

All component values are normalized to the inclusive **0–100** range before their designated percentage-point weights are applied.

| Component | Weight | Supplied value | Normalization |
|---|---:|---|---|
| Monte Carlo | 40 | `monteCarloSuccess` | Clamped score (0–100) |
| Essential-income coverage | 20 | `incomeCoverageRatio` | `clamp(ratio, 0, 1) × 100` |
| Tax diversification | 15 | `taxDiversificationScore` | Clamped score (0–100) |
| Emergency fund | 10 | `emergencyFundMonths` | `clamp(months / 6, 0, 1) × 100` |
| Insurance protection | 10 | `insuranceProtectionScore` | Clamped score (0–100) |
| Estate documents | 5 | `estateDocsScore` | Clamped score (0–100) |

> The **six-month emergency reserve** is an explicit readiness-score heuristic, not an annual legal, tax, or market assumption. Balances above six months receive the component maximum but do not increase the score further.

The result is the sum of `component × weight / 100`. Every normalized component and weighted contribution uses the shared deterministic half-up cent rounding helper; the headline is the cent-rounded sum of the exposed contributions.

## Labels

| Final score | Label |
|---:|---|
| 85–100 | Excellent |
| 70–84.99 | Good |
| 55–69.99 | Needs Attention |
| Below 55 | At Risk |

## Missing-data safeguard

A readiness headline is only valid when **every component is available and finite**. In particular, an unavailable essential-spending income-coverage ratio, insurance-protection score, or estate-documents score returns:

- `score: null`
- `label: "Incomplete"`
- `status: "PARTIAL"`
- a component-specific warning

The same guard applies to missing emergency, tax-diversification, or Monte Carlo inputs. The function never substitutes a zero, default score, or inferred value for a missing component. Components that are present but outside their applicable range are bounded to 0–100 and remain transparent in the returned `components` and derivation.

## Integration boundary

This module deliberately does not calculate the upstream components. Callers must pass the annual-source-backed outputs from the Monte Carlo, cash-flow, net-worth, estate, and insurance modules. The readiness weights are product requirements from `TODO.md §8.14`, not annual figures and therefore do not belong in `AnnualRules`.

## Focused verification

`tests/engine/readiness.test.ts` verifies exact weights and derivation, six-month emergency normalization, bounds, all nullable components, and all four score-label ranges.
