import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePoseAngles } from '../pose-calibration.mjs';

test('pose calibration uses a stable median and ignores transient tracking spikes', () => {
  const samples=Array.from({length:24},(_,index)=>42+(index%5-2));
  samples.push(5,170,103);
  const result=summarizePoseAngles(samples);
  assert.ok(result);
  assert.equal(result.angle,42);
  assert.equal(result.stable,true);
  assert.equal(result.count,24);
});

test('pose calibration reports motion instead of saving a changing pose', () => {
  const samples=Array.from({length:24},(_,index)=>index%2?25:95);
  const result=summarizePoseAngles(samples);
  assert.ok(result);
  assert.equal(result.stable,false);
});

test('pose calibration waits until enough camera observations exist', () => {
  assert.equal(summarizePoseAngles([30,31,29,30,31,30]),null);
});
