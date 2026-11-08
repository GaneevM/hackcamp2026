// Screen mapping and gesture gates for the local-only camera air pointer.
function solve3(matrix, values) {
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-9) throw new Error('Calibration points are too close together.');
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let j = column; j < 4; j++) rows[column][j] /= divisor;
    for (let row = 0; row < 3; row++) if (row !== column) {
      const factor = rows[row][column];
      for (let j = column; j < 4; j++) rows[row][j] -= factor * rows[column][j];
    }
  }
  return rows.map((row) => row[3]);
}

export function fitPointerMap(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 4) throw new Error('Use at least four calibration points.');
  const matrix = [[0,0,0],[0,0,0],[0,0,0]], rhsX = [0,0,0], rhsY = [0,0,0];
  for (const pair of pairs) {
    const row = [pair.camera.x, pair.camera.y, 1];
    for (let i=0;i<3;i++) {
      for (let j=0;j<3;j++) matrix[i][j] += row[i]*row[j];
      rhsX[i] += row[i]*pair.screen.x; rhsY[i] += row[i]*pair.screen.y;
    }
  }
  return { x: solve3(matrix,rhsX), y: solve3(matrix,rhsY) };
}

function median(values) {
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

export function summarizePointerSamples(samples) {
  const points=samples.filter(point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y));
  if(points.length<6)return null;
  const center={x:median(points.map(point=>point.x)),y:median(points.map(point=>point.y))};
  const radii=points.map(point=>Math.hypot(point.x-center.x,point.y-center.y));
  const radialMedian=median(radii),radialMad=median(radii.map(radius=>Math.abs(radius-radialMedian)));
  const limit=Math.max(.018,radialMedian+3.5*radialMad);
  const inliers=points.filter(point=>Math.hypot(point.x-center.x,point.y-center.y)<=limit);
  if(inliers.length<6||inliers.length<Math.ceil(points.length*.6))return null;
  const xs=inliers.map(point=>point.x),ys=inliers.map(point=>point.y);
  const percentile=(values,fraction)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.round((sorted.length-1)*fraction)];};
  return {point:{x:median(xs),y:median(ys)},count:inliers.length,
    jitter:Math.max(percentile(xs,.9)-percentile(xs,.1),percentile(ys,.9)-percentile(ys,.1))};
}

export function fitPointerMapReliable(pairs) {
  if(!Array.isArray(pairs)||pairs.length<4)throw new Error('Use at least four calibration points.');
  const xs=pairs.map(pair=>pair.camera.x),ys=pairs.map(pair=>pair.camera.y);
  if(Math.max(...xs)-Math.min(...xs)<.025||Math.max(...ys)-Math.min(...ys)<.025)throw new Error('Move your hand to each new dot before holding.');
  const candidates=[pairs];
  if(pairs.length>4)for(let omitted=0;omitted<pairs.length;omitted++)candidates.push(pairs.filter((_,index)=>index!==omitted));
  let best=null;
  for(const candidate of candidates){
    try{
      const map=fitPointerMap(candidate);
      const errors=pairs.map(pair=>{const mapped=mapFingerToScreen(map,pair.camera,false);return Math.hypot(mapped.x-pair.screen.x,mapped.y-pair.screen.y);});
      const inliers=errors.filter(error=>error<=.12).length,meanError=errors.reduce((sum,error)=>sum+error,0)/errors.length;
      if(!best||inliers>best.inliers||(inliers===best.inliers&&meanError<best.meanError))best={map,inliers,meanError};
    }catch{}
  }
  if(!best||best.inliers<4||best.meanError>.2)throw new Error('The tracked points were too inconsistent. Try again with your hand clearly visible.');
  return best;
}

export function mapFingerToScreen(map, point, clamp=true) {
  if (!map || !point) return null;
  const [a,b,c] = map.x, [d,e,f] = map.y;
  const x = a*point.x + b*point.y + c, y = d*point.x + e*point.y + f;
  return Number.isFinite(x) && Number.isFinite(y) ? { x: clamp?Math.max(0,Math.min(1,x)):x, y: clamp?Math.max(0,Math.min(1,y)):y } : null;
}

