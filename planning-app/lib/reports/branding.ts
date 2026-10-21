import { z } from 'zod';
import { db } from '../db';
import { decryptJson, encryptJson } from '../auth/crypto';
import { ApiError } from '../auth/http';
import type { ReportBranding } from '../calculations/types';

export const REQUIRED_DISCLOSURE='This report is for educational and illustrative purposes only. It is based on information you provided and on assumptions that may not occur. Projections are hypothetical, are not guarantees, and do not reflect actual investment results. LSRT Insurance does not provide tax or legal advice; consult a qualified tax professional or attorney. Insurance product guarantees are subject to the claims-paying ability of the issuing company.';
export const brandingSettingsSchema=z.object({coverText:z.string().trim().min(1).max(300),letter:z.string().trim().min(30).max(5000),additionalDisclosure:z.string().max(1500).default(''),logoDataUrl:z.string().max(110000).nullable().optional()}).strict();
export type BrandingSettings=z.infer<typeof brandingSettingsSchema>;
export const DEFAULT_BRANDING:BrandingSettings={coverText:'Your Retirement, Expertly Planned',letter:'Thank you for sharing your retirement goals. This report organizes your information, assumptions and planning choices so we can review them together. Please check the inputs carefully. The projections are hypothetical and do not guarantee investment performance or that your money will last. Before taking action, we will review the alternatives and coordinate tax and legal questions with qualified professionals.',additionalDisclosure:'',logoDataUrl:null};
function settingsObject(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function retentionEntries(value:unknown):Record<string,unknown>{return Object.fromEntries(Object.entries(settingsObject(value)).filter(([key])=>key.startsWith('retention-')));}
function brandingEntries(value:unknown):Record<string,unknown>{return Object.fromEntries(Object.entries(settingsObject(value)).filter(([key])=>!key.startsWith('retention-')));}
export async function loadBrandingSettings(advisorId:string):Promise<BrandingSettings>{const advisor=await db.advisor.findUniqueOrThrow({where:{id:advisorId},select:{reportSettingsEncrypted:true}});return advisor.reportSettingsEncrypted?brandingSettingsSchema.parse({...structuredClone(DEFAULT_BRANDING),...brandingEntries(decryptJson(advisor.reportSettingsEncrypted))}):structuredClone(DEFAULT_BRANDING);}
export async function saveBrandingSettings(advisorId:string,raw:unknown):Promise<BrandingSettings>{
  const parsed=brandingSettingsSchema.safeParse(raw);if(!parsed.success)throw new ApiError(422,'Please check the report branding and letter.');
  const settings=parsed.data;
  if(settings.logoDataUrl){
    const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(settings.logoDataUrl);if(!match)throw new ApiError(422,'Logo must be a small PNG or JPEG, not an external link.');
    const bytes=Buffer.from(match[2],'base64');if(bytes.length>75000)throw new ApiError(422,'Resize your logo below 75 KB.');
    const valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!valid)throw new ApiError(422,'Logo contents do not match its image type.');
  }
  await db.$transaction(async tx=>{const advisor=await tx.advisor.findUniqueOrThrow({where:{id:advisorId},select:{reportSettingsEncrypted:true}});const existing=advisor.reportSettingsEncrypted?decryptJson<unknown>(advisor.reportSettingsEncrypted):{};const saved=await tx.advisor.updateMany({where:{id:advisorId,reportSettingsEncrypted:advisor.reportSettingsEncrypted},data:{reportSettingsEncrypted:encryptJson({...settings,...retentionEntries(existing)})}});if(!saved.count)throw new ApiError(409,'Advisor settings changed elsewhere. Reload before saving branding.');await tx.auditLog.create({data:{advisorId,action:'REPORT_BRANDING_UPDATED',entity:'Advisor',entityId:advisorId,summary:'Advisor updated report letter and branding.'}});});
  return settings;
}
export async function reportBranding(advisorId:string,approved:boolean,letter?:string):Promise<ReportBranding>{
  const [advisor,settings]=await Promise.all([db.advisor.findUniqueOrThrow({where:{id:advisorId},select:{name:true,email:true,phone:true,licenseNumbers:true}}),loadBrandingSettings(advisorId)]);
  return {advisorName:advisor.name,advisorEmail:advisor.email,advisorPhone:advisor.phone,licenseNumbers:advisor.licenseNumbers,coverText:settings.coverText,logoDataUrl:settings.logoDataUrl,letter:letter??settings.letter,letterApproved:approved,disclosure:REQUIRED_DISCLOSURE+(settings.additionalDisclosure?' '+settings.additionalDisclosure:'')};
}
