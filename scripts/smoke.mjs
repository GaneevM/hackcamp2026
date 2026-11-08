import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {resolveConfig} from './build.mjs';
const origin='https://physipeak.smganeev.workers.dev';
const expected=JSON.parse(await fs.readFile('dist/release.json','utf8'));
const expectedAudience=JSON.parse(await fs.readFile('wrangler.connected.jsonc','utf8')).vars.AUTH0_AUDIENCE;
async function get(path) {
  const response=await fetch(`${origin}/${path}?release=${encodeURIComponent(expected.commit)}&check=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);
  return response;
}
async function smoke() {
  const release=await (await get('release.json')).json();
  if(release.commit!==expected.commit)throw new Error('The live release does not match this commit.');
  for(const [file,hash] of Object.entries(expected.assets)) {
    if(file==='_headers')continue;
    const response=await get(file),body=Buffer.from(await response.arrayBuffer());
    // The API Worker generates Auth0 config from public runtime settings.
    // All static assets still require an exact release hash.
    if(file!=='auth0-config.js'&&crypto.createHash('sha256').update(body).digest('hex')!==hash)throw new Error(`${file}: live asset is stale or incompatible.`);
    if(/\.(?:m?js)$/.test(file)&&!/javascript/.test(response.headers.get('content-type')||''))throw new Error(`${file}: incorrect script MIME type.`);
    if(['index.html','auth0-config.js','app.js'].includes(file)&&!/(no-cache|no-store|max-age=0)/.test(response.headers.get('cache-control')||''))throw new Error(`${file}: missing revalidation policy.`);
    if(file==='auth0-config.js'&&JSON.stringify(resolveConfig(body.toString()))!==JSON.stringify(expected.auth))throw new Error('Live Auth0 config differs from the build.');
    if(file==='auth0-config.js'){
      const sandbox={window:{}};vm.runInNewContext(body.toString(),sandbox,{timeout:1000});
      if(sandbox.window.FORMNOTE_AUTH0_CONFIG?.audience!==expectedAudience)throw new Error('Live Auth0 API audience differs from the Worker configuration.');
    }
  }
  const healthResponse=await get('health');
  if(!healthResponse.headers.get('content-type')?.includes('application/json'))throw new Error('Backend health route returned a page instead of JSON.');
  const health=await healthResponse.json();
  if(health.status!=='ok'||health.hosting!=='cloudflare-d1'||!health.aiConfigured)throw new Error('Hosted backend, database, or Gemini configuration is unavailable.');
  const discovery=await fetch(`https://${expected.auth.domain}/.well-known/openid-configuration`,{signal:AbortSignal.timeout(15000)});
  if(!discovery.ok)throw new Error('Auth0 discovery is unavailable.');
  const metadata=await discovery.json();
  if(metadata.issuer!==`https://${expected.auth.domain}/`)throw new Error('Auth0 issuer mismatch.');
  console.log(`Live smoke passed: ${expected.commit}, all frontend assets, Auth0 config, SDK MIME, cache policy and issuer. Account login still requires a browser test.`);
}
for(let attempt=1;;attempt++) {
  try{await smoke();break;}catch(error){if(attempt===4)throw error;console.log(`Smoke attempt ${attempt} failed: ${error.message}; retrying.`);await new Promise(r=>setTimeout(r,5000));}
}
