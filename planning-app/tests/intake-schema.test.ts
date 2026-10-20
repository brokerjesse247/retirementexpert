import { describe, expect, it } from 'vitest';
import { emptyIntake, intakeSchema, IntakeData, validateStep } from '../lib/intake/schema';

function completeIntake(): IntakeData {
  const data = structuredClone(emptyIntake) as IntakeData;
  Object.assign(data, {
    firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.com', phone: '555-555-0123',
    dob: '1965-06-15', state: 'CA', maritalStatus: 'SINGLE', filingStatus: 'SINGLE', dependents: '0',
    lifestyle: 'COMFORTABLE', rankedConcerns: ['TAXES', 'HEALTHCARE', 'INFLATION'], riskAnswers: [3, 3, 3, 3, 3], consent: true,
  });
  Object.assign(data.primary, { earnedIncome: '$100,000', pia: '2,400', retirementAge: '65' });
  Object.assign(data.expenses, { currentMonthly: '6,000', retirementMonthly: '5,000', essentialMonthly: '3,500' });
  return data;
}

describe('Phase 1 intake schema', () => {
  it('accepts a complete single-applicant intake and normalizes whole-dollar strings', () => {
    const parsed = intakeSchema.safeParse(completeIntake());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.primary.earnedIncome).toBe('100000');
      expect(parsed.data.primary.pia).toBe('2400');
      expect(parsed.data.expenses.currentMonthly).toBe('6000');
    }
  });

  it('rejects an otherwise complete intake until consent is explicitly checked', () => {
    const data = { ...completeIntake(), consent: false } as unknown as IntakeData;
    const parsed = intakeSchema.safeParse(data);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.path.join('.') === 'consent')).toBe(true);
    expect(validateStep(data, 8).consent).toContain('Consent');
    data.consent = true;
    expect(intakeSchema.safeParse(data).success).toBe(true);
  });

  it('provides current-step required-field errors without surfacing other steps', () => {
    const errors = validateStep(structuredClone(emptyIntake) as IntakeData, 1);
    expect(errors.firstName).toContain('required');
    expect(errors.email).toContain('valid email');
    expect(errors['primary.earnedIncome']).toBeUndefined();
  });

  it('requires complete conditional spouse identity and financial essentials when married', () => {
    const data = completeIntake();
    data.maritalStatus = 'MARRIED';
    data.filingStatus = 'MARRIED_FILING_JOINTLY';
    const parsed = intakeSchema.safeParse(data);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('spouse.firstName');
      expect(paths).toContain('spouse.earnedIncome');
      expect(paths).toContain('spouse.pia');
      expect(paths).toContain('spouse.retirementAge');
    }
  });

  it('enforces essential spending, distinct concerns, and exactly five risk answers', () => {
    const data = completeIntake();
    data.expenses.essentialMonthly = '6000';
    data.rankedConcerns = ['TAXES', 'TAXES', 'INFLATION'];
    data.riskAnswers = [3, 3, 3, 3] as unknown as IntakeData['riskAnswers'];
    const parsed = intakeSchema.safeParse(data);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('expenses.essentialMonthly');
      expect(paths).toContain('rankedConcerns');
      expect(paths).toContain('riskAnswers');
    }
  });

  it('requires allocation percentages to total 100 when the household knows its mix', () => {
    const data = completeIntake();
    data.allocation = { status: 'KNOWN', stocksPercent: '60', bondsPercent: '30', cashPercent: '5' };
    const parsed = intakeSchema.safeParse(data);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.path.join('.') === 'allocation.stocksPercent')).toBe(true);
  });
});
