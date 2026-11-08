import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {reserve,createLiveToken,speech} from '../worker/live-provider.js';
function database(){const db=new DatabaseSync(':memory:');return {close:()=>db.close(),prepare(q){return {run:async()=>db.prepare(q).run(),bind(...a){return {first:async()=>db.prepare(q).get(...a),run:async()=>db.prepare(q).run(...a)}}}}};}
test('Live reservations enforce persistent global and per-account lifetime limits',async()=>{const db=database();try{await reserve(db,'a','live',3,2);await reserve(db,'a','live',3,2);await assert.rejects(reserve(db,'a','live',3,2),{status:429});await reserve(db,'b','live',3,2);await assert.rejects(reserve(db,'c','live',3,2),{status:429});}finally{db.close();}});
test('disabled and expired deployments reject Live and speech before any provider request',async()=>{for(const env of [{},{GEMINI_LIVE_ENABLED:'true',GEMINI_DEMO_EXPIRES_AT:'2020-01-01'}]){await assert.rejects(createLiveToken(env,'a',{}),{status:503});await assert.rejects(speech(env,'a',{text:'Hello'}),{status:503});}});
test('Live rejects missing image-sharing consent and unknown exercises before reserving quota',async()=>{const env={GEMINI_LIVE_ENABLED:'true',GEMINI_DEMO_EXPIRES_AT:'2099-01-01',GEMINI_API_KEY:'unused-test-key'};await assert.rejects(createLiveToken(env,'a',{movement:'elbow',side:'left',consent:false}),{status:400});await assert.rejects(createLiveToken(env,'a',{movement:'wave',side:'left',consent:true}),{status:400});});
