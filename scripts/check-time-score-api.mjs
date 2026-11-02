// Isolated QA database only; never change this origin to your normal app server.
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5174';
async function call(path,payload,cookie=''){const r=await fetch(origin+path,{signal:AbortSignal.timeout(20000),method:payload?'POST':'GET',headers:{origin,cookie,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const admin=(await call('/api/auth',{action:'login',username:'qa_admin',password:'Local-QA-only-Admin-2026!'})).cookie;assert.ok(admin);
const original=(await call('/api/workspace',null,admin)).body,me=original.me;let member,memberUsername,memberCookie,t;
const post=(payload,cookie=admin)=>call('/api/workspace',payload,cookie),load=async()=> (await call('/api/workspace',null,admin)).body;
try{
 memberUsername='timeqa_'+Date.now();let r=await call('/api/admin',{action:'create',name:'Time QA member',username:memberUsername,password:'a'},admin);assert.equal(r.status,200);member=r.body.id;memberCookie=(await call('/api/auth',{action:'login',username:memberUsername,password:'a'})).cookie;
 r=await post({action:'create',title:'Time and score QA '+Date.now(),project:'Time QA',owner:me,assignees:[me,member],week:'2026-11-01',estimate:4});assert.equal(r.status,200);t=(await load()).tasks.find(t=>t.project==='Time QA');
 assert.equal((await post({action:'start',id:t.id,minutes:60})).status,200);
 assert.equal((await post({action:'pause',id:t.id})).status,200);
 let d=await load(),first=d.sessions.find(s=>s.task===t.id&&s.member===me);assert.ok(first.end);assert.equal(first.finish_kind,'pause');assert.equal(d.tasks.find(x=>x.id===t.id).progress,0,'pause preserves progress');const pausedEnd=first.end;
 assert.equal((await post({action:'start',id:t.id,minutes:60})).status,200);
 assert.equal((await post({action:'start',id:t.id,minutes:60},memberCookie)).status,200);
 assert.equal((await post({action:'stop',id:t.id,revision:999,progress:40})).status,409);
 assert.ok((await load()).sessions.some(s=>s.task===t.id&&s.member===me&&s.end===null),'stale Stop does not change timer');
 t=(await load()).tasks.find(x=>x.id===t.id);assert.equal((await post({action:'stop',id:t.id,revision:t.revision,progress:40})).status,200);
 d=await load();assert.equal(d.tasks.find(x=>x.id===t.id).progress,40);assert.ok(!d.sessions.some(s=>s.task===t.id&&s.member===me&&s.end===null));assert.ok(d.sessions.some(s=>s.task===t.id&&s.member===member&&s.end===null),'partial stop keeps collaborators working');assert.equal(d.sessions.find(s=>s.id===first.id).end,pausedEnd,'paused gap never added');
 t=d.tasks.find(x=>x.id===t.id);assert.equal((await post({action:'stop',id:t.id,revision:t.revision,progress:100},memberCookie)).status,200);d=await load();assert.ok(!d.sessions.some(s=>s.task===t.id&&s.end===null));assert.ok(d.tasks.find(x=>x.id===t.id).completed);
 const adjustment={action:'scoreAdjustment',member,week:'2026-11-01',deadline_points:5,low_tasks:1,high_tasks:1,uneven_days:1,unapproved_hours:2,note:'QA approved example',revision:-1};
 assert.equal((await post(adjustment,memberCookie)).status,403);assert.equal((await post({...adjustment,deadline_points:3})).status,400);assert.equal((await post(adjustment)).status,200);
 assert.equal((await post(adjustment)).status,409,'stale score updates rejected');let a=(await load()).scoreAdjustments.find(a=>a.member===member);assert.equal(a.deadline_points,5);assert.equal((await post({...adjustment,revision:a.revision,deadline_points:-5})).status,200);
 const note=await call('/api/social',{action:'noteCreate',body:'Inline canvas draft saved',color:'pink',x:340,y:220,width:190,height:180},admin);assert.equal(note.status,200);assert.equal((await call('/api/social',null,admin)).body.notes.find(n=>n.id===note.body.id).x,340);
 const backup=await call('/api/backups',{action:'create'},admin),file=(await call('/api/backups?download='+backup.body.id,null,admin)).body;assert.equal(file.version,4);assert.ok(file.tables.score_adjustments.some(a=>a.member===member));assert.ok(file.tables.sessions.some(s=>s.finish_kind==='stop'));
 console.log('PASS: pause/resume/stop time semantics, unchanged pause progress, atomic stale Stop, shared-timer isolation/completion, score admin permissions/validation/concurrency, inline note positioning and backup inclusion.');
}finally{if(t)await post({action:'delete',id:t.id});if(member)await call('/api/admin',{action:'update',id:member,name:'Time QA member',username:memberUsername,role:'member',active:false},admin);}
