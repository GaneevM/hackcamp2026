import {escapeText as esc, dateKey, practiceRows, filterHistory, historySummary, sessionCsv, angleSeries} from './care-data.js';
const $=id=>document.getElementById(id);
const date=value=>new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const number=value=>value===null||value===undefined?'—':String(value);
const labels={sit:'Sit-to-stand',reach:'Overhead reach',elbow:'Elbow bend'};
const badge=(text,kind='')=>`<span class="care-badge ${kind}">${esc(text)}</span>`;
const stat=(value,label,detail='')=>`<article class="care-stat"><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(detail)}</small></article>`;

export function createCarePages(options){
 let scope=options.getScope(), records=[],insights=[],selected=new Set(), selectionTouched=false, busy=false, preview=null, current=null, loadVersion=0;
 let filter={movement:'all',side:'all',days:30};
 const home=$('screen-home'),checkin=$('screen-checkin'),progress=$('screen-progress'),visit=$('screen-visit');
 home.classList.add('care-home');checkin.classList.add('care-checkin');progress.classList.add('care-progress');visit.classList.add('care-visit');
 const existingHero=home.querySelector('.home-focus');existingHero.classList.add('care-hero');
 existingHero.classList.add('care-choice-hero');
 if(!existingHero.querySelector('.home-focus-copy')) existingHero.innerHTML = '<div class="home-choice-copy"><span class="home-kicker">YOUR PRACTICE · YOUR CHOICE</span><h2 id="homeExercise">Choose your movement.</h2><p id="homePlanCopy">Pick the exercise from your own care plan.</p><div class="home-movement-choices"><button type="button" data-home-movement="sit"><span aria-hidden="true">↕</span><strong>Sit-to-stand</strong><small>Knee movement</small></button><button type="button" data-home-movement="reach"><span aria-hidden="true">↗</span><strong>Overhead reach</strong><small>Shoulder movement</small></button><button type="button" data-home-movement="elbow"><span aria-hidden="true">⌁</span><strong>Elbow bend</strong><small>Elbow movement</small></button></div><p class="home-choice-note">Choose a movement to open its camera setup. Nothing starts automatically.</p></div>';
 existingHero.querySelectorAll('[data-home-movement]').forEach(button=>button.onclick=()=>options.chooseMovement(button.dataset.homeMovement));
 const homeStats=document.createElement('div');homeStats.className='care-stats';homeStats.id='careHomeStats';existingHero.after(homeStats);
 const homeRecent=document.createElement('section');homeRecent.className='card care-panel';homeRecent.id='careHomeRecent';home.append(homeRecent);
 const checkinIntro=document.createElement('section');checkinIntro.className='care-intro';checkinIntro.innerHTML='<span class="care-kicker">A small pause for you</span><h2>Numbers tell part of the story.<br>How you feel matters, too.</h2><p>Answer what feels useful. Nothing is sent to Gemini or your physiotherapist when you save a check-in.</p>';
 $('checkin').before(checkinIntro);
 $('checkin').querySelector('.checkin-intro').textContent='All fields are optional. Save at least one rating or note.';
 $('saveCheckin').textContent='Save my check-in';
 $('note').maxLength=2000;
 const checkinHistory=document.createElement('section');checkinHistory.className='card care-panel';checkinHistory.id='careCheckinHistory';checkin.append(checkinHistory);
 const resetCheckin=document.createElement('button');resetCheckin.className='quiet';resetCheckin.type='button';resetCheckin.textContent='Clear answers';$('saveCheckin').after(resetCheckin);resetCheckin.onclick=options.clearCheckin;

 // Preserve existing data tools and their handlers, but replace the progress presentation.
 $('progress').hidden=true; $('recentSessions').hidden=true;
 const historyPanel=document.createElement('section');historyPanel.className='card care-panel';historyPanel.id='careHistoryPanel';
 historyPanel.innerHTML=`<div class="care-section-head"><div><span class="care-kicker">Your history, in perspective</span><h2>Keep track of showing up.</h2></div><button type="button" class="secondary" id="careExport">Export CSV</button></div>
 <div class="care-filters"><label>Exercise<select id="careExercise"><option value="all">All exercises · repetitions</option><option value="sit">Sit-to-stand</option><option value="reach">Overhead reach</option><option value="elbow">Elbow bend</option></select></label><label>Body side<select id="careSide"><option value="all">Both sides</option><option value="left">Left</option><option value="right">Right</option></select></label><label>Period<select id="carePeriod"><option value="7">Past 7 days</option><option value="30" selected>Past 30 days</option><option value="0">All history</option></select></label></div>
 <div class="care-stats" id="careProgressStats"></div><div id="careChart"></div><p class="care-muted">Counts describe recorded practice. Camera angles are estimates; changes do not establish recovery.</p><div id="careHistory"></div>`;
 progress.querySelector('.screen-heading').after(historyPanel);
 const support=document.createElement('details');support.className='card care-panel care-support';support.innerHTML='<summary>My plan, documents & session photos</summary>';const tools=progress.querySelector('.progress-tools');if(tools){support.append(tools);progress.append(support);}
 const deleteAction=$('clearHistory');deleteAction.textContent='Clear sessions, check-ins & AI drafts';deleteAction.className='quiet';progress.append(deleteAction);
 $('careExercise').onchange=()=>{filter.movement=$('careExercise').value;renderProgress();};
 $('careSide').onchange=()=>{filter.side=$('careSide').value;renderProgress();};
 $('carePeriod').onchange=()=>{filter.days=Number($('carePeriod').value);renderProgress();};
 $('careExport').onclick=()=>download('formnote-session-history.csv',sessionCsv(filterHistory(options.getRows(),filter)),'text/csv;charset=utf-8');

 $('visit-note').hidden=true;
 const visitPanel=document.createElement('section');visitPanel.className='care-visit-layout';visitPanel.innerHTML=`
 <section class="card care-panel care-selection"><span class="care-kicker">1 · Choose the story</span><h2>Sessions for this visit</h2><p class="care-muted">Select up to 10 sessions. Your local note works without AI.</p><div id="careSelections"></div><p id="careSelectionStatus" role="status"></p>
 <section class="care-ai-sharing" aria-labelledby="careAiTitle">
   <div class="gemini-intro"><div><span class="gemini-brand"><span aria-hidden="true">✦</span> Powered by Gemini</span><h2 id="careAiTitle">Your movement tells a story.<br>Make sense of it with Gemini.</h2><p>Turn your session statistics and your own perspective into a clearer conversation with your physiotherapist.</p></div><button type="button" class="primary" id="careReviewSharing">Review data &amp; begin <span aria-hidden="true">→</span></button></div>
   <ol class="gemini-steps"><li><span>1</span><div><strong>Choose your sessions</strong><small>Select the practice you want to review below.</small></div></li><li><span>2</span><div><strong>Add your perspective</strong><small>Ask a follow-up and explain what happened.</small></div></li><li><span>3</span><div><strong>Create your visit note</strong><small>Get a draft you can review, print, and share.</small></div></li></ol>
   <div class="gemini-sharing-options"><label class="care-check"><input type="checkbox" id="careIncludeContext">Include selected sessions’ demo notes, ratings, and explanations.</label><details><summary>Privacy &amp; how it works</summary><p>This non-clinical hackathon demo uses the actual statistics from your camera or manual logs. Video, images, account identifiers and uploaded documents are excluded. Only use fictional, non-confidential demo notes. Requests use Gemini quota; identical requests reuse saved results. You review and approve the exact payload before anything is sent. Choose one session to ask a follow-up, or up to ten for a report.</p></details></div>
   <div id="careSharePreview" hidden><h3>Review the exact data to share</h3><pre id="carePayload"></pre><label class="care-check"><input type="checkbox" id="careConsent">I agree to send exactly these non-clinical hackathon demo data to Google Gemini.</label><div class="care-actions"><button type="button" class="secondary" id="careAsk">Ask a follow-up</button><button type="button" class="primary" id="careGenerate">Draft with Gemini</button></div><p class="care-muted">A follow-up needs one selected session. Your original measurements remain unchanged.</p></div><p id="careAiStatus" role="status"></p>
 </section>
 <div id="careQuestion" hidden></div><details class="care-saved"><summary>Saved Gemini drafts & questions</summary><div id="careSavedInsights"></div></details></section>
 <section class="card care-panel care-note-panel"><div class="care-section-head"><div><span class="care-kicker">3 · Review before sharing</span><h2>Your visit note</h2></div>${badge('Private until you share')}</div><div class="care-actions"><button type="button" class="primary" id="carePrint">Print / save PDF</button><button type="button" class="secondary" id="careCopy">Copy note</button><button type="button" class="quiet" id="careLocal">Use local note</button></div><div id="careVisitDocument"></div><p class="care-muted" id="careNoteStatus" role="status"></p></section>`;
 visit.querySelector('.screen-heading').after(visitPanel);
 visitPanel.prepend(visitPanel.querySelector('.care-ai-sharing'));
 $('careIncludeContext').onchange=invalidatePreview;
 $('careReviewSharing').onclick=reviewSharing;
 $('careConsent').onchange=syncActions;
 $('careAsk').onclick=()=>generate('question');$('careGenerate').onclick=()=>generate('report');
 $('careLocal').onclick=()=>{current=null;renderNote();};
 $('carePrint').onclick=()=>{document.body.classList.add('care-print');window.print();};
 window.addEventListener('afterprint',()=>document.body.classList.remove('care-print'));
 $('careCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('careVisitDocument').innerText);$('careNoteStatus').textContent='Note copied. Review it before sharing.';}catch{$('careNoteStatus').textContent='Clipboard is unavailable. Use Print / save PDF instead.';}};

 async function request(path,body){const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(45000)});const type=response.headers.get('content-type')||'';if(!type.includes('json'))throw Error('Start the backend and open localhost:3001 to use saved-session insights.');const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed.');return data;}
 function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function chosen(){return practiceRows(options.getRows()).filter(r=>selected.has(r.id));}
 function invalidatePreview(){preview=null;$('careSharePreview').hidden=true;$('careConsent').checked=false;syncActions();}
 function body(){return {scope:options.getScope(),sessionIds:chosen().map(r=>r.id),includeUserContext:$('careIncludeContext').checked,style:'encouraging'};}
 function syncActions(){const ready=!busy&&preview&&$('careConsent').checked;$('careAsk').disabled=!ready||chosen().length!==1;$('careGenerate').disabled=!ready;$('careReviewSharing').disabled=busy||!chosen().length||chosen().length>10;$('careIncludeContext').disabled=busy;$('careConsent').disabled=busy;$('careSelections').querySelectorAll('input').forEach(input=>input.disabled=busy);}
 function render(){
  const nextScope=options.getScope();if(nextScope!==scope){scope=nextScope;records=[];insights=[];selected.clear();selectionTouched=false;current=null;invalidatePreview();$('careQuestion').hidden=true;}
  renderHome();renderCheckins();renderProgress();renderSelections();renderNote();renderSaved();
 }
 function renderHome(){
  const data=historySummary(options.getRows()),plan=options.getPlan(), target=Number(plan.sessions)||0;
  if(!home.hidden)document.querySelector('.breadcrumb b').textContent='Home';
  home.querySelector('.welcome h1').textContent=options.getName()?`Good to see you, ${options.getName().split(' ')[0]}.`:'Make room for a little movement.';
  home.querySelector('.welcome p').textContent='Your practice, your observations, your next conversation.';
  $('homeExercise').textContent='Choose your movement.';
  $('homePlanCopy').textContent=Number(plan.reps)>0?`Your saved plan: ${plan.reps} reps per session. Choose the movement you want to practise.`:'Choose a movement from your own care plan. There is no exercise selected for you.';
  homeStats.innerHTML=stat(data.week.length,'Sessions · past 7 days',target?`of ${target} in your saved plan`:'No weekly goal entered')+stat(data.practiceDays,'Practice days','in the past 7 days')+stat(data.latestPain??'—','Latest pain rating','self-reported · out of 10');
  const last=data.latest;
  $('careHomeRecent').innerHTML=`<div class="care-section-head"><div><span class="care-kicker">Pick up where you left off</span><h2>${last?'Your last recorded session':'Your story starts here'}</h2></div></div>${last?`<div class="care-latest"><span class="care-latest-count">${last.reps}<small>reps</small></span><div><h3>${esc(last.exercise)}</h3><p>${date(last.date)} · ${esc(last.side)} side · ${last.manual?'manual log':'camera estimates'}</p></div><button type="button" class="secondary" id="careReviewLatest">Review session →</button></div>`:'<p class="care-muted">Try a session, record how it felt, and bring a clearer picture to your next visit. Your journal stays local until you choose to share.</p>'}`;
  if($('careReviewLatest'))$('careReviewLatest').onclick=()=>openVisit(last.id);
  $('planNoticeText').textContent=plan.instructions||'Follow your own care plan. Set your targets in Progress → My plan.';
 }
 function renderCheckins(){const rows=options.getRows().filter(r=>r.checkin).sort((a,b)=>new Date(b.date)-new Date(a.date));$('careCheckinHistory').innerHTML='<span class="care-kicker">In your own words</span><h2>Recent check-ins</h2>'+(rows.length?rows.slice(0,5).map(r=>`<article class="care-checkin-entry"><div><strong>${date(r.date)}</strong>${badge('Self-reported')}</div><p>Pain ${number(r.pain)}/10 · Confidence ${number(r.confidence)}/5</p>${r.note?`<blockquote>${esc(r.note)}</blockquote>`:''}</article>`).join(''):'<p class="care-muted">Your saved check-ins will appear here. Unanswered ratings stay unknown, not zero.</p>');}
 function renderProgress(){
  const rows=filterHistory(options.getRows(),filter), reps=rows.reduce((sum,r)=>sum+r.reps,0),camera=rows.filter(r=>!r.manual);
  $('careProgressStats').innerHTML=stat(rows.length,'Recorded sessions')+stat(reps,'Completed repetitions')+stat(camera.length,'Camera sessions','manual logs stay separate');
  const points=filter.movement!=='all'&&filter.side!=='all'?angleSeries(rows):[];
  if(points.length){const w=720,h=200,left=42,right=700,top=16,bottom=168;const max=Math.max(30,...points.map(p=>p.angle));const x=i=>points.length===1?370:left+i*(right-left)/(points.length-1),y=a=>bottom-(a/max)*(bottom-top);const path=points.map((p,i)=>(i?'L':'M')+x(i)+','+y(p.angle)).join(' ');$('careChart').innerHTML=`<h3>Observed peak angle · ${esc(labels[filter.movement])} · ${esc(filter.side)}</h3><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Estimated peak angle across ${points.length} camera sessions"><path d="M42,16V168H700" fill="none" stroke="#b8cdbf"/><text x="4" y="24">${Math.round(max)}°</text><text x="12" y="170">0°</text><path d="${path}" fill="none" stroke="#17654e" stroke-width="3"/>${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.angle)}" r="5" fill="#17654e"><title>${date(p.date)}: ${p.angle}°</title></circle>`).join('')}</svg><div class="care-chart-dates"><span>${date(points[0].date)}</span><span>${date(points.at(-1).date)}</span></div><p class="care-muted">${points.length===1?'One camera session: no trend yet.':'Compare only with a consistent camera setup. These are recorded estimates, not evidence of recovery.'}</p>`;}
  else $('careChart').innerHTML=`<div class="care-chart-empty"><span aria-hidden="true">⌁</span><h3>${!rows.length?'Nothing recorded in this view yet':filter.movement==='all'||filter.side==='all'?'One exercise. One side. A useful comparison.':'No camera angles in this selection'}</h3><p>${!rows.length?'Change the filters or record your first session.':filter.movement==='all'||filter.side==='all'?'Select a specific exercise and body side above to see estimated angle history.':'Manual logs count toward repetitions but do not provide camera angles.'}</p></div>`;
  $('careHistory').innerHTML=rows.length?`<div class="care-table-wrap"><table class="care-table"><thead><tr><th>Session</th><th>Reps</th><th>Peak estimate</th><th>Source</th><th></th></tr></thead><tbody>${rows.slice().reverse().map(r=>`<tr><td><strong>${esc(r.exercise)}</strong><small>${date(r.date)} · ${esc(r.side)}</small></td><td>${r.reps}</td><td>${!r.manual&&Number.isFinite(r.angle)?r.angle+'°':'—'}</td><td>${badge(r.manual?'Manual':'Camera')}</td><td><button type="button" class="quiet" data-review="${esc(r.id)}">Review</button></td></tr>`).join('')}</tbody></table></div>`:'';
  $('careHistory').querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>openVisit(b.dataset.review));
 }
 function renderSelections(){
  const rows=practiceRows(options.getRows()).reverse();if(!selectionTouched){selected=new Set(rows.slice(0,5).map(r=>r.id));}
  const available=new Set(rows.map(r=>r.id));selected=new Set([...selected].filter(id=>available.has(id)));
  $('careSelections').innerHTML=rows.length?rows.map(r=>`<label class="care-select-session"><input type="checkbox" value="${esc(r.id)}" ${selected.has(r.id)?'checked':''}><span><strong>${esc(r.exercise)}</strong><small>${date(r.date)} · ${r.reps} reps · ${esc(r.side)} · ${r.manual?'manual':'camera'}</small></span></label>`).join(''):'<div class="care-empty"><h3>No saved sessions yet</h3><p>Complete an exercise session to build your visit note.</p><button type="button" class="primary" id="careStartFirst">Start practice</button></div>';
  $('careSelections').querySelectorAll('input').forEach(input=>input.onchange=()=>{selectionTouched=true;if(input.checked)selected.add(input.value);else selected.delete(input.value);current=null;$('careQuestion').hidden=true;invalidatePreview();renderNote();$('careSelectionStatus').textContent=selected.size+' session(s) selected';syncActions();});
  if($('careStartFirst'))$('careStartFirst').onclick=()=>options.navigate('move');
  $('careSelectionStatus').textContent=selected.size+' session(s) selected';syncActions();
 }
 function renderNote(){
  const usingAI=current?.kind==='report';const rows=usingAI?[]:chosen();
  const facts=usingAI?current.sharedData.sessions:rows.map((r,i)=>({sessionNumber:i+1,exercise:r.exercise,side:r.side,source:r.manual?'manual':'camera',recordedDate:dateKey(r.date),completedReps:r.reps,maximumObservedAngleDeg:r.manual?null:r.angle,...(records.find(record=>record.session.id===r.id)?.metrics||{})}));
  const count=facts.reduce((sum,r)=>sum+r.completedReps,0);
  const narrative=usingAI?current.content:null;
  const list=values=>'<ul>'+values.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>';
  const context=usingAI?current.sharedData.sessions.flatMap(r=>r.userReported?[...(r.userReported.sessionNote?[r.userReported.sessionNote]:[]),...r.userReported.explanations].map(answer=>({session:r.sessionNumber,answer})):[]):rows.flatMap((r,i)=>{const record=records.find(x=>x.session.id===r.id);return [...(r.note?[r.note]:[]),...(record?.userReportedContext||[]).map(a=>a.answer)].map(answer=>({session:i+1,answer}));});
  $('careVisitDocument').innerHTML=`<header class="care-document-heading"><span class="care-kicker">FORMNOTE · VISIT PREPARATION</span><h2>A clearer conversation.</h2><p>${usingAI?'Gemini draft · patient review required':'Local factual summary · no AI request'} · ${date(usingAI?current.createdAt:new Date())}</p>${usingAI?badge('Snapshot · '+current.model):badge('Live local note')}</header><div class="care-note-totals"><strong>${facts.length} sessions</strong><strong>${count} recorded reps</strong></div>${!facts.length?'<p class="care-empty">Choose sessions to prepare your note.</p>':`<h3>Recorded observations</h3><div class="care-table-wrap"><table class="care-table"><thead><tr><th>Exercise / date</th><th>Side</th><th>Reps</th><th>Peak estimate</th></tr></thead><tbody>${facts.map(r=>`<tr><td>${esc(r.exercise)}<small>${esc(r.recordedDate)} · ${esc(r.source)}</small></td><td>${esc(r.side)}</td><td>${r.completedReps}</td><td>${number(r.maximumObservedAngleDeg)}${r.maximumObservedAngleDeg!==null?'°':''}</td></tr>`).join('')}</tbody></table></div>`}
  ${narrative?`<h3>Gemini summary</h3><p>${esc(narrative.summary)}</p><h3>Observations</h3>${list(narrative.observations)}`:''}
  ${renderMeasurementDetails(facts)}<h3>User-reported context</h3>${context.length?context.map(c=>`<blockquote><small>Session ${c.session} · user reported</small>${esc(c.answer)}</blockquote>`).join(''):'<p>No explanations included.</p>'}
  ${!usingAI?renderRatings(rows):''}
  <h3>Measurement limitations</h3>${list(narrative?.limitations||['Camera angles are estimates, not clinically validated measurements.','Observed peaks are not sustained holds. Tracking quality and setup affect comparability.','Manual logs do not contain camera measurements. No diagnosis or recovery assessment is made.'])}
  ${narrative?.questionsForReview.length?`<h3>Questions for your physiotherapist</h3>${list(narrative.questionsForReview)}`:''}<footer class="care-note-footer">Review the measurements, wording, and personal notes before sharing. This app does not send this note to anyone automatically.</footer>`;
  $('careNoteStatus').textContent=usingAI?'Saved snapshot. New notes do not change this draft; review sharing again to make an updated one.':'Local note updates with your selection. Use optional Gemini assistance to create a saved AI draft.';
 }
 function renderMeasurementDetails(facts){return facts.length?'<details class="care-measurements"><summary>Tracking quality & measurement details</summary>'+facts.map((r,i)=>'<p><strong>Session '+(i+1)+'</strong><br>'+(r.source==='manual'?'Manual log: no camera measurements.':'Valid tracking: '+(r.trackingValidFraction==null?'unknown':Math.round(r.trackingValidFraction*100)+'%')+' · tracking interruptions: '+number(r.trackingLossEvents)+' · incomplete cycles: '+number(r.incompleteCycles)+'<br>Observed angle range: '+number(r.minimumObservedAngleDeg)+'–'+number(r.maximumObservedAngleDeg)+'° · median completion interval: '+number(r.medianCompletionIntervalSeconds)+' s (includes pauses)')+'</p>').join('')+'</details>':'';}
 function renderRatings(rows){const rated=rows.filter(r=>r.pain!==null||r.confidence!==null);const checks=options.getRows().filter(r=>r.checkin).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3);return '<h3>Self-reported ratings</h3>'+(rated.length||checks.length?'<ul>'+[...rated,...checks].map(r=>`<li>${date(r.date)} · ${r.checkin?'Check-in':esc(r.exercise)}: pain ${number(r.pain)}/10, confidence ${number(r.confidence)}/5${r.checkin&&r.note?' · '+esc(r.note):''}</li>`).join('')+'</ul>':'<p>No ratings recorded for this selection.</p>');}
 function renderSaved(){$('careSavedInsights').innerHTML=insights.length?insights.map(r=>`<button type="button" class="care-saved-item" data-insight="${esc(r.id)}"><strong>${r.kind==='report'?'Visit draft':'Follow-up question'}</strong><span>${date(r.createdAt)} · ${r.sessionIds.length} session(s)</span></button>`).join(''):'<p class="care-muted">Generated drafts and questions will be saved here.</p>';$('careSavedInsights').querySelectorAll('[data-insight]').forEach(button=>button.onclick=()=>{const saved=insights.find(r=>r.id===button.dataset.insight);if(saved.kind==='report'){current=saved;renderNote();}else showQuestion(saved);});}
 async function reviewSharing(){
  if(busy)return;busy=true;const version=loadVersion;syncActions();$('careAiStatus').textContent='Preparing the exact sharing preview…';
  try{const result=await request('/api/journal/ai/preview',body());if(version!==loadVersion)return;preview=result;$('carePayload').textContent=JSON.stringify(result.sharedData,null,2);$('careConsent').checked=false;$('careSharePreview').hidden=false;$('careSharePreview').scrollIntoView({behavior:'smooth',block:'start'});$('careAiStatus').textContent='Nothing has been sent to Gemini. Review these data, then choose whether to share.';}catch(error){$('careAiStatus').textContent=error.message;}finally{busy=false;syncActions();}
 }
 async function generate(kind){
  if(busy||!preview||!$('careConsent').checked)return;busy=true;const version=loadVersion;syncActions();$('careAiStatus').textContent=kind==='question'?'Asking Gemini about the selected session…':'Drafting your visit note with Gemini…';
  try{const result=await request('/api/journal/ai/'+kind,{...body(),consent:true,previewToken:preview.previewToken});if(version!==loadVersion)return;insights=[result,...insights.filter(r=>r.id!==result.id)];if(kind==='report'){current=result;renderNote();$('careVisitDocument').scrollIntoView({behavior:'smooth',block:'start'});}else showQuestion(result);renderSaved();$('careAiStatus').textContent=result.cached?'Opened the saved result. No new generation request.':'Gemini result saved. Review the wording and facts.';}catch(error){if(version===loadVersion)$('careAiStatus').textContent=error.message;}finally{busy=false;syncActions();}
 }
 function showQuestion(result){
  const id=result.sessionIds[0],row=options.getRows().find(r=>r.id===id);$('careQuestion').hidden=false;
  $('careQuestion').scrollIntoView({behavior:'smooth',block:'start'});
  $('careQuestion').innerHTML=`<span class="care-kicker">Gemini follow-up · ${esc(row?.exercise||'saved session')}</span><h3>${esc(result.content.question)}</h3><label>Your explanation (optional)<textarea id="careExplanation" rows="3" maxlength="2000" placeholder="Add context in your own words"></textarea></label><button type="button" class="secondary" id="careSaveExplanation">Save explanation</button><p id="careExplanationStatus" role="status"></p>`;
  $('careSaveExplanation').onclick=async()=>{const answer=$('careExplanation').value.trim();if(!answer){$('careExplanationStatus').textContent='Write a note first, or leave the question unanswered.';return;}const version=loadVersion;$('careSaveExplanation').disabled=true;try{await request('/api/journal/sessions/'+encodeURIComponent(id)+'/context',{scope:options.getScope(),answer});if(version!==loadVersion)return;$('careExplanationStatus').textContent='Saved as your explanation. Measurements are unchanged. Review sharing again to include it in a new Gemini draft.';invalidatePreview();await reload();}catch(error){$('careExplanationStatus').textContent=error.message;}finally{if($('careSaveExplanation'))$('careSaveExplanation').disabled=false;}};
 }
 async function reload(){
  const thisScope=options.getScope(),version=++loadVersion;
  if(thisScope!==scope){scope=thisScope;records=[];insights=[];selected.clear();selectionTouched=false;current=null;invalidatePreview();$('careQuestion').hidden=true;}
  try{const [journal,history,checkins]=await Promise.all([request('/api/journal/sessions?scope='+encodeURIComponent(thisScope)),request('/api/journal/ai/history?scope='+encodeURIComponent(thisScope)),request('/api/journal/checkins?scope='+encodeURIComponent(thisScope))]);if(version!==loadVersion||thisScope!==options.getScope())return;records=journal.sessions;insights=history.insights;const merged=new Map(options.getRows().map(r=>[r.id,r]));for(const r of records)merged.set(r.session.id,r.session);for(const r of checkins.checkins)merged.set(r.id,r);options.setRows([...merged.values()].sort((a,b)=>new Date(a.date)-new Date(b.date)));render();}catch(error){if(version===loadVersion){$('careAiStatus').textContent=error.message+' Your browser history and local note remain available.';render();}}
 }
 function openVisit(id){if(id){selectionTouched=true;selected=new Set([id]);current=null;invalidatePreview();}options.navigate('visit');render();reload();}
 render();reload();
 return {render,reload,openVisit,reset(){loadVersion++;records=[];insights=[];current=null;selectionTouched=false;selected.clear();invalidatePreview();$('careQuestion').hidden=true;render();},async saveCheckin(row){const thisScope=options.getScope();try{await request('/api/journal/checkins',{scope:thisScope,checkin:row});if(thisScope===options.getScope())$('checkinFeedback').textContent='Saved on this browser and in local SQLite.';}catch{if(thisScope===options.getScope())$('checkinFeedback').textContent='Saved on this browser. Backend sync unavailable.';}}};
}
