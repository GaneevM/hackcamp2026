import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementCounter,seatedStart} from '../movement-counter.mjs';
import {WaveCounter} from '../session-metrics.js';
const cases=[['sit',90,10],['reach',10,150],['elbow',20,95],['crossbody',0,75]];
function harness(movement,start,end,calibration){
 const counter=new MovementCounter();let now=0,current=start,override={};
 const send=angle=>{current=angle;now+=40;const progress=(angle-start)/(end-start);return counter.update({movement,angle,now,calibration,position:{x:.5,y:.5-(movement==='sit'?progress*.16:0)},context:{bodyScale:.18,seated:movement==='sit'&&progress<.25},...override});};
 const hold=(angle,ms)=>{for(let i=0;i<Math.ceil(ms/40);i++)send(angle);};
 const ramp=(angle,ms)=>{const initial=current,n=Math.ceil(ms/40);for(let i=1;i<=n;i++)send(initial+(angle-initial)*i/n);};
 const cycle=()=>{hold(start,900);ramp(end,900);hold(end,600);ramp(start,900);hold(start,500);};
 return {counter,send,hold,ramp,cycle,gap:ms=>now+=ms,set:values=>override=values};
}
for(const [movement,start,end] of cases){
 test(`${movement}: eight deliberate cycles count exactly eight; endpoint holds do not duplicate`,()=>{const h=harness(movement,start,end);for(let i=0;i<8;i++)h.cycle();assert.equal(h.counter.reps,8);h.hold(start,5000);assert.equal(h.counter.reps,8);});
 test(`${movement}: jitter and partial movements give zero reps`,()=>{const h=harness(movement,start,end);for(let i=0;i<100;i++)h.send(start+(i%2?1:-1));for(let i=0;i<4;i++){h.ramp(start+(end-start)*.3,900);h.hold(start+(end-start)*.3,500);h.ramp(start,900);h.hold(start,900);}assert.equal(h.counter.reps,0);});
 test(`${movement}: camera gap discards a partial rep`,()=>{const h=harness(movement,start,end);h.hold(start,900);h.ramp((start+end)/2,900);h.gap(2000);h.ramp(end,900);h.hold(end,600);h.ramp(start,900);h.hold(start,900);assert.equal(h.counter.reps,0);h.cycle();assert.equal(h.counter.reps,1);});
 test(`${movement}: missing body anchor cannot finish an armed rep`,()=>{const h=harness(movement,start,end);h.hold(start,900);h.set({position:null});h.ramp(end,900);h.hold(end,600);h.ramp(start,900);h.hold(start,500);assert.equal(h.counter.reps,0);});
 test(`${movement}: a sudden angle jump after a long idle is not a rep`,()=>{const h=harness(movement,start,end);h.hold(start,10000);h.hold(end,600);h.hold(start,1500);assert.equal(h.counter.reps,0);});
 test(`${movement}: walking across the frame cannot complete a rep`,()=>{const h=harness(movement,start,end);h.hold(start,900);h.set({position:{x:.9,y:.3},context:{seated:false,bodyScale:.18}});h.ramp(end,900);h.hold(end,600);h.ramp(start,900);assert.equal(h.counter.reps,0);});
 for(const width of [10,20,60])test(`${movement}: personal ${width}-degree range has distinct start and target zones`,()=>{const low=20,high=low+width,s=movement==='sit'?high:low,e=movement==='sit'?low:high;const h=harness(movement,s,e,{startAngle:low,endAngle:high});for(let i=0;i<3;i++)h.cycle();assert.equal(h.counter.reps,3);for(let i=0;i<100;i++)h.send(s+(i%2?1:-1));assert.equal(h.counter.reps,3);});
 test(`${movement}: invalid angle or clock reset clears the current cycle`,()=>{const h=harness(movement,start,end);h.hold(start,900);h.set({angle:NaN});h.send(start);h.set({});h.ramp(end,900);h.hold(end,600);h.ramp(start,900);assert.equal(h.counter.reps,0);});
}
test('seated-start geometry rejects standing and accepts a seated thigh at different distances',()=>{
 for(const scale of [.5,1,1.5]){
  const p=(x,y)=>({x:.5+x*scale,y:.3+y*scale});
  assert.equal(seatedStart({shoulder:p(0,0),hip:p(0,.2),knee:p(.15,.21),aspect:16/9}),true);
  assert.equal(seatedStart({shoulder:p(0,0),hip:p(0,.2),knee:p(.015,.4),aspect:16/9}),false);
 }
});
test('sit-to-stand never arms from an upright/walking start',()=>{const h=harness('sit',90,10);h.set({context:{seated:false,bodyScale:.18}});for(let i=0;i<4;i++)h.cycle();assert.equal(h.counter.reps,0);});
test('cross-body hold duration excludes the slow return to rest',()=>{const h=harness('crossbody',0,75);h.cycle();assert.equal(h.counter.reps,1);assert.ok(h.counter.holds[0]>=.6&&h.counter.holds[0]<1.6,h.counter.holds[0]);});
test('counter reset starts a new session at zero',()=>{const h=harness('elbow',20,95);h.cycle();assert.equal(h.counter.reps,1);h.counter.reset();assert.equal(h.counter.reps,0);assert.deepEqual(h.counter.holds,[]);});
test('wave: jitter, sustained endpoint, tracking loss, and alternating arms cannot add reps',()=>{
 const c=new WaveCounter();const send=(position,now,extra={})=>c.update({position,raised:true,arm:'left',threshold:.04,...extra},now);
 for(let i=0;i<30;i++)assert.equal(send(.2+(i%2?.005:-.005),i*40),false);
 send(.28,1300);send(.28,1380);send(.28,1420,{raised:false});assert.equal(send(.2,1500),false);assert.equal(send(.2,1600),false);
 send(.28,1700);send(.28,1780);assert.equal(send(.2,1850,{arm:'right'}),false);assert.equal(send(.2,1950,{arm:'right'}),false);
});
test('wave: repeated complete out-and-back movements each count once',()=>{const c=new WaveCounter();let n=0;for(let i=0;i<8;i++){const base=i*600;for(const [position,t] of [[.2,0],[.28,100],[.28,180],[.2,300],[.2,380]])n+=Number(c.update({position,raised:true,arm:'left'},base+t));}assert.equal(n,8);});
for(const [movement,start,end] of cases)for(const fps of [10,15,30])test(`${movement}: continuous natural cycles at ${fps} fps`,()=>{
 const c=new MovementCounter(),step=1000/fps;let now=0;
 const feed=angle=>{const progress=(angle-start)/(end-start);c.update({movement,angle,now,position:{x:.5,y:.5-(movement==='sit'?progress*.16:0)},context:{bodyScale:.18,seated:movement==='sit'&&progress<.25}});now+=step;};
 for(let i=0;i<Math.ceil(1000/step);i++)feed(start);
 for(let cycle=0;cycle<4;cycle++)for(let t=0;t<3000;t+=step)feed(start+(end-start)*(1-Math.cos(t/3000*2*Math.PI))/2);
 for(let i=0;i<Math.ceil(1000/step);i++)feed(start);
 assert.equal(c.reps,4);
});
test('wave: a rapid tracking spike out and back is not a deliberate wave',()=>{const c=new WaveCounter();let n=0;for(const [position,t] of [[.2,0],[.28,20],[.28,80],[.2,100],[.2,170]])n+=Number(c.update({position,raised:true,arm:'left'},t));assert.equal(n,0);});
test('invalid calibration falls back to usable demo thresholds',()=>{const h=harness('elbow',20,95,{startAngle:NaN,endAngle:500});h.cycle();assert.equal(h.counter.reps,1);});
test('non-monotonic time invalidates an armed cycle',()=>{const h=harness('reach',10,150);h.hold(10,1000);h.set({now:-100});h.send(20);h.set({});h.ramp(150,900);h.hold(150,600);h.ramp(10,900);assert.equal(h.counter.reps,0);});
