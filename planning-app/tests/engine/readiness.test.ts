import { describe, expect, it } from 'vitest';
import { calculateReadiness, READINESS_COMPONENT_WEIGHTS } from '../../lib/calculations/readiness';

const completeArgs = {
  monteCarloSuccess: 90,
  incomeCoverageRatio: 0.75,
  taxDiversificationScore: 80,
  emergencyFundMonths: 3,
  insuranceProtectionScore: 60,
  estateDocsScore: 100,
};

describe('calculateReadiness', () => {
  it('uses the mandated weights and exposes a cent-rounded derivation', () => {
    const result = calculateReadiness(completeArgs);

    expect(result.status).toBe('COMPLETE');
    expect(result.warnings).toEqual([]);
    expect(result.score).toBe(79);
    expect(result.label).toBe('Good');
    expect(result.componentWeights).toEqual({
      monteCarlo: 40,
      incomeCoverage: 20,
      taxDiversification: 15,
      emergencyFund: 10,
      insuranceProtection: 10,
      estateDocs: 5,
    });
    expect(READINESS_COMPONENT_WEIGHTS).toEqual(result.componentWeights);
    expect(result.components).toEqual({
      monteCarlo: 90,
      incomeCoverage: 75,
      taxDiversification: 80,
      emergencyFund: 50,
      insuranceProtection: 60,
      estateDocs: 100,
    });
    expect(result.scoreDerivation).toEqual({
      formula: 'WEIGHTED_NORMALIZED_COMPONENTS',
      contributions: {
        monteCarlo: 36,
        incomeCoverage: 15,
        taxDiversification: 12,
        emergencyFund: 5,
        insuranceProtection: 6,
        estateDocs: 5,
      },
      total: 79,
    });
  });

  it('normalizes emergency reserves by the explicit six-month heuristic', () => {
    const twoMonths = calculateReadiness({ ...completeArgs, emergencyFundMonths: 2 });
    const sixMonths = calculateReadiness({ ...completeArgs, emergencyFundMonths: 6 });
    const moreThanSixMonths = calculateReadiness({ ...completeArgs, emergencyFundMonths: 24 });

    expect(twoMonths.components.emergencyFund).toBe(33.33);
    expect(twoMonths.scoreDerivation.contributions.emergencyFund).toBe(3.33);
    expect(sixMonths.components.emergencyFund).toBe(100);
    expect(moreThanSixMonths.components.emergencyFund).toBe(100);
    expect(moreThanSixMonths.scoreDerivation.contributions.emergencyFund).toBe(10);
  });

  it('bounds supplied components and the resulting headline to the 0–100 range', () => {
    const result = calculateReadiness({
      monteCarloSuccess: 150,
      incomeCoverageRatio: 1.5,
      taxDiversificationScore: -50,
      emergencyFundMonths: 12,
      insuranceProtectionScore: 200,
      estateDocsScore: -25,
    });

    expect(result.components).toEqual({
      monteCarlo: 100,
      incomeCoverage: 100,
      taxDiversification: 0,
      emergencyFund: 100,
      insuranceProtection: 100,
      estateDocs: 0,
    });
    expect(result.score).toBe(80);
    expect(result.label).toBe('Good');
  });

  it.each([
    ['essential-spending income coverage ratio', { incomeCoverageRatio: null }],
    ['emergency-fund months', { emergencyFundMonths: null }],
    ['insurance protection score', { insuranceProtectionScore: null }],
    ['estate documents score', { estateDocsScore: null }],
  ] as const)('withholds the headline when %s is unavailable', (missingDescription, missingValue) => {
    const result = calculateReadiness({ ...completeArgs, ...missingValue });

    expect(result.status).toBe('PARTIAL');
    expect(result.score).toBeNull();
    expect(result.label).toBe('Incomplete');
    expect(result.scoreDerivation.total).toBeNull();
    expect(result.warnings).toContain(`Readiness headline unavailable: ${missingDescription} is missing or invalid.`);
  });

  it('applies the required headline thresholds after calculation rounding', () => {
    expect(calculateReadiness({
      monteCarloSuccess: 85,
      incomeCoverageRatio: 0.85,
      taxDiversificationScore: 85,
      emergencyFundMonths: 5.1,
      insuranceProtectionScore: 85,
      estateDocsScore: 85,
    }).label).toBe('Excellent');
    expect(calculateReadiness({
      monteCarloSuccess: 70,
      incomeCoverageRatio: 0.7,
      taxDiversificationScore: 70,
      emergencyFundMonths: 4.2,
      insuranceProtectionScore: 70,
      estateDocsScore: 70,
    }).label).toBe('Good');
    expect(calculateReadiness({
      monteCarloSuccess: 55,
      incomeCoverageRatio: 0.55,
      taxDiversificationScore: 55,
      emergencyFundMonths: 3.3,
      insuranceProtectionScore: 55,
      estateDocsScore: 55,
    }).label).toBe('Needs Attention');
    expect(calculateReadiness({
      monteCarloSuccess: 54.4,
      incomeCoverageRatio: 0.544,
      taxDiversificationScore: 54.4,
      emergencyFundMonths: 3.264,
      insuranceProtectionScore: 54.4,
      estateDocsScore: 54.4,
    }).label).toBe('At Risk');
  });
});
