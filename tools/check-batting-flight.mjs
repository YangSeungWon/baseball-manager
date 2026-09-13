import assert from 'node:assert/strict';
import {battingFlightSeconds,battingCatchSeconds,battingPressTiming,BAT_CONTACT_SECONDS} from '../web/js/batting-input.js';
import {LiveView,Timeline} from '../web/js/live.js';
import {swingTiming} from '../web/js/batting-game.js';
for(const speed of [110,130,150]){
 assert.ok(Math.abs(battingFlightSeconds(speed)+battingCatchSeconds(speed)-18/(speed/3.6))<1e-12);
 const duration=battingFlightSeconds(speed),plate=1.55+duration,ideal=plate-BAT_CONTACT_SECONDS;
 assert.equal(swingTiming(battingPressTiming(ideal,plate)).kind,'sweet');
 assert.equal(swingTiming(battingPressTiming(ideal-.15,plate)).kind,'early');
 assert.equal(swingTiming(battingPressTiming(ideal+.10,plate)).kind,'late');
 for(const offset of [-.15,0,.02])for(const result of ['W','F','X']){
  const start=ideal+offset,S={batSwingFrom:.25},tl=new Timeline(),preview=new Timeline(),before={};
  const pitch={t:'SL',v:speed,x:.6,z:-.7,flightSeconds:duration};
  LiveView.prototype._pitch.call({S:before},preview,{...pitch,r:'B'},0,.65,{});
  LiveView.prototype._pitch.call({S,_trail(){}},tl,{...pitch,r:result,swingStart:start},0,.65,{});
  // Inspect continuous animation tracks without firing UI and sound callbacks.
  for(const timeline of [tl,preview])timeline.items=timeline.items.filter(i=>i.dur>0);
  for(const t of [1.55,start,start+.07]){
   preview.step(t);tl.step(t);for(const axis of ['x','y','z'])assert.ok(Math.abs(S.ball[axis]-before.ball[axis])<1e-8,'pressing does not teleport or accelerate the pitch');
  }
  assert.ok(Math.abs(S.swing-(.25+.62)/2)<1e-8,'same swing speed regardless of press timing or pitch speed');
  tl.step(start+BAT_CONTACT_SECONDS);assert.ok(Math.abs(S.swing-.62)<1e-8);
 }
}
for(const speed of [110,130,150])for(const result of ['B','S','W']){
 const S={fielders:{C:{}},s:0,b:0},tl=new Timeline();let pops=0;
 const view={S,sfx:{pop(){pops++;}},_hold:LiveView.prototype._hold};
 const plate=LiveView.prototype._pitch.call(view,tl,{t:'FF',v:speed,x:0,z:0,r:result},0,.65,{});
 // Retain the ball's catch segment and the mitt sound, without unrelated UI callbacks.
 tl.items=tl.items.filter(it=>it.t0>=plate && it.t0<=plate+battingCatchSeconds(speed)+1e-10 && (it.dur>0 || it.t0>plate));
 tl.step(plate);assert.equal(pops,0);assert.ok(Math.abs(S.ball.y)<1e-12);
 tl.step(plate+battingCatchSeconds(speed)/2);assert.equal(pops,0);assert.ok(Math.abs(S.ball.y+.6)<1e-10);
 tl.step(plate+battingCatchSeconds(speed)+1e-9);assert.equal(pops,1);assert.equal(S.ball,null);assert.equal(S.hold,S.fielders.C);
}
assert.ok(battingFlightSeconds(110)>battingFlightSeconds(150),'slower pitches actually take longer');
assert.ok(Math.abs(battingFlightSeconds(150)-.4032)<1e-12);
assert.ok(Math.abs(battingCatchSeconds(150)-.0288)<1e-12);
console.log('PASS: physical timing, pitch-speed differences, uninterrupted ball flight and fixed swing duration');
