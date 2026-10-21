import { describe, expect, it } from 'vitest';
import { calculateTax, taxableSocialSecurity } from '../../lib/calculations/tax';
import type { AnnualRules, FilingStatus, TaxBracket } from '../../lib/calculations/types';

const brackets = (first: number, second: number, third: number): TaxBracket[] => [
  { upTo: first, rate: 0.1 },
  { upTo: second, rate: 0.12 },
  { upTo: third, rate: 0.22 },
  { upTo: null, rate: 0.24 },
];

function rules(): AnnualRules {
  const statuses: FilingStatus[] = ['SINGLE', 'MARRIED_FILING_JOINTLY', 'MARRIED_FILING_SEPARATELY', 'HEAD_OF_HOUSEHOLD'];
  return {
    year: 2026,
    taxBrackets: {
      SINGLE: brackets(12_400, 50_400, 105_700),
      MARRIED_FILING_JOINTLY: brackets(24_800, 100_800, 211_400),
      MARRIED_FILING_SEPARATELY: brackets(12_400, 50_400, 105_700),
      HEAD_OF_HOUSEHOLD: brackets(17_700, 67_450, 105_700),
    },
    standardDeduction: { SINGLE: 16_100, MARRIED_FILING_JOINTLY: 32_200, MARRIED_FILING_SEPARATELY: 16_100, HEAD_OF_HOUSEHOLD: 24_150 },
    additionalDeduction65: { SINGLE: 2_050, MARRIED_FILING_JOINTLY: 1_650, MARRIED_FILING_SEPARATELY: 1_650, HEAD_OF_HOUSEHOLD: 2_050 },
    seniorDeduction: {
      amount: 6_000,
      phaseoutStart: { SINGLE: 75_000, MARRIED_FILING_JOINTLY: 150_000, MARRIED_FILING_SEPARATELY: 75_000, HEAD_OF_HOUSEHOLD: 75_000 },
      phaseoutRate: 0.06,
      endYear: 2028,
      eligibleFilingStatuses: ['SINGLE', 'MARRIED_FILING_JOINTLY', 'HEAD_OF_HOUSEHOLD'],
    },
    capitalGainsThresholds: {
      SINGLE: { zero: 48_000, fifteen: 533_000 },
      MARRIED_FILING_JOINTLY: { zero: 96_000, fifteen: 600_000 },
      MARRIED_FILING_SEPARATELY: { zero: 48_000, fifteen: 300_000 },
      HEAD_OF_HOUSEHOLD: { zero: 64_000, fifteen: 566_000 },
    },
    contributions: { workplace: 0, workplaceCatchup50: 0, workplaceCatchup60to63: 0, ira: 0, iraCatchup50: 0, hsaSelf: 0, hsaFamily: 0, hsaCatchup55: 0 },
    socialSecurity: {
      earningsUnderFra: 0,
      earningsFraYear: 0,
      taxableMaximum: 0,
      cola: 0,
      taxThresholds: {
        SINGLE: { base1: 25_000, base2: 34_000, cap: 4_500 },
        MARRIED_FILING_JOINTLY: { base1: 32_000, base2: 44_000, cap: 6_000 },
        // These are the annual thresholds for MFS taxpayers who lived apart all year.
        MARRIED_FILING_SEPARATELY: { base1: 25_000, base2: 34_000, cap: 4_500 },
        HEAD_OF_HOUSEHOLD: { base1: 25_000, base2: 34_000, cap: 4_500 },
      },
    },
    medicare: { partBStandard: 0, irmaaSingle: [], irmaaJoint: [], irmaaSeparate: [] },
    rmdUniform: {},
    estateExemption: 0,
    giftExclusion: 0,
    qcdLimit: 0,
    sources: [{ key: 'irs-2026', title: 'IRS 2026 annual tax rules', url: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill', verifiedAt: '2026-10-20', classification: 'OFFICIAL' }],
  };
}

describe('federal tax engine', () => {
  it('matches the Section 14.1 MFJ standard-deduction acceptance case', () => {
    const result = calculateTax({ filingStatus: 'MARRIED_FILING_JOINTLY', ordinaryIncome: 150_000, taxYear: 2026 }, rules());

    expect(result.taxableIncome).toBe(117_800);
    expect(result.federalTax).toBe(15_340);
    expect(result.marginalRate).toBe(0.22);
    expect(result.effectiveRate).toBe(0.102267);
  });

  it('matches the Section 14.1 taxable Social Security acceptance case', () => {
    const result = calculateTax({
      filingStatus: 'MARRIED_FILING_JOINTLY',
      ordinaryIncome: 30_000,
      socialSecurityAnnual: 40_000,
      taxYear: 2026,
    }, rules());

    expect(result.provisionalIncome).toBe(50_000);
    expect(result.taxableSocialSecurity).toBe(11_100);
    expect(result.magi).toBe(41_100);
  });

  it('stacks long-term gains above ordinary taxable income instead of taxing them as ordinary income', () => {
    const annual = rules();
    annual.standardDeduction.SINGLE = 0;
    const result = calculateTax({ filingStatus: 'SINGLE', ordinaryIncome: 30_000, longTermCapitalGains: 30_000 }, annual);

    // $30k ordinary tax = $3,352. Of gains, $18k is 0% and $12k is 15%.
    expect(result.taxableIncome).toBe(60_000);
    expect(result.federalTax).toBe(5_152);
    expect(result.marginalRate).toBe(0.15);
  });

  it('applies the senior deduction phaseout separately for each eligible MFJ taxpayer and expires it after 2028', () => {
    const annual = rules();
    const result = calculateTax({
      filingStatus: 'MARRIED_FILING_JOINTLY',
      ordinaryIncome: 150_100,
      ages: [65, 72],
      taxYear: 2026,
    }, annual);

    // Each $6,000 deduction is independently reduced by $100 × 6% = $6.
    expect(result.seniorDeduction).toBe(11_988);
    expect(result.standardDeduction).toBe(35_500);

    const expired = calculateTax({ filingStatus: 'MARRIED_FILING_JOINTLY', ordinaryIncome: 150_100, ages: [65, 72], taxYear: 2029 }, {
      ...annual,
      year: 2029,
    });
    expect(expired.seniorDeduction).toBe(0);
  });

  it('uses the zero-base Social Security treatment for MFS taxpayers who lived with their spouse', () => {
    const annual = rules();
    expect(taxableSocialSecurity(40_000, 30_000, 0, 'MARRIED_FILING_SEPARATELY', annual, true)).toBe(34_000);
    expect(taxableSocialSecurity(40_000, 30_000, 0, 'MARRIED_FILING_SEPARATELY', annual, false)).toBe(18_100);
  });
});
