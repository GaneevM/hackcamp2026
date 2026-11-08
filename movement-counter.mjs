// Camera rep gates, not clinical target angles. Valid personal ranges take precedence.
const supported=new Set(['sit','reach','elbow','crossbody']);
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
export function seatedStart({shoulder,hip,knee,ankle,angle,aspect=1}){
 // Knee flexion is the most reliable seated cue across camera heights and
 // body proportions. Geometry remains a fallback for callers without an angle.
 if(Number.isFinite(angle))return angle>=45;
 if(![hip,knee].every(p=>finitePoint(p)&&(p.visibility??p.presence??1)>.55))return false;
 const thigh=Math.hypot((hip.x-knee.x)*aspect,hip.y-knee.y);
 if(thigh<=.025||Math.abs(hip.y-knee.y)>thigh*.55)return false;
 if(ankle)return finitePoint(ankle)&&(ankle.visibility??ankle.presence??1)>.55&&hip.y<ankle.y&&Math.hypot((knee.x-ankle.x)*aspect,knee.y-ankle.y)>.025;
 if(!finitePoint(shoulder))return false;
 const torso=Math.hypot((shoulder.x-hip.x)*aspect,shoulder.y-hip.y);
 return torso>.04&&shoulder.y<hip.y-Math.max(.02,torso*.45);
}
export class MovementCounter{
 constructor(){this.reset();}
 reset(){this.reps=0;this.holds=[];this.lastAt=null;this.missingAt=null;this.protocol=null;this.needsSettling=true;this.clearCycle();}
 clearCycle(){this.phase='find-start';this.startAt=this.startAngle=this.anchor=this.anchorScale=null;this.targetAt=this.returnAt=this.cycleAt=this.peak=null;this.targetMs=0;this.lastTargetSample=null;}
 interrupt(){this.clearCycle();this.lastAt=null;this.missingAt=null;this.needsSettling=true;}
 pause(now){
  if(!Number.isFinite(now)){this.interrupt();return;}
  if(this.missingAt===null)this.missingAt=now;
  this.targetAt=this.returnAt=this.lastTargetSample=null;
  if(this.phase==='find-start')this.startAt=this.startAngle=this.anchor=this.anchorScale=null;
  if(now-this.missingAt>250)this.interrupt();
 }
 update({movement,angle,now,position,calibration,context={}}){
  if(!supported.has(movement)||!Number.isFinite(angle)||angle<0||angle>180||!Number.isFinite(now)||!finitePoint(position)){this.interrupt();return null;}
  const validCal=[calibration?.startAngle,calibration?.endAngle].every(v=>Number.isFinite(v)&&v>=0&&v<=180)&&Math.abs(calibration.endAngle-calibration.startAngle)>=10;
  const low=validCal?Math.min(calibration.startAngle,calibration.endAngle):null,high=validCal?Math.max(calibration.startAngle,calibration.endAngle):null,range=validCal?high-low:null;
  const protocol=[movement,low,high].join(':');
  if(this.protocol!==protocol){this.interrupt();this.protocol=protocol;}
  if(this.missingAt!==null){
   if(now-this.missingAt>250)this.interrupt();
   else if(this.phase==='target'){this.phase='ready';this.targetMs=0;}
   this.missingAt=null;
  }
  if(this.lastAt!==null){if(now<=this.lastAt){this.interrupt();return null;}if(now-this.lastAt>400)this.interrupt();}this.lastAt=now;
  const sit=movement==='sit',elbow=movement==='elbow';
  // Proportional zones keep even a small personal range from overlapping itself.
  const nearStart=sit?(validCal?angle>=high-range*.22:angle>=55):(validCal?angle<=low+range*.22:angle<=35);
  const targetAngle=validCal?(sit?low+range*.22:low+range*.78):({sit:25,reach:100,elbow:65,crossbody:45})[movement];
  const target=sit?angle<=targetAngle:angle>=targetAngle,tolerance=validCal?Math.min(4,range*.06):4;
  const stayingTarget=sit?angle<=targetAngle+tolerance:angle>=targetAngle-tolerance;
  const backAtStart=sit?(validCal?angle>=high-range*.28:angle>=55):(validCal?angle<=low+range*.28:angle<=(elbow?35:movement==='reach'?30:25));
  const travelNeeded=validCal?Math.max(5,range*.5):movement==='reach'?60:30;
  const travel=this.startAngle===null?0:sit?this.startAngle-angle:angle-this.startAngle;
  const scale=Number.isFinite(context.bodyScale)&&context.bodyScale>0?context.bodyScale:null;
  if(this.phase==='find-start'){
   if(!nearStart||(sit&&!context.seated)){this.startAt=this.startAngle=this.anchor=this.anchorScale=null;return null;}
   const angleTolerance=validCal?Math.max(2,Math.min(12,range*.2)):(elbow?15:10);
   if(this.startAt===null||Math.abs(angle-this.startAngle)>angleTolerance||Math.hypot(position.x-this.anchor.x,position.y-this.anchor.y)>Math.max(.025,(scale||0)*.15)){
    this.startAt=now;this.startAngle=angle;this.anchor={...position};this.anchorScale=scale;
   }else if(now-this.startAt>=(this.needsSettling?(elbow?150:650):(elbow?120:200))){this.phase='ready';this.peak=angle;}
   return null;
  }
  const dx=Math.abs(position.x-this.anchor.x),dy=Math.abs(position.y-this.anchor.y);
  // Rising from a chair moves the torso upward. Upper-body reps should keep it steadier.
  const stable=sit?(context.anchor==='foot'?Math.hypot(dx,dy)<=.09:dx<=Math.max(.1,(this.anchorScale||0)*.7)&&dy<=Math.max(.22,(this.anchorScale||0)*1.8)):Math.hypot(dx,dy)<=Math.max(.1,(this.anchorScale||0)*.65);
  if(!stable||(scale&&this.anchorScale&&(scale/this.anchorScale<.6||scale/this.anchorScale>1.5))||(this.cycleAt!==null&&now-this.cycleAt>90000)){this.interrupt();return null;}
  this.peak=sit?Math.min(this.peak,angle):Math.max(this.peak,angle);
  if(this.phase==='ready'){
   // Time the movement itself, excluding however long the person waited at rest.
   if(this.cycleAt===null&&travel>=Math.min(8,travelNeeded*.25))this.cycleAt=now;
   if(target&&travel>=travelNeeded&&this.cycleAt!==null){this.phase='target';this.targetAt=now;this.lastTargetSample=now;this.targetMs=0;}
   else if(this.cycleAt!==null&&backAtStart&&now-this.cycleAt>700){this.clearCycle();this.needsSettling=false;}
   return null;
  }
  if(this.phase==='target'){
   // A little hysteresis tolerates camera noise around a reached endpoint.
   if(!stayingTarget){this.phase='ready';this.targetAt=this.lastTargetSample=null;this.targetMs=0;return null;}
   this.targetMs+=now-this.lastTargetSample;this.lastTargetSample=now;
   if(now-this.targetAt>=(elbow?60:movement==='crossbody'?300:150)){
    if(this.targetAt-this.cycleAt<(sit?200:100)){this.interrupt();return null;}
    if(sit)return this.complete(now);
    this.phase='return';this.returnAt=null;
   }
   return null;
  }
  if(this.phase==='return'){
   // Only accumulate endpoint time; lowering the arm is not a stretch hold.
   if(stayingTarget){if(this.lastTargetSample!==null)this.targetMs+=now-this.lastTargetSample;this.lastTargetSample=now;}else this.lastTargetSample=null;
   if(backAtStart){if(this.returnAt===null){this.returnAt=now;if(now-this.cycleAt<(elbow?500:700)){this.interrupt();return null;}}if(now-this.returnAt>=(elbow?100:150))return this.complete(now);}else this.returnAt=null;
  }
  return null;
 }
 complete(now){const rep={reps:++this.reps,seconds:Math.round((now-this.cycleAt)/100)/10,peak:Math.round(this.peak),holdSeconds:Math.round(this.targetMs/100)/10};this.holds.push(rep.holdSeconds);this.clearCycle();this.needsSettling=false;return rep;}
}
