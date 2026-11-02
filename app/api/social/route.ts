import {env} from 'cloudflare:workers';
import {getMember,sameOrigin} from '../../auth';
import {ensureDailyBackup} from '../../backup';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const colors=['yellow','blue','pink','green'];
export async function GET(request:Request){try{
 const me=await getMember(request);if(!me)return json({error:'Please sign in.'},401);
 const serverTime=Date.now();const db=env.DB!,url=new URL(request.url),peer=url.searchParams.get('peer'),before=url.searchParams.get('before');
 if(peer===me.id)return json({error:'Choose a teammate.'},400);
 if(peer&&!await db.prepare('SELECT id FROM members WHERE id=? AND sample=0').bind(peer).first())return json({error:'Teammate not found.'},404);
 // Every read, including pagination, scopes private messages to the signed-in pair.
 const scope=peer?'((sender=? AND recipient=?) OR (sender=? AND recipient=?))':'recipient IS NULL';
 const args:any[]=peer?[me.id,peer,peer,me.id]:[];
 let cursor='';if(before){const row=await db.prepare(`SELECT created,id FROM messages WHERE id=? AND ${scope}`).bind(before,...args).first<any>();if(!row)return json({error:'Message not found in this conversation.'},404);cursor=' AND (created<? OR (created=? AND id<?))';args.push(row.created,row.created,row.id);}
 const result=await db.prepare(`SELECT id,sender,recipient,CASE WHEN deleted IS NULL THEN body ELSE '' END AS body,created,updated,revision,deleted,read FROM messages WHERE ${scope}${cursor} ORDER BY created DESC,id DESC LIMIT 51`).bind(...args).all<any>();
 const notes=peer?[]:(await db.prepare('SELECT * FROM board_notes ORDER BY archived IS NOT NULL,updated DESC,id DESC LIMIT 200').all()).results;
 const since=Number(url.searchParams.get('since'));let changes:any[]=[];
 if(url.searchParams.has('since')&&Number.isFinite(since)&&since>=0&&!before){const changeArgs=peer?[me.id,peer,peer,me.id]:[];changes=(await db.prepare(`SELECT id,sender,recipient,CASE WHEN deleted IS NULL THEN body ELSE '' END AS body,created,updated,revision,deleted,read FROM messages WHERE ${scope} AND updated>=?`).bind(...changeArgs,since).all()).results;}
 const unread=(await db.prepare('SELECT sender,COUNT(*) AS count FROM messages WHERE recipient=? AND read IS NULL AND deleted IS NULL GROUP BY sender').bind(me.id).all()).results;
 return json({serverTime,changes,unread,notes,messages:result.results.slice(0,50).reverse(),hasMore:result.results.length>50});
 }catch(e){console.error(e);return json({error:'Could not load updates. Please retry.'},500);}}
