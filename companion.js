import { apiHeaders } from './api-client.js';
import { SessionMetrics, localQuestion, feedbackText } from './session-metrics.js';
import { createRepChime } from './rep-sound.js';

export function createCompanion(options) {
  const panel = document.createElement('section');
  panel.className = 'card panel session-companion voice-controls-card';
  panel.style.marginTop = '16px';
  panel.innerHTML = `
    <div class="companion-heading">
      <div class="companion-name"><span class="voice-symbol" aria-hidden="true">◖◗</span><div><h2>Voice controls</h2><p>Choose how often you hear spoken exercise cues.</p></div></div>
      <label class="voice-toggle"><input type="checkbox" data-id="enabled" checked><span data-id="voiceLabel">Voice on</span></label>
    </div>
    <div class="companion-toolbar">
      <div class="voice-modes" role="group" aria-label="Voice style">
        <button type="button" data-id="modeQuiet" aria-pressed="false">Quiet<span>Only tracking alerts</span></button>
        <button type="button" data-id="modeConcise" aria-pressed="true">Normal<span>Standard spoken cues</span></button>
      </div>
      <select data-id="mode" hidden aria-label="Voice style"><option value="quiet">Quiet</option><option value="concise" selected>Normal</option></select>
    </div>
    <p class="companion-activity" data-id="activity">Ready when you are. Start a session above.</p>
    <p class="companion-event" data-id="event" aria-live="polite"></p>
    <details class="voice-settings"><summary>Voice settings</summary>
      <div class="voice-settings-grid">
        <label>Browser backup voice<select data-id="voice"><option value="">System default</option></select></label>
        <label>Playback<select data-id="source"><option value="gemini" selected>Enhanced voice · browser backup</option><option value="browser">Browser voice only</option></select></label>
      </div>
      <div class="companion-actions"><button type="button" class="secondary" data-id="preview">Preview voice</button><button type="button" class="quiet" data-id="stop">Stop speaking</button></div>
      <p class="companion-technical" data-id="status" role="status">Checking saved sessions…</p>
    </details>
    <div class="companion-followup" data-id="followup" hidden>
      <span class="followup-eyebrow">A moment to reflect</span>
      <p class="followup-question" data-id="question"></p>
      <button type="button" class="quiet" data-id="read">Listen to question</button>
      <label>Your note <span>Optional</span><textarea data-id="answer" maxlength="2000" rows="3" placeholder="Anything you’d like your physio to know?"></textarea></label>
      <div class="companion-actions"><button type="button" class="primary" data-id="save">Save note</button><button type="button" class="secondary" data-id="report">Review session report</button></div>
      <p class="companion-technical" data-id="kind"></p>
      <pre class="companion-summary" data-id="summary" hidden></pre>
    </div>
    <details class="companion-demo"><summary>Try a sample session</summary>
      <p>Try a Gemini follow-up using a fictional session. Your camera measurements stay in your local journal.</p>
      <div class="companion-actions"><button type="button" class="secondary" data-id="demo" disabled>Load fictional session</button><button type="button" class="quiet" data-id="testRep">Preview rep chime</button></div>
    </details>
`;
  document.querySelector('#movement').after(panel);
  const el = id => panel.querySelector(`[data-id="${id}"]`);
  let online = false, run = null, current = null, audio = null, utterance = null;
  let voiceVersion = 0, viewVersion = 0, busy = false;
  let voices = [], manifests = {}, demoPayload = null;
  let preferredVoice = '';
  let pendingQuestion = null, goalCelebrated = false;
  const chime = createRepChime();
  try { preferredVoice = localStorage.getItem('exercise-demo-browser-voice') || ''; } catch {}
  el('enabled').checked = true;
  el('mode').value = 'concise';
  el('source').value = 'gemini';
  try {
    const prefs = JSON.parse(localStorage.getItem('formnote-companion-preferences') || 'null');
    if (prefs) {
      el('enabled').checked = prefs.enabled !== false;
      el('mode').value = prefs.mode === 'quiet' ? 'quiet' : 'concise';
      if (prefs.version === 2 && ['browser', 'gemini'].includes(prefs.source)) el('source').value = prefs.source;
    }
  } catch {}
  function saveVoicePreferences() {
    try { localStorage.setItem('formnote-companion-preferences', JSON.stringify({ version: 2, enabled: el('enabled').checked, mode: el('mode').value, source: el('source').value })); } catch {}
  }
  function syncVoiceControls() {
    el('voiceLabel').textContent = el('enabled').checked ? 'Voice on' : 'Voice muted';
    const quickVoice = document.getElementById?.('practiceVoice');
    if (quickVoice) { quickVoice.textContent = el('voiceLabel').textContent; quickVoice.ariaPressed = String(el('enabled').checked); }
    for (const mode of ['quiet', 'concise']) el('mode' + mode[0].toUpperCase() + mode.slice(1)).ariaPressed = String(el('mode').value === mode);
  }
  syncVoiceControls(); saveVoicePreferences();
  const status = text => { el('status').textContent = text; };

  async function request(path, body, method = 'POST') {
    const response = await fetch(path, {
      method, headers: await apiHeaders(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(65000)
    });
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw new Error('The server is unavailable. Refresh the page or try again shortly.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Backend request failed.');
    return data;
  }
  function stop() {
    pendingQuestion = null;
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
    utterance.onend = () => { if (version === voiceVersion) { utterance = null; status('Ready · browser voice.'); flushQuestion(); } };
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
  el('testRep').onclick = () => { chime.unlock(); event('rep_completed'); };
  el('preview').onclick = () => { stop(); event('session_started'); };
  el('mode').onchange = () => { stop(); syncVoiceControls(); saveVoicePreferences(); status('Voice style updated.'); };
  for (const mode of ['quiet', 'concise']) el('mode' + mode[0].toUpperCase() + mode.slice(1)).onclick = () => { el('mode').value = mode; el('mode').onchange(); };
  el('source').onchange = () => { stop(); saveVoicePreferences(); };
  el('enabled').onchange = () => {
    stop(); syncVoiceControls(); saveVoicePreferences();
    if (el('enabled').checked) browserSpeak('Spoken feedback is enabled.');
    else status('Spoken feedback disabled.');
  };

  const quickVoice = document.getElementById?.('practiceVoice');
  if (quickVoice) quickVoice.onclick = () => { el('enabled').checked = !el('enabled').checked; el('enabled').onchange(); };

  function updateActivity() {
    if (!run) { el('activity').textContent = 'Ready when you are. Start a session above.'; return; }
    const labels = { sit: 'Sit-to-stand', reach: 'Overhead reach', elbow: 'Elbow bend', wave: 'Camera wave check (not saved)' };
    el('activity').textContent = 'Active: ' + (labels[run.config.movement] || run.config.movement) + ' · ' + run.reps + ' reps recorded.';
  }

  function flushQuestion() {
    if (!pendingQuestion || run || audio || window.speechSynthesis?.speaking) return;
    const queued = pendingQuestion;
    pendingQuestion = null;
    if (queued.view !== viewVersion || queued.voice !== voiceVersion ||
        current?.question !== queued.text || !el('enabled').checked || el('mode').value === 'quiet') return;
    stop();
    speakLocalQuestion(queued.text);
  }

  async function speakLocalQuestion(text) {
    const mode = el('mode').value, version = voiceVersion;
    const clip = Object.values(manifests[mode]?.clips || {}).find(clip => clip?.text === text && clip.fileName);
    if (el('source').value === 'gemini' && clip) {
      audio = new Audio('/voice-assets/' + encodeURIComponent(clip.fileName));
      const fallback = () => { if (version === voiceVersion) { audio = null; browserSpeak(text, 'Gemini clip unavailable. '); } };
      audio.onended = () => { if (version === voiceVersion) audio = null; };
      audio.onerror = fallback;
      try { await audio.play(); return; } catch { fallback(); return; }
    }
    browserSpeak(text, el('source').value === 'gemini' ? 'Matching Gemini clip not prepared; browser backup. ' : '');
  }

  async function event(name) {
    const mode = el('mode').value;
    if (name === 'rep_completed') {
      const count = run?.reps || 1, target = run?.config.targetReps;
      const goal = !goalCelebrated && Number.isInteger(target) && target > 0 && count === target;
      if (goal) goalCelebrated = true;
      options.onRep?.({ reps: count, targetReps: target, goalReached: goal });
      el('event').textContent = goal ? 'Your session goal is complete. Nice work!' : 'Nice rep!';
      if (el('enabled').checked && mode !== 'quiet') {
        if (!chime.play(goal)) status('Rep recorded. Sound is unavailable in this browser.');
      }
      return;
    }
    const text = feedbackText(name, mode, run?.config.movement || options.getMovement());
    el('event').textContent = text || name.replaceAll('_', ' ') + ' · staying silent';
    if (!text || !el('enabled').checked) return;
    const clip = manifests[mode]?.clips?.[name];
    stop(); const version = voiceVersion;
    // Cached audio is valid only when its transcript matches the current message.
    // Old arm-only recordings must not override exercise-specific joint guidance.
    if (el('source').value === 'gemini' && clip?.fileName && clip.text === text) {
      audio = new Audio('/voice-assets/' + encodeURIComponent(clip.fileName));
      audio.onended = () => { if (version === voiceVersion) { audio = null; flushQuestion(); } };
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
    el('report').textContent = value.kind === 'synthetic' ? 'Generate fictional Gemini report' : 'Review session & AI options';
  }
  el('read').onclick = async () => {
    if (!current || busy) return;
    stop(); const version = voiceVersion, selected = current;
    if (el('mode').value === 'quiet') { status('Quiet mode: question stays on screen.'); return; }
    if (selected.kind !== 'synthetic') { speakLocalQuestion(selected.question); return; }
    if (el('source').value !== 'gemini') { browserSpeak(selected.question); return; }
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
    const selected = current, version = viewVersion;
    if (selected.kind !== 'synthetic' && options.openVisit) { options.openVisit(selected.session.id); return; }
    busy = true;
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
      if (health.integration !== 'local-journal-v1') throw new Error('The connected session server is unavailable.');
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
  for (const mode of ['quiet', 'concise']) {
    fetch(`/voice-assets/${mode}.json`).then(r => r.ok ? r.json() : null).then(m => { if (m) manifests[mode] = m; }).catch(() => {});
  }
  reloadHistory();
  return {
    reloadHistory,
    reset() {
      if (run) return false;
      stop(); current = null; viewVersion++; el('followup').hidden = true;
      el('event').textContent = ''; updateActivity();
      return true;
    },
    start(config) {
      chime.unlock(); goalCelebrated = false;
      stop(); current = null; viewVersion++; el('followup').hidden = true;
      run = new SessionMetrics({ ...config, targetReps: config.movement === 'wave' ? null : config.targetReps });
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
        el('activity').textContent = 'Camera check complete · not saved';
        el('event').textContent = 'This was a framing test. Choose an exercise for a saved session and a reflection question.';
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
        options.onSaved?.();
        status('Session saved. Review selected statistics in Visit note before sharing with Gemini.');
        if (el('enabled').checked && el('mode').value !== 'quiet' && voiceVersion === endVoiceVersion) {
          pendingQuestion = { text: current.question, view: viewVersion, voice: voiceVersion };
          flushQuestion();
        }
      } catch (error) { if (version === viewVersion) status('Browser history saved; server sync failed: ' + error.message); }
    },
    async clearHistory() {
      if (!online) throw new Error('Reconnect the session server before clearing synchronized history.');
      await request('/api/journal/sessions?scope=' + encodeURIComponent(options.getScope()), undefined, 'DELETE');
      stop(); current = null; viewVersion++; el('followup').hidden = true;
    }
  };
}
