import { describe, expect, it } from 'vitest';
import type { ReportRenderInput } from '../lib/calculations/types';
import { REPORT_SECTION_OPTIONS, renderReportHtml, summarizeReportWarnings } from '../lib/reports/render';

function fixture(overrides: Partial<ReportRenderInput> = {}): ReportRenderInput {
  const input = {
    clientName: 'Test Client', generatedAt: '2026-10-20', version: 3, scenarioName: 'Base plan', checksum: 'abc123', sections: [], coverNote: 'Review this plan together.',
    branding: { advisorName: 'Jesse Advisor', advisorEmail: 'jesse@example.invalid', advisorPhone: '555-0100', licenseNumbers: 'LIC-42', logoDataUrl: null, coverText: '', disclosure: '', letter: 'Approved advisor letter.', letterApproved: true },
    approvedRecommendations: [],
    input: {
      asOfDate: '2026-10-20', clientName: 'Test Client', filingStatus: 'MARRIED_FILING_JOINTLY', maritalStatus: 'MARRIED', state: 'CA',
      persons: [{ role: 'PRIMARY', name: 'Test Client', dob: '1960-01-01', ageMonths: 789, retirementAgeMonths: 804, planningAge: 95, earnedIncomeAnnual: 120000, employeeContributionRate: .1, employerMatchRate: .04, combinedIraContributionAnnual: 0, iraContributionDestination: null, piaMonthly: 2400, claimAgeMonths: null, alreadyReceiving: false, currentBenefitMonthly: null, benefitStartAgeMonths: null, pensionMonthly: 0, pensionStartAgeMonths: null, pensionSurvivorRate: null, pensionCola: null, annuityMonthly: 0, annuityStartAgeMonths: null, annuityQualification: null, rentalOtherMonthly: 0, rentalEndAgeMonths: null, partTimeAnnual: 0, partTimeEndAgeMonths: null, healthStatus: 'GOOD', lifeInsuranceDeathBenefit: 0, lifeInsuranceType: null, governmentNoncoveredPension: false }, { role: 'SPOUSE', name: 'Spouse Client', dob: '1962-01-01', ageMonths: 765, retirementAgeMonths: 804, planningAge: 95, earnedIncomeAnnual: 80000, employeeContributionRate: .1, employerMatchRate: .04, combinedIraContributionAnnual: 0, iraContributionDestination: null, piaMonthly: 1800, claimAgeMonths: null, alreadyReceiving: false, currentBenefitMonthly: null, benefitStartAgeMonths: null, pensionMonthly: 0, pensionStartAgeMonths: null, pensionSurvivorRate: null, pensionCola: null, annuityMonthly: 0, annuityStartAgeMonths: null, annuityQualification: null, rentalOtherMonthly: 0, rentalEndAgeMonths: null, partTimeAnnual: 0, partTimeEndAgeMonths: null, healthStatus: 'GOOD', lifeInsuranceDeathBenefit: 0, lifeInsuranceType: null, governmentNoncoveredPension: false }],
      accounts: [{ owner: 'PRIMARY', type: 'K401_PRETAX', balance: 123456.789, costBasis: null, annuityQualification: null, hsaQualified: null }],
      currentMonthlySpending: 5000, retirementMonthlySpending: 4200, essentialMonthlySpending: 3200, discretionaryMonthlySpending: 1000, healthcareIncludedInSpending: false, homeValue: 600000, mortgageBalance: 200000, mortgageMonthlyPayment: 1500, mortgagePayoffYear: null, debts: [], goals: [], riskProfile: 'MODERATE', riskScore: 15, allocation: { stocks: 60, bonds: 35, cash: 5 }, familyLongevity: null, currentHealthCoverage: null, ltcInsured: null, ltcDailyBenefit: null, disabilityInsured: null, legacyGoal: 100000, annualCharity: 0, dependents: 0, dependentsSpecialNeeds: false, estate: { will: { status: 'YES', updatedYear: 2025 }, livingTrust: { status: 'NO', updatedYear: null }, financialPoa: { status: 'UNSURE', updatedYear: null }, healthcareDirective: { status: 'YES', updatedYear: 2025 }, updatedBeneficiaries: { status: 'YES', updatedYear: 2025 } }, historicalMagi: {}, spouseLivedTogetherForMfs: false, warnings: [],
    },
    assumptions: {
      year: 2026, version: '2026.1', annual: { year: 2026, taxBrackets: {} as any, standardDeduction: {} as any, additionalDeduction65: {} as any, seniorDeduction: { amount: 0, phaseoutStart: {} as any, phaseoutRate: 0, endYear: 2028, eligibleFilingStatuses: [] }, capitalGainsThresholds: {} as any, contributions: { workplace: 24500, workplaceCatchup50: 8000, workplaceCatchup60to63: 11250, ira: 7500, iraCatchup50: 1100, hsaSelf: 0, hsaFamily: 0, hsaCatchup55: 0 }, socialSecurity: { earningsUnderFra: 0, earningsFraYear: 0, taxableMaximum: 0, cola: .025, taxThresholds: {} as any }, medicare: { partBStandard: 0, irmaaSingle: [], irmaaJoint: [], irmaaSeparate: [] }, rmdUniform: {}, estateExemption: 0, giftExclusion: 0, qcdLimit: 0, sources: [] }, inflation: .025, healthcareInflation: .05, socialSecurityCola: .025, returnByRisk: { CONSERVATIVE: .05, MODERATE: .065, AGGRESSIVE: .075 }, volatilityByRisk: { CONSERVATIVE: .07, MODERATE: .11, AGGRESSIVE: .15 }, planningAgeDefault: 95, planningAgeExcellentLongevity: 100, planningAgePoorHealth: 90, monteCarloRuns: 5000, monteCarloSeed: 42, monteCarloTarget: .85, preMedicareMonthly: 900, supplementalMedicareMonthly: 250, medicalOutOfPocketAnnual: 2500, ltcMonthly: 9000, ltcYears: 3, ltcEventAge: 85, stateTaxRate: null, stateEstateThreshold: null, taxBracketInflation: .025, futureRulePolicy: 'PROJECT_CURRENT_RULES', targetTaxBracket: .22, heirsTaxRate: .24, realDiscountRate: .03, targetEquity: { CONSERVATIVE: .35, MODERATE: .55, AGGRESSIVE: .75 }, finalExpenses: 15000, survivorSpendingPercent: .75, incomeReplacementYears: 10, sources: [],
    },
    results: { readiness: { score: null, components: {} }, netWorth: { totalInvestable: 123456.789, taxDeferred: 123456.789, taxFree: 0, taxable: 0, netWorth: 523456.789, emergencyFundMonths: 2.5, taxDiversificationScore: 55 }, monteCarlo: { successPercent: 87.5, medianEnding: 987654.321, p10Ending: 100000, p90Ending: 1800000, runs: 5000, seed: 42, fanChart: [{ year: 2027, p10: 100000, median: 200000, p90: 300000 }] } },
  } as unknown as ReportRenderInput;
  return { ...input, ...overrides };
}

