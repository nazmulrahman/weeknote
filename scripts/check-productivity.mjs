import assert from 'node:assert/strict';
import {productivity,dailyTaskTime,timeInRange,pausedWork} from '../app/productivity.mjs';
const week='2026-11-01',from=Date.parse(week+'T00:00:00+06:00'),now=from+2*86400000;
const task=(estimate,assignees=['a'])=>({id:'t',week,created:from,completed:null,deleted:null,blocked:'',progress:40,estimate,assignees});
const session=(hours)=>({id:'s',task:'t',member:'a',start:from,end:from+hours*3600000});
for(const [worked,estimated,points,expected] of [[19,22,-3,5.090909091],[8,10,-3,3.5],[14,12,-3,6.416666667],[9.5,41,0,1.62195122],[31.09,29,0,7.504482759]]){
 const adjustments=[{member:'a',week,deadline_points:0,low_tasks:points===-3?1:0,high_tasks:0,uneven_days:0,unapproved_hours:points===-3?4:0}];
 const result=productivity('a',week,[task(estimated)],[session(worked)],adjustments,now);
 assert.ok(Math.abs(result.score-expected)<1e-8,'matches workbook score example');
}
assert.equal(productivity('a',week,[task(null)],[session(2)],[],now).score,null,'missing estimates are unavailable');
assert.equal(productivity('a',week,[task(10,['a','b'])],[session(5)],[],now).score,7,'shared estimate divided equally');
const midnight=Date.parse('2026-11-02T00:00:00+06:00'),cross=[{id:'night',task:'t',member:'a',start:midnight-3600000,end:midnight+2*3600000}];
assert.deepEqual(dailyTaskTime(cross,'t',now),[['2026-11-02',7200000],['2026-11-01',3600000]],'sessions split at Dhaka midnight');
assert.equal(timeInRange(cross,midnight,midnight+86400000,now,'t','a'),7200000);
const running=[{id:'active',task:'t',member:'a',start:from,end:null}];assert.equal(timeInRange(running,from,from+86400000,from+1000,'t','a'),1000);
const paused=[{...session(1),finish_kind:'pause'}];assert.ok(pausedWork(paused,'a',[task(2)]));assert.ok(!pausedWork([{...paused[0],finish_kind:'stop'}],'a',[task(2)]));assert.ok(!pausedWork(paused,'a',[task(2,['b'])]));
console.log('PASS: five workbook score examples, unbounded score, missing/shared estimates, midnight splitting, running time and paused/stopped state.');
