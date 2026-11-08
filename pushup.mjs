// Camera coaching heuristics, not clinical cutoffs. Coordinates come from MediaPipe.
const ids = {left:[11,13,15,23,25,27],right:[12,14,16,24,26,28]};
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function jointAngle(a,b,c) {
  if (![a,b,c].every(p=>p && [p.x,p.y,p.z].every(Number.isFinite))) return null;
  const u=[a.x-b.x,a.y-b.y,a.z-b.z],v=[c.x-b.x,c.y-b.y,c.z-b.z];
  const length=Math.hypot(...u)*Math.hypot(...v);
  return length<1e-8 ? null : Math.acos(clamp(u.reduce((n,x,i)=>n+x*v[i],0)/length,-1,1))*180/Math.PI;
}
export function assessPushup({landmarks,world,side='left',variant='floor',aspect=16/9}) {
  const indices=ids[side]; const needed=variant==='knees'?indices.slice(0,5):indices;
  const seen=i=>landmarks?.[i] && (landmarks[i].visibility??0)>=.65 && (landmarks[i].presence??1)>=.65 && landmarks[i].x>.02 && landmarks[i].x<.98 && landmarks[i].y>.02 && landmarks[i].y<.98;
  const count=needed.filter(seen).length;
  const invalid=cue=>({valid:false,score:null,cue,count,total:needed.length});
  if(count<needed.length) return invalid(`Show your ${side} shoulder, elbow, wrist, hip and ${variant==='knees'?'knee':'knee and ankle'}.`);
  const [s,e,w,h,k,a]=indices.map(i=>world?.[i]);
  const bend=jointAngle(s,e,w),body=jointAngle(s,h,variant==='knees'?k:a),leg=jointAngle(h,k,a);
  if(bend===null || body===null || (variant!=='knees' && leg===null)) return invalid('Waiting for a stable 3D pose.');
  const [si,,,hi]=indices.map(i=>landmarks[i]);
  const dx=(hi.x-si.x)*aspect,dy=hi.y-si.y,torso=Math.hypot(dx,dy);
  if(torso<.08) return invalid('Move closer while keeping your whole body in frame.');
  const other=landmarks[side==='left'?12:11];
  if(other && (other.visibility??0)>.65 && Math.abs(other.x-si.x)*aspect/torso>.55) return invalid('Turn side-on to the camera; choose the side nearest the lens.');
  if(variant==='wall' ? Math.abs(dy)<Math.abs(dx)*1.2 : Math.abs(dy)>Math.abs(dx)*1.2) return invalid(variant==='wall'?'Stand side-on, facing the wall.':'Get into your push-up position, side-on to the camera.');
  const wrist=landmarks[indices[2]];
  if(variant!=='wall' && (wrist.y<si.y+.025 || Math.abs(wrist.x-si.x)*aspect>torso*.85)) return invalid('Place your hands below your upper body, with the camera level and side-on.');
  const deviation=180-body,legDeviation=leg===null?0:180-leg;
  // 10° dead band and gradual penalty reduce false precision from monocular estimates.
  const bodyScore=clamp(100-Math.max(0,deviation-10)*3,0,100);
  const legScore=variant==='knees'?100:clamp(100-Math.max(0,legDeviation-12)*3,0,100);
  const score=Math.round(variant==='knees'?bodyScore:bodyScore*.75+legScore*.25);
  let cue='Keep your trunk steady as your elbows bend.';
  if(deviation>22) cue='Bring shoulders, hips and '+(variant==='knees'?'knees':'ankles')+' into one line.';
  else if(variant!=='knees' && legDeviation>25) cue='Keep your legs extended, without forcing your knees.';
  return {valid:true,score,cue,count,total:needed.length,flexion:180-bend,bodyAngle:body,legAngle:leg,aligned:deviation<=22&&(variant==='knees'||legDeviation<=25)};
}

export class PushupCounter {
  constructor(){this.reset();}
  reset(){this.phase='find-top';this.holdAt=null;this.startedAt=null;this.lastAt=null;this.scores=[];this.peak=0;this.reps=[];}
  pause(){this.phase='find-top';this.holdAt=null;this.startedAt=null;this.scores=[];this.peak=0;this.lastAt=null;}
  update(pose,now,{top=25,bottom=65}={}) {
    if(!pose.valid){this.pause();return null;}
    if(this.lastAt!==null && now-this.lastAt>500) this.pause();
    this.lastAt=now;
    if(this.phase==='find-top') {
      if(pose.flexion<=top && pose.aligned){if(this.holdAt===null)this.holdAt=now;if(now-this.holdAt>=350){this.phase='lower';this.holdAt=null;this.startedAt=now;}}
      else this.holdAt=null;
      return null;
    }
    if(now-this.startedAt>30000){this.pause();return null;}
    this.scores.push(pose.score);this.peak=Math.max(this.peak,pose.flexion);
    if(this.phase==='lower' && pose.flexion>=bottom){
      if(this.holdAt===null)this.holdAt=now;
      if(now-this.holdAt>=150){this.phase='press';this.holdAt=null;}
    } else if(this.phase==='press' && pose.flexion<=top) {
      if(this.holdAt===null)this.holdAt=now;
      if(now-this.holdAt>=250 && now-this.startedAt>=1000){
        const rep={score:Math.round(this.scores.reduce((a,b)=>a+b,0)/this.scores.length),peak:Math.round(this.peak),seconds:Math.round((now-this.startedAt)/100)/10};
        this.reps.push(rep);this.phase='lower';this.startedAt=now;this.scores=[];this.peak=0;this.holdAt=null;return rep;
      }
    } else this.holdAt=null;
    return null;
  }
}
