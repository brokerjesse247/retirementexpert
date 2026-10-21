# Engine annual assumptions — 2026 source support

**Verified October 20, 2026.** The engine seeds calendar-year 2026 rules only. Values for later years are explicit planning projections produced by `projectAnnualRules`; they are not statements of verified future law. The separately maintained RMD table is imported from `lib/assumptions/rmd-tables-2026.ts`.

## Federal tax and transfer-tax rules

The 2026 ordinary brackets are 10%, 12%, 22%, 24%, 32%, 35%, and 37%. The upper thresholds for MFJ are $24,800, $100,800, $211,400, $403,550, $512,450, and $768,700; for single filers, $12,400, $50,400, $105,700, $201,775, $256,225, and $640,600. The same source supplies the complete HoH and MFS schedules used by the seed. [1]

The 2026 standard deduction is $32,200 MFJ, $16,100 single/MFS, and $24,150 HoH. The age-65-or-blind additional deduction is $1,650, or $2,050 for an unmarried taxpayer who is not a surviving spouse. [1]

The 2026 0%/15% long-term-capital-gain breakpoints are $98,900/$613,700 MFJ, $49,450/$306,850 MFS, $66,200/$579,600 HoH, and $49,450/$545,500 for all other individuals. [1]

The temporary enhanced senior deduction is $6,000 per eligible person, available for 2025–2028 in addition to the existing age-65 deduction, with a $75,000 MAGI phaseout start ($150,000 MFJ). It is available to eligible single, HoH, and joint filers; a married taxpayer must file jointly. The seed uses the statutory 6% phaseout rate and expires the bonus after 2028. [2] [3] [10]

The 2026 basic federal estate-tax exclusion is $15,000,000 and the annual gift-tax exclusion is $19,000. [4]

## Contribution and distribution limits

For 2026, the employee elective-deferral limit is $24,500. The general workplace catch-up is $8,000 for age 50+, while the age-60–63 catch-up is $11,250. The IRA limit is $7,500 and the indexed age-50 catch-up is $1,100. [5]

The 2026 HSA contribution limits are $4,400 self-only and $8,750 family; the existing statutory catch-up for an eligible person age 55+ remains $1,000. [6] [12]

The maximum 2026 QCD excluded from gross income is $111,000 per eligible taxpayer. [5]

## Social Security

SSA states that the 2026 COLA is 2.8%, the OASDI taxable maximum is $184,500, the retirement-earnings-test limit before FRA is $24,480, and the FRA-year limit is $65,160 for months before FRA. [7] The statutory Social Security income-tax thresholds are not indexed; the seed therefore retains the current $25,000/$34,000 individual and $32,000/$44,000 joint thresholds rather than projecting them. IRS Publication 915 also documents the $0 base and direct 85%-taxable treatment for MFS taxpayers who lived with a spouse during the year. [11]

## Medicare

CMS sets the 2026 standard Part B premium at $202.90 per month. The full Part B and Part D IRMAA schedules used in the seed include individual, joint, and married-filing-separately/lived-together tiers. The MFS special schedule is $202.90 through $109,000 MAGI, $649.20 plus a $83.30 Part D IRMAA above $109,000 but below $391,000, and $689.90 plus $91.00 at or above $391,000. Medicare uses the tax return from two years earlier for this determination. [8] [9]

## Planning-only settings

The 2.5% general-inflation and Social Security-COLA defaults, 5% healthcare inflation, nominal return/volatility profiles, longevity settings, healthcare/LTC cost inputs, allocation targets, and other non-annual-law values are editable **planning assumptions** from the approved requirements. They are illustrative inputs, not forecasts, official estimates, rates, or carrier quotes. State income-tax and state-estate values remain `null` rather than inventing state facts.

**References**

[1]: https://www.irs.gov/pub/irs-drop/rp-25-32.pdf "IRS Revenue Procedure 2025-32"
[2]: https://www.irs.gov/newsroom/working-families-tax-cuts-individuals-and-workers "IRS Working Families Tax Cuts for individuals and workers"
[3]: https://www.irs.gov/newsroom/2026-filing-season-updates-and-resources-for-seniors "IRS 2026 filing season updates for seniors"
[4]: https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill "IRS tax year 2026 inflation adjustments"
[5]: https://www.irs.gov/pub/irs-drop/n-25-67.pdf "IRS Notice 2025-67 retirement-plan and IRA amounts"
[6]: https://www.irs.gov/pub/irs-drop/n-26-05.pdf "IRS Notice 2026-5 HSA guidance"
[7]: https://www.ssa.gov/news/en/cola/factsheets/2026.html "SSA 2026 COLA fact sheet"
[8]: https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles "CMS 2026 Medicare Part B premiums and Part D IRMAA"
[9]: https://www.medicare.gov/publications/11579-medicare-costs.pdf "Medicare 2026 costs fact sheet"
[10]: https://www.congress.gov/bill/119th-congress/house-bill/1/text "Public Law 119-21 senior deduction text"
[11]: https://www.irs.gov/publications/p915 "IRS Publication 915 Social Security benefits"
[12]: https://www.irs.gov/publications/p15b "IRS Publication 15-B employer fringe benefits"
