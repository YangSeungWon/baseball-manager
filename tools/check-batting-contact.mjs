import test from 'node:test';
import assert from 'node:assert/strict';
import {battingContact} from '../web/js/batting-contact.js';
import {BattingGame} from '../web/js/batting-game.js';
import {FullGame} from '../web/js/full-game.js';
import {battingPressTiming} from '../web/js/batting-input.js';
const centered={aim:{x:0,z:0},pitch:{x:0,z:0},timing:.7,power:.5};

test('manual misses come from spatial and timing errors, and combined edge errors',()=>{
 assert.equal(battingContact(centered).kind,'solid');
 assert.equal(battingContact({...centered,aim:{x:1.4,z:0}}).reason,'aim');
 assert.equal(battingContact({...centered,timing:0}).reason,'timing');
 assert.equal(battingContact({...centered,timing:1}).reason,'timing');
 const edge=battingContact({...centered,aim:{x:.85,z:0},timing:battingPressTiming(1-.14+.07,1)});
 assert.equal(edge.kind,'miss');assert.equal(edge.reason,'edge');
});
test('timing changes spray, vertical aim changes launch, and center contact is stronger',()=>{
 const hit=a=>battingContact({...centered,...a}),solid=hit({}),weak=hit({aim:{x:.8,z:0}});
 assert.equal(weak.kind,'weak');assert.ok(solid.speed>weak.speed+10);
 assert.ok(hit({timing:.6}).angle<solid.angle&&hit({timing:.8}).angle>solid.angle);
 assert.ok(hit({aim:{x:0,z:-.3}}).launch>solid.launch&&hit({aim:{x:0,z:.3}}).launch<solid.launch);
 assert.equal(hit({timing:battingPressTiming(1-.14+.08,1)}).kind,'foul');
 const chase=hit({pitch:{x:1.6,z:-1.5},aim:{x:1.6,z:-1.5}});
 assert.ok(chase.speed<solid.speed,'stretching for a ball outside the zone reduces power');
});
test('foul direction reads back as timing: pull side is early, opposite side is late',()=>{
 const hit=a=>battingContact({...centered,...a});
 const early=hit({timing:battingPressTiming(1-.14-.08,1)}),late=hit({timing:battingPressTiming(1-.14+.08,1)});
 assert.equal(early.kind,'foul');assert.equal(late.kind,'foul');
 assert.ok(early.angle<0&&late.angle>0,'a right-handed batter pulls early fouls to the left side');
 assert.ok(early.pull&&!late.pull);
 // 좌타는 좌우가 뒤집힌다. 타이밍이 같으면 각도의 크기는 같고 부호만 바뀐다.
 const L={bats:'L'},lEarly=hit({timing:battingPressTiming(1-.14-.08,1),batter:L}),lLate=hit({timing:battingPressTiming(1-.14+.08,1),batter:L});
 assert.equal(lEarly.angle,-early.angle);assert.equal(lLate.angle,-late.angle);
 assert.ok(lEarly.pull&&!lLate.pull,'pulling is toward the batter box on both sides');
});
test('good timing with the bat off the ball vertically is a tipped foul, not a spray foul',()=>{
 const hit=a=>battingContact({...centered,...a});
 const under=hit({aim:{x:0,z:-.52}}),over=hit({aim:{x:0,z:.52}});
 for(const f of [under,over]){assert.equal(f.kind,'foul');assert.equal(f.reason,'contact');assert.ok(f.tipped);}
 assert.ok(Math.abs(under.angle)>90,'clipping the bottom of the ball sends it back over the catcher');
 assert.ok(over.launch<0,'covering the top of the ball drives it into the ground');
 assert.ok(under.speed<hit({}).speed,'a tipped ball keeps little of the swing');
 // 타이밍까지 어긋나 있으면 깎여맞음으로 읽지 않는다. 그때 방향이 말해주는 것은 타이밍이다.
 assert.equal(hit({aim:{x:0,z:-.52},timing:.83}).tipped,false);
 assert.equal(hit({aim:{x:0,z:-.3}}).tipped,false,'a small vertical miss still puts the ball in play');
});
const scripted=(dice,offset={x:0,z:0},timing=.7)=>{
 const g=new BattingGame(3),r=[0,0,...dice,.5,.5,.5,.5];let i=0;g.random=()=>r[i++];
 const d=g.preparePitch({target:'any',approach:'contact'});
 const event=g.decidePitch('swing',timing,.5,{x:d.x+offset.x,z:d.z+offset.z});return {g,event};
};
test('contact, foul and batted-ball speed/launch no longer depend on contact dice',()=>{
 for(const [offset,timing] of [[{x:0,z:0},.7],[{x:0,z:0},battingPressTiming(.94,1)],[{x:0,z:1.4},.7]]){
  const low=scripted([0,0,0,0],offset,timing).event,high=scripted([.999,.999,.999,.999],offset,timing).event;
  assert.deepEqual(low.impact,high.impact);assert.equal(low.call,high.call);assert.deepEqual(low.fieldPlay,high.fieldPlay);
 }
 assert.equal(scripted([.999,0,.999,.999]).event.impact.kind,'solid');
 assert.notEqual(scripted([.999,0,.999,.999]).event.call,'W');
});
test('full games preserve aim and power on the way to the manual contact resolver',()=>{
 const g=new FullGame(7);g.outs=3;g.advanceHalf();
 const d=g.preparePitch({target:'any',approach:'contact'}),e=g.decidePitch('swing',.7,.8,{x:d.x,z:d.z});
 assert.equal(e.impact.quality,1);assert.notEqual(e.impact.kind,'miss');assert.equal(e.timing.power,.8);assert.equal(e.aim.x,d.x);assert.equal(e.aim.z,d.z);
});
test('takes remain zone judgments and do not produce a contact event',()=>{
 const g=new BattingGame(4),d=g.preparePitch({target:'any',approach:'contact'});
 const e=g.decidePitch('take',.7,.5,{x:0,z:0});assert.equal(e.impact,null);assert.equal(e.call,Math.abs(d.x)<=1&&Math.abs(d.z)<=1?'S':'B');
});

