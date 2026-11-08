import {z} from 'zod';
import {journalScopeSchema} from './journal-validation.js';
export const checkinSchema=z.object({scope:journalScopeSchema,checkin:z.object({
 id:z.string().min(1).max(100),date:z.string().datetime(),exercise:z.literal('Check-in'),
 reps:z.null(),duration:z.literal(0),angle:z.null(),movement:z.null(),side:z.null(),
 confidence:z.number().int().min(1).max(5).nullable(),pain:z.number().int().min(0).max(10).nullable(),
 note:z.string().trim().max(2000),checkin:z.literal(true)
}).strict().refine(row=>row.pain!==null||row.confidence!==null||row.note.length>0,'Add a rating or note.')}).strict();
