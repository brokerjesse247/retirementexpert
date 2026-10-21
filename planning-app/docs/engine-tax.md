# Tax engine

`lib/calculations/tax.ts` is a pure **federal planning-estimate** module. It does not fetch data, read a clock, persist data, mutate inputs, or make any state-income-tax claim. Every dollar output is rounded half-up to cents through `roundMoney` at a public/output boundary; the fractional effective rate is rounded half-up to six decimal places rather than to cents.

## Public API

- `calculateTax(input, rules)` returns taxable income, federal tax, marginal and effective rates, taxable Social Security, provisional income, the standard deduction (including eligible age-65 additions), the separate enhanced senior deduction, modeled MAGI, and warnings.
- `taxableSocialSecurity(ss, otherIncome, taxExemptInterest, filingStatus, rules, separateLivedTogether?)` returns only the taxable Social Security amount. `otherIncome` must exclude Social Security and include modeled taxable gains or qualified dividends, where applicable.
- `calculateTaxes(input, assumptions)` produces a `PARTIAL` current-household summary plus copied annual-rule source metadata. Projection modules should construct the year-specific `TaxInput` and call `calculateTax` directly.

## Annual-rule boundary and methodology

The module reads all annual amounts from `AnnualRules`: progressive brackets, standard deduction, per-person age-65 addition, capital-gain thresholds, Social Security thresholds, and the senior-deduction amount, phaseout start/rate, eligible filing statuses, and end year. It embeds **no year-specific federal dollar figure**. A mismatch between `TaxInput.taxYear` and `rules.year` is warned and the supplied rule year governs.

Ordinary income is explicitly separate from `longTermCapitalGains`. Taxable Social Security is first calculated from provisional income: other modeled income plus tax-exempt interest plus one-half of benefits. The taxable portion is then added once to ordinary income. Long-term gains are added once to total taxable income, after deductions reduce ordinary income first, and are stacked above ordinary taxable income against the supplied 0%/15% thresholds; any remaining eligible gains use the statutory 20% rate. This prevents a gain from being counted as both ordinary income and a preferential-rate gain. IRS Publication 550 directs taxpayers with qualified dividends to the Qualified Dividends and Capital Gain Tax Worksheet or Schedule D Tax Worksheet. [1]

For MFS, a taxpayer who lived with their spouse at any time uses the statutory zero-base Social Security treatment. An MFS taxpayer who lived apart for the entire year uses the MFS threshold values supplied in `AnnualRules`. The IRS identifies a zero base amount for the first case and the $25,000 base amount for the second. [2]

The module adds the supplied per-person age-65 additional standard deduction, limited to two people for MFJ and one on other returns. It then applies the enhanced senior deduction only while `rules.year <= rules.seniorDeduction.endYear`, and only for statuses listed in the rule. Each eligible senior receives their own deduction amount reduced independently by the supplied phaseout rate applied to MAGI over the supplied filing-status threshold. The annual seed must set the current 2026 rate to 6%; the formula intentionally reads that rate rather than embedding it. IRS confirms that the deduction is $6,000 per qualifying person, is additional to the ordinary age-65 deduction, applies for 2025–2028, and uses $75,000/$150,000 MAGI phaseout starts. [3] [4]

`magi` is a planning proxy because `TaxInput` does not contain all Form 1040 adjustments or foreign-income exclusions. It is modeled as ordinary income plus taxable Social Security plus long-term capital gains; tax-exempt interest is included in provisional income but not this modeled MAGI.

## Current-household wrapper

`calculateTaxes` uses earned income, Social Security marked as already received, and pensions/annuities only when their known start age is reached at the input's stored age. It includes rental/other monthly income unless an end age has passed. A pension or annuity with no start age, and all planned part-time income, are excluded rather than presumed current. The result remains `PARTIAL` because the intake has no complete current investment-income, deduction, credit, adjustment, or state-tax data.

## Important limitations

This is not a prepared tax return. Warnings disclose that it excludes itemized deductions, credits, AMT, NIIT, payroll tax, capital-loss rules, special capital-gain categories, qualified-business-income deductions, foreign-income adjustments, and state taxation. Federal effective rate is federal income tax divided by modeled gross taxable-income components, not a full-tax-return measure.

Tax source URLs are passed through from `AnnualRules.sources` as `sourceMetadata` and `ModuleMeta.sources`; annual data ownership stays with the assumptions module. The module does not state an exact state tax result.

## Tests

`tests/engine/tax.test.ts` covers the required Section 14.1 MFJ $150,000 test ($117,800 taxable income, $15,340 federal tax, 22% marginal rate) and the required $40,000 Social Security/$30,000 other-income test ($50,000 provisional income and $11,100 taxable Social Security). It also verifies qualified long-term-capital-gain stacking, MFS lived-together handling, independently phased MFJ senior deductions, and the 2028 senior-deduction expiry.

## References

[1]: https://www.irs.gov/publications/p550 "IRS Publication 550 investment income and expenses"
[2]: https://www.irs.gov/faqs/social-security-income "IRS Social Security income FAQ"
[3]: https://www.irs.gov/newsroom/working-families-tax-cuts-individuals-and-workers "IRS Working Families Tax Cuts individuals and workers"
[4]: https://www.irs.gov/newsroom/schedule-1-a-additional-deductions-what-to-know-about-the-new-form "IRS Schedule 1-A additional deductions"
