import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const db=vi.hoisted(()=>({advisor:{findUnique:vi.fn()}}));
const compare=vi.hoisted(()=>vi.fn());
const createAdvisorSession=vi.hoisted(()=>vi.fn());
const enforceRateLimit=vi.hoisted(()=>vi.fn());
vi.mock('../lib/db',()=>({db}));
vi.mock('bcryptjs',()=>({default:{compare}}));
vi.mock('../lib/auth/session',()=>({createAdvisorSession}));
vi.mock('../lib/auth/rate-limit',()=>({enforceRateLimit}));
import { POST } from '../app/api/auth/login/route';
import { ApiError } from '../lib/auth/http';
const origin='https://app.example.test';
function request(password='test-only-password',actualOrigin=origin){return new NextRequest(origin+'/api/auth/login',{
 method:'POST',headers:{origin:actualOrigin,'content-type':'application/json'},body:JSON.stringify({email:'advisor@example.test',password}),
});}
beforeEach(()=>{
 vi.stubEnv('APP_ORIGIN',origin);vi.stubEnv('COOKIE_LOCAL_HTTP','false');vi.clearAllMocks();
 db.advisor.findUnique.mockResolvedValue({id:'advisor-1',name:'Advisor',email:'advisor@example.test',passwordHash:'stored-hash',totpEnabledAt:new Date()});
 compare.mockResolvedValue(true);enforceRateLimit.mockResolvedValue(undefined);
 createAdvisorSession.mockResolvedValue({token:'opaque-session',csrfToken:'csrf'});
});
afterEach(()=>vi.unstubAllEnvs());
describe('requested password-only advisor login',()=>{
 it('issues a real secure session after a verified password with no authenticator challenge',async()=>{
  const response=await POST(request());expect(response.status).toBe(200);
  expect(compare).toHaveBeenCalledWith('test-only-password','stored-hash');expect(createAdvisorSession).toHaveBeenCalledWith('advisor-1');
  expect(await response.json()).toMatchObject({ok:true,authMode:'PASSWORD',advisor:{id:'advisor-1'}});
  const cookie=response.cookies.get('rp_advisor_session');expect(cookie).toMatchObject({value:'opaque-session',httpOnly:true,secure:true,sameSite:'none',maxAge:1800});
  expect(response.cookies.get('rp_login_challenge')?.maxAge).toBe(0);
 });
 it('does not create a session for an incorrect password',async()=>{
  compare.mockResolvedValue(false);expect((await POST(request())).status).toBe(401);expect(createAdvisorSession).not.toHaveBeenCalled();
 });
 it('does not create a session for an unknown advisor',async()=>{
  db.advisor.findUnique.mockResolvedValue(null);expect((await POST(request())).status).toBe(401);expect(createAdvisorSession).not.toHaveBeenCalled();
 });
 it('retains rate limiting before password work',async()=>{
  enforceRateLimit.mockRejectedValueOnce(new ApiError(429,'Please wait before trying again.'));expect((await POST(request())).status).toBe(429);expect(compare).not.toHaveBeenCalled();expect(createAdvisorSession).not.toHaveBeenCalled();
 });
 it('rejects cross-site login before password work',async()=>{
  expect((await POST(request('test-only-password','https://attacker.example.invalid'))).status).toBe(403);expect(compare).not.toHaveBeenCalled();expect(createAdvisorSession).not.toHaveBeenCalled();
 });
});
