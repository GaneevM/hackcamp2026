import { apiHeaders } from './api-client.js';
import { createLiveMicrophone } from './live-microphone.js';

// One connection per exercise. Microphone access is requested only on explicit opt-in.
export function createLiveFeedback(options = {}) {
  const section = document.createElement('section');
  section.id = 'geminiLivePanel';
  section.className = 'gemini-live-panel';
  section.style.cssText='border-top:2px solid #cbd8e2;margin-top:22px;padding-top:20px;font-size:16px;line-height:1.5';
  section.innerHTML = `<h2>Gemini live companion</h2><label><input type="checkbox" data-live-consent> Share camera snapshots with Gemini during this exercise</label><p>Optional demo feedback. Sends up to one image per second to Google while your session is active. Images are not saved by Physipeak. Feedback can be delayed or mistaken; follow your care plan.</p><button type="button" class="secondary" data-live-reconnect>Connect / reconnect Gemini</button><button type="button" class="secondary" data-live-mic aria-pressed="false">Enable microphone help</button><p>With microphone help on, say “Help me” or ask what to do next after Gemini finishes speaking. Your spoken question is sent to Google; audio is not saved by Physipeak.</p><p data-live-status role="status">Enable before starting a camera session. Live coaching stops after three minutes.</p>`;
  const host = document.querySelector('.session-companion');
  if (!host) throw new Error('Voice controls must be mounted before Gemini Live.');
  host.querySelector('.companion-toolbar').after(section);
  const consent = section.querySelector('input'), label = section.querySelector('[data-live-status]');
  const canvas = document.createElement('canvas');
  let socket, context, timer, deadline, generation = 0, ready = false, nextAudio = 0, nextFrame = 0, nextPrompt = 0, awaitingTurnComplete = false;
  let latest = null, config = null, frames = 0, lastProgressAt = 0;
  const sources = new Set();
  const micButton = section.querySelector('[data-live-mic]');
  function sendRealtime(value) { if (ready && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({realtimeInput:value})); }
  const microphone = createLiveMicrophone({
    allowed: () => ready && Boolean(options.getSession?.()) && !awaitingTurnComplete && sources.size === 0 && !document.hidden,
    begin: () => { awaitingTurnComplete = true; sendRealtime({activityStart:{}}); label.textContent = 'Listening to your question…'; },
    audio: bytes => sendRealtime({audio:{mimeType:'audio/pcm;rate=16000',data:btoa(String.fromCharCode(...bytes))}}),
    finish: () => { if(ready) { sendRealtime({activityEnd:{}}); label.textContent = 'Gemini is considering your question…'; } },
    state: active => { micButton.setAttribute('aria-pressed',String(active)); micButton.textContent = active ? 'Microphone help on · turn off' : 'Enable microphone help'; },
    error: message => { label.textContent = message; }
  });
  micButton.onclick = () => {
    if(microphone.active) { microphone.stop(); return; }
    if(!ready) { label.textContent = 'Connect Gemini in an active session before enabling microphone help.'; return; }
    void microphone.start();
  };
  function stop(message = 'Live companion stopped.') {
    ready = false; microphone.stop();
    generation++; ready = false; awaitingTurnComplete = false; clearInterval(timer); clearTimeout(deadline);
    socket?.close(); socket = null;
    for (const source of sources) { try { source.stop(); } catch {} } sources.clear();
    context?.close().catch(() => {}); context = null; nextAudio = 0;
    label.textContent = message;
  }
  document.addEventListener('physipeak-voice-muted', () => stop('Live companion muted. Start another session to reconnect.'));
  function play(part) {
    if (!context || !part?.data || !part.mimeType?.startsWith('audio/pcm')) return;
    document.dispatchEvent(new Event('physipeak-live-speaking'));
    const bytes = Uint8Array.from(atob(part.data), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer), rate = Number(/rate=(\d+)/.exec(part.mimeType)?.[1]) || 24000;
    const buffer = context.createBuffer(1, Math.floor(bytes.length / 2), rate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination);
    nextAudio = Math.max(context.currentTime, nextAudio); source.start(nextAudio); nextAudio += buffer.duration;
    sources.add(source); source.onended = () => sources.delete(source);
  }
  function tick() {
    if (!ready || !options.getSession?.() || socket?.readyState !== WebSocket.OPEN || document.hidden) return;
    const video = document.getElementById('video'), now = performance.now();
    if (!video?.videoWidth || now < nextFrame || socket.bufferedAmount > 100000) return;
    nextFrame = now + 1000; frames++;
    if (!awaitingTurnComplete && !microphone.speaking) label.textContent = `Gemini connected · ${frames} snapshots sent · ${latest?.ready ? 'local tracking ready' : 'checking your framing'}`;
    const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    socket.send(JSON.stringify({realtimeInput:{video:{mimeType:'image/jpeg',data:canvas.toDataURL('image/jpeg', .55).split(',')[1]}}}));
    // A new clientContent turn interrupts Gemini's current generation. Wait for
    // its explicit turnComplete signal, then let any queued audio finish first.
    if (!microphone.speaking && !microphone.pending && !awaitingTurnComplete && now >= nextPrompt && nextAudio <= (context?.currentTime || 0)) {
      nextPrompt = now + 10000;
      awaitingTurnComplete = true;
      socket.send(JSON.stringify({clientContent:{turns:[{role:'user',parts:[{text:`${frames===1 ? 'First say: Gemini live companion connected. Then, if needed, help the user fit the selected joints into view. ' : ''}Current exercise state: ${JSON.stringify(latest)}. Seconds since the last counted repetition: ${Math.floor((now-lastProgressAt)/1000)}. If at least 15 seconds have passed without a counted rep and tracking is ready, offer one simple next-step cue supported by the visible movement and phase. Do not assume confusion, pain, or a cause for the stalled count. Review recent images for a clear visible form concern during this movement. Give one short useful cue if supported, otherwise remain silent. Do not assume a completed repetition is required.`}]}],turnComplete:true}}));
    }
  }
  consent.onchange = () => { if (!consent.checked) stop('Camera sharing disabled.'); else reconnect(); };
  function reconnect(){const session=options.getSession?.();if(!session){label.textContent='Start a camera exercise session first. Gemini will connect automatically.';return;}if(!consent.checked){label.textContent='Check camera sharing before connecting.';return;}api.start(session);}
  section.querySelector('[data-live-reconnect]').onclick=reconnect;
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop('Gemini paused when you switched tabs. Return here and press Reconnect Gemini.'); });
  window.addEventListener('pagehide', () => stop());
  const api = {
    async start(value) {
      stop(); config = value; latest = null; frames = 0; nextFrame = 0; nextPrompt = 0; awaitingTurnComplete = false; lastProgressAt = performance.now();
      if (document.querySelector('[data-id="enabled"]')?.checked === false || !consent.checked || value.manual || value.movement === 'wave') return;
      const version = generation;
      try { context = new AudioContext(); await context.resume(); } catch { stop('Audio could not start. Press Reconnect Gemini.'); return; }
      label.textContent = 'Connecting Gemini live companion…';
      try {
        const response = await fetch('/api/live/token', {method:'POST',headers:await apiHeaders(),body:JSON.stringify({...value,consent:true}),signal:AbortSignal.timeout(15000)});
        const token = await response.json(); if (!response.ok) throw Error(token.error || 'Connection unavailable.');
        if (version !== generation) return;
        const ws = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(token.name)); socket = ws;
        ws.onopen = () => ws.send(JSON.stringify({setup:token.setup}));
        ws.onmessage = async event => {
          if (version !== generation) return;
          try {
            const message = JSON.parse(typeof event.data === 'string' ? event.data : await event.data.text());
            if (version !== generation) return;
            if (message.error) throw Error('Gemini rejected the live session.');
            if (message.setupComplete) { ready = true; label.textContent = 'Gemini is watching your movement · camera sharing active'; timer = setInterval(tick, 250); }
            const serverContent = message.serverContent;
            if (serverContent?.modelTurn) awaitingTurnComplete = true;
            if (serverContent?.interrupted) {
              // Gemini explicitly canceled this turn; discard only audio from
              // that canceled turn. Ordinary chunk gaps do not clear playback.
              for (const source of sources) { try { source.stop(); } catch {} }
              sources.clear();
              nextAudio = context?.currentTime || 0;
            }
            for (const part of serverContent?.modelTurn?.parts || []) play(part.inlineData);
            if (serverContent?.outputTranscription?.text) label.textContent = serverContent.outputTranscription.text;
            if (serverContent?.turnComplete) awaitingTurnComplete = false;
          } catch { stop('Gemini live feedback unavailable. Your local rep counter continues.'); }
        };
        ws.onerror = () => { if (version === generation) stop('Gemini connection unavailable. Your local rep counter continues.'); };
        ws.onclose = event => { if (version === generation) stop(`Gemini connection closed (${event.code}). Press Reconnect Gemini.`); };
        deadline = setTimeout(() => stop('Three-minute live coaching allowance finished. Your local session continues.'), token.durationSeconds * 1000);
      } catch (error) { if (version === generation) stop(error.message); }
    },
    observe(value) { if (value.reps !== latest?.reps) lastProgressAt = performance.now(); latest = value; },
    stop
  };
  return api;
}
