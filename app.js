import { AuthSession, loadAuthSdk } from './auth-flow.mjs';
import { createCompanion } from './companion.js';
import { createCarePages } from './care-pages.js';
import { WaveCounter } from './session-metrics.js';
const waveCounter = new WaveCounter();
import { assessPushup, PushupCounter } from './pushup.mjs';
const pushupCounter = new PushupCounter();
let pushupPose = null, pushupUiAt = 0;
const $ = (id) => document.getElementById(id);
const SESSION_KEY = 'formnote_sessions_v2';
const CALIBRATION_KEY = 'formnote_angle_calibration_v1';
const PLAN_KEY = 'formnote_physio_plan_v1';
const MEDIA_DB = 'formnote_media_v1';
let activeDataScope = 'guest';
let authClient = null;
let authUser = null;
const scopedStorageKey = (key) => `${key}::${activeDataScope}`;

const bodyPoints = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
};
const movements = {
  sit: {
    title: 'Sit-to-stand', metric: 'Knee flexion', view: 'side view',
    details: 'Knee angle: hip–knee–ankle. Straight = 0°.',
    keys: ['hip', 'knee', 'ankle'], frame: 'Side view · show hip, knee, ankle.',
    prompt: 'Camera at hip height. Turn sideways; show hip, knee, ankle.',
  },
  reach: {
    title: 'Overhead reach', metric: 'Shoulder flexion', view: 'side view',
    details: 'Shoulder angle: hip–shoulder–elbow. Arm down ≈ 0°.',
    keys: ['hip', 'shoulder', 'elbow'], frame: 'Side view · show hip, shoulder, elbow.',
    prompt: 'Camera at shoulder height. Turn sideways; show hip, shoulder, elbow.',
  },
  elbow: {
    title: 'Elbow bend', metric: 'Elbow flexion', view: 'side view',
    details: 'Elbow angle: shoulder–elbow–wrist. Straight = 0°.',
    keys: ['shoulder', 'elbow', 'wrist'], frame: 'Side view · show shoulder, elbow, wrist.',
    prompt: 'Turn sideways; show shoulder, elbow, wrist.',
  },
  pushup: { title:'Push-up · form demo', metric:'Elbow flexion', view:'side view', keys:['shoulder','elbow','wrist','hip','knee','ankle'], frame:'Side view · show your near-side arm, hip and legs.', prompt:'Place the camera side-on, at body height. Fit your whole body in view.' },
  wave: { title: 'Camera check · wave', metric: 'Arm landmarks', view: 'front view', keys: [], frame: 'Face camera · show shoulder, elbow, wrist.' },
};
const app = {
  stream: null, landmarker: null, running: false, raf: 0, facing: 'user', reps: 0,
  countdownActive: false, countdownRemaining: 5, countdownTimer: null,
  phase: 'ready', confidence: null, pain: null, poseReady: false, manual: false,
  side: 'left', currentAngle: null, angleSamples: [], sessionAngles: [], activeSessionId: null,
  autoCalibration: { active: false, stage: 'intro', samples: [], phaseAt: null, lastSampleAt: 0, firstAngle: null },
  sessionStartAngle: null, waveSide: null, waveSwitches: 0, lastLandmarks: null,
};

let companion = null, carePages = null;

const readSessions = () => { try { return JSON.parse(localStorage.getItem(scopedStorageKey(SESSION_KEY)) ?? (activeDataScope === 'guest' ? localStorage.getItem(SESSION_KEY) : null) ?? '[]'); } catch { return []; } };
const saveSessions = (rows) => localStorage.setItem(scopedStorageKey(SESSION_KEY), JSON.stringify(rows));
const readCalibrations = () => { try { return JSON.parse(localStorage.getItem(scopedStorageKey(CALIBRATION_KEY)) ?? (activeDataScope === 'guest' ? localStorage.getItem(CALIBRATION_KEY) : null) ?? '{}'); } catch { return {}; } };
const saveCalibrations = (values) => localStorage.setItem(scopedStorageKey(CALIBRATION_KEY), JSON.stringify(values));
const activeMovement = () => movements[$('exerciseSelect').value] || movements.sit;
const pushupVariant = () => $('pushupVariant')?.value || 'floor';
const calibrationKey = (movement = $('exerciseSelect').value, side = $('bodySide').value) => `${movement}${movement==='pushup'?`-${pushupVariant()}`:''}:${side}`;
const getCalibration = (movement, side) => readCalibrations()[calibrationKey(movement, side)];

$('todayDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
for (let i = 0; i <= 10; i++) {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = String(i); button.dataset.v = String(i); button.setAttribute('aria-pressed', 'false');
  $('pain').append(button);
}

function toast(message) {
  const node = $('toast'); node.textContent = message; node.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 2800);
}

function cameraState(label, kind = 'neutral', copy = '', points = '') {
  $('liveText').textContent = label;
  $('liveDot').className = `live-dot ${kind === 'good' ? 'ready' : kind === 'bad' ? 'warn' : kind === 'active' ? 'active' : ''}`;
  $('cameraStatus').dataset.state = kind;
  $('statusCopy').textContent = copy;
  if (points) $('pointCount').textContent = points;
}

function setRating(groupId, valueKey, valueId, format) {
  $(groupId).addEventListener('click', (event) => {
    const button = event.target.closest('button[data-v]');
    if (!button) return;
    app[valueKey] = Number(button.dataset.v);
    $(groupId).querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    $(valueId).textContent = format(app[valueKey]);
    if (valueKey === 'pain') $('painNote').classList.toggle('show', app.pain >= 7);
  });
}
setRating('confidence', 'confidence', 'confidenceVal', (value) => `${value} / 5`);
setRating('pain', 'pain', 'painVal', (value) => `${value} / 10`);

function angle3(a, b, c) {
  if (!a || !b || !c || ![a,b,c].every(p => [p.x,p.y,p.z].every(Number.isFinite))) return null;
  const u = [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)];
  const v = [c.x - b.x, c.y - b.y, (c.z || 0) - (b.z || 0)];
  const denominator = Math.hypot(...u) * Math.hypot(...v);
  if (!denominator) return null;
  const dot = u.reduce((sum, coordinate, index) => sum + coordinate * v[index], 0);
  return Math.acos(Math.max(-1, Math.min(1, dot / denominator))) * 180 / Math.PI;
}

function movementAngle(world, movement, side) {
  const ids = bodyPoints[side];
  if (!ids || !world) return null;
  const point = (key) => world[ids[key]];
  if (movement === 'sit') {
    const inside = angle3(point('hip'), point('knee'), point('ankle'));
    return inside === null ? null : 180 - inside;
  }
  if (movement === 'reach') return angle3(point('hip'), point('shoulder'), point('elbow'));
  if (movement === 'elbow' || movement === 'pushup') {
    const inside = angle3(point('shoulder'), point('elbow'), point('wrist'));
    return inside === null ? null : 180 - inside;
  }
  return null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function visible(landmarks, key, side = app.side) {
  const ids = bodyPoints[side]; const landmark = landmarks?.[ids?.[key]];
  return !!landmark && (landmark.visibility ?? landmark.presence ?? 1) > 0.55;
}

function pointsFor(movement, landmarks) {
  if (movement === 'wave') {
    const leftReady = ['shoulder', 'elbow', 'wrist'].every((key) => visible(landmarks, key, 'left'));
    const rightReady = ['shoulder', 'elbow', 'wrist'].every((key) => visible(landmarks, key, 'right'));
    return { ready: leftReady || rightReady, count: (leftReady ? 3 : 0) + (rightReady ? 3 : 0), total: 6 };
  }
  const cfg = movements[movement];
  const count = cfg.keys.filter((key) => visible(landmarks, key)).length;
  return { ready: count === cfg.keys.length, count, total: cfg.keys.length };
}

function updateAngleText() {
  const movement = $('exerciseSelect').value;
  if (movement === 'wave') { $('angleLive').textContent = 'Arm'; return; }
  $('angleLive').textContent = app.currentAngle === null ? `${activeMovement().metric} —` : `${activeMovement().metric} ~${app.currentAngle}°`;
}

function readPose(landmarks, world) {
  const movement = $('exerciseSelect').value;
  app.lastLandmarks = landmarks;
  if (movement === 'pushup') return readPushupPose(landmarks, world);
  const visibility = pointsFor(movement, landmarks);
  app.poseReady = visibility.ready;
  if(app.countdownActive){$('startBtn').disabled=true;$('trackingTitle').textContent='Get ready';$('trackingCopy').textContent=`Step into view · ${app.countdownRemaining}s`;return visibility.ready;}
  if (movement === 'wave') {
    $('startBtn').disabled = app.running;
    $('trackingTitle').textContent = app.running ? 'Session active · camera check' : 'Camera check ready — press Start demo';
    $('trackingCopy').textContent = visibility.ready ? 'Raise one hand and wave out and back. Your hand can stay on one side of your body.' : 'Show a shoulder, elbow, and wrist. Counting waits until they are visible.';
    cameraState(app.running ? (visibility.ready ? 'Session active' : 'Active · waiting for view') : 'Not started', visibility.ready ? 'good' : 'bad', visibility.ready ? 'One out-and-back hand movement = one demo cycle.' : movements.wave.frame, `${visibility.count}/${visibility.total} joints`);
    updateAngleText();
    return visibility.ready;
  }
  if (!visibility.ready) {
    app.currentAngle = null; app.angleSamples = []; updateAngleText(); $('startBtn').disabled = app.running;
    $('trackingTitle').textContent = app.running ? 'Session active · waiting for joints' : 'Camera ready — start, then step into view'; $('trackingCopy').textContent = activeMovement().frame;
    cameraState(app.running ? 'Active · waiting for view' : 'Not started', 'bad', activeMovement().frame, `${visibility.count}/${visibility.total} joints`);
    return false;
  }
  const raw = movementAngle(world, movement, app.side);
  if (raw !== null && Number.isFinite(raw)) {
    app.angleSamples.push(raw); if (app.angleSamples.length > 9) app.angleSamples.shift();
    app.currentAngle = Math.round(median(app.angleSamples));
  }
  if (raw === null || !Number.isFinite(raw)) {
    app.poseReady = false; app.currentAngle = null; app.angleSamples = [];
    $('startBtn').disabled = app.running; updateAngleText();
    $('trackingTitle').textContent = app.running ? 'Session active · waiting for angle' : 'Camera ready — waiting for angle';
    $('trackingCopy').textContent = 'No usable 3D angle yet. Reposition the selected joints; counting is paused.';
    cameraState(app.running ? 'Active · angle unavailable' : 'Not started', 'bad', activeMovement().frame);
    return false;
  }
  collectAutoCalibration();
  updateAngleText();
  $('trackingTitle').textContent = app.running ? 'Session active · counting' : 'Ready — press Start session';
  $('trackingCopy').textContent = 'Move comfortably. Follow your plan.';
  $('startBtn').disabled = app.running;
  cameraState(app.running ? 'Session active' : 'Ready · not started', app.running ? 'active' : 'good', 'Camera angle is an estimate.', `${visibility.count}/${visibility.total} joints`);
  return true;
}

async function loadModel() {
  if (app.landmarker) return app.landmarker;
  $('trackingTitle').textContent = 'Loading tracker';
  $('trackingCopy').textContent = 'First load may take a moment.';
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
  const files = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  const model = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  try {
    app.landmarker = await vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 });
  } catch {
    app.landmarker = await vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1 });
  }
  return app.landmarker;
}

async function enumerateCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
  const select = $('cameraSelect'); select.innerHTML = '';
  cameras.forEach((device, index) => {
    const option = document.createElement('option'); option.value = device.deviceId; option.textContent = device.label || `Camera ${index + 1}`; select.append(option);
  });
  select.disabled = !cameras.length;
}

