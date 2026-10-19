import test from 'node:test';
import assert from 'node:assert/strict';
import {QUICK_PITCH_TYPES, deliverQuickPitch, pitchLocation, seamPoints} from '../web/js/quick-pitches.js';
const pitcher={hand:'R',stuff:.6,command:.6},target={x:.2,z:.1},noise=[.7,-.6,.2,-.1,.3,.2,-.1,.4];
const pitch=(type,profile=pitcher,aim=target,roll=noise)=>deliverQuickPitch(type,profile,aim,roll);

test('pitch families retain their speed, break and spin relationships',()=>{
  const [ff,ft,sl,fo,fc]=['FF','FT','SL','FO','FC'].map(t=>pitch(t));
  assert.ok(ff.speed>ft.speed&&ft.speed>fc.speed&&fc.speed>sl.speed&&sl.speed>fo.speed);
  assert.ok(ft.movement.x<ff.movement.x&&ff.movement.x<0);
  assert.ok(sl.movement.x>fc.movement.x&&fc.movement.x>0);
  assert.ok(fo.movement.z<sl.movement.z&&sl.movement.z<ft.movement.z&&ft.movement.z<ff.movement.z);
  assert.ok(fo.spin.rpm<ff.spin.rpm/2);
  assert.ok(Math.abs(sl.spin.axis[2])>Math.abs(ff.spin.axis[2]));
});
test('command changes landing error without changing speed, break or spin',()=>{
  const low=pitch('SL',{...pitcher,command:0}),high=pitch('SL',{...pitcher,command:1});
  assert.ok(Math.hypot(low.error.x,low.error.z)>Math.hypot(high.error.x,high.error.z)*5);
  assert.equal(low.speed,high.speed);assert.deepEqual(low.movement,high.movement);assert.deepEqual(low.spin,high.spin);
  const aim={x:.9,z:0},roll=[1,0,0,0,0,0,0,0];
  assert.equal(pitch('FF',{...pitcher,command:1},aim,roll).strike,true);
  assert.equal(pitch('FF',{...pitcher,command:0},aim,roll).strike,false);
});
test('stuff changes velocity and break, but more spin is not always better',()=>{
  for(const type of Object.keys(QUICK_PITCH_TYPES)){
    const low=pitch(type,{...pitcher,stuff:0}),high=pitch(type,{...pitcher,stuff:1});
    assert.ok(high.speed>low.speed);assert.ok(high.flight<low.flight);
    assert.ok(Math.hypot(high.movement.x,high.movement.z)>Math.hypot(low.movement.x,low.movement.z));
    assert.deepEqual(low.error,high.error);
    assert.equal(high.spin.rpm>low.spin.rpm,type!=='FO');
  }
});
test('left-handed movement and spin mirror horizontally, with identical landing and flight time',()=>{
  for(const type of Object.keys(QUICK_PITCH_TYPES)){
    const r=pitch(type),l=pitch(type,{...pitcher,hand:'L'});
    assert.equal(l.movement.x,-r.movement.x);assert.equal(l.movement.z,r.movement.z);
    assert.equal(l.spin.axis[0],r.spin.axis[0]);assert.equal(l.spin.axis[1],-r.spin.axis[1]);assert.equal(l.spin.axis[2],-r.spin.axis[2]);
    assert.equal(l.flight,r.flight);
    for(const p of [l,r]){
      const start=pitchLocation(p,0);assert.ok(start.x===0&&start.z===0);
      const end=pitchLocation(p,1);assert.ok(Math.abs(end.x-p.x)<1e-12&&Math.abs(end.z-p.z)<1e-12);
    }
  }
});
test('one spherical seam rotates continuously; grip/axis, not a different texture, distinguish pitches',()=>{
  const profiles=Object.keys(QUICK_PITCH_TYPES).map(type=>pitch(type).spin);
  for(const spin of profiles){
    const a=seamPoints(spin,0),b=seamPoints(spin,.12);
    assert.notDeepEqual(a,b);
    assert.ok(a.some(v=>v[2]>0)&&a.some(v=>v[2]<0),'sphere has front and back seam sections');
    assert.ok([...a,...b].every(v=>Math.abs(Math.hypot(...v)-1)<1e-10));
    assert.deepEqual(b,seamPoints(spin,.12),'frame timing cannot change the rotation');
  }
  for(let i=0;i<profiles.length;i++)for(let j=i+1;j<profiles.length;j++)assert.notDeepEqual(seamPoints(profiles[i],.12),seamPoints(profiles[j],.12));
});
