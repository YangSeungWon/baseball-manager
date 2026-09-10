import test from 'node:test';
import assert from 'node:assert/strict';
import {BattingGame} from '../web/js/batting-game.js';
const choice={target:'any',approach:'contact',action:'swing'};
const rolls=(g,values)=>{let i=0;g.random=()=>values[i++]??.5;};
test('taking a pitch respects the strike zone and the third strike ends the at-bat',()=>{
  const g=new BattingGame(1);g.strikes=2;rolls(g,[0,0]);
  const e=g.pitch({...choice,action:'take'});assert.equal(e.call,'S');assert.equal(e.result,'K');assert.equal(g.outs,2);assert.equal(g.strikes,0);
  rolls(g,[0,.99]);assert.equal(g.pitch({...choice,action:'take'}).result,'B');assert.equal(g.balls,1);
});
test('opponent pitch is independent of player selection',()=>{
  for(let seed=0;seed<100;seed++) {
    const a=new BattingGame(seed*7919),b=new BattingGame(seed*7919);
    assert.deepEqual(a.pitch(choice).pitch,b.pitch({target:'CH',approach:'power',action:'take',location:'low'}).pitch);
  }
});
test('three-run home run wins from the starting situation',()=>{
  const g=new BattingGame(3);rolls(g,[0,0,0,.9,0,.5]);
  const e=g.pitch({target:'FF',approach:'power',action:'swing'});
  assert.equal(e.result,'HR');assert.equal(g.runs,3);assert.equal(g.won,true);assert.equal(g.done,true);assert.equal(e.movements.length,3);
});
test('a tied inning ends without claiming a walk-off win',()=>{
  const g=new BattingGame(3);g.runs=2;g.outs=2;g.strikes=2;rolls(g,[0,0]);
  g.pitch({...choice,action:'take'});assert.equal(g.done,true);assert.equal(g.won,false);
});
test('same choices replay exactly, all runs finish, bad input cannot mutate state',()=>{
  for(let seed=0;seed<200;seed++) {
    const a=new BattingGame(seed*7919),b=new BattingGame(seed*7919);
    while(!a.done){const c={...choice,target:a.count%2?'FF':'any',approach:a.count%3?'contact':'power'};assert.deepEqual(a.pitch(c),b.pitch(c));assert.ok(a.count<300);assert.ok(a.strikes<3);assert.ok(a.balls<4);}
    assert.throws(()=>a.pitch(choice));
  }
  const g=new BattingGame(1),s=g.snapshot();assert.throws(()=>g.pitch({...choice,action:'bad'}));assert.deepEqual(g.snapshot(),s);
});

test('location prediction changes contact, never the committed pitch or take judgment',()=>{
  const play=(location,action='swing')=>{const g=new BattingGame(1);rolls(g,[.1,.1,.9,.1,.5,.5,.1,.1]);return g.pitch({...choice,location,action});};
  const inside=play('in'),outside=play('out'),low=play('low');
  assert.deepEqual(inside.pitch,outside.pitch);assert.deepEqual(inside.pitch,low.pitch);
  assert.equal(inside.result,'F');assert.equal(low.result,'F');assert.equal(outside.result,'W');
  assert.match(inside.explanation,/예상한 코스로/);assert.match(outside.explanation,/코스와 달라/);
  assert.equal(play('in','take').result,play('out','take').result);
  const g=new BattingGame(4),before=g.snapshot();assert.throws(()=>g.pitch({...choice,location:'bad'}));assert.deepEqual(g.snapshot(),before);
});

test('prepared delivery waits for a decision, resolves once and consumes no extra randomness',()=>{
  const a=new BattingGame(7),b=new BattingGame(7),before=a.snapshot();
  const delivery=a.preparePitch(choice),rng=a.rng;
  assert.deepEqual(a.snapshot(),before);assert.equal(a.history.length,0);
  assert.throws(()=>a.preparePitch(choice));assert.throws(()=>a.decidePitch('invalid'));
  assert.equal(a.rng,rng);assert.deepEqual(a.decidePitch('swing'),b.pitch(choice));assert.equal(a.rng,rng);
  assert.throws(()=>a.decidePitch('take'));
  const c=new BattingGame(7);assert.deepEqual(c.preparePitch(choice),delivery);
  assert.deepEqual(c.decidePitch('take').pitch,delivery);
});
