import assert from 'node:assert/strict';
import {battingFlightSeconds,battingPressTiming,BAT_CONTACT_SECONDS} from '../web/js/batting-input.js';
import {LiveView,Timeline} from '../web/js/live.js';
import {swingTiming} from '../web/js/batting-game.js';
for(const speed of [110,130,150]){
 const duration=battingFlightSeconds(speed),plate=1.55+duration,ideal=plate-BAT_CONTACT_SECONDS;
 assert.equal(swingTiming(battingPressTiming(ideal,plate)).kind,'sweet');
 assert.equal(swingTiming(battingPressTiming(ideal-.15,plate)).kind,'early');
 assert.equal(swingTiming(battingPressTiming(ideal+.10,plate)).kind,'late');
 for(const offset of [-.4,0,.1])for(const result of ['W','F','X']){
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
assert.ok(battingFlightSeconds(110)>battingFlightSeconds(150),'slower pitches actually take longer');
console.log('PASS: physical timing, pitch-speed differences, uninterrupted ball flight and fixed swing duration');
