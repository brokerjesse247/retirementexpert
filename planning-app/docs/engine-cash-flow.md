# Cash-flow engine

`calculateCashFlow(input, assumptions, options?)` in `lib/calculations/cash-flow.ts` is a **pure, deterministic annual cash-basis projection**. It neither reads persistence nor relies on a current clock. Dollar outputs are rounded to cents through the shared `roundMoney` helper.

## Time horizon and annual policy

- Rows begin in `input.asOfDate`’s calendar year and continue through the later household planning-age year. A person has income and healthcare in the year whose December 31 completed age is no greater than that person’s planning age; after the first death proxy, the survivor continues to their own horizon.
- The primary person’s retirement-age month switches the household living budget from current to retirement spending, pro-rated by calendar month in that transition year. If one member survives, the supplied `survivorSpendingPercent` is applied to the household budget.
- Employment is pro-rated through the month before each person’s retirement age; configured retirement part-time income begins at retirement. Pension and annuity start ages are likewise month-pro-rated. The Social Security module, rather than this module, owns Social Security claiming, COLA, earnings-test, spousal, and survivor calculations.
- Current and retirement spending, annual charity, and eligible survivor spending are indexed by the supplied general-inflation planning assumption. A one-time goal and `options.extraExpenses[year]` are **nominal stated-year dollars**, so the engine deliberately does not inflate them again.
- Mortgage and debt payments are not separately deducted: they are treated as already included in the client’s spending budget. This prevents double-counting.

## Annual rules, tax and healthcare

Each row asks the assumptions helper for that year’s annual rules and sends the resulting rules to the tax and RMD helpers. Values after the base rule year are explicit projections under the assumptions policy; they are **not assertions about future tax law**.

Healthcare is supplied by `healthcareCostAtYear`, using the cash-flow engine’s accumulated MAGI history for its exact two-year Medicare lookback. `row.healthcare` is always visible. It is added to required cash only when `healthcareIncludedInSpending` is `false`, preventing budget double-counting.

Federal tax is repeatedly calculated from the tax module until the tax-and-withdrawal cash requirement converges to one cent, with a 12-pass bound. State tax is only a flat planning estimate when `assumptions.stateTaxRate` is supplied; otherwise it is zero with an explicit warning. It is not a state tax return calculation.

`options.rothConversions[year]` transfers pre-tax balances to the same owner’s Roth account **after the owner’s RMD**. It increases ordinary taxable income, has no spendable cash value, and its tax is funded once through the same tax-cash iteration. A conversion is capped at remaining modeled pre-tax assets.

## Account ledger and distribution order

Account records remain owner-specific throughout the projection. This is material for RMDs: each living owner’s qualified `K401_PRETAX`, `TRAD_IRA`, and qualified-annuity balance forms that owner’s RMD base. Roth balances and HSAs never enter the RMD base; nonqualified annuities are not treated as RMD-eligible.

The cash funding order is:

1. **Mandatory RMD cash**;
2. **Confirmed qualified HSA** money, and only up to annual healthcare cost;
3. Cash, then taxable brokerage (with proportional cost-basis reduction and realized gain calculation);
4. Voluntary qualified pre-tax money up to the supplied target-bracket ceiling; and
5. Roth balances last.

Mandatory RMD cash in excess of household obligations is put back into modeled cash. It is therefore never counted as a second increase in total portfolio assets. `portfolioWithdrawal` is gross account cash distributed, while `netPortfolioDraw` is the actual portfolio consumption and excludes retained mandatory-RMD surplus.

Brokerage sales use the supplied cost basis. If basis is missing, the engine does **not invent a realized capital gain** and marks the federal estimate partial. Nonqualified annuity cash value is retained in the taxable bucket but not liquidated: surrender terms and basis are unavailable. Nonqualified/unknown annuity income is conservatively included as ordinary income until its Form 1099-R treatment is verified. Cash-value life insurance is not a modeled funding source because surrender/loan terms are absent.

## Failure visibility and downstream simulation fields

No account may become negative. `portfolioNeed` is the full required net portfolio funding after current wages, Social Security, pension, annuity, and other cash income, including actual federal and modeled state tax. It stays positive even where assets cannot meet it; downstream Monte Carlo must use it rather than silently turning a depleted row into zero withdrawals.

`unmetNeed` makes any unfunded amount explicit and `failed` is true on an asset shortfall or bounded nonconvergence. The function’s module status becomes `PARTIAL` in either case. `depletionAge` is the primary person’s age in the first explicit shortfall year. `portfolioAtRetirement` is the **opening modeled portfolio** of the selected primary retirement year, matching the first annual row used by simulation.

Income Coverage Ratio is null when optional essential spending is unknown (or zero); it is never fabricated as 0% or 100%.
