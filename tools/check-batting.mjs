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
  const play=(location,action='swing')=>{const g=new BattingGame(1);rolls(g,[.1,.1,.85,.1,.5,.5,.1,.1]);return g.pitch({...choice,location,action});};
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

test('vision expands the observed flight and discipline extends the check-swing window',async()=>{
  const {battingReadProfile}=await import('../web/js/batting-game.js');
  const raw=battingReadProfile({vision:.5,chase:.6}),patient=battingReadProfile({vision:.88,chase:.2});
  assert.ok(patient.from<raw.from,'better vision starts reading earlier');
  assert.ok(patient.to>raw.to,'better vision follows the pitch closer to the plate');
  assert.ok(patient.to-patient.from>raw.to-raw.from,'better vision observes more of the flight');
  assert.ok(patient.takeUntil>raw.takeUntil,'better discipline can stop the swing later');
});

test('every decision carries the counterfactual outcome of the other choice, computed on the same dice without touching state',async()=>{
  const {compareOutcomes}=await import('../web/js/batting-game.js');
  const g=new BattingGame(1);rolls(g,[0,0,.99]);
  const e=g.pitch({...choice,action:'take'});
  assert.equal(e.call,'S');assert.equal(e.alternative.action,'swing');assert.equal(e.alternative.result,'W');assert.equal(e.alternative.verdict,'same');
  const h=new BattingGame(1);rolls(h,[0,.99,.5]);
  const t=h.pitch({...choice,action:'swing'});
  assert.equal(t.alternative.action,'take');assert.equal(t.alternative.result,'B');assert.equal(t.alternative.verdict,'better');
  const w=new BattingGame(3);rolls(w,[0,0,0,.9,0,.5]);
  const hr=w.pitch({target:'FF',approach:'power',action:'swing'});
  assert.equal(hr.result,'HR');assert.equal(hr.alternative.result,'S');assert.equal(hr.alternative.verdict,'worse');
  for(let seed=0;seed<100;seed++){
    const a=new BattingGame(seed*7919),b=new BattingGame(seed*7919);
    while(!a.done){
      const c={...choice,action:a.count%2?'take':'swing'};
      const before=b.snapshot(),rng=b.rng,alt=b.alternativeOf(c,Array.from({length:10},()=>.5));
      assert.deepEqual(b.snapshot(),before);assert.equal(b.rng,rng);assert.equal(alt.action,c.action==='swing'?'take':'swing');
      const ea=a.pitch(c),eb=b.pitch(c);assert.deepEqual(ea,eb);assert.ok(['better','worse','same'].includes(ea.alternative.verdict));
      assert.ok(a.count<300);
    }
  }
  assert.equal(compareOutcomes({result:'B',scored:0,outs:0},{result:'S',scored:0,outs:0}),'better');
  assert.equal(compareOutcomes({result:'K',scored:0,outs:1},{result:'1B',scored:1,outs:0}),'worse');
});

