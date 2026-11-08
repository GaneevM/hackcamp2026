import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPointerMapReliable, isIndexPointing, mapFingerToScreen, summarizePointerSamples } from '../air-pointer.mjs';

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
});
