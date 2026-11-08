import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanion } from '../../companion.js';

async function harness(t) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, textContent: '', replaceChildren() {} });
    return elements.get(id);
  };
  element('mode').value = 'encouraging';
  element('source').value = 'browser';
  element('enabled').checked = true;
  const spoken = [];
  const speech = {
    speaking: false, getVoices: () => [], addEventListener() {},
    cancel() { this.speaking = false; },
    speak(item) { this.speaking = true; spoken.push(item); }
  };
  const panel = { style: {}, querySelector: selector => element(selector.match(/data-id="([^"]+)"/)[1]) };
  const replacements = {
    document: { createElement: () => panel, querySelector: () => ({ after() {} }) },
    window: { speechSynthesis: speech },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async (path, init) => ({
      ok: !path.startsWith('/voice-assets/'),
      headers: { get: () => 'application/json' },
      json: async () => path === '/health' ? { integration: 'local-journal-v1' } : path === '/api/journal/sessions' && init?.body ? JSON.parse(init.body) : { sessions: [] }
    })
  };
  const originals = new Map();
  for (const [key, value] of Object.entries(replacements)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const companion = createCompanion({
    getScope: () => 'guest', getRows: () => [], setRows() {}, render() {},
    getPhase: () => 'ready', getMovement: () => 'sit', resetIncompleteCycle() {}
  });
  await new Promise(resolve => setImmediate(resolve));
  return {
    companion, spoken, element,
    finishSpeech() {
      const latest = spoken.at(-1); speech.speaking = false; latest.onend?.();
    }
  };
}

test('manual reps receive encouraging speech after introduction; pending notices are bounded and cancelable', async t => {
  const h = await harness(t);
  h.companion.start({ manual: true, movement: 'sit', targetReps: 5 });
  h.companion.manualRep(1);
  assert.equal(h.spoken.length, 1);
  h.finishSpeech();
  assert.equal(h.spoken.at(-1).text, 'Another repetition recorded.');
  h.companion.manualRep(2);
  h.companion.manualRep(3);
  h.finishSpeech();
  assert.equal(h.spoken.length, 3); // one latest pending notice, not two queued messages
  h.companion.manualRep(4);
  h.element('stop').onclick();
  h.finishSpeech();
  assert.equal(h.spoken.length, 3);
});

test('encouraging camera feedback speaks on reps one and two, not only every third rep', async t => {
  const h = await harness(t);
  h.companion.start({ manual: false, movement: 'elbow', targetReps: 5 });
  h.finishSpeech();
  h.companion.observe({ ready: true, angle: 20, reps: 1, phase: 'ready' });
  assert.equal(h.spoken.at(-1).text, 'Another repetition recorded.');
  h.finishSpeech();
  h.companion.observe({ ready: true, angle: 20, reps: 2, phase: 'ready' });
  assert.equal(h.spoken.length, 3);
  assert.equal(h.spoken.at(-1).text, 'Another repetition recorded.');
});


test('camera-wave demo emits speech and never persists a practice session', async t => {
  const h = await harness(t);
  h.companion.start({ manual: false, movement: 'wave', targetReps: null });
  assert.match(h.element('activity').textContent, /Camera wave check/);
  h.finishSpeech();
  h.companion.observe({ ready: true, angle: null, reps: 1, phase: 'ready' });
  assert.equal(h.spoken.at(-1).text, 'Another repetition recorded.');
  assert.match(h.element('activity').textContent, /1 reps recorded/);
  await h.companion.finish({});
  assert.match(h.element('status').textContent, /not saved/);
});

test('explicit test-rep button plays without an active tracking session', async t => {
  const h = await harness(t);
  h.element('testRep').onclick();
  assert.equal(h.spoken.at(-1).text, 'Another repetition recorded.');
});

test('enabling spoken feedback gives an immediate audible acknowledgement', async t => {
  const h = await harness(t);
  h.element('enabled').onchange();
  assert.equal(h.spoken.at(-1).text, 'Spoken feedback is enabled.');
});

test('session end speaks exactly the displayed results-based question after confirmation', async t => {
  const h = await harness(t);
  h.companion.start({ manual: true, movement: 'sit', targetReps: 5 });
  h.finishSpeech();
  await h.companion.finish({ id: 'question-test', reps: 1 });
  assert.equal(h.spoken.at(-1).text, 'Your session has ended.');
  const question = h.element('question').textContent;
  assert.match(question, /below the repetition goal/);
  h.finishSpeech();
  assert.equal(h.spoken.at(-1).text, question);
});

test('stop speaking cancels the pending post-session question', async t => {
  const h = await harness(t);
  h.companion.start({ manual: true, movement: 'sit', targetReps: 5 });
  await h.companion.finish({ id: 'cancel-question', reps: 1 });
  const count = h.spoken.length;
  h.element('stop').onclick();
  h.finishSpeech();
  assert.equal(h.spoken.length, count);
});

test('quiet mode keeps the follow-up on screen without speaking it', async t => {
  const h = await harness(t);
  h.element('mode').value = 'quiet';
  h.companion.start({ manual: true, movement: 'sit', targetReps: 5 });
  await h.companion.finish({ id: 'quiet-question', reps: 1 });
  assert.match(h.element('question').textContent, /below the repetition goal/);
  assert.equal(h.spoken.length, 0);
});
