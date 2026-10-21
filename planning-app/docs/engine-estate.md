# Estate & insurance engine

`lib/calculations/estate.ts` exports the pure function:

```ts
calculateEstateAndInsurance(
  input: PlanningInput,
  assumptions: PlanningAssumptions,
  survivorIncomeMonthly?: number,
): EstateAndInsuranceResult
```

It performs a **planning-only DIME/needs-method life-insurance gap** and an estate-document review checklist. It does not access persistence, the network, current time, carrier data, or external legal data.

## Inputs and editable assumptions

| Value | Source | Treatment |
|---|---|---|
| Survivor spending percentage | `assumptions.survivorSpendingPercent` | Multiplies `input.retirementMonthlySpending`. A customary 75% value belongs in editable assumptions; this module does not provide a hidden fallback. |
| Income replacement years | `assumptions.incomeReplacementYears` | Editable planning horizon; no default is embedded in the formula. |
| Final expenses | `assumptions.finalExpenses` | Editable planning value; a customary $15,000 value belongs in assumptions rather than code. |
| Survivor income | `survivorIncomeMonthly` caller argument | Must be supplied by the caller when known (for example, a separately calculated survivor-income result). It is not inferred from PIA, pension, annuity, or other intake fields. |
| Federal estate threshold | `assumptions.annual.estateExemption` | Supplied annual rule. It is used only for an illustrative threshold comparison. |
| State estate threshold | `assumptions.stateEstateThreshold` | `null` means unmodeled. The module never invents a state exemption or rate. |

All dollar outputs use `roundMoney` (half-up cents) at output/component boundaries.

## DIME calculation

The coverage gap is capped at zero:

```text
survivorBudgetMonthly = retirementMonthlySpending × survivorSpendingPercent
survivorIncomeGapMonthly = max(0, survivorBudgetMonthly − suppliedSurvivorIncomeMonthly)
incomeReplacement = survivorIncomeGapMonthly × 12 × incomeReplacementYears

grossNeed = mortgage + otherDebts + incomeReplacement + finalExpenses
insuranceNeed = max(0, grossNeed − liquidAssetsUsed − existingLifeCoverage)
```

- **Mortgage and debts are counted once.** When a positive dedicated `mortgageBalance` exists, debt rows identified as mortgage rows are excluded from `otherDebts`; the module emits a warning.
- **Liquid assets used** are only `CASH` and `BROKERAGE` account balances. Retirement accounts, HSA assets, annuity values, and cash-value life balances are not automatically treated as liquid offsets because access, tax, and use restrictions are not established.
- **Existing coverage** is the sum of supplied `lifeInsuranceDeathBenefit` values for household persons.
- Education costs are not included because the planning input has no education-cost field. `insuranceNeedDetails.educationNeedIncluded` is explicitly `0` rather than a guessed amount.
- If `survivorIncomeMonthly` is omitted, the module uses a bounded, conservative $0 survivor-income estimate and sets `ModuleMeta.status` to `PARTIAL`. It does not simulate Social Security, pension-survivor, or carrier benefits itself.

The result is **not** a carrier illustration, premium quote, product recommendation, underwriting result, or guarantee of coverage availability.

## Estate threshold flags

`estimatedEstate` is a limited, illustrative net-estate proxy:

```text
all supplied account balances + home value − mortgage − other debts
```

It excludes asset titling, ownership, beneficiary consequences, policy ownership, deductions, gifts, prior transfers, and other legal/tax facts. The function returns an `EstateTaxFlag` for federal and state comparisons:

| Status | Meaning |
|---|---|
| `REVIEW_WITH_ATTORNEY` | The proxy exceeds a supplied threshold. This asks for legal review; it does not calculate estate tax. |
| `BELOW_REPORTED_THRESHOLD` | The proxy is below a supplied threshold. It is not a legal conclusion. |
| `UNKNOWN` | No valid threshold is supplied; no comparison is made. |

For state planning, `stateEstateThreshold: null` yields `UNKNOWN`, emits an explicit warning, and makes the module `PARTIAL`—there is no state-law fallback.

## Checklist and review timing

The checklist reports the supplied status for will, living trust, financial power of attorney, healthcare directive, and beneficiary designations. TOD/POD designations and digital asset planning are returned as `NOT_ASSESSED`, because the intake does not capture them.

Beneficiary review uses only `input.asOfDate`; it never reads the system clock:

```text
reviewDue = asOfYear − updatedYear > 3
```

Exactly three years is not overdue. Missing, future, or invalid update/as-of years return `beneficiaryReviewDue: null`, flag the checklist for review, and make the result `PARTIAL`. A `NO` or `UNSURE` beneficiary status needs review (`true`).

The $500,000 living-trust signal is an exported **educational discussion heuristic** (`TRUST_EDUCATIONAL_HEURISTIC_ASSET_LEVEL`), not a legal requirement. The module never says a trust is needed or that it avoids all probate. It also explicitly warns that sole-spouse beneficiary status, ownership/titling, real estate in additional states, and privacy preferences are unavailable.

## Status and sources

`status` is `PARTIAL` whenever an actual survivor-income value is missing, an estate threshold is unknown, or beneficiary timing cannot be established. Other limitations are emitted as warnings without inventing facts. `sources` is the unique URL list passed through `assumptions.sources` and `assumptions.annual.sources`; this engine does not embed annual financial figures or fetch sources.

## Test coverage

`tests/engine/estate.test.ts` verifies:

1. DIME arithmetic, cent boundaries, liquid-asset/coverage offsets, and mortgage de-duplication.
2. Missing caller survivor income as an explicit conservative partial estimate.
3. The strict `> 3 years` beneficiary criterion using only the supplied as-of year.
4. No invented state estate threshold and transparent threshold statuses.
5. The trust heuristic's educational/non-legal wording and no-probate caveat.
