// Apply the additive safety migration locally, taking a consistent SQLite copy first.
import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findLocalDatabase} from './recover-admin-lib.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const filename=process.argv[2]||findLocalDatabase(root),db=new DatabaseSync(filename);
try{
 db.exec('PRAGMA busy_timeout=5000');
 if(db.prepare('PRAGMA table_info(tasks)').all().some(c=>c.name==='deleted')){console.log('Safety migration already applied.');process.exitCode=0;}
 else{
 const directory=path.join(root,'.local-backups');mkdirSync(directory,{recursive:true,mode:0o700});
 const copy=path.join(directory,'before-safety-migration-'+Date.now()+'.sqlite');await backup(db,copy);
 db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync(new URL('../drizzle/0002_workspace_safety.sql',import.meta.url),'utf8'));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 console.log('Safety migration applied. Original database copy: '+copy);
 }
}finally{db.close();}