async function startCamera(deviceId) {
  if (!navigator.mediaDevices?.getUserMedia) { toast('Use a modern browser on localhost or HTTPS.'); return; }
  try {
    app.stream?.getTracks().forEach((track) => track.stop());
    const video = deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { facingMode: { ideal: app.facing }, width: { ideal: 1280 }, height: { ideal: 720 } };
    app.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    $('video').srcObject = app.stream; $('video').style.display = 'block'; await $('video').play(); $('cameraEmpty').style.display = 'none';
    $('trackingStatus').classList.add('show'); await enumerateCameras(); $('cameraSelect').value = app.stream.getVideoTracks()[0]?.getSettings().deviceId || deviceId || '';
    cameraState('Checking view', 'neutral', 'Finding joints…', '0 joints');
    await loadModel();
    toast('Camera ready. Step into view.');
    if (!app.raf) monitor();
  } catch (error) {
    const message = error.name === 'NotAllowedError' ? 'Allow camera access in browser settings.' : error.name === 'NotFoundError' ? 'No camera found. Try manual logging.' : 'Camera unavailable. Close other camera apps and retry.';
    cameraState('Camera unavailable', 'bad', message); $('trackingTitle').textContent = 'Camera unavailable'; $('trackingCopy').textContent = message; toast(message);
  }
}

$('enableCamera').onclick = () => startCamera();
document.querySelectorAll('[data-movement]').forEach(button => {
  button.onclick = () => {
    if (app.running || app.autoCalibration.active) { toast('Finish the current session or calibration first.'); return; }
    $('exerciseSelect').value = button.dataset.movement;
    $('exerciseSelect').dispatchEvent(new Event('change'));
  };
});
$('cameraSelect').onchange = (event) => startCamera(event.target.value);
$('switchCamera').onclick = () => { app.facing = app.facing === 'user' ? 'environment' : 'user'; startCamera(); };

