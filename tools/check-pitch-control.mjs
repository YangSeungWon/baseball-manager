import {test} from 'node:test';
import assert from 'node:assert/strict';
import {controlledPitch,releaseMarker,pitchPressure} from '../web/js/pitch-control.js';
import {InningGame} from '../web/js/inning-game.js';
test('accurate release stays at chosen target across noise extremes',()=>{
 for(const zone of ['in','out','low','high'])for(const intent of ['attack','chase'])for(const noise of [-1,1]){
  const p=controlledPitch(zone,intent,0,noise,-noise);
  assert.ok(Math.hypot(p.x-p.target.x,p.z-p.target.z)<.05);
  assert.equal(Math.abs(p.x)<=1&&Math.abs(p.z)<=1,intent==='attack');
 }
});
test('early and late have readable opposite errors',()=>{
 const early=controlledPitch('out','attack',-.8),late=controlledPitch('out','attack',.8);
 assert.ok(early.z>early.target.z&&late.z<late.target.z);
 assert.ok(late.x>1);
});
test('breathing reduces displayed wobble without hidden accuracy penalty',()=>{
 const pressure=pitchPressure({bases:[true,true,true],balls:3,runs:1,outs:1});
 assert.ok(pressure>.7);
 for(const p of [.1,.23,.4,.61,.77])assert.ok(Math.abs(releaseMarker(p,pressure,true)-(p*2-1))<=Math.abs(releaseMarker(p,pressure,false)-(p*2-1)));
 assert.ok(Math.abs(releaseMarker(.5,pressure))<1e-10);
 assert.ok(releaseMarker(.53,pressure,true)<releaseMarker(.53,pressure,false),'breathing slows the crossing through the central target');
});
test('game uses controlled position for called strike and ball',()=>{
 const create=()=>{const g=new InningGame(1);g.random=()=>.99;return g;};
 const good=create().pitch({type:'FF',zone:'out',intent:'attack',release:0});
 const late=create().pitch({type:'FF',zone:'out',intent:'attack',release:1});
 assert.equal(good.call,'S');assert.equal(late.call,'B');
 assert.equal(good.control.label,'정확한 릴리스');assert.equal(late.control.label,'늦은 릴리스');
 assert.deepEqual(create().pitch({type:'FF',zone:'low',intent:'attack',release:.4}),create().pitch({type:'FF',zone:'low',intent:'attack',release:.4}));
 assert.throws(()=>create().pitch({type:'FF',zone:'out',intent:'attack',release:NaN}));
});

test('high fastball target and high prediction are supported',async()=>{
 const {BattingGame}=await import('../web/js/batting-game.js');
 const g=new InningGame(1);g.random=()=>.99;
 const e=g.pitch({type:'FF',zone:'high',intent:'attack',release:0});
 assert.equal(e.call,'S');assert.ok(e.pitch.z>.7);assert.equal(e.control.target.z,.8);
 const above=controlledPitch('high','chase',0);assert.ok(above.z>1);
 const b=new BattingGame(1);assert.doesNotThrow(()=>b.preparePitch({target:'FF',approach:'contact',location:'high'}));
 assert.doesNotThrow(()=>b.decidePitch('take'));
 const roll=[0,.1,.8,.5,.45,.5,.9,.7,.5,.5],choice={target:'any',approach:'contact',action:'swing'};
 const high=new BattingGame(1).resolvePitch({...choice,location:'high'},roll);
 const low=new BattingGame(1).resolvePitch({...choice,location:'low'},roll);
 assert.notEqual(high.result,'W');assert.equal(low.result,'W');
});
