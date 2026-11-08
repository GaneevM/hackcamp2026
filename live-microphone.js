// Microphone audio is held briefly in memory and sent only during detected speech.
export function pcm16(samples, inputRate) {
  const ratio = inputRate / 16000, count = Math.floor(samples.length / ratio);
  const bytes = new Uint8Array(count * 2), view = new DataView(bytes.buffer);
  for (let i = 0; i < count; i++) {
    const value = Math.max(-1, Math.min(1, samples[Math.floor(i * ratio)]));
    view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
export class SpeechGate {
  constructor() { this.reset(); }
  reset() { this.active = false; this.voiced = 0; this.silence = 0; this.duration = 0; }
  update(rms, milliseconds) {
    if (!this.active) {
      this.voiced = rms >= .025 ? this.voiced + milliseconds : 0;
      if (this.voiced < 120) return null;
      this.active = true; this.duration = 0; this.silence = 0; return 'start';
    }
    this.duration += milliseconds;
    this.silence = rms < .018 ? this.silence + milliseconds : 0;
    if (this.silence >= 900 || this.duration >= 12000) { this.reset(); return 'end'; }
    return null;
  }
}
export function createLiveMicrophone(options) {
  let stream, context, input, processor, silent, generation = 0, chunks = [];
  const gate = new SpeechGate();
  function stop() {
    generation++;
    if (gate.active) options.finish();
    gate.reset(); chunks = [];
    if (processor) processor.onaudioprocess = null;
    processor?.disconnect(); input?.disconnect(); silent?.disconnect();
    stream?.getTracks().forEach(track => track.stop());
    context?.close().catch(() => {});
    stream = context = input = processor = silent = null;
    options.state(false);
  }
  async function start() {
    if (stream) return;
    const version = ++generation;
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if (version !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired;
      context = new AudioContext({sampleRate:16000}); await context.resume();
      if (version !== generation) return;
      input = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(1024,1,1);
      silent = context.createGain(); silent.gain.value = 0;
      input.connect(processor); processor.connect(silent); silent.connect(context.destination);
      processor.onaudioprocess = event => {
        if (!options.allowed() && !gate.active) { gate.reset(); chunks = []; return; }
        const samples = event.inputBuffer.getChannelData(0);
        let energy = 0; for (const sample of samples) energy += sample * sample;
        const bytes = pcm16(samples, context.sampleRate);
        const transition = gate.update(Math.sqrt(energy / samples.length), samples.length / context.sampleRate * 1000);
        if (transition === 'start') {
          options.begin();
          for (const chunk of chunks) options.audio(chunk);
          chunks = [];
        }
        if (gate.active || transition === 'end') options.audio(bytes);
        else { chunks.push(bytes); if (chunks.length > 5) chunks.shift(); }
        if (transition === 'end') { chunks = []; options.finish(); }
      };
      options.state(true);
    } catch { if(version === generation) { stop(); options.error('Microphone unavailable. Allow microphone access, then try again.'); } }
  }
  return {start,stop,get active(){return Boolean(stream);},get speaking(){return gate.active;},get pending(){return gate.voiced > 0;}};
}
