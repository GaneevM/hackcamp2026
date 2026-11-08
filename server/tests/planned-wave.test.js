import test from 'node:test';
import assert from 'node:assert/strict';
import {journalSchema} from '../src/journal-validation.js';
import {SessionMetrics} from '../../session-metrics.js';
test('journal accepts planned wave counts with no angle measurements',()=>{
 const m=new SessionMetrics({movement:'wave',manual:false,targetReps:8},0);m.observe({ready:true,angle:null,reps:8,phase:'ready'},3000);
 const body={scope:'guest',session:{id:'wave-test',date:new Date().toISOString(),exercise:'Hand wave',metric:'Wave repetitions',movement:'wave',side:'left',reps:8,duration:1,angle:null,startAngle:null,excursion:null,confidence:null,pain:null,note:'',manual:false,checkin:false},metrics:m.finish('ready',5000)};
 assert.equal(journalSchema.safeParse(body).success,true);
 assert.equal(journalSchema.safeParse({...body,session:{...body.session,angle:90}}).success,false);
});
