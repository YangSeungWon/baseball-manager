import assert from 'node:assert/strict';
import {FullGame,FULL_LINEUP,FULL_STAGE} from '../web/js/full-game.js';
const outRoll=[0,.1,0,.9,.42,.55,.5,.5,.5,.5];
const choice={target:'any',approach:'contact',action:'swing',location:'any'};
const a=new FullGame(123456789),b=new FullGame(123456789);
assert.deepEqual(a.awayLine,b.awayLine,'same seed starts with same opponent inning');
let s=a.snapshot();
assert.equal(s.inning,1);assert.equal(s.full,true);assert.equal(s.lineup.length,9);assert.equal(s.lineup[0],FULL_LINEUP[0].name);assert.equal(FULL_STAGE.home.name,'고양 헌터스');
const t0=s.timeProgress;a.outs=2;let e=a.resolvePitch(choice,outRoll);
assert.equal(e.result,'OUT');assert.equal(e.halfEnded,true);assert.equal(e.completedInning,1);assert.equal(e.after.inning,2);assert.equal(e.after.outs,0);assert.ok(e.after.timeProgress>t0);assert.equal(e.after.awayLine.length,2);
while(!a.done){a.outs=2;e=a.resolvePitch(choice,outRoll);}
s=a.snapshot();assert.ok(s.inning>=9&&s.inning<=12);assert.equal(s.awayScore,s.awayLine.reduce((x,y)=>x+y,0));assert.equal(s.homeScore,0);assert.equal(s.done,true);assert.equal(s.won,s.homeScore>s.awayScore);assert.equal(s.tie,s.homeScore===s.awayScore);
const c=new FullGame(123456789);while(!c.done){c.outs=2;c.resolvePitch(choice,outRoll);}assert.deepEqual(c.snapshot().awayLine,s.awayLine,'full opponent line is deterministic');
console.log('full-game checks passed',s.inning,s.awayScore+':'+s.homeScore,s.tie?'tie':s.won?'win':'loss');
