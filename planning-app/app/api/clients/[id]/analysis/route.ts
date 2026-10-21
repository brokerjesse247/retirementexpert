import {NextRequest,NextResponse} from 'next/server';
import {requireAdvisor} from '@/lib/auth/session';
import {ApiError,errorResponse,jsonBody,noStore,requireCsrf,requireTrustedOrigin} from '@/lib/auth/http';
import {loadAnalysis,saveAnalysisOverrides} from '@/lib/calculations/service';
import {analysisOverridesSchema} from '@/lib/calculations/input';
export const maxDuration=120;
export async function GET(request:NextRequest,ctx:{params:Promise<{id:string}>}){try{const s=await requireAdvisor(request);const {id}=await ctx.params;return noStore(NextResponse.json({...await loadAnalysis(id,s.advisor.id),csrfToken:s.csrfToken}));}catch(e){return errorResponse(e);}}
export async function POST(request:NextRequest,ctx:{params:Promise<{id:string}>}){try{requireTrustedOrigin(request);const s=await requireAdvisor(request);const {id}=await ctx.params;const b=await jsonBody(request);requireCsrf(s.csrfToken,b.csrfToken);const parsed=analysisOverridesSchema.safeParse(b.overrides);if(!parsed.success||typeof b.revision!=='number')throw new ApiError(422,'Please check the planning inputs.');return noStore(NextResponse.json({...await saveAnalysisOverrides(id,s.advisor.id,parsed.data,b.revision),csrfToken:s.csrfToken}));}catch(e){return errorResponse(e);}}
