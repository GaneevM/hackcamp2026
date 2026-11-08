// Camera-only repetition gating. Thresholds are estimates for a prototype,
// with a user-calibrated range preferred over generic defaults.
export class MovementCounter {
  constructor() { this.reset(); }

  reset() {
    this.phase = 'find-start';
    this.startAt = null;
    this.startAngle = null;
    this.anchor = null;
    this.targetAt = null;
    this.returnAt = null;
    this.cycleAt = null;
    this.peak = null;
    this.reps = 0;
    this.holds = [];
  }

  interrupt() {
    this.phase = 'find-start';
    this.startAt = this.startAngle = this.anchor = null;
    this.targetAt = this.returnAt = this.cycleAt = this.peak = null;
  }

  update({ movement, angle, now, position, calibration, context = {} }) {
    if (!Number.isFinite(angle) || !Number.isFinite(now)) { this.interrupt(); return null; }
    const isSit = movement === 'sit';
    const isElbow = movement === 'elbow';
    const isCrossbody = movement === 'crossbody';
    const hasCalibration = Number.isFinite(calibration?.startAngle) && Number.isFinite(calibration?.endAngle);
    const low = hasCalibration ? Math.min(calibration.startAngle, calibration.endAngle) : null;
    const high = hasCalibration ? Math.max(calibration.startAngle, calibration.endAngle) : null;
    const range = low !== null && high !== null ? high - low : null;

    const nearStart = isSit
      ? (range === null ? angle >= 45 : angle >= high - Math.max(12, range * .2))
      : (range === null ? angle <= 35 : angle <= low + Math.max(12, range * .2));
    const target = isSit
      ? (range === null ? angle <= 25 : angle <= low + range * .25)
      : (range === null ? angle >= (isCrossbody ? 45 : 60) : angle >= low + range * .65);
    const backAtStart = isSit
      ? (range === null ? angle >= 45 : angle >= high - Math.max(14, range * .22))
      : (range === null ? angle <= (isElbow ? 35 : 22) : angle <= low + Math.max(14, range * .22));
    const travelNeeded = range === null ? 25 : Math.max(12, range * .5);
    const enoughTravel = this.startAngle === null || (isSit
      ? this.startAngle - angle >= travelNeeded
      : angle - this.startAngle >= travelNeeded);
    const anchorDrift = !this.anchor || !position ? 0 : Math.hypot(position.x - this.anchor.x, position.y - this.anchor.y);
    const stableAtAnchor = anchorDrift <= (isSit ? .22 : .13);

    if (this.phase === 'find-start') {
      if (!nearStart || !position || (isSit && !context.seated)) { this.startAt = this.startAngle = this.anchor = null; return null; }
      if (this.startAt === null) {
        this.startAt = now; this.startAngle = angle; this.anchor = { ...position };
      } else if ((!isElbow && Math.abs(angle - this.startAngle) > 12) || Math.hypot(position.x - this.anchor.x, position.y - this.anchor.y) > .035) {
        this.startAt = now; this.startAngle = angle; this.anchor = { ...position };
      } else if (now - this.startAt >= (isElbow ? 150 : 650)) {
        this.phase = 'ready'; this.cycleAt = now; this.peak = angle;
      }
      return null;
    }

    if (!stableAtAnchor || (this.cycleAt !== null && now - this.cycleAt > 90000)) {
      this.interrupt();
      return null;
    }

    if (this.phase === 'ready') {
      this.peak = isSit ? Math.min(this.peak, angle) : Math.max(this.peak, angle);
      if (target && enoughTravel) { this.phase = 'target'; this.targetAt = now; }
      return null;
    }

    if (this.phase === 'target') {
      this.peak = isSit ? Math.min(this.peak, angle) : Math.max(this.peak, angle);
      if (!target) { this.targetAt = null; this.phase = 'ready'; return null; }
      if (this.targetAt !== null && now - this.targetAt >= (isElbow ? 80 : 300)) {
        if (isSit) return this.complete(now);
        this.phase = 'return'; this.returnAt = null;
      }
      return null;
    }

    if (this.phase === 'return') {
      if (backAtStart) {
        if (this.returnAt === null) this.returnAt = now;
        if (now - this.returnAt >= (isElbow ? 100 : 250) && now - this.cycleAt >= 1000) return this.complete(now);
      } else this.returnAt = null;
    }
    return null;
  }

  complete(now) {
    const holdSeconds = this.targetAt !== null && this.returnAt !== null ? Math.max(0, Math.round((this.returnAt - this.targetAt) / 100) / 10) : 0;
    const rep = { reps: ++this.reps, seconds: Math.round((now - this.cycleAt) / 100) / 10, peak: Math.round(this.peak), holdSeconds };
    this.holds.push(holdSeconds);
    this.phase = 'find-start';
    this.startAt = this.startAngle = this.anchor = null;
    this.targetAt = this.returnAt = this.cycleAt = this.peak = null;
    return rep;
  }
}
