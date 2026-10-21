import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS, projectAnnualRules, validateAssumptions } from '../../lib/assumptions/defaults';

describe('2026 annual assumptions', () => {
  it('seeds verified 2026 official figures and explicitly classified source records', () => {
    const { annual } = DEFAULT_ASSUMPTIONS;

    expect(annual.year).toBe(2026);
    expect(annual.taxBrackets.MARRIED_FILING_JOINTLY.slice(0, 3)).toEqual([
      { upTo: 24800, rate: 0.1 },
      { upTo: 100800, rate: 0.12 },
      { upTo: 211400, rate: 0.22 },
    ]);
    expect(annual.standardDeduction).toMatchObject({
      SINGLE: 16100,
      MARRIED_FILING_JOINTLY: 32200,
      MARRIED_FILING_SEPARATELY: 16100,
      HEAD_OF_HOUSEHOLD: 24150,
    });
    expect(annual.additionalDeduction65).toMatchObject({ SINGLE: 2050, MARRIED_FILING_JOINTLY: 1650 });
    expect(annual.capitalGainsThresholds.MARRIED_FILING_JOINTLY).toEqual({ zero: 98900, fifteen: 613700 });
    expect(annual.contributions).toMatchObject({
      workplace: 24500,
      workplaceCatchup50: 8000,
      workplaceCatchup60to63: 11250,
      ira: 7500,
      iraCatchup50: 1100,
      hsaSelf: 4400,
      hsaFamily: 8750,
      hsaCatchup55: 1000,
    });
    expect(annual.qcdLimit).toBe(111000);
    expect(Object.keys(annual.rmdJoint ?? {})).toHaveLength(5490);
    expect(annual.rmdJoint?.['75:60']).toBeGreaterThan(annual.rmdUniform['75']);
    expect(annual.socialSecurity).toMatchObject({
      earningsUnderFra: 24480,
      earningsFraYear: 65160,
      taxableMaximum: 184500,
      cola: 0.028,
    });
    expect(annual.medicare.irmaaSeparate).toEqual([
      { upTo: 109000, partBMonthly: 202.9, partDMonthly: 0 },
      { upTo: 391000, partBMonthly: 649.2, partDMonthly: 83.3, upperExclusive: true },
      { upTo: null, partBMonthly: 689.9, partDMonthly: 91 },
    ]);
    expect(annual.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'annual.taxBrackets', classification: 'OFFICIAL', verifiedAt: '2026-10-20' }),
      expect.objectContaining({ key: 'annual.medicare.irmaaSeparate', classification: 'OFFICIAL' }),
      expect.objectContaining({ key: 'irs-publication-590-b-2025-appendix-b', classification: 'OFFICIAL' }),
    ]));
    expect(DEFAULT_ASSUMPTIONS.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'planning.inflation', classification: 'PLANNING_ASSUMPTION' }),
      expect.objectContaining({ key: 'planning.returnByRisk', classification: 'PLANNING_ASSUMPTION' }),
    ]));
  });

  it('returns a defensive clone and rejects missing, non-finite, non-monotone, and mismatched annual data', () => {
    const input = structuredClone(DEFAULT_ASSUMPTIONS);
    const validated = validateAssumptions(input);
    validated.annual.standardDeduction.SINGLE = 1;
    expect(input.annual.standardDeduction.SINGLE).toBe(16100);

    const missingStatus = structuredClone(input);
    delete (missingStatus.annual.standardDeduction as Partial<typeof missingStatus.annual.standardDeduction>).HEAD_OF_HOUSEHOLD;
    expect(() => validateAssumptions(missingStatus)).toThrow(/HEAD_OF_HOUSEHOLD is required/);

    const nonFinite = structuredClone(input);
    nonFinite.inflation = Number.NaN;
    expect(() => validateAssumptions(nonFinite)).toThrow(/finite number/);

    const nonMonotone = structuredClone(input);
    nonMonotone.annual.taxBrackets.SINGLE[1].upTo = 10000;
    expect(() => validateAssumptions(nonMonotone)).toThrow(/upper bounds must be strictly increasing/);

    const mismatchedYear = structuredClone(input);
    mismatchedYear.year = 2027;
    expect(() => validateAssumptions(mismatchedYear)).toThrow(/must equal/);
  });

  it('projects supplied annual values with cent rounding, marks them projected, preserves fixed SS taxation thresholds, and expires the senior deduction', () => {
    const projected = projectAnnualRules(DEFAULT_ASSUMPTIONS.annual, 2027, 0.025);

    expect(projected.year).toBe(2027);
    expect(projected.standardDeduction.SINGLE).toBe(16502.5);
    expect(projected.medicare.partBStandard).toBe(207.97);
    expect(projected.socialSecurity.taxThresholds).toEqual(DEFAULT_ASSUMPTIONS.annual.socialSecurity.taxThresholds);
    expect(projected.seniorDeduction.amount).toBe(6150);
    expect(projected.sources.every((item) => item.classification === 'PROJECTED')).toBe(true);
    expect(projected.sources[0].note).toContain('not verified future law');

    const afterExpiry = projectAnnualRules(DEFAULT_ASSUMPTIONS.annual, 2029, 0.025);
    expect(afterExpiry.seniorDeduction.amount).toBe(0);
    expect(afterExpiry.seniorDeduction.endYear).toBe(2028);
  });

  it('does not manufacture historical rules or accept invalid projection inputs', () => {
    expect(() => projectAnnualRules(DEFAULT_ASSUMPTIONS.annual, 2025, 0.025)).toThrow(/finite number between 2026/);
    expect(() => projectAnnualRules(DEFAULT_ASSUMPTIONS.annual, 2027, Number.POSITIVE_INFINITY)).toThrow(/finite number/);
  });
});
