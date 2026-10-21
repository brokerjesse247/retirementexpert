import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../lib/assumptions/defaults';
import {
  annualEditorSections,
  displayEditorValue,
  isProtectedAssumptionPath,
  numericEdits,
  safeGet,
  type FieldSpec,
  type UnknownRecord,
} from '../lib/assumptions/editor-fields';

function bundle(): UnknownRecord {
  return structuredClone(DEFAULT_ASSUMPTIONS) as unknown as UnknownRecord;
}

function annualFields(assumptions: UnknownRecord): FieldSpec[] {
  return annualEditorSections(assumptions).flatMap((section) => section.fields);
}

describe('annual assumptions editor fields', () => {
  it('round-trips tax-bracket and IRMAA values through exact array-index paths', () => {
    const assumptions = bundle();
    const fields = annualFields(assumptions);
    const taxRate = fields.find((field) => field.path === 'annual.taxBrackets.SINGLE.0.rate');
    const irmaaPremium = fields.find((field) => field.path === 'annual.medicare.irmaaSingle.1.partBMonthly');

    expect(safeGet(assumptions, 'annual.taxBrackets.SINGLE.0.rate')).toBe(0.1);
    expect(safeGet(assumptions, 'annual.medicare.irmaaSingle.1.partBMonthly')).toBe(284.1);
    expect(taxRate).toBeDefined();
    expect(irmaaPremium).toBeDefined();
    expect(displayEditorValue(assumptions, taxRate!)).toBe('10');
    expect(displayEditorValue(assumptions, irmaaPremium!)).toBe('284.1');
    expect(numericEdits(assumptions, {
      [taxRate!.path]: '12',
      [irmaaPremium!.path]: '300',
    }, [taxRate!, irmaaPremium!])).toEqual({
      'annual.taxBrackets.SINGLE.0.rate': 0.12,
      'annual.medicare.irmaaSingle.1.partBMonthly': 300,
    });
  });

  it('marks known rate paths as percentages instead of inferring a unit from their values', () => {
    const fields = annualFields(bundle());
    const taxRate = fields.find((field) => field.path === 'annual.taxBrackets.MARRIED_FILING_JOINTLY.0.rate');
    const seniorRate = fields.find((field) => field.path === 'annual.seniorDeduction.phaseoutRate');
    const cola = fields.find((field) => field.path === 'annual.socialSecurity.cola');

    expect(taxRate).toMatchObject({ unit: 'percent', factor: 100 });
    expect(seniorRate).toMatchObject({ unit: 'percent', factor: 100 });
    expect(cola).toMatchObject({ unit: 'percent', factor: 100 });
  });

  it('shows final unlimited ceilings as read-only and excludes protected annual paths', () => {
    const fields = annualFields(bundle());
    const finalTaxCeiling = fields.find((field) => field.path === 'annual.taxBrackets.SINGLE.6.upTo');
    const finalIrmaaCeiling = fields.find((field) => field.path === 'annual.medicare.irmaaSingle.5.upTo');

    expect(finalTaxCeiling).toMatchObject({ readOnly: true, readOnlyValue: 'No upper limit (∞)' });
    expect(finalIrmaaCeiling).toMatchObject({ readOnly: true, readOnlyValue: 'No upper limit (∞)' });
    expect(fields.some((field) => isProtectedAssumptionPath(field.path))).toBe(false);
    expect(fields.map((field) => field.path)).not.toContain('annual.year');
    expect(fields.some((field) => field.path.includes('rmdUniform') || field.path.includes('sources'))).toBe(false);
  });

  it('allows a nullable numeric planning field to be populated from its null state', () => {
    const assumptions = bundle();
    const stateTaxRate: FieldSpec = { path: 'stateTaxRate', label: 'State tax rate', unit: 'percent', factor: 100, nullable: true };

    expect(numericEdits(assumptions, { stateTaxRate: '5' }, [stateTaxRate])).toEqual({ stateTaxRate: 0.05 });
  });
});
