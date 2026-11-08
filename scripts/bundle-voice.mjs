import fs from 'node:fs';
import {voiceMessages} from '../server/src/voice-messages.js';
const source=new URL('../server/data/voice/',import.meta.url),target=new URL('../voice-assets/',import.meta.url);
fs.mkdirSync(target,{recursive:true});let count=0;
for(const [mode,messages] of Object.entries(voiceMessages)){
 const manifestUrl=new URL(mode+'.json',source);if(!fs.existsSync(manifestUrl))continue;
 const saved=JSON.parse(fs.readFileSync(manifestUrl,'utf8')),clips={};
 for(const [event,text] of Object.entries(messages)){
  const clip=saved.clips?.[event];
  if(!text||!clip||clip.text!==text||!/^[a-f0-9]{64}\.wav$/.test(clip.fileName)||!fs.existsSync(new URL(clip.fileName,source))){clips[event]=null;continue;}
  fs.copyFileSync(new URL(clip.fileName,source),new URL(clip.fileName,target));clips[event]=clip;count++;
 }
 fs.writeFileSync(new URL(mode+'.json',target),JSON.stringify({mode,voice:saved.voice,model:saved.model,clips},null,2)+'\n');
}
console.log('Bundled '+count+' current fixed demo clips; private journal data were not copied.');
