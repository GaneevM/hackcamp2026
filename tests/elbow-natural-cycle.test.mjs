import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementCounter} from '../movement-counter.mjs';
test('elbow counts controlled continuous cycles without long endpoint holds',()=>{const c=new MovementCounter();let now=0;const position={x:.5,y:.5};for(let cycle=0;cycle<4;cycle++){for(let i=0;i<60;i++){const angle=20+70*(1-Math.cos(i/60*2*Math.PI))/2;c.update({movement:'elbow',angle,position,now});now+=33;}}assert.equal(c.reps,4);});
test('elbow jitter and partial bends do not count',()=>{const c=new MovementCounter();for(let i=0;i<300;i++)c.update({movement:'elbow',angle:20+10*Math.sin(i/10),position:{x:.5,y:.5},now:i*33});assert.equal(c.reps,0);});
test('a tracking interruption discards the unfinished elbow cycle',()=>{const c=new MovementCounter();for(let i=0;i<30;i++)c.update({movement:'elbow',angle:i<10?20:90,position:{x:.5,y:.5},now:i*33});c.interrupt();for(let i=30;i<55;i++)c.update({movement:'elbow',angle:20,position:{x:.5,y:.5},now:i*33});assert.equal(c.reps,0);});
