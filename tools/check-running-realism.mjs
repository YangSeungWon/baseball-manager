import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRunning} from '../web/js/base-running.js';
import {simulateField,sampleField} from '../web/js/field-sim.js';
import {runningRoute,routePoint,leadPosition,runnerArrival,runnerPosition,leadDistance} from '../web/js/runner-motion.js';
import {BattingGame} from '../web/js/batting-game.js';
const close=(a,b,eps=.003)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
test('late receiver delays release, never slows airborne throw',()=>{
 const fielders=[{pos:'SS',x:0,y:38.8},{pos:'1B',x:39.4,y:19.4}],raw={speed:30,launch:8,handler:'SS',frames:[{t:0,x:0,y:38.8,z:.12,fielders}],events:[{type:'pickup',t:0}],result:'LIVE'};
 const p=resolveRunning(raw,{bases:[],batter:{speed:6},defense:{SS:{speed:7,arm:40},'1B':{speed:6,arm:35}}});
 const c=p.running.contest,ev=p.events.find(e=>e.type==='throw');assert.ok(ev);assert.ok(ev.t>.35);assert.ok(c.ballArrival>=c.receiverReady-1e-9);
 const a=sampleField(p,ev.t+.1),b=sampleField(p,ev.t+.3);close(Math.hypot(b.x-a.x,b.y-a.y)/.2,ev.velocity);
 const held=sampleField(p,ev.t-.1);close(held.x,0);close(held.y,38.8);
});
test('lead shown before contact equals the first replay frame and reduces travel time',()=>{
 const opts={speed:40,launch:12,angle:20,batter:{speed:8.2}};
 const led=simulateField({...opts,bases:[{id:'r',speed:8.2,lead:3.4},null,null]}),bag=simulateField({...opts,bases:[{id:'r',speed:8.2,lead:0},null,null]});
 const shown=led.frames[0].runners.find(r=>r.id==='r'),pos=leadPosition(1,{lead:3.4});close(shown.x,pos.x);close(shown.y,pos.y);
 assert.ok(runnerArrival(led.running.runners[1],2)<runnerArrival(bag.running.runners[1],2));
});
test('fly-ball runner returns to the bag before a tag-up, with continuous bounded movement',()=>{
 const p=simulateField({speed:40,launch:40,angle:0,bases:[null,{id:'r',speed:8.2},null],outs:1});
 assert.ok(p.events.some(e=>e.type==='catch'));const r=p.running.runners[1],at=runnerPosition(r,r.returnEnd);close(at.x,0);close(at.y,38.8);assert.ok(r.start>=r.returnEnd);
 for(let i=1;i<p.frames.length;i++){const a=p.frames[i-1].runners[1],b=p.frames[i].runners[1];assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<=r.speed*(p.frames[i].t-p.frames[i-1].t)+.003);}
});
test('curved route touches every bag and has a continuous direction through corners',()=>{
 const route=runningRoute(0);
 for(const base of [1,2,3]){const d=route.bags[base],p=routePoint(route,d),a=routePoint(route,d-.05),b=routePoint(route,d+.05),expected=[[0,0],[19.4,19.4],[0,38.8],[-19.4,19.4]][base];close(p.x,expected[0]);close(p.y,expected[1]);const dot=((p.x-a.x)*(b.x-p.x)+(p.y-a.y)*(b.y-p.y))/(Math.hypot(p.x-a.x,p.y-a.y)*Math.hypot(b.x-p.x,b.y-p.y));assert.ok(dot>.9);}
});
test('new batter becomes a runner with a fresh lead, and roster speeds yield a quicker first-base arrival',()=>{
 const g=new BattingGame(0);assert.equal(g.batter.speed,9);
 const p=simulateField({speed:32,launch:25,angle:20,batter:g.batter});
 const r=p.running.runners[0];assert.ok(runnerArrival(r,1)<4.5);const base=p.running.bases.find(Boolean);assert.ok(base);assert.equal(base.lead,undefined);assert.ok(leadDistance(1,base)>3);
});
