export function validateAuthConfig(config) {
  if (!config || !/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(config.domain || '') || !/^[a-z0-9_-]{8,}$/i.test(config.clientId || '')) {
    throw new Error('Sign-in configuration is missing or invalid. Set AUTH0_DOMAIN and AUTH0_CLIENT_ID, then redeploy.');
  }
  if(config.audience && (typeof config.audience!=='string'||!/^https:\/\//.test(config.audience)))throw new Error('Invalid API audience.');
  return {domain:config.domain,clientId:config.clientId,...(config.audience?{audience:config.audience}:{})};
}
export function safeReturnTo(value, origin) {
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\r\n]/.test(value))return null;
  try {const url=new URL(value,origin);return url.origin===origin?url.pathname+url.search+url.hash:null;}catch{return null;}
}
export function cleanCallbackUrl(url) {
  const clean=new URL(url);
  for(const key of ['code','state','error','error_description','error_uri','session_state','iss'])clean.searchParams.delete(key);
  return clean.pathname+clean.search+clean.hash;
}
export function friendlyAuthError(error) {
  const code=error?.error||error?.code;
  if(code==='access_denied')return 'Sign-in was cancelled or denied. You can try another method.';
  if(code==='invalid_state'||/state/i.test(error?.message||''))return 'This sign-in link expired or was already used. Start sign-in again.';
  if(code==='unauthorized_client'||code==='invalid_request')return 'Auth0 could not start sign-in. Check this application’s callback URL and enabled connections.';
  return 'Sign-in could not finish. Check your connection and try again.';
}
export class AuthSession {
  constructor({config,origin,sdk}) {
    const valid=validateAuthConfig(config);this.origin=origin;this.config=valid;
    this.client=new sdk.Auth0Client({...valid,cacheLocation:'localstorage',authorizationParams:{redirect_uri:origin,scope:'openid profile email',...(valid.audience?{audience:valid.audience}:{})}});
  }
  async initialize(url) {
    const params=new URL(url).searchParams;let error=null,returnTo=cleanCallbackUrl(url);
    if(params.has('code')||params.has('error')) {
      try {const result=await this.client.handleRedirectCallback(url);returnTo=safeReturnTo(result?.appState?.returnTo,this.origin)||returnTo;}
      catch(cause){error=friendlyAuthError(cause);}
    } else {
      try {await this.client.checkSession();}
      catch(cause){if(!['login_required','consent_required','interaction_required'].includes(cause?.error))error=friendlyAuthError(cause);}
    }
    const user=await this.client.isAuthenticated()?await this.client.getUser():null;
    if(user && !user.sub)throw new Error('Auth0 returned an incomplete profile. Try signing in again.');
    return {user,error,returnTo};
  }
  login(method,url) {
    const authorizationParams=method==='google'?{connection:'google-oauth2'}:method==='signup'?{screen_hint:'signup'}:{screen_hint:'login'};
    const current=new URL(url);
    return this.client.loginWithRedirect({authorizationParams,appState:{returnTo:safeReturnTo(cleanCallbackUrl(current.href),this.origin)||'/#home'}});
  }
  logout(){return this.client.logout({logoutParams:{returnTo:this.origin}});}
}

let sdkLoading;
export function loadAuthSdk(document,window,timeout=12000) {
  if(window.auth0?.Auth0Client)return Promise.resolve(window.auth0);
  if(sdkLoading)return sdkLoading;
  sdkLoading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='./vendor/auth0-spa-js-2.4.1.min.js';script.async=true;
    const fail=()=>{clearTimeout(timer);script.remove();sdkLoading=null;reject(new Error('Sign-in library could not load. Check your connection, then choose Try again.'));};
    const timer=setTimeout(fail,timeout);
    script.onerror=fail;script.onload=()=>{clearTimeout(timer);if(window.auth0?.Auth0Client)resolve(window.auth0);else fail();};
    document.head.append(script);
  });
  return sdkLoading;
}
