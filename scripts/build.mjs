import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateAuthConfig} from '../auth-flow.mjs';
export function resolveConfig(text,env={}) {
  const sandbox={window:{},document:{documentElement:{classList:{add(){}}}}};
  vm.runInNewContext(text,sandbox,{timeout:1000});
  const saved=sandbox.window.FORMNOTE_AUTH0_CONFIG||{};
  return validateAuthConfig({domain:env.AUTH0_DOMAIN?.trim()||saved.domain,clientId:env.AUTH0_CLIENT_ID?.trim()||saved.clientId});
}
export function requireCredentials(env) {
  const missing=['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN'].filter(key=>!env[key]?.trim());
  if(missing.length)throw new Error(`Missing GitHub Actions secrets: ${missing.join(', ')}. Publishing cannot proceed.`);
}
export function build(root=process.cwd(),env=process.env) {
  const config=resolveConfig(fs.readFileSync(path.join(root,'auth0-config.js'),'utf8'),env);
  const output=path.join(root,'dist'),sha=env.GITHUB_SHA||'local';
  const files=new Set(['index.html','styles.css','redesign.css','studio.css','hand-controls.css','physipeak.css','auth0-config.js','_headers','vendor/auth0-spa-js-2.4.1.min.js']);
  function collect(file) {
    if(files.has(file))return;files.add(file);
    const text=fs.readFileSync(path.join(root,file),'utf8');
    for(const m of text.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1]));
      if(target.startsWith('../')||target.startsWith('server/'))throw new Error('Unexpected frontend import path.');
      collect(target);
    }
  }
  collect('app.js');
  const voices=path.join(root,'voice-assets');
  if(fs.existsSync(voices))for(const file of fs.readdirSync(voices))if(/^(quiet|concise|encouraging)\.json$|^[a-f0-9]{64}\.wav$/.test(file))files.add('voice-assets/'+file);
  if(path.resolve(output)!==path.join(path.resolve(root),'dist'))throw new Error('Invalid output directory.');
  fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output);
  const hashes={};
  for(const file of files) {
    const dest=path.join(output,file);fs.mkdirSync(path.dirname(dest),{recursive:true});
    const content=file==='auth0-config.js'?`window.FORMNOTE_AUTH0_CONFIG = ${JSON.stringify(config)};\n`:fs.readFileSync(path.join(root,file));
    fs.writeFileSync(dest,content);hashes[file]=crypto.createHash('sha256').update(content).digest('hex');
  }
  let html=fs.readFileSync(path.join(output,'index.html'),'utf8');
  html=html.replace(/(src|href)="\.\/([^"?]+)(?:\?[^\"]*)?"/g,(all,key,file)=>hashes[file]?`${key}="./${file}?v=${hashes[file].slice(0,16)}"`:all);
  html=html.replace('</head>',`<meta name="formnote-release" content="${sha.replace(/[^a-z0-9-]/gi,'')}"></head>`);
  fs.writeFileSync(path.join(output,'index.html'),html);
  hashes['index.html']=crypto.createHash('sha256').update(html).digest('hex');
  const release={commit:sha,worker:'steep-bush-dac6',auth:config,assets:hashes};
  fs.writeFileSync(path.join(output,'release.json'),JSON.stringify(release,null,2));
  console.log(`Built ${files.size} frontend files for steep-bush-dac6; Auth0 configuration is valid; release ${sha}.`);
  return release;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))build();
