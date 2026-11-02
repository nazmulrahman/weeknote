// Only disposable QA data on port 5174. Never point this at the normal database.
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5174';let cookie='';
async function call(path,payload){const r=await fetch(origin+path,{signal:AbortSignal.timeout(20000),method:payload?'POST':'GET',headers:{origin,cookie,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});const body=await r.json();return {status:r.status,body,session:r.headers.get('set-cookie')?.split(';')[0]};}
const login=async()=>{const r=await call('/api/auth',{action:'login',username:'qa_admin',password:'Local-QA-only-Admin-2026!'});assert.equal(r.status,200);cookie=r.session;};
await login();
let r=await call('/api/backups');assert.equal(r.status,200);assert.ok(r.body.backups.some(b=>b.kind==='daily'));
const original=(await call('/api/workspace')).body;
let task;
const member=await call('/api/admin',{action:'create',name:'Safety QA Member',username:'safety_'+Date.now(),password:'a'});assert.equal(member.status,200);
const adminCookie=cookie;const memberDetails=(await call('/api/admin')).body.members.find(m=>m.id===member.body.id);
const memberLogin=await call('/api/auth',{action:'login',username:memberDetails.username,password:'a'});cookie=memberLogin.session;
assert.equal((await call('/api/backups')).status,403,'members cannot read backups or Trash');assert.equal((await call('/api/backups',{action:'create'})).status,403);assert.equal((await call('/api/backups',{action:'restoreTask',id:'missing'})).status,403);
cookie=adminCookie;
try{
 r=await call('/api/workspace',{action:'create',title:'Trash QA '+Date.now(),project:'Safety QA',assignees:[original.me],owner:original.me,week:'2026-11-01',estimate:1});assert.equal(r.status,200);
 task=(await call('/api/workspace')).body.tasks.find(t=>t.project==='Safety QA');
 assert.equal((await call('/api/workspace',{action:'start',id:task.id,minutes:60})).status,200);
 assert.equal((await call('/api/workspace',{action:'checkTimer',id:task.id})).status,200);
 assert.ok((await call('/api/workspace')).body.sessions.find(s=>s.task===task.id&&s.end===null).checked);
 assert.equal((await call('/api/workspace',{action:'delete',id:task.id})).status,200);
 let d=(await call('/api/workspace')).body;assert.ok(!d.tasks.some(t=>t.id===task.id));assert.ok(!d.sessions.some(s=>s.task===task.id));
 assert.ok((await call('/api/backups')).body.trash.some(t=>t.id===task.id));
 assert.equal((await call('/api/workspace',{action:'start',id:task.id,minutes:60})).status,404);
 assert.equal((await call('/api/backups',{action:'restoreTask',id:task.id})).status,200);
 d=(await call('/api/workspace')).body;assert.ok(d.tasks.some(t=>t.id===task.id));assert.ok(d.sessions.find(s=>s.task===task.id).end,'restored timer stays stopped');assert.ok(d.events.some(e=>e.task===task.id&&e.message==='Restored from Trash'));
 const saved=await call('/api/backups',{action:'create'});assert.equal(saved.status,200);
 const downloaded=await call('/api/backups?download='+saved.body.id);assert.equal(downloaded.status,200);assert.equal(downloaded.body.format,'weeknote-backup');assert.ok(downloaded.body.tables.accounts.length);
 assert.equal((await call('/api/backups',{action:'restore',backup:{bad:true},confirm:'RESTORE'})).status,400);
 assert.equal((await call('/api/backups',{action:'restore',id:saved.body.id,confirm:'wrong'})).status,400);
 assert.equal((await call('/api/workspace',{action:'delete',id:task.id})).status,200);
 r=await call('/api/backups',{action:'restore',id:saved.body.id,confirm:'RESTORE'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.signedOut,true);
 assert.equal((await call('/api/workspace')).status,401,'old cookie revoked');
 await login();d=(await call('/api/workspace')).body;assert.ok(d.tasks.some(t=>t.id===task.id),'full restore recovered task');assert.ok(d.sessions.every(s=>s.end!==null));
 console.log('PASS: real D1 API backups/download/restore, invalid restore rejected, daily backup, reminder check-in, Trash, retained time/history, stopped timers and revoked login.');
}finally{await login();await call('/api/admin',{action:'update',id:member.body.id,name:memberDetails.name,username:memberDetails.username,role:'member',active:false});if(task){await login();await call('/api/workspace',{action:'delete',id:task.id});}}
