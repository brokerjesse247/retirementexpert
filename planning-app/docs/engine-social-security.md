# Social Security engine policy and boundaries

The Social Security engine is a **pure, deterministic** calculation module. It consumes the PIA and claim information in `PlanningInput` and the annual COLA and annual earnings-test limits in `PlanningAssumptions.annual.socialSecurity`. It does not fetch SSA data, infer current dates, or embed an annual dollar limit.

## Statutory claim rules implemented

A worker can begin retirement benefits at 62. Full retirement age is determined in months from the statutory birth-year schedule. SSA says to use the previous year for a January 1 birthday, and says that a claimant must be 62 for the entire month to receive a retirement benefit. The engine applies those rules when deriving the first entitlement month from the date of birth. A birthday on the first is treated as the prior month for FRA; a non-first birthday reaches the age-62 whole-month requirement in the following month. [1]

Worker benefits use SSA's monthly early-retirement reduction: **5/9 of 1%** for each of the first 36 months before FRA and **5/12 of 1%** for each additional month. For people born in 1943 or later, delayed credits are **2/3 of 1% per month** after FRA and stop at 70. [1] [2] The calculation retains these factors through the formula and applies `roundMoney`'s half-up cent rounding only to the payable monthly benefit. It does not round intermediate reduction factors.

A spouse's potential amount starts at one-half of the worker's PIA if the worker has filed. Where the spouse has an own PIA, the engine adds only the excess over own PIA, then separately reduces that excess if claimed early. SSA describes the spouse reduction as 25/36 of 1% per month for the first 36 early months and 5/12 of 1% thereafter; spouse benefits receive no delayed credits. [3] Deemed filing is relevant to dual retirement/spouse entitlement. The engine models a combined own-worker plus excess-spouse amount for the stated claim month, rather than a restricted-application strategy. [4]

The no-COLA `breakEvenAge` helper compares the early head start with the later monthly increase. For a $2,000 PIA with FRA 67, it returns **78.67** for 62 versus 67 and **82.50** for 67 versus 70. These are arithmetic break-even ages, not life-expectancy advice.

## Earnings test and annual data

The annual earnings-test thresholds and COLA are always read from the supplied `annual.socialSecurity` rule. For its rule year, the engine applies $1 of withholding for each $2 above the under-FRA limit. In the FRA year it applies $1 for each $3 above the FRA-year limit, only against benefits payable before the FRA month. SSA confirms that earnings in the FRA year are counted only through the month before FRA and that the test ends beginning with the FRA month. [5]

`PlanningInput` has annual earnings, not month-by-month wages or self-employment service hours. In an FRA year, the engine therefore uniformly annualizes that supplied annual earning amount over the pre-FRA months and marks the result as an estimate. It explicitly does **not** attempt SSA's special first-year monthly rule, which depends on monthly earnings and substantial self-employment service information not captured by the intake. [6] It also warns that later-covered-earnings recomputations cannot be calculated without earnings history.

No future annual earnings threshold is invented. If a year other than `annual.year` would require the earnings test, withholding is not modeled and the result warns that the corresponding annual rule was not supplied. Future monthly benefit projections repeat the supplied annual COLA as an explicit planning projection and label it as such; this is not a claim that future law or future official COLAs are known.

## Existing claims, optimizer, and survivor treatment

An `alreadyReceiving` person is locked to the supplied current benefit in every claiming alternative. The current amount is treated as the benefit **as of `input.asOfDate`**, and future values receive the supplied COLA. The engine will never optimize that claimant as if an old claim could be undone. If the current amount is absent but a start age exists, it reconstructs an amount from PIA and flags the limitation. If a current benefit could include an unrecorded spouse component, it uses the supplied amount as the total and does not add a second spouse component.

For a couple, the optimizer enumerates the 81 annual 62-to-70 claim pairs. Claimed people remain locked, so some requested pairs may correctly produce identical result rows. It selects the highest supplied-real-discount-rate present value, with cumulative benefits and earlier ages as deterministic tie breakers. `annualBenefits` provides cumulative benefit and present-value curves; the default assumption is 3% real, but the engine deliberately uses the supplied editable `realDiscountRate`.

The simple survivor implementation follows SSA's rule that a survivor may select the better payment rather than add survivor and own payments. [7] It applies the larger own/deceased worker payment only when both worker benefits were already in payment and the survivor is at or above the retirement FRA used by this model. Delayed credits in the deceased worker's underlying payment are retained. This is an intentionally limited case: SSA survivor FRA can differ, survivor benefits can begin before retirement FRA, and a survivor may choose a different filing/switch strategy. Those inputs are not in the contract, so the engine does **not** pretend that `max(own, deceased)` is exact outside the simple case; it keeps the underlying own benefit and emits an unsupported-survivor warning. Planning ages are only used as deterministic end-of-projection/death timing, not as a mortality prediction.

`survivorIncomeDropMonthly` is a pre-death stress indicator equal to the smaller of the first month in which both planned benefits are payable. It is `null` when there is no observed simultaneous benefit payment, rather than a fabricated number.

The module does not apply WEP or GPO. SSA states that the Social Security Fairness Act ended both provisions and that they no longer apply to benefits payable for January 2024 and later. [8]

## Returned household convention

`householdBenefitsAtYear` returns a full calendar-year `annual` amount, an average `monthly` amount (`annual / 12`), and annual net amounts in `perPerson`. Each is **net of annual earnings-test withholding**; `withheld` separately reports the total reduction. This makes `perPerson` reconcile to `annual`, including partial first benefit years. Benefit payments are typically paid in the following month, but the household helper reports entitlement-month income for cash-flow planning.

**References**

[1]: https://www.ssa.gov/benefits/retirement/planner/agereduction.html "SSA retirement age and early reduction"
[2]: https://www.ssa.gov/benefits/retirement/planner/delayret.html "SSA delayed retirement credits"
[3]: https://www.ssa.gov/oact/quickcalc/spouse.html "SSA spouse benefit calculation"
[4]: https://www.ssa.gov/benefits/retirement/planner/claiming.html "SSA retirement and spouse filing rules"
[5]: https://www.ssa.gov/benefits/retirement/planner/whileworking.html "SSA receiving benefits while working"
[6]: https://www.ssa.gov/benefits/retirement/planner/rule.html "SSA special earnings limit rule"
[7]: https://www.ssa.gov/survivor/amount "SSA survivor benefit amounts"
[8]: https://www.ssa.gov/benefits/retirement/social-security-fairness-act.html "SSA Social Security Fairness Act update"
