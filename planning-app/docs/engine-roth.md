# Roth conversion engine

`lib/calculations/roth.ts` exports `calculateRothConversions(input, assumptions)`.

## Method

The engine deliberately **does not create a second retirement projection**. It runs the shared `calculateCashFlow` baseline, constructs a bounded annual Roth-conversion schedule, and reruns that same cash-flow engine with `CashFlowOptions.rothConversions`. Thus the returned tax cost, taxable Social Security effects, RMDs, withdrawals, and ending balances are all those from the shared projection.

1. Only `K401_PRETAX` and `TRAD_IRA` balances are conversion candidates. A nonqualified annuity, HSA, Roth asset, brokerage asset, cash, and cash-value life balance are never treated as convertible pretax money.
2. The normal schedule starts in the first planned household retirement year and ends before a baseline Social Security payment or RMD. It is capped at 80 annual rows and the remaining eligible pretax balance. RMD years are not conversion years.
3. For every candidate year, the engine uses `projectAnnualRules` on the supplied annual-rule record. It identifies the configured target bracket (normally 22% or 24%) from that record—not from an embedded dollar threshold—and calculates taxable income from cash-flow MAGI after the annual standard deduction, age-65 additional deduction, and applicable senior deduction/phaseout.
4. At age 63 or older, the conversion is capped just below the supplied IRMAA tier boundary. Medicare-year IRMAA is assessed from MAGI two years earlier, using supplied historical MAGI when the source year predates the projection.
5. The engine makes at most eight deterministic recalculation passes. Each pass reruns cash flow, rechecks taxable income and IRMAA room, and adjusts at cent precision. A non-convergent schedule is flagged and is not silent.

## Comparison and recommendation guardrail

The output compares the no-conversion and conversion projections, including lifetime federal tax, total/largest RMD, known IRMAA surcharge years, ending legacy, and after-tax legacy. After-tax legacy subtracts the supplied `heirsTaxRate` from terminal tax-deferred assets; it is an editable **planning assumption**, not a statement of an heir's actual tax rate or a guarantee.

`beneficial` is true only when a nonzero permitted schedule has a positive projected lifetime federal-tax reduction **or** a positive after-tax-legacy change, and all modeled IRMAA lookback values needed for the comparison are known. Empty windows, unknown IRMAA data, or a non-positive comparison return `beneficial: false` and a warning rather than a savings claim.

## Important input limitations

- `PlanningInput` does not capture nondeductible traditional-IRA basis. When eligible account basis is unavailable, the engine explicitly assumes the balance is fully taxable and issues a warning. The client should confirm basis/pro-rata treatment with a tax professional.
- Historical MAGI is necessary for near-term Medicare years whose two-year source year is before the projection. Missing values leave IRMAA unknown and block a conversion recommendation.
- Future annual figures come only from the supplied annual-rule projection (`projectAnnualRules`). They are projected planning values, not an assertion that future tax or Medicare law has been verified.
- This calculation is educational and illustrative; it does not execute a conversion or provide tax advice.

## Output shape

`RothConversionResult` returns:

- `schedule`: year, conversion amount, incremental federal-tax cost, target bracket, taxable income, MAGI, RMD, and IRMAA check;
- `noConversion` and `withConversion`: comparable federal-tax, RMD, legacy, after-tax-legacy, and known-IRMAA summaries;
- signed `lifetimeTaxDifference` and `afterTaxLegacyDifference` (positive is favorable to conversion);
- `beneficial`, `irmaaYears`, standard `ModuleMeta` warnings, and source URLs carried from the supplied assumption records.