// Shoulder-relative coordinates preserve the mapping as the person moves farther
// away or sideways. Camera coordinates remain available when shoulders are hidden.
export function pointerBodyReference(pose,aspect=1) {
  const a=pose?.[11],b=pose?.[12];
  if(![a,b].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>.55))return null;
  const scale=Math.hypot((a.x-b.x)*aspect,a.y-b.y);
  return scale>.06?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,scale,aspect}:null;
}
export function pointerCoordinates(point,reference) {
  if(!point||![point.x,point.y].every(Number.isFinite))return null;
  return reference?{x:(point.x-reference.x)*reference.aspect/reference.scale,y:(point.y-reference.y)/reference.scale}:{x:point.x,y:point.y};
}
export function pointerHandCrop(pose,width,height,side=0) {
  const wrist=pose?.[15+side],index=pose?.[19+side],elbow=pose?.[13+side];
  if(!wrist||(wrist.visibility??0)<.45||![wrist.x,wrist.y].every(Number.isFinite))return null;
  const reference=pointerBodyReference(pose,width/height);
  const forearm=elbow?Math.hypot((wrist.x-elbow.x)*width,(wrist.y-elbow.y)*height):0;
  const size=Math.min(width,height,Math.max(100,(reference?.scale||0)*height*1.1,forearm*1.6,width*.16));
  const center=index&&(index.visibility??0)>.45?{x:(wrist.x+index.x)/2,y:(wrist.y+index.y)/2}:wrist;
  return {x:Math.max(0,Math.min(width-size,center.x*width-size/2)),y:Math.max(0,Math.min(height-size,center.y*height-size/2)),size};
}
export function restoreCroppedHand(hand,crop,width,height) {
  return hand.map(p=>({...p,x:(crop.x+p.x*crop.size)/width,y:(crop.y+p.y*crop.size)/height,z:(p.z||0)*crop.size/width}));
}
export function trackedHandCrop(hand,width,height) {
  if(!Array.isArray(hand)||hand.length<21)return null;
  const xs=hand.map(p=>p.x*width),ys=hand.map(p=>p.y*height);
  if(![...xs,...ys].every(Number.isFinite))return null;
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const size=Math.min(width,height,Math.max(100,(right-left)*2.7,(bottom-top)*2.7));
  return {x:Math.max(0,Math.min(width-size,(left+right-size)/2)),y:Math.max(0,Math.min(height-size,(top+bottom-size)/2)),size};
}
export function selectPointerHand(hands,labels=[],preferredLabel=null,preferPointing=false) {
  if(!hands?.length)return -1;
  if(preferredLabel){const match=labels.indexOf(preferredLabel);if(match>=0)return match;}
  if(preferPointing){const match=hands.findIndex(hand=>!isOpenPalm(hand)&&!isFist(hand)&&learnPointingProfile([pointerFingerRatios(hand)]));if(match>=0)return match;}
  return 0;
}

export class PointerFilter {
  constructor(){this.reset();}
  reset(){this.samples=[];this.point=null;this.intent=null;this.at=null;this.velocity={x:0,y:0};}
  update(point,now,{width=1000,height=1000,precision=false}={}) {
    if(!point||![point.x,point.y,now].every(Number.isFinite))return null;
    if(this.at===null||now-this.at>350)this.reset();
    this.samples.push(point);if(this.samples.length>3)this.samples.shift();
    const target={x:median(this.samples.map(p=>p.x)),y:median(this.samples.map(p=>p.y))};
    if(!this.point)this.point={...target};
    else {
      const dt=Math.max(.001,Math.min(.12,(now-this.at)/1000));
      const derivativeAlpha=1-Math.exp(-dt*6);
      this.velocity.x+=(((target.x-(this.intent?.x??target.x))*width/dt)-this.velocity.x)*derivativeAlpha;
      this.velocity.y+=(((target.y-(this.intent?.y??target.y))*height/dt)-this.velocity.y)*derivativeAlpha;
      const distance=Math.hypot((target.x-this.point.x)*width,(target.y-this.point.y)*height),deadband=precision?7:3.5;
      const cutoff=(precision?.65:1.1)+Math.min(9,Math.hypot(this.velocity.x,this.velocity.y)*.0035);
      const alpha=(1-Math.exp(-dt*2*Math.PI*cutoff))*Math.max(0,1-deadband/Math.max(.001,distance));
      this.point={x:this.point.x+(target.x-this.point.x)*alpha,y:this.point.y+(target.y-this.point.y)*alpha};
    }
    this.intent=target;this.at=now;return {...this.point};
  }
}

