import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('tab switching pauses sharing and resumes the same connection without another token',async()=>{
 const events={},nodes=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{checked:true,textContent:'',setAttribute(){},after(){}});return nodes.get(key);};
 const section={style:{},querySelector:node};const document={hidden:false,createElement:tag=>tag==='section'?section:{},querySelector:key=>key==='.session-companion'?{querySelector:()=>({after(){}})}:node(key),addEventListener:(name,fn)=>{events[name]=fn;},dispatchEvent(){}};
 let fetches=0,closed=0,suspended=0,resumed=0,tick,deadline,micStops=0;
 class Socket{static OPEN=1;static CONNECTING=0;constructor(){this.readyState=1;Socket.instance=this;}send(){}close(){closed++;}}
 class Context{constructor(){this.currentTime=0;}async resume(){resumed++;}async suspend(){suspended++;}async close(){}}
 const source=fs.readFileSync(new URL('../live-feedback.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function createLiveFeedback','function createLiveFeedback');
 const create=new Function('apiHeaders','createLiveMicrophone','document','window','WebSocket','AudioContext','fetch','setInterval','clearInterval','setTimeout','clearTimeout',source+';return createLiveFeedback;')(
 async()=>({}),()=>({stop(){micStops++;},speaking:false,pending:false,active:false}),document,{addEventListener(){}},Socket,Context,async()=>{fetches++;return{ok:true,json:async()=>({name:'test',setup:{},durationSeconds:180})};},fn=>{tick=fn;return 1;},()=>{},fn=>{deadline=fn;return 2;},()=>{});
 const api=create({getSession:()=>({movement:'sit'})});await api.start({movement:'sit'});await Socket.instance.onmessage({data:JSON.stringify({setupComplete:{}})});
 document.hidden=true;events.visibilitychange();await Promise.resolve();tick();assert.equal(suspended,1);assert.equal(closed,0);
 document.hidden=false;events.visibilitychange();await Promise.resolve();assert.equal(resumed,2);assert.equal(fetches,1);assert.equal(closed,0);assert.ok(micStops>=2);
 node('[data-live-reconnect]').onclick();assert.equal(fetches,1);deadline();assert.equal(closed,1);
});