describe('retirement report renderer', () => {
  it('uses the full 22-page default selection with exact page numbering and disclaimer footer', () => {
    const html = renderReportHtml(fixture());
    expect((html.match(/data-section=/g) ?? [])).toHaveLength(22);
    expect(html).toContain('Page 1 of 22');
    expect(html).toContain('Page 22 of 22');
    expect((html.match(/This report is for educational and illustrative purposes only\. Projections are hypothetical and are not guarantees\./g) ?? []).length).toBe(22);
  });

  it('escapes client, advisor, note, recommendation, and saved-result text', () => {
    const report = fixture({
      coverNote: '<img src=x onerror=alert(1)>',
      branding: { ...fixture().branding, advisorName: 'Jesse & <Partner>', letter: '<b>not markup</b>', letterApproved: true },
      approvedRecommendations: [{ title: '<bad title>', body: '<script>unsafe</script>', priority: 'HIGH', owner: 'Client', targetDate: '2026-12-01' }],
    });
    report.input.persons[0].name = '<script>alert(1)</script>';
    const html = renderReportHtml(report);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Jesse &amp; &lt;Partner&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;bad title&gt;');
    expect(html).toContain('&lt;b&gt;not markup&lt;/b&gt;');
  });

  it('preserves blue branding, reports supplied values with cent rounding, and does not invent readiness', () => {
    const html = renderReportHtml(fixture());
    expect(html).toContain('#168CFF');
    expect(html).toContain('#47B5FF');
    expect(html).not.toContain('#C9A84C');
    expect(html).toContain('$123,456.79');
    expect(html).toContain('$987,654.32');
    expect(html).toContain('Readiness score<br>not available');
  });

  it('takes the cover client title from the saved planning-input people snapshot', () => {
    const input = fixture({ clientName: 'Outer record name' });
    input.input.persons[0].name = 'Saved Primary';
    input.input.persons[1].name = 'Saved Spouse';
    const html = renderReportHtml(input);
    expect(html).toContain('Retirement Plan for<br>Saved Primary &amp; Saved Spouse');
    expect(html).not.toContain('Retirement Plan for<br>Outer record name');
  });

  it('provides options, handles an empty approved list, and embeds no external resources', () => {
    const html = renderReportHtml(fixture({ sections: ['net-worth', 'action-plan'] }));
    expect(REPORT_SECTION_OPTIONS.map((item) => item.id)).toContain('net-worth');
    expect(html).toContain('No recommendations have been approved.');
    expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//i);
    expect(html).not.toMatch(/<link\b/i);
    expect((html.match(/data-section=/g) ?? [])).toHaveLength(3);
  });

  it('never interprets percentage-point success probabilities as fractions', () => {
    const report = fixture();
    report.results.monteCarlo = { successPercent: 0.5, fanChart: [] };
    report.results.cashFlow = { incomeCoverageRatio: 1.5, rows: [] };
    const html = renderReportHtml(report);
    expect(html).toContain('0.5%');
    expect(html).toContain('150.0%');
    expect(html).not.toMatch(/>50\.0%</);
  });

  it('retains all original annual warnings behind visible year-range summaries', () => {
    const warnings = [2027, 2028, 2029].map(year => `${year} healthcare costs are planning projections indexed from 2026 at the healthcare-inflation assumption; they are not official future Medicare premiums.`);
    warnings.push('A unique required-input warning.');
    const summaries = summarizeReportWarnings(warnings);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].message).toContain('2027–2029');
    expect(summaries.flatMap(item => item.sourceWarnings).sort()).toEqual([...warnings].sort());
  });

  it('preserves each shortfall dollar amount and missing-earnings year without repeated boilerplate', () => {
    const warnings = ['2035: cash-flow shortfall of $38315.38 is explicit; assets were not allowed to become negative.', '2036: cash-flow shortfall of $39770.23 is explicit; assets were not allowed to become negative.', 'Person: earnings-test withholding is not modeled for 2027; only annual SSA rules for 2026 were supplied.', 'Person: earnings-test withholding is not modeled for 2028; only annual SSA rules for 2026 were supplied.'];
    const summaries = summarizeReportWarnings(warnings);
    expect(summaries).toHaveLength(2);
    expect(summaries.map(item => item.message).join(' ')).toContain('2035: $38315.38; 2036: $39770.23');
    expect(summaries.map(item => item.message).join(' ')).toContain('2027–2028');
    expect(summaries.flatMap(item => item.sourceWarnings).sort()).toEqual([...warnings].sort());
  });
});
