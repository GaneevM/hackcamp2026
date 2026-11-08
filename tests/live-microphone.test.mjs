import test from 'node:test';
import assert from 'node:assert/strict';
import {pcm16,SpeechGate,createLiveMicrophone} from '../live-microphone.js';
test('PCM input is resampled to 16 kHz mono with signed little-endian bounds',()=>{
 const bytes=pcm16(new Float32Array([-2,0,0,1,0,0]),48000),view=new DataView(bytes.buffer);
 assert.equal(bytes.length,4);assert.equal(view.getInt16(0,true),-32768);assert.equal(view.getInt16(2,true),32767);
});
test('brief noise does not open a speech turn; sustained speech and silence delimit one turn',()=>{
 const gate=new SpeechGate();assert.equal(gate.update(.1,64),null);assert.equal(gate.update(0,64),null);
 assert.equal(gate.update(.1,64),null);assert.equal(gate.update(.1,64),'start');
 assert.equal(gate.update(0,500),null);assert.equal(gate.update(0,400),'end');assert.equal(gate.active,false);
});
test('an utterance ends after 12 seconds even in persistent noise',()=>{
 const gate=new SpeechGate();assert.equal(gate.update(.1,120),'start');assert.equal(gate.update(.1,12000),'end');
});
test('late microphone permission after stop releases the acquired audio track',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');let resolve,stops=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(r=>{resolve=r;})}}});
 try {const mic=createLiveMicrophone({state(){},finish(){},error(){assert.fail('Unexpected error');}});const pending=mic.start();mic.stop();resolve({getTracks:()=>[{stop(){stops++;}}]});await pending;assert.equal(stops,1);assert.equal(mic.active,false);}
 finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});
