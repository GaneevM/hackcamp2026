import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {reserve,createLiveToken,speech,buildLiveInstruction} from '../worker/live-provider.js';
function database(){const db=new DatabaseSync(':memory:');return {close:()=>db.close(),prepare(q){return {run:async()=>db.prepare(q).run(),bind(...a){return {first:async()=>db.prepare(q).get(...a),run:async()=>db.prepare(q).run(...a)}}}}};}
test('Live reservations enforce persistent global and per-account lifetime limits',async()=>{const db=database();try{await reserve(db,'a','live',3,2);await reserve(db,'a','live',3,2);await assert.rejects(reserve(db,'a','live',3,2),{status:429});await reserve(db,'b','live',3,2);await assert.rejects(reserve(db,'c','live',3,2),{status:429});}finally{db.close();}});
test('disabled and expired deployments reject Live and speech before any provider request',async()=>{for(const env of [{},{GEMINI_LIVE_ENABLED:'true',GEMINI_DEMO_EXPIRES_AT:'2020-01-01'}]){await assert.rejects(createLiveToken(env,'a',{}),{status:503});await assert.rejects(speech(env,'a',{text:'Hello'}),{status:503});}});
test('Live rejects missing image-sharing consent and unknown exercises before reserving quota',async()=>{const env={GEMINI_LIVE_ENABLED:'true',GEMINI_DEMO_EXPIRES_AT:'2099-01-01',GEMINI_API_KEY:'unused-test-key'};await assert.rejects(createLiveToken(env,'a',{movement:'elbow',side:'left',consent:false}),{status:400});await assert.rejects(createLiveToken(env,'a',{movement:'wave',side:'left',consent:true}),{status:400});});

test('elbow guidance describes a seated or standing curl without a floor variation from old clients',()=>{
 const instruction=buildLiveInstruction({movement:'elbow',side:'left',variant:'floor'});
 assert.match(instruction,/Elbow bend:.*biceps curl/);assert.match(instruction,/seated or standing/);
 assert.doesNotMatch(instruction,/Push-up variation:|variation: floor/);
 assert.match(instruction,/does not require lying down, kneeling, or getting on the floor/);
});
test('only push-ups receive push-up variation context',()=>{
 for(const movement of ['sit','reach','elbow','crossbody']){
  assert.doesNotMatch(buildLiveInstruction({movement,side:'right',variant:'wall'}),/Push-up variation:/);
 }
 for(const variant of ['floor','knee','wall']){assert.ok(buildLiveInstruction({movement:'pushup',side:'left',variant}).includes('Push-up variation: '+variant+'.'));}
 assert.throws(()=>buildLiveInstruction({movement:'pushup',side:'left',variant:'unknown'}),{status:400});
});
test('all exercise instructions retain English and the selected movement throughout the session',()=>{
 for(const movement of ['sit','reach','elbow','crossbody','pushup']){const text=buildLiveInstruction({movement,side:'left'});
  assert.match(text,/Speak only in English/);assert.match(text,/Do not translate or switch languages/);
  assert.match(text,/Stay with the selected exercise/);assert.match(text,/Ignore unrelated background conversations/);
 }
});
test('invalid movement names and body sides cannot create coaching context',()=>{
 for(const movement of ['wave','constructor','__proto__','unknown'])assert.throws(()=>buildLiveInstruction({movement,side:'left'}),{status:400});
 assert.throws(()=>buildLiveInstruction({movement:'elbow',side:'unknown'}),{status:400});
});
