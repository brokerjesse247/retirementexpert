import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const enforceRateLimit = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ draftAccessGrant: { findUnique: vi.fn() } }));
vi.mock('../lib/db', () => ({ db }));
vi.mock('../lib/auth/rate-limit', () => ({ enforceRateLimit }));
import { ApiError } from '../lib/auth/http';
import { POST as verifyMfa } from '../app/api/auth/verify/route';
import { GET as enrollmentGet, POST as enrollmentPost } from '../app/api/auth/enroll/route';
import { POST as exchangeResumeGrant } from '../app/api/intake/resume/exchange/route';

describe('public authentication endpoint policy', () => {
  beforeEach(() => { vi.stubEnv('APP_ORIGIN','https://app.example.test'); vi.clearAllMocks(); });
  afterEach(() => vi.unstubAllEnvs());
  it('returns 410 from legacy enrollment and verification, with no advisor session',async()=>{
    for(const handler of [enrollmentGet,enrollmentPost,verifyMfa]) {
      const response=await handler(new NextRequest('https://app.example.test/api/auth/enroll'));
      expect(response.status).toBe(410);
      expect(response.cookies.get('rp_advisor_session')).toBeUndefined();
      expect(response.cookies.get('rp_login_challenge')?.maxAge).toBe(0);
    }
  });
  it('applies a public resume-exchange network throttle before looking up a grant token',async()=>{
    enforceRateLimit.mockRejectedValueOnce(new ApiError(429,'Please wait before trying again.'));
    const response=await exchangeResumeGrant(new NextRequest('https://app.example.test/api/intake/resume/exchange',{
      method:'POST',headers:{origin:'https://app.example.test','content-type':'application/json'},body:JSON.stringify({token:'opaque-resume-token'}),
    }));
    expect(response.status).toBe(429);
    expect(enforceRateLimit).toHaveBeenCalledWith('intake-resume-exchange-ip','untrusted-network',15,60*60_000);
    expect(db.draftAccessGrant.findUnique).not.toHaveBeenCalled();
  });
});
