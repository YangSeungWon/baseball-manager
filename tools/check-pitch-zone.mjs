import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutPitchMarkers} from '../web/js/pitch-zone.js';
test('all 30 coincident pitches keep exact locations and separate readable number labels',()=>{
  const pitches=Array.from({length:30},(_,i)=>({pitchNumber:i+1,pitch:{x:1.6,z:-1.5}}));
  const markers=layoutPitchMarkers(pitches);
  assert.equal(markers.length,30);
  for(const [i,m] of markers.entries()) {
    assert.equal(m.x,160.8);assert.equal(m.y,156);
    assert.ok(m.labelX>=14&&m.labelX<=186&&m.labelY>=14&&m.labelY<=168);
    for(const p of markers.slice(0,i))assert.ok(Math.hypot(p.labelX-m.labelX,p.labelY-m.labelY)>=24);
  }
  assert.deepEqual(layoutPitchMarkers(pitches),markers);
});
