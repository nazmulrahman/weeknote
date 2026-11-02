import { env } from 'cloudflare:workers';
import { getMember,sameOrigin,cookie,audit } from '../../auth';
import { ensureDailyBackup,saveBackup,restoreBackup } from '../../backup';
import { MAX_BACKUP_BYTES,validateBackup } from '../../backup-model.mjs';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 const me=await getMember(request);if(!me)return json({error:'Please sign in.'},401);if(me.role!=='manager')return json({error:'Admin access required.'},403);
 const db=env.DB!;const id=new URL(request.url).searchParams.get('download');
 if(id){const row=await db.prepare('SELECT payload FROM backups WHERE id=?').bind(id).first<{payload:string}>();if(!row)return json({error:'Backup not found.'},404);return new Response(row.payload,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Content-Disposition':'attachment; filename="weeknote-backup.json"'}});}
 let backupError='';try{await ensureDailyBackup(db);}catch(e){backupError=(e as Error).message;}
 const [backups,trash]=await Promise.all([db.prepare('SELECT id,created,kind,length(payload) AS bytes FROM backups ORDER BY created DESC').all(),db.prepare('SELECT id,title,project,deleted,progress FROM tasks WHERE deleted IS NOT NULL ORDER BY deleted DESC').all()]);
 return json({backups:backups.results,trash:trash.results,backupError});
}
export async function POST(request:Request){
 try{
 const raw=await request.text();if(new TextEncoder().encode(raw).length>MAX_BACKUP_BYTES+500)return json({error:'Backup file is too large.'},413);
 if(!sameOrigin(request))return json({error:'Invalid origin.'},403);
 const me=await getMember(request);if(!me)return json({error:'Please sign in.'},401);if(me.role!=='manager')return json({error:'Admin access required.'},403);
 const p=JSON.parse(raw),db=env.DB!;
 if(p.action==='create'){const id=await saveBackup(db);return json({ok:true,id});}
 if(p.action==='restore'){
 let data=p.backup;if(p.id){const row=await db.prepare('SELECT payload FROM backups WHERE id=?').bind(String(p.id)).first<{payload:string}>();if(!row)return json({error:'Backup not found.'},404);data=JSON.parse(row.payload);}
 if(p.confirm!=='RESTORE')return json({error:'Type RESTORE to confirm replacing the workspace.'},400);
 await restoreBackup(db,validateBackup(data),me.id);
 return new Response(JSON.stringify({ok:true,signedOut:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie('',request,true)}});
 }
 if(p.action==='restoreTask'){
 await ensureDailyBackup(db);
 const task=await db.prepare('SELECT title FROM tasks WHERE id=? AND deleted IS NOT NULL').bind(String(p.id)).first<{title:string}>();if(!task)return json({error:'Task not found in Trash.'},404);
 await db.batch([db.prepare('UPDATE tasks SET deleted=NULL,revision=revision+1 WHERE id=?').bind(p.id),db.prepare('INSERT INTO events (id,task,member,message,time) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),p.id,me.id,'Restored from Trash',Date.now())]);await audit(me.id,p.id,'Restored task: '+task.title);return json({ok:true});
 }
 return json({error:'Unknown action.'},400);
 }catch(e){console.error(e);return json({error:(e as Error).message||'Backup action failed. Please retry.'},400);}
}
