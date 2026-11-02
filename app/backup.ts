import { columns, validateBackup, MAX_BACKUP_BYTES } from './backup-model.mjs';
export async function snapshot(db:D1Database){
 const parts=Object.entries(columns).map(([table,names])=>`'${table}',json((SELECT COALESCE(json_group_array(json_object(${names.split(' ').map(c=>`'${c}',${c}`).join(',')})),'[]') FROM ${table}))`);
 // One statement gives all tables the same database snapshot.
 const row=await db.prepare(`SELECT json_object('format','weeknote-backup','version',4,'created',?,'tables',json_object(${parts.join(',')})) AS payload`).bind(Date.now()).first<{payload:string}>();
 if(!row)throw Error('Could not create backup.');
 if(new TextEncoder().encode(row.payload).length>MAX_BACKUP_BYTES)throw Error('Backup storage limit reached. Download/export the database before adding more records.');
 return row.payload;
}
export async function saveBackup(db:D1Database,kind='manual',key=crypto.randomUUID()){
 const payload=await snapshot(db);
 await db.batch([db.prepare('INSERT OR IGNORE INTO backups (id,created,kind,payload) VALUES (?,?,?,?)').bind(key,Date.now(),kind,payload),
 db.prepare("DELETE FROM backups WHERE kind='daily' AND id NOT IN (SELECT id FROM backups WHERE kind='daily' ORDER BY created DESC LIMIT 14)"),
 db.prepare("DELETE FROM backups WHERE kind<>'daily' AND id NOT IN (SELECT id FROM backups WHERE kind<>'daily' ORDER BY created DESC LIMIT 5)")]);
 return key;
}
export async function ensureDailyBackup(db:D1Database){
 const key='daily-'+new Date(Date.now()+21600000).toISOString().slice(0,10);
 if(!await db.prepare('SELECT id FROM backups WHERE id=?').bind(key).first())await saveBackup(db,'daily',key);
}
export async function restoreBackup(db:D1Database,input:unknown,actor:string){
 const backup=validateBackup(input);
 // Keep a recovery point before replacing anything. A failed backup blocks restore.
 await saveBackup(db,'before-restore');
 const queries=['login_sessions','login_attempts',...Object.keys(columns)].map(table=>db.prepare(`DELETE FROM ${table}`));
 for(const [table,names] of Object.entries(columns)){
  const rows=backup.tables[table];
  if(table==='members')for(const m of rows){m.seen=0;m.availability='Away';}
  if(table==='sessions')for(const s of rows)if(s.end===null){s.end=Math.max(s.start,backup.created);s.note=(s.note?s.note+' · ':'')+'Paused at backup time on restore';}
  queries.push(db.prepare(`INSERT INTO ${table} (${names.split(' ').join(',')}) SELECT ${names.split(' ').map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?)`).bind(JSON.stringify(rows)));
 }
 queries.push(db.prepare('INSERT INTO admin_events (id,actor,target,message,time) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),actor,'workspace','Restored workspace from backup dated '+new Date(backup.created).toISOString(),Date.now()));
 // D1 batch is transactional: either every table is restored or none is.
 await db.batch(queries);
}
