// Disposable accounts/data only. This deliberately uses the separate QA database on 5174.
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5174';
async function call(path,payload,cookie=''){const r=await fetch(origin+path,{signal:AbortSignal.timeout(20000),method:payload?'POST':'GET',headers:{origin,cookie,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const login=async(username,password)=>{const r=await call('/api/auth',{action:'login',username,password});assert.equal(r.status,200);return r.cookie;};
const admin=await login('qa_admin','Local-QA-only-Admin-2026!'),suffix=Date.now();let a,b,an,bn,ac,bc;
try{
 for(const key of ['a','b']){const username='social_'+key+'_'+suffix,r=await call('/api/admin',{action:'create',name:'Social QA '+key,username,password:'a'},admin);assert.equal(r.status,200);const signed=await login(username,'a');if(key==='a'){a=r.body.id;an=username;ac=signed;}else{b=r.body.id;bn=username;bc=signed;}}
 assert.equal((await call('/api/social')).status,401);
 assert.equal((await call('/api/social',{action:'noteCreate',body:'',color:'yellow'},ac)).status,400);
 let r=await call('/api/social',{action:'noteCreate',body:'Whiteboard test '+suffix,color:'yellow'},ac);assert.equal(r.status,200);const note=r.body.id;
 let board=(await call('/api/social',null,bc)).body;let n=board.notes.find(n=>n.id===note);assert.ok(n,'everyone can see notes');
 assert.equal(n.width,190,'compact default notes');
 assert.equal((await call('/api/social',{action:'noteLayout',id:note,revision:n.revision,x:120,y:80,width:230,height:210},bc)).status,403,'teammate cannot rearrange another author note');
 assert.equal((await call('/api/social',{action:'noteLayout',id:note,revision:n.revision,x:-1,y:80,width:230,height:210},ac)).status,400);
 assert.equal((await call('/api/social',{action:'noteLayout',id:note,revision:n.revision,x:120,y:80,width:230,height:210},ac)).status,200);
 assert.equal((await call('/api/social',{action:'noteLayout',id:note,revision:n.revision,x:140,y:80,width:230,height:210},ac)).status,409,'stale layout rejected');
 n=(await call('/api/social',null,bc)).body.notes.find(n=>n.id===note);assert.equal(n.x,120);assert.equal(n.width,230,'shared layout persisted');
 assert.equal((await call('/api/social',{action:'noteEdit',id:note,revision:n.revision,body:'Not mine',color:'blue'},bc)).status,403);
 assert.equal((await call('/api/social',{action:'noteEdit',id:note,revision:n.revision,body:'Updated by author',color:'blue'},ac)).status,200);
 assert.equal((await call('/api/social',{action:'noteEdit',id:note,revision:n.revision,body:'Stale',color:'pink'},ac)).status,409);
 n=(await call('/api/social',null,admin)).body.notes.find(n=>n.id===note);
 assert.equal((await call('/api/social',{action:'noteArchive',id:note,revision:n.revision},admin)).status,200);
 n=(await call('/api/social',null,ac)).body.notes.find(n=>n.id===note);assert.ok(n.archived);
 assert.equal((await call('/api/social',{action:'noteRestore',id:note,revision:n.revision},ac)).status,200);
 r=await call('/api/social',{action:'send',body:'Shared discussion test'},ac);assert.equal(r.status,200);const shared=r.body.id;
 assert.ok((await call('/api/social',null,bc)).body.messages.some(m=>m.id===shared));
 assert.equal((await call('/api/social',{action:'messageDelete',id:shared,revision:0},admin)).status,200,'admin can moderate shared messages');
 r=await call('/api/social',{action:'send',body:'Private hello '+suffix,recipient:b,id:crypto.randomUUID()},ac);assert.equal(r.status,200);const dm=r.body.id;
 assert.ok(!(await call('/api/social',null,admin)).body.messages.some(m=>m.id===dm),'DM absent from board');
 assert.ok(!(await call('/api/social?peer='+a,null,admin)).body.messages.some(m=>m.id===dm),'uninvolved admin cannot read DM');
 assert.equal((await call('/api/social?peer='+a+'&before='+dm,null,admin)).status,404,'cursor cannot expose another conversation');
 assert.equal((await call('/api/social',{action:'messageDelete',id:dm,revision:0},admin)).status,404,'admin has no DM moderation override');
 assert.equal((await call('/api/social',{action:'messageEdit',id:dm,revision:0,body:'Recipient cannot edit'},bc)).status,403);
 assert.equal((await call('/api/social',{action:'messageEdit',id:dm,revision:0,body:'Private edited hello'},ac)).status,200);
 let conversation=(await call('/api/social?peer='+a,null,bc)).body;assert.ok(conversation.messages.some(m=>m.id===dm&&m.body==='Private edited hello'));assert.ok(conversation.unread.some(u=>u.sender===a&&u.count>0));
 assert.equal((await call('/api/social',{action:'markRead',id:dm},admin)).status,404);
 assert.equal((await call('/api/social',{action:'markRead',id:dm},bc)).status,200);
 assert.ok((await call('/api/social?peer='+b,null,ac)).body.messages.find(m=>m.id===dm).read);
 const clientId=crypto.randomUUID();for(let i=0;i<2;i++)assert.equal((await call('/api/social',{action:'send',recipient:b,body:'Retry-safe message',id:clientId},ac)).status,200);
 assert.equal((await call('/api/social?peer='+b,null,ac)).body.messages.filter(m=>m.id===clientId).length,1,'retry-safe send');
 for(let i=0;i<51;i++)assert.equal((await call('/api/social',{action:'send',recipient:b,body:'History '+i},ac)).status,200);
 conversation=(await call('/api/social?peer='+b,null,ac)).body;assert.equal(conversation.messages.length,50);assert.ok(conversation.hasMore);assert.ok(!conversation.messages.some(m=>m.id===dm));
 const earlier=(await call('/api/social?peer='+b+'&before='+conversation.messages[0].id,null,ac)).body;assert.ok(earlier.messages.some(m=>m.id===dm),'older messages remain reachable');
 const since=conversation.serverTime;assert.equal((await call('/api/social',{action:'messageDelete',id:dm,revision:1},ac)).status,200);
 conversation=(await call('/api/social?peer='+a+'&since='+since,null,bc)).body;assert.ok(conversation.changes.some(m=>m.id===dm&&m.deleted&&m.body===''),'deleted older messages refresh as tombstones');
 assert.equal((await call('/api/social',{action:'send',body:'Self',recipient:a},ac)).status,400);
 assert.equal((await call('/api/social',{action:'send',body:'Bad target',recipient:'missing'},ac)).status,400);
 const backup=await call('/api/backups',{action:'create'},admin);assert.equal(backup.status,200);const file=(await call('/api/backups?download='+backup.body.id,null,admin)).body;assert.equal(file.version,4);assert.ok(file.tables.messages.some(m=>m.id===dm));assert.ok(file.tables.board_notes.some(n=>n.id===note));
 console.log('PASS: shared notes/discussion, author controls, admin moderation, stale edits, archive/restore, private message isolation (including admins/cursors/edits), unread/read, idempotent sends, history pagination, older deletion refresh and backup inclusion.');
}finally{
 for(const [id,username] of [[a,an],[b,bn]])if(id)await call('/api/admin',{action:'update',id,name:'Social QA',username,role:'member',active:false},admin);
}