test('swing timing: the sweet spot rewards contact, early pulls and late pushes, auto stays neutral, takes ignore it',async()=>{
  const {swingTiming,SWING_WINDOW}=await import('../web/js/batting-game.js');
  assert.equal(swingTiming(null).kind,'auto');assert.equal(swingTiming(.7).kind,'sweet');assert.equal(swingTiming(.1).kind,'early');assert.equal(swingTiming(.98).kind,'late');
  assert.ok(swingTiming(.7).contact>swingTiming(null).contact&&swingTiming(null).contact>swingTiming(.1).contact);
  assert.ok(swingTiming(.05).angleShift<0&&swingTiming(.99).angleShift>0);
  assert.ok(swingTiming(0).severity>swingTiming(.3).severity);
  const at=(timing,r=[0,0,.5,.9,.3,.5,.5,.5])=>{const g=new BattingGame(3);rolls(g,r);g.preparePitch({target:'FF',approach:'contact'});return g.decidePitch('swing',timing);};
  // 구간 바로 바깥: 아직 배트가 공을 만난다(더 벗어나면 헛스윙 확정 — 아래 별도 테스트).
  const sweet=at((SWING_WINDOW.from+SWING_WINDOW.to)/2),early=at(SWING_WINDOW.from*.5),late=at(SWING_WINDOW.to+(1-SWING_WINDOW.to)*.5),auto=at(null);
  assert.deepEqual(sweet.pitch,early.pitch);assert.equal(sweet.timing.kind,'sweet');assert.equal(early.timing.kind,'early');assert.equal(late.timing.kind,'late');assert.equal(auto.timing.kind,'auto');
  assert.ok(early.fieldPlay.angle<sweet.fieldPlay.angle,'early swing pulls to the left');assert.ok(late.fieldPlay.angle>sweet.fieldPlay.angle,'late swing pushes to the right');
  assert.ok(early.fieldPlay.speed<sweet.fieldPlay.speed&&late.fieldPlay.speed<sweet.fieldPlay.speed,'mistimed contact is weaker');
  assert.match(early.explanation,/일찍/);assert.match(late.explanation,/늦게/);assert.match(sweet.explanation,/정확/);
  const g=new BattingGame(3);g.preparePitch(choice);assert.throws(()=>g.decidePitch('swing',1.5));assert.throws(()=>g.decidePitch('swing',-.1));
  const take=g.decidePitch('take',.2);assert.equal(take.timing,null);
  const a=new BattingGame(9),b=new BattingGame(9);a.preparePitch(choice);b.preparePitch(choice);assert.deepEqual(a.decidePitch('take',null),b.decidePitch('take',.9));
  const c=new BattingGame(9);c.preparePitch(choice);const e=c.decidePitch('swing',.7);assert.equal(e.alternative.action,'take');
  const d=new BattingGame(9),f=new BattingGame(9);d.preparePitch(choice);f.preparePitch(choice);
  assert.equal(d.decidePitch('take').alternative.result,f.decidePitch('swing',null).result,'the counterfactual swing uses auto timing');
});

test('a matching prediction opens the read earlier and widens the sweet band, but never changes the pitch or the take call',async()=>{
  const {readWindowFor,SWING_WINDOW}=await import('../web/js/batting-game.js');
  const batter={contact:.72,vision:.7,chase:.4},pitch={t:'SL',x:.6,z:-.7};
  const none=readWindowFor(batter,{target:'any',location:'any'},pitch),type=readWindowFor(batter,{target:'SL',location:'any'},pitch),miss=readWindowFor(batter,{target:'FF',location:'in'},pitch),both=readWindowFor(batter,{target:'SL',location:'low'},pitch);
  assert.ok(type.from<none.from&&type.onset<none.onset,'type hit opens earlier and clears sooner');
  assert.ok(type.sweet.from<SWING_WINDOW.from&&type.sweet.to===SWING_WINDOW.to);
  assert.ok(both.sweet.to>SWING_WINDOW.to&&both.to>none.to,'location hit extends the window');
  assert.deepEqual({from:miss.from,to:miss.to,onset:miss.onset,sweet:miss.sweet},{from:none.from,to:none.to,onset:none.onset,sweet:none.sweet},'a miss is not punished in the window');
  assert.equal(readWindowFor(batter,{target:'SL'},null).typeHit,false);
  for(let seed=0;seed<50;seed++){
    const a=new BattingGame(seed*31),b=new BattingGame(seed*31);
    const pa=a.preparePitch({target:'any',approach:'contact',location:'any'}),pb=b.preparePitch({target:pa.t,approach:'contact',location:pa.z>.4?'high':pa.z<-.4?'low':pa.x<0?'in':'out'});
    assert.deepEqual(pa,pb);const ea=a.decidePitch('take'),eb=b.decidePitch('take');assert.equal(ea.result,eb.result);assert.deepEqual(ea.pitch,eb.pitch);
  }
  const g=new BattingGame(5);const d=g.preparePitch({target:'any',approach:'contact',location:'any'});const e=g.decidePitch('swing',.5);
  assert.ok(e.timing.window&&e.timing.window.from<=e.timing.window.to);
});

