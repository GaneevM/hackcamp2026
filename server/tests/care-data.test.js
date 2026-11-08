import test from 'node:test';import assert from 'node:assert/strict';
import {filterHistory,historySummary,angleSeries,sessionCsv,escapeText} from '../../care-data.js';
const now=Date.parse('2026-11-08T12:00:00Z');
const row=(id,overrides={})=>({id,date:new Date(now-864e5).toISOString(),movement:'elbow',side:'left',exercise:'Elbow bend',reps:4,angle:90,manual:false,pain:null,confidence:null,note:'',...overrides});
test('history counts saved practice separately from check-ins, wave demos and future entries',()=>{const rows=[row('a'),row('b',{manual:true,angle:null,reps:2}),row('c',{checkin:true,reps:null,pain:0}),row('d',{movement:'wave',demo:true}),row('e',{date:new Date(now+864e5).toISOString()})];const summary=historySummary(rows,now);assert.equal(summary.sessions.length,2);assert.equal(summary.reps,6);assert.equal(summary.latestCheckin.pain,0);assert.equal(summary.practiceDays,1);assert.equal(filterHistory(rows,{movement:'elbow',side:'right',now}).length,0);});
test('angle trends exclude manual values and never combine exercise or side conventions',()=>{assert.equal(angleSeries([row('a'),row('b',{manual:true,angle:120})]).length,1);assert.deepEqual(angleSeries([row('a'),row('b',{side:'right'})]),[]);assert.deepEqual(angleSeries([row('a'),row('b',{movement:'reach'})]),[]);});
test('exports preserve missing values and escape CSV formulas, quotes, and HTML',()=>{const text=sessionCsv([row('a',{manual:true,angle:100,note:'=HYPERLINK("test")'})]);assert.ok(text.includes("'=HYPERLINK"));assert.ok(text.includes('""test""'));assert.ok(!text.includes('"100"'));assert.equal(escapeText('<script>"&'), '&lt;script&gt;&quot;&amp;');});

test('a note-only check-in does not erase the latest reported pain rating of zero',()=>{
 const rows=[row('rated',{checkin:true,pain:0,reps:null}),row('note',{date:new Date(now-1000).toISOString(),checkin:true,reps:null,pain:null,note:'A note only'})];
 assert.equal(historySummary(rows,now).latestPain,0);
});
