import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../lib/assumptions/defaults';
import { mapPlanningInput } from '../../lib/calculations/input';
import { calculateNetWorth } from '../../lib/calculations/net-worth';
import { intakeSchema } from '../../lib/intake/schema';
import {
  jamesLindaMitchellFixture,
  sarahThompsonFixture,
  SECTION_14_SAMPLE_AS_OF_DATE,
  section14SampleHouseholdFixtures,
} from '../fixtures/section-14-sample-households';

const ageYears = (ageMonths: number) => Math.floor(ageMonths / 12);

describe('original Section 14.2 sample households', () => {
  it('keeps exactly two synthetic, non-persistent fixture submissions', () => {
    expect(section14SampleHouseholdFixtures).toHaveLength(2);
    expect(section14SampleHouseholdFixtures.map((fixture) => ({
      label: fixture.label,
      source: fixture.source,
      household: fixture.household,
    }))).toEqual([
      { label: 'SYNTHETIC', source: 'TODO.md original Section 14.2', household: 'James & Linda Mitchell' },
      { label: 'SYNTHETIC', source: 'TODO.md original Section 14.2', household: 'Sarah Thompson' },
    ]);
  });

  it('maps James and Linda’s sourced financial facts while retaining unstated inputs as unknown', () => {
    const fixture = jamesLindaMitchellFixture;
    expect(intakeSchema.safeParse(fixture.raw).success).toBe(true);
    expect(mapPlanningInput(
      fixture.raw,
      DEFAULT_ASSUMPTIONS,
      SECTION_14_SAMPLE_AS_OF_DATE,
      fixture.illustrationOverrides,
    )).toEqual(fixture.planningInput);

    const input = fixture.planningInput;
    expect(input.clientName).toBe('James Mitchell & Linda Mitchell');
    expect(input.filingStatus).toBe('MARRIED_FILING_JOINTLY');
    expect(input.persons.map((person) => ({
      role: person.role,
      age: ageYears(person.ageMonths),
      earnedIncomeAnnual: person.earnedIncomeAnnual,
      piaMonthly: person.piaMonthly,
      retirementAgeMonths: person.retirementAgeMonths,
      claimAgeMonths: person.claimAgeMonths,
      annuityQualification: person.annuityQualification,
    }))).toEqual([
      { role: 'PRIMARY', age: 58, earnedIncomeAnnual: 120_000, piaMonthly: 2_900, retirementAgeMonths: 63 * 12, claimAgeMonths: null, annuityQualification: null },
      { role: 'SPOUSE', age: 56, earnedIncomeAnnual: 45_000, piaMonthly: 1_300, retirementAgeMonths: 62 * 12, claimAgeMonths: null, annuityQualification: null },
    ]);
    expect(input).toMatchObject({
      currentMonthlySpending: 7_500,
      retirementMonthlySpending: 6_500,
      essentialMonthlySpending: null,
      allocation: null,
      currentHealthCoverage: null,
      ltcInsured: false,
      riskScore: 15,
      riskProfile: 'MODERATE',
    });
    expect(input.warnings).toEqual(expect.arrayContaining([
      'James Mitchell: claiming age is not selected; the baseline uses full retirement age while comparing alternatives.',
      'Linda Mitchell: claiming age is not selected; the baseline uses full retirement age while comparing alternatives.',
      'Essential spending is unknown; income coverage and complete readiness scoring require that optional analysis input.',
    ]));

    const netWorth = calculateNetWorth(input, DEFAULT_ASSUMPTIONS);
    expect(netWorth).toMatchObject({
      totalInvestable: 865_000,
      taxDeferred: 710_000,
      taxFree: 40_000,
      taxable: 115_000,
      homeEquity: 340_000,
      netWorth: 1_205_000,
      accountBreakdown: {
        taxDeferred: { workplacePretax: 620_000, traditionalIra: 90_000, qualifiedAnnuity: 0, total: 710_000 },
        taxFree: { roth401k: 0, rothIra: 40_000, hsaQualifiedUse: 0, total: 40_000 },
        taxable: { brokerage: 85_000, cash: 30_000, total: 115_000 },
      },
    });
  });

  it('maps Sarah’s sourced financial facts, explicit contribution rates, and unresolved answers without inventing a readiness score', () => {
    const fixture = sarahThompsonFixture;
    expect(intakeSchema.safeParse(fixture.raw).success).toBe(true);
    expect(mapPlanningInput(
      fixture.raw,
      DEFAULT_ASSUMPTIONS,
      SECTION_14_SAMPLE_AS_OF_DATE,
      fixture.illustrationOverrides,
    )).toEqual(fixture.planningInput);

    const input = fixture.planningInput;
    expect(input.persons.map((person) => ({
      age: ageYears(person.ageMonths),
      earnedIncomeAnnual: person.earnedIncomeAnnual,
      piaMonthly: person.piaMonthly,
      retirementAgeMonths: person.retirementAgeMonths,
      employeeContributionRate: person.employeeContributionRate,
      employerMatchRate: person.employerMatchRate,
      claimAgeMonths: person.claimAgeMonths,
      annuityQualification: person.annuityQualification,
    }))).toEqual([
      {
        age: 45,
        earnedIncomeAnnual: 85_000,
        piaMonthly: 2_100,
        retirementAgeMonths: 67 * 12,
        employeeContributionRate: 0.03,
        employerMatchRate: 0.05,
        claimAgeMonths: null,
        annuityQualification: null,
      },
    ]);
    expect(input).toMatchObject({
      currentMonthlySpending: 4_800,
      // This is a documented fixture illustration because Section 14.2 has no retirement-spending value.
      retirementMonthlySpending: 4_800,
      essentialMonthlySpending: null,
      allocation: null,
      currentHealthCoverage: null,
      ltcInsured: null,
      riskScore: 20,
      riskProfile: 'AGGRESSIVE',
    });
    expect(input.warnings).toEqual(expect.arrayContaining([
      'Sarah Thompson: claiming age is not selected; the baseline uses full retirement age while comparing alternatives.',
      'Essential spending is unknown; income coverage and complete readiness scoring require that optional analysis input.',
    ]));

    const netWorth = calculateNetWorth(input, DEFAULT_ASSUMPTIONS);
    expect(netWorth).toMatchObject({
      totalInvestable: 173_000,
      taxDeferred: 140_000,
      taxFree: 25_000,
      taxable: 8_000,
      accountBreakdown: {
        taxDeferred: { workplacePretax: 140_000, traditionalIra: 0, qualifiedAnnuity: 0, total: 140_000 },
        taxFree: { roth401k: 0, rothIra: 25_000, hsaQualifiedUse: 0, total: 25_000 },
        taxable: { brokerage: 0, cash: 8_000, total: 8_000 },
      },
    });
  });
});
