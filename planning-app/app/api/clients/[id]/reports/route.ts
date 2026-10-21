import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireAdvisor} from '@/lib/auth/session';
import {ApiError,errorResponse,jsonBody,noStore,requireCsrf,requireTrustedOrigin} from '@/lib/auth/http';
import {createReport,processReport,reportHistory} from '@/lib/reports/service';
import {REPORT_SECTION_OPTIONS} from '@/lib/reports/render';
import {loadBrandingSettings} from '@/lib/reports/branding';
export const maxDuration=120;
export const runtime='nodejs';
export async function GET(request:NextRequest,ctx:{params:Promise<{id:string}>}){try{const s=await requireAdvisor(request);const {id}=await ctx.params;return noStore(NextResponse.json({reports:await reportHistory(id,s.advisor.id),sections:REPORT_SECTION_OPTIONS,branding:await loadBrandingSettings(s.advisor.id),csrfToken:s.csrfToken}));}catch(e){return errorResponse(e);}}
const schema=z.object({requestKey:z.string().min(8).max(100),sections:z.array(z.string().max(80)).min(1).max(30),coverNote:z.string().max(500),letter:z.string().min(30).max(5000),letterApproved:z.literal(true),revision:z.number().int().min(1),csrfToken:z.string()}).strict();
export async function POST(request:NextRequest,ctx:{params:Promise<{id:string}>}){try{requireTrustedOrigin(request);const s=await requireAdvisor(request);const {id}=await ctx.params;const parsed=schema.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(422,'Select report sections and approve the advisor letter first.');requireCsrf(s.csrfToken,parsed.data.csrfToken);const row=await createReport(id,s.advisor.id,parsed.data);await processReport(row.id);const reports=await reportHistory(id,s.advisor.id);const report=reports.find(r=>r.id===row.id);return noStore(NextResponse.json({report,reports,message:report?.status==='READY'?'Report generated and stored privately. No email was sent.':'Report is queued or could not be completed. Check its status.'}));}catch(e){return errorResponse(e);}}
