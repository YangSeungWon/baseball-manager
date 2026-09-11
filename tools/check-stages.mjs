import test from 'node:test';
import assert from 'node:assert/strict';
import {BattingGame} from '../web/js/batting-game.js';
import {InningGame} from '../web/js/inning-game.js';
import {STAGES} from '../web/js/inning-stages.js';
import {readChallenge,battingResult} from '../web/js/inning-share.js';
import {parkDims,fence} from '../web/js/core/bip.js';
const choice={target:'FF',approach:'contact',action:'swing',location:'out'};
const best=[0,.1,0,.9,0,.5,.5,.7,.5,.5];
test('each stage initializes its real count, runners, score target, pitcher and park',()=>{
 for(const s of STAGES){const g=new BattingGame(2,s.id);assert.equal(g.outs,s.outs);assert.equal(g.balls,s.balls);assert.equal(g.strikes,s.strikes);assert.deepEqual(g.bases,s.bases);assert.deepEqual(g.baseRunners.map(Boolean),s.bases);assert.equal(g.snapshot().stageId,s.id);}
 assert.equal(new BattingGame(2,2).delivery(best).v,152);assert.throws(()=>new BattingGame(1,3));
});
test('full count bases loaded walk wins the final stage without a swing',()=>{
 const g=new BattingGame(3,2),e=g.resolvePitch({...choice,action:'take'},[0,.99,0,0,0,0,0,0,0,0]);
 assert.equal(e.result,'BB');assert.equal(g.runs,1);assert.equal(g.won,true);assert.equal(g.done,true);
});
test('30 pitches never cut short either role; third out still ends the inning',()=>{
 for(const g of [new BattingGame(1),new InningGame(1)]){
  g.count=29;g.strikes=2;g.random=()=>.1;
  for(let i=0;i<10;i++){
   const e=g instanceof BattingGame?g.resolvePitch(choice,[0,0,0,0,.5,.5,.5,.7,.5,.5]):g.pitch({type:'FF',zone:'in',intent:'attack'});
   assert.equal(e.result,'F');assert.equal(g.done,false);
  }
  assert.equal(g.count,39);
 }
 const g=new BattingGame(1,2);g.resolvePitch({...choice,action:'take'},best);assert.equal(g.done,true);assert.equal(g.won,false);
});
test('guessing the wrong location cannot hide its quality loss behind the power cap',()=>{
 const play=(location,approach='contact',inZone=true,target='FF')=>new BattingGame(2).resolvePitch({...choice,location,approach,target},best.map((v,i)=>i===1&&!inZone?.99:v));
 const good=play('out'),miss=play('in'),chase=play('in','contact',false),power=play('out','power'),wrongPitch=play('out','contact',true,'CH');
 assert.deepEqual(good.pitch,miss.pitch);assert.ok(miss.fieldPlay.speed<good.fieldPlay.speed*.9);assert.ok(chase.fieldPlay.speed<miss.fieldPlay.speed);assert.ok(power.fieldPlay.speed>good.fieldPlay.speed);assert.ok(wrongPitch.fieldPlay.speed<good.fieldPlay.speed);
 assert.notEqual(chase.result,'HR');assert.equal(power.result,'HR');
});
test('stage links preserve the exact situation and reject old physics versions',()=>{
 for(const s of STAGES){const g=new BattingGame(42,s.id),r=battingResult(g.snapshot(),42,[]),c=readChallenge(new URL(r.url).search);assert.deepEqual(c,{stageId:s.id,seed:42});assert.deepEqual(new BattingGame(c.seed,c.stageId).snapshot(),g.snapshot());assert.ok(r.score.includes(s.away.short));}
 for(const q of ['?challenge=b5-42','?challenge=b7-3-42','?challenge=b7-0-4294967296','?challenge=b7-0-01','?challenge=b6-0-42'])assert.equal(readChallenge(q),null);
});
test('stage fences used by contact simulation match the renderer dimensions',()=>{
 for(const s of STAGES){const e=new BattingGame(2,s.id).resolvePitch({...choice,approach:'power'},best);if(!e.fieldPlay)continue;for(const event of e.fieldPlay.events.filter(e=>e.type==='home-run')){const a=Math.atan2(event.x,event.y)*180/Math.PI;assert.ok(Math.hypot(event.x,event.y)>=fence(a,parkDims(s.park)));}}
});
test('a deep fly wins the one-run stage by tag-up, while the same catch cannot score with two outs',()=>{
 const roll=[0,.1,0,.9,.26,.70,.5,.5,.5,.5],c={...choice,location:'any'};
 const g=new BattingGame(42,1),e=g.resolvePitch(c,roll);assert.equal(e.result,'OUT');assert.equal(e.scored,1);assert.equal(e.label,'희생플라이!');assert.equal(g.won,true);
 const two=new BattingGame(42,1);two.outs=2;const no=two.resolvePitch(c,roll);assert.equal(no.scored,0);assert.equal(two.won,false);assert.equal(two.done,true);
});
