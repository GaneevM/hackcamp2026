export const escapeText = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const dateKey = value => {const d=new Date(value);return Number.isFinite(+d)?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';};
export const practiceRows = rows => rows.filter(r=>!r.checkin&&!r.demo&&Number.isFinite(r.reps)).sort((a,b)=>new Date(a.date)-new Date(b.date));
export function filterHistory(rows,{movement='all',side='all',days=0,now=Date.now()}={}){
 return practiceRows(rows).filter(r=>{const t=+new Date(r.date);return Number.isFinite(t)&&t<=now&&(!days||t>=now-days*864e5)&&(movement==='all'||r.movement===movement)&&(side==='all'||r.side===side);});
}
export function historySummary(rows,now=Date.now()){
 const sessions=filterHistory(rows,{now}),week=filterHistory(rows,{days:7,now});
 const checkins=rows.filter(r=>r.checkin&&Number.isFinite(+new Date(r.date))).sort((a,b)=>new Date(a.date)-new Date(b.date));
 return {sessions,week,reps:sessions.reduce((sum,r)=>sum+r.reps,0),practiceDays:new Set(week.map(r=>dateKey(r.date))).size,latest:sessions.at(-1)||null,latestCheckin:checkins.at(-1)||null,latestPain:rows.filter(r=>Number.isFinite(r.pain)&&Number.isFinite(+new Date(r.date))&&+new Date(r.date)<=now).sort((a,b)=>new Date(a.date)-new Date(b.date)).at(-1)?.pain??null};
}
export function sessionCsv(rows){
 const fields=['Date','Exercise','Side','Source','Reps','Estimated peak angle (deg)','Pain (user reported)','Confidence (user reported)','Note'];
 const cell=v=>'"'+(typeof v==='string'&&/^[=+\-@\t\r]/.test(v)?"'":'')+String(v??'').replace(/"/g,'""')+'"';
 return [fields,...practiceRows(rows).map(r=>[r.date,r.exercise,r.side,r.manual?'manual':'camera',r.reps,r.manual?null:r.angle,r.pain,r.confidence,r.note])].map(row=>row.map(cell).join(',')).join('\r\n');
}
export function angleSeries(rows){
 const measured=rows.filter(r=>!r.manual&&Number.isFinite(r.angle));
 const groups=new Set(measured.map(r=>r.movement+':'+r.side+':'+(r.variant||'')));
 if(groups.size>1)return [];
 return measured.sort((a,b)=>new Date(a.date)-new Date(b.date));
}
