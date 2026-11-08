import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/database.js';
import { createIntegratedApp } from '../src/integrated-app.js';
import { createJournalStore, journalSchema } from '../src/journal-store.js';
import { SessionMetrics, localQuestion, feedbackText } from '../../session-metrics.js';

function sample(scope = 'guest') {
  return {
    scope,
    session: {
      id: 'integration-test', date: '2026-11-07T20:00:00Z',
      exercise: 'Elbow bend', metric: 'Elbow flexion', movement: 'elbow', side: 'left',
      reps: 2, duration: 1, angle: 105, startAngle: 15, excursion: 90,
      confidence: null, pain: null, note: '', manual: false, checkin: false
    },
    metrics: {
      source: 'camera', startedAt: '2026-11-07T19:59:00Z', durationSeconds: 60,
      targetReps: 5, angleConvention: 'flexion_deg_straight_is_0',
      minimumObservedAngleDeg: 15, maximumObservedAngleDeg: 105,
      trackingValidFraction: .9, trackingLossEvents: 1, incompleteCycles: 1,
      medianCompletionIntervalSeconds: 4, stopReason: 'user_ended',
      measurementProtocolId: 'formnote-side-view-observed-extrema-v1'
    }
  };
}

test('local camera records preserve flexion convention and do not enter synthetic tables', () => {
  const db = openDatabase(':memory:');
  try {
    const store = createJournalStore(db), input = sample();
    assert.deepEqual(store.save(input).metrics, input.metrics);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reports').get().n, 0);
    assert.equal(store.save(input).session.reps, 2);
    input.session.reps = 3;
    assert.throws(() => store.save(input), e => e.status === 409);
  } finally { db.close(); }
});

test('local profile scopes separate sessions, answers, and clearing', () => {
  const db = openDatabase(':memory:');
  try {
    const store = createJournalStore(db);
    store.save(sample()); store.save(sample('user-auth0%7Ctest'));
    const answered = store.answer('guest', 'integration-test', 'A fictional interruption.');
    assert.equal(answered.userReportedContext[0].source, 'user_reported');
    assert.equal(store.get('user-auth0%7Ctest', 'integration-test').userReportedContext.length, 0);
    assert.equal(answered.session.reps, 2);
    store.answer('guest', 'integration-test', 'A fictional interruption.');
    assert.equal(store.get('guest', 'integration-test').userReportedContext.length, 1);
    store.clear('guest');
    assert.equal(store.list('guest').length, 0);
    assert.equal(store.list('user-auth0%7Ctest').length, 1);
  } finally { db.close(); }
});

test('movement convention and manual source cannot be mislabeled', () => {
  const wrongAngle = sample(); wrongAngle.metrics.angleConvention = 'hip_shoulder_elbow_angle_deg_arm_down_is_0';
  assert.equal(journalSchema.safeParse(wrongAngle).success, false);
  const wrongSource = sample(); wrongSource.metrics.source = 'manual';
  assert.equal(journalSchema.safeParse(wrongSource).success, false);
});

test('tracking losses are debounced and stale incomplete cycles are counted once', () => {
  const run = new SessionMetrics({ manual: false, movement: 'elbow', targetReps: 5 }, 0);
  assert.deepEqual(run.observe({ ready: true, angle: 20, reps: 0, phase: 'ready' }, 0), []);
  assert.deepEqual(run.observe({ ready: false, angle: null, reps: 0, phase: 'moved' }, 100), []);
  assert.deepEqual(run.observe({ ready: false, angle: null, reps: 0, phase: 'moved' }, 500), ['tracking_lost']);
  run.observe({ ready: false, angle: null, reps: 0, phase: 'ready' }, 600);
  assert.deepEqual(run.observe({ ready: true, angle: 30, reps: 0, phase: 'ready' }, 700), ['tracking_restored']);
  const metrics = run.finish('ready', 1000);
  assert.equal(metrics.trackingLossEvents, 1);
  assert.equal(metrics.incompleteCycles, 1);
  assert.equal(metrics.trackingValidFraction, 2 / 5);
});

