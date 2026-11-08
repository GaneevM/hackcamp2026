import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanion } from '../../companion.js';

async function harness(t, preferences = null) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, textContent: '', replaceChildren() {} });
    return elements.get(id);
  };
  element('mode').value = 'encouraging';
  element('source').value = 'browser';
  element('enabled').checked = true;
  const spoken = [], tones = [], rewards = [];
  class AudioContext {
    state = 'running'; currentTime = 0; destination = {};
    resume() { return Promise.resolve(); }
    createOscillator() { return { frequency: { setValueAtTime(value) { tones.push(value); } }, connect() {}, disconnect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  const speech = {
    speaking: false, getVoices: () => [], addEventListener() {},
    cancel() { this.speaking = false; },
    speak(item) { this.speaking = true; spoken.push(item); }
  };
  const panel = { style: {}, querySelector: selector => element(selector.match(/data-id="([^"]+)"/)[1]) };
  const replacements = {
    document: { createElement: () => panel, querySelector: () => ({ after() {} }) },
    window: { speechSynthesis: speech, AudioContext },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    localStorage: { getItem: key => key === 'formnote-companion-preferences' ? JSON.stringify(preferences) : null, setItem() {} },
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
    onRep: reward => rewards.push(reward), getPhase: () => 'ready', getMovement: () => 'sit', resetIncompleteCycle() {}
  });
  await new Promise(resolve => setImmediate(resolve));
  return {
    companion, spoken, tones, rewards, element,
    finishSpeech() {
      const latest = spoken.at(-1); speech.speaking = false; latest.onend?.();
    }
  };
}

test('rep chimes play immediately during speech without interrupting or queuing spoken rep lines', async t => {
  const h = await harness(t);
  h.companion.start({ manual: true, movement: 'sit', targetReps: 5 });
  h.companion.manualRep(1);
  h.companion.manualRep(2);
  assert.equal(h.tones.length, 6);
  assert.equal(h.spoken.length, 1);
  assert.equal(h.rewards.length, 2);
  h.finishSpeech();
  assert.equal(h.spoken.length, 1);
  h.companion.manualRep(1, false);
  assert.equal(h.tones.length, 6);
});

test('camera reps each trigger a chime and the configured goal celebrates only once', async t => {
  const h = await harness(t);
  h.companion.start({ manual: false, movement: 'elbow', targetReps: 2 });
  h.companion.observe({ ready: true, angle: 20, reps: 1, phase: 'ready' });
  h.companion.observe({ ready: true, angle: 20, reps: 2, phase: 'ready' });
  h.companion.observe({ ready: true, angle: 20, reps: 2, phase: 'ready' });
  assert.equal(h.tones.length, 7);
  assert.equal(h.rewards.length, 2);
  assert.equal(h.rewards[1].goalReached, true);
  assert.equal(h.spoken.length, 1);
});

test('camera-wave check rewards cycles and explicitly explains why it has no follow-up', async t => {
  const h = await harness(t);
  h.companion.start({ manual: false, movement: 'wave', targetReps: null });
  h.companion.observe({ ready: true, angle: null, reps: 1, phase: 'ready' });
  assert.equal(h.tones.length, 3);
  assert.match(h.element('activity').textContent, /1 reps recorded/);
  await h.companion.finish({});
  assert.match(h.element('status').textContent, /not saved/);
  assert.match(h.element('event').textContent, /framing test/);
  assert.equal(h.element('followup').hidden, true);
});

test('preview chime works without an active session and mute suppresses the sound', async t => {
  const h = await harness(t);
  h.element('testRep').onclick();
  assert.equal(h.tones.length, 3);
  assert.equal(h.spoken.length, 0);
  h.element('enabled').checked = false;
  h.element('testRep').onclick();
  assert.equal(h.tones.length, 3);
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

test('voice is enabled with Gemini-first playback and encouraging cues on first use', async t => {
  const h = await harness(t);
  assert.equal(h.element('enabled').checked, true);
  assert.equal(h.element('source').value, 'gemini');
  assert.equal(h.element('mode').value, 'encouraging');
  assert.equal(h.element('voiceLabel').textContent, 'Voice on');
  h.element('modeConcise').onclick();
  assert.equal(h.element('mode').value, 'concise');
  assert.equal(h.element('modeConcise').ariaPressed, 'true');
  assert.equal(h.element('modeEncouraging').ariaPressed, 'false');
});

test('a returning user keeps their muted voice and selected companion style', async t => {
  const h = await harness(t, { enabled: false, mode: 'quiet', source: 'gemini' });
  assert.equal(h.element('enabled').checked, false);
  assert.equal(h.element('mode').value, 'quiet');
  assert.equal(h.element('source').value, 'gemini');
  assert.equal(h.element('voiceLabel').textContent, 'Voice muted');
  h.companion.start({ manual: true, movement: 'sit', targetReps: 5 });
  assert.equal(h.spoken.length, 0);
});

test('quiet style suppresses rep sound but preserves visual count feedback', async t => {
  const h = await harness(t, { version: 2, enabled: true, mode: 'quiet', source: 'browser' });
  assert.equal(h.element('source').value, 'browser');
  h.companion.start({ manual: true, movement: 'sit', targetReps: null });
  h.companion.manualRep(1);
  assert.equal(h.tones.length, 0);
  assert.equal(h.rewards.length, 1);
});

test('new-session reset clears the completed view without deleting saved history or resetting an active run', async t => {
  const h = await harness(t);
  h.companion.start({ manual:true, movement:'sit', targetReps:5 });
  assert.equal(h.companion.reset(), false);
  h.companion.manualRep(1);
  await h.companion.finish({id:'reset-test',reps:1});
  assert.equal(h.element('followup').hidden, false);
  assert.equal(h.companion.reset(), true);
  assert.equal(h.element('followup').hidden, true);
  assert.match(h.element('activity').textContent, /Ready when you are/);
  const spoken = h.spoken.length;
  h.finishSpeech();
  assert.equal(h.spoken.length, spoken);
  h.companion.start({ manual:true, movement:'sit', targetReps:5 });
  assert.match(h.element('activity').textContent, /0 reps recorded/);
});