function canvasPoint(point, video, stage) {
  const sx = stage.clientWidth / video.videoWidth; const sy = stage.clientHeight / video.videoHeight; const scale = Math.min(sx, sy);
  const width = video.videoWidth * scale; const height = video.videoHeight * scale;
  return { x: (1 - point.x) * width + (stage.clientWidth - width) / 2, y: point.y * height + (stage.clientHeight - height) / 2 };
}
const skeleton = [[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]];
function drawPose(landmarks) {
  const video = $('video'); const stage = $('stage'); const canvas = $('overlay'); const ctx = canvas.getContext('2d'); const scale = window.devicePixelRatio || 1;
  const width = stage.clientWidth; const height = stage.clientHeight;
  if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) { canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; }
  ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.clearRect(0, 0, width, height); if (!landmarks) return;
  ctx.lineWidth = 3; ctx.strokeStyle = '#82deb0'; ctx.shadowColor = '#10251c'; ctx.shadowBlur = 4;
  for (const [a, b] of skeleton) if ((landmarks[a]?.visibility ?? 0) > .5 && (landmarks[b]?.visibility ?? 0) > .5) { const p = canvasPoint(landmarks[a], video, stage); const q = canvasPoint(landmarks[b], video, stage); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
  for (const point of landmarks) if ((point.visibility ?? 0) > .5) { const p = canvasPoint(point, video, stage); ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#318265'; ctx.lineWidth = 2; ctx.stroke(); }
}

function countRep(angle) {
  if (app.sessionStartAngle === null) { app.sessionStartAngle = angle; return; }
  const calibration = getCalibration($('exerciseSelect').value, $('bodySide').value);
  const expected = calibration ? Math.abs(calibration.endAngle - calibration.startAngle) : 55;
  const activation = Math.max(16, expected * 0.38);
  const delta = angle - app.sessionStartAngle;
  if (app.phase === 'ready' && delta >= activation) app.phase = 'moved';
  else if (app.phase === 'moved' && delta <= Math.max(7, activation * 0.28)) {
    app.phase = 'ready'; app.reps += 1; $('repCount').textContent = String(app.reps);
  }
}

function monitor() {
  if (!app.stream || $('video').readyState < 2) { app.raf = requestAnimationFrame(monitor); return; }
  if (app.landmarker) {
    try {
      const result = app.landmarker.detectForVideo($('video'), performance.now());
      const landmarks = result.landmarks?.[0]; const world = result.worldLandmarks?.[0];
      drawPose(landmarks);
      if (landmarks) {
        const ready = readPose(landmarks, world);
        if (app.running && !app.manual && ready) {
          const movement = $('exerciseSelect').value;
          if (movement === 'wave') {
            const arms = [['left', 11, 15], ['right', 12, 16]];
            const available = arms.filter(([side]) => ['shoulder','elbow','wrist'].every(key => visible(landmarks, key, side)));
            const raised = ([, shoulder, wrist]) => landmarks[wrist].y < landmarks[shoulder].y + .12;
            const arm = available.find(candidate => candidate[0] === waveCounter.arm && raised(candidate))
              || available.find(raised) || available[0];
            if (arm) {
              const [side, shoulder, wrist] = arm;
              const shoulderWidth = landmarks[11] && landmarks[12]
                ? Math.hypot(landmarks[11].x - landmarks[12].x, landmarks[11].y - landmarks[12].y) : .2;
              const counted = waveCounter.update({
                arm: side, raised: raised(arm),
                position: landmarks[wrist].x - landmarks[shoulder].x,
                threshold: Math.max(.035, Math.min(.09, shoulderWidth * .25))
              }, performance.now());
              if (counted) { app.reps++; $('repCount').textContent = String(app.reps); }
              $('trackingCopy').textContent = !raised(arm) ? 'Raise one hand near shoulder height to begin the wave check.'
                : waveCounter.phase === 'moved' ? 'Bring your hand back toward where the wave started.'
                : 'Move your raised hand sideways, then back. No need to cross your shoulder.';
            }
          } else if (movement !== 'pushup' && app.currentAngle !== null) {
            app.sessionAngles.push(app.currentAngle); countRep(app.currentAngle);
          }
        }
      } else { if($('exerciseSelect').value==='pushup'){pushupCounter.pause();showPushupWaiting('Step into view.');} app.poseReady = false; app.currentAngle = null; updateAngleText(); $('startBtn').disabled = app.running; cameraState(app.running ? 'Active · waiting for view' : 'Not started', 'bad', 'Move into view and show the joints. Counting waits for usable tracking.', '0 joints'); }
      if (app.running && !app.manual) companion?.observe({ ready: app.poseReady, angle: app.currentAngle, reps: app.reps, phase: app.phase });
    } catch (error) { console.warn('Pose estimate skipped', error); }
  }
  app.raf = requestAnimationFrame(monitor);
}

function setActive(active) {
  $('exerciseSelect').disabled=active;$('bodySide').disabled=active||$('exerciseSelect').value==='wave';
  $('movement').dataset.sessionActive = String(active);
  $('movement').dataset.manual = String(app.manual);
  if (active) $('movement').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('[data-movement]').forEach(button => { button.disabled = active; });
  app.running = active; $('repBadge').classList.toggle('show', active); $('stageStop').classList.toggle('show', active);
  const captureButton = $('capturePhoto'); if (captureButton) captureButton.disabled = !active || app.manual || $('exerciseSelect').value === 'wave';
  const isWave = $('exerciseSelect').value === 'wave';
  $('stageStop').textContent = isWave ? 'Finish camera check' : 'Finish & save';
  $('startBtn').textContent = active ? 'In progress' : isWave ? 'Start demo' : 'Start session';
  $('startBtn').disabled = active || (!app.manual && (!app.stream || !app.landmarker));
  if ($('pushupVariant')) $('pushupVariant').disabled=active;
  if (active) {
    $('trackingTitle').textContent = app.manual ? 'Manual logging' : isWave ? 'Wave demo' : 'Tracking';
    $('trackingCopy').textContent = app.manual ? 'Add reps below.' : isWave ? 'Raise hand and wave.' : `${activeMovement().metric} estimate · move comfortably.`;
    cameraState(app.manual ? 'Manual' : isWave ? 'Wave demo' : 'Tracking', app.manual || isWave ? 'good' : 'active', app.manual ? 'Camera off · add reps.' : isWave ? 'Demo only · not saved.' : 'Camera angle is an estimate.', isWave ? 'Arm' : app.manual ? 'Manual' : `${app.side} side`);
  }
}

function setCountdownControls(active) {
  if ($('pushupVariant')) $('pushupVariant').disabled=active;
  const wave = $('exerciseSelect').value === 'wave';
  $('manualBtn').disabled = active || wave;
  $('exerciseSelect').disabled = active;
  $('bodySide').disabled = active || wave;
}

function cancelCountdown() {
  if (app.countdownTimer) clearInterval(app.countdownTimer);
  app.countdownTimer = null; app.countdownActive = false;
  $('sessionCountdown').hidden = true;
  app.activeSessionId = null; app.manual = false;
  setCountdownControls(false);
  setActive(false);
  $('trackingTitle').textContent = app.poseReady ? 'Ready' : 'Adjust your camera view';
  $('trackingCopy').textContent = app.poseReady ? 'Move comfortably. Follow your plan.' : activeMovement().frame;
  cameraState(app.poseReady ? 'Ready' : 'Adjust view', app.poseReady ? 'good' : 'neutral', app.poseReady ? 'Camera angle is an estimate.' : activeMovement().frame, app.poseReady ? 'Ready' : '0 joints');
}

function startCountdown() {
  app.countdownActive = true; app.countdownRemaining = 5;
  $('countdownNumber').textContent = '5'; $('sessionCountdown').hidden = false;
  $('startBtn').disabled = true; setCountdownControls(true); $('trackingTitle').textContent = 'Get ready';
  $('trackingCopy').textContent = 'Step back into full view · 5s';
  cameraState('Get ready', 'neutral', 'Step back into full view before tracking starts.', `${app.poseReady ? 'Ready' : '0'} joints`);
  app.countdownTimer = setInterval(() => {
    app.countdownRemaining -= 1;
    if (app.countdownRemaining <= 0) {
      clearInterval(app.countdownTimer); app.countdownTimer = null;
      app.countdownActive = false; $('sessionCountdown').hidden = true;
      if (!app.poseReady) {
        app.activeSessionId = null; setCountdownControls(false); setActive(false);
        $('trackingTitle').textContent = 'Step into view'; $('trackingCopy').textContent = activeMovement().frame;
        toast('Step back into view, then start again.');
        return;
      }
      app.startedAt = Date.now(); setCountdownControls(false); setActive(true);
      toast($('exerciseSelect').value === 'wave' ? 'Wave to test tracking.' : 'Tracking started. Follow your plan.');
      return;
    }
    $('countdownNumber').textContent = String(app.countdownRemaining);
    $('trackingCopy').textContent = `Step back into full view · ${app.countdownRemaining}s`;
  }, 1000);
}

function beginSession(manual = false) {
  pushupCounter.reset(); pushupPose=null;
  $('newSession').hidden = true;
  if (app.pain >= 7) { $('painNote').classList.add('show'); toast('Your pain check-in is noted. Follow your care team’s guidance before deciding whether to exercise.'); }
  app.manual = manual; app.reps = 0; app.phase = 'ready'; app.sessionStartAngle = null; app.sessionAngles = []; app.waveSide = null; app.waveSwitches = 0; app.startedAt = Date.now(); app.activeSessionId = crypto.randomUUID?.() || String(Date.now());
  waveCounter.reset();
  $('repCount').textContent = '0'; $('repReward').textContent = '';
  const target = $('exerciseSelect').value === 'wave' ? 0 : Number(readPlan().reps);
  $('repGoal').textContent = Number.isInteger(target) && target > 0 ? '0 / ' + target + ' session goal' : 'One comfortable rep at a time';
  if (manual) {
    $('cameraEmpty').style.display = 'grid'; $('video').style.display = 'none'; app.stream?.getTracks().forEach((track) => track.stop()); app.stream = null;
    $('overlay').getContext('2d').clearRect(0, 0, $('overlay').width, $('overlay').height); $('manualCounter').style.display = 'flex';
    $('setupTitle').textContent = 'Manual session'; $('setupCopy').textContent = 'Use Add rep below to record each completed repetition.';
    $('trackingTitle').textContent = 'Manual logging'; $('trackingCopy').textContent = 'Add reps below.';
    cameraState('Manual', 'good', 'Camera off · add reps below.', 'Manual');
  } else $('manualCounter').style.display = 'none';
  $('exerciseSelect').disabled = true; $('bodySide').disabled = true;
  const plannedReps = Number(readPlan().reps);
  companion?.start({ manual, movement: $('exerciseSelect').value,
    targetReps: Number.isInteger(plannedReps) && plannedReps > 0 && plannedReps <= 200 ? plannedReps : null });
  if(manual) setActive(true); else startCountdown();
}

$('startBtn').onclick = () => {
  if(app.running||app.countdownActive)return;
  if (!app.stream || !app.landmarker) { toast('Set up camera or log manually.'); return; }
  beginSession(false);
  if (!app.poseReady) toast('Session started. Step into view; counting waits for the selected joints.');
};
$('cancelCountdown').onclick=cancelCountdown;
$('manualBtn').onclick = () => { if (app.running||app.countdownActive) { toast('Finish the current session first.'); return; } beginSession(true); };

const manualCounter = document.createElement('div'); manualCounter.id = 'manualCounter';
manualCounter.style.cssText = 'display:none;justify-content:center;align-items:center;gap:10px;padding:0 16px 15px';
manualCounter.innerHTML = '<button type="button" class="secondary" id="manualMinus" aria-label="Remove one repetition">−</button><span style="font-size:10px;color:var(--muted)">Manual reps</span><button type="button" class="secondary" id="manualPlus" aria-label="Add one repetition">+ Add rep</button>';
document.querySelector('#movement').append(manualCounter);
$('manualMinus').onclick = () => { app.reps = Math.max(0, app.reps - 1); $('repCount').textContent = String(app.reps); companion?.manualRep(app.reps, false); };
$('manualPlus').onclick = () => { app.reps += 1; $('repCount').textContent = String(app.reps); companion?.manualRep(app.reps); };

function endSession() {
  if (!app.running) return;
  const demo = $('exerciseSelect').value === 'wave';
  const duration = Math.max(1, Math.round((Date.now() - app.startedAt) / 60000));
  const highestAngle = app.sessionAngles.length ? Math.round(Math.max(...app.sessionAngles)) : null;
  const startAngle = app.sessionStartAngle === null ? null : Math.round(app.sessionStartAngle);
  const row = {
    id: app.activeSessionId || crypto.randomUUID?.() || String(Date.now()), date: new Date().toISOString(), exercise: activeMovement().title,
    metric: activeMovement().metric, movement: $('exerciseSelect').value, side: $('bodySide').value,
    reps: app.reps, duration, angle: highestAngle, startAngle,
    excursion: highestAngle !== null && startAngle !== null ? Math.max(0, highestAngle - startAngle) : null,
    confidence: app.confidence, pain: app.pain, note: $('note').value.trim(), manual: app.manual, checkin: false,
    ...($('exerciseSelect').value==='pushup'?{variant:pushupVariant(),form:app.manual?null:{version:1,reps:pushupCounter.reps,average:pushupCounter.reps.length?Math.round(pushupCounter.reps.reduce((n,r)=>n+r.score,0)/pushupCounter.reps.length):null}}:{}),
  };
  if($('pushupVariant')) $('pushupVariant').disabled=false;
  companion?.finish(row);
  $('newSession').hidden = false;
  $('movement').dataset.sessionActive = 'false'; $('movement').dataset.manual = 'false';
  $('setupTitle').textContent = 'Set up your camera'; $('setupCopy').textContent = activeMovement().prompt || activeMovement().frame;
  document.querySelectorAll('[data-movement]').forEach(button => { button.disabled = false; });
  app.running = false; $('exerciseSelect').disabled = false; $('bodySide').disabled = demo; $('manualCounter').style.display = 'none'; $('repBadge').classList.remove('show'); $('stageStop').classList.remove('show');
  $('startBtn').textContent = demo ? 'Start camera check' : 'Start camera session';
  $('startBtn').disabled = !app.stream || !app.landmarker;
  if (demo) { app.manual = false; app.activeSessionId = null; $('trackingTitle').textContent = 'Camera check complete'; $('trackingCopy').textContent = 'Choose an exercise above for a saved session and an end-of-session question.'; toast(`Wave check done · ${row.reps} cycles. Not saved.`); return; }
  const sessions = readSessions(); sessions.push(row); saveSessions(sessions); app.manual = false; app.activeSessionId = null;
  if (row.angle !== null) { $('metricRange').textContent = `${row.angle}°`; $('rangeFoot').textContent = `${row.metric} · estimated peak`; }
  else { $('metricRange').textContent = '—'; $('rangeFoot').textContent = 'camera angle unavailable'; }
  $('metricReps').textContent = String(row.reps); $('repFoot').textContent = `repetitions · ${duration} min`; $('note').value = '';
  if (row.manual) { $('cameraEmpty').style.display = 'grid'; $('video').style.display = 'none'; $('trackingTitle').textContent = 'Camera setup guide'; $('trackingCopy').textContent = activeMovement().frame; cameraState('Camera off', 'neutral', 'Allow camera to check framing.', '0 joints'); }
  $('trackingTitle').textContent = 'Session complete'; $('trackingCopy').textContent = `${row.reps} repetition${row.reps === 1 ? '' : 's'} saved. Add a note below, or start another session when you’re ready.`;
  render(); toast('Session saved.');
}
$('stageStop').onclick = endSession;
$('newSession').onclick = () => {
  if (app.running) return;
  companion?.reset();
  app.reps = 0; app.phase = 'ready'; app.sessionStartAngle = null;
  app.sessionAngles = []; app.activeSessionId = null; waveCounter.reset();
  $('repCount').textContent = '0'; $('repReward').textContent = '';
  $('repGoal').textContent = 'Ready for your next session';
  $('newSession').hidden = true;
  $('trackingTitle').textContent = 'Ready for a new session';
  $('trackingCopy').textContent = 'Your previous result is saved. Start a camera session or log manually.';
  $('movement').scrollIntoView({ behavior:'smooth', block:'start' });
};

$('saveCheckin').onclick = () => {
  if (app.confidence === null && app.pain === null && !$('note').value.trim()) { toast('Add a rating or note first.'); return; }
  const sessions = readSessions(); sessions.push({ id: crypto.randomUUID?.() || String(Date.now()), date: new Date().toISOString(), exercise: 'Check-in', reps: null, duration: 0, angle: null, movement: null, side: null, confidence: app.confidence, pain: app.pain, note: $('note').value.trim(), checkin: true });
  saveSessions(sessions); carePages?.saveCheckin(sessions.at(-1)); clearCheckinAnswers(); $('checkinFeedback').textContent = 'Saved on this browser.'; render(); toast('Check-in saved.');
};

function clearCheckinAnswers() {
  app.confidence = null; app.pain = null; $('note').value = '';
  for (const id of ['confidence','pain']) $(id).querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed','false'));
  $('confidenceVal').textContent = 'Not answered'; $('painVal').textContent = 'Not answered'; $('painNote').classList.remove('show');
}

function updateMovementUI() {
  const movement = $('exerciseSelect').value; const wave = movement === 'wave'; const cfg = activeMovement();
  if($('pushupCoach')){$('pushupCoach').hidden=movement!=='pushup';pushupCounter.reset();pushupPose=null;}
  document.querySelectorAll('[data-movement]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.movement === movement)));
  $('exerciseTitle').textContent = wave ? 'Camera wave demo' : cfg.title;
  $('exerciseDesc').textContent = wave ? 'Wave to test tracking' : movement === 'sit' ? '2 sets · 8 reps · chair' : cfg.metric;
  document.querySelector('.plan-chip').textContent = wave ? 'Demo' : 'Today’s plan';
  $('planNoticeText').innerHTML = wave
    ? '<strong>Camera demo.</strong> Wave one arm to test tracking. Not saved to progress.'
    : `<strong>Follow your physio’s plan.</strong> ${cfg.title} · camera angle is an estimate.`;
  $('trackingCopy').textContent = cfg.frame; $('setupTitle').textContent = wave ? 'Show one arm' : 'Set up your camera';
  $('setupCopy').textContent = wave ? 'Face camera. Raise hand and wave.' : cfg.prompt;
  $('enableCamera').textContent = 'Enable camera';
  $('cameraRequirement').textContent = wave ? 'Camera needed' : 'Camera optional';
  $('stage').classList.toggle('wave-mode', wave); $('manualBtn').disabled = wave; $('manualBtn').style.opacity = wave ? '.45' : '';
  $('manualBtn').title = wave ? 'Camera required for demo' : 'Log without camera';
  $('bodySide').disabled = wave; $('startBtn').textContent = wave ? 'Start demo' : 'Start session';
  $('metricAngleLabel').textContent = wave ? 'Camera demo' : cfg.metric;
  $('angleMetricName').textContent = wave ? 'Wave demo' : `${cfg.metric} · ${$('bodySide').value} · ${cfg.view}`;
  $('chartSubtitle').textContent = wave ? 'Demo not tracked' : `${cfg.metric} · ${$('bodySide').value} · degrees`;
  $('trackingTitle').textContent = 'Camera setup';
  const tips = document.querySelectorAll('.setup-tip');
  const tipWords = wave ? [['Face the camera','Show your arm'],['Raise and wave','Keep shoulder, elbow, wrist visible'],['Watch the overlay','Move hand side-to-side']] : [['Step back','Keep the tracked joints in frame'],['Turn to the side','Use a consistent view'],['Use steady light','Avoid a bright window behind you']];
  tips.forEach((tip, index) => { tip.querySelector('b').textContent = tipWords[index][0]; tip.querySelector('span').textContent = tipWords[index][1]; });
  app.poseReady = false; app.currentAngle = null; app.angleSamples = []; updateAngleText();
  if (app.stream && app.landmarker && !app.running) { const result = app.landmarker.detectForVideo($('video'), performance.now()); readPose(result.landmarks?.[0], result.worldLandmarks?.[0]); }
  render();
}
$('exerciseSelect').addEventListener('change', updateMovementUI);
$('bodySide').addEventListener('change', () => { app.side = $('bodySide').value; app.poseReady = false; app.currentAngle = null; updateAngleText(); render(); });

const autoPoseCopy = {
  pushup: ['Use your chosen push-up variation. Hold your comfortable starting position with arms extended, without locking them.', 'Bend your elbows only to your comfortable depth. Hold briefly; do not push into pain.'],
  sit: ['Sit upright on your chair with feet flat, in the position you usually start from.', 'Stand or sit back down slowly to a comfortable endpoint, following your physio’s plan.'],
  reach: ['Stand or sit comfortably with your arm relaxed by your side.', 'Raise your arm only to a comfortable endpoint; keep your trunk relaxed.'],
  elbow: ['Keep your upper arm relaxed by your side and begin with your elbow comfortable.', 'Bend your elbow to a comfortable endpoint without forcing it.'],
};
function updateAutoCalibrationView() {
  const state=app.autoCalibration; const index=state.stage==='end'?1:0; const copy=autoPoseCopy[$('exerciseSelect').value] || autoPoseCopy.sit;
  $('autoCalStepLabel').textContent=`Step ${index+1} of 2 · ${activeMovement().metric}`;
  $('autoCalTitle').textContent=index===0?'Your usual starting pose':'Your comfortable endpoint';
  $('autoCalPrompt').textContent=copy[index];
  $('autoCalAction').textContent=state.stage==='intro'?'Start':state.stage==='between'?'I’m ready':'Hold pose…';
  $('autoCalAction').disabled=state.stage==='start'||state.stage==='end';
}
function beginAutoPoseCapture(stage) {
  const state=app.autoCalibration; state.stage=stage; state.samples=[]; state.phaseAt=null; state.lastSampleAt=0;
  updateAutoCalibrationView();
  $('autoCalStatus').textContent=stage==='start'?'Stand in your usual starting pose. When the required joints are visible, hold comfortably for 3 seconds.':'Move to your comfortable endpoint. When the required joints are visible, hold comfortably for 3 seconds.';
}
function collectAutoCalibration() {
  const state=app.autoCalibration; if (!state.active || !['start','end'].includes(state.stage)) return;
  if (!app.poseReady || app.currentAngle===null) { state.samples=[]; state.phaseAt=null; $('autoCalStatus').textContent='Move into frame until the needed joints are visible.'; return; }
  const now=performance.now(); if (state.phaseAt===null) state.phaseAt=now;
  if (now-state.lastSampleAt>=100) { state.samples.push(app.currentAngle); state.lastSampleAt=now; }
  const remaining=Math.max(0,3000-(now-state.phaseAt)); $('autoCalStatus').textContent=`Hold still as comfortably as you can · ${Math.ceil(remaining/1000)}s`;
  if (remaining>0) return;
  const spread=state.samples.length?Math.max(...state.samples)-Math.min(...state.samples):Infinity;
  if (state.samples.length<15 || spread>20) { state.samples=[]; state.phaseAt=now; $('autoCalStatus').textContent='The angle is still changing. Hold your comfortable pose steady and try again.'; return; }
  const captured=Math.round(median(state.samples));
  if (state.stage==='start') {
    state.firstAngle=captured; state.stage='between'; state.samples=[]; state.phaseAt=null; updateAutoCalibrationView();
    $('autoCalStatus').textContent=`Starting pose saved at about ${captured}°. Now move to your comfortable endpoint and continue.`;
    return;
  }
  const low=Math.min(state.firstAngle,captured); const high=Math.max(state.firstAngle,captured);
  const values=readCalibrations(); const key=calibrationKey(); const previous=values[key];
  values[key]={movement:$('exerciseSelect').value,metric:activeMovement().metric,side:$('bodySide').value,startAngle:low,endAngle:high,targetAngle:previous?.targetAngle??null,source:'guided camera estimate',savedAt:new Date().toISOString()};
  saveCalibrations(values); state.active=false; state.stage='intro'; $('autoCalibrationDialog').close(); render(); toast('Your camera range is calibrated.');
}
async function beginAutoCalibration() {
  if ($('exerciseSelect').value==='wave') { toast('Choose a tracked movement to calibrate.'); return; }
  if (app.running) { toast('Finish the current session before calibrating.'); return; }
  const state=app.autoCalibration; state.active=false; state.stage='intro'; state.firstAngle=null; updateAutoCalibrationView();
  $('autoCalStatus').textContent='Camera angles are estimates. Calibration does not set a physio goal.';
  $('autoCalibrationDialog').showModal();
}
$('startAutoCalibration').onclick=beginAutoCalibration;
$('closeAutoCalibration').onclick=()=>{app.autoCalibration.active=false;app.autoCalibration.stage='intro';$('autoCalibrationDialog').close();};
$('cancelAutoCalibration').onclick=$('closeAutoCalibration').onclick;
$('autoCalAction').onclick=async()=>{
  const state=app.autoCalibration;
  if(state.stage==='intro'){
    $('autoCalStatus').textContent='Starting the camera and pose tracker…';
    if(!app.stream) await startCamera();
    if(!app.stream||!app.landmarker){$('autoCalStatus').textContent='Camera is not ready. Allow access and try again.';return;}
    state.active=true; beginAutoPoseCapture('start');
  } else if(state.stage==='between') beginAutoPoseCapture('end');
};

function openCalibration() {
  if ($('exerciseSelect').value === 'wave') { toast('Choose a tracked movement to set an angle baseline.'); return; }
  const existing = getCalibration($('exerciseSelect').value, $('bodySide').value);
  $('calStart').value = existing?.startAngle ?? '';
  $('calEnd').value = existing?.endAngle ?? '';
  $('calTarget').value = existing?.targetAngle ?? '';
  $('captureStatus').textContent = app.poseReady && app.currentAngle !== null ? `Live: ~${app.currentAngle}°.` : 'Turn on camera or enter your physio’s measurements.';
  $('captureStart').disabled = !app.poseReady || app.currentAngle === null;
  $('captureEnd').disabled = !app.poseReady || app.currentAngle === null;
  $('calibrationInstructions').textContent = `${activeMovement().details} Capture your comfortable range. Add a physio goal if you have one.`;
  $('calibrationDialog').showModal();
}
$('openCalibration').onclick = openCalibration;
$('closeCalibration').onclick = () => $('calibrationDialog').close();
$('cancelCalibration').onclick = () => $('calibrationDialog').close();
function captureAngle(fieldId) {
  if (!app.poseReady || app.currentAngle === null) { $('captureStatus').textContent = 'Joints not visible. Reframe or enter a value.'; return; }
  $(fieldId).value = String(app.currentAngle); $('captureStatus').textContent = `Estimate captured: ~${app.currentAngle}°.`;
}
$('captureStart').onclick = () => captureAngle('calStart');
$('captureEnd').onclick = () => captureAngle('calEnd');
$('saveCalibration').onclick = () => {
  const startAngle = Number($('calStart').value); const endAngle = Number($('calEnd').value);
  const targetAngle = $('calTarget').value === '' ? null : Number($('calTarget').value);
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle) || startAngle < 0 || startAngle > 180 || endAngle < 0 || endAngle > 180) { $('captureStatus').textContent = 'Enter both angles from 0° to 180°.'; return; }
  if (endAngle <= startAngle) { $('captureStatus').textContent = 'End range must be above the starting angle.'; return; }
  if (targetAngle !== null && (!Number.isFinite(targetAngle) || targetAngle < 0 || targetAngle > 180)) { $('captureStatus').textContent = 'Goal must be 0° to 180°, or blank.'; return; }
  const values = readCalibrations();
  values[calibrationKey()] = { movement: $('exerciseSelect').value, metric: activeMovement().metric, side: $('bodySide').value, startAngle, endAngle, targetAngle, source: app.poseReady ? 'camera estimate and user-entered target' : 'manual entry', savedAt: new Date().toISOString() };
  saveCalibrations(values); $('calibrationDialog').close(); render(); toast('Calibration saved.');
};

