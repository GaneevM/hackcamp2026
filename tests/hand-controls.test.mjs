import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyHandGesture,FingerCommandHold,PalmScrollController,palmReading,trackedHandCrop,restoreCroppedHand} from '../hand-controls.mjs';
import {makeHand} from './hand-fixture.mjs';
test('one index, two fingers, open palm and fist are distinct across distance',()=>{
  for(const scale of [1,.4,.15])for(const gesture of ['one','two','palm','fist'])assert.equal(classifyHandGesture(makeHand(gesture,.6,.3,scale)),gesture);
  assert.equal(classifyHandGesture(makeHand('three')),'palm');
  assert.equal(classifyHandGesture(null),'none');
  const broken=makeHand('one');broken[8].x=NaN;assert.equal(classifyHandGesture(broken),'none');
});
test('thumb position does not change the one/two finger commands',()=>{
  for(const gesture of ['one','two']){const hand=makeHand(gesture);hand[4]={x:.8,y:.1,z:0};assert.equal(classifyHandGesture(hand),gesture);}
});
function hold(tracker,gesture,at=0,count=11){const events=[];for(let i=0;i<count;i++){const result=tracker.update(gesture,at+i*80);if(result)events.push(result);}return events;}
test('a 650ms hold fires once and a held or changed command cannot repeat',()=>{
  const tracker=new FingerCommandHold();
  assert.deepEqual(hold(tracker,'one',0,9),[]);
  assert.equal(tracker.update('one',650),'one');
  assert.deepEqual(hold(tracker,'one',730,20),[]);
  assert.deepEqual(hold(tracker,'two',2400,20),[]);
  assert.deepEqual(hold(tracker,'none',4100,20),[]);
  assert.deepEqual(hold(tracker,'two',5800,20),[]);
  hold(tracker,'fist',7500,5);
  assert.deepEqual(hold(tracker,'two',8000),['two']);
});
test('brief finger flashes and tracking gaps cannot complete a command',()=>{
  const tracker=new FingerCommandHold();
  hold(tracker,'one',0,4);hold(tracker,'two',320,4);
  tracker.update('none',640);assert.equal(tracker.update('two',720),null);
  assert.equal(tracker.update('two',1200),null);
  assert.equal(tracker.progress,0);
});
test('release requires a visible neutral hand for 300ms',()=>{
  const tracker=new FingerCommandHold();hold(tracker,'two');
  hold(tracker,'fist',1000,3);tracker.update('none',1240);hold(tracker,'fist',1320,3);
  assert.equal(tracker.locked,true);
  hold(tracker,'palm',1600,6);assert.equal(tracker.locked,false);
});
test('palm scrolling needs a neutral hold and continues until stopped',()=>{
  const tracker=new PalmScrollController({up:.3,down:.3});
  for(let i=0;i<6;i++){tracker.observe({x:.5,y:.5},i*80);assert.equal(tracker.tick(i*80),0);}
  let distance=0;
  for(let i=0;i<120;i++){const now=500+i*80;tracker.observe({x:.5,y:.8},now,1400);distance+=tracker.tick(now);}
  assert.ok(distance>4000);
  for(let i=0;i<6;i++)tracker.observe({x:.5,y:.2},10200+i*80);
  assert.ok(tracker.targetVelocity<0);
  tracker.stop();assert.equal(tracker.tick(10800),0);
});
test('neutral jitter and missing observations leave no scrolling inertia',()=>{
  const tracker=new PalmScrollController({up:.2,down:.2});
  for(let i=0;i<10;i++){tracker.observe({x:.5,y:.5},i*80);assert.equal(tracker.tick(i*80),0);}
  for(let i=0;i<5;i++){tracker.observe({x:.5,y:.8},800+i*80);tracker.tick(800+i*80);}
  assert.ok(tracker.targetVelocity>0);assert.equal(tracker.tick(1500),0);
});
test('hand scale supplies scroll sensitivity without a calibration screen',()=>{
  const near=palmReading(makeHand('palm'),16/9),far=palmReading(makeHand('palm',.5,.35,.4),16/9);
  assert.ok(near.range>far.range*1.8&&far.range>=.035);
  assert.ok(Number.isFinite(near.point.x)&&Number.isFinite(near.point.y));
});
test('hand crop restores original video coordinates',()=>{
  const crop=trackedHandCrop(makeHand('two'),1280,720);assert.ok(crop&&crop.size>=100);
  assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.size<=1280&&crop.y+crop.size<=720);
  const hand=restoreCroppedHand([{x:.5,y:.5,z:0}],crop,1280,720);
  assert.equal(hand[0].x,(crop.x+crop.size*.5)/1280);
});
