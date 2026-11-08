import test from 'node:test';
import assert from 'node:assert/strict';
import { WaveCounter } from '../../session-metrics.js';

function point(counter, position, now, extra = {}) {
  return counter.update({ position, now, arm: 'left', raised: true, threshold: .04, ...extra }, now);
}
function cycle(counter, origin, end, offset = 0) {
  const results = [
    point(counter, origin, offset), point(counter, end, offset + 100),
    point(counter, end, offset + 180), point(counter, origin, offset + 300),
    point(counter, origin, offset + 380)
  ];
  return results.filter(Boolean).length;
}

test('wave counts out-and-back while wrist stays entirely on one side of shoulder', () => {
  assert.equal(cycle(new WaveCounter(), .2, .27), 1);
  assert.equal(cycle(new WaveCounter(), -.2, -.27), 1);
});
test('wave counts either initial direction and repeated complete cycles', () => {
  const counter = new WaveCounter();
  assert.equal(cycle(counter, .2, .13), 1);
  assert.equal(cycle(counter, .2, .27, 500), 1);
});
test('stationary hand jitter and holding away do not create cycles', () => {
  const counter = new WaveCounter();
  for (let i = 0; i < 30; i++) assert.equal(point(counter, .2 + (i % 2 ? .005 : -.005), i * 20), false);
  point(counter, .28, 650); point(counter, .28, 750);
  for (let i = 0; i < 10; i++) assert.equal(point(counter, .28, 800 + i * 20), false);
});
test('lowering the hand invalidates an incomplete wave', () => {
  const counter = new WaveCounter();
  point(counter, .2, 0); point(counter, .28, 100); point(counter, .28, 180);
  point(counter, .28, 200, { raised: false });
  assert.equal(point(counter, .2, 300), false);
  assert.equal(point(counter, .2, 400), false);
});
test('switching arms does not complete another arms partial cycle', () => {
  const counter = new WaveCounter();
  point(counter, .2, 0); point(counter, .28, 100); point(counter, .28, 180);
  assert.equal(point(counter, .2, 300, { arm: 'right' }), false);
  assert.equal(point(counter, .2, 400, { arm: 'right' }), false);
});
test('tracking gaps reset partial waves rather than counting across occlusion', () => {
  const counter = new WaveCounter();
  point(counter, .2, 0); point(counter, .28, 100); point(counter, .28, 180);
  assert.equal(point(counter, .2, 900), false);
  assert.equal(point(counter, .2, 1000), false);
});
