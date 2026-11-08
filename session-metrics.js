// Browser-native measurements. These are not clinical measurements or hold angles.
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export class SessionMetrics {
  constructor(config, now = performance.now()) {
    this.config = config;
    this.started = now;
    this.startedAt = new Date().toISOString();
    this.frames = 0;
    this.validFrames = 0;
    this.low = null;
    this.high = null;
    this.badSince = null;
    this.lost = false;
    this.losses = 0;
    this.incomplete = 0;
    this.reps = 0;
    this.lastCompletion = now;
    this.intervals = [];
  }

  observe({ ready, angle, reps, phase }, now = performance.now()) {
    const events = [];
    this.frames++;
    if (ready && Number.isFinite(angle)) {
      this.validFrames++;
      this.low = this.low === null ? angle : Math.min(this.low, angle);
      this.high = this.high === null ? angle : Math.max(this.high, angle);
      this.badSince = null;
      if (this.lost) events.push('tracking_restored');
      this.lost = false;
    } else {
      if (this.badSince === null) this.badSince = now;
      if (!this.lost && now - this.badSince >= 400) {
        this.lost = true;
        this.losses++;
        if (phase === 'moved') this.incomplete++;
        events.push('tracking_lost');
      }
    }
    if (reps > this.reps) {
      const seconds = (now - this.lastCompletion) / 1000;
      if (seconds > 0) this.intervals.push(seconds);
      this.lastCompletion = now;
      this.reps = reps;
      events.push('rep_completed');
    }
    return events;
  }

  finish(phase, now = performance.now()) {
    const manual = this.config.manual;
    const movement = this.config.movement;
    return {
      source: manual ? 'manual' : 'camera',
      startedAt: this.startedAt,
      durationSeconds: Math.max(0, (now - this.started) / 1000),
      targetReps: this.config.targetReps,
      angleConvention: movement === 'crossbody' ? 'opposite_shoulder_shoulder_wrist_angle_deg' : movement === 'reach'
        ? 'hip_shoulder_elbow_angle_deg_arm_down_is_0'
        : 'flexion_deg_straight_is_0',
      minimumObservedAngleDeg: manual ? null : this.low,
      maximumObservedAngleDeg: manual ? null : this.high,
      trackingValidFraction: manual || !this.frames ? null : this.validFrames / this.frames,
      trackingLossEvents: manual ? 0 : this.losses,
      incompleteCycles: manual ? null : this.incomplete + (!this.lost && phase === 'moved' ? 1 : 0),
      medianCompletionIntervalSeconds: manual ? null : median(this.intervals),
      stopReason: 'user_ended',
      measurementProtocolId: 'formnote-side-view-observed-extrema-v1'
    };
  }
}

export function localQuestion(session, metrics) {
  if (metrics.targetReps !== null && session.reps < metrics.targetReps)
    return 'Would you like to add context about ending below the repetition goal?';
  if (metrics.trackingLossEvents > 0)
    return 'Would you like to add context about the tracking interruptions?';
  if (metrics.incompleteCycles > 0)
    return 'Would you like to add context about the incomplete movement cycles?';
  return 'Would you like to add any context about this session?';
}


export function feedbackText(event, mode, movement) {
  const joints = {
    sit: 'hip, knee, and ankle',
    reach: 'hip, shoulder, and elbow',
    elbow: 'shoulder, elbow, and wrist',
    wave: 'shoulder, elbow, and wrist'
  }[movement] || 'joints needed for this movement';
  if (mode === 'quiet' && event !== 'tracking_lost') return null;
  if (event === 'tracking_lost') return mode === 'encouraging'
    ? "Tracking is paused. When you're ready, check that your " + joints + ' are in view.'
    : 'Tracking paused. Keep your ' + joints + ' in view.';
  if (event === 'tracking_restored') return mode === 'encouraging'
    ? 'The joints for this movement are back in view.' : 'Tracking restored.';
  const messages = {
    session_started: mode === 'encouraging' ? 'Your session has started. You can pause whenever you need.' : 'Session started.',
    rep_completed: mode === 'encouraging' ? 'Another repetition recorded.' : 'Repetition recorded.',
    session_ended: mode === 'encouraging' ? 'Your session has ended.' : 'Session ended.'
  };
  return messages[event] || null;
}


// Camera-check waves use hand motion relative to its own starting position,
// not the wrist crossing the shoulder's x coordinate. No ROM is inferred.
export class WaveCounter {
  constructor() { this.reset(); }
  reset() {
    this.arm = null; this.origin = null; this.phase = 'ready';
    this.candidate = null; this.since = null; this.lastValid = null;
  }
  update({ position, raised, arm, threshold = .04 }, now = performance.now()) {
    if (!raised || !Number.isFinite(position) || !arm) {
      this.reset(); return false;
    }
    if (this.arm !== arm || (this.lastValid !== null && now - this.lastValid > 400)) this.reset();
    this.arm = arm; this.lastValid = now;
    if (this.origin === null) { this.origin = position; return false; }
    const distance = Math.abs(position - this.origin);
    const zone = this.phase === 'ready'
      ? (distance >= threshold ? 'away' : null)
      : (distance <= threshold * .4 ? 'return' : null);
    if (!zone) { this.candidate = null; this.since = null; return false; }
    if (this.candidate !== zone) { this.candidate = zone; this.since = now; return false; }
    if (now - this.since < 60) return false;
    this.candidate = null; this.since = null;
    if (zone === 'away') { this.phase = 'moved'; return false; }
    this.phase = 'ready'; this.origin = position;
    return true;
  }
}
