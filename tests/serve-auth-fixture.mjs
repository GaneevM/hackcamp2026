// Local browser fixture only; never included in the deployment manifest.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const sdk=`window.auth0={Auth0Client:class {
 async checkSession(){} async isAuthenticated(){return new URLSearchParams(location.search).get('fixture')==='signedin'}
 async getUser(){return {sub:'auth0|fixture',name:'Preview User',email_verified:true}}
 async loginWithRedirect(){throw new Error('Fixture redirect failed')}
 async logout(){location.assign('/?fixture=signedout')}
}};`;
http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  if(file.endsWith('auth0-spa-js-2.4.1.min.js')){res.setHeader('Content-Type','application/javascript');return res.end(sdk);}
  res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':/\.m?js$/.test(file)?'application/javascript':'application/octet-stream');
  res.end(await fs.readFile(file));
 }catch {res.writeHead(404);res.end();}
}).listen(4183,'127.0.0.1',()=>console.log('Auth fixture at http://127.0.0.1:4183 (synthetic identity; not a real Auth0 login)'));
