import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { loadAssumptions, updateAssumptions } from '@/lib/assumptions/service';

export async function GET(request: NextRequest) {
  try { const session=await requireAdvisor(request); return noStore(NextResponse.json({assumptions:await loadAssumptions(session.advisor.id),csrfToken:session.csrfToken})); }
  catch(error){return errorResponse(error);}
}
const patch=z.object({year:z.number().int().min(2020).max(2100),expectedVersion:z.string().max(80),edits:z.record(z.string().max(150),z.number().finite().nullable()),csrfToken:z.string()}).strict();
export async function PATCH(request:NextRequest){
  try {requireTrustedOrigin(request);const session=await requireAdvisor(request);const parsed=patch.safeParse(await jsonBody(request));if(!parsed.success)throw new ApiError(422,'Please check the assumption values.');requireCsrf(session.csrfToken,parsed.data.csrfToken);return noStore(NextResponse.json({assumptions:await updateAssumptions(session.advisor.id,parsed.data.year,parsed.data.expectedVersion,parsed.data.edits)}));}
  catch(error){return errorResponse(error);}
}
