import { env } from 'cloudflare:workers';
import { getMember, audit } from '../../auth';
import { ensureDailyBackup } from '../../backup';
export const dynamic = 'force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const date=(n=Date.now())=>new Date(n+21600000).toISOString().slice(0,10);
function week(){const d=new Date(date()+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-d.getUTCDay());return d.toISOString().slice(0,10);}
const id=()=>crypto.randomUUID();
async function context(request:Request){
 const member=await getMember(request);if(!member)return null;const db=env.DB!,now=Date.now();
 await db.prepare('UPDATE members SET seen=? WHERE id=?').bind(now,member.id).run();
 return {db,user:{userId:member.id},member,now};
}
export async function GET(request:Request){try{const c=await context(request);if(!c)return json({error:'Sign in to open your workspace.',signIn:true},401);
 let backupError='';try{await ensureDailyBackup(c.db);}catch{backupError='Automatic backup failed. Ask an admin to download a backup and check storage.';}
 const [m,t,s,e]=await Promise.all(['SELECT m.*,COALESCE(a.active,1) AS active FROM members m LEFT JOIN accounts a ON a.member=m.id','SELECT * FROM tasks WHERE deleted IS NULL ORDER BY created DESC','SELECT s.* FROM sessions s JOIN tasks t ON t.id=s.task WHERE t.deleted IS NULL','SELECT e.* FROM events e JOIN tasks t ON t.id=e.task WHERE t.deleted IS NULL ORDER BY e.time DESC LIMIT 150'].map(q=>c.db.prepare(q).all()));
 const unreadMessages=await c.db.prepare('SELECT COUNT(*) AS count FROM messages WHERE recipient=? AND read IS NULL AND deleted IS NULL').bind(c.user.userId).first<{count:number}>();
 const scoreAdjustments=(await c.db.prepare('SELECT * FROM score_adjustments').all()).results;
 return json({scoreAdjustments,unreadMessages:unreadMessages?.count||0,backupError:c.member.role==='manager'?backupError:'',me:c.user.userId,members:m.results,tasks:t.results.map((x:any)=>({...x,assignees:JSON.parse(x.assignees)})),sessions:s.results,events:e.results,serverTime:Date.now()});
}catch(e){console.error(e);return json({error:'The workspace could not be loaded. Please retry.'},500);}}
export async function POST(request:Request){try{
 const p=await request.json() as any;
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
 const c=await context(request);if(!c)return json({error:'Please sign in again.'},401);const {db,user,member,now}=c;const manager=member.role==='manager';
 await ensureDailyBackup(db);
 const log=(task:string,message:string)=>db.prepare('INSERT INTO events (id,task,member,message,time) VALUES (?,?,?,?,?)').bind(id(),task,user.userId,message,now);
 if(p.action==='scoreAdjustment'){
 if(!manager)return json({error:'Admin access required.'},403);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(p.week)||new Date(p.week+'T00:00:00Z').getUTCDay()!==0||!await db.prepare('SELECT id FROM members WHERE id=? AND sample=0').bind(String(p.member||'')).first())return json({error:'Choose a member and a Sunday week start.'},400);
 const a=p,reason=String(p.note||'').trim().slice(0,1000);
 if(!Number.isInteger(a.deadline_points)||a.deadline_points%5||Math.abs(a.deadline_points)>1000||![a.low_tasks,a.high_tasks,a.uneven_days].every(v=>Number.isInteger(v)&&v>=0&&v<=1000)||!Number.isFinite(a.unapproved_hours)||a.unapproved_hours<0||a.unapproved_hours>10000||!reason)return json({error:'Enter valid adjustment counts, deadline points in multiples of 5, and a reason.'},400);
 const r=await db.prepare('INSERT INTO score_adjustments (id,member,week,deadline_points,low_tasks,high_tasks,uneven_days,unapproved_hours,note,updated,actor) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(member,week) DO UPDATE SET deadline_points=excluded.deadline_points,low_tasks=excluded.low_tasks,high_tasks=excluded.high_tasks,uneven_days=excluded.uneven_days,unapproved_hours=excluded.unapproved_hours,note=excluded.note,updated=excluded.updated,actor=excluded.actor,revision=score_adjustments.revision+1 WHERE score_adjustments.revision=?').bind(id(),p.member,p.week,a.deadline_points,a.low_tasks,a.high_tasks,a.uneven_days,a.unapproved_hours,reason,now,user.userId,p.revision??-1).run();
 if(!r.meta.changes)return json({error:'These adjustments changed. Reopen the latest values.'},409);await audit(user.userId,p.member,'Updated productivity adjustments for '+p.week+': '+reason);return json({ok:true});
 }
 if(p.action==='profile'){
 const displayName=String(p.name||'').trim().slice(0,80);if(!displayName)return json({error:'Add your display name.'},400);await db.prepare('UPDATE members SET name=? WHERE id=?').bind(displayName,user.userId).run();return json({ok:true});}
 if(p.action==='availability'){
 if(!['Available','Busy','Away'].includes(p.value))return json({error:'Invalid status'},400);
 const q=[db.prepare('UPDATE members SET availability=? WHERE id=?').bind(p.value,user.userId)];if(p.value!=='Available')q.push(db.prepare('UPDATE sessions SET end=? WHERE member=? AND end IS NULL').bind(now,user.userId));await db.batch(q);return json({ok:true});}
 if(p.action==='sample'){
 if(!manager)return json({error:'Only an admin can add examples.'},403);if(await db.prepare('SELECT id FROM tasks WHERE sample=1 LIMIT 1').first())return json({ok:true});
 const q:any[]=[];for(const [mid,name] of [['sample-sunny','Sunny'],['sample-tanvir','Tanvir'],['sample-zonaid','Zonaid']])q.push(db.prepare("INSERT OR IGNORE INTO members (id,name,role,availability,seen,sample) VALUES (?,?,'member','Available',0,1)").bind(mid,name));
 const samples=[['Navigation + cleaning','DWM',user.userId,[user.userId,'sample-tanvir'],60,12,'High'],['Fix the web dashboard','DWM',user.userId,[user.userId],75,3,'Normal'],['IMU shift investigation','DWM','sample-sunny',['sample-sunny',user.userId],40,4,'High'],['Assembly & testing','SRM III','sample-tanvir',['sample-tanvir','sample-zonaid'],25,13,'Normal'],['Weekly documentation','General',user.userId,[user.userId],100,2,'Normal'],['Customer follow-ups','Business','sample-zonaid',['sample-zonaid'],0,3,'Normal']];
 for(const [title,project,owner,assignees,progress,estimate,priority] of samples)q.push(db.prepare("INSERT INTO tasks (id,title,project,owner,assignees,week,deadline,estimate,progress,priority,blocked,notes,completed,created,revision,sample) VALUES (?,?,?,?,?,?,?,?,?,?,'','Example task — edit or remove when ready.',?,?,0,1)").bind(id(),title,project,owner,JSON.stringify(assignees),week(),date(now+86400000),estimate,progress,priority,progress===100?now:null,now));await db.batch(q);return json({ok:true});}
 if(p.action==='clearSamples'){
 if(!manager)return json({error:'Admin access required'},403);await db.batch([db.prepare('DELETE FROM sessions WHERE task IN (SELECT id FROM tasks WHERE sample=1)'),db.prepare('DELETE FROM events WHERE task IN (SELECT id FROM tasks WHERE sample=1)'),db.prepare('DELETE FROM tasks WHERE sample=1'),db.prepare('DELETE FROM members WHERE sample=1 AND NOT EXISTS (SELECT 1 FROM tasks, json_each(tasks.assignees) WHERE json_each.value=members.id)')]);return json({ok:true});}
 if(p.action==='create'||p.action==='edit'){
 if(!manager)return json({error:'Only an admin can assign or edit tasks.'},403);
 const title=String(p.title||'').trim().slice(0,180),ids:any[]=Array.isArray(p.assignees)?[...new Set(p.assignees)]:[];
 if(!title||!ids.length||!/^\d{4}-\d{2}-\d{2}$/.test(p.week))return json({error:'Add a task name, member and planned week.'},400);
 if(p.deadline&&!/^\d{4}-\d{2}-\d{2}$/.test(p.deadline))return json({error:'Invalid deadline'},400);
 if(p.estimate!==null&&(!Number.isFinite(p.estimate)||p.estimate<=0||p.estimate>10000))return json({error:'Estimate must be positive.'},400);
 const all=await db.prepare('SELECT m.id FROM members m LEFT JOIN accounts a ON a.member=m.id WHERE m.sample=1 OR a.active=1').all();if(ids.some(x=>!all.results.some(m=>m.id===x))||!ids.includes(p.owner))return json({error:'Choose an owner from the assigned members.'},400);
 const tid=p.action==='create'?id():p.id;const values=[title,String(p.project||'General').slice(0,80),p.owner,JSON.stringify(ids),p.week,p.deadline||null,p.estimate,p.priority==='High'?'High':'Normal',String(p.notes||'').slice(0,3000)];
 if(p.action==='create')await db.batch([db.prepare('INSERT INTO tasks (id,title,project,owner,assignees,week,deadline,estimate,priority,notes,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(tid,...values,now),log(tid,'Created the task')]);
 else{const task=await db.prepare('SELECT * FROM tasks WHERE id=? AND deleted IS NULL').bind(tid).first<any>();if(!task)return json({error:'Task not found'},404);const active=await db.prepare('SELECT member FROM sessions WHERE task=? AND end IS NULL').bind(tid).all();if(active.results.some(x=>!ids.includes(x.member)))return json({error:'Pause active collaborators before removing them.'},409);
 const r=await db.prepare('UPDATE tasks SET title=?,project=?,owner=?,assignees=?,week=?,deadline=?,estimate=?,priority=?,notes=?,revision=revision+1 WHERE id=? AND revision=? AND deleted IS NULL').bind(...values,tid,p.revision).run();if(!r.meta.changes)return json({error:'This task changed. Reopen it to edit the latest version.'},409);await log(tid,'Updated task details').run();}return json({ok:true});}
 const task=await db.prepare('SELECT * FROM tasks WHERE id=? AND deleted IS NULL').bind(String(p.id||'')).first<any>();if(!task)return json({error:'Task not found'},404);const assigned=JSON.parse(task.assignees).includes(user.userId);if(!manager&&!assigned)return json({error:'You are not assigned to this task.'},403);
 if(p.action==='start'){
 if(!assigned)return json({error:'Assign yourself before starting.'},403);if(task.progress===100||task.blocked)return json({error:'Reopen or unblock this task first.'},400);const mins=Number(p.minutes);if(!Number.isFinite(mins)||mins<1||mins>1440)return json({error:'Choose a session of 1–1440 minutes.'},400);
 await db.batch([db.prepare("UPDATE sessions SET end=?,finish_kind='stop' WHERE member=? AND end IS NULL").bind(now,user.userId),db.prepare("INSERT INTO sessions (id,task,member,start,budget,remind) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tasks WHERE id=? AND progress<100 AND blocked='' AND deleted IS NULL)").bind(id(),task.id,user.userId,now,mins*60000,now+mins*60000,task.id),db.prepare("UPDATE members SET availability='Available' WHERE id=?").bind(user.userId),log(task.id,'Started a focus session')]);
 }else if(p.action==='pause'){
 if(!assigned)return json({error:'Only assigned members can pause their own timer.'},403);
 await db.batch([db.prepare("UPDATE sessions SET end=?,finish_kind='pause' WHERE task=? AND member=? AND end IS NULL").bind(now,task.id,user.userId),log(task.id,'Paused the timer; task progress unchanged')]);
 }else if(p.action==='stop'){
 if(!assigned)return json({error:'Only assigned members can stop their own work session.'},403);
 const progress=Number(p.progress);if(!Number.isInteger(progress)||progress<0||progress>100)return json({error:'Progress must be 0–100.'},400);
 const guard=id();const result=await db.batch([
 db.prepare('INSERT INTO events (id,task,member,message,time) SELECT ?,?,?,?,? FROM tasks WHERE id=? AND revision=? AND deleted IS NULL').bind(guard,task.id,user.userId,'Stopped work and saved progress at '+progress+'%',now,task.id,p.revision),
 db.prepare('UPDATE tasks SET progress=?,completed=?,revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM events WHERE id=?)').bind(progress,progress===100?(task.completed||now):null,task.id,guard),
 db.prepare("UPDATE sessions SET end=COALESCE(end,?),finish_kind='stop' WHERE task=? AND (member=? OR ?=100) AND (end IS NULL OR finish_kind='pause') AND EXISTS(SELECT 1 FROM events WHERE id=?)").bind(now,task.id,user.userId,progress,guard)]);
 if(!result[0].meta.changes)return json({error:'A teammate updated progress. Review the latest progress and stop again.'},409);

 }else if(p.action==='continue'){const mins=Number(p.minutes);if(![15,30,60].includes(mins))return json({error:'Invalid reminder interval'},400);await db.prepare('UPDATE sessions SET remind=?,checked=? WHERE task=? AND member=? AND end IS NULL').bind(now+mins*60000,now,task.id,user.userId).run();
 }else if(p.action==='checkTimer'){await db.prepare('UPDATE sessions SET checked=? WHERE task=? AND member=? AND end IS NULL').bind(now,task.id,user.userId).run();
 }else if(p.action==='progress'||p.action==='block'){
 const progress=p.action==='progress'?Number(p.progress):task.progress;if(!Number.isInteger(progress)||progress<0||progress>100)return json({error:'Progress must be 0–100.'},400);const blocked=p.action==='block'?String(p.reason||'').trim().slice(0,500):task.blocked;
 const r=await db.prepare('UPDATE tasks SET progress=?,blocked=?,completed=?,revision=revision+1 WHERE id=? AND revision=? AND deleted IS NULL').bind(progress,blocked,progress===100?(task.completed||now):null,task.id,p.revision).run();if(!r.meta.changes)return json({error:'A teammate updated this task. Try again with the latest progress.'},409);
 if(progress===100||blocked)await db.prepare('UPDATE sessions SET end=? WHERE task=? AND end IS NULL').bind(now,task.id).run();await log(task.id,p.action==='block'?(blocked?'Blocked: '+blocked:'Removed the blocker'):'Updated progress to '+progress+'%').run();
 }else if(p.action==='manual'){
 if(!assigned)return json({error:'Only assigned members can log their own time.'},403);const start=Number(p.start),end=Number(p.end),note=String(p.note||'').trim().slice(0,300);
 if(!note||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>now||end-start>86400000)return json({error:'Add a reason and a valid past session, up to 24 hours.'},400);
 if(await db.prepare('SELECT id FROM sessions WHERE member=? AND start<? AND COALESCE(end,?)>? LIMIT 1').bind(user.userId,end,now,start).first())return json({error:'This overlaps an existing session.'},409);
 await db.batch([db.prepare('INSERT INTO sessions (id,task,member,start,end,note) VALUES (?,?,?,?,?,?)').bind(id(),task.id,user.userId,start,end,note),log(task.id,'Added time: '+note)]);
 }else if(p.action==='adjust'){
 const s=await db.prepare('SELECT * FROM sessions WHERE id=? AND task=? AND member=?').bind(p.session,task.id,user.userId).first<any>(),end=Number(p.end),note=String(p.note||'').trim().slice(0,300);if(!s||!note||!Number.isFinite(end)||end<s.start||end>now)return json({error:'Choose a valid end time and add a reason.'},400);
 if(await db.prepare('SELECT id FROM sessions WHERE member=? AND id<>? AND start<? AND COALESCE(end,?)>? LIMIT 1').bind(user.userId,s.id,end,now,s.start).first())return json({error:'Correction overlaps another session.'},409);
 await db.batch([db.prepare('UPDATE sessions SET end=?,note=? WHERE id=?').bind(end,note,s.id),log(task.id,'Corrected time: '+note)]);
 }else if(p.action==='delete'){if(!manager)return json({error:'Admin access required'},403);await audit(user.userId,task.id,'Moved task to Trash: '+task.title);await db.batch([db.prepare('UPDATE sessions SET end=? WHERE task=? AND end IS NULL').bind(now,task.id),db.prepare('UPDATE tasks SET deleted=?,revision=revision+1 WHERE id=?').bind(now,task.id),log(task.id,'Moved to Trash')]);
 }else return json({error:'Unknown action'},400);return json({ok:true});
}catch(e){console.error(e);return json({error:'The change could not be saved. Please retry.'},500);}}
