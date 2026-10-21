export type UnknownRecord = Record<string, unknown>;

export type FieldSpec = {
  path: string;
  label: string;
  unit: string;
  factor?: number;
  nullable?: boolean;
  help?: string;
  readOnly?: boolean;
  readOnlyValue?: string;
};

export type AnnualEditorSection = {
  id: string;
  title: string;
  fields: FieldSpec[];
};

const FILING_STATUSES = [
  'SINGLE',
  'MARRIED_FILING_JOINTLY',
  'MARRIED_FILING_SEPARATELY',
  'HEAD_OF_HOUSEHOLD',
] as const;

const FILING_STATUS_LABEL: Record<(typeof FILING_STATUSES)[number], string> = {
  SINGLE: 'Single',
  MARRIED_FILING_JOINTLY: 'Married filing jointly',
  MARRIED_FILING_SEPARATELY: 'Married filing separately',
  HEAD_OF_HOUSEHOLD: 'Head of household',
};

const PROTECTED_PATH_PARTS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'sources',
  'version',
  'year',
  'rmdUniform',
  'rmdJoint',
]);

const UNSAFE_TRAVERSAL_PARTS = new Set(['__proto__', 'constructor', 'prototype']);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Reads a dotted object/array path without permitting prototype traversal.
 * Array elements use their real numeric indices (for example, "irmaaSingle.2.partBMonthly").
 */
