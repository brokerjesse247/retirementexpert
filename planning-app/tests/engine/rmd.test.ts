import { describe, expect, it } from 'vitest';
import { RMD_TABLES_2026 } from '../../lib/assumptions/rmd-tables-2026';
import { calculateRmd, calculateRmds, rmdStartAge } from '../../lib/calculations/rmd';
import type { AnnualRules, PlanningAccount, PlanningAssumptions, PlanningInput } from '../../lib/calculations/types';

function annualRules(): AnnualRules {
  const rmdJoint = Object.fromEntries(
    Object.entries(RMD_TABLES_2026.joint).flatMap(([ownerAge, spouseRows]) =>
      Object.entries(spouseRows).map(([spouseAge, factor]) => [`${ownerAge}:${spouseAge}`, factor]),
    ),
  );
  return {
    year: 2026,
    rmdUniform: { ...RMD_TABLES_2026.uniform },
    rmdJoint,
  } as unknown as AnnualRules;
}

function planningInput(accounts: PlanningAccount[]): PlanningInput {
  return {
    asOfDate: '2026-05-01',
    persons: [{
      role: 'PRIMARY',
      name: 'RMD Test Client',
      dob: '1951-06-15',
      planningAge: 76,
    }],
    accounts,
  } as PlanningInput;
}

function account(
  type: PlanningAccount['type'],
  balance: number,
  annuityQualification: PlanningAccount['annuityQualification'] = null,
): PlanningAccount {
  return {
    owner: 'PRIMARY',
    type,
    balance,
    costBasis: null,
    annuityQualification,
    hsaQualified: null,
  };
}

describe('RMD engine', () => {
  const rules = annualRules();

  it('matches the required acceptance amounts and SECURE 2.0 start ages', () => {
    expect(calculateRmd(500_000, 75, 1955, rules)).toBe(20_325.20);
    expect(calculateRmd(500_000, 73, 1955, rules)).toBe(18_867.92);
    expect(rmdStartAge(1955)).toBe(73);
    expect(rmdStartAge(1962)).toBe(75);
    expect(rmdStartAge(1959)).toBe(73);
    expect(calculateRmd(500_000, 73, 1962, rules)).toBe(0);
    expect(calculateRmd(500_000, 75, 1962, rules)).toBe(20_325.20);
  });

  it('uses the Joint and Last Survivor table only for a sole spouse more than 10 years younger', () => {
    expect(calculateRmd(500_000, 75, 1955, rules, { soleSpouseBeneficiary: true, spouseAge: 60 })).toBe(17_667.84);
    expect(calculateRmd(500_000, 75, 1955, rules, { soleSpouseBeneficiary: false, spouseAge: 60 })).toBe(20_325.20);
    expect(calculateRmd(500_000, 75, 1955, rules, { soleSpouseBeneficiary: true, spouseAge: 65 })).toBe(20_325.20);
    expect(() => calculateRmd(500_000, 75, 1955, rules, { soleSpouseBeneficiary: true })).toThrow('Spouse age is required');
  });

  it('contains the complete official table ranges required through age 120', () => {
    expect(Object.keys(RMD_TABLES_2026.uniform)).toHaveLength(49);
    expect(RMD_TABLES_2026.uniform['72']).toBe(27.4);
    expect(RMD_TABLES_2026.uniform['120']).toBe(2.0);
    expect(RMD_TABLES_2026.joint['75']['60']).toBe(28.3);
    expect(Object.values(RMD_TABLES_2026.joint).reduce((count, row) => count + Object.keys(row).length, 0)).toBe(5_490);
    expect(RMD_TABLES_2026.sources[0].url).toContain('irs.gov');
  });

  it('excludes Roth, HSA, and nonqualified annuity balances and labels current-balance rows as illustrative', () => {
    const input = planningInput([
      account('K401_PRETAX', 500_000),
      account('TRAD_IRA', 100_000),
      account('ANNUITY', 100_000, 'QUALIFIED'),
      account('ANNUITY', 400_000, 'NONQUALIFIED'),
      account('HSA', 12_000),
      account('ROTH_IRA', 20_000),
      account('ROTH_401K', 10_000),
    ]);
    const result = calculateRmds(input, { annual: rules } as unknown as PlanningAssumptions);

    expect(result.people[0]).toMatchObject({ startAge: 73, eligibleBalance: 700_000 });
    expect(result.people[0].excludedBalances.map(({ accountType }) => accountType)).toEqual([
      'ANNUITY', 'HSA', 'ROTH_IRA', 'ROTH_401K',
    ]);
    expect(result.schedule).toHaveLength(2);
    expect(result.schedule[0]).toMatchObject({
      year: 2026,
      age: 75,
      balanceBasis: 700_000,
      illustrative: true,
      table: 'UNIFORM',
      distributionPeriod: 24.6,
      rmd: 28_455.28,
    });
    expect(result.schedule[0].balanceBasisLabel).toContain('not the actual prior December 31 balance');
    expect(result.meta.warnings.join(' ')).toContain('Inherited-account rules');
  });
});