function renderCalibration() {
  const movement = $('exerciseSelect').value; const side = $('bodySide').value; const cfg = activeMovement(); const cal = getCalibration(movement, side);
  $('angleMetricName').textContent = movement === 'wave' ? 'Wave landmarks · camera test only' : `${cfg.metric} · ${side} side · ${cfg.view} · degrees`;
  if (!cal) { $('calibrationValues').innerHTML = '<div class="angle-empty">Set your comfortable range. Add a physio goal if you have one.</div>'; return; }
  const current = readSessions().filter((row) => row.movement === movement && row.side === side && (movement !== 'pushup' || row.variant === pushupVariant()) && row.angle !== null && !row.demo).at(-1)?.angle ?? cal.endAngle;
  const goal = cal.targetAngle === null ? 'Not set' : `${cal.targetAngle}°`;
  const gap = cal.targetAngle === null ? 'No goal set' : `${Math.abs(cal.targetAngle - current)}° from goal`;
  $('calibrationValues').innerHTML = `<div class="angle-cell"><span>Start</span><strong>${cal.startAngle}°</strong></div><div class="angle-cell"><span>Comfortable range</span><strong>${cal.endAngle}°</strong></div><div class="angle-cell"><span>Latest</span><strong>${current}°</strong></div><div class="angle-cell"><span>Physio goal</span><strong>${goal}</strong><span>${gap}</span></div>`;
  $('angleFootnote').textContent = `${cfg.details} Camera angles are estimates.`;
}

function analyzeMovement(rows, calibration) {
  const movement = $('exerciseSelect').value; const side = $('bodySide').value;
  const sessions = rows.filter((row) => !row.checkin && row.movement === movement && row.side === side && (movement !== 'pushup' || row.variant === pushupVariant()) && row.angle !== null && !row.demo);
  const ordered = sessions.sort((a, b) => new Date(a.date) - new Date(b.date));
  const recent = ordered.slice(-3); const latest = ordered.at(-1); const avg = recent.length ? Math.round(recent.reduce((sum, row) => sum + row.angle, 0) / recent.length) : null;
  const first = ordered[0];
  const checkins = rows.filter((row) => row.confidence !== null || row.pain !== null).sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstPain = checkins.find((row) => row.pain !== null)?.pain; const latestPain = [...checkins].reverse().find((row) => row.pain !== null)?.pain;
  const firstConfidence = checkins.find((row) => row.confidence !== null)?.confidence; const latestConfidence = [...checkins].reverse().find((row) => row.confidence !== null)?.confidence;
  return { sessions: ordered, recent, latest, avg, first, calibration, firstPain, latestPain, firstConfidence, latestConfidence };
}

function renderChart(rows) {
  const movement = $('exerciseSelect').value; const side = $('bodySide').value; const calibration = getCalibration(movement, side);
  const points = rows.filter((row) => !row.checkin && row.movement === movement && row.side === side && (movement !== 'pushup' || row.variant === pushupVariant()) && row.angle !== null && !row.demo).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-10);
  const grid = $('chartGrid'); const chartEmpty = $('chartEmpty'); const height = 135; const left = 43; const right = 495; const top = 8; const bottom = 112;
  const y = (value) => bottom - Math.max(0, Math.min(180, value)) / 180 * (bottom - top);
  grid.innerHTML = [0,45,90,135,180].map((tick) => `<line x1="${left}" y1="${y(tick)}" x2="${right}" y2="${y(tick)}" stroke="#e8ece8" stroke-width="1"/><text x="${left-7}" y="${y(tick)+3}" text-anchor="end" fill="#859189" font-size="9">${tick}°</text>`).join('');
  $('targetPath').setAttribute('d', calibration?.targetAngle === null || calibration?.targetAngle === undefined ? '' : `M${left} ${y(calibration.targetAngle)} L${right} ${y(calibration.targetAngle)}`);
  if (!points.length) {
    $('rangePath').setAttribute('d',''); $('chartDots').innerHTML=''; chartEmpty.style.display='grid'; chartEmpty.textContent = movement === 'wave' ? 'Wave demo is not tracked here.' : 'Log sessions to see your trend.';
    $('chartLabels').innerHTML = '<span>First session</span><span>Recent</span>'; return;
  }
  chartEmpty.style.display='none';
  const times=points.map((row)=>new Date(row.date).getTime()); const span=times.at(-1)-times[0];
  const x=(index)=>points.length===1?250:span>0?left+(times[index]-times[0])/span*(right-left):left+index/(points.length-1)*(right-left);
  const path=points.map((row,index)=>`${index?'L':'M'}${x(index).toFixed(1)} ${y(row.angle).toFixed(1)}`).join(' ');
  $('rangePath').setAttribute('d',path);
  $('chartDots').innerHTML=points.map((row,index)=>`<circle cx="${x(index)}" cy="${y(row.angle)}" r="3.5" fill="#37866b"><title>${new Date(row.date).toLocaleDateString()} · ${row.angle}° ${escapeHtml(row.metric)}</title></circle>`).join('');
  $('chartLabels').innerHTML=`<span>${new Date(points[0].date).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span><span>${new Date(points.at(-1).date).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>`;
}

function renderAnalysis(rows) {
  const movement = $('exerciseSelect').value; const side = $('bodySide').value; const cfg = activeMovement();
  if(movement==='pushup'){
    const sessions=rows.filter(row=>row.movement==='pushup'&&row.side===side&&row.variant===pushupVariant());
    const scored=sessions.filter(row=>Number.isFinite(row.form?.average));
    $('analysisSummary').textContent=`${sessions.length} ${pushupVariant()} push-up sessions${scored.length?` · latest average alignment match ${scored.at(-1).form.average}%`:''}. Chart shows bend depth, not recovery or form accuracy. Compare the same variation, side and camera position.`;
    return;
  }
  if (movement === 'wave') { $('analysisSummary').textContent = 'Wave demo is not included in progress.'; return; }
  const cal = getCalibration(movement, side); const result = analyzeMovement(rows, cal);
  if (!result.sessions.length) { $('analysisSummary').textContent = cal ? 'Calibration saved. Log a session to compare.' : 'Set a comfortable baseline to start.'; return; }
  const first = cal?.endAngle ?? result.first.angle; const change = result.avg - first;
  let summary = `<b>${result.sessions.length} sessions.</b> Average peak: ${result.avg}° ${cfg.metric.toLowerCase()}. `;
  summary += `${change === 0 ? 'No change' : `${change > 0 ? '+' : '−'}${Math.abs(change)}°`} vs ${cal ? 'baseline' : 'first session'}. `;
  if (cal?.targetAngle !== null && cal?.targetAngle !== undefined) summary += `Goal: ${cal.targetAngle}° (${Math.abs(cal.targetAngle - result.avg)}° difference). `;
  if (result.firstPain !== undefined && result.latestPain !== undefined) summary += `Pain: ${result.firstPain} → ${result.latestPain}/10. `;
  if (result.firstConfidence !== undefined && result.latestConfidence !== undefined) summary += `Confidence: ${result.firstConfidence} → ${result.latestConfidence}/5. `;
  if (result.firstPain !== undefined && result.latestPain - result.firstPain >= 2) summary += '<span class="trend-flag">Pain is higher. Mention it to your physio.</span> ';
  summary += 'Camera angles are estimates.';
  $('analysisSummary').innerHTML = summary;
}

