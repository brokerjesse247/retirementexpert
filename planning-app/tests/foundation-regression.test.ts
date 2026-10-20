import { describe, it, expect } from 'vitest';
import { draftSchema, emptyIntake, intakeSchema, type IntakeData } from '../lib/intake/schema';
import { normalizedIntake } from '../lib/services/normalize';
import { ageFromDob } from '../lib/services/clients';
function fixture(): IntakeData {
  const d = structuredClone(emptyIntake);
  Object.assign(d,{firstName:'Test',lastName:'Fictional',email:'test@example.invalid',phone:'555-555-0110',dob:'1965-06-15',state:'CA',maritalStatus:'SINGLE',filingStatus:'SINGLE',rankedConcerns:['TAXES','HEALTHCARE','INFLATION'],riskAnswers:[3,3,3,3,3],consent:true});
  Object.assign(d.primary,{earnedIncome:'100000',pia:'2400',retirementAge:'65',partTimeIncome:'12000',pensionMonthly:'1000',pensionCola:'YES',preTax401k:'100000',brokerage:'20000',employeeContributionPercent:'10',employerMatchPercent:'5'});
  Object.assign(d.expenses,{currentMonthly:'6000',retirementMonthly:'5000',essentialMonthly:'3500'});
  return intakeSchema.parse(d);
}
describe('Foundation integration regressions',()=>{
  it('saves unfinished known-shape drafts, not only complete steps',()=>{
    const d=structuredClone(emptyIntake);d.firstName='A';d.email='unfinished@';
    expect(draftSchema.safeParse(d).success).toBe(true);
    expect(draftSchema.safeParse({...d,ssn:'not permitted'}).success).toBe(false);
  });
  it('uses root primary identity and stores exact annual part-time units',()=>{
    const d=fixture();const n=normalizedIntake(d);
    const people=(n.persons as any).create;
    expect(people[0].firstName).toBe('Test');expect(people[0].dob.toISOString()).toContain('1965-06-15');
    expect(ageFromDob(people[0].dob)).toBeGreaterThan(18);
    const incomes=(n.incomeStreams as any).create;
    expect(incomes.find((i:any)=>i.type==='PART_TIME')).toMatchObject({annualCents:1200000n,monthlyCents:null});
    expect(incomes.find((i:any)=>i.type==='PENSION')).toMatchObject({isColaLinked:true});
    expect(incomes.find((i:any)=>i.type==='PENSION').colaPct).toBeUndefined();
    expect(people[0].employeeContributionPct).toBe('10');
    expect((n.accounts as any).create.find((a:any)=>a.type==='BROKERAGE').employerMatchPct).toBeNull();
  });
  it('does not normalize stale spouse data for a non-married client',()=>{
    const d=fixture();d.spouse.firstName='Stale';d.spouse.brokerage='999999';
    const n=normalizedIntake(d);expect((n.persons as any).create).toHaveLength(1);expect((n.accounts as any).create).toHaveLength(2);
  });
  it('rejects fractional retirement ages and preserves fractional interest rates',()=>{
    const d=fixture();d.primary.retirementAge='65.5';expect(intakeSchema.safeParse(d).success).toBe(false);
    d.primary.retirementAge='65';d.debts=[{name:'Test',balance:'100',rate:'6.5',monthlyPayment:'5'}];expect(intakeSchema.safeParse(d).success).toBe(true);
  });
});
