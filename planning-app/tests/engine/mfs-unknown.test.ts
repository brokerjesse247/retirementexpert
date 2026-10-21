import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../lib/assumptions/defaults';
import { healthcareCostAtYear } from '../../lib/calculations/healthcare';
import { mapPlanningInput } from '../../lib/calculations/input';
import { calculateTax } from '../../lib/calculations/tax';
import { emptyIntake, type IntakeData } from '../../lib/intake/schema';

function mfsIntake(): IntakeData {
  const data = structuredClone(emptyIntake);
  Object.assign(data, {
    firstName: 'Morgan',
    lastName: 'Example',
    dob: '1960-06-15',
    state: 'CA',
    maritalStatus: 'MARRIED',
    filingStatus: 'MARRIED_FILING_SEPARATELY',
    riskAnswers: [3, 3, 3, 3, 3],
  });
  Object.assign(data.primary, {
    earnedIncome: '30000',
    pia: '0',
    retirementAge: '67',
    healthStatus: 'GOOD',
  });
  Object.assign(data.spouse, {
    firstName: 'Riley',
    lastName: 'Example',
    dob: '1961-07-20',
    earnedIncome: '0',
    pia: '0',
    retirementAge: '67',
    healthStatus: 'GOOD',
  });
  return data;
}

describe('unknown MFS living-together fact', () => {
  it('maps the unasked fact to null and accepts only an explicit adviser override', () => {
    const unknown = mapPlanningInput(mfsIntake(), DEFAULT_ASSUMPTIONS, '2026-01-01');
    const confirmedTogether = mapPlanningInput(mfsIntake(), DEFAULT_ASSUMPTIONS, '2026-01-01', {
      spouseLivedTogetherForMfs: true,
    });
    const confirmedApart = mapPlanningInput(mfsIntake(), DEFAULT_ASSUMPTIONS, '2026-01-01', {
      spouseLivedTogetherForMfs: false,
    });

    expect(unknown.spouseLivedTogetherForMfs).toBeNull();
    expect(unknown.warnings.join(' ')).toContain('not confirmed');
    expect(confirmedTogether.spouseLivedTogetherForMfs).toBe(true);
    expect(confirmedApart.spouseLivedTogetherForMfs).toBe(false);
  });

  it('keeps tax numeric but labels the zero-base Social Security result as a conservative MFS illustration', () => {
    const common = {
      filingStatus: 'MARRIED_FILING_SEPARATELY' as const,
      ordinaryIncome: 30_000,
      socialSecurityAnnual: 40_000,
      ages: [66],
      taxYear: DEFAULT_ASSUMPTIONS.annual.year,
    };
    const unknown = calculateTax({ ...common, separateLivedTogether: null }, DEFAULT_ASSUMPTIONS.annual);
    const together = calculateTax({ ...common, separateLivedTogether: true }, DEFAULT_ASSUMPTIONS.annual);
    const apart = calculateTax({ ...common, separateLivedTogether: false }, DEFAULT_ASSUMPTIONS.annual);

    expect(unknown.mfsSocialSecurityTreatment).toBe('UNKNOWN_CONSERVATIVE_LIVED_TOGETHER');
    expect(unknown.taxableSocialSecurity).toBe(together.taxableSocialSecurity);
    expect(unknown.taxableSocialSecurity).not.toBe(apart.taxableSocialSecurity);
    expect(Number.isFinite(unknown.federalTax)).toBe(true);
    expect(unknown.warnings.join(' ')).toContain('conservative illustration');
  });

  it('uses a labeled conservative IRMAA illustration while leaving the MFS fact unavailable', () => {
    const input = mapPlanningInput(mfsIntake(), DEFAULT_ASSUMPTIONS, '2026-01-01', {
      historicalMagi: { '2024': 120_000 },
    });
    const result = healthcareCostAtYear(input, DEFAULT_ASSUMPTIONS, 2026);
    const person = result.people[0];

    expect(person).toMatchObject({
      coverage: 'MEDICARE',
      magiSource: 'SUPPLIED',
      irmaaMfsLivingTogetherTreatment: 'UNKNOWN_CONSERVATIVE_LIVED_TOGETHER',
    });
    expect(Number.isFinite(person.partBMonthly)).toBe(true);
    expect(Number.isFinite(person.partDMonthly)).toBe(true);
    expect(result.warnings.join(' ')).toContain('applicable IRMAA table is unavailable');
  });
});
