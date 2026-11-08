import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPointerMapReliable, isIndexPointing, isOpenPalm, isFist, mapFingerToScreen, summarizePointerSamples, pointerBodyReference, pointerCoordinates, pointerHandCrop, restoreCroppedHand, PointerFilter, PointerSwipeTracker, PointerButtonLatch, PalmScrollController } from '../air-pointer.mjs';

test('pointer sample summary rejects isolated tracking spikes', () => {
  const samples=Array.from({length:12},(_,index)=>({x:.4+(index%3-.9)*.002,y:.6+(index%4-1.5)*.002}));
  samples.push({x:.98,y:.03});
  const result=summarizePointerSamples(samples);
  assert.ok(result);
  assert.equal(result.count,12);
  assert.ok(Math.abs(result.point.x-.4)<.01);
  assert.ok(Math.abs(result.point.y-.6)<.01);
});

test('pointer calibration map tolerates one inaccurate target sample', () => {
  const points=[{x:.12,y:.2},{x:.88,y:.2},{x:.88,y:.88},{x:.12,y:.88},{x:.5,y:.54}];
  const pairs=points.map(point=>({camera:{...point},screen:{...point}}));
  pairs[4].camera={x:.78,y:.9};
  const {map,inliers}=fitPointerMapReliable(pairs);
  assert.equal(inliers,4);
  assert.ok(Math.hypot(mapFingerToScreen(map,{x:.5,y:.5}).x-.5,mapFingerToScreen(map,{x:.5,y:.5}).y-.5)<.05);
});

test('pointing gesture tolerates foreshortened fingers but rejects an open palm', () => {
  const hand=Array.from({length:21},()=>({x:0,y:0,z:0}));
  hand[0]={x:0,y:0,z:0};
  for(const [pip,tip] of [[6,8],[10,12],[14,16],[18,20]]){hand[pip]={x:1,y:0,z:0};hand[tip]={x:1.07,y:0,z:0};}
  hand[8]={x:1.12,y:0,z:0};
  assert.equal(isIndexPointing(hand),true);
  for(const tip of [8,12,16,20])hand[tip]={x:1.2,y:0,z:0};
  assert.equal(isIndexPointing(hand),false);
  assert.equal(isOpenPalm(hand),true);
});

test('four distant corner positions calibrate without requiring a fifth point',()=>{
  const screen=[{x:.12,y:.4},{x:.88,y:.4},{x:.88,y:.88},{x:.12,y:.88}];
  const pairs=screen.map(p=>({screen:p,camera:{x:.6-p.x*.15,y:.3+p.y*.15}}));
  const {map}=fitPointerMapReliable(pairs);
  const center=mapFingerToScreen(map,{x:.525,y:.396});
  assert.ok(Math.abs(center.x-.5)<.001&&Math.abs(center.y-.64)<.001);
  assert.throws(()=>fitPointerMapReliable(screen.map(p=>({screen:p,camera:{x:.5,y:.5}}))),/Move your hand/);
});

function bodyAt(scale,shift={x:0,y:0}) {
  const pose=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
  const transform=p=>({x:shift.x+.5+(p.x-.5)*scale,y:shift.y+.5+(p.y-.5)*scale,visibility:1});
  pose[11]=transform({x:.35,y:.4});pose[12]=transform({x:.65,y:.4});
  pose[13]=transform({x:.3,y:.5});pose[15]=transform({x:.25,y:.25});pose[19]=transform({x:.25,y:.2});
  return {pose,transform};
}
test('body coordinates preserve aiming after moving farther away and sideways',()=>{
  const near=bodyAt(1),far=bodyAt(.4,{x:.13,y:.05}),tip={x:.25,y:.2};
  const a=pointerCoordinates(near.transform(tip),pointerBodyReference(near.pose,16/9));
  const b=pointerCoordinates(far.transform(tip),pointerBodyReference(far.pose,16/9));
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-10);
  assert.equal(pointerBodyReference(null),null);
});
test('distant hand crop stays in the image and restores full-frame coordinates',()=>{
  const {pose}=bodyAt(.4),crop=pointerHandCrop(pose,1280,720);
  assert.ok(crop&&crop.size>=100&&crop.x>=0&&crop.y>=0&&crop.x+crop.size<=1280&&crop.y+crop.size<=720);
  const hand=restoreCroppedHand([{x:.5,y:.5,z:.1}],crop,1280,720);
  assert.equal(hand[0].x,(crop.x+crop.size*.5)/1280);
  assert.equal(hand[0].y,(crop.y+crop.size*.5)/720);
  assert.equal(pointerHandCrop(null,1280,720),null);
});
test('cursor filter suppresses stationary jitter and isolated jumps while following deliberate movement',()=>{
  const filter=new PointerFilter();let result;
  const output=[];
  for(let i=0;i<40;i++){result=filter.update({x:.5+(i%2?.012:-.012),y:.5},i*75);if(i>10)output.push(result.x);}
  assert.ok(Math.max(...output)-Math.min(...output)<.012);
  result=filter.update({x:.99,y:.01},3000);assert.ok(Math.abs(result.x-.5)<.03);
  for(let i=1;i<=12;i++)result=filter.update({x:.85,y:.8},3000+i*75);
  assert.ok(result.x>.84&&result.y>.79);
  result=filter.update({x:.2,y:.2},5000);assert.deepEqual(result,{x:.2,y:.2});
});
function stroke(tracker,{start=.6,end=.25,at=0,horizontal=0}={}) {
  const events=[];
  for(let i=0;i<5;i++){const e=tracker.update({x:.5,y:start},at+i*75);if(e)events.push(e);}
  for(let i=1;i<=6;i++){const e=tracker.update({x:.5+horizontal*i/6,y:start+(end-start)*i/6},at+300+i*75);if(e)events.push(e);}
  for(let i=1;i<=6;i++){const e=tracker.update({x:.5+horizontal,y:end},at+750+i*75);if(e)events.push(e);}
  return events;
}
test('swipes require a steady start and stop, emit once, and learn both directions',()=>{
  const tracker=new PointerSwipeTracker({up:.18,down:.2});
  const up=stroke(tracker);assert.equal(up.length,1);assert.equal(up[0].direction,'up');assert.ok(up[0].distance>.3);
  const held=[];for(let now=1275;now<2700;now+=75){const event=tracker.update({x:.5,y:.25},now);if(event)held.push(event);}
  assert.equal(held.length,0);
  const down=stroke(tracker,{start:.25,end:.7,at:2775});assert.equal(down.length,1);assert.equal(down[0].direction,'down');
});
test('swipe calibration ignores entering frame, diagonal movement, jitter, and tracking gaps',()=>{
  const tracker=new PointerSwipeTracker({up:.1,down:.1});
  for(let i=0;i<12;i++)assert.equal(tracker.update({x:.5,y:.8-i*.04},i*75),null);
  tracker.reset();assert.equal(stroke(tracker,{horizontal:.5}).length,0);
  tracker.reset();assert.equal(stroke(tracker,{start:.5,end:.49}).length,0);
  tracker.reset();for(let i=0;i<5;i++)tracker.update({x:.5,y:.6},i*75);
  assert.equal(tracker.update(null,350),null);assert.equal(tracker.update({x:.5,y:.2},700),null);
});

