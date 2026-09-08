import test from 'node:test';
import assert from 'node:assert/strict';
import {InningGame} from '../web/js/inning-game.js';
const attack={type:'FF',zone:'out',intent:'attack'};
test('same situation and choices reproduce all outcomes',()=>{
  const a=new InningGame(94),b=new InningGame(94);
  while(!a.done){const choice={type:['FF','SL','CH'][a.count%3],zone:'low',intent:a.strikes===2?'chase':'attack'};assert.deepEqual(a.pitch(choice),b.pitch(choice));}
  assert.throws(()=>a.pitch(attack));
});
test('walks force runners, score only forced runners and reset the count',()=>{
  const g=new InningGame(2);g.balls=3;g.bases=[true,true,true];g.random=()=>.99;
  const e=g.pitch({...attack,intent:'chase'});assert.equal(e.result,'BB');assert.equal(g.runs,1);assert.equal(g.balls,0);assert.deepEqual(g.bases,[true,true,true]);assert.equal(e.movements.length,4);
});
test('two-strike fouls never create a third strike',()=>{
  const g=new InningGame(4);g.strikes=2;g.random=()=>.1;
  assert.equal(g.pitch(attack).result,'F');assert.equal(g.strikes,2);assert.equal(g.outs,1);
});
test('strikeout closes an inning and challenge rejects invalid choices without mutation',()=>{
  const g=new InningGame(4);g.outs=2;g.strikes=2;const values=[0,0,.99,...Array(7).fill(.5)];g.random=()=>values.shift();
  assert.equal(g.pitch(attack).result,'K');assert.equal(g.won,true);
  const h=new InningGame(5),before=h.snapshot();assert.throws(()=>h.pitch({...attack,type:'invalid'}));assert.deepEqual(h.snapshot(),before);
});
test('challenge always terminates, legal counts/bases and varied choices affect results',()=>{
  let fast=0,mix=0;
  for(let seed=0;seed<500;seed++)for(const mode of [0,1]) {
    const g=new InningGame(seed);
    while(!g.done){g.pitch({...attack,type:mode?['FF','SL','CH'][g.count%3]:'FF',intent:mode&&g.strikes===2?'chase':'attack'});assert.ok(g.balls>=0&&g.balls<=3);assert.ok(g.strikes>=0&&g.strikes<=2);assert.ok(g.count<=30);assert.equal(g.bases.length,3);}
    assert.equal(g.won,g.outs===3&&g.runs<2);if(mode)mix+=g.won;else fast+=g.won;
  }
  assert.ok(fast>0&&fast<500);assert.ok(mix>fast);
});