function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character])); }
function pushupFormText(row) { return row.movement==='pushup'?` · ${escapeHtml(row.variant||'floor')}${Number.isFinite(row.form?.average)?` · alignment match ${row.form.average}%`:''}`:''; }

function reportData() {
  const rows = readSessions(); const practice = rows.filter((row) => !row.checkin && !row.demo); const movement = $('exerciseSelect').value; const side = $('bodySide').value;
  const cal = movement === 'wave' ? null : getCalibration(movement, side); const scoped = practice.filter((row) => row.movement === movement && row.side === side && (movement !== 'pushup' || row.variant === pushupVariant()) && row.angle !== null).sort((a,b) => new Date(a.date)-new Date(b.date));
  const first = scoped[0]; const latest = scoped.at(-1); const recent = scoped.slice(-3); const avg = recent.length ? Math.round(recent.reduce((sum,row)=>sum+row.angle,0)/recent.length) : null;
  const checkins=rows.filter((row)=>row.confidence!==null||row.pain!==null).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const latestCheckin=[...checkins].reverse()[0]; const notes=rows.filter((row)=>row.note).slice(-5).map((row)=>row.note);
  const measured=scoped.slice(-5).map((row)=>`${new Date(row.date).toLocaleDateString()} · ~${escapeHtml(row.angle)}° · ${row.reps} reps${pushupFormText(row)}`).join('\n') || 'No camera sessions yet.';
  const angleText=latest?`${activeMovement().metric} (${side}): baseline ${cal?.endAngle??first.angle}° · recent avg ${avg}° · latest ${latest.angle}°${cal?.targetAngle!==null&&cal?.targetAngle!==undefined?` · physio goal ${cal.targetAngle}°`:''}`:'No angle sessions yet.';
  const painText=latestCheckin?`Confidence ${latestCheckin.confidence??'—'}/5 · pain ${latestCheckin.pain??'—'}/10`:'No check-in yet.';
  const text=`FORMNOTE · VISIT PREP\n${new Date().toLocaleDateString()} · Jamie Parker\n\nMOVEMENT\n${angleText}\n${measured}\n\nCHECK-IN\n${painText}\n\nNOTES\n${notes.length?notes.map((note)=>`• ${note}`).join('\n'):'None yet.'}\n\nASK MY PHYSIO\n• Is this camera angle useful for my plan?\n• Is my goal still right for me?\n• What should I do if pain changes?\n\nCamera angles are estimates. Review before sharing.`;
  return { rows, practice, cal, scoped, first, latest, avg, latestCheckin, notes, text };
}

function updateCue(data = reportData()) {
  const { latest, first, cal } = data;
  if($('exerciseSelect').value==='pushup') { $('cueText').textContent=latest?.form?.average!==null&&Number.isFinite(latest?.form?.average)?`Latest ${latest.variant} push-up session: ${latest.reps} reps · ${latest.form.average}% average alignment match. Compare with your physio; this score only covers the visible body line.`:'Try the push-up form demo to record body alignment and elbow bend. Your physio sets the appropriate variation and range.';return; }
  if (!latest) { $('cueText').textContent = 'Log sessions to compare angles. Goals come from your physio.'; return; }
  const baseline = cal?.endAngle ?? first?.angle; const delta = latest.angle - baseline;
  $('cueText').textContent = `Latest ${latest.metric}: ~${latest.angle}°${baseline !== undefined ? ` (${delta > 0 ? '+' : ''}${delta}° from baseline)` : ''}. Confidence ${latest.confidence ?? '—'}/5 · pain ${latest.pain ?? '—'}/10.`;
}

function render() {
  carePages?.render();
  const rows = readSessions(); const movement = $('exerciseSelect').value; const side = $('bodySide').value;
  renderJournalOverview(rows);
  renderCalibration(); renderChart(rows); renderAnalysis(rows); updateCue(reportData()); renderPlan();
  const practice=rows.filter((row)=>!row.checkin&&!row.demo); const days=new Set(practice.filter((row)=>Date.now()-new Date(row.date).getTime()<7*864e5).map((row)=>new Date(row.date).toDateString())).size;
  $('metricStreak').textContent=String(days); const list=$('sessionList');
  if (!rows.length) { list.innerHTML='<div class="empty-sessions">No sessions yet.</div>'; $('reportStatus').textContent='No sessions yet.'; return; }
  list.innerHTML=rows.slice(-5).reverse().map((row)=>`<div class="session-row"><div class="session-date"><strong>${new Date(row.date).getDate()}</strong>${new Date(row.date).toLocaleDateString(undefined,{month:'short'})}</div><div class="session-main"><b>${row.checkin?'Check-in':escapeHtml(row.exercise)}</b><span>${row.checkin?'Personal check-in saved':`${row.reps??0} reps · ${row.manual?'manual log':'camera session'}${row.angle!==null?` · ~${row.angle}° ${escapeHtml(row.metric)}`:''}${pushupFormText(row)}`}</span></div><span class="session-pain">${row.pain===null?'Pain —':`Pain ${row.pain}/10`}</span></div>`).join('');
  const num=practice.length; $('reportStatus').textContent=`${num} sessions · ${rows.filter((row)=>row.checkin||row.confidence!==null||row.pain!==null).length} check-ins`;
}

