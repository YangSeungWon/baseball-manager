import test from 'node:test';
import assert from 'node:assert/strict';
import {challengeSeed,battingResult} from '../web/js/inning-share.js';
import {BattingGame} from '../web/js/batting-game.js';
test('challenge links preserve uint32 seeds and reject malformed or unsupported versions',()=>{
  for(const seed of [0,42,4294967295])assert.equal(challengeSeed('?challenge=b5-'+seed),seed);
  for(const q of ['', '?challenge=b5--1','?challenge=b5-4294967296','?challenge=b5-1x','?challenge=b1-42','?challenge=b3-42','?challenge=b4-42','?challenge=b5-01'])assert.equal(challengeSeed(q),null);
});
test('shared results use complete run records and reproduce the same starting challenge',()=>{
  const a=new BattingGame(7),events=[],choice={target:'any',approach:'contact',action:'take'};
  while(!a.done)events.push(a.pitch(choice));
  const result=battingResult(a.snapshot(),7,events),seed=challengeSeed(new URL(result.url).search),b=new BattingGame(seed);
  for(const event of events)assert.deepEqual(b.pitch(choice),event);
  assert.match(result.text,new RegExp(a.count+'구'));assert.ok(result.url.endsWith('b5-7'));
  assert.equal(new URL(result.url).searchParams.size,1);
});