test('contact reaches outside every edge of the strike zone',()=>{
 for(const pitch of [{x:1.8,z:0},{x:-1.8,z:0},{x:0,z:1.8},{x:0,z:-1.8}]){
  assert.notEqual(battingContact({...centered,pitch,aim:pitch}).kind,'miss');
  const make=()=>{const g=new BattingGame(4);g.delivery=()=>({t:'FF',...pitch});g.preparePitch({target:'any',approach:'contact'});return g;};
  const hit=make().decidePitch('swing',.7,.5,pitch);assert.notEqual(hit.impact.kind,'miss');assert.ok(hit.call==='F'||hit.fieldPlay,'outside contact produces a foul or a batted ball');
  assert.equal(make().decidePitch('take').call,'B');
  assert.equal(make().decidePitch('swing',.7,.5,{x:0,z:0}).call,'W');
 }
});
test('a held-up swing is ruled by how far the bat came, from the swing-only roll',async()=>{
 const {checkSwingChance}=await import('../web/js/batting-game.js');
 assert.equal(checkSwingChance(0),0);assert.equal(checkSwingChance(1),1);
 for(let seed=1;seed<40;seed++)for(const depth of [0,.6,1]){
  const g=new BattingGame(seed),d=g.preparePitch({target:'any',approach:'contact'}),roll=g.pending.roll[2];
  const e=g.decidePitch('take',null,null,null,{depth}),called=roll<checkSwingChance(depth);
  assert.equal(e.check.called,called);assert.equal(e.call,called?'W':Math.abs(d.x)<=1&&Math.abs(d.z)<=1?'S':'B');
  if(depth===0)assert.equal(called,false,'an early hold-up is a clean take');
  if(depth===1)assert.equal(called,true,'a bat held through the pitch is a swing');
 }
 const g=new BattingGame(1);g.preparePitch({target:'any',approach:'contact'});
 assert.throws(()=>g.decidePitch('swing',.7,.5,{x:0,z:0},{depth:.5}),'only a take can carry a check swing');
});
test('contact swings forgive a wider miss, power swings drive the ball harder',async()=>{
 const {BATTING}=await import('../web/js/batting-tuning.js'),{BATTING_ZONE}=await import('../web/js/batting-space.js');
 const C=BATTING.manualContact,edge={aim:{x:(C.batRadius+C.ballRadius)/BATTING_ZONE.halfWidth*.99,z:0},pitch:{x:0,z:0},timing:.7};
 assert.notEqual(battingContact({...edge,power:0}).kind,'miss');
 assert.equal(battingContact({...edge,power:1}).kind,'miss');
 assert.ok(battingContact({...centered,power:1}).speed>battingContact({...centered,power:0}).speed);
});
