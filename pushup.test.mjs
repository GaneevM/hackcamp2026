import assert from 'node:assert/strict';
import {assessPushup,PushupCounter,jointAngle} from './pushup.mjs';
const frame=()=>{
  const image=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:0}));
  const world=Array.from({length:33},()=>({x:0,y:0,z:0}));
  const positions={11:[.25,.35],13:[.25,.5],15:[.25,.65],23:[.5,.4],25:[.65,.43],27:[.8,.46]};
  for(const [i,[x,y]] of Object.entries(positions)){image[i]={x,y,z:0,visibility:.95};world[i]={x:x*2,y,z:0};}
  return {landmarks:image,world};
};
assert.equal(jointAngle({x:0,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0}),180);
assert.equal(jointAngle({x:1,y:0,z:0},{x:1,y:0,z:0},{x:2,y:0,z:0}),null);
const good=assessPushup({...frame()});assert.equal(good.valid,true);assert.ok(good.score>90);
const cropped=frame();cropped.landmarks[15].visibility=.2;assert.equal(assessPushup(cropped).valid,false);
const out=frame();out.landmarks[27].x=1.05;assert.equal(assessPushup(out).valid,false);
const upright=frame();upright.landmarks[23].x=.26;upright.landmarks[23].y=.65;assert.equal(assessPushup(upright).valid,false);
const sag=frame();sag.world[23].y=.8;const bad=assessPushup(sag);assert.equal(bad.valid,true);assert.ok(bad.score<good.score);assert.equal(bad.aligned,false);
const knees=frame();knees.landmarks[27].visibility=0;assert.equal(assessPushup({...knees,variant:'knees'}).valid,true);assert.equal(assessPushup(knees).valid,false);
const missing=frame();missing.world=null;assert.equal(assessPushup(missing).valid,false);
const hands=frame();hands.landmarks[15].y=.2;assert.equal(assessPushup(hands).valid,false);
const right=frame();for(const [l,r] of [[11,12],[13,14],[15,16],[23,24],[25,26],[27,28]]){right.landmarks[r]={...right.landmarks[l]};right.landmarks[l].visibility=0;right.world[r]={...right.world[l]};}assert.equal(assessPushup({...right,side:'right'}).valid,true);
const wall=frame();for(const i of [11,13,15,23,25,27]){const p=wall.landmarks[i];[p.x,p.y]=[1-p.y,p.x];}assert.equal(assessPushup({...wall,variant:'wall'}).valid,true);assert.equal(assessPushup(wall).valid,false);
const pose=flexion=>({valid:true,aligned:true,score:94,flexion});
const counter=new PushupCounter();let time=0;
function hold(flexion,ms){for(let i=0;i<ms;i+=50){time+=50;counter.update(pose(flexion),time);}}
hold(10,500);hold(75,500);hold(10,500);assert.equal(counter.reps.length,1);assert.equal(counter.reps[0].score,94);
hold(10,1000);assert.equal(counter.reps.length,1,'holding the top must not add reps');
hold(45,500);hold(10,500);assert.equal(counter.reps.length,1,'partial bends must not count');
hold(75,500);counter.update({valid:false},time+=50);hold(10,500);assert.equal(counter.reps.length,1,'occlusion must discard the unfinished rep');
hold(75,500);time+=2000;counter.update(pose(10),time);hold(10,400);assert.equal(counter.reps.length,1,'long frame gaps must discard unfinished reps');
counter.reset();assert.equal(counter.reps.length,0);
hold(10,500);for(let i=0;i<500;i+=50){time+=50;counter.update(pose(45),time,{top:25,bottom:40});}for(let i=0;i<500;i+=50){time+=50;counter.update(pose(10),time,{top:25,bottom:40});}assert.equal(counter.reps.length,1,'a calibrated smaller range must work');
console.log('Push-up checks passed: geometry, visibility, posture, rep phases, occlusion, timing and personalized range.');
