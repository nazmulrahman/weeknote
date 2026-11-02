import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {snapshot,saveBackup,ensureDailyBackup,restoreBackup} from '../app/backup.ts';
import {validateBackup} from '../app/backup-model.mjs';
import {inWeek,forgottenTimer} from '../app/work-rules.mjs';
const sql=new DatabaseSync(':memory:');
for(const file of ['0000_premium_virginia_dare','0001_acoustic_sasquatch','0002_workspace_safety','0003_board_messages','0004_note_canvas','0005_time_scores'])sql.exec(readFileSync(new URL('../drizzle/'+file+'.sql',import.meta.url),'utf8'));
class Statement{
 constructor(query,args=[]){this.query=query;this.args=args;}
 bind(...args){return new Statement(this.query,args);}
 async first(){return sql.prepare(this.query).get(...this.args)||null;}
 async all(){return {results:sql.prepare(this.query).all(...this.args)};}
 async run(){return {meta:{changes:Number(sql.prepare(this.query).run(...this.args).changes)}};}
}
let failRestore=false;
const db={prepare:q=>new Statement(q),batch:async statements=>{sql.exec('BEGIN');try{const values=[];for(const s of statements){if(failRestore&&s.query.startsWith('INSERT INTO tasks'))throw Error('simulated failure');values.push({meta:{changes:Number(sql.prepare(s.query).run(...s.args).changes)}});}sql.exec('COMMIT');return values;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const now=Date.now(),hash='pbkdf2-sha256$100000$'+'a'.repeat(64)+'$'+'b'.repeat(64);
sql.prepare("INSERT INTO members VALUES ('a','Admin','manager','Available',?,0)").run(now);
sql.prepare("INSERT INTO accounts VALUES ('a','admin',?,1)").run(hash);
sql.exec("INSERT INTO auth_setup VALUES ('initialized')");
sql.prepare("INSERT INTO tasks (id,title,owner,assignees,week,created) VALUES ('t','Shared task','a','[\"a\"]','2026-10-18',?)").run(now-10000);
sql.prepare("INSERT INTO sessions (id,task,member,start,remind) VALUES ('s','t','a',?,?)").run(now-9000,now+100000);
sql.prepare("INSERT INTO events VALUES ('e','t','a','Started',?)").run(now-8000);
sql.prepare("INSERT INTO login_sessions VALUES ('token','a',?)").run(now+100000);
await Promise.all([ensureDailyBackup(db),ensureDailyBackup(db)]);
assert.equal(sql.prepare("SELECT count(*) n FROM backups WHERE kind='daily'").get().n,1,'one daily backup even with concurrent calls');
sql.prepare("INSERT INTO board_notes (id,author,body,color,created,updated,revision,archived,x,y,width,height) VALUES ('n','a','Keep this note','yellow',?,?,0,NULL,120,80,210,200)").run(now-7000,now-7000);
sql.prepare("INSERT INTO members VALUES ('b','Member','member','Away',0,0)").run();
sql.prepare("INSERT INTO messages VALUES ('dm','a','b','Private backup test',?,?,0,NULL,NULL)").run(now-6000,now-6000);
sql.prepare("INSERT INTO score_adjustments (id,member,week,deadline_points,low_tasks,high_tasks,uneven_days,unapproved_hours,note,updated,actor) VALUES ('score','a','2026-11-01',5,1,2,1,2,'Approved test',?,'a')").run(now);
const payload=JSON.parse(await snapshot(db));assert.equal(validateBackup(payload).tables.sessions.length,1);assert.ok(!('login_sessions' in payload.tables),'login tokens excluded');
for(let i=0;i<7;i++)await saveBackup(db);assert.equal(sql.prepare("SELECT count(*) n FROM backups WHERE kind='manual'").get().n,5,'retention capped');
assert.equal(payload.tables.board_notes[0].x,120,'backup preserves canvas position');const badLayout=structuredClone(payload);badLayout.tables.board_notes[0].width=9999;assert.throws(()=>validateBackup(badLayout),'invalid canvas geometry rejected');const v2=structuredClone(payload);v2.version=2;for(const n of v2.tables.board_notes)for(const k of ['x','y','width','height'])delete n[k];assert.equal(validateBackup(v2).tables.board_notes[0].width,190,'old board backups get compact defaults');
const invalid=structuredClone(payload);invalid.tables.accounts[0].active=0;assert.throws(()=>validateBackup(invalid),'cannot restore without admin');
const broken=structuredClone(payload);broken.tables.sessions[0].task='missing';assert.throws(()=>validateBackup(broken),'reject orphaned time records');
sql.exec("UPDATE tasks SET title='Changed after backup'");
failRestore=true;await assert.rejects(()=>restoreBackup(db,payload,'a'));failRestore=false;
assert.equal(sql.prepare('SELECT title FROM tasks').get().title,'Changed after backup','failed restore rolls back');
assert.equal(sql.prepare('SELECT count(*) n FROM login_sessions').get().n,1,'failed restore keeps sign in');
await restoreBackup(db,payload,'a');
assert.equal(sql.prepare('SELECT body FROM board_notes').get().body,'Keep this note');assert.equal(sql.prepare('SELECT x FROM board_notes').get().x,120);assert.equal(sql.prepare('SELECT deadline_points FROM score_adjustments').get().deadline_points,5);assert.equal(sql.prepare('SELECT body FROM messages').get().body,'Private backup test');
const legacy=structuredClone(payload);legacy.version=1;delete legacy.tables.board_notes;delete legacy.tables.messages;assert.equal(validateBackup(legacy).tables.messages.length,0,'old backups gain empty communication tables');
assert.equal(sql.prepare('SELECT title FROM tasks').get().title,'Shared task');assert.equal(sql.prepare('SELECT end FROM sessions').get().end,payload.created,'restored timers paused at snapshot');assert.equal(sql.prepare('SELECT count(*) n FROM login_sessions').get().n,0,'restore signs everybody out');assert.equal(sql.prepare('SELECT count(*) n FROM backups WHERE kind=\'before-restore\'').get().n,2,'recovery points retained');
const task={week:'2026-10-18',created:Date.parse('2026-10-18T00:00:00+06:00'),completed:null,deleted:null};
assert.ok(inWeek(task,'2026-11-01'),'unfinished carryover');
const completed={...task,completed:Date.parse('2026-11-03T12:00:00+06:00')};assert.ok(inWeek(completed,'2026-11-01'),'done carryover stays in completion week');assert.ok(!inWeek(completed,'2026-11-08'),'stops carrying next week');assert.ok(!inWeek({...task,deleted:now},'2026-11-01'),'trash excluded');assert.ok(!inWeek(task,'2026-10-11'),'future task excluded');
const start=Date.parse('2026-11-01T20:30:00+06:00');const session={start,end:null,checked:null};assert.ok(!forgottenTimer(session,start+3*3600000));assert.ok(forgottenTimer(session,start+4*3600000));assert.ok(forgottenTimer(session,Date.parse('2026-11-02T00:00:00+06:00')),'midnight check');assert.ok(!forgottenTimer({...session,checked:start+4*3600000},start+5*3600000),'check in dismisses forgotten reminder');assert.ok(!forgottenTimer({...session,end:start+100},start+8*3600000),'stopped timers ignored');
sql.close();console.log('PASS: atomic snapshots, daily deduplication, retention, validation, transactional restore and rollback, session revocation, recovery backup, weekly carryover boundaries and forgotten timers.');
