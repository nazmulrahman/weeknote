// Fixed columns keep exported snapshots portable and prevent uploaded SQL.
export const columns = {
 members: 'id name role availability seen sample',
 accounts: 'member username password_hash active',
 tasks: 'id title project owner assignees week deadline estimate progress priority blocked notes completed created revision sample deleted',
 sessions: 'id task member start end budget remind note checked finish_kind',
 events: 'id task member message time',
 admin_events: 'id actor target message time',
 auth_setup: 'id',
 board_notes: 'id author body color created updated revision archived x y width height',
 score_adjustments: 'id member week deadline_points low_tasks high_tasks uneven_days unapproved_hours note updated actor revision',
 messages: 'id sender recipient body created updated revision deleted read',
};
export const MAX_BACKUP_BYTES = 1800000;
export function validateBackup(value) {
 const fail=()=>{throw Error('This is not a valid Weeknote backup. Nothing was restored.');};
 if(!value||value.format!=='weeknote-backup'||![1,2,3,4].includes(value.version)||!Number.isSafeInteger(value.created)||value.created<=0||value.created>Date.now()+60000||!value.tables)fail();
 const tables=value.tables;
 // Version 1 predates the board. Preserve compatibility with existing files.
 if(value.version===1){tables.board_notes??=[];tables.messages??=[];}
 if(value.version<3)for(const [i,n] of (tables.board_notes||[]).entries()){n.x=(i%10)*214;n.y=Math.floor((i%200)/10)*200;n.width=190;n.height=180;}
 if(value.version<4){tables.score_adjustments??=[];for(const s of (tables.sessions||[]))s.finish_kind??=null;}
 const nullable=new Set('deadline estimate completed deleted end budget remind checked archived recipient read finish_kind'.split(' '));
 const numeric=new Set('seen sample active estimate progress completed created revision deleted start end budget remind checked time updated archived read x y width height deadline_points low_tasks high_tasks uneven_days unapproved_hours'.split(' '));
 for(const [table,names] of Object.entries(columns)){
  if(!Array.isArray(tables[table]))fail();
  const ids=new Set();
  for(const row of tables[table]){
   if(!row||typeof row!=='object'||Array.isArray(row))fail();
   for(const key of names.split(' ')){
    const v=row[key];if(v===null&&nullable.has(key))continue;
    if(numeric.has(key)?typeof v!=='number'||!Number.isFinite(v):typeof v!=='string')fail();
   }
   const key=row[table==='accounts'?'member':'id'];if(!key||ids.has(key))fail();ids.add(key);
  }
 }
 const members=new Map(tables.members.map(m=>[m.id,m])),tasks=new Map(tables.tasks.map(t=>[t.id,t]));
 const usernames=new Set();let admin=false;
 for(const m of members.values())if(!['member','manager'].includes(m.role)||![0,1].includes(m.sample))fail();
 for(const a of tables.accounts){if(!members.has(a.member)||!a.username||usernames.has(a.username)||![0,1].includes(a.active)||!/^pbkdf2-sha256\$100000\$[a-f0-9]{64}\$[a-f0-9]{64}$/.test(a.password_hash))fail();usernames.add(a.username);if(a.active&&members.get(a.member).role==='manager')admin=true;}
 if(!admin||!tables.auth_setup.length)fail();
 for(const t of tasks.values()){
  let assigned;try{assigned=JSON.parse(t.assignees);}catch{fail();}
  if(!Array.isArray(assigned)||!assigned.length||assigned.some(id=>!members.has(id))||!assigned.includes(t.owner)||!/^\d{4}-\d{2}-\d{2}$/.test(t.week)||!Number.isInteger(t.progress)||t.progress<0||t.progress>100||!Number.isSafeInteger(t.revision)||t.revision<0||t.created>value.created||(t.estimate!==null&&t.estimate<=0)||((t.progress===100)!==(t.completed!==null)))fail();
 }
 const running=new Set();
 for(const s of tables.sessions){if(![null,'pause','stop'].includes(s.finish_kind))fail();if(!tasks.has(s.task)||!members.has(s.member)||s.start<0||s.start>value.created||(s.end!==null&&(s.end<s.start||s.end>value.created)))fail();if(s.end===null){if(running.has(s.member)||tasks.get(s.task).deleted!==null)fail();running.add(s.member);}}
 for(const e of tables.events)if(!tasks.has(e.task)||!members.has(e.member))fail();
 for(const n of tables.board_notes)if(!members.has(n.author)||!['yellow','blue','pink','green'].includes(n.color)||!n.body.trim()||n.body.length>3000||![n.x,n.y,n.width,n.height].every(Number.isInteger)||n.x<0||n.y<0||n.width<160||n.width>600||n.height<150||n.height>700||n.x+n.width>6000||n.y+n.height>4000)fail();
 for(const m of tables.messages)if(!members.has(m.sender)||(m.recipient!==null&&(!members.has(m.recipient)||m.recipient===m.sender))||!m.body.trim()||m.body.length>3000)fail();
 for(const a of tables.score_adjustments)if(!members.has(a.member)||!members.has(a.actor)||!/^\d{4}-\d{2}-\d{2}$/.test(a.week)||!Number.isInteger(a.deadline_points)||a.deadline_points%5||Math.abs(a.deadline_points)>1000||![a.low_tasks,a.high_tasks,a.uneven_days].every(v=>Number.isInteger(v)&&v>=0&&v<=1000)||a.unapproved_hours<0||a.unapproved_hours>10000)fail();
 if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_BACKUP_BYTES)throw Error('This backup is too large to restore here.');
 return value;
}