test('button latch resists tremor and releases on a deliberate exit',()=>{
  const latch=new PointerButtonLatch(),rect={left:100,right:220,top:100,bottom:142};
  latch.acquire({x:160,y:120});
  for(let now=0;now<1000;now+=50)assert.equal(latch.update({x:160+(now%100?12:-12),y:120+(now%100?25:-25)},rect,now),true);
  assert.equal(latch.update({x:160,y:180},rect,1000),true);
  assert.equal(latch.update({x:160,y:180},rect,1150),false);
  latch.acquire({x:160,y:120});assert.equal(latch.update({x:400,y:120},rect,1200),false);
});
test('precision filtering damps stationary shaking while following a clear move',()=>{
  const filter=new PointerFilter(),options={width:1280,height:800,precision:true},values=[];
  for(let i=0;i<50;i++){const p=filter.update({x:.5+(i%2?1:-1)*.012,y:.5},i*80,options);if(i>12)values.push(p.x);}
  assert.ok((Math.max(...values)-Math.min(...values))*1280<9);
  let point;for(let i=0;i<10;i++)point=filter.update({x:.8,y:.7},4000+i*80,options);
  assert.ok(point.x>.78&&point.y>.68);
});
function armPalm(controller,start=0) {for(let i=0;i<5;i++){controller.observe({x:.5,y:.5},start+i*80);controller.tick(start+i*80);}}
test('open palm deflection scrolls continuously in both directions and farther means faster',()=>{
  const controller=new PalmScrollController({up:.3,down:.3});armPalm(controller);
  assert.equal(controller.armed,true);
  for(let i=0;i<6;i++){controller.observe({x:.5,y:.62},400+i*80,1200);controller.tick(400+i*80);}
  const slow=controller.targetVelocity;assert.ok(slow>0);
  for(let i=0;i<6;i++)controller.observe({x:.5,y:.8},900+i*80,1200);
  assert.ok(controller.targetVelocity>slow*2);
  let distance=0;
  for(let i=0;i<100;i++){const now=1400+i*80;controller.observe({x:.5,y:.8},now,1200);distance+=controller.tick(now);}
  assert.ok(distance>3000,'One held palm should cover a long page');
  for(let i=0;i<6;i++)controller.observe({x:.5,y:.2},9500+i*80,1200);
  assert.ok(controller.targetVelocity<0);
});
test('neutral jitter, missing hand and explicit stop cannot leave scrolling running',()=>{
  const controller=new PalmScrollController({up:.3,down:.3});armPalm(controller);
  for(let i=0;i<10;i++){const now=400+i*80;controller.observe({x:.5,y:.5+(i%2?.01:-.01)},now);assert.equal(controller.tick(now),0);}
  for(let i=0;i<5;i++){controller.observe({x:.5,y:.8},1300+i*80);controller.tick(1300+i*80);}
  assert.ok(controller.targetVelocity>0);
  controller.stop();for(let now=1700;now<2200;now+=16)assert.equal(controller.tick(now),0);
  armPalm(controller,2300);for(let i=0;i<5;i++){controller.observe({x:.5,y:.8},2700+i*80);controller.tick(2700+i*80);}
  assert.equal(controller.tick(3300),0);assert.equal(controller.armed,false);
});
test('a fist is distinct from pointing and an open palm',()=>{
  const hand=Array.from({length:21},()=>({x:0,y:0,z:0}));
  for(const [pip,tip] of [[6,8],[10,12],[14,16],[18,20]]){hand[pip]={x:1,y:0,z:0};hand[tip]={x:.7,y:0,z:0};}
  assert.equal(isFist(hand),true);assert.equal(isOpenPalm(hand),false);assert.equal(isIndexPointing(hand),false);
  hand[8]={x:1.3,y:0,z:0};assert.equal(isFist(hand),false);assert.equal(isIndexPointing(hand),true);
  for(const tip of [8,12,16,20])hand[tip]={x:1.3,y:0,z:0};assert.equal(isFist(hand),false);assert.equal(isOpenPalm(hand),true);
});