export async function POST(request:Request){try{
 const p=await request.json() as any;if(!sameOrigin(request))return json({error:'Invalid origin.'},403);
 const me=await getMember(request);if(!me)return json({error:'Please sign in.'},401);
 const db=env.DB!,now=Date.now(),body=typeof p.body==='string'?p.body.trim():'';
 if(p.action==='noteCreate'){
 if(!body||body.length>3000||!colors.includes(p.color))return json({error:'Add a note up to 3,000 characters and choose a color.'},400);
 if(p.x!==undefined&&(![p.x,p.y,p.width,p.height].every(Number.isInteger)||p.x<0||p.y<0||p.width<160||p.width>600||p.height<150||p.height>700||p.x+p.width>6000||p.y+p.height>4000))return json({error:'Invalid note position or size.'},400);
 await ensureDailyBackup(db);const id=crypto.randomUUID();const count=await db.prepare('SELECT COUNT(*) AS n FROM board_notes WHERE archived IS NULL').first<{n:number}>();const slot=(count?.n||0)%90;await db.prepare('INSERT INTO board_notes (id,author,body,color,created,updated,x,y,width,height) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,me.id,body,p.color,now,now,p.x??(slot%5)*214,p.y??Math.floor(slot/5)*204,p.width??190,p.height??180).run();return json({ok:true,id});
 }
 if(['noteEdit','noteArchive','noteRestore','noteLayout'].includes(p.action)){
 const note=await db.prepare('SELECT * FROM board_notes WHERE id=?').bind(String(p.id||'')).first<any>();if(!note)return json({error:'Note not found.'},404);
 if(note.author!==me.id&&me.role!=='manager')return json({error:'You can only manage your own notes.'},403);
 if(p.action==='noteEdit'&&(!body||body.length>3000||!colors.includes(p.color)))return json({error:'Add a note up to 3,000 characters and choose a color.'},400);
 if(p.action==='noteLayout'){
 if(![p.x,p.y,p.width,p.height].every(Number.isInteger)||p.x<0||p.y<0||p.width<160||p.width>600||p.height<150||p.height>700||p.x+p.width>6000||p.y+p.height>4000)return json({error:'Choose a valid note position and size.'},400);
 await ensureDailyBackup(db);const r=await db.prepare('UPDATE board_notes SET x=?,y=?,width=?,height=?,revision=revision+1 WHERE id=? AND revision=? AND archived IS NULL').bind(p.x,p.y,p.width,p.height,note.id,p.revision).run();return r.meta.changes?json({ok:true}):json({error:'This note changed. Please try moving it again.'},409);
 }
 await ensureDailyBackup(db);
 const r=p.action==='noteEdit'?await db.prepare('UPDATE board_notes SET body=?,color=?,updated=?,revision=revision+1 WHERE id=? AND revision=? AND archived IS NULL').bind(body,p.color,now,note.id,p.revision).run():await db.prepare('UPDATE board_notes SET archived=?,updated=?,revision=revision+1 WHERE id=? AND revision=?').bind(p.action==='noteArchive'?now:null,now,note.id,p.revision).run();
 return r.meta.changes?json({ok:true}):json({error:'This note changed. Refresh it before trying again.'},409);
 }
 if(p.action==='markRead'){
 const message=await db.prepare('SELECT created,id,sender FROM messages WHERE id=? AND recipient=?').bind(String(p.id||''),me.id).first<any>();if(!message)return json({error:'Message not found.'},404);
 await db.prepare('UPDATE messages SET read=?,updated=? WHERE sender=? AND recipient=? AND read IS NULL AND (created<? OR (created=? AND id<=?))').bind(now,now,message.sender,me.id,message.created,message.created,message.id).run();return json({ok:true});
 }
 if(p.action==='send'){
 const recipient=p.recipient==null?null:String(p.recipient);
 if(!body||body.length>3000)return json({error:'Write a message up to 3,000 characters.'},400);
 if(recipient&&(recipient===me.id||!await db.prepare('SELECT m.id FROM members m JOIN accounts a ON a.member=m.id WHERE m.id=? AND m.sample=0 AND a.active=1').bind(recipient).first()))return json({error:'Choose an active teammate.'},400);
 await ensureDailyBackup(db);const id=typeof p.id==='string'&&/^[a-f0-9-]{36}$/.test(p.id)?p.id:crypto.randomUUID();await db.prepare('INSERT OR IGNORE INTO messages (id,sender,recipient,body,created,updated) VALUES (?,?,?,?,?,?)').bind(id,me.id,recipient,body,now,now).run();return json({ok:true,id});
 }
 if(['messageEdit','messageDelete'].includes(p.action)){
 const msg=await db.prepare('SELECT * FROM messages WHERE id=? AND (recipient IS NULL OR sender=? OR recipient=?)').bind(String(p.id||''),me.id,me.id).first<any>();if(!msg)return json({error:'Message not found.'},404);
 // Admin moderation applies only to the shared discussion, never others' DMs.
 if(msg.sender!==me.id&&!(msg.recipient===null&&me.role==='manager'&&p.action==='messageDelete'))return json({error:'You can only change your own messages.'},403);
 if(msg.deleted!==null)return json({error:'This message was removed.'},409);
 if(p.action==='messageEdit'&&(!body||body.length>3000))return json({error:'Write a message up to 3,000 characters.'},400);
 await ensureDailyBackup(db);
 const r=p.action==='messageEdit'?await db.prepare('UPDATE messages SET body=?,updated=?,revision=revision+1 WHERE id=? AND revision=? AND deleted IS NULL').bind(body,now,msg.id,p.revision).run():await db.prepare('UPDATE messages SET deleted=?,updated=?,revision=revision+1 WHERE id=? AND revision=? AND deleted IS NULL').bind(now,now,msg.id,p.revision).run();
 return r.meta.changes?json({ok:true}):json({error:'This message changed. Refresh and try again.'},409);
 }
 return json({error:'Unknown action.'},400);
 }catch(e){console.error(e);return json({error:'Could not save your update. Please retry.'},500);}}
