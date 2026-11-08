import {makeHand} from './hand-fixture.mjs';
// Synthetic landmarks through the actual app's 3D-angle smoothing and repetition integration.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve('dist');
const sdk="window.auth0={Auth0Client:class {async checkSession(){} async isAuthenticated(){return true} async getUser(){return {sub:'practice-ui-test',name:'UI Test'}}}};";
const harness=`\nwindow.uiFixture={app,handControls,readSessions,applyExtractedText,endSession,companion,waveCounter,movementCounter,readPose,updateMovementCounter,bodyPoints,scheduleGesturePhoto,navigateHandActionList,mediaAll,async setup(){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;canvas.getContext('2d').fillRect(0,0,640,360);app.stream=canvas.captureStream(20);app.landmarker={detectForVideo:()=>({landmarks:[],worldLandmarks:[]})};app.poseReady=true;document.getElementById('startBtn').disabled=false;document.getElementById('video').srcObject=app.stream;await document.getElementById('video').play();document.getElementById('cameraEmpty').style.display='none';document.getElementById('video').style.display='block';syncCameraControl();}};`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':/\.m?js$/.test(file)?'application/javascript':file.endsWith('.png')?'image/png':'application/octet-stream');
 if(file.endsWith('auth0-spa-js-2.4.1.min.js'))return res.end(sdk);
 const content=await fs.readFile(file);res.end(file.endsWith(path.sep+'app.js')?content.toString()+harness+'\nwindow.uiFixture.process=processControlHand;window.uiFixture.makeHand='+makeHand.toString()+';':content);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 let executablePath=process.env.FORMNOTE_BROWSER_EXECUTABLE;
 if(!executablePath)for(const file of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']){try{await fs.access(file);executablePath=file;break;}catch{}}
 browser=await chromium.launch({headless:true,executablePath});
 const page=await browser.newPage({viewport:{width:1536,height:864},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/#home');
 try{await page.waitForFunction(()=>window.uiFixture&&document.getElementById('authGate').hidden,null,{timeout:10000});}catch(e){throw new Error('Application startup: '+errors.join(' | ')+'; '+await page.locator('#authGateStatus').textContent(),{cause:e});}
 const results=await page.evaluate(()=>{
  const f=window.uiFixture,$=id=>document.getElementById(id),results=[];let now=0;
  function run(movement,side,walking=false){
   f.app.running=false;f.app.manual=false;f.app.countdownActive=false;f.handControls.enabled=false;
   $('exerciseSelect').value=movement;$('bodySide').value=side;f.app.side=side;$('exerciseSelect').dispatchEvent(new Event('change'));
   f.movementCounter.reset();f.app.reps=0;$('repCount').textContent='0';f.app.angleSamples=[];f.app.currentAngle=null;f.app.sessionAngles=[];f.app.sessionStartAngle=null;f.app.running=true;
   const start=movement==='sit'?90:movement==='elbow'?20:0,end=movement==='sit'?10:movement==='reach'?150:movement==='elbow'?95:75;
   let current=start;
   function feed(angle){
    const lm=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:0}));
    const world=Array.from({length:33},()=>({x:0,y:0,z:0}));
    const ids=f.bodyPoints[side],other=f.bodyPoints[side==='left'?'right':'left'],x=side==='left'?.4:.6,q=(angle-start)/(end-start),r=angle*Math.PI/180;
    const point=(key,px,py)=>lm[ids[key]]={x:px,y:py,z:0,visibility:1};
    point('shoulder',x,.25-(movement==='sit'&&!walking?q*.1:0));point('hip',x,.45-(movement==='sit'&&!walking?q*.1:0));
    point('knee',x+(movement==='sit'&&!walking?.15*(1-q):0),movement==='sit'&&!walking?.46+.09*q:.65);point('ankle',x,.8);point('elbow',x,.4);point('wrist',x+.1,.5);
    lm[other.shoulder]={x:side==='left'?.6:.4,y:.25,z:0,visibility:1};
    if(movement==='sit'){world[ids.hip]={x:-.3,y:0,z:0};world[ids.knee]={x:0,y:0,z:0};world[ids.ankle]={x:.3*Math.cos(r),y:.3*Math.sin(r),z:0};}
    if(movement==='elbow'){world[ids.shoulder]={x:0,y:0,z:0};world[ids.elbow]={x:0,y:.3,z:0};world[ids.wrist]={x:.3*Math.sin(r),y:.3+.3*Math.cos(r),z:0};}
    if(movement==='reach'){world[ids.hip]={x:0,y:.3,z:0};world[ids.shoulder]={x:0,y:0,z:0};world[ids.elbow]={x:.3*Math.sin(r),y:.3*Math.cos(r),z:0};}
    if(movement==='crossbody'){world[other.shoulder]={x:.3,y:0,z:0};world[ids.shoulder]={x:0,y:0,z:0};world[ids.wrist]={x:.3*Math.sin(r),y:.3*Math.cos(r),z:0};}
    now+=80;current=angle;if(f.readPose(lm,world))f.updateMovementCounter(lm,now);else f.movementCounter.interrupt();
   }
   function hold(angle,ms){for(let t=0;t<ms;t+=80)feed(angle);}
   function ramp(angle,ms){const first=current;for(let t=80;t<=ms;t+=80)feed(first+(angle-first)*t/ms);}
   for(let cycle=0;cycle<2;cycle++){hold(start,1200);ramp(end,1200);hold(end,1000);ramp(start,1200);hold(start,1200);}
   f.app.running=false;return {movement,side,walking,count:f.app.reps,display:$('repCount').textContent};
  }
  for(const movement of ['sit','reach','elbow','crossbody'])for(const side of ['left','right'])results.push(run(movement,side));
  results.push(run('sit','left',true));results.push(run('sit','right',true));
  f.app.reps=0;f.app.running=false;f.app.manual=false;$('manualPlus').click();const idle=f.app.reps;
  f.app.running=true;f.app.manual=false;$('manualPlus').click();const camera=f.app.reps;
  f.app.manual=true;$('manualPlus').click();$('manualPlus').click();$('manualMinus').click();const manual=f.app.reps;
  f.app.running=false;$('manualPlus').click();results.push({idle,camera,manual,afterStop:f.app.reps});f.app.running=true;f.app.manual=false;f.handControls.enabled=true;f.handControls.sessionNavigation=false;f.handControls.sessionCommands.reset();
  let handNow=0;const hands=(g,n)=>{for(let i=0;i<n;i++){handNow+=80;f.process(f.makeHand(g,.5,.35),handNow);}};
  hands('two',11);const enabled=f.handControls.sessionNavigation;hands('two',20);const held=f.handControls.sessionNavigation;
  hands('fist',6);hands('two',11);const resumed=!f.handControls.sessionNavigation;
  results.push({handToggle:true,enabled,held,resumed,reps:f.app.reps});f.app.running=false;f.handControls.enabled=false;return results;
 });
 for(const row of results.filter(r=>r.movement)){assert.equal(row.count,row.walking?0:2,JSON.stringify(row));assert.equal(row.display,row.walking?'0':'2');}
 assert.deepEqual(results.at(-2),{idle:0,camera:0,manual:1,afterStop:1});assert.deepEqual(results.at(-1),{handToggle:true,enabled:true,held:true,resumed:true,reps:1});
 const waveSession=await page.evaluate(()=>{
  const f=window.uiFixture,$=id=>document.getElementById(id);
  f.applyExtractedText('Diagnosis: Upper-limb movement practice - fictional demo focus.\nExercise: Hand wave.\nDose: 1 set of 8 reps. Frequency: 3 sessions per week.');
  const detected=$('planExerciseOptions').querySelector('[data-plan-exercise="wave"]')?.checked;
  $('physioPlanForm').requestSubmit();$('exerciseSelect').value='wave';$('exerciseSelect').dispatchEvent(new Event('change'));
  f.app.running=true;f.app.manual=false;f.app.reps=0;f.app.startedAt=Date.now()-5000;f.app.activeSessionId='planned-wave-browser';f.app.sessionAngles=[];f.app.sessionStartAngle=null;
  f.companion.start({manual:false,movement:'wave',recordWave:true,targetReps:8});f.waveCounter.reset();
  for(let i=0;i<8;i++)for(const [position,t] of [[.2,0],[.28,100],[.28,180],[.2,300],[.2,380]]){if(f.waveCounter.update({position,raised:true,arm:'left'},i*600+t))f.app.reps++;f.companion.observe({ready:true,angle:null,reps:f.app.reps,phase:'ready'});}
  f.endSession();const row=f.readSessions().at(-1);return {detected,reps:row?.reps,movement:row?.movement,angle:row?.angle};
 });
 assert.deepEqual(waveSession,{detected:true,reps:8,movement:'wave',angle:null});
 assert.deepEqual(errors,[]);console.log('Passed app integration:',JSON.stringify(results));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
