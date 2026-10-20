import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

dotenv.config({path:'.env.test',override:true,quiet:true});
const source=process.env.DATABASE_URL??'';
if (!new URL(source).pathname.endsWith('/retireplan_test')) throw new Error('Integration checks require the dedicated retireplan_test database.');
const origin=process.env.APP_ORIGIN!;
const results:string[]=[];
function record(message:string){results.push(message);console.log('PASS '+message);}
function request(path:string,method='GET',data?:unknown,cookie='',trusted=true){return new NextRequest(origin+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(trusted?{Origin:origin}:{Origin:'https://untrusted.example.invalid'})},...(data?{body:JSON.stringify(data)}:{})});}
function cookies(response:NextResponse){return response.cookies.getAll().filter(c=>c.value).map(c=>`${c.name}=${c.value}`).join('; ');}
async function json(response:NextResponse,expected=200){const b=await response.json();assert.equal(response.status,expected,JSON.stringify(b));return b;}
async function main(){
 const {db}=await import('../lib/db');
 const draft=await import('../app/api/intake/draft/route');
 const submit=await import('../app/api/intake/submit/route');
 const login=await import('../app/api/auth/login/route');
 const enroll=await import('../app/api/auth/enroll/route');
 const session=await import('../app/api/auth/session/route');
 const listing=await import('../app/api/clients/route');
 const detail=await import('../app/api/clients/[id]/route');
 const {emptyIntake}=await import('../lib/intake/schema');
 const {decryptJson,decryptText,tokenHash,randomToken}=await import('../lib/auth/crypto');
 const tag=crypto.randomBytes(6).toString('hex');
 const email=`fixture-${tag}@example.invalid`;
 const password=crypto.randomBytes(4).toString('hex');
 const advisor=await db.advisor.create({data:{name:'ISOLATED TEST FIXTURE',email,passwordHash:await bcrypt.hash(password,12)}});
 process.env.INTAKE_ADVISOR_ID=advisor.id;
 try{
   await json(await listing.GET(request('/api/clients')),401);record('Unauthenticated advisor data is rejected');
   await json(await draft.POST(request('/api/intake/draft','POST',{},'',false)),403);record('Untrusted intake origin is rejected');
   const created=await draft.POST(request('/api/intake/draft','POST',{}));const dc=cookies(created);let d=await json(created);
   assert.match(created.headers.get('set-cookie')??'',/Secure/);assert.match(created.headers.get('set-cookie')??'',/SameSite=none/i);
   const partial=structuredClone(emptyIntake);partial.firstName='T';partial.email='unfinished@';
   d=await json(await draft.PATCH(request('/api/intake/draft','PATCH',{data:partial,step:1,revision:d.revision,csrfToken:d.csrfToken},dc)));
   assert.equal(d.data.firstName,'T');record('Partial invalid-email draft autosaves without requiring step completion');
   d=await json(await draft.PATCH(request('/api/intake/draft','PATCH',{data:partial,step:8,revision:d.revision,csrfToken:d.csrfToken},dc)));
   assert.equal(d.step,1);
   const blockedPosition=await db.intakeDraft.findUniqueOrThrow({where:{sessionTokenHash:tokenHash(dc.split('=')[1])}});
   assert.equal(blockedPosition.step,1);
   record('Partial autosave cannot unlock or persist a later step');
   await json(await draft.PATCH(request('/api/intake/draft','PATCH',{data:partial,step:1,revision:d.revision-1,csrfToken:d.csrfToken},dc)),409);
   await json(await draft.PATCH(request('/api/intake/draft','PATCH',{data:partial,step:1,revision:d.revision,csrfToken:'wrong'},dc)),403);record('Autosave conflict and CSRF are enforced');
   const full=structuredClone(emptyIntake);
   Object.assign(full,{firstName:'ISOLATED',lastName:'FICTIONAL CLIENT',email:`client-${tag}@example.invalid`,phone:'555-555-0101',dob:'1965-06-15',state:'CA',maritalStatus:'SINGLE',filingStatus:'SINGLE',rankedConcerns:['TAXES','HEALTHCARE','INFLATION'],riskAnswers:[3,3,3,3,3],consent:true});
   Object.assign(full.primary,{earnedIncome:'100000',pia:'2400',retirementAge:'65',partTimeIncome:'12000',preTax401k:'100000'});
   Object.assign(full.expenses,{currentMonthly:'6000',retirementMonthly:'5000',essentialMonthly:'3500'});
   d=await json(await draft.PATCH(request('/api/intake/draft','PATCH',{data:full,step:8,revision:d.revision,csrfToken:d.csrfToken},dc)));
   const draftRow=await db.intakeDraft.findUniqueOrThrow({where:{sessionTokenHash:tokenHash(dc.split('=')[1])}});
   const grantToken=randomToken();await db.draftAccessGrant.create({data:{draftId:draftRow.id,tokenHash:tokenHash(grantToken),expiresAt:new Date(Date.now()+60000)}});
   const noConsent=await json(await submit.POST(request('/api/intake/submit','POST',{data:{...full,consent:false},revision:d.revision,csrfToken:d.csrfToken},dc)),422);
   assert.ok(noConsent.fields.consent);
   assert.equal(await db.client.count({where:{advisorId:advisor.id}}),0);
   assert.equal((await db.intakeDraft.findUniqueOrThrow({where:{id:draftRow.id}})).submittedAt,null);
   record('Unchecked consent cannot submit or create a dashboard client');
   const submitted=await json(await submit.POST(request('/api/intake/submit','POST',{data:full,revision:d.revision,csrfToken:d.csrfToken},dc)));
   assert.equal(submitted.emailDelivery,'queued');
   const twice=await json(await submit.POST(request('/api/intake/submit','POST',{data:full,revision:d.revision,csrfToken:d.csrfToken},dc)));
   assert.equal(twice.clientId,submitted.clientId);
   const client=await db.client.findUniqueOrThrow({where:{id:submitted.clientId},include:{persons:true,incomeStreams:true}});
   assert.equal(client.persons[0].firstName,'ISOLATED');assert.equal(client.persons[0].dob?.toISOString().slice(0,10),'1965-06-15');
   assert.equal(client.incomeStreams.find(i=>i.type==='PART_TIME')?.annualCents,1200000n);
   assert.equal((decryptJson(client.encryptedData) as any).email,full.email);
   record('Submit is idempotent, encrypted, consent-recorded and normalized with correct age/income units');
   const exchange=await import('../app/api/intake/resume/exchange/route');
   await json(await exchange.POST(request('/api/intake/resume/exchange','POST',{token:grantToken})),400);record('Pre-submission resume grant cannot reopen a submitted profile');
   await json(await login.POST(request('/api/auth/login','POST',{email,password:'wrong'})),401);
   const signedIn=await login.POST(request('/api/auth/login','POST',{email,password}));const ac=cookies(signedIn);const signIn=await json(signedIn);assert.equal(signIn.authMode,'PASSWORD');assert.equal(signIn.requiresTwoFactor,undefined);
   assert.match(signedIn.headers.get('set-cookie')??'',/Secure/);assert.match(signedIn.headers.get('set-cookie')??'',/SameSite=none/i);
   const verify=await import('../app/api/auth/verify/route');
   await json(await enroll.GET(request('/api/auth/enroll','GET',undefined,ac)),410);
   await json(await enroll.POST(request('/api/auth/enroll','POST',{},ac)),410);
   await json(await verify.POST(request('/api/auth/verify','POST',{},ac)),410);record('Obsolete authenticator enrollment and code endpoints cannot issue sessions');
   const me=await json(await session.GET(request('/api/auth/session','GET',undefined,ac)));assert.equal(me.advisor.id,advisor.id);assert.equal(me.twoFactorEnabled,false);record('Real eight-character password directly creates a verified advisor session');
   const list=await json(await listing.GET(request('/api/clients?sort=name_asc','GET',undefined,ac)));assert.equal(list.clients.length,1);assert.ok(list.clients[0].age>=60);
   const id=client.id;const context={params:Promise.resolve({id})};
   const profile=await json(await detail.GET(request('/api/clients/'+id,'GET',undefined,ac),context));
   profile.data.primary.earnedIncome='120000';
   await json(await detail.PATCH(request('/api/clients/'+id,'PATCH',{data:profile.data,status:'IN_REVIEW',revision:profile.revision,csrfToken:me.csrfToken},ac),context));
   assert.equal((await db.client.findUniqueOrThrow({where:{id}})).status,'IN_REVIEW');
   await json(await detail.GET(request('/api/clients/missing','GET',undefined,ac),{params:Promise.resolve({id:'missing'})}),404);record('Advisor dashboard list/age and revision-aware profile editing work');
   const active=await db.advisorSession.findUniqueOrThrow({where:{tokenHash:tokenHash(ac.split('=')[1])}});
   const before=active.expiresAt.valueOf();await session.GET(request('/api/auth/session','GET',undefined,ac));
   const after=await db.advisorSession.findUniqueOrThrow({where:{id:active.id}});assert.equal(after.expiresAt.valueOf(),before);record('Passive GET cannot extend the advisor idle timeout');
   const activity=await import('../app/api/auth/activity/route');
   await json(await activity.POST(request('/api/auth/activity','POST',{csrfToken:me.csrfToken},ac,'true' as any)));
   await json(await activity.POST(request('/api/auth/activity','POST',{csrfToken:me.csrfToken},ac,false)),403);record('Only trusted CSRF-protected activity can renew the advisor session');
   const otherLogin=await login.POST(request('/api/auth/login','POST',{email,password}));const otherCookie=cookies(otherLogin);await json(otherLogin);
   const resetToken=randomToken();await db.passwordResetToken.create({data:{advisorId:advisor.id,tokenHash:tokenHash(resetToken),expiresAt:new Date(Date.now()+60000)}});
   const reset=await import('../app/api/auth/reset/route');
   await json(await reset.POST(request('/api/auth/reset','POST',{token:resetToken,password:crypto.randomBytes(24).toString('hex')})));
   await json(await listing.GET(request('/api/clients','GET',undefined,ac)),401);
   await json(await listing.GET(request('/api/clients','GET',undefined,otherCookie)),401);record('Password reset revokes all previously created sessions');
   assert.equal(await db.emailOutbox.count({where:{status:'SENT'}}),0);record('Test provider sends remain disabled; no false delivery claims');
 }finally{
   await db.intakeDraft.deleteMany({where:{client:{advisorId:advisor.id}}});
   await db.client.deleteMany({where:{advisorId:advisor.id}});
   await db.advisor.delete({where:{id:advisor.id}});
   await db.$disconnect();
 }
 console.log(`Integration checks complete: ${results.length} passed. Dedicated test fixtures removed; Preview contains no fake advisor.`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Integration failed');process.exitCode=1;});
