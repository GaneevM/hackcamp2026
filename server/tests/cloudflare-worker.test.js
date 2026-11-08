import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {createWorker} from '../worker/index.js';
import {createD1Store} from '../worker/d1-store.js';

const domain='issuer.example.test', audience='https://formnote-api';
const {publicKey,privateKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'test'};
const keySet=createLocalJWKSet({keys:[jwk]});
const scope='user-auth0%7Cdemo';
async function token({sub='auth0|demo',aud=audience,iss='https://'+domain+'/',exp='1h'}={}){
 return new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject(sub).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);
}
function sample(id='session-1'){
 return {scope,session:{id,date:'2026-11-08T12:00:00Z',exercise:'Elbow bend',metric:'Elbow flexion',movement:'elbow',side:'left',reps:2,duration:1,angle:100,startAngle:10,excursion:90,confidence:null,pain:null,note:'',manual:false,checkin:false},metrics:{source:'camera',startedAt:'2026-11-08T11:59:00Z',durationSeconds:60,targetReps:5,angleConvention:'flexion_deg_straight_is_0',minimumObservedAngleDeg:10,maximumObservedAngleDeg:100,trackingValidFraction:.9,trackingLossEvents:1,incompleteCycles:0,medianCompletionIntervalSeconds:4,stopReason:'user_ended',measurementProtocolId:'formnote-side-view-observed-extrema-v1'}};
}
async function setup(t,generate){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',d1Databases:['DB']}));
 t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');
 const schema=fs.readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8');
 for(const sql of schema.split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 const env={DB,AUTH0_DOMAIN:domain,AUTH0_CLIENT_ID:'client-id-example',AUTH0_AUDIENCE:audience,GEMINI_API_KEY:'fake-key-never-sent',GEMINI_MODEL:'fake-model',ASSETS:{fetch:async()=>new Response('asset')}};
 const worker=createWorker({keySet,generate}),bearer=await token();
 async function request(path,body,options={}){
  const headers={...(options.noAuth?{}:{Authorization:'Bearer '+(options.token||bearer)}),...(body===undefined?{}:{'Content-Type':'application/json'}),...options.headers};
  return worker.fetch(new Request('https://demo.example.test'+path,{method:options.method||(body===undefined?'GET':'POST'),headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 }
 return {env,request,store:createD1Store(DB)};
}
test('Worker requires signed access tokens with correct issuer, audience and expiry; scope cannot be forged',async t=>{
 const h=await setup(t);
 assert.equal((await h.request('/api/journal/sessions?scope='+encodeURIComponent(scope),undefined,{noAuth:true})).status,401);
 for(const opts of [{aud:'wrong'},{iss:'https://wrong.example.test/'},{exp:'1s' }]){
  const bad=opts.exp?await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('auth0|demo').setIssuer('https://'+domain+'/').setAudience(audience).setIssuedAt(1).setExpirationTime(2).sign(privateKey):await token(opts);
  assert.equal((await h.request('/api/journal/sessions',undefined,{token:bad})).status,401);
 }
 assert.equal((await h.request('/api/journal/sessions?scope=user-other')).status,403);
 assert.equal((await h.request('/api/journal/sessions',{...sample(),scope:'guest'})).status,403);
 assert.equal((await h.request('/api/journal/sessions',sample(),{headers:{origin:'https://evil.example'}})).status,403);
 assert.equal((await h.request('/api/journal/sessions',sample(),{headers:{origin:'https://demo.example.test'}})).status,200);
 assert.equal((await h.request('/api/journal/sessions?scope='+encodeURIComponent(scope))).status,200);
});
test('D1 sessions are idempotent, conflicts preserve records, and user context appends without changing measurements',async t=>{
 const h=await setup(t),s=sample();await h.request('/api/journal/sessions',s);await h.request('/api/journal/sessions',s);
 assert.equal((await h.request('/api/journal/sessions',{...s,session:{...s.session,reps:9}})).status,409);
 for(const answer of ['Doorbell rang','Doorbell rang','Camera moved'])assert.equal((await h.request('/api/journal/sessions/session-1/context',{scope,answer})).status,200);
 const row=await (await h.request('/api/journal/sessions/session-1?scope='+encodeURIComponent(scope))).json();
 assert.equal(row.session.reps,2);assert.equal(row.userReportedContext.length,2);
 const other=await (await h.request('/api/journal/sessions?scope=user-auth0%257Cother',undefined,{token:await token({sub:'auth0|other'})})).json();assert.equal(other.sessions.length,0);
});
test('preview calls no model; generation needs consent and exact preview; cached reports survive new Worker instances',async t=>{
 let calls=0;const generate=async()=>{calls++;return {model:'fake',content:{summary:'Demo report',observations:[],limitations:['Camera estimates'],questionsForReview:[]}}};
 const h=await setup(t,generate);await h.request('/api/journal/sessions',sample());
 const share={scope,sessionIds:['session-1'],includeUserContext:false,style:'encouraging'};
 const preview=await (await h.request('/api/journal/ai/preview',share)).json();assert.equal(calls,0);assert.ok(preview.previewToken);
 assert.equal((await h.request('/api/journal/ai/report',share)).status,400);
 assert.equal((await h.request('/api/journal/ai/report',{...share,consent:true,previewToken:'stale'})).status,409);
 const body={...share,consent:true,previewToken:preview.previewToken};
 const first=await (await h.request('/api/journal/ai/report',body)).json();assert.equal(calls,1);assert.ok(first.id);
 const fresh=createWorker({keySet,generate});
 const response=await fresh.fetch(new Request('https://demo.example.test/api/journal/ai/report',{method:'POST',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify(body)}),h.env);
 assert.equal((await response.json()).id,first.id);assert.equal(calls,1);
});
test('D1 quotas and in-flight locks persist; clearing history discards an in-flight result',async t=>{
 let release,started;const entered=new Promise(r=>started=r),wait=new Promise(r=>release=r);
 const h=await setup(t,async()=>{started();await wait;return {model:'fake',content:{question:'Would you like to add context?'}}});
 await h.request('/api/journal/sessions',sample());const share={scope,sessionIds:['session-1'],style:'concise'};
 const {previewToken}=await (await h.request('/api/journal/ai/preview',share)).json();
 const body={...share,previewToken,consent:true},pending=h.request('/api/journal/ai/question',body);await entered;
 assert.equal((await h.request('/api/journal/ai/question',body)).status,409);
 await h.request('/api/journal/sessions?scope='+encodeURIComponent(scope),undefined,{method:'DELETE'});release();assert.equal((await pending).status,404);
 assert.deepEqual(await h.store.history(scope),[]);
 for(let i=0;i<9;i++)await h.store.allowance(scope);
 await assert.rejects(()=>h.store.allowance(scope),e=>e.status===429);
});
test('new push-up and cross-body records keep metadata; check-ins preserve zero; legacy API cannot call Gemini',async t=>{
 const h=await setup(t);
 const push=sample('push');Object.assign(push.session,{movement:'pushup',variant:'knees',form:{version:1,average:90,reps:[{score:90,peak:70,seconds:3}]}});
 assert.equal((await h.request('/api/journal/sessions',push)).status,200);
 const cross=sample('cross');Object.assign(cross.session,{movement:'crossbody',averageHoldSeconds:2});cross.metrics.angleConvention='opposite_shoulder_shoulder_wrist_angle_deg';assert.equal((await h.request('/api/journal/sessions',cross)).status,200);
 const checkin={scope,checkin:{id:'c1',date:'2026-11-08T12:00:00Z',exercise:'Check-in',reps:null,duration:0,angle:null,movement:null,side:null,confidence:null,pain:0,note:'',checkin:true}};
 assert.equal((await h.request('/api/journal/checkins',checkin)).status,200);
 const rows=await (await h.request('/api/journal/checkins?scope='+encodeURIComponent(scope))).json();assert.equal(rows.checkins[0].pain,0);
 assert.equal((await h.request('/api/reports',{})).status,404);
 const config=await (await h.request('/auth0-config.js',undefined,{noAuth:true})).text();assert.ok(config.includes(audience));assert.ok(!config.includes(h.env.GEMINI_API_KEY));
});
test('invalid provider content and provider errors never expose secrets or save reports',async t=>{
 const h=await setup(t,async()=>{throw Error('private-key provider-payload');});await h.request('/api/journal/sessions',sample());
 const share={scope,sessionIds:['session-1']},p=await (await h.request('/api/journal/ai/preview',share)).json();
 const response=await h.request('/api/journal/ai/report',{...share,consent:true,previewToken:p.previewToken});assert.equal(response.status,502);assert.ok(!(await response.text()).includes('private-key'));assert.deepEqual(await h.store.history(scope),[]);
});
