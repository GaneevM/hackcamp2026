export const decodeSession=row=>row?{scope:row.scope,session:JSON.parse(row.session_json),metrics:JSON.parse(row.metrics_json),userReportedContext:JSON.parse(row.context_json),savedAt:row.created_at}:null;
export const decodeInsight=row=>({id:row.id,kind:row.kind,model:row.model,createdAt:row.created_at,sessionIds:JSON.parse(row.session_ids),sharedData:JSON.parse(row.payload_json),content:JSON.parse(row.content_json)});
export const fault=(status,message)=>Object.assign(new Error(message),{status});
export function createD1Store(db){
 const sql=(query,...args)=>db.prepare(query).bind(...args);
 const get=async(scope,id)=>decodeSession(await sql('SELECT * FROM journal_sessions WHERE scope=? AND session_id=?',scope,id).first());
 return {
  sql,get,
  async list(scope){return (await sql('SELECT * FROM journal_sessions WHERE scope=? ORDER BY created_at DESC, session_id ASC LIMIT 100',scope).all()).results.map(decodeSession);},
  async save({scope,session,metrics}){
   await sql('INSERT OR IGNORE INTO journal_sessions(scope,session_id,session_json,metrics_json,created_at) VALUES(?,?,?,?,?)',scope,session.id,JSON.stringify(session),JSON.stringify(metrics),new Date().toISOString()).run();
   const row=await get(scope,session.id);
   if(JSON.stringify(row.session)!==JSON.stringify(session)||JSON.stringify(row.metrics)!==JSON.stringify(metrics))throw fault(409,'This session already contains different measurements.');
   return row;
  },
  async answer(scope,id,answer){
   const context=JSON.stringify({id:crypto.randomUUID(),source:'user_reported',answer,answeredAt:new Date().toISOString()});
   await sql("UPDATE journal_sessions SET context_json=json_insert(context_json,'$[#]',json(?)) WHERE scope=? AND session_id=? AND NOT EXISTS(SELECT 1 FROM json_each(context_json) WHERE json_extract(value,'$.answer')=?)",context,scope,id,answer).run();
   return get(scope,id);
  },
  async clear(scope){
   await db.batch([
    sql('INSERT INTO journal_epochs(scope,epoch) VALUES(?,1) ON CONFLICT(scope) DO UPDATE SET epoch=epoch+1',scope),
    ...['journal_sessions','journal_checkins','journal_insights'].map(table=>sql('DELETE FROM '+table+' WHERE scope=?',scope))
   ]);
  },
  async epoch(scope){return (await sql('SELECT epoch FROM journal_epochs WHERE scope=?',scope).first())?.epoch||0;},
  async checkins(scope){return (await sql('SELECT record_json FROM journal_checkins WHERE scope=? ORDER BY id DESC LIMIT 200',scope).all()).results.map(row=>JSON.parse(row.record_json));},
  async checkin(scope,row){
   const value=JSON.stringify(row);await sql('INSERT OR IGNORE INTO journal_checkins VALUES(?,?,?)',scope,row.id,value).run();
   const saved=await sql('SELECT record_json FROM journal_checkins WHERE scope=? AND id=?',scope,row.id).first();
   if(saved.record_json!==value)throw fault(409,'This check-in already contains different information.');return {checkin:JSON.parse(saved.record_json)};
  },
  async history(scope){return (await sql('SELECT * FROM journal_insights WHERE scope=? ORDER BY created_at DESC LIMIT 50',scope).all()).results.map(decodeInsight);},
  async cached(scope,key){const row=await sql('SELECT * FROM journal_insights WHERE scope=? AND cache_key=?',scope,key).first();return row?decodeInsight(row):null;},
  async lock(scope,key){return !!await sql('INSERT INTO ai_locks VALUES(?,?,?) ON CONFLICT(scope,cache_key) DO UPDATE SET expires_at=excluded.expires_at WHERE expires_at<? RETURNING cache_key',scope,key,Date.now()+90000,Date.now()).first();},
  async unlock(scope,key){await sql('DELETE FROM ai_locks WHERE scope=? AND cache_key=?',scope,key).run();},
  async allowance(scope){
   const day=new Date().toISOString().slice(0,10);
   // Global and per-account caps persist across requests and Worker restarts. No automatic paid fallback.
   const reserve=(key,limit)=>sql('INSERT INTO demo_usage VALUES(?,?,1) ON CONFLICT(day,scope) DO UPDATE SET count=count+1 WHERE count<? RETURNING count',day,key,limit);
   const result=await db.batch([reserve(scope,10),reserve('*',50)]);
   if(result.some(row=>!row.results?.length))throw fault(429,'The free demo AI allowance has been reached for this day. Saved reports and tracking remain available.');
   await sql('DELETE FROM demo_usage WHERE day<?',new Date(Date.now()-3*86400000).toISOString().slice(0,10)).run();
  },
  async saveInsight(scope,key,kind,data,result,epoch){
   const id=crypto.randomUUID(),createdAt=new Date().toISOString();
   const saved=await sql('INSERT OR IGNORE INTO journal_insights SELECT ?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT epoch FROM journal_epochs WHERE scope=?),0)=? RETURNING id',id,scope,kind,key,JSON.stringify(data.sessionIds),JSON.stringify(data.payload),JSON.stringify(result.content),result.model,createdAt,scope,epoch).first();
   if(!saved){const existing=await this.cached(scope,key);if(existing)return existing;throw fault(409,'Source history was cleared. This generated result was discarded.');}
   return {id,kind,model:result.model,createdAt,sessionIds:data.sessionIds,sharedData:data.payload,content:result.content};
  }
 };
}
