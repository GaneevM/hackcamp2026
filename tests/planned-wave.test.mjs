import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionMetrics,WaveCounter} from '../session-metrics.js';
import {practiceRows} from '../care-data.js';
test('eight planned waves retain their goal and count without inventing joint angles',()=>{
 const metrics=new SessionMetrics({movement:'wave',manual:false,targetReps:8},0),counter=new WaveCounter();let reps=0;
 for(let i=0;i<8;i++)for(const [position,t] of [[.2,0],[.28,100],[.28,180],[.2,300],[.2,380]]){
  const now=i*600+t;if(counter.update({position,raised:true,arm:'left'},now))reps++;
  metrics.observe({ready:true,angle:null,reps,phase:counter.phase},now);
 }
 const result=metrics.finish('ready',5000);assert.equal(reps,8);assert.equal(result.targetReps,8);assert.equal(result.angleConvention,'hand_wave_cycles_no_joint_angle');
 assert.equal(result.minimumObservedAngleDeg,null);assert.equal(result.maximumObservedAngleDeg,null);assert.equal(result.trackingValidFraction,1);
 const row={movement:'wave',reps,date:new Date().toISOString(),checkin:false};assert.equal(practiceRows([row]).length,1);assert.equal(practiceRows([{...row,demo:true}]).length,0);
});
