import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementCounter,seatedStart} from '../movement-counter.mjs';
const ankle={x:.5,y:.9,visibility:.9};
function feed(c,angle,now,seated=true,position=ankle){return c.update({movement:'sit',angle,now,position,context:{seated}});}
function arm(c){for(let t=0;t<=800;t+=100)feed(c,80,t);assert.equal(c.phase,'ready');}
test('seated start needs only the selected lower-body joints at different framing sizes',()=>{
 for(const scale of [.1,.25,.4]){const knee={x:.5,y:.9-scale,visibility:.9},hip={x:.5-scale,y:knee.y,visibility:.9};assert.equal(seatedStart({hip,knee,ankle}),true);}
 assert.equal(seatedStart({hip:{x:.5,y:.4},knee:{x:.5,y:.65},ankle}),false);
 assert.equal(seatedStart({hip:{x:.3,y:.65},knee:{x:.5,y:.65},ankle:{...ankle,visibility:.1}}),false);
});
test('a seated start and controlled stand count with the foot anchored',()=>{const c=new MovementCounter();arm(c);for(let t=900;t<=1800;t+=100)feed(c,Math.max(5,80-(t-800)*.1),t,false);assert.equal(c.reps,1);});
test('standing without a seated start never counts',()=>{const c=new MovementCounter();for(let t=0;t<3000;t+=100)feed(c,5,t,false);assert.equal(c.reps,0);});
test('a brief missing frame preserves the cycle without counting during occlusion',()=>{const c=new MovementCounter();arm(c);feed(c,55,900,false);c.pause(1000);assert.equal(c.reps,0);feed(c,35,1150,false);for(let t=1250;t<=1750;t+=100)feed(c,5,t,false);assert.equal(c.reps,1);});
test('a long tracking gap discards the cycle',()=>{const c=new MovementCounter();arm(c);feed(c,55,900,false);c.pause(1000);feed(c,5,1400,false);for(let t=1500;t<2300;t+=100)feed(c,5,t,false);assert.equal(c.reps,0);});
test('moving the planted foot far out of view discards the cycle',()=>{const c=new MovementCounter();arm(c);feed(c,5,1000,false,{x:.9,y:.9});assert.equal(c.phase,'find-start');assert.equal(c.reps,0);});
