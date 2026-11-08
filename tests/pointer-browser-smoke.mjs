// Optional local integration check: requires Playwright and Chromium. Uses only
// synthetic video/landmarks; it does not access a webcam or an Auth0 account.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve('dist');
const sdk=`window.auth0={Auth0Client:class {async checkSession(){} async isAuthenticated(){return true} async getUser(){return {sub:'pointer-fixture',name:'Pointer Test'}}}};`;
const harness=`
window.pointerFixture={app,airPointer,showPointerCalibration,beginPointerSwipeCalibration,processPointerHand,renderPointerFrame,
 async setup(){const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;canvas.getContext('2d').fillRect(0,0,1280,720);app.stream=canvas.captureStream(20);$('video').srcObject=app.stream;await $('video').play();handLandmarker={};airPointer.pose=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));airPointer.pose[11]={x:.35,y:.4,visibility:1};airPointer.pose[12]={x:.65,y:.4,visibility:1};},
 hand(x,y,open=false){const hand=Array.from({length:21},()=>({x,y:y+.1,z:0}));hand[0]={x,y:y+.15,z:0};for(const [pip,tip] of [[6,8],[10,12],[14,16],[18,20]]){hand[pip]={x,y:y+.06,z:0};hand[tip]={x,y:y+(open?0:.12),z:0};}hand[8]={x,y,z:0};return hand;},
 frame(hand,now){processPointerHand({landmarks:hand?[hand]:[]},now);renderPointerFrame(now);}
};`;
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':/\.m?js$/.test(file)?'application/javascript':'application/octet-stream');
    if(file.endsWith('auth0-spa-js-2.4.1.min.js'))return res.end(sdk);
    const content=await fs.readFile(file);res.end(file.endsWith(path.sep+'app.js')?content.toString()+harness:content);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  let executablePath=process.env.FORMNOTE_BROWSER_EXECUTABLE;
  if(!executablePath)for(const candidate of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']){
    try{await fs.access(candidate);executablePath=candidate;break;}catch{}
  }
  browser=await chromium.launch({headless:true,executablePath});
  const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/#move`);
  await page.waitForFunction(()=>window.pointerFixture&&document.getElementById('authGate').hidden);
  const calibration=await page.evaluate(async()=>{
    const f=window.pointerFixture;await f.setup();f.showPointerCalibration();let now=2000;
    for(let index=0;index<4;index++){
      const state=f.airPointer.calibration;state.readyAt=now;
      const target=state.targets[index],hand=f.hand(.2+target.x*.5,.1+target.y*.5);
      for(let i=0;i<15&&state.index===index;i++){now+=80;f.frame(hand,now);}
      if(state.index!==index+1)throw new Error('Calibration did not advance at position '+index);
    }
    const swipe=(start,end)=>{
      for(let i=0;i<5;i++){now+=80;f.frame(f.hand(.5,start,true),now);}
      if(document.querySelector('#pointerSwipeGuide').dataset.phase!=='swipe')throw new Error('Hold did not highlight the swipe step');
      for(let i=1;i<=6;i++){now+=80;f.frame(f.hand(.5,start+(end-start)*i/6,true),now);}
      if(document.querySelector('#pointerSwipeGuide').dataset.phase!=='finish')throw new Error('Movement did not highlight the ending hold');
      for(let i=0;i<6;i++){now+=80;f.frame(f.hand(.5,end,true),now);}
      if(document.querySelector('#pointerSwipeGuide').dataset.phase!=='done')throw new Error('Successful swipe did not show confirmation');
      for(let i=0;i<10;i++){now+=80;f.frame(f.hand(.5,end,true),now);}
    };
    if(f.airPointer.calibration.stage!=='up')throw new Error('Four dots did not reach swipe setup');
    swipe(.65,.25);if(f.airPointer.calibration.stage!=='down')throw new Error('Up swipe did not advance');
    swipe(.25,.65);window.pointerFixtureTime=now;
    return {enabled:f.airPointer.enabled,closed:document.getElementById('pointerCalibration').hidden,config:f.airPointer.config};
  });
  assert.equal(calibration.enabled,true);assert.equal(calibration.closed,true);assert.ok(calibration.config.swipes.up>.1&&calibration.config.swipes.down>.1);
  const navigation=await page.evaluate(()=>{
    const f=window.pointerFixture;let now=window.pointerFixtureTime;
    for(let i=0;i<8;i++){now+=80;f.frame(f.hand(.5,.4,true),now);}
    const box=document.querySelector('.nav button[data-screen="progress"]').getBoundingClientRect();
    const hand=f.hand(.2+(box.x+box.width/2)/innerWidth*.5,.1+(box.y+box.height/2)/innerHeight*.5);
    for(let i=0;i<32;i++){now+=80;f.frame(hand,now);}
    const route=location.hash,streamKept=!!f.app.stream,mustRelease=f.airPointer.mustRelease;
    for(let i=0;i<12;i++){now+=80;f.frame(null,now);}
    const missingHandStillLocked=f.airPointer.mustRelease;
    window.pointerFixtureTime=now;
    return {route,streamKept,mustRelease,missingHandStillLocked};
  });
  assert.deepEqual(navigation,{route:'#progress',streamKept:true,mustRelease:true,missingHandStillLocked:true});
  const scroll=await page.evaluate(()=>{
    const f=window.pointerFixture;let now=window.pointerFixtureTime;
    const extra=document.createElement('div');extra.style.height='2500px';document.querySelector('.content').append(extra);window.scrollTo(0,400);
    const start=window.scrollY;
    for(let i=0;i<6;i++){now+=80;f.frame(f.hand(.5,.65,true),now);}
    for(let i=1;i<=6;i++){now+=80;f.frame(f.hand(.5,.65-.4*i/6,true),now);}
    for(let i=0;i<6;i++){now+=80;f.frame(f.hand(.5,.25,true),now);}
    const afterUp=window.scrollY;
    for(let i=0;i<18;i++){now+=80;f.frame(f.hand(.5,.25,true),now);}
    const afterHold=window.scrollY;
    for(let i=1;i<=6;i++){now+=80;f.frame(f.hand(.5,.25+.4*i/6,true),now);}
    for(let i=0;i<6;i++){now+=80;f.frame(f.hand(.5,.65,true),now);}
    return {start,afterUp,afterHold,afterDown:window.scrollY};
  });
  assert.equal(scroll.start-scroll.afterUp,192);assert.equal(scroll.afterHold,scroll.afterUp);assert.equal(scroll.afterDown,scroll.start);
  await page.setViewportSize({width:390,height:844});
  const layout=await page.evaluate(()=>{window.pointerFixture.showPointerCalibration();const panel=document.querySelector('.pointer-calibration-panel').getBoundingClientRect(),dot=document.getElementById('pointerCalibrationTarget').getBoundingClientRect();return {panelBottom:panel.bottom,dotTop:dot.top,dotBottom:dot.bottom,height:innerHeight};});
  assert.ok(layout.dotTop>=layout.panelBottom&&layout.dotBottom<layout.height,JSON.stringify(layout));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:1280,height:800});
  for(const direction of ['up','down']){
    const animation=await page.evaluate(direction=>{
      const f=window.pointerFixture;f.beginPointerSwipeCalibration(f.airPointer.calibration,direction);
      const hand=document.querySelector('.pointer-swipe-demo'),animation=hand.getAnimations()[0];animation.pause();animation.currentTime=0;
      const start=new DOMMatrix(getComputedStyle(hand).transform).m42;
      animation.currentTime=1600;const end=new DOMMatrix(getComputedStyle(hand).transform).m42;
      const liveY=new DOMMatrix(getComputedStyle(document.querySelector('.pointer-swipe-live')).transform).m42;
      return {start,end,liveY,font:parseFloat(getComputedStyle(document.querySelector('#pointerSwipeSteps li')).fontSize)};
    },direction);
    assert.ok(direction==='up'?animation.end<animation.start:animation.end>animation.start);
    assert.ok(direction==='up'?animation.liveY>0:animation.liveY<0,'Your hand marker must reset to the correct starting end');
    assert.ok(animation.font>=26,'Distance instructions must remain large on desktop');
    if(process.env.FORMNOTE_POINTER_SCREENSHOTS)await page.screenshot({path:path.join(os.tmpdir(),`formnote-swipe-${direction}.png`)});
  }
  for(const [width,height] of [[390,844],[320,568],[1280,600]]){
    await page.setViewportSize({width,height});
    const bounds=await page.evaluate(()=>{
      const panel=document.querySelector('.pointer-calibration-panel'),cancel=document.getElementById('pointerCalibrationCancel').getBoundingClientRect();
      return {overflow:panel.scrollWidth-panel.clientWidth,cancelBottom:cancel.bottom,height:innerHeight};
    });
    assert.ok(bounds.overflow<=1&&bounds.cancelBottom<=bounds.height,JSON.stringify({width,...bounds}));
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.pointer-swipe-demo').evaluate(node=>getComputedStyle(node).animationName),'none');
  assert.deepEqual(errors,[]);
  console.log('Browser smoke passed: four dots, hold/swipe/hold feedback, both animation directions, readable instructions, responsive and reduced-motion layouts, navigation, tracking-loss lock, and bounded swipe scrolling. Synthetic landmarks only.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
