const dhakaDay=n=>new Date(n+21600000).toISOString().slice(0,10);
export function inWeek(task,week){
 const from=Date.parse(week+'T00:00:00+06:00'),until=from+7*86400000;
 if(task.deleted!=null||task.created>=until||task.week>week)return false;
 // Retain completed carryovers in their finishing week and earlier open weeks.
 return task.week===week||task.completed===null||task.completed>=from;
}
export function forgottenTimer(session,now){
 if(session.end!==null)return false;
 const checked=session.checked??session.start;
 return now-checked>=4*3600000||dhakaDay(checked)<dhakaDay(now);
}
