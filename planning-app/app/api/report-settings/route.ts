import {NextRequest,NextResponse} from 'next/server';
import {requireAdvisor} from '@/lib/auth/session';
import {errorResponse,jsonBody,noStore,requireCsrf,requireTrustedOrigin} from '@/lib/auth/http';
import {loadBrandingSettings,saveBrandingSettings,REQUIRED_DISCLOSURE} from '@/lib/reports/branding';
export async function GET(request:NextRequest){try{const s=await requireAdvisor(request);return noStore(NextResponse.json({settings:await loadBrandingSettings(s.advisor.id),requiredDisclosure:REQUIRED_DISCLOSURE,csrfToken:s.csrfToken}));}catch(e){return errorResponse(e);}}
export async function PATCH(request:NextRequest){try{requireTrustedOrigin(request);const s=await requireAdvisor(request);const b=await jsonBody(request);requireCsrf(s.csrfToken,b.csrfToken);return noStore(NextResponse.json({settings:await saveBrandingSettings(s.advisor.id,b.settings)}));}catch(e){return errorResponse(e);}}