// The pointer stays attached to its acquired control through tremor and isolated
// samples. A sustained move out of the control, or a large move, releases it.
export class PointerButtonLatch {
  reset(){this.origin=null;this.exitAt=null;}
  constructor(){this.reset();}
  acquire(point){this.origin={...point};this.exitAt=null;}
  update(point,rect,now) {
    if(!this.origin||!point)return false;
    const moved=Math.hypot(point.x-this.origin.x,point.y-this.origin.y);
    const outside=point.x<rect.left-14||point.x>rect.right+14||point.y<rect.top-14||point.y>rect.bottom+14;
    if(!outside||moved<34){this.exitAt=null;return true;}
    if(moved>90){this.reset();return false;}
    if(this.exitAt===null)this.exitAt=now;
    if(now-this.exitAt>=140){this.reset();return false;}
    return true;
  }
}

// Deflect an open palm from a stable neutral position to control scroll speed.
// stop() is synchronous: a fist, missing frame, or mode change has no inertia.
export class PalmScrollController {
  constructor(ranges={up:.25,down:.25}){this.ranges=ranges;this.stop();}
  stop(){this.anchor=null;this.history=[];this.samples=[];this.lastAt=null;this.tickAt=null;this.targetVelocity=0;this.velocity=0;this.armed=false;}
  observe(point,now,maxSpeed=1400) {
    if(!point||![point.x,point.y,now].every(Number.isFinite)){this.stop();return;}
    if(this.lastAt!==null&&now-this.lastAt>200)this.stop();
    this.lastAt=now;
    this.samples.push(point);if(this.samples.length>3)this.samples.shift();
    const current={x:median(this.samples.map(p=>p.x)),y:median(this.samples.map(p=>p.y))};
    if(!this.anchor){
      this.history.push({...current,at:now});this.history=this.history.filter(p=>now-p.at<=300);
      const tolerance=Math.min(this.ranges.up,this.ranges.down)*.13;
      if(now-this.history[0].at>=200&&this.history.every(p=>Math.hypot(p.x-current.x,p.y-current.y)<tolerance)){
        this.anchor={...current};this.armed=true;this.tickAt=now;
      }
      return;
    }
    const dy=current.y-this.anchor.y,range=Math.max(.015,dy<0?this.ranges.up:this.ranges.down);
    const deflection=Math.min(1,Math.max(0,(Math.abs(dy)/range-.16)/.84));
    this.targetVelocity=Math.abs(current.x-this.anchor.x)>range*1.4?0:Math.sign(dy)*maxSpeed*Math.pow(deflection,1.35);
    if(!this.targetVelocity)this.velocity=0;
  }
  tick(now) {
    if(this.lastAt===null||now-this.lastAt>180){this.stop();return 0;}
    const dt=this.tickAt===null?0:Math.max(0,Math.min(.04,(now-this.tickAt)/1000));this.tickAt=now;
    if(!this.armed||!this.targetVelocity){this.velocity=0;return 0;}
    this.velocity+=(this.targetVelocity-this.velocity)*(1-Math.exp(-dt/0.075));
    return this.velocity*dt;
  }
}

