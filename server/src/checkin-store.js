import {Router} from 'express';
import {z} from 'zod';
import {journalScopeSchema} from './journal-store.js';
const schema=z.object({scope:journalScopeSchema,checkin:z.object({
 id:z.string().min(1).max(100),date:z.string().datetime(),exercise:z.literal('Check-in'),
 reps:z.null(),duration:z.literal(0),angle:z.null(),movement:z.null(),side:z.null(),
 confidence:z.number().int().min(1).max(5).nullable(),pain:z.number().int().min(0).max(10).nullable(),
 note:z.string().trim().max(2000),checkin:z.literal(true)
}).strict().refine(row=>row.pain!==null||row.confidence!==null||row.note.length>0,'Add a rating or note.')}).strict();
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
