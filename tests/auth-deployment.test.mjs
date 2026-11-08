import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {AuthSession,validateAuthConfig,safeReturnTo,cleanCallbackUrl,loadAuthSdk} from '../auth-flow.mjs';
import {resolveConfig,requireCredentials,build} from '../scripts/build.mjs';
const origin='https://steep-bush-dac6.smganeev.workers.dev';
const config={domain:'dev-nq4wzkj35d08hmds.us.auth0.com',clientId:'kgZffBxFat1RgVYqMWY6Rgww7OiShO61'};
function setup({user=null,callbackError=null,sessionError=null,returnTo='/#progress'}={}) {
  const calls=[];
  class Client {
    constructor(options){calls.push(['options',options]);}
    async checkSession(){if(sessionError)throw sessionError;}
    async handleRedirectCallback(){if(callbackError)throw callbackError;return {appState:{returnTo}};}
    async isAuthenticated(){return !!user;}
    async getUser(){return user;}
    async loginWithRedirect(options){calls.push(['login',options]);}
    async logout(options){calls.push(['logout',options]);user=null;}
  }
  return {session:new AuthSession({config,origin,sdk:{Auth0Client:Client}}),calls};
}
test('new visitor remains unauthenticated; Google, email and signup use Universal Login',async()=>{
  const {session,calls}=setup();assert.equal((await session.initialize(origin)).user,null);
  await session.login('google',origin+'/?movement=pushup#move');
  await session.login('email',origin);await session.login('signup',origin);
  const logins=calls.filter(x=>x[0]==='login').map(x=>x[1]);
  assert.equal(logins[0].authorizationParams.connection,'google-oauth2');
  assert.equal(logins[0].appState.returnTo,'/?movement=pushup#move');
  assert.equal(logins[1].authorizationParams.screen_hint,'login');
  assert.equal(logins[2].authorizationParams.screen_hint,'signup');
  assert.equal(calls[0][1].authorizationParams.redirect_uri,origin);
  assert.equal(calls[0][1].cacheLocation,'localstorage');
});
test('callback restores a safe route; cached authentication survives a new controller',async()=>{
  const user={sub:'auth0|test',name:'Test'};
  const {session}=setup({user});const result=await session.initialize(origin+'/?code=c&state=s');
  assert.equal(result.returnTo,'/#progress');assert.equal(result.user.sub,user.sub);
  assert.equal((await setup({user}).session.initialize(origin)).user.sub,user.sub);
});
test('denied/stale callbacks clear parameters and allow retry',async()=>{
  const {session,calls}=setup({callbackError:{error:'access_denied'}});
  const result=await session.initialize(origin+'/?error=access_denied&state=s&movement=pushup#move');
  assert.match(result.error,/cancelled/);assert.equal(result.returnTo,'/?movement=pushup#move');
  await session.login('email',origin);assert.equal(calls.at(-1)[0],'login');
});
test('silent-session failure does not block interactive login; logout uses allowed origin',async()=>{
  const {session,calls}=setup({sessionError:new Error('network')});
  assert.ok((await session.initialize(origin)).error);await session.login('google',origin);
  await session.logout();assert.equal(calls.at(-1)[1].logoutParams.returnTo,origin);
});
test('external callback destinations and invalid config are rejected',()=>{
  for(const value of ['https://evil.test','//evil.test','/\\evil.test','/\nevil'])assert.equal(safeReturnTo(value,origin),null);
  assert.equal(cleanCallbackUrl(origin+'/?code=c&state=s&keep=1#move'),'/?keep=1#move');
  assert.throws(()=>validateAuthConfig({domain:'',clientId:''}));
});
test('SDK load failure is retryable',async()=>{
  const scripts=[],window={};const document={createElement:()=>({remove(){}}),head:{append:s=>scripts.push(s)}};
  const first=loadAuthSdk(document,window,500);scripts[0].onerror();await assert.rejects(first,/could not load/);
  const retry=loadAuthSdk(document,window,500);window.auth0={Auth0Client:class{}};scripts[1].onload();assert.equal(await retry,window.auth0);
});
test('public variables override committed config without blanking defaults',()=>{
  const text=fs.readFileSync('auth0-config.js','utf8');
  assert.deepEqual(resolveConfig(text,{}),config);
  assert.deepEqual(resolveConfig(text,{AUTH0_DOMAIN:' ',AUTH0_CLIENT_ID:''}),config);
  assert.equal(resolveConfig(text,{AUTH0_DOMAIN:'custom.example.com'}).domain,'custom.example.com');
  assert.throws(()=>resolveConfig('window.FORMNOTE_AUTH0_CONFIG={domain:"",clientId:""}'));
});
test('missing credentials fail without exposing credential values',()=>{
  assert.throws(()=>requireCredentials({}),/CLOUDFLARE_ACCOUNT_ID.*CLOUDFLARE_API_TOKEN/);
  assert.throws(()=>requireCredentials({CLOUDFLARE_API_TOKEN:'never-log-me'}),error=>!error.message.includes('never-log-me'));
  assert.doesNotThrow(()=>requireCredentials({CLOUDFLARE_API_TOKEN:'token',CLOUDFLARE_ACCOUNT_ID:'account'}));
});
test('build includes transitive modules, pinned SDK, release and hashed entrypoints',()=>{
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync('vendor/auth0-spa-js-2.4.1.min.js')).digest('hex'),'f9d838d542605372ac9ffc47c5c5bfc9b9445b8eceb14cc1e4dfe77a88118b45');
  const release=build(process.cwd(),{GITHUB_SHA:'test-sha'});
  for(const file of ['pushup.mjs','auth-flow.mjs','companion.js','care-pages.js','vendor/auth0-spa-js-2.4.1.min.js'])assert.ok(release.assets[file],file);
  const html=fs.readFileSync('dist/index.html','utf8');assert.match(html,/auth0-config.js\?v=[a-f0-9]{16}/);assert.match(html,/app.js\?v=[a-f0-9]{16}/);
  assert.ok(!html.includes('cdn.auth0.com'));assert.match(html,/<html[^>]+auth-enabled/);
  assert.equal(release.commit,'test-sha');assert.deepEqual(release.auth,config);
});
test('authentication never clears the local session or media stores',()=>{
  const text=fs.readFileSync('auth-flow.mjs','utf8');assert.doesNotMatch(text,/localStorage\.(clear|removeItem)|deleteDatabase/);
  const app=fs.readFileSync('app.js','utf8');const flow=app.slice(app.indexOf('let authSession ='),app.indexOf('companion = createCompanion'));
  assert.doesNotMatch(flow,/saveSessions\(\[\]|localStorage\.(clear|removeItem)|deleteDatabase/);
});
