import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulateField,sampleField} from '../web/js/field-sim.js';
import {runningTime,resolveRunning,RUN_BASES} from '../web/js/base-running.js';
import {BattingGame} from '../web/js/batting-game.js';
test('same ground ball: batter speed changes an out into a single',()=>{
 const input={speed:32,launch:25,angle:20};
 const slow=simulateField({...input,batter:{speed:5.5}}),fast=simulateField({...input,batter:{speed:9}});
 assert.equal(slow.result,'OUT');assert.equal(fast.result,'1B');
 assert.equal(slow.running.contest.ballArrival,fast.running.contest.ballArrival);
 assert.ok(slow.running.contest.runnerArrival>slow.running.contest.ballArrival);
 assert.ok(fast.running.contest.runnerArrival<fast.running.contest.ballArrival);
});
test('same outfield hit: speed changes the safe base without a time cutoff',()=>{
 const input={speed:40,launch:12,angle:20};
 assert.equal(simulateField({...input,batter:{speed:5.5}}).result,'1B');
 const fast=simulateField({...input,batter:{speed:9}});assert.equal(fast.result,'2B');assert.equal(fast.running.contest.base,2);assert.equal(fast.running.contest.out,false);
});
test('existing runner from second scores only when travel beats the throw',()=>{
 // 좌중간 안타. 중계를 거친 홈 송구와 2루 주자의 주력이 겨루는 타구다.
 const input={speed:42,launch:18,angle:-20,batter:{speed:7}};
 const slow=simulateField({...input,bases:[null,{id:'r',speed:5.5},null]}),fast=simulateField({...input,bases:[null,{id:'r',speed:9},null]});
 assert.equal(slow.running.scored,0);assert.equal(slow.running.bases[2].id,'r');
 assert.equal(fast.running.scored,1);
 // 홈에서 승부가 안 되면 홈으로 던지지 않는다. 뒤 주자를 묶는 쪽으로 간다.
 assert.ok(fast.running.contest.base<4,'a hopeless throw home is not made');
});
test('a long throw goes through a relay, so the outfield cannot beat a runner by magic',()=>{
 // 우익수 깊은 곳에서 3루까지. 잡고 던지는 시간 + 중계 + 공기저항이 모두 붙는다.
 const deep={speed:44,launch:22,angle:33,batter:{speed:8.2},bases:[{id:'r',speed:8.2},null,null]};
 const p=simulateField(deep);
 const grab=p.events.find(e=>e.type==='pickup'||e.type==='catch'),thrown=p.events.find(e=>e.type==='throw');
 assert.ok(['LF','CF','RF'].includes(p.handler),'this ball is fielded in the outfield: '+p.handler);
 assert.ok(thrown.t-grab.t>=.6,'an outfielder needs a step before releasing');
 const [tx,ty]=RUN_BASES[p.running.contest.base],distance=Math.hypot(thrown.x-tx,thrown.y-ty);
 const flight=p.running.contest.ballArrival-thrown.t;
 if(distance>55)assert.ok(flight>distance/38,`a ${distance.toFixed(0)}m relay cannot travel at full arm speed (${flight.toFixed(2)}s)`);
 assert.ok(flight<distance/12,'the throw is still a throw, not a lob');
});
test('with two outs the defense takes the surest out instead of chasing the lead runner',()=>{
 const bases=[{id:'first',speed:8.2},{id:'second',speed:4.2},null];
 const input={speed:26,launch:4,angle:-12,batter:{speed:8.2},bases};
 const one=simulateField({...input,outs:1}),two=simulateField({...input,outs:2});
 for(const p of [one,two])assert.ok(p.running.contest,'a fielded ground ball produces a throw');
 const margin=p=>p.running.contest.runnerArrival-p.running.contest.ballArrival;
 assert.ok(two.running.contest.out,'the two-out throw is an out');
 assert.ok(margin(two)>=margin(one)-1e-9,'with two outs it never takes the riskier base');
});
test('runner and receiver traces respect speeds and match render samples',()=>{
 const p=simulateField({speed:40,launch:12,angle:20,batter:{id:'b',speed:9},bases:[{id:'r',speed:7},null,null]});
 for(let i=1;i<p.frames.length;i++){
  const a=p.frames[i-1],b=p.frames[i],dt=b.t-a.t;
  for(let j=0;j<b.runners.length;j++)assert.ok(Math.hypot(b.runners[j].x-a.runners[j].x,b.runners[j].y-a.runners[j].y)<=9*dt+.002);
  for(let j=0;j<b.fielders.length;j++)assert.ok(Math.hypot(b.fielders[j].x-a.fielders[j].x,b.fielders[j].y-a.fielders[j].y)<=7.2*dt+1e-6);
  const sampled=sampleField(p,b.t);assert.ok(Math.abs(sampled.runners[0].x-b.runners[0].x)<1e-7);
 }
});
test('third force out cancels runs; a third-out catch cannot score a run',()=>{
 const bases=[{id:'a',speed:9},{id:'b',speed:9},{id:'c',speed:9}];
 const p=simulateField({speed:28,launch:6,angle:20,bases,batter:{speed:4},outs:2});
 assert.equal(p.running.outs,1);assert.equal(p.running.scored,0);
 const caught=simulateField({speed:40,launch:40,angle:0,bases,outs:2});assert.equal(caught.result,'OUT');assert.equal(caught.running.scored,0);
});
test('walk preserves runner identity and speed; launch is independent of extra advance random rolls',()=>{
 const g=new BattingGame(1);g.balls=3;g.random=()=>.99;const before=g.snapshot();g.pitch({target:'any',approach:'contact',action:'take'});
 assert.equal(g.snapshot().baseRunners[2].id,before.baseRunners[1].id);
 assert.equal(g.snapshot().baseRunners[1].speed,before.baseRunners[0].speed);
 const roll=[0,.1,.1,.5,.3,.2,.5,.5,0,0],choice={target:'any',approach:'contact',action:'swing'};
 const a=new BattingGame(1).resolvePitch(choice,roll),b=new BattingGame(1).resolvePitch(choice,[...roll.slice(0,8),.99,.99]);assert.deepEqual(a,b);
 assert.ok(runningTime(27.4,9)<runningTime(27.4,6));
});