test('observed extrema and completion intervals are distinct from hold measurements', () => {
  const run = new SessionMetrics({ manual: false, movement: 'elbow', targetReps: null }, 0);
  run.observe({ ready: true, angle: 10, reps: 0, phase: 'ready' }, 0);
  run.observe({ ready: true, angle: 100, reps: 1, phase: 'ready' }, 4000);
  run.observe({ ready: true, angle: 20, reps: 2, phase: 'ready' }, 10000);
  const metrics = run.finish('moved', 12000);
  assert.equal(metrics.minimumObservedAngleDeg, 10);
  assert.equal(metrics.maximumObservedAngleDeg, 100);
  assert.equal(metrics.medianCompletionIntervalSeconds, 5);
  assert.equal(metrics.durationSeconds, 12);
  assert.equal(metrics.incompleteCycles, 1);
  assert.equal('estimatedExtensionHoldAngleDeg' in metrics, false);
});

test('manual sessions do not manufacture camera statistics', () => {
  const metrics = new SessionMetrics({ manual: true, movement: 'sit', targetReps: null }, 0).finish('ready', 5000);
  assert.equal(metrics.trackingValidFraction, null);
  assert.equal(metrics.maximumObservedAngleDeg, null);
  assert.equal(metrics.medianCompletionIntervalSeconds, null);
  assert.equal(metrics.incompleteCycles, null);
});

test('local follow-ups respond to observations without external generation', () => {
  const row = sample();
  assert.match(localQuestion(row.session, row.metrics), /below/);
  row.metrics.targetReps = 2;
  assert.match(localQuestion(row.session, row.metrics), /tracking/);
  row.metrics.trackingLossEvents = 0;
  assert.match(localQuestion(row.session, row.metrics), /incomplete/);
});

test('integrated HTTP flow serves app, stores local records, and rejects real data at Gemini endpoints', async t => {
  const db = openDatabase(':memory:');
  const app = createIntegratedApp(db, 'mock');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
  });
  for (const path of ['/', '/styles.css', '/redesign.css', '/app.js', '/companion.js', '/session-metrics.js']) assert.equal((await fetch(base + path)).status, 200);
  for (const path of ['/server/.env', '/.git/config', '/server/data/motion.sqlite']) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await post('/api/journal/sessions', sample(), { Origin: 'https://untrusted.invalid' })).status, 403);
  assert.equal((await post('/api/journal/sessions', sample())).status, 200);
  const history = await (await fetch(base + '/api/journal/sessions?scope=guest')).json();
  assert.equal(history.sessions.length, 1);
  assert.equal((await post('/api/journal/sessions/integration-test/context', { scope: 'guest', answer: 'Fictional explanation.' })).status, 200);
  const report = await (await fetch(base + '/api/journal/sessions/integration-test/report?scope=guest')).json();
  assert.equal(report.mode, 'local'); assert.equal(report.session.reps, 2);
  assert.equal(report.userReportedContext[0].answer, 'Fictional explanation.');
  const fictional = await (await fetch(base + '/api/demo-session')).json();
  const actual = structuredClone(fictional); actual.dataSource = 'camera';
  assert.equal((await post('/api/reports', actual)).status, 400);
  assert.equal((await post('/api/sessions', actual)).status, 400);
  const syntheticReport = await post('/api/reports', fictional);
  assert.equal(syntheticReport.status, 201);
  assert.equal((await syntheticReport.json()).dataSource, 'synthetic');
});


test('feedback names the selected exercise joints and supports every rep in encouraging mode', () => {
  assert.match(feedbackText('tracking_lost', 'encouraging', 'sit'), /hip, knee, and ankle/);
  assert.match(feedbackText('tracking_lost', 'concise', 'reach'), /hip, shoulder, and elbow/);
  assert.match(feedbackText('tracking_lost', 'quiet', 'elbow'), /shoulder, elbow, and wrist/);
  assert.equal(feedbackText('rep_completed', 'encouraging', 'sit'), 'Another repetition recorded.');
  assert.equal(feedbackText('rep_completed', 'quiet', 'sit'), null);
  assert.doesNotMatch(feedbackText('tracking_restored', 'encouraging', 'sit'), /arm/);
});
