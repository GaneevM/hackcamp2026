// Optional local browser check. Uses synthetic camera frames and hand landmarks.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {makeHand} from './hand-fixture.mjs';
const {chromium}=createRequire(import.meta.url)('playwright'),root=path.resolve('dist');
const sdk="window.auth0={Auth0Client:class {async checkSession(){} async isAuthenticated(){return true} async getUser(){return {sub:'hand-command-fixture',name:'Gesture Test'}}}};";
const harness='\nconst makeSyntheticHand='+makeHand.toString()+';\n'+"window.handFixture={\n app,handControls,stopCamera,readSessions,saveSessions,now:0,\n async setup(){const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;canvas.getContext('2d').fillRect(0,0,1280,720);app.stream=canvas.captureStream(20);document.getElementById('video').srcObject=app.stream;await document.getElementById('video').play();app.landmarker={detectForVideo:()=>({landmarks:[],worldLandmarks:[]})};handLandmarker={detect:()=>({landmarks:[]})};},\n frame(hand){const now=this.now+80;for(let at=this.now+16;at<now;at+=16)renderHandControlFrame(at);this.now=now;processControlHand(hand,now);renderHandControlFrame(now);},\n frames(gesture,count,x=.5,y=.35){for(let i=0;i<count;i++)this.frame(gesture?makeSyntheticHand(gesture,x,y):null);},\n release(){this.frames('fist',6);}\n};";
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':/\.m?js$/.test(file)?'application/javascript':'application/octet-stream');
  if(file.endsWith('auth0-spa-js-2.4.1.min.js'))return res.end(sdk);
  const content=await fs.readFile(file);res.end(file.endsWith(path.sep+'app.js')?content.toString()+harness:content);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 let executablePath=process.env.FORMNOTE_BROWSER_EXECUTABLE;
 if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']){try{await fs.access(candidate);executablePath=candidate;break;}catch{}}
 browser=await chromium.launch({headless:true,executablePath});
 const page=await browser.newPage({viewport:{width:1536,height:864},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',error=>errors.push(error.stack||error.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/#home');
 try{await page.waitForFunction(()=>window.handFixture&&document.getElementById('authGate').hidden,null,{timeout:10000});}
 catch(error){throw new Error(`App did not unlock. Auth status: ${await page.locator('#authGateStatus').textContent().catch(()=>'(missing)')}; errors: ${errors.join(' | ')||'(none)'}`,{cause:error});}
 assert.equal(await page.locator('#airPointerCursor,#pointerCalibration,#airPointerToggle').count(),0);
 const landing=await page.evaluate(()=>({nav:[...document.querySelectorAll('.sidebar .nav [data-screen]')].map(n=>n.innerText.trim()),slogan:document.querySelector('#screen-home .home-focus h1')?.textContent,welcomeHidden:!document.querySelector('#screen-home .welcome').getClientRects().length,rank:document.getElementById('climbRankName')?.textContent,start:document.getElementById('homeStartSession')?.textContent.trim(),pushupFirst:document.querySelector('#movement [data-movement]')?.dataset.movement,voiceTitle:document.querySelector('.session-companion h2')?.textContent,voiceModes:[...document.querySelectorAll('.session-companion .voice-modes button')].map(n=>n.textContent.trim()),signOutNav:document.querySelectorAll('.nav [data-screen="signout"],.mobile-nav [data-screen="signout"]').length}));
 assert.deepEqual(landing.nav,['Home','Practice','My Plan','Progress','Profile']);assert.equal(landing.slogan,'The peak of physiotherapy.');assert.equal(landing.welcomeHidden,true);assert.equal(landing.rank,'Trailhead');assert.ok(landing.start.includes('Start Session'));assert.equal(landing.pushupFirst,'pushup');assert.equal(landing.voiceTitle,'Voice controls');assert.deepEqual(landing.voiceModes,['QuietOnly tracking alerts','NormalStandard spoken cues']);assert.equal(landing.signOutNav,0);
 assert.equal(await page.locator('#exerciseSelect').isVisible(),false);assert.equal(await page.locator('#practice-settings').count(),0);assert.equal(await page.locator('.practice-settings').count(),1);
 await page.locator('.sidebar .nav [data-screen="plan"]').click();assert.equal(await page.locator('#screen-plan').isVisible(),true);assert.equal(await page.locator('#diagnosisFile').count(),1);assert.equal(await page.locator('#previewReport').count(),1);
 await page.locator('.sidebar .nav [data-screen="progress"]').click();assert.equal(await page.locator('#screen-progress').isVisible(),true);assert.equal(await page.locator('#careHistoryPanel').isVisible(),true);
 await page.locator('.sidebar .nav [data-screen="home"]').click();assert.equal(await page.locator('#photoGallery').count(),1);
 if(process.env.FORMNOTE_UI_SCREENSHOT)await page.screenshot({path:path.join(os.tmpdir(),'physipeak-home-1536x864.png')});
 await page.evaluate(async()=>{await window.handFixture.setup();window.handFixture.app.poseReady=true;document.getElementById('homeStartSession').click();});
 await page.waitForFunction(()=>window.handFixture.app.countdownActive);
 assert.equal(await page.locator('#screen-move').isVisible(),true);assert.equal(await page.locator('#sessionCountdown').isVisible(),true);assert.equal(await page.locator('#countdownNumber').textContent(),'5');
 await page.locator('#cancelCountdown').click();
 await page.locator('.sidebar .nav [data-screen="profile"]').click();
 await page.evaluate(async()=>{await window.handFixture.setup();window.handFixture.saveSessions([{id:'existing-session',date:new Date().toISOString(),movement:'sit',exercise:'Existing session',metric:'Knee flexion',reps:1,angle:20,confidence:2,pain:1,note:'Keep this',side:'left',manual:true}]);});
 await page.locator('#handControlsToggle').click();
 assert.equal(await page.locator('#handControlsToggle').getAttribute('aria-pressed'),'true');
 await page.locator('.sidebar .nav [data-screen="move"]').click();
 const camera=await page.evaluate(()=>{
  const f=window.handFixture,stream=f.app.stream;
  f.frames('one',10);const paused=f.app.cameraPaused,copy=document.getElementById('gestureCameraPause').textContent;
  f.frames('one',30);const heldStillPaused=f.app.cameraPaused;
  f.frames(null,12);f.frames('one',12);const lossDidNotRearm=f.app.cameraPaused;
  f.release();f.frames('one',10);
  return {paused,copy,heldStillPaused,lossDidNotRearm,resumed:!f.app.cameraPaused,sameStream:f.app.stream===stream,live:stream.getVideoTracks()[0].readyState==='live'};
 });
 assert.equal(camera.paused,true);assert.ok(camera.copy.includes('Webcam on for hand sensing'));
 assert.equal(camera.heldStillPaused,true);assert.equal(camera.lossDidNotRearm,true);assert.equal(camera.resumed,true);assert.equal(camera.sameStream,true);assert.equal(camera.live,true);
 const scroll=await page.evaluate(()=>{
  const f=window.handFixture;const extra=document.createElement('div');extra.style.height='7000px';document.querySelector('.content').append(extra);
  f.release();f.frames('one',10);window.scrollTo({top:400,behavior:'instant'});
  f.release();f.frames('palm',6,.5,.4);const neutral=window.scrollY;
  f.frames('palm',120,.5,.7);const bottom=window.scrollY,max=document.scrollingElement.scrollHeight-innerHeight;
  f.frames('fist',1);const stopped=window.scrollY;f.frames('fist',20);const stillStopped=window.scrollY;
  f.frames('palm',6,.5,.4);f.frames('palm',120,.5,.1);const top=window.scrollY;
  f.release();f.frames('palm',6,.5,.4);f.frames('palm',10,.5,.7);f.frames(null,1);const lost=window.scrollY;f.frames(null,20);const afterLoss=window.scrollY;
  f.release();return {neutral,bottom,max,stopped,stillStopped,top,lost,afterLoss,viewStillPaused:f.app.cameraPaused};
 });
 assert.equal(scroll.neutral,400);assert.ok(scroll.max-scroll.bottom<=1&&scroll.bottom>5000);assert.equal(scroll.stopped,scroll.stillStopped);assert.equal(scroll.top,0);assert.equal(scroll.lost,scroll.afterLoss);assert.equal(scroll.viewStillPaused,true);
 const cancelled=await page.evaluate(()=>{
  const f=window.handFixture;f.release();f.frames('two',10);
  const countdown=f.app.countdownActive&&f.app.countdownRemaining===5&&!f.app.running;
  f.frames('two',20);const heldDidNotCancel=f.app.countdownActive;
  f.release();f.frames('two',10);
  return {countdown,heldDidNotCancel,cancelled:!f.app.countdownActive&&!f.app.running,rows:f.readSessions().length,viewResumed:!f.app.cameraPaused};
 });
 assert.deepEqual(cancelled,{countdown:true,heldDidNotCancel:true,cancelled:true,rows:1,viewResumed:true});
 await page.locator('#practiceVoice').click();
 await page.evaluate(()=>{const f=window.handFixture;f.release();f.frames('two',10);f.app.poseReady=true;});
 assert.equal(await page.evaluate(()=>window.handFixture.app.countdownRemaining),5);
 await page.waitForFunction(()=>window.handFixture.app.running,{timeout:8000});
 const saved=await page.evaluate(()=>{
  const f=window.handFixture;f.app.reps=3;f.app.sessionStartAngle=20;f.app.sessionAngles=[20,40,60];
  f.release();f.frames('one',10);const activeCameraGuard=f.app.running&&!f.app.cameraPaused;
  f.release();f.frames('two',10);const finished=!f.app.running,rows=f.readSessions();
  f.frames('two',25);return {activeCameraGuard,finished,notRestarted:!f.app.running&&!f.app.countdownActive,rows:rows.length,previous:rows[0].id,reps:rows.at(-1).reps};
 });
 assert.deepEqual(saved,{activeCameraGuard:true,finished:true,notRestarted:true,rows:2,previous:'existing-session',reps:3});
 for(const [width,height] of [[390,844],[320,568],[1280,600]]){
  await page.setViewportSize({width,height});
  assert.ok(await page.locator('#handControlsLegend').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
 }
 if(process.env.FORMNOTE_HAND_SCREENSHOT)await page.screenshot({path:path.join(os.tmpdir(),'formnote-hand-controls.png')});
 const off=await page.evaluate(()=>{
  const f=window.handFixture,tracks=f.app.stream.getTracks();f.stopCamera();f.frames('one',20);
  return {stopped:tracks.every(track=>track.readyState==='ended'),stream:f.app.stream===null,controlsOff:!f.handControls.enabled,hudHidden:document.getElementById('handControlsHud').hidden,rows:f.readSessions().length};
 });
 assert.deepEqual(off,{stopped:true,stream:true,controlsOff:true,hudHidden:true,rows:2});
 assert.deepEqual(errors,[]);
 console.log('Browser smoke passed: no pointer/calibration; one-finger pause/resume with honest webcam status; no repeated toggles; continuous palm scrolling and fist stop; two-finger countdown/cancel/finish; five-second buffer; saved history; responsive UI; and physical camera shutdown. Synthetic video and hands only.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
