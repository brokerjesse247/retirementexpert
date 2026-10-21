# RMD calculation engine

`lib/calculations/rmd.ts` is a pure, original-owner RMD helper. `calculateRmd` divides the caller-supplied **prior December 31 balance** by an annual-rule distribution period and applies deterministic cent rounding. It returns zero before the applicable start age. The exact acceptance cases are $500,000 ÷ 24.6 = **$20,325.20** at age 75 and $500,000 ÷ 26.5 = **$18,867.92** at age 73.

## Start ages and tables

`rmdStartAge` maps births in 1951–1959 to age 73 and births in 1960 or later to age 75. In particular, 1955 returns 73 and 1962 returns 75. CRS describes the SECURE 2.0 age-73 and age-75 transitions and reports the IRS clarification that the potentially ambiguous 1959 cohort begins at 73. [1]

The shared function accepts only a birth year. It therefore returns 72 for 1950 and earlier, but cannot distinguish the legacy pre-July 1, 1949 age-70½ cohort. A caller with that cohort must verify the actual required beginning date.

`calculateRmd` reads `rules.rmdUniform` and `rules.rmdJoint`; it does not embed annual distribution factors. The direct helper selects the Joint and Last Survivor factor only when `soleSpouseBeneficiary` is true **and** the supplied spouse is more than 10 years younger. It otherwise uses the Uniform table. This is the IRS table-selection rule; an inherited account instead uses the Single Life table and is outside this function’s original-owner scope. [2]

`lib/assumptions/rmd-tables-2026.ts` preserves IRS Publication 590-B Appendix B data: all 49 Uniform factors from ages 72 through 120-and-over, and all 5,490 published Joint Life table cells. The Joint source is nested as `RMD_TABLES_2026.joint[ownerAge][spouseAge]`. When seeding `AnnualRules.rmdJoint`, flatten source cells to the documented `"ownerAge:spouseAge"` key, for example `"75:60"`; this is only a source-data mapping, not a life-expectancy formula. [3]

## Account treatment and schedule semantics

The schedule includes `K401_PRETAX`, `TRAD_IRA`, and an `ANNUITY` only when its qualification is explicitly `QUALIFIED`. It excludes nonqualified annuities, original-owner Roth IRA and designated Roth balances, and HSA balances. IRS guidance says lifetime RMDs do not apply to original-owner Roth IRAs or designated Roth accounts, while beneficiaries remain subject to RMD rules. [2] IRS HSA guidance separately states that taxpayers are not required to take annual HSA distributions. [4]

`calculateRmds` has no prior-year account balance in `PlanningInput`. Every schedule row is therefore marked `illustrative: true` with the label:

> Illustrative only: current balance is not the actual prior December 31 balance.

The function returns `PARTIAL` and a warning because the intake does not represent inherited status, beneficiary designation, account-level spouse age, workplace-plan retirement/5% owner status, or pre-1987 403(b) amounts. It cannot calculate inherited-account 10-year or eligible-designated-beneficiary exceptions, and it deliberately does not infer the sole-spouse condition. The IRS explains both the later-of-retirement workplace-plan exception and the beneficiary 10-year-rule exceptions. [2]

The illustration projects only through the supplied planning age, capped at age 120. It holds the supplied current eligible balance constant for each displayed year; it is not a future balance forecast and must not be presented as an actual RMD calculation.

## References

[1]: https://www.congress.gov/crs-product/IF12750 "Congressional Research Service RMD rules for original owners"
[2]: https://www.irs.gov/retirement-plans/retirement-plan-and-ira-required-minimum-distributions-faqs "IRS RMD frequently asked questions"
[3]: https://www.irs.gov/pub/irs-pdf/p590b.pdf "IRS Publication 590-B Appendix B life expectancy tables"
[4]: https://apps.irs.gov/app/vita/content/17s/37_09_005.jsp?level=advanced "IRS HSA distributions guidance"
