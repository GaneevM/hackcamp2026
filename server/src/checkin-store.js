import {Router} from 'express';
import {z} from 'zod';
import {journalScopeSchema} from './journal-store.js';
import {checkinSchema as schema} from './checkin-validation.js';
export function createCheckinRouter(db){
 const router=Router();
 db.exec('CREATE TABLE IF NOT EXISTS journal_checkins(scope TEXT NOT NULL,id TEXT NOT NULL,record_json TEXT NOT NULL,PRIMARY KEY(scope,id))');
 router.post('/',(req,res)=>{
  const result=schema.safeParse(req.body);if(!result.success)return res.status(400).json({error:'Add a valid rating or note.'});
  const {scope,checkin}=result.data, json=JSON.stringify(checkin);
  const old=db.prepare('SELECT record_json FROM journal_checkins WHERE scope=? AND id=?').get(scope,checkin.id);
  if(old&&old.record_json!==json)return res.status(409).json({error:'This check-in already contains different information.'});
  db.prepare('INSERT OR IGNORE INTO journal_checkins VALUES(?,?,?)').run(scope,checkin.id,json);res.json({checkin});
 });
 router.get('/',(req,res)=>{const scope=journalScopeSchema.safeParse(req.query.scope);if(!scope.success)return res.status(400).json({error:'A valid profile is required.'});res.json({checkins:db.prepare('SELECT record_json FROM journal_checkins WHERE scope=? ORDER BY id DESC LIMIT 200').all(scope.data).map(r=>JSON.parse(r.record_json))});});
 return router;
}
