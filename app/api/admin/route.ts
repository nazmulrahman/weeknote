import { env } from 'cloudflare:workers';
import { audit, cookie, getMember, hashPassword, normalizeUsername, sameOrigin, validPassword, validUsername } from '../../auth';
import { ensureDailyBackup } from '../../backup';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200,extra:Record<string,string>={})=>Response.json(v,{status,headers:{'Cache-Control':'no-store',...extra}});
export async function GET(request:Request){const me=await getMember(request);if(!me)return json({error:'Please sign in.'},401);if(me.role!=='manager')return json({error:'Admin access required.'},403);
 const [members,events]=await Promise.all([env.DB!.prepare('SELECT m.*,a.username,a.active,CASE WHEN a.member IS NULL THEN 0 ELSE 1 END AS hasLogin FROM members m LEFT JOIN accounts a ON a.member=m.id WHERE m.sample=0 ORDER BY m.name').all(),env.DB!.prepare('SELECT * FROM admin_events ORDER BY time DESC LIMIT 60').all()]);return json({members:members.results,events:events.results});}
export async function POST(request:Request){try{
 const p=await request.json() as any;
 if(!sameOrigin(request))return json({error:'Invalid request origin.'},403);
 const me=await getMember(request);if(!me)return json({error:'Please sign in.'},401);if(me.role!=='manager')return json({error:'Admin access required.'},403);
 const db=env.DB!,now=Date.now();await ensureDailyBackup(db);
 if(p.action==='create'){
 const username=normalizeUsername(p.username),name=String(p.name||'').trim().slice(0,80),role=p.role==='manager'?'manager':'member';
 if(!name||!validUsername(username)||!validPassword(p.password))return json({error:'Add a name, a valid username, and a non-empty password.'},400);
 if(await db.prepare('SELECT member FROM accounts WHERE username=?').bind(username).first())return json({error:'That username is already taken.'},409);
 const id=crypto.randomUUID(),hash=await hashPassword(p.password);
 await db.batch([db.prepare("INSERT INTO members (id,name,role,availability,seen,sample) VALUES (?,?,?,'Away',0,0)").bind(id,name,role),db.prepare('INSERT INTO accounts (member,username,password_hash,active) VALUES (?,?,?,1)').bind(id,username,hash)]);
 await audit(me.id,id,'Created '+(role==='manager'?'admin':'member')+' account');return json({ok:true,id});
 }
 const member=await db.prepare('SELECT m.*,a.username,a.active FROM members m LEFT JOIN accounts a ON a.member=m.id WHERE m.id=? AND m.sample=0').bind(String(p.id||'')).first<any>();if(!member)return json({error:'Member not found.'},404);
 if(p.action==='resetPassword'){
 if(!validPassword(p.password))return json({error:'Use a non-empty password.'},400);if(!member.username)return json({error:'Set a username for this member first.'},400);
 await db.batch([db.prepare('UPDATE accounts SET password_hash=? WHERE member=?').bind(await hashPassword(p.password),member.id),db.prepare('DELETE FROM login_sessions WHERE member=?').bind(member.id),db.prepare('UPDATE sessions SET end=? WHERE member=? AND end IS NULL').bind(now,member.id)]);
 await audit(me.id,member.id,'Reset password and signed out existing sessions');return json({ok:true,signedOut:member.id===me.id},200,member.id===me.id?{'Set-Cookie':cookie('',request,true)}:{});
 }
 if(p.action==='update'){
 const username=normalizeUsername(p.username),name=String(p.name||'').trim().slice(0,80),role=p.role==='manager'?'manager':'member',active=p.active?1:0;
 if(!name||!validUsername(username))return json({error:'Add a name and valid username (3–32 letters, numbers, dots, underscores or hyphens).'},400);
 if(member.id===me.id&&(!active||role!=='manager'))return json({error:'You cannot deactivate yourself or remove your own admin role.'},400);
 const used=await db.prepare('SELECT member FROM accounts WHERE username=? AND member<>?').bind(username,member.id).first();if(used)return json({error:'That username is already taken.'},409);
 if(!member.username&&!validPassword(p.password))return json({error:'Add an initial password for this member.'},400);
 const credential=member.username?null:await hashPassword(p.password);
 const queries=[db.prepare('UPDATE members SET name=?,role=? WHERE id=?').bind(name,role,member.id)];
 if(credential)queries.push(db.prepare('INSERT INTO accounts (member,username,password_hash,active) VALUES (?,?,?,?)').bind(member.id,username,credential,active));else queries.push(db.prepare('UPDATE accounts SET username=?,active=? WHERE member=?').bind(username,active,member.id));
 const revoked=!active||username!==member.username;
 if(revoked)queries.push(db.prepare('DELETE FROM login_sessions WHERE member=?').bind(member.id));
 if(!active)queries.push(db.prepare('UPDATE sessions SET end=? WHERE member=? AND end IS NULL').bind(now,member.id),db.prepare("UPDATE members SET availability='Away' WHERE id=?").bind(member.id));
 await db.batch(queries);await audit(me.id,member.id,!active?'Deactivated account':member.active===0?'Reactivated account':'Updated name, username or role');return json({ok:true,signedOut:revoked&&member.id===me.id},200,revoked&&member.id===me.id?{'Set-Cookie':cookie('',request,true)}:{});
 }
 return json({error:'Unknown action.'},400);
}catch{return json({error:'The account could not be saved. Check that the username is unique and try again.'},409);}}
