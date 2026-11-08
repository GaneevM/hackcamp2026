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
 fist(x=.5,y=.5){const hand=this.hand(x,y);hand[8]={x,y:y+.12,z:0};return hand;},
 frame(hand,now){for(let at=(this.now??now)+16;at<now;at+=16){window.pointerFixtureFrameAt=at;renderPointerFrame(at);}this.now=now;window.pointerFixtureFrameAt=now;processPointerHand({landmarks:hand?[hand]:[]},now);renderPointerFrame(now);}
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
    const extra=document.createElement('div');extra.style.height='7000px';document.querySelector('.content').append(extra);window.scrollTo({top:400,behavior:'instant'});
    const frames=(hand,count)=>{for(let i=0;i<count;i++){now+=80;f.frame(hand,now);}};
    frames(f.fist(),6);frames(f.hand(.5,.5,true),6);const neutral=window.scrollY;
    frames(f.hand(.5,.8,true),120);const down=window.scrollY,max=document.scrollingElement.scrollHeight-innerHeight;
    frames(f.fist(.5,.8),1);const fistStop=window.scrollY;frames(f.fist(.5,.8),20);const stopped=window.scrollY;
    frames(f.hand(.5,.5,true),6);frames(f.hand(.5,.2,true),120);const up=window.scrollY;
    frames(f.fist(),6);frames(f.hand(.5,.5,true),6);frames(f.hand(.5,.8,true),8);
    frames(null,1);const lost=window.scrollY;frames(null,20);const afterLoss=window.scrollY;
    window.dispatchEvent(new Event('blur'));frames(f.hand(.5,.8,true),12);const afterBlur=window.scrollY;
    window.dispatchEvent(new Event('focus'));frames(f.fist(),6);window.pointerFixtureTime=now;
    return {neutral,down,max,fistStop,stopped,up,lost,afterLoss,afterBlur};
  });
  assert.equal(scroll.neutral,400);assert.ok(scroll.max-scroll.down<=1&&scroll.down>5000);
  assert.equal(scroll.fistStop,scroll.stopped);assert.equal(scroll.up,0);
  assert.equal(scroll.lost,scroll.afterLoss);assert.equal(scroll.afterBlur,scroll.afterLoss);
  const latch=await page.evaluate(()=>{
    const f=window.pointerFixture;let now=window.pointerFixtureTime;const clicks=[];
    const button=document.createElement('button');button.id='fixtureLatch';button.textContent='Fixture control';
    button.style.cssText='position:fixed;left:400px;top:200px;width:150px;height:48px;z-index:2000;';button.onclick=()=>clicks.push(window.pointerFixtureFrameAt);document.body.append(button);
    const frames=(hand,count)=>{for(let i=0;i<count;i++){now+=80;f.frame(hand,now);}};
    const aim=(dx=0,dy=0)=>f.hand(.2+(475+dx)/innerWidth*.5,.1+(224+dy)/innerHeight*.5);
    frames(f.fist(),6);frames(aim(),4);
    if(f.airPointer.candidate!==button)throw new Error('Button did not latch');
    const acquiredAt=now-f.airPointer.dwellElapsed,initial=button.getBoundingClientRect();
    const cursor=document.getElementById('airPointerCursor').getBoundingClientRect(),pin={x:cursor.x,y:cursor.y};
    frames(null,1);if(f.airPointer.candidate!==button)throw new Error('A brief tracking hiccup cleared the latch');
    frames(f.fist(),1);if(f.airPointer.candidate!==button)throw new Error('One misclassified gesture cleared the latch');
    let maxPinShift=0;
    for(let i=0;i<16&&!clicks.length;i++){
      frames(aim(i%2?12:-12,i%2?22:-22),1);
      const box=document.getElementById('airPointerCursor').getBoundingClientRect();
      if(f.airPointer.candidate===button)maxPinShift=Math.max(maxPinShift,Math.hypot(box.x-pin.x,box.y-pin.y));
    }
    const clickDelay=clicks[0]-acquiredAt;frames(aim(),18);const firstCount=clicks.length;
    frames(f.fist(),6);frames(aim(),4);frames(aim(0,75),5);
    const movedAway=f.airPointer.candidate!==button;frames(f.fist(),6);
    button.disabled=true;frames(aim(),20);
    return {maxPinShift,clickDelay,firstCount,movedAway,finalCount:clicks.length,width:initial.width};
  });
  assert.ok(latch.maxPinShift<1,JSON.stringify(latch));
  assert.ok(latch.clickDelay>=650&&latch.clickDelay<950,JSON.stringify(latch));
  assert.equal(latch.firstCount,1);assert.equal(latch.finalCount,1);assert.equal(latch.movedAway,true);
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
  console.log('Browser smoke passed: calibration, directions and accessible layouts; full-page continuous scrolling; fist/loss/focus stops; latched jittery holds; brief-loss recovery; deliberate exit; 650ms buttons; and disabled-control protection. Synthetic landmarks only.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
