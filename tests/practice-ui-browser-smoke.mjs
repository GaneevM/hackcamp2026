// Local browser check: inline controls, responsive layout, and real IndexedDB photo persistence.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve('dist');
const sdk="window.auth0={Auth0Client:class {async checkSession(){} async isAuthenticated(){return true} async getUser(){return {sub:'practice-ui-test',name:'UI Test'}}}};";
const harness=`\nwindow.uiFixture={app,handControls,scheduleGesturePhoto,navigateHandActionList,mediaAll,async setup(){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;canvas.getContext('2d').fillRect(0,0,640,360);app.stream=canvas.captureStream(20);document.getElementById('video').srcObject=app.stream;await document.getElementById('video').play();document.getElementById('cameraEmpty').style.display='none';document.getElementById('video').style.display='block';syncCameraControl();}};`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':/\.m?js$/.test(file)?'application/javascript':file.endsWith('.png')?'image/png':'application/octet-stream');
 if(file.endsWith('auth0-spa-js-2.4.1.min.js'))return res.end(sdk);
 const content=await fs.readFile(file);res.end(file.endsWith(path.sep+'app.js')?content.toString()+harness:content);
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
 await page.screenshot({path:path.join(os.tmpdir(),'physipeak-home-updated.png')});
 assert.ok(await page.locator('.home-dashboard').evaluate(n=>n.getBoundingClientRect().top>=innerHeight-10));
 assert.ok(await page.locator('.brand .official-logo').evaluate(n=>n.complete&&n.naturalWidth>0));
 await page.screenshot({path:path.join(os.tmpdir(),'physipeak-home-updated.png')});
 await page.locator('.sidebar .nav [data-screen="move"]').click();
 assert.equal(await page.locator('#repGoal').isVisible(),false);
 assert.equal(await page.locator('.practice-aside').isVisible(),false);
 assert.equal(await page.locator('#stage').isVisible(),false);
 assert.equal(await page.locator('#handControlsHud').evaluate(n=>getComputedStyle(n).position),'static');
 assert.equal(await page.locator('#handActionMenu button:visible').count(),4);
 await page.evaluate(async()=>{await window.uiFixture.setup();const f=window.uiFixture;f.navigateHandActionList({y:.3},1000,.1);for(let i=1;i<=5;i++)f.navigateHandActionList({y:.7},1000+i*80,.1);});
 assert.equal(await page.locator('[data-hand-action="photo"]').getAttribute('aria-current'),'true');
 await page.locator('[data-hand-action="photo"]').click();
 assert.ok(await page.evaluate(()=>window.uiFixture.handControls.photoDeadline-Date.now()>4000));
 await page.waitForFunction(()=>document.querySelectorAll('#practicePhotoGallery img').length===1,null,{timeout:10000});
 assert.equal(await page.locator('#photoGallery img').count(),1);
 assert.equal(await page.locator('#practicePhotoGallery img').evaluate(n=>n.complete&&n.naturalWidth>0),true);
 await page.screenshot({path:path.join(os.tmpdir(),'physipeak-practice-updated.png')});
 await page.reload();await page.waitForFunction(()=>window.uiFixture&&document.getElementById('authGate').hidden);
 await page.waitForFunction(()=>document.querySelectorAll('#practicePhotoGallery img').length===1);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 assert.deepEqual(errors,[]);
 console.log('Passed: first-screen Home, real logo, inline actions, palm list navigation, 5-second photo delay, local photo persistence, mobile width, and no application errors.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
