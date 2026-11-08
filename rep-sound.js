// Short bell triad: immediate local feedback, independent of speech or network.
export function repChimeNotes(goal = false) {
  const frequencies = goal ? [523.25, 659.25, 783.99, 1046.5] : [1046.5, 1318.51, 1567.98];
  return frequencies.map((frequency, index) => ({
    frequency, delay: index * (goal ? .085 : .035),
    duration: goal ? .65 : .43, gain: index === 0 ? .14 : .09
  }));
}

export function createRepChime(host = window) {
  let context = null;
  function unlock() {
    try {
      const AudioContext = host.AudioContext || host.webkitAudioContext;
      if (!AudioContext) return false;
      context ||= new AudioContext();
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    } catch { return false; }
  }
  return {
    unlock,
    play(goal = false) {
      if (!unlock()) return false;
      try {
        const start = context.currentTime + .006;
        for (const note of repChimeNotes(goal)) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(note.frequency, start);
          const at = start + note.delay;
          gain.gain.setValueAtTime(.0001, at);
          gain.gain.exponentialRampToValueAtTime(note.gain, at + .004);
          gain.gain.exponentialRampToValueAtTime(.0001, at + note.duration);
          oscillator.connect(gain); gain.connect(context.destination);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          oscillator.start(at); oscillator.stop(at + note.duration + .01);
        }
        return true;
      } catch { return false; }
    }
  };
}
