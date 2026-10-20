import test from 'node:test';
import assert from 'node:assert/strict';
import {QuickGame,makePitch,judgePitch,inQuickZone} from '../web/js/quick-game.js';
import {makeQuickPitcher,pitchFamily} from '../web/js/quick-pitches.js';
const force=(game,x=0,z=0,type='FF')=>{game.current={...game.pitch,x,z,type};};
const ball=game=>{force(game,1.4);return game.resolve(null);};
const strike=game=>{force(game);return game.resolve(null);};
const hit=(game,distance)=>{force(game,distance===4?0:.6);game.setApproach(distance===1?'contact':'fast');return game.resolve(0);};

test('a pitcher has a stable repertoire, report totals 100%, and retries reproduce the sequence',()=>{
  const seen=new Set();
  for(let seed=0;seed<100;seed++){
    const a=new QuickGame(seed),b=new QuickGame(seed);assert.deepEqual(a.pitcher,b.pitcher);
    assert.equal(a.pitcher.arsenal.reduce((sum,p)=>sum+p.usage,0),100);
    for(let i=0;i<30;i++){
      const p=makePitch(seed,i,a.pitcher,i%4,i%3);
      assert.deepEqual(p,makePitch(seed,i,b.pitcher,i%4,i%3));
      assert.ok(a.pitcher.arsenal.some(s=>s.type===p.type));seen.add(p.type);
    }
  }
  assert.equal(seen.size,7);
});
test('sampling follows the report and two strikes increase offspeed tendency',()=>{
  const pitcher=makeQuickPitcher(7),counts={},two={};
  for(let i=0;i<10000;i++){
    const a=makePitch(7,i,pitcher).type,b=makePitch(7,i,pitcher,0,2).type;
    counts[a]=(counts[a]||0)+1;two[b]=(two[b]||0)+1;
  }
  for(const {type,usage} of pitcher.arsenal)assert.ok(Math.abs(counts[type]/100-usage)<2);
  const slow=obj=>Object.entries(obj).filter(([t])=>pitchFamily(t)==='slow').reduce((sum,[,n])=>sum+n,0);
  assert.ok(slow(two)>slow(counts));
});
test('count persists, two-strike fouls do not strike out, and a third strike resets the plate appearance',()=>{
  const game=new QuickGame(1);strike(game);strike(game);
  force(game);assert.equal(game.resolve(140).kind,'foul');assert.equal(game.strikes,2);assert.equal(game.outs,0);
  ball(game);assert.equal(game.balls,1);assert.equal(game.strikes,2);
  assert.equal(strike(game).kind,'strikeout');assert.equal(game.outs,1);assert.equal(game.strikes,0);assert.equal(game.balls,0);assert.equal(game.plateAppearances,1);
});
test('walks force only occupied consecutive bases and score a loaded runner',()=>{
  const game=new QuickGame(2);game.bases=[false,false,true];
  for(let i=0;i<4;i++)ball(game);assert.deepEqual(game.bases,[true,false,true]);assert.equal(game.runs,0);
  for(let i=0;i<4;i++)ball(game);assert.deepEqual(game.bases,[true,true,true]);
  for(let i=0;i<4;i++)ball(game);assert.deepEqual(game.bases,[true,true,true]);assert.equal(game.runs,1);assert.equal(game.walks,3);assert.equal(game.balls,0);
});
test('singles, doubles and homers advance runners without losing or duplicating them',()=>{
  const game=new QuickGame(3);hit(game,1);assert.deepEqual(game.bases,[true,false,false]);
  hit(game,2);assert.deepEqual(game.bases,[false,true,true]);assert.equal(game.runs,0);
  const homer=hit(game,4);assert.equal(homer.runs,3);assert.equal(game.runs,3);assert.deepEqual(game.bases,[false,false,false]);assert.equal(game.hits,3);
});
test('three outs end an inning, unused runners do not score, and no fourth out is allowed',()=>{
  const game=new QuickGame(3);game.bases=[true,true,true];
  for(let i=0;i<9;i++)strike(game);
  assert.equal(game.done,true);assert.equal(game.runs,0);assert.equal(game.pitch,null);
  assert.throws(()=>game.resolve(null));
});
test('a weak contacted ball is an out without advancing runners',()=>{
  const game=new QuickGame(5);game.bases=[false,true,false];force(game);
  assert.equal(game.resolve(100).kind,'out');assert.equal(game.outs,1);assert.deepEqual(game.bases,[false,true,false]);
});
test('anticipation trades coverage for power without making unpredicted pitches impossible',()=>{
  const pitch={type:'FF',x:0,z:0};
  assert.equal(judgePitch(pitch,0,'fast').bases,4);
  assert.equal(judgePitch(pitch,0,'slow').bases,1);
  assert.equal(judgePitch(pitch,0,'contact').bases,1);
  assert.equal(judgePitch(pitch,120,'fast').kind,'foul');
  assert.equal(judgePitch(pitch,120,'slow').kind,'whiff');
  assert.equal(judgePitch(pitch,160,'contact').kind,'foul');
  assert.equal(judgePitch({...pitch,x:1.3},0,'fast').kind,'whiff');
  assert.equal(judgePitch(pitch,null,'fast').kind,'strike');
  assert.ok(inQuickZone({x:1,z:-1}));assert.ok(!inQuickZone({x:1.001,z:0}));
});
test('taking a strike early is a count cost, not an automatic out',()=>{
  const game=new QuickGame(8);assert.equal(strike(game).kind,'strike');assert.equal(game.outs,0);assert.equal(game.strikes,1);
  assert.equal(hit(game,1).kind,'hit');assert.equal(game.outs,0);assert.equal(game.strikes,0);
});
