import { SessionMetrics, localQuestion, feedbackText } from './session-metrics.js';

export function createCompanion(options) {
  const panel = document.createElement('section');
  panel.className = 'card panel';
  panel.style.marginTop = '16px';
  panel.innerHTML = `
    <h2>Session companion</h2>
    <p>Camera and manual sessions stay in the local journal. Gemini uses only the explicitly fictional demo below.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      <label><input type="checkbox" data-id="enabled"> Spoken feedback</label>
      <label>Mode <select data-id="mode"><option value="concise">Concise</option><option value="encouraging">Encouraging</option><option value="quiet">Quiet</option></select></label>
      <label>Speech <select data-id="source"><option value="browser">Browser voice</option><option value="gemini">Cached Gemini / browser fallback</option></select></label>
      <label>Browser voice <select data-id="voice"><option value="">System default</option></select></label>
      <button type="button" class="secondary" data-id="preview">Preview voice</button>
      <button type="button" class="secondary" data-id="testRep">Test rep sound</button>
      <button type="button" class="secondary" data-id="stop">Stop speaking</button>
    </div>
    <p data-id="status" role="status">Checking local backend…</p>
    <p data-id="activity">No active session. Start a camera session or use Manual log.</p>
    <p data-id="event" aria-live="polite"></p>
    <hr>
    <button type="button" class="secondary" data-id="demo" disabled>Load fictional Gemini demo</button>
    <small>Uses a fixed fictional 8/10-rep session, not your camera measurements. A missing question uses Gemini text quota.</small>
    <div data-id="followup" hidden>
      <p><strong data-id="kind"></strong></p>
      <p data-id="question"></p>
      <button type="button" class="secondary" data-id="read">Read question aloud</button>
      <label style="display:block">Optional session explanation
        <textarea data-id="answer" maxlength="2000" rows="3" style="width:100%"></textarea>
      </label>
      <button type="button" class="secondary" data-id="save">Save explanation</button>
      <button type="button" class="secondary" data-id="report">Show local summary</button>
      <pre data-id="summary" style="white-space:pre-wrap;overflow-wrap:anywhere" hidden></pre>
    </div>`;
  document.querySelector('#movement').after(panel);
  const el = id => panel.querySelector(`[data-id="${id}"]`);
  let online = false, run = null, current = null, audio = null, utterance = null;
  let voiceVersion = 0, viewVersion = 0, busy = false;
  let voices = [], manifests = {}, demoPayload = null;
  let preferredVoice = '';
  let pendingRep = false, pendingQuestion = null;
  try { preferredVoice = localStorage.getItem('exercise-demo-browser-voice') || ''; } catch {}
  const status = text => { el('status').textContent = text; };

  async function request(path, body, method = 'POST') {
    const response = await fetch(path, {
      method, headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(65000)
    });
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw new Error('Local backend unavailable. Open this app through npm start at localhost:3001.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Backend request failed.');
    return data;
  }
  function stop() {
    pendingRep = false; pendingQuestion = null;
    voiceVersion++;
    if (audio) { audio.pause(); audio = null; }
    window.speechSynthesis?.cancel(); utterance = null;
  }
  function browserSpeak(text, prefix = '') {
    if (!('speechSynthesis' in window)) { status(prefix + 'Speech unavailable; read the on-screen message.'); return; }
    const version = voiceVersion;
    utterance = new SpeechSynthesisUtterance(text);
    const selected = voices.find(v => v.voiceURI === el('voice').value);
    if (selected) utterance.voice = selected;
    utterance.lang = selected?.lang || 'en-US'; utterance.rate = .95;
    utterance.onend = () => { if (version === voiceVersion) { utterance = null; status('Ready · browser voice.'); flushRep(); flushQuestion(); } };
    utterance.onerror = () => { if (version === voiceVersion) { utterance = null; status('Browser speech unavailable. Try another voice.'); } };
    status(prefix + 'Speaking with browser voice.'); window.speechSynthesis.speak(utterance);
  }
  function populateVoices() {
    voices = window.speechSynthesis?.getVoices() || [];
    el('voice').replaceChildren(new Option('System default', ''), ...voices.map(v => new Option(`${v.name} — ${v.lang}`, v.voiceURI)));
    if (voices.some(v => v.voiceURI === preferredVoice)) el('voice').value = preferredVoice;
  }
  populateVoices(); window.speechSynthesis?.addEventListener('voiceschanged', populateVoices);
  el('voice').onchange = () => { stop(); preferredVoice = el('voice').value; try { localStorage.setItem('exercise-demo-browser-voice', preferredVoice); } catch {} };
  el('stop').onclick = () => { stop(); status('Speech stopped. Future session events may speak.'); };
  el('testRep').onclick = () => { stop(); event('rep_completed'); };
  el('preview').onclick = () => { stop(); browserSpeak('Hello. This is your selected companion voice.'); };
  el('mode').onchange = () => { stop(); status('Mode changed. It will apply to subsequent events.'); };
  el('source').onchange = stop;
  el('enabled').onchange = () => {
    stop();
    if (el('enabled').checked) browserSpeak('Spoken feedback is enabled.');
    else status('Spoken feedback disabled.');
  };

  function updateActivity() {
    if (!run) { el('activity').textContent = 'No active session. Start a camera session or use Manual log.'; return; }
    const labels = { sit: 'Sit-to-stand', reach: 'Overhead reach', elbow: 'Elbow bend', wave: 'Camera wave check (not saved)' };
    el('activity').textContent = 'Active: ' + (labels[run.config.movement] || run.config.movement) + ' · ' + run.reps + ' reps recorded.';
  }

  function flushRep() {
    if (!pendingRep) return;
    pendingRep = false;
    if (run && !run.lost && el('enabled').checked) event('rep_completed');
  }

  function flushQuestion() {
    if (!pendingQuestion || run || audio || window.speechSynthesis?.speaking) return;
    const queued = pendingQuestion;
    pendingQuestion = null;
    if (queued.view !== viewVersion || queued.voice !== voiceVersion ||
        current?.question !== queued.text || !el('enabled').checked || el('mode').value === 'quiet') return;
    stop();
    browserSpeak(queued.text);
  }

  async function event(name) {
    const mode = el('mode').value;
    const text = feedbackText(name, mode, run?.config.movement || options.getMovement());
    el('event').textContent = text || name.replaceAll('_', ' ') + ' · staying silent';
    if (!text || !el('enabled').checked) return;
    const clip = manifests[mode]?.clips?.[name];
    if (name === 'rep_completed' && (audio || window.speechSynthesis?.speaking)) {
      pendingRep = true;
      return;
    }
    stop(); const version = voiceVersion;
    // Cached audio is valid only when its transcript matches the current message.
    // Old arm-only recordings must not override exercise-specific joint guidance.
    if (el('source').value === 'gemini' && clip?.fileName && clip.text === text) {
      audio = new Audio('/voice-assets/' + encodeURIComponent(clip.fileName));
      audio.onended = () => { if (version === voiceVersion) { audio = null; flushRep(); flushQuestion(); } };
      audio.onerror = () => {
        if (version !== voiceVersion) return;
        audio = null;
        browserSpeak(text, 'Cached audio unavailable. ');
      };
      try { await audio.play(); if (version === voiceVersion) status('Playing cached Gemini audio · no generation request.'); return; }
      catch { if (version !== voiceVersion) return; audio?.pause(); audio = null; }
    }
    if (version === voiceVersion) browserSpeak(text, el('source').value === 'gemini' ? 'Using browser voice for the current message. ' : '');
  }

  function present(value) {
    current = value; viewVersion++; el('followup').hidden = false; el('summary').hidden = true;
    el('kind').textContent = value.kind === 'synthetic'
      ? 'FICTIONAL Gemini demo · no camera data sent'
      : 'Local session · template follow-up · no external AI request';
    el('question').textContent = value.question;
    el('answer').value = value.answer || '';
    el('answer').disabled = value.kind === 'synthetic' && value.answer !== null;
    el('save').disabled = el('answer').disabled;
    el('report').textContent = value.kind === 'synthetic' ? 'Generate fictional Gemini report' : 'Show local summary';
  }
  el('read').onclick = async () => {
    if (!current || busy) return;
    stop(); const version = voiceVersion, selected = current;
    if (el('mode').value === 'quiet') { status('Quiet mode: question stays on screen.'); return; }
    if (selected.kind !== 'synthetic' || el('source').value !== 'gemini') { browserSpeak(selected.question); return; }
    busy = true; status('Preparing fictional Gemini question audio…');
    try {
      const result = await request(`/api/follow-ups/${encodeURIComponent(selected.followUpId)}/audio`, {});
      if (version !== voiceVersion) return;
      audio = new Audio(result.audioUrl);
      audio.onended = () => { if (version === voiceVersion) audio = null; };
      await audio.play(); if (version === voiceVersion) status('Playing Gemini-generated question.');
    } catch { if (version === voiceVersion) { audio?.pause(); audio = null; browserSpeak(selected.question, 'Gemini audio unavailable. '); } }
    finally { busy = false; }
  };
  el('save').onclick = async () => {
    if (!current || busy || !el('answer').value.trim()) return;
    const selected = current, version = viewVersion; busy = true;
    try {
      if (selected.kind === 'synthetic') {
        const result = await request(`/api/follow-ups/${encodeURIComponent(selected.followUpId)}/answer`, { answer: el('answer').value.trim() });
        if (version === viewVersion) present({ ...selected, ...result });
      } else {
        const result = await request(`/api/journal/sessions/${encodeURIComponent(selected.session.id)}/context`, { scope: selected.scope, answer: el('answer').value.trim() });
        if (version === viewVersion) present({ ...selected, ...result, answer: result.userReportedContext.at(-1)?.answer || '' });
      }
      if (version === viewVersion || current?.followUpId === selected.followUpId) status('Explanation saved as user-reported context. Measurements unchanged.');
    } catch (error) { status(error.message); }
    finally { busy = false; }
  };
  el('report').onclick = async () => {
    if (!current || busy) return;
    const selected = current, version = viewVersion; busy = true;
    status(selected.kind === 'synthetic' ? 'Generating a report from fictional data…' : 'Reading local summary…');
    try {
      const report = selected.kind === 'synthetic'
        ? await request('/api/reports', selected.payload)
        : await request(`/api/journal/sessions/${encodeURIComponent(selected.session.id)}/report?scope=${encodeURIComponent(selected.scope)}`, undefined, 'GET');
      if (version !== viewVersion) return;
      el('summary').textContent = JSON.stringify(report, null, 2); el('summary').hidden = false;
      status(selected.kind === 'synthetic' ? 'Fictional Gemini report saved.' : 'Local summary · no Gemini request.');
    } catch (error) { if (version === viewVersion) status(error.message); }
    finally { busy = false; }
  };
  el('demo').onclick = async () => {
    if (!online || busy || run) { status('Finish the active session before opening the fictional demo.'); return; }
    busy = true; stop(); const scope = options.getScope(); const version = ++viewVersion;
    status('Loading fictional session and Gemini question…');
    try {
      if (!demoPayload) {
        demoPayload = await request('/api/demo-session', undefined, 'GET');
        demoPayload.sessions[0].sessionId = 'integration-fictional-demo-v1';
      }
      await request('/api/sessions', demoPayload);
      const result = await request('/api/follow-ups', { sessionId: demoPayload.sessions[0].sessionId, mode: el('mode').value });
      if (scope !== options.getScope() || version !== viewVersion) return;
      present({ ...result, kind: 'synthetic', payload: demoPayload }); status('Fictional question ready. Choose Read question aloud.');
    } catch (error) { if (version === viewVersion) status(error.message); }
    finally { busy = false; }
  };

  async function reloadHistory() {
    const scope = options.getScope();
    stop(); current = null; viewVersion++; el('followup').hidden = true;
    try {
      const health = await request('/health', undefined, 'GET');
      if (health.integration !== 'local-journal-v1') throw new Error('Start the updated local backend with npm start.');
      const result = await request('/api/journal/sessions?scope=' + encodeURIComponent(scope), undefined, 'GET');
      if (scope !== options.getScope()) return;
      online = true; el('demo').disabled = false;
      const rows = new Map(options.getRows().map(row => [row.id, row]));
      for (const record of result.sessions) rows.set(record.session.id, record.session);
      options.setRows([...rows.values()].sort((a, b) => a.date.localeCompare(b.date)));
      options.render();
      status('Connected to local SQLite. Camera records are not sent to Gemini.');
      const latest = result.sessions[0];
      if (latest) present({ ...latest, kind: 'local', question: localQuestion(latest.session, latest.metrics), answer: latest.userReportedContext.at(-1)?.answer || '' });
    } catch (error) { online = false; el('demo').disabled = true; status(error.message); }
  }
  for (const mode of ['quiet', 'concise', 'encouraging']) {
    fetch(`/voice-assets/${mode}.json`).then(r => r.ok ? r.json() : null).then(m => { if (m) manifests[mode] = m; }).catch(() => {});
  }
  reloadHistory();
  return {
    reloadHistory,
    start(config) {
      stop(); current = null; viewVersion++; el('followup').hidden = true;
      run = new SessionMetrics(config);
      updateActivity();
      event('session_started');
    },
    manualRep(reps, announce = true) {
      if (!run || !run.config.manual) return;
      const increased = reps > run.reps;
      run.reps = reps;
      updateActivity();
      if (announce && increased) event('rep_completed');
    },
    observe(frame) {
      if (!run || run.config.manual) return;
      if (run.config.movement === 'wave') {
        const now = performance.now();
        if (frame.ready) {
          run.badSince = null;
          if (run.lost) { run.lost = false; event('tracking_restored'); }
        } else {
          if (run.badSince === null) run.badSince = now;
          if (!run.lost && now - run.badSince >= 400) { run.lost = true; event('tracking_lost'); }
        }
        if (frame.reps > run.reps) { run.reps = frame.reps; updateActivity(); event('rep_completed'); }
        return;
      }
      const events = run.observe(frame);
      if (events.includes('rep_completed')) updateActivity();
      for (const name of events) {
        if (name === 'tracking_lost') options.resetIncompleteCycle();
        event(name);
      }
    },
    async finish(session) {
      if (!run) return;
      if (run.config.movement === 'wave') {
        run = null; updateActivity(); event('session_ended');
        status('Camera check finished. Wave counts are not saved to your journal.');
        return;
      }
      const metrics = run.finish(options.getPhase()); run = null; updateActivity();
      event('session_ended');
      const endVoiceVersion = voiceVersion;
      const scope = options.getScope(), version = ++viewVersion;
      try {
        const saved = await request('/api/journal/sessions', { scope, session, metrics });
        if (scope !== options.getScope() || version !== viewVersion) return;
        present({ ...saved, kind: 'local', question: localQuestion(session, metrics), answer: null });
        status('Session saved to local SQLite. No camera data sent to Gemini.');
        if (el('enabled').checked && el('mode').value !== 'quiet' && voiceVersion === endVoiceVersion) {
          pendingQuestion = { text: current.question, view: viewVersion, voice: voiceVersion };
          flushQuestion();
        }
      } catch (error) { if (version === viewVersion) status('Browser history saved; SQLite sync failed: ' + error.message); }
    },
    async clearHistory() {
      if (!online) throw new Error('Reconnect the local backend before clearing synchronized history.');
      await request('/api/journal/sessions?scope=' + encodeURIComponent(options.getScope()), undefined, 'DELETE');
      stop(); current = null; viewVersion++; el('followup').hidden = true;
    }
  };
}
