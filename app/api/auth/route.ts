import { env } from 'cloudflare:workers';
import { audit, cookie, digest, getMember, hashPassword, newSession, normalizeUsername, sameOrigin, sessionToken, validPassword, validUsername, verifyPassword } from '../../auth';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200,extra:Record<string,string>={})=>Response.json(v,{status,headers:{'Cache-Control':'no-store',...extra}});
export async function GET(request:Request) {try{
 const initialized=await env.DB!.prepare('SELECT id FROM auth_setup WHERE id=?').bind('initialized').first();
 const member=await getMember(request);
 return json({setupRequired:!initialized,authenticated:!!member,username:member?.username});
}catch{return json({error:'Login is unavailable. Check that database migrations have been applied.'},503);}}
export async function POST(request:Request){try{
 const p=await request.json() as any;
 if(!sameOrigin(request))return json({error:'Invalid request origin.'},403);
 const db=env.DB!,now=Date.now();
 if(p.action==='logout'){
 const member=await getMember(request),token=sessionToken(request.headers);
 if(token)await db.prepare('DELETE FROM login_sessions WHERE hash=?').bind(await digest(token)).run();
 if(member)await db.batch([db.prepare('UPDATE sessions SET end=? WHERE member=? AND end IS NULL').bind(now,member.id),db.prepare("UPDATE members SET availability='Away' WHERE id=?").bind(member.id)]);
 return json({ok:true},200,{'Set-Cookie':cookie('',request,true)});
 }
 if(p.action==='setup'){
 // The first administrator must be configured on this machine, not by a remote visitor.
 if(!['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname))return json({error:'Create the first admin from localhost on the server.'},403);
 if(await db.prepare('SELECT id FROM auth_setup WHERE id=?').bind('initialized').first())return json({error:'An admin is already configured. Sign in instead.'},409);
 const username=normalizeUsername(p.username),name=String(p.name||'').trim().slice(0,80);
 if(!name||!validUsername(username)||!validPassword(p.password))return json({error:'Add a name, a 3–32 character username, and a non-empty password.'},400);
 const legacy=await db.prepare("SELECT m.id FROM members m LEFT JOIN accounts a ON a.member=m.id WHERE m.sample=0 AND m.role='manager' AND a.member IS NULL ORDER BY m.seen LIMIT 1").first<any>();
 const memberId=legacy?.id||crypto.randomUUID(),passwordHash=await hashPassword(p.password);
 // The unique setup marker and credential insertion are one transaction: only one request can win.
 try{await db.batch([db.prepare("INSERT INTO auth_setup (id) VALUES ('initialized')"),db.prepare("INSERT INTO members (id,name,role,availability,seen,sample) VALUES (?,?,'manager','Available',?,0) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role='manager',availability='Available',seen=excluded.seen").bind(memberId,name,now),db.prepare('INSERT INTO accounts (member,username,password_hash,active) VALUES (?,?,?,1)').bind(memberId,username,passwordHash)]);}catch{return json({error:'Setup was already completed. Sign in with the admin account.'},409);}
 await audit(memberId,memberId,'Created the first admin account');
 return json({ok:true},200,{'Set-Cookie':cookie(await newSession(memberId),request)});
 }
 if(p.action!=='login')return json({error:'Unknown action.'},400);
 const username=normalizeUsername(p.username),password=typeof p.password==='string'?p.password:'';
 const ip=request.headers.get('cf-connecting-ip')||'local',keys=[['user:'+await digest(username),5],['ip:'+await digest(ip),50]] as const;
 for(const [key,limit] of keys){const row=await db.prepare('SELECT * FROM login_attempts WHERE key=?').bind(key).first<any>();if(row&&row.until>now&&row.attempts>=limit)return json({error:'Too many attempts. Try again in 15 minutes.'},429);}
 const account=validUsername(username)?await db.prepare('SELECT a.*,m.sample FROM accounts a JOIN members m ON m.id=a.member WHERE a.username=?').bind(username).first<any>():null;
 const dummy='pbkdf2-sha256$100000$'+'00'.repeat(32)+'$'+'00'.repeat(32);
 const verified=password.length>0&&await verifyPassword(password,account?.password_hash||dummy);
 if(!account||!verified||!account.active||account.sample){
 await db.batch(keys.map(([key])=>db.prepare('INSERT INTO login_attempts (key,attempts,until) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN until<=? THEN 1 ELSE attempts+1 END,until=CASE WHEN until<=? THEN excluded.until ELSE until END').bind(key,now+900000,now,now)));
 return json({error:'Username or password is incorrect, or this account is disabled.'},401);
 }
 await db.batch([db.prepare('DELETE FROM login_attempts WHERE key=?').bind(keys[0][0]),db.prepare("UPDATE members SET seen=?,availability='Available' WHERE id=?").bind(now,account.member)]);
 return json({ok:true},200,{'Set-Cookie':cookie(await newSession(account.member),request)});
}catch{return json({error:'Unable to sign in. Please try again.'},500);}}
