// Add the note canvas layout fields after making a local SQLite recovery copy.
import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {findLocalDatabase} from './recover-admin-lib.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const db=new DatabaseSync(process.argv[2]||findLocalDatabase(root));
try{
 db.exec('PRAGMA busy_timeout=5000');
 if(db.prepare('PRAGMA table_info(board_notes)').all().some(c=>c.name==='x')){console.log('Note canvas migration already applied.');}
 else{
 const directory=path.join(root,'.local-backups');mkdirSync(directory,{recursive:true,mode:0o700});const copy=path.join(directory,'before-canvas-migration-'+Date.now()+'.sqlite');await backup(db,copy);
 db.exec('BEGIN IMMEDIATE');try{db.exec(readFileSync(new URL('../drizzle/0004_note_canvas.sql',import.meta.url),'utf8'));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 console.log('Note canvas migration applied. Recovery copy: '+copy);
 }
}finally{db.close();}