function pushupThresholds() {
  const cal=getCalibration('pushup',$('bodySide').value);
  if(cal && cal.startAngle<=40 && cal.endAngle-cal.startAngle>=25) return {top:Math.min(45,cal.startAngle+12),bottom:Math.max(cal.startAngle+30,cal.endAngle-8),personal:true};
  return {top:25,bottom:65,personal:false};
}
function showPushupWaiting(copy) {
  if(!$('pushupScore'))return;
  $('pushupScore').textContent='—'; $('pushupElbow').textContent='—'; $('pushupBody').textContent='—'; $('pushupDepth').textContent='—';
  $('pushupCue').textContent=copy; $('pushupPhase').textContent='Waiting for pose';
}
function readPushupPose(landmarks,world) {
  const now=performance.now();
  pushupPose=assessPushup({landmarks,world,side:app.side,variant:pushupVariant(),aspect:($('video').videoWidth||16)/($('video').videoHeight||9)});
  app.poseReady=pushupPose.valid;
  const threshold=pushupThresholds();
  if(!pushupPose.valid){
    app.currentAngle=null;app.angleSamples=[];pushupCounter.pause();
    // A lost pose interrupts a calibration hold as well as a repetition.
    if(app.autoCalibration.active){app.autoCalibration.samples=[];app.autoCalibration.phaseAt=null;}
    $('startBtn').disabled=app.running||app.countdownActive||!app.stream||!app.landmarker;updateAngleText();
    if(now-pushupUiAt>200){pushupUiAt=now;showPushupWaiting(pushupPose.cue);cameraState('Adjust view','bad',pushupPose.cue,`${pushupPose.count}/${pushupPose.total} joints`);}
    return false;
  }
  app.angleSamples.push(pushupPose.flexion);if(app.angleSamples.length>7)app.angleSamples.shift();
  app.currentAngle=Math.round(median(app.angleSamples));
  pushupPose.flexion=app.currentAngle; collectAutoCalibration(); updateAngleText();
  if(app.running&&!app.manual){
    app.sessionAngles.push(app.currentAngle);
    const rep=pushupCounter.update(pushupPose,now,threshold);
    if(rep){app.reps=pushupCounter.reps.length;$('repCount').textContent=String(app.reps);}
  }
  $('startBtn').disabled=app.running||app.countdownActive;
  if(now-pushupUiAt<200)return true;pushupUiAt=now;
  const phase=pushupCounter.phase;
  const cue=!pushupPose.aligned?pushupPose.cue:phase==='find-top'?'Hold your starting position with arms extended, without locking.':phase==='lower'?`Lower slowly within your comfortable range${app.currentAngle>=threshold.bottom?' · depth reached':''}.`:'Press back to your starting position, keeping your trunk steady.';
  $('pushupScore').textContent=`${pushupPose.score}%`;
  $('pushupBody').textContent=`${Math.round(pushupPose.bodyAngle)}°`;
  $('pushupElbow').textContent=`${180-app.currentAngle}°`;
  $('pushupDepth').textContent=`${Math.min(100,Math.round(app.currentAngle/threshold.bottom*100))}%`;
  $('pushupPhase').textContent=app.countdownActive?'Get ready':!app.running?'Camera preview':phase==='find-top'?'Find starting position':phase==='lower'?'Lower':'Press up';
  $('pushupCue').textContent=app.countdownActive?`Get into position · ${app.countdownRemaining}s`:cue;
  $('pushupTarget').textContent=threshold.personal?`Your calibrated range · bend target ~${threshold.bottom}°`:`Demo bend target ~${threshold.bottom}° · calibrate to use your comfortable range`;
  $('trackingTitle').textContent=app.countdownActive?'Get ready':`${pushupPose.score}% alignment match`;
  $('trackingCopy').textContent=cue;
  cameraState(app.countdownActive?'Get ready':app.running?'Coaching':'Ready',pushupPose.aligned?'good':'neutral',cue,`${pushupPose.count}/${pushupPose.total} joints`);
  return true;
}
function buildPushupCoach() {
  const coach=document.createElement('section');coach.id='pushupCoach';coach.className='pushup-coach';coach.hidden=true;
  coach.innerHTML=`<div class="pushup-intro"><div><span class="eyebrow">Guided form demo</span><h2>Push-up</h2><p>Lower with control. Press up as one unit.</p></div><label>Variation<select id="pushupVariant"><option value="floor">Floor · full body</option><option value="knees">Knees supported</option><option value="wall">Wall push-up</option></select></label></div>
  <div class="pushup-lesson"><div class="pushup-illustration"><svg id="pushupIllustration" viewBox="0 0 320 170" role="img" aria-label="Push-up starting position, side view"></svg><div class="pushup-demo-controls"><button type="button" data-pushup-step="top" aria-pressed="true">1. Start / press</button><button type="button" data-pushup-step="bottom" aria-pressed="false">2. Lower</button></div></div><ol><li>Camera side-on; choose the side nearest the lens. Show hands, shoulders, hips and legs.</li><li id="pushupVariantCopy">Keep shoulders, hips and ankles in line. Start with arms extended, without locking.</li><li>Bend within your comfortable range, then press back up. Stop if pain increases.</li></ol></div>
  <div class="pushup-live"><div class="pushup-match"><span>Alignment match</span><strong id="pushupScore">—</strong><small>Visible body line · estimated</small></div><div class="pushup-metrics"><div><span>Elbow angle</span><b id="pushupElbow">—</b></div><div><span>Body line · straight ≈ 180°</span><b id="pushupBody">—</b></div><div><span>Bend target reached</span><b id="pushupDepth">—</b></div></div></div>
  <div class="pushup-feedback"><span id="pushupPhase">Waiting for pose</span><p id="pushupCue" role="status" aria-live="polite">Set up your camera, then hold the starting position.</p><small id="pushupTarget">Demo thresholds · use Quick calibrate for your comfortable range.</small></div>
  <details class="pushup-method"><summary>What this checks</summary><p>Estimated 3D elbow angle and shoulder–hip–ankle alignment (shoulder–hip–knee for knee push-ups). Reps need a steady start, bend, and return. Tracking pauses when joints leave view. The percentage measures a match to these limited checks; it is not medical accuracy or a complete form assessment.</p><p>The default rep thresholds are prototype settings, not prescribed rehabilitation angles. Quick calibrate records a separate range for each variation and side. A side camera cannot reliably judge elbow flare, shoulder-blade movement, hand pressure or pain. Only use exercises approved for your plan.</p><a href="https://www.southtees.nhs.uk/resources/combined-press-ups/" target="_blank" rel="noopener">NHS: wall and knee press-ups</a> · <a href="https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/" target="_blank" rel="noopener">ACE: floor push-up technique</a></details>`;
  const controls=$('movement').querySelector('.session-actions')||$('movement').querySelector('.camera-controls');controls.after(coach);
  $('exerciseSelect').hidden=false;
  const oldSettings=$('movement').querySelector('.practice-settings');
  if(oldSettings){controls.append($('capturePhoto'),$('cameraRequirement'));oldSettings.remove();}
  const selection=$('exerciseSelect').closest('label');selection.className='movement-choice';controls.after(selection);
  coach.querySelectorAll('[data-pushup-step]').forEach(button=>button.onclick=()=>drawPushupGuide(button.dataset.pushupStep));
  $('pushupVariant').onchange=()=>{pushupCounter.reset();pushupPose=null;app.poseReady=false;app.currentAngle=null;app.angleSamples=[];$('startBtn').disabled=true;drawPushupGuide('top');showPushupWaiting('Hold the starting position for this variation.');render();};
  $('bodySide').addEventListener('change',()=>{pushupCounter.reset();pushupPose=null;showPushupWaiting('Hold the starting position on the selected side.');});
  drawPushupGuide('top');
}
function drawPushupGuide(step) {
  const wall=pushupVariant()==='wall',knees=pushupVariant()==='knees',bottom=step==='bottom';
  const shoulder=bottom?[90,91]:[90,54],hip=bottom?[175,104]:[175,82],endpoint=knees?[220,120]:[280,120],elbow=bottom?[55,110]:[82,90];
  const line=`M${shoulder} L${hip} L${endpoint}${knees?' L265,135':''} M${shoulder} L${elbow} L80,140`;
  $('pushupIllustration').innerHTML=wall?`<path class="demo-surface" d="M262 10v145M30 150h240"/><circle cx="${bottom?217:183}" cy="28" r="10"/><path d="M${bottom?217:183},40 L${bottom?199:179},90 L170,145 M${bottom?217:183},45 L${bottom?235:220},69 L260,50"/>`:`<path class="demo-surface" d="M20 143h285"/><circle cx="${shoulder[0]-17}" cy="${shoulder[1]-12}" r="10"/><path d="${line}"/>`;
  $('pushupIllustration').setAttribute('aria-label',`${pushupVariant()} push-up · ${bottom?'lowered':'starting'} position · schematic`);
  $('pushupVariantCopy').textContent=wall?'Place hands on a stable wall around shoulder level. Keep your trunk steady as you lean in.':knees?'Keep shoulders, hips and knees in line, with knees supported. Extend arms without locking.':'Keep shoulders, hips and ankles in line. Start with arms extended, without locking.';
  document.querySelectorAll('[data-pushup-step]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.pushupStep===step)));
}
function buildAppScreens() {
  const content = document.querySelector('.content');
  const welcome = content.querySelector('.welcome');
  const notice = $('planNotice');
  const movement = $('movement');
  const stats = $('metricStats');
  const calibration = $('angleCalibration');
  const checkin = $('checkin');
  const reflection = content.querySelector('.coach-card');
  const progress = $('progress');
  const report = $('visit-note');
  const recent = $('recentSessions');
  const disclaimer = content.querySelector('.footer-disclaimer');
  const screens = [
    ['home', 'Home', 'Your plan for today.'],
    ['move', 'Practice', 'Your prescribed movement.'],
    ['checkin', 'Check-in', 'A quick record of how you feel.'],
    ['progress', 'Progress', 'Movement over time.'],
    ['visit', 'Visit note', 'A summary to review with your physio.'],
  ].map(([key, title, subtitle]) => {
    const section = document.createElement('section');
    section.className = 'app-screen'; section.dataset.screenView = key; section.id = `screen-${key}`; section.hidden = true;
    section.innerHTML = key === 'home' ? '' : `<div class="screen-heading"><div class="eyebrow">Formnote · ${key === 'move' ? 'Practice' : key === 'visit' ? 'Visit prep' : key}</div><h1>${title}</h1><p>${subtitle}</p></div>`;
    content.append(section); return section;
  });
  const byName = Object.fromEntries(screens.map((screen) => [screen.dataset.screenView, screen]));
  const homeFocus = document.createElement('section'); homeFocus.className = 'home-focus card';
  homeFocus.innerHTML = '<div class="home-focus-copy"><span class="home-kicker">TODAY’S PLAN</span><h2 id="homeExercise">Sit-to-stand</h2><p id="homePlanCopy">2 sets · 8 reps · camera optional</p><div class="home-hero-meta"><span>About 8 min</span><span>Alex Chen, PT</span></div><button class="primary" type="button" data-open-screen="move">Begin session <span aria-hidden="true">→</span></button></div><div class="home-art" aria-hidden="true"><svg viewBox="0 0 220 220"><path class="art-chair" d="M42 152h39v-59M41 152v31m40-31v31m-40-20h40"/><circle class="art-head" cx="139" cy="57" r="15"/><path class="art-body" d="M135 76l-10 47 34 14m-34-14-32 27m32-27 30 36m-30-36-22 32"/><path class="art-joint" d="M123 123l-9 13m35 1 10-4"/><path class="art-motion" d="M101 67a49 49 0 0 1 76 22"/><path class="art-arrow" d="m171 78 8 12 4-14"/></svg></div>';
  const homeLinks = document.createElement('div'); homeLinks.className = 'home-shortcuts';
  homeLinks.innerHTML = '<div class="journal-list-heading"><span>YOUR NOTES</span><span>Keep track between visits</span></div><button class="shortcut-card" type="button" data-open-screen="checkin"><span class="shortcut-num">01</span><span><b>Check-in</b><small>Pain, confidence and a note for your physio</small></span><span class="shortcut-arrow">↗</span></button><button class="shortcut-card" type="button" data-open-screen="progress"><span class="shortcut-num">02</span><span><b>Progress</b><small>Range, sessions and photos</small></span><span class="shortcut-arrow">↗</span></button><button class="shortcut-card" type="button" data-open-screen="visit"><span class="shortcut-num">03</span><span><b>Visit note</b><small>A summary you can review and share</small></span><span class="shortcut-arrow">↗</span></button>';
  byName.home.append(welcome, homeFocus, homeLinks);
  const practiceLayout = document.createElement('div'); practiceLayout.className = 'practice-layout';
  const practiceAside = document.createElement('aside'); practiceAside.className = 'practice-aside';
  practiceLayout.append(movement, practiceAside); practiceAside.append(stats, calibration); byName.move.append(practiceLayout);
  const checkinLayout = document.createElement('div'); checkinLayout.className = 'checkin-layout';
  checkinLayout.append(checkin, reflection); byName.checkin.append(checkinLayout);
  const progressLayout = document.createElement('div'); progressLayout.className = 'progress-layout';
  const progressMain = document.createElement('div'); progressMain.className = 'progress-main';
  const progressAside = document.createElement('aside'); progressAside.className = 'progress-aside';
  progressLayout.append(progressMain, progressAside); progressMain.append(progress, recent); byName.progress.append(progressLayout);
  const progressTools = document.createElement('div'); progressTools.className = 'progress-tools';
  progressTools.innerHTML = `<section class="card panel"><div class="panel-top"><div><h2>My physio plan</h2><p>Scan your paper or enter the goals your physio gave you.</p></div></div><form id="physioPlanForm" class="plan-form"><label>Diagnosis or focus<input id="planDiagnosis" maxlength="120" placeholder="Optional"></label><label>Instructions from your physio<textarea id="planInstructions" maxlength="500" placeholder="Movement, sets, reps, precautions"></textarea></label><div class="plan-grid"><label>Sessions per week<input id="planSessions" type="number" min="0" max="14" placeholder="e.g. 3"></label><label>Reps per session<input id="planReps" type="number" min="0" max="200" placeholder="e.g. 8"></label></div><button class="primary" type="submit">Save plan</button><div class="plan-summary" id="planSummary" aria-live="polite"></div><p class="fine-print">Progress is compared with the targets you enter. Follow your physio’s advice; this app does not interpret diagnoses.</p></form><div class="upload-row"><label class="secondary upload-button" for="diagnosisFile">Scan paper</label><input id="diagnosisFile" type="file" accept="application/pdf,image/*" hidden><span class="upload-hint">PDF or photo · scan runs on this device</span></div><div id="scanStatus" class="scan-status" role="status" aria-live="polite"></div><details id="scanReview" class="scan-review" hidden><summary>Review text found on paper</summary><textarea id="scanText" readonly></textarea><button type="button" id="applyScan" class="secondary">Fill plan fields from paper</button></details><div id="documentList" class="media-list"></div></section><section class="card panel"><div class="panel-top"><div><h2>Session photos</h2><p>Take optional snapshots during practice, then review them here.</p></div><span class="optional">Private</span></div><p class="fine-print">Photos are only taken when you press Capture photo. Live video is not saved.</p><div id="photoGallery" class="photo-gallery"><div class="media-empty">No session photos yet.</div></div></section>`;
  progressAside.append(progressTools);
  const capture = document.createElement('button'); capture.type = 'button'; capture.className = 'secondary'; capture.id = 'capturePhoto'; capture.textContent = 'Capture photo'; capture.disabled = true; capture.title = 'Start a camera session to capture a photo.';
  $('cameraRequirement').before(capture);
  // Keep the primary session actions visible; reveal device choices on demand.
  const cameraOptions = document.createElement('details'); cameraOptions.className = 'camera-options';
  cameraOptions.innerHTML = '<summary>Movement & camera settings</summary><div class="camera-option-fields"></div>';
  const optionFields = cameraOptions.querySelector('div');
  [['exerciseSelect','Movement'],['bodySide','Body side'],['cameraSelect','Camera']].forEach(([id,label]) => {
    const field = document.createElement('label'); field.textContent = label; field.append($(id)); optionFields.append(field);
  });
  optionFields.append($('switchCamera')); $('movement').append(cameraOptions);
  buildPushupCoach();
  // Progress has three separate workspaces, rather than a chart beside a long form.
  const progressNav = document.createElement('nav'); progressNav.className = 'record-nav'; progressNav.setAttribute('aria-label','Progress views');
  progressNav.innerHTML = '<button type="button" aria-pressed="true" aria-controls="record-overview" data-record-view="overview">Overview</button><button type="button" aria-pressed="false" aria-controls="record-photos" data-record-view="photos">Session photos</button><button type="button" aria-pressed="false" aria-controls="record-plan" data-record-view="plan">Care plan</button>';
  const overview = document.createElement('section'); overview.id = 'record-overview'; overview.className = 'record-view';
  const progressTotals = document.createElement('div'); progressTotals.className = 'record-totals'; progressTotals.id = 'recordTotals';
  const measurement = document.createElement('div'); measurement.className = 'measurement-picker';
  measurement.innerHTML = '<label for="progressMovement">Movement</label><select id="progressMovement" aria-label="Progress movement">'+$('exerciseSelect').innerHTML+'</select><label for="progressSide">Side</label><select id="progressSide" aria-label="Progress body side">'+$('bodySide').innerHTML+'</select>';
  overview.append(progressTotals, measurement, progressMain);
  const planView = document.createElement('section'); planView.id = 'record-plan'; planView.className = 'record-view care-plan-view'; planView.hidden = true;
  const photosView = document.createElement('section'); photosView.id = 'record-photos'; photosView.className = 'record-view'; photosView.hidden = true;
  const [planPanel, photosPanel] = progressTools.children;
  planView.append(planPanel); photosView.append(photosPanel);
  progressLayout.remove(); byName.progress.append(progressNav, overview, photosView, planView);
  progressNav.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    progressNav.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    [overview,photosView,planView].forEach(view => { view.hidden = view.id !== `record-${button.dataset.recordView}`; });
  }));
  [['progressMovement','exerciseSelect'],['progressSide','bodySide']].forEach(([progressId, practiceId]) => {
    $(progressId).addEventListener('change', () => { $(practiceId).value = $(progressId).value; $(practiceId).dispatchEvent(new Event('change')); });
  });
  const week = document.createElement('section'); week.className = 'week-journal'; week.innerHTML = '<div class="week-heading"><h2>Your week</h2><span id="weekCount"></span></div><div class="week-days" id="weekDays"></div>';
  byName.home.insertBefore(week,homeLinks);
  // A consistent stroke icon family replaces platform-dependent text symbols.
  const navPaths = { home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9', move:'m8 5 4-2 3 4 5 2M12 4l-2 8 5 3 2 6M10 12l-5 8M4 10l5-2', checkin:'M12 20S3 15 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 7-9 12-9 12Z', progress:'M4 3v17h17M7 14l4-4 4 2 5-7', visit:'M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h7' };
  document.querySelectorAll('.nav button, .mobile-nav button').forEach(button => {
    const icon = button.querySelector('span'); icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${navPaths[button.dataset.screen]}"/></svg>`;
  });
  const visitGuide = document.createElement('section'); visitGuide.className = 'visit-guide';
  visitGuide.innerHTML = '<div class="visit-guide-icon">✳</div><div><b>Your note stays private.</b><p>Review it, then copy or download to share.</p></div>';
  byName.visit.append(report, visitGuide, disclaimer);
  content.querySelector('.layout')?.remove(); content.querySelector('.lower')?.remove();
  let activeScreen = 'home';
  const switchTo = (key) => {
    if (!byName[key]) return;
    if (activeScreen === 'move' && key !== 'move' && app.running) { toast('Finish the active session before leaving Practice.'); return; }
    if (activeScreen === 'move' && key !== 'move' && app.autoCalibration.active) { toast('Finish calibration before leaving Practice.'); return; }
    if (activeScreen === 'move' && key !== 'move' && app.countdownActive) cancelCountdown();
    if (activeScreen === 'move' && key !== 'move' && app.stream) {
      app.stream.getTracks().forEach((track) => track.stop()); app.stream = null; cancelAnimationFrame(app.raf); app.raf = 0;
      $('video').srcObject = null; $('video').style.display = 'none'; $('cameraEmpty').style.display = 'grid';
      $('trackingStatus').classList.remove('show'); cameraState('Camera off', 'neutral', 'Allow camera to check framing.', '0 joints');
      $('startBtn').disabled = true;
    }
    activeScreen = key;
    Object.values(byName).forEach((screen) => { screen.hidden = screen.dataset.screenView !== key; screen.classList.toggle('screen-active', !screen.hidden); });
    document.querySelectorAll('[data-screen]').forEach((button) => {
      const active = button.dataset.screen === key; button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    document.querySelector('.breadcrumb b').textContent = key === 'home' ? 'Home' : screens.find((screen) => screen.dataset.screenView === key)?.querySelector('h1')?.textContent || 'Home';
    history.replaceState(null, '', `#${key}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  document.querySelectorAll('[data-screen]').forEach((button) => button.addEventListener('click', () => switchTo(button.dataset.screen)));
  document.querySelectorAll('[data-open-screen]').forEach((button) => button.addEventListener('click', () => switchTo(button.dataset.openScreen)));
  const initial = location.hash.slice(1);
  switchTo(byName[initial] ? initial : 'home');
  return { switchTo };
}

function renderJournalOverview(rows) {
  if (!$('weekDays')) return;
  const practice = rows.filter(row => !row.checkin && !row.demo);
  const now = new Date(); now.setHours(0,0,0,0);
  let count = 0;
  $('weekDays').innerHTML = Array.from({length:7}, (_,index) => {
    const day = new Date(now); day.setDate(day.getDate() - 6 + index);
    const done = practice.some(row => new Date(row.date).toDateString() === day.toDateString()); if (done) count++;
    return `<div class="week-day${done?' completed':''}${index===6?' today':''}"><span>${day.toLocaleDateString(undefined,{weekday:'short'})}</span><b>${day.getDate()}</b><span class="day-mark" aria-label="${done?'Practice recorded':'No practice recorded'}">${done?'✓':'—'}</span></div>`;
  }).join('');
  $('weekCount').textContent = `${count} practice ${count===1?'day':'days'}`;
  const pain = [...rows].reverse().find(row => Number.isFinite(row.pain));
  const confidence = [...rows].reverse().find(row => Number.isFinite(row.confidence));
  $('recordTotals').innerHTML = `<div><span>Sessions recorded</span><strong>${practice.length}</strong></div><div><span>Latest pain</span><strong>${pain?`${pain.pain}<small> / 10</small>`:'—'}</strong></div><div><span>Latest confidence</span><strong>${confidence?`${confidence.confidence}<small> / 5</small>`:'—'}</strong></div>`;
  $('progressMovement').value = $('exerciseSelect').value; $('progressSide').value = $('bodySide').value;
}

const appNavigation = buildAppScreens();
const requestedMovement=new URLSearchParams(location.search).get('movement');
if(requestedMovement && movements[requestedMovement]) $('exerciseSelect').value=requestedMovement;

function mediaDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MEDIA_DB, 1);
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' }); if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function mediaAll(store) {
  const db = await mediaDb(); return new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => { db.close(); const prefix = `${activeDataScope}:`; const rows = request.result || []; resolve(rows.filter((item) => item.id?.startsWith(prefix) || (activeDataScope === 'guest' && !String(item.id).includes(':')))); }; request.onerror = () => { db.close(); reject(request.error); }; });
}
async function mediaPut(store, value) {
  const db = await mediaDb(); const scopedValue = { ...value, id: `${activeDataScope}:${value.id}` }; return new Promise((resolve, reject) => { const request = db.transaction(store, 'readwrite').objectStore(store).put(scopedValue); request.onsuccess = () => { db.close(); resolve(); }; request.onerror = () => { db.close(); reject(request.error); }; });
}
async function mediaDelete(store, id) {
  const db = await mediaDb(); return new Promise((resolve, reject) => { const request = db.transaction(store, 'readwrite').objectStore(store).delete(id); request.onsuccess = () => { db.close(); resolve(); }; request.onerror = () => { db.close(); reject(request.error); }; });
}
const mediaUrls = new Set();
function clearMediaUrls() { mediaUrls.forEach((url) => URL.revokeObjectURL(url)); mediaUrls.clear(); }
async function renderMedia() {
  clearMediaUrls();
  try {
    const [photos, docs] = await Promise.all([mediaAll('photos'), mediaAll('documents')]);
    const gallery = $('photoGallery');
    gallery.innerHTML = photos.length ? photos.sort((a,b) => b.date.localeCompare(a.date)).map((photo) => { const url=URL.createObjectURL(photo.blob); mediaUrls.add(url); return `<article class="photo-item"><a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Session photo from ${escapeHtml(new Date(photo.date).toLocaleDateString())}"></a><div><b>${escapeHtml(photo.exercise)}</b><small>${escapeHtml(new Date(photo.date).toLocaleString())}</small><button class="text-action" data-delete-photo="${escapeHtml(photo.id)}">Delete</button></div></article>`; }).join('') : '<div class="media-empty">No session photos yet. Capture one during a camera session.</div>';
    const list = $('documentList');
    list.innerHTML = docs.length ? docs.sort((a,b) => b.date.localeCompare(a.date)).map((doc) => { const url=URL.createObjectURL(doc.blob); mediaUrls.add(url); return `<div class="document-item"><a href="${url}" target="_blank" rel="noopener">${escapeHtml(doc.name)}</a><small>${escapeHtml(new Date(doc.date).toLocaleDateString())}</small>${doc.extractedText ? `<button class="text-action" data-apply-document="${escapeHtml(doc.id)}">Fill fields</button>` : ''}<button class="text-action" data-delete-document="${escapeHtml(doc.id)}">Remove</button></div>`; }).join('') : '<div class="media-empty">No diagnosis paper added.</div>';
    gallery.querySelectorAll('[data-delete-photo]').forEach((button) => button.onclick = async () => { await mediaDelete('photos', button.dataset.deletePhoto); renderMedia(); });
    list.querySelectorAll('[data-delete-document]').forEach((button) => button.onclick = async () => { await mediaDelete('documents', button.dataset.deleteDocument); renderMedia(); });
    list.querySelectorAll('[data-apply-document]').forEach((button) => button.onclick = async () => { const doc=docs.find((item)=>item.id===button.dataset.applyDocument); if (doc) applyExtractedText(doc.extractedText); });
  } catch (error) { console.warn('Local media storage unavailable', error); toast('Could not open local photo storage.'); }
}
function readPlan() { try { return JSON.parse(localStorage.getItem(scopedStorageKey(PLAN_KEY)) ?? (activeDataScope === 'guest' ? localStorage.getItem(PLAN_KEY) : null) ?? '{}'); } catch { return {}; } }
function renderPlan() {
  const plan = readPlan();
  $('planDiagnosis').value = plan.diagnosis || ''; $('planInstructions').value = plan.instructions || ''; $('planSessions').value = plan.sessions || ''; $('planReps').value = plan.reps || '';
  const cutoff = Date.now() - 7 * 864e5; const practiced = readSessions().filter((row) => !row.checkin && !row.demo && new Date(row.date).getTime() >= cutoff).length;
  const target = Number(plan.sessions) || 0; const reps = Number(plan.reps) || 0;
  $('planSummary').innerHTML = target ? `<b>${practiced} of ${target}</b> planned sessions in the last 7 days${reps ? ` · goal ${reps} reps/session` : ''}${plan.diagnosis ? `<br><span>${escapeHtml(plan.diagnosis)}</span>` : ''}` : 'Add the schedule from your physio to compare it with your logged sessions.';
}
$('physioPlanForm').onsubmit = (event) => { event.preventDefault(); localStorage.setItem(scopedStorageKey(PLAN_KEY), JSON.stringify({ diagnosis: $('planDiagnosis').value.trim(), instructions: $('planInstructions').value.trim(), sessions: $('planSessions').value, reps: $('planReps').value })); renderPlan(); carePages?.render(); toast('Physio plan saved on this device.'); };
function applyExtractedText(text) {
  const cleaned = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) { toast('No readable text found. Try a clearer photo or a text-based PDF.'); return; }
  $('scanText').value = cleaned; $('scanReview').hidden = false;
  const lines = cleaned.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const diagnosisLine = lines.find((line) => /^(diagnosis|primary diagnosis|condition|reason for referral)\s*[:\-]/i.test(line));
  $('planDiagnosis').value = diagnosisLine ? diagnosisLine.replace(/^(diagnosis|primary diagnosis|condition|reason for referral)\s*[:\-]\s*/i, '').slice(0, 120) : '';
  $('planInstructions').value = cleaned.slice(0, 500);
  const sessions = cleaned.match(/\b(\d{1,2})\s*(?:sessions?|times?)\s*(?:per|a|each)\s*week\b|\b(\d{1,2})\s*(?:sessions?\s*)?(?:\/|per\s*)week\b|\b(\d{1,2})\s*x\s*\/\s*week\b/i);
  const sessionCount = sessions && (sessions[1] || sessions[2] || sessions[3]); if (sessionCount && Number(sessionCount) <= 14) $('planSessions').value = sessionCount;
  const setRep = cleaned.match(/\b(\d{1,2})\s*sets?\s*(?:of|x|×)?\s*(\d{1,3})\s*reps?\b/i);
  const repMatch = setRep ? Number(setRep[1]) * Number(setRep[2]) : cleaned.match(/\b(\d{1,3})\s*reps?\b/i)?.[1];
  if (repMatch && Number(repMatch) <= 200) $('planReps').value = String(repMatch);
  $('scanStatus').textContent = 'Text extracted. Check the suggested fields, then save your plan.';
  $('planSummary').textContent = 'Scanned suggestions are not saved until you choose Save plan.';
  $('scanReview').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
$('applyScan').onclick = () => applyExtractedText($('scanText').value);
let tesseractPromise;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractPromise) tesseractPromise = new Promise((resolve, reject) => { const script=document.createElement('script'); script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; script.onload=()=>resolve(window.Tesseract); script.onerror=()=>reject(new Error('OCR library could not load')); document.head.append(script); });
  return tesseractPromise;
}
async function recognizePaper(file) {
  $('scanReview').hidden = true; $('scanStatus').textContent = 'Loading on-device text scanner…';
  let worker = null;
  const getWorker = async () => { if (!worker) { const Tesseract=await loadTesseract(); worker=await Tesseract.createWorker('eng', 1, { logger: (message) => { if (message.status === 'recognizing text') $('scanStatus').textContent = `Reading paper… ${Math.round((message.progress || 0) * 100)}%`; } }); } return worker; };
  try {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      $('scanStatus').textContent = 'Reading PDF…';
      const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.mjs';
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pageTexts = [];
      for (let pageNum=1; pageNum<=Math.min(pdf.numPages, 10); pageNum++) {
        const page=await pdf.getPage(pageNum); const content=await page.getTextContent();
        let text=''; let lastY=null;
        for (const item of content.items) { if (!item.str?.trim()) continue; const y=item.transform?.[5] ?? lastY; text += `${text && lastY !== null && y !== null && Math.abs(y-lastY)>2 ? '\n' : text ? ' ' : ''}${item.str.trim()}`; lastY=y; }
        text=text.trim();
        if (text.length < 30) { const viewport=page.getViewport({scale:1.8}); const canvas=document.createElement('canvas'); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height); await page.render({canvas,viewport}).promise; text=(await (await getWorker()).recognize(canvas)).data.text; }
        pageTexts.push(`Page ${pageNum}\n${text}`);
      }
      if (pdf.numPages > 10) pageTexts.push(`Only the first 10 of ${pdf.numPages} pages were scanned.`);
      return pageTexts.join('\n\n');
    }
    return (await (await getWorker()).recognize(file)).data.text;
  } finally { if (worker) await worker.terminate(); }
}
$('diagnosisFile').onchange = async (event) => {
  const file=event.target.files?.[0]; if (!file) return;
  if (file.size > 20 * 1024 * 1024) { toast('Choose a file smaller than 20 MB.'); event.target.value=''; return; }
  if (!file.type.startsWith('image/') && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { toast('Choose a PDF or image.'); event.target.value=''; return; }
  $('scanStatus').textContent='Starting scan…';
  try {
    const extractedText=await recognizePaper(file);
    await mediaPut('documents', { id: crypto.randomUUID?.() || String(Date.now()), name: file.name, type: file.type, blob: file, date: new Date().toISOString(), extractedText });
    await renderMedia(); applyExtractedText(extractedText); toast('Paper scanned. Review the fields before saving.');
  } catch (error) { console.warn('Document scan failed', error); $('scanStatus').textContent='Scan failed. Check your connection and try a clearer image or text PDF.'; toast('Could not scan that paper.'); }
  event.target.value='';
};
$('capturePhoto').onclick = async () => {
  const video = $('video'); if (!app.running || app.manual || video.readyState < 2 || !app.activeSessionId) { toast('Start a camera session before taking a photo.'); return; }
  const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .86)); if (!blob) { toast('Could not capture this frame.'); return; }
  try { await mediaPut('photos', { id: crypto.randomUUID?.() || String(Date.now()), sessionId: app.activeSessionId, exercise: activeMovement().title, date: new Date().toISOString(), blob }); await renderMedia(); toast('Session photo saved on this device.'); } catch { toast('Could not save the photo on this device.'); }
};
renderPlan(); renderMedia();
window.addEventListener('beforeunload', clearMediaUrls);

