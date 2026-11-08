function median(values){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];}
export function bodyReference(pose,aspect=1) {
  const a=pose?.[11],b=pose?.[12];
  if(![a,b].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>.55))return null;
  const scale=Math.hypot((a.x-b.x)*aspect,a.y-b.y);
  return scale>.06?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,scale,aspect}:null;
}
export function poseHandCrop(pose,width,height,side=0) {
  const wrist=pose?.[15+side],index=pose?.[19+side],elbow=pose?.[13+side];
  if(!wrist||(wrist.visibility??0)<.45||![wrist.x,wrist.y].every(Number.isFinite))return null;
  const reference=bodyReference(pose,width/height);
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


function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));}
export function fingerExtensions(hand){
  if(!Array.isArray(hand)||hand.length<21||!hand.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite)))return null;
  return [[5,6,8],[9,10,12],[13,14,16],[17,18,20]].map(([mcp,pip,tip])=>{
    const ratio=distance(hand[0],hand[tip])/Math.max(.0001,distance(hand[0],hand[pip]));
    const a=hand[mcp],b=hand[pip],c=hand[tip],u=[a.x-b.x,a.y-b.y,a.z-b.z],v=[c.x-b.x,c.y-b.y,c.z-b.z];
    const length=Math.hypot(...u)*Math.hypot(...v),cosine=length?u.reduce((sum,n,i)=>sum+n*v[i],0)/length:1;
    return ratio>1.16||(ratio>1.06&&cosine<-.65);
  });
}
export function classifyHandGesture(hand){
  const extended=fingerExtensions(hand);if(!extended)return 'none';
  const [index,middle,ring,little]=extended,count=extended.filter(Boolean).length;
  if(index&&!middle&&!ring&&!little)return 'one';
  if(index&&middle&&!ring&&!little)return 'two';
  if(count>=3)return 'palm';
  if(count===0)return 'fist';
  return 'other';
}
export function palmReading(hand,aspect=1){
  const center=[0,5,9,13,17].reduce((sum,index)=>({x:sum.x+hand[index].x*aspect/5,y:sum.y+hand[index].y/5}),{x:0,y:0});
  const span=Math.max(Math.hypot((hand[5].x-hand[17].x)*aspect,hand[5].y-hand[17].y),Math.hypot((hand[0].x-hand[9].x)*aspect,hand[0].y-hand[9].y));
  return {point:center,range:Math.max(.035,Math.min(.3,span*2))};
}
export class FingerCommandHold{
  constructor(){this.reset();}
  reset(){this.locked=false;this.neutralAt=null;this.lastAt=null;this.cancel();}
  cancel(){this.candidate=null;this.startedAt=null;this.samples=0;this.elapsed=0;this.progress=0;}
  update(gesture,now){
    if(this.lastAt!==null&&now-this.lastAt>250){this.cancel();this.neutralAt=null;}
    this.lastAt=now;
    if(!['one','two'].includes(gesture)){
      this.cancel();
      if(['palm','fist'].includes(gesture)){if(this.neutralAt===null)this.neutralAt=now;if(now-this.neutralAt>=300)this.locked=false;}
      else this.neutralAt=null;
      return null;
    }
    this.neutralAt=null;if(this.locked)return null;
    if(this.candidate!==gesture){this.cancel();this.candidate=gesture;this.startedAt=now;}
    this.samples++;this.elapsed=now-this.startedAt;this.progress=Math.min(100,this.elapsed/6.5);
    if(this.elapsed<650||this.samples<4)return null;
    this.locked=true;this.cancel();return gesture;
  }
}
