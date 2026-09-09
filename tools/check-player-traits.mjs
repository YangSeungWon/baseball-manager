import test from 'node:test';
import assert from 'node:assert/strict';
import {defenseRoster} from '../web/js/player-traits.js';
import {simulateField} from '../web/js/field-sim.js';
import {BattingGame} from '../web/js/batting-game.js';
test('scouting snapshots are deterministic, isolated, and consume no pitch RNG',()=>{
 const g=new BattingGame(42),rng=g.rng,s=g.snapshot();assert.deepEqual(s.defense,defenseRoster(42));s.defense.CF.speed=100;assert.notEqual(g.snapshot().defense.CF.speed,100);assert.equal(g.rng,rng);
});
test('individual pursuit speed affects collection and stays within its trace speed',()=>{
 const slow=defenseRoster(0),fast=structuredClone(slow);slow.CF.speed=4;fast.CF.speed=10;
 const opts={speed:40,launch:30,angle:0,bases:[],batter:{speed:7},outs:1};
 const a=simulateField({...opts,defense:slow}),b=simulateField({...opts,defense:fast});
 assert.notEqual(a.events.find(e=>['catch','pickup'].includes(e.type)).t,b.events.find(e=>['catch','pickup'].includes(e.type)).t);
 for(let i=1;i<b.frames.length;i++)for(const f of b.frames[i].fielders){const p=b.frames[i-1].fielders.find(x=>x.pos===f.pos);assert.ok(Math.hypot(f.x-p.x,f.y-p.y)<=fast[f.pos].speed*(b.frames[i].t-b.frames[i-1].t)+1e-6);}
});
test('thrower arm changes arrival independently of pursuit',()=>{
 const a=defenseRoster(0),b=structuredClone(a);for(const f of Object.values(a))f.arm=20;for(const f of Object.values(b))f.arm=40;
 const opts={speed:40,launch:12,angle:20,bases:[],batter:{speed:7},outs:1};
 const x=simulateField({...opts,defense:a}),y=simulateField({...opts,defense:b});
 assert.deepEqual(x.events.find(e=>e.type==='pickup'),y.events.find(e=>e.type==='pickup'));
 assert.notEqual(x.running.contest.ballArrival,y.running.contest.ballArrival);
});
test('batter contact and power alter resolution with identical pitch rolls',()=>{
 const play=(contact,power=0)=>{const g=new BattingGame(0);Object.defineProperty(g,'batter',{get:()=>({id:'b',name:'test',speed:7,contact,power})});let i=0;g.random=()=>[0,0,.85,.9,.4,.5,.5,.5,.5,.5][i++];return g.pitch({target:'any',location:'any',approach:'contact',action:'swing'});};
 assert.equal(play(.67).call,'W');assert.ok(play(.77).fieldPlay);assert.ok(play(.77,.12).fieldPlay.speed>play(.77,0).fieldPlay.speed);
});