function openReport() {
  const data = reportData();
  const angleLine = data.latest ? `${data.latest.metric}: ${data.latest.angle}° latest · ${data.avg}° average${data.cal?.targetAngle !== null && data.cal?.targetAngle !== undefined ? ` · goal ${data.cal.targetAngle}°` : ''}` : 'No angle sessions yet.';
  const checkLine = data.latestCheckin ? `Confidence ${data.latestCheckin.confidence ?? '—'}/5 · pain ${data.latestCheckin.pain ?? '—'}/10` : 'No check-in yet.';
  $('reportBody').innerHTML = `<p>${new Date().toLocaleDateString()} · ${escapeHtml(authUser?.name || 'Jamie Parker')}</p><h3>Movement</h3><p>${escapeHtml(angleLine)}</p><p>${data.scoped.length} sessions · ${escapeHtml($('bodySide').value)} side · ${escapeHtml(activeMovement().view)}</p><h3>Recent practice</h3><ul>${data.practice.length ? data.practice.slice(-3).map((row) => `<li>${escapeHtml(new Date(row.date).toLocaleDateString())} · ${escapeHtml(row.exercise)} · ${row.reps ?? 0} reps${row.angle !== null ? ` · ~${row.angle}°` : ''}${pushupFormText(row)}</li>`).join('') : '<li>No sessions yet.</li>'}</ul><h3>Check-in</h3><p>${escapeHtml(checkLine)}</p><h3>Notes</h3><ul>${data.notes.length ? data.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('') : '<li>None yet.</li>'}</ul><h3>Ask your physio</h3><ul><li>Is my camera setup useful?</li><li>Is my goal still right for me?</li></ul><p class="report-foot">Angles are estimates. Review before sharing.</p>`;
  $('reportDialog').showModal();
}