// A stroke starts after a short still hold and ends after another still hold.
// A single swipe therefore cannot emit a stream of repeated scroll events.
export class PointerSwipeTracker {
  constructor(thresholds={up:.06,down:.06}){this.thresholds=thresholds;this.reset();}
  reset(cooldownUntil=0){this.history=[];this.anchor=null;this.movingAt=null;this.lastAt=null;this.cooldownUntil=cooldownUntil;}
  update(point,now) {
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)){
      if(this.lastAt!==null&&now-this.lastAt>250)this.reset(this.cooldownUntil);
      return null;
    }
    if(this.lastAt!==null&&now-this.lastAt>250)this.reset(this.cooldownUntil);
    this.lastAt=now;
    if(now<this.cooldownUntil)return null;
    this.history.push({...point,at:now});this.history=this.history.filter(p=>now-p.at<=280);
    const threshold=Math.min(this.thresholds.up,this.thresholds.down),first=this.history[0];
    const stable=now-first.at>=180&&this.history.every(p=>Math.hypot(p.x-point.x,p.y-point.y)<threshold*.22);
    if(!this.anchor){if(stable)this.anchor={...point};return null;}
    const dx=point.x-this.anchor.x,dy=point.y-this.anchor.y;
    if(Math.abs(dy)>threshold*.25&&this.movingAt===null)this.movingAt=now;
    if(this.movingAt===null)return null;
    const direction=dy<0?'up':'down',distance=Math.abs(dy);
    if(now-this.movingAt>2000){this.reset();return null;}
    if(stable&&distance>=this.thresholds[direction]&&Math.abs(dx)<distance*.7&&now-this.movingAt>=180){
      this.reset(now+700);return {direction,distance};
    }
    return null;
  }
}

function distance3(a,b) {
  if (!a || !b || ![a.x,a.y,a.z,b.x,b.y,b.z].every(Number.isFinite)) return 0;
  return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
}

export function isIndexPointing(hand,profile=null) {
  if (!Array.isArray(hand) || hand.length < 21) return false;
  if(profile?.ratios?.length===4){
    const ratios=pointerFingerRatios(hand);
    return !!ratios&&!isFist(hand)&&!isOpenPalm(hand)&&ratios[0]>1.035&&ratios[0]>median(ratios.slice(1))+.02&&ratios.every((value,index)=>Math.abs(value-profile.ratios[index])<profile.tolerance[index]);
  }
  const wrist=hand[0];
  const ratio=(pip,tip)=>distance3(wrist,hand[tip])/Math.max(.0001,distance3(wrist,hand[pip]));
  const index=ratio(6,8),others=[ratio(10,12),ratio(14,16),ratio(18,20)];
  return index>1.08 && index>Math.max(...others)+.025 && others.every(value=>value<1.38);
}

export function pointerFingerRatios(hand) {
  if(!Array.isArray(hand)||hand.length<21||!hand.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite)))return null;
  return [[6,8],[10,12],[14,16],[18,20]].map(([pip,tip])=>distance3(hand[0],hand[tip])/Math.max(.0001,distance3(hand[0],hand[pip])));
}
export function learnPointingProfile(samples) {
  const valid=samples.filter(sample=>Array.isArray(sample)&&sample.length===4&&sample.every(Number.isFinite));
  if(!valid.length)return null;
  const ratios=[0,1,2,3].map(index=>median(valid.map(sample=>sample[index])));
  if(ratios[0]<=1.035||ratios[0]<=median(ratios.slice(1))+.02)return null;
  const tolerance=ratios.map((ratio,index)=>Math.max(.22,median(valid.map(sample=>Math.abs(sample[index]-ratio)))*5));
  return {ratios,tolerance};
}

export function isOpenPalm(hand) {
  if(!Array.isArray(hand)||hand.length<21)return false;
  const wrist=hand[0];
  return [[6,8],[10,12],[14,16],[18,20]].filter(([pip,tip])=>distance3(wrist,hand[tip])>distance3(wrist,hand[pip])*1.12).length>=3;
}

export function isFist(hand) {
  if(!Array.isArray(hand)||hand.length<21)return false;
  const ratio=(pip,tip)=>distance3(hand[0],hand[tip])/Math.max(.0001,distance3(hand[0],hand[pip]));
  return ratio(6,8)<1.04&&[[10,12],[14,16],[18,20]].every(([pip,tip])=>ratio(pip,tip)<1.08);
}