test('hold power is continuous and a swing far outside the band whiffs no matter the dice',async()=>{
  const {BATTING}=await import('../web/js/batting-tuning.js');
  const at=(timing,power)=>{const g=new BattingGame(3);rolls(g,[0,0,0,.9,.3,.5,.5,.5]);g.preparePitch({target:'FF',approach:'contact'});return g.decidePitch('swing',timing,power);};
  const mid=(BATTING.swingWindow.from+BATTING.swingWindow.to)/2;
  const soft=at(mid,0),hard=at(mid,1),half=at(mid,.5);
  assert.equal(soft.timing.power,0);assert.equal(hard.timing.power,1);assert.equal(soft.choice.approach,'contact');assert.equal(hard.choice.approach,'power');
  assert.ok(hard.fieldPlay.speed>half.fieldPlay.speed&&half.fieldPlay.speed>soft.fieldPlay.speed,'more drive, faster ball');
  assert.deepEqual(at(mid,null).fieldPlay,soft.fieldPlay,'no power given: the approach decides, contact = 0');
  const g=new BattingGame(3);rolls(g,[0,0,0,.9,.3,.5,.5,.5]);g.preparePitch({target:'FF',approach:'power'});assert.equal(g.decidePitch('swing',mid,null).timing.power,1);
  const early=at(0,0),late=at(1,0);
  assert.equal(early.result,'W');assert.ok(early.timing.whiff);assert.match(early.explanation,/먼저 지나/);
  assert.equal(late.result,'W');assert.ok(late.timing.whiff);assert.match(late.explanation,/지나간 뒤/);
  assert.ok(!at(BATTING.swingWindow.from-.05,0).timing.whiff,'slightly early still meets the ball');
  const h=new BattingGame(3);h.preparePitch({target:'FF',approach:'contact'});assert.throws(()=>h.decidePitch('swing',mid,1.5));assert.throws(()=>h.decidePitch('swing',mid,-.1));
});

test('aiming the bat replaces the location guess: a bat on the ball beats a bat a zone away, takes ignore it, bad aims are refused',async()=>{
  const {BATTING}=await import('../web/js/batting-tuning.js');
  const mid=(BATTING.swingWindow.from+BATTING.swingWindow.to)/2;
  const play=(aim,location='any')=>{const g=new BattingGame(3);rolls(g,[0,0,.55,.9,.3,.5,.5,.5]);const d=g.preparePitch({target:'FF',approach:'contact',location});return {d,e:g.decidePitch('swing',mid,0,aim)};};
  const {d}=play(null);
  const away=v=>v>0?v-1.5:v+1.5;const on=play({x:d.x,z:d.z}).e,off=play({x:d.x,z:away(d.z)}).e;
  assert.deepEqual(on.pitch,off.pitch,'aim never changes the pitch');
  assert.ok(on.aim.close>.99&&off.aim.close<.01);
  assert.ok(on.fieldPlay,'bat on the ball makes contact with these dice');assert.equal(off.result,'W','a bat a zone and a half away misses with the same dice');
  assert.match(on.explanation,/정확히/);
  const inside=play({x:d.x-.6,z:d.z}).e,outside=play({x:d.x+.6,z:d.z}).e;
  assert.ok(inside.fieldPlay&&outside.fieldPlay&&inside.fieldPlay.angle<outside.fieldPlay.angle,'aiming inside pulls, outside pushes');
  const guess=play(null,'low').e,aimed=play({x:d.x,z:d.z},'low').e;assert.notDeepEqual(guess.aim,aimed.aim);assert.equal(aimed.aim.close>0,true);
  const g=new BattingGame(3);g.preparePitch({target:'any',approach:'contact'});assert.throws(()=>g.decidePitch('swing',mid,0,{x:5,z:0}));assert.throws(()=>g.decidePitch('swing',mid,0,{x:'a',z:0}));
  const t=new BattingGame(3);t.preparePitch({target:'any',approach:'contact'});assert.equal(t.decidePitch('take',null,null,{x:0,z:0}).aim,null);
  for(let seed=0;seed<40;seed++){const a=new BattingGame(seed*13),b=new BattingGame(seed*13);a.preparePitch({target:'any',approach:'contact'});b.preparePitch({target:'any',approach:'contact'});assert.deepEqual(a.decidePitch('swing',mid,.5,{x:.2,z:-.3}),b.decidePitch('swing',mid,.5,{x:.2,z:-.3}));}
});
