// Private first-deployment SQL export. Does not upload or modify the original database.
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {findLocalDatabase} from './recover-admin-lib.mjs';
import {columns} from '../app/backup-model.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'.cloudflare');mkdirSync(directory,{recursive:true,mode:0o700});
const source=new DatabaseSync(findLocalDatabase(root),{readOnly:true}),copy=path.join(directory,'initial-transfer-'+Date.now()+'.sqlite');await backup(source,copy);source.close();chmodSync(copy,0o600);
const db=new DatabaseSync(copy,{readOnly:true}),at=Date.now();
try{
 if(!db.prepare("SELECT id FROM auth_setup WHERE id='initialized'").get()||!db.prepare("SELECT a.member FROM accounts a JOIN members m ON m.id=a.member WHERE a.active=1 AND m.role='manager' AND m.sample=0 LIMIT 1").get())throw Error('A configured active admin is required before publishing.');
 const journal=JSON.parse(readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
 const parts=journal.entries.map(e=>readFileSync(path.join(root,'drizzle',e.tag+'.sql'),'utf8'));
 const literal=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
 const counts={};
 for(const [table,names] of Object.entries(columns)){
  const fields=names.split(' '),rows=db.prepare('SELECT '+fields.map(f=>'"'+f+'"').join(',')+' FROM "'+table+'"').all();counts[table]=rows.length;
  for(const row of rows){if(table==='members'){row.seen=0;row.availability='Away';}if(table==='sessions'&&row.end===null){row.end=at;row.finish_kind='stop';row.note=(row.note?row.note+' · ':'')+'Paused on transfer to online workspace';}
   parts.push('INSERT INTO "'+table+'" ('+fields.map(f=>'"'+f+'"').join(',')+') VALUES ('+fields.map(f=>literal(row[f])).join(',')+');');
  }
 }
 // Preserve existing recovery snapshots without copying login tokens or rate limits.
 const backups=db.prepare('SELECT id,created,kind,payload FROM backups').all();for(const row of backups)parts.push('INSERT INTO backups (id,created,kind,payload) VALUES ('+[row.id,row.created,row.kind,row.payload].map(literal).join(',')+');');
 const output=path.join(directory,'initial-transfer.sql');writeFileSync(output,parts.join('\n')+'\n',{mode:0o600});chmodSync(output,0o600);
 writeFileSync(path.join(directory,'initial-transfer-summary.json'),JSON.stringify({at,counts,backups:backups.length,sourceCopy:copy},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({exported:true,output,counts,backups:backups.length}));
}finally{db.close();}
