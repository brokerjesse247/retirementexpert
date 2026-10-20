import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { requireTrustedOrigin } from '../lib/auth/http';

const publicOrigin = 'https://8328-project.example.manus.computer';
const internalOrigin = 'http://127.0.0.1:3000';
function proxyRequest(overrides: Record<string, string> = {}) {
  return new NextRequest(`${internalOrigin}/api/auth/login`, {method:'POST',headers:{
    origin:internalOrigin,referer:`${publicOrigin}/login`,
    'x-forwarded-host':new URL(publicOrigin).host,'x-forwarded-proto':'https',
    'sec-fetch-site':'same-origin',...overrides,
  }});
}
beforeEach(()=>{
  vi.stubEnv('NODE_ENV','development');
  vi.stubEnv('APP_ORIGIN',publicOrigin);
  vi.stubEnv('PREVIEW_PROXY_INTERNAL_ORIGIN',internalOrigin);
});
afterEach(()=>vi.unstubAllEnvs());
describe('Preview proxy origin compatibility',()=>{
  it('accepts the exact public origin without proxy opt-in',()=>{
    vi.stubEnv('PREVIEW_PROXY_INTERNAL_ORIGIN','');
    expect(()=>requireTrustedOrigin(new NextRequest(publicOrigin+'/api/auth/login',{headers:{origin:publicOrigin}}))).not.toThrow();
  });
  it('accepts rewritten origin only with all exact same-origin proxy metadata',()=>{
    expect(()=>requireTrustedOrigin(proxyRequest())).not.toThrow();
  });
  it('does not confuse the proxy-derived HTTPS listen address with the browser origin',()=>{
    const headers = proxyRequest().headers;
    expect(()=>requireTrustedOrigin(new NextRequest('https://0.0.0.0:3000/api/auth/login',{headers}))).not.toThrow();
  });
  it.each([
    {origin:'https://attacker.example.invalid'},
    {referer:'https://attacker.example.invalid/login'},
    {referer:''},
    {'sec-fetch-site':'cross-site'},
    {'sec-fetch-site':'same-site'},
    {'sec-fetch-site':''},
    {'x-forwarded-host':'attacker.example.invalid'},
    {'x-forwarded-proto':'http'},
  ] as Record<string, string>[])('rejects incomplete or cross-site metadata %j',(headers)=>{
    expect(()=>requireTrustedOrigin(proxyRequest(headers))).toThrow('Request origin is not allowed.');
  });
  it('never enables the loopback exception in production',()=>{
    vi.stubEnv('NODE_ENV','production');
    expect(()=>requireTrustedOrigin(proxyRequest())).toThrow('Request origin is not allowed.');
  });
  it('requires explicit opt-in and a loopback endpoint',()=>{
    vi.stubEnv('PREVIEW_PROXY_INTERNAL_ORIGIN','');
    expect(()=>requireTrustedOrigin(proxyRequest())).toThrow();
    vi.stubEnv('PREVIEW_PROXY_INTERNAL_ORIGIN','http://attacker.example.invalid');
    expect(()=>requireTrustedOrigin(proxyRequest({origin:'http://attacker.example.invalid'}))).toThrow();
  });
  it('does not enable the development exception for the Hostinger production domain',()=>{
    vi.stubEnv('APP_ORIGIN','https://plan.retirementexpert.si');
    expect(()=>requireTrustedOrigin(proxyRequest())).toThrow();
  });
});