export function safeGet(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split('.')) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(part)) return undefined;
      const index = Number(part);
      if (!Number.isSafeInteger(index) || !(index in current)) return undefined;
      current = current[index];
      continue;
    }
    if (!isRecord(current) || UNSAFE_TRAVERSAL_PARTS.has(part) || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

export function isProtectedAssumptionPath(path: string): boolean {
  return path.split('.').some((part) => PROTECTED_PATH_PARTS.has(part));
}

export function displayEditorValue(assumptions: UnknownRecord, spec: FieldSpec): string {
  if (spec.readOnly) return spec.readOnlyValue ?? '';
  const raw = safeGet(assumptions, spec.path);
  if (raw === null) return '';
  return isFiniteNumber(raw) ? String(raw * (spec.factor ?? 1)) : '';
}

/** Builds PATCH edits only for known numeric scalar fields. Null planning values can be populated when explicitly nullable. */
export function numericEdits(
  assumptions: UnknownRecord,
  draft: Record<string, string>,
  specs: FieldSpec[],
): Record<string, number | null> {
  const edits: Record<string, number | null> = {};
  for (const spec of specs) {
    if (spec.readOnly || isProtectedAssumptionPath(spec.path)) continue;
    const raw = draft[spec.path] ?? displayEditorValue(assumptions, spec);
    const original = safeGet(assumptions, spec.path);
    if (!raw.trim()) {
      if (spec.nullable && original !== null) edits[spec.path] = null;
      else if (!spec.nullable && original !== null) throw new Error(`${spec.label} cannot be blank.`);
      continue;
    }
    const entered = Number(raw);
    if (!Number.isFinite(entered)) throw new Error(`${spec.label} must be a finite number.`);
    const value = entered / (spec.factor ?? 1);
    if (!isFiniteNumber(original) && !(original === null && spec.nullable)) {
      throw new Error(`${spec.label} is not a numeric assumption.`);
    }
    if (value !== original) edits[spec.path] = value;
  }
  return edits;
}

function numericField(assumptions: UnknownRecord, spec: FieldSpec): FieldSpec | null {
  return isFiniteNumber(safeGet(assumptions, spec.path)) && !isProtectedAssumptionPath(spec.path) ? spec : null;
}

function addNumeric(section: AnnualEditorSection, assumptions: UnknownRecord, spec: FieldSpec): void {
  const field = numericField(assumptions, spec);
  if (field) section.fields.push(field);
}

function annualSection(id: string, title: string): AnnualEditorSection {
  return { id, title, fields: [] };
}

function statusLabel(status: (typeof FILING_STATUSES)[number]): string {
  return FILING_STATUS_LABEL[status];
}

/**
 * Enumerates only fields that actually exist in the supplied annual bundle. This deliberately
 * avoids speculative paths while exposing numeric scalars nested in tax-bracket and IRMAA arrays.
 */
export function annualEditorSections(assumptions: UnknownRecord): AnnualEditorSection[] {
  const sections: AnnualEditorSection[] = [];

  for (const status of FILING_STATUSES) {
    const brackets = safeGet(assumptions, `annual.taxBrackets.${status}`);
    if (!Array.isArray(brackets)) continue;
    const section = annualSection(`tax-brackets-${status}`, `Income-tax brackets — ${statusLabel(status)}`);
    brackets.forEach((bracket, index) => {
      const path = `annual.taxBrackets.${status}.${index}.upTo`;
      const upTo = safeGet(assumptions, path);
      if (upTo === null && index === brackets.length - 1) {
        section.fields.push({
          path,
          label: `Bracket ${index + 1} taxable-income ceiling`,
          unit: 'USD taxable income',
          readOnly: true,
          readOnlyValue: 'No upper limit (∞)',
          help: 'The final tax bracket has a fixed unlimited ceiling.',
        });
      } else {
        addNumeric(section, assumptions, { path, label: `Bracket ${index + 1} taxable-income ceiling`, unit: 'USD taxable income' });
      }
      addNumeric(section, assumptions, {
        path: `annual.taxBrackets.${status}.${index}.rate`,
        label: `Bracket ${index + 1} marginal rate`,
        unit: 'percent',
        factor: 100,
      });
    });
    if (section.fields.length) sections.push(section);
  }

  for (const status of FILING_STATUSES) {
    const section = annualSection(`deductions-${status}`, `Deductions and capital gains — ${statusLabel(status)}`);
    addNumeric(section, assumptions, { path: `annual.standardDeduction.${status}`, label: 'Standard deduction', unit: 'USD' });
    addNumeric(section, assumptions, { path: `annual.additionalDeduction65.${status}`, label: 'Additional deduction, age 65+', unit: 'USD' });
    addNumeric(section, assumptions, { path: `annual.capitalGainsThresholds.${status}.zero`, label: '0% capital-gains ceiling', unit: 'USD taxable income' });
    addNumeric(section, assumptions, { path: `annual.capitalGainsThresholds.${status}.fifteen`, label: '15% capital-gains ceiling', unit: 'USD taxable income' });
    if (section.fields.length) sections.push(section);
  }

  const senior = annualSection('senior-deduction', 'Senior deduction');
  addNumeric(senior, assumptions, { path: 'annual.seniorDeduction.amount', label: 'Deduction amount', unit: 'USD' });
  for (const status of FILING_STATUSES) {
    addNumeric(senior, assumptions, { path: `annual.seniorDeduction.phaseoutStart.${status}`, label: `Phaseout starts — ${statusLabel(status)}`, unit: 'USD MAGI' });
  }
  addNumeric(senior, assumptions, { path: 'annual.seniorDeduction.phaseoutRate', label: 'Phaseout rate', unit: 'percent', factor: 100 });
  addNumeric(senior, assumptions, { path: 'annual.seniorDeduction.endYear', label: 'Deduction end year', unit: 'tax year' });
  if (senior.fields.length) sections.push(senior);

  const contributions = annualSection('contribution-limits', 'Contribution limits');
  const contributionFields: Array<[string, string]> = [
    ['workplace', 'Workplace plan contribution'],
    ['workplaceCatchup50', 'Workplace catch-up, age 50+'],
    ['workplaceCatchup60to63', 'Workplace catch-up, ages 60–63'],
    ['ira', 'IRA contribution'],
    ['iraCatchup50', 'IRA catch-up, age 50+'],
    ['hsaSelf', 'HSA contribution, self-only'],
    ['hsaFamily', 'HSA contribution, family'],
    ['hsaCatchup55', 'HSA catch-up, age 55+'],
  ];
  contributionFields.forEach(([key, label]) => addNumeric(contributions, assumptions, { path: `annual.contributions.${key}`, label, unit: 'USD' }));
  if (contributions.fields.length) sections.push(contributions);

  const socialSecurity = annualSection('social-security', 'Social Security limits');
  addNumeric(socialSecurity, assumptions, { path: 'annual.socialSecurity.earningsUnderFra', label: 'Earnings limit before full retirement age', unit: 'USD annual earnings' });
  addNumeric(socialSecurity, assumptions, { path: 'annual.socialSecurity.earningsFraYear', label: 'Earnings limit in full-retirement-age year', unit: 'USD annual earnings' });
  addNumeric(socialSecurity, assumptions, { path: 'annual.socialSecurity.taxableMaximum', label: 'Taxable earnings maximum', unit: 'USD annual earnings' });
  addNumeric(socialSecurity, assumptions, { path: 'annual.socialSecurity.cola', label: 'Official COLA', unit: 'percent', factor: 100 });
  if (socialSecurity.fields.length) sections.push(socialSecurity);

  for (const status of FILING_STATUSES) {
    const section = annualSection(`social-security-tax-${status}`, `Taxable Social Security thresholds — ${statusLabel(status)}`);
    addNumeric(section, assumptions, { path: `annual.socialSecurity.taxThresholds.${status}.base1`, label: 'First provisional-income threshold', unit: 'USD provisional income' });
    addNumeric(section, assumptions, { path: `annual.socialSecurity.taxThresholds.${status}.base2`, label: 'Second provisional-income threshold', unit: 'USD provisional income' });
    addNumeric(section, assumptions, { path: `annual.socialSecurity.taxThresholds.${status}.cap`, label: 'Maximum taxable-benefit amount', unit: 'USD' });
    if (section.fields.length) sections.push(section);
  }

  const medicareBase = annualSection('medicare-base', 'Medicare base premiums');
  addNumeric(medicareBase, assumptions, { path: 'annual.medicare.partBStandard', label: 'Part B standard premium', unit: 'USD per month' });
  addNumeric(medicareBase, assumptions, { path: 'annual.medicare.partDDeductible', label: 'Part D deductible', unit: 'USD per year' });
  if (medicareBase.fields.length) sections.push(medicareBase);

  const irmaaSchedules: Array<[string, string]> = [
    ['irmaaSingle', 'Single'],
    ['irmaaJoint', 'Married filing jointly'],
    ['irmaaSeparate', 'Married filing separately / lived together'],
  ];
  for (const [schedule, label] of irmaaSchedules) {
    const tiers = safeGet(assumptions, `annual.medicare.${schedule}`);
    if (!Array.isArray(tiers)) continue;
    const section = annualSection(`irmaa-${schedule}`, `Medicare IRMAA tiers — ${label}`);
    tiers.forEach((tier, index) => {
      const path = `annual.medicare.${schedule}.${index}.upTo`;
      const upTo = safeGet(assumptions, path);
      if (upTo === null && index === tiers.length - 1) {
        section.fields.push({
          path,
          label: `Tier ${index + 1} MAGI ceiling`,
          unit: 'USD MAGI',
          readOnly: true,
          readOnlyValue: 'No upper limit (∞)',
          help: 'The final IRMAA tier has a fixed unlimited ceiling.',
        });
      } else {
        addNumeric(section, assumptions, { path, label: `Tier ${index + 1} MAGI ceiling`, unit: 'USD MAGI' });
      }
      addNumeric(section, assumptions, { path: `annual.medicare.${schedule}.${index}.partBMonthly`, label: `Tier ${index + 1} Part B premium`, unit: 'USD per month' });
      addNumeric(section, assumptions, { path: `annual.medicare.${schedule}.${index}.partDMonthly`, label: `Tier ${index + 1} Part D premium`, unit: 'USD per month' });
    });
    if (section.fields.length) sections.push(section);
  }

  const estate = annualSection('estate-charitable', 'Estate, gift, and charitable limits');
  addNumeric(estate, assumptions, { path: 'annual.estateExemption', label: 'Federal estate-tax exemption', unit: 'USD' });
  addNumeric(estate, assumptions, { path: 'annual.giftExclusion', label: 'Annual gift-tax exclusion', unit: 'USD per recipient' });
  addNumeric(estate, assumptions, { path: 'annual.qcdLimit', label: 'Qualified charitable distribution limit', unit: 'USD per year' });
  if (estate.fields.length) sections.push(estate);

  return sections;
}
