# Healthcare and Medicare engine

`lib/calculations/healthcare.ts` is a pure annual projection. It selects Medicare income-related premiums from the supplied `AnnualRules.medicare` record; it does not embed premium, threshold, or surcharge amounts in its formulas. The annual-rules owner supplies the verified rule record. The 2026 CMS fact sheet supports the base rule used by the current fixture: standard Part B is **$202.90 per month**, and an individual MAGI of more than $109,000 through $137,000 has a **$284.10** Part B total and **$14.50** Part D IRMAA surcharge. CMS states that the $500,000 individual and $750,000 joint boundaries are exclusive in the next-to-top tier. [1]

The helper `healthcareCostAtYear(input, assumptions, year, historicalMagi?)` looks up MAGI for exactly `year - 2`. A caller may supply a cash-flow MAGI map in the fourth argument. If that map is omitted, the function reads the immutable `input.historicalMagi` map. Missing MAGI does **not** cause the engine to substitute earned income or invent a projection: it prices the standard Part B tier and zero Part D IRMAA, marks the person `UNAVAILABLE`, and returns a warning naming the missing lookback year.

For married filing separately, the `separateLivedTogether` argument to `calculateMedicarePremium` means the spouses lived together during the taxable year. In that case the CMS special MFS table applies. If an MFS filer lived apart, the individual table applies. [1]

## Cost convention

At the annual rule year, Part B and Part D IRMAA are official rule values. Pre-Medicare premium, combined supplemental coverage, and medical out-of-pocket values are advisor-editable planning assumptions, not plan quotes. For every year other than the annual-rule year, the engine indexes each component at `healthcareInflation` and labels it a projection rather than an official future Medicare premium. Output money is rounded half-up to cents at monthly-payment and annual-output boundaries.

The supplemental assumption deliberately represents **Medigap or Medicare Advantage plus Part D coverage**. The engine adds only the government Part D **IRMAA surcharge** to it, never a second assumed Part D plan premium. Under-65 people receive the pre-Medicare assumption. If `currentHealthCoverage` is not supplied, the calculation flags that the coverage arrangement is unknown.

`calculateHealthcare` creates yearly rows from `input.asOfDate` through the stated planning ages. `lifetimeFutureCost` is the sum of those projected nominal annual costs. `lifetimePresentCost` discounts each nominal annual cost by both the healthcare-inflation index and the supplied real discount rate. This converts the indexed amount to base-year dollars before applying the real discount rate.

## HSA treatment

The HSA coverage estimate counts only owner-eligible Medicare Part B and Part D IRMAA premiums. It excludes the combined supplemental assumption because that amount may contain Medigap premiums. IRS Publication 969 permits HSA distributions for Medicare and other health coverage after age 65, but expressly excludes Medicare supplemental policies such as Medigap. [2] The result therefore avoids presenting Medigap as HSA-qualified. It also flags unconfirmed `hsaQualified` status and does not treat an under-65 account owner’s HSA as covering a spouse’s Medicare premiums.

The displayed `hsaCoverageYears` is a limited planning estimate: eligible existing HSA balance divided by the first eligible Medicare-year known qualifying premium amount for account owners whose Medicare years fall inside the plan. It does not project HSA investment returns, future contributions, carrier-specific plan premiums, or an HSA distribution tax determination.

## Enrollment and coverage explanation

The Initial Enrollment Period generally lasts seven months: the three months before a person turns 65, the birthday month, and the three months after. [3] People with qualifying job-based group coverage can have a time-limited Special Enrollment Period when that coverage or employment ends. COBRA, retiree coverage, Marketplace coverage, and missing the job-based coverage window do not create that same Special Enrollment Period. [3]

Missing the Initial Enrollment Period can mean waiting to enroll and a Part B late-enrollment penalty for as long as Part B is held. [3] For Part D, a person who goes without Part D or other creditable prescription coverage for 63 or more consecutive days after the Initial Enrollment Period may owe an added premium for as long as they have Part D coverage. [4] The engine provides this information for planning education only; eligibility, exceptions, enrollment dates, and penalties require confirmation with Medicare, Social Security, or a qualified benefits professional.

Original Medicare plus **Medigap** uses a Medicare supplemental policy to help with Original Medicare cost sharing. **Medicare Advantage** is a private Medicare-approved alternative that generally covers Part A and Part B benefits and often includes drug coverage. The engine does not quote or choose either arrangement. [3]

## References

[1]: https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles "2026 Medicare Parts A and B Premiums and Deductibles"
[2]: https://www.irs.gov/publications/p969 "Publication 969 Health Savings Accounts and Other Tax-Favored Health Plans"
[3]: https://www.medicare.gov/basics/get-started-with-medicare/sign-up/when-does-medicare-coverage-start "When does Medicare coverage start"
[4]: https://www.medicare.gov/publications/11222-part-d-late-enrollment-penalty.pdf "The Part D Late Enrollment Penalty"
