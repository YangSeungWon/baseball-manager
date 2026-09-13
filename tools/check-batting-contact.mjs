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