$('previewReport').onclick=openReport; $('closeReport').onclick=()=>$('reportDialog').close();
$('downloadReport').onclick=()=>{const data=reportData();const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([data.text],{type:'text/plain;charset=utf-8'}));link.download='formnote-physio-visit-note.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast('Note downloaded.');};
$('copyReport').onclick=async()=>{try{await navigator.clipboard.writeText(reportData().text);toast('Note copied.');}catch{toast('Clipboard unavailable.');}};
$('printReport').onclick=()=>window.print();
$('privacyOpen').onclick=()=>$('helpDialog').showModal(); $('closeHelp').onclick=()=>$('helpDialog').close();
$('clearHistory').onclick=async()=>{if(!readSessions().length){toast('There is no saved history to clear.');return;}if(confirm('Clear saved sessions, check-ins, and AI drafts in this profile? Photos and uploaded documents are kept. This cannot be undone.')){try{await companion?.clearHistory();}catch(error){toast(error.message);return;}saveSessions([]);carePages?.reset();$('metricReps').textContent='—';$('metricRange').textContent='—';$('repFoot').textContent='repetitions';$('rangeFoot').textContent='calibrate to compare';$('checkinFeedback').textContent='';render();toast('Local session history cleared.');}};

window.addEventListener('resize',()=>{if(app.lastLandmarks)drawPose(app.lastLandmarks);});
window.addEventListener('beforeunload',()=>app.stream?.getTracks().forEach((track)=>track.stop()));
updateMovementUI();

function applyAuthProfile(user) {
  const name = user?.name || user?.email || 'Your account';
  const initial = (name.trim()[0] || 'U').toUpperCase();
  document.querySelectorAll('.user-name').forEach((node) => { node.textContent = name; });
  document.querySelectorAll('.avatar').forEach((node) => { node.textContent = initial; node.setAttribute('aria-label', name); });
  const heading = document.querySelector('.welcome h1');
  if (heading) heading.textContent = `Good to see you, ${name.split(/\s+/)[0]}.`;
}

const AUTH_STATUS_DEFAULT = 'Sign-in is handled securely by Auth0. Formnote never sees your password.';
const AUTH_BUTTON_IDS = ['authGateGoogle', 'authGateLogin', 'authGateSignup'];

function setAuthGateStatus(message, isError = false) {
  const box = $('authGateStatus');
  box.textContent = message || AUTH_STATUS_DEFAULT;
  box.classList.toggle('error', Boolean(message) && isError);
}

function setAuthGateBusy(busy) {
  AUTH_BUTTON_IDS.forEach((id) => { $(id).disabled = busy; });
}

let authSession = null, authStarting = null;
function lockAuthGate(locked) {
  document.documentElement.classList.toggle('auth-enabled',locked);
  $('authGate').hidden=!locked;
  document.querySelector('.app').inert=locked;
  document.querySelector('.mobile-nav').inert=locked;
}
async function startAuth0() {
  if(authStarting)return authStarting;
  lockAuthGate(true);setAuthGateBusy(true);$('authRetry').hidden=true;
  authStarting=(async()=>{
    try {
      const sdk=await loadAuthSdk(document,window);
      authSession=new AuthSession({config:window.FORMNOTE_AUTH0_CONFIG,origin:location.origin,sdk});
      authClient=authSession.client;
      const result=await authSession.initialize(location.href);
      history.replaceState({},document.title,result.returnTo);
      if(result.error)setAuthGateStatus(result.error,true);else setAuthGateStatus('');
      authUser=result.user;
      if(!authUser){$('authAction').hidden=true;return;}
      activeDataScope=`user-${encodeURIComponent(authUser.sub)}`;
      clearCheckinAnswers();companion?.reloadHistory();carePages?.reload();
      applyAuthProfile(authUser);$('authAction').textContent='Sign out';$('authAction').hidden=false;
      render();renderPlan();await renderMedia();
      appNavigation.switchTo(location.hash.slice(1)||'home');lockAuthGate(false);
    } catch(error) {
      authSession=null;authClient=null;
      setAuthGateStatus(error.message||'Sign-in could not load. Please try again.',true);
      $('authRetry').hidden=false;
    } finally {setAuthGateBusy(false);authStarting=null;}
  })();
  return authStarting;
}
async function signInWithAuth0(method='email') {
  if(!authSession){await startAuth0();if(!authSession)return;}
  setAuthGateBusy(true);setAuthGateStatus('Opening secure sign-in…');
  try {await authSession.login(method,location.href);}
  catch {setAuthGateStatus('Could not open sign-in. Check your connection and try again.',true);}
  finally {setAuthGateBusy(false);}
}
$('authRetry').onclick=startAuth0;
$('authGateGoogle').onclick=()=>signInWithAuth0('google');
$('authGateLogin').onclick=()=>signInWithAuth0('email');
$('authGateSignup').onclick=()=>signInWithAuth0('signup');
$('authAction').onclick=async()=>{
  if(!authSession)return startAuth0();
  if(app.running||app.countdownActive||app.autoCalibration.active){toast('Finish the session or calibration before signing out.');return;}
  $('authAction').disabled=true;
  try {
    app.stream?.getTracks().forEach(track=>track.stop());
    authUser=null;activeDataScope='guest';lockAuthGate(true);$('authAction').hidden=true;
    await authSession.logout();
    authUser=null;activeDataScope='guest';lockAuthGate(true);setAuthGateStatus('');
    $('authAction').hidden=true;
  } catch {setAuthGateStatus('The sign-out redirect failed. You can sign in again or retry after checking your connection.',true);}
  finally {$('authAction').disabled=false;}
};
companion = createCompanion({
  getScope: () => activeDataScope,
  onSaved: () => carePages?.reload(),
  openVisit: id => carePages?.openVisit(id),
  getRows: readSessions,
  setRows: saveSessions,
  render,
  getPhase: () => app.phase,
  getMovement: () => $('exerciseSelect').value,
  onRep: ({ reps, targetReps, goalReached }) => {
    $('repReward').textContent = goalReached ? 'Goal complete ✨' : '+1 · Nice rep!';
    $('repReward').classList.remove('celebrate');
    void $('repReward').offsetWidth;
    $('repReward').classList.add('celebrate');
    $('repBadge').animate?.([{ transform:'scale(1)' }, { transform:'scale(1.12)', offset:.25 }, { transform:'scale(1)' }], { duration:380 });
    $('repGoal').textContent = targetReps ? Math.min(reps, targetReps) + ' / ' + targetReps + ' session goal' : reps + (reps === 1 ? ' rep completed' : ' reps completed');
  },
  resetIncompleteCycle: () => { app.phase = 'ready'; app.sessionStartAngle = null; }
});
carePages = createCarePages({ getScope:()=>activeDataScope, getRows:readSessions, setRows:saveSessions,
  getPlan:readPlan, getName:()=>authUser?.name || '', navigate:key=>appNavigation.switchTo(key), chooseMovement:movement=>{if(app.running||app.autoCalibration.active){toast('Finish the current session or calibration first.');return;}$('exerciseSelect').value=movement;$('exerciseSelect').dispatchEvent(new Event('change'));appNavigation.switchTo('move');}, clearCheckin:clearCheckinAnswers });
// Pressing Back from the Auth0 page restores this page from memory with the buttons still disabled.
window.addEventListener('pageshow', (event) => { if (event.persisted && authClient && !authUser) setAuthGateBusy(false); });
startAuth0();
