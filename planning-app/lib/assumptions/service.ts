import { db } from '../db';
import { decryptJson, encryptJson } from '../auth/crypto';
import { ApiError } from '../auth/http';
import { snapshotHash } from '../calculations/snapshot';
import type { PlanningAssumptions } from '../calculations/types';
import { DEFAULT_ASSUMPTIONS, validateAssumptions } from './defaults';

const KEY = 'planning-bundle';
export async function loadAssumptions(advisorId: string, year = DEFAULT_ASSUMPTIONS.year): Promise<PlanningAssumptions> {
  const row = await db.assumptionYear.findUnique({where:{advisorId_year_key:{advisorId,year,key:KEY}}});
  if (row) return validateAssumptions(decryptJson<PlanningAssumptions>(row.encryptedValue));
  if (year !== DEFAULT_ASSUMPTIONS.year) throw new ApiError(422, 'No verified rule bundle is configured for that year.');
  return structuredClone(DEFAULT_ASSUMPTIONS);
}

export function setAssumptionScalar(bundle: PlanningAssumptions, path: string, value: number | null): void {
  if (!/^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+){0,8}$/.test(path)) throw new ApiError(422, 'Invalid assumption field.');
  const parts = path.split('.');
  if (parts.some(p=>['__proto__','prototype','constructor','sources','version','year','rmdUniform','rmdJoint'].includes(p))) throw new ApiError(422, 'This assumption field is not editable.');
  let cursor: unknown = bundle;
  for (const part of parts.slice(0,-1)) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) throw new ApiError(422, 'Unknown assumption field.');
    cursor = (cursor as Record<string,unknown>)[part];
  }
  const key = parts.at(-1)!;
  if (!cursor || typeof cursor !== 'object' || !(key in cursor)) throw new ApiError(422, 'Unknown assumption field.');
  const old = (cursor as Record<string,unknown>)[key];
  if (typeof old !== 'number' && old !== null) throw new ApiError(422, 'Only numeric assumptions can be edited here.');
  if (value !== null && !Number.isFinite(value)) throw new ApiError(422, 'Enter a finite assumption value.');
  (cursor as Record<string,unknown>)[key] = value;
}

export async function updateAssumptions(advisorId: string, year: number, expectedVersion: string, edits: Record<string,number|null>): Promise<PlanningAssumptions> {
  if (Object.keys(edits).length > 150) throw new ApiError(422, 'Too many assumption changes in one request.');
  const current = await loadAssumptions(advisorId, year);
  if (current.version !== expectedVersion) throw new ApiError(409, 'Assumptions changed elsewhere. Reload before saving.');
  const candidate = structuredClone(current);
  for (const [path,value] of Object.entries(edits)) setAssumptionScalar(candidate,path,value);
  if (Object.keys(edits).some(p=>p.startsWith('annual.'))) {
    candidate.annual.sources = candidate.annual.sources.map(source => {
      const affected = Object.keys(edits).some(path => path.startsWith(`${source.key}.`) || source.key.startsWith(`${path}.`) || source.key === path);
      return affected ? { ...source, classification: 'PLANNING_ASSUMPTION' as const, note: `Advisor edited this rule; the linked official publication is the original source, not verification of the edited values. ${source.note ?? ''}`.trim() } : source;
    });
    candidate.sources.push({key:'advisor-rule-edits',url:'https://retirementexpert.si',title:'Advisor-edited planning rules (not independently verified)',verifiedAt:new Date().toISOString(),classification:'PLANNING_ASSUMPTION',note:Object.keys(edits).join(', ')});
  }
  let validated: PlanningAssumptions;
  try { validated = validateAssumptions(candidate); }
  catch { throw new ApiError(422, 'The edited assumptions violate a required range, table order or rule constraint. Correct the values and try again.'); }
  validated.version = `${year}-${snapshotHash({...validated,version:''}).slice(0,20)}`;
  const existing = await db.assumptionYear.findUnique({where:{advisorId_year_key:{advisorId,year,key:KEY}}});
  await db.$transaction(async tx=>{
    if (existing) {
      const changed = await tx.assumptionYear.updateMany({where:{id:existing.id,encryptedValue:existing.encryptedValue},data:{encryptedValue:encryptJson(validated),verifiedAt:null}});
      if (!changed.count) throw new ApiError(409,'Assumptions changed elsewhere. Reload before saving.');
    } else {
      await tx.assumptionYear.create({data:{advisorId,year,key:KEY,encryptedValue:encryptJson(validated),sourceUrl:current.annual.sources[0]?.url,verifiedAt:null}});
    }
    await tx.auditLog.create({data:{advisorId,action:'ASSUMPTIONS_UPDATED',entity:'AssumptionYear',entityId:String(year),summary:`Validated ${Object.keys(edits).length} advisor assumption edits.`}});
  });
  return validated;
}
