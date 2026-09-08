import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulateField,FIELD_POSITIONS,sampleField} from '../web/js/field-sim.js';
test('same launch has same trace; catching requires actual reachable ball',()=>{
 const p=simulateField({speed:40,launch:20,angle:20});assert.equal(p.result,'OUT');assert.deepEqual(p,simulateField({speed:40,launch:20,angle:20}));
 const c=p.events.find(e=>e.type==='catch'),frame=p.frames.at(-1),f=frame.fielders.find(f=>f.pos===c.fielder);
 assert.ok(Math.hypot(f.x-c.x,f.y-c.y)<=.6);assert.ok(c.z<=2.5);
 const slow=simulateField({speed:40,launch:20,angle:20,runSpeed:0});assert.notEqual(slow.result,'OUT');
});
test('fielders do not teleport or exceed speed limits',()=>{
 for(const speed of [30,40,54])for(const launch of [8,20,35,50]){
  const p=simulateField({speed,launch,angle:20});
  for(let i=1;i<p.frames.length;i++)for(let j=0;j<p.frames[i].fielders.length;j++){
   const a=p.frames[i-1],b=p.frames[i],f=a.fielders[j],g=b.fielders[j];assert.ok(Math.hypot(f.x-g.x,f.y-g.y)<=7.2*(b.t-a.t)+1e-6,JSON.stringify({speed,launch,f,g}));
  }
 }
});
test('wall hit and home run are determined by crossing height',()=>{
 const wall=simulateField({speed:48,launch:20,angle:20});assert.ok(wall.events.some(e=>e.type==='wall'));assert.notEqual(wall.result,'HR');
 const hr=simulateField({speed:48,launch:35,angle:20});assert.equal(hr.result,'HR');assert.ok(hr.events.at(-1).z>3);
});
test('ground out needs pickup and throw to first before batter arrival',()=>{
 const p=simulateField({speed:30,launch:8,angle:20});assert.equal(p.result,'OUT');assert.ok(p.events.find(e=>e.type==='bounce'));assert.ok(p.events.find(e=>e.type==='throw'));assert.ok(p.events.at(-1).t<4.25);
});
test('render samples the adjudication coordinates',()=>{
 const p=simulateField({speed:40,launch:35,angle:20});for(const frame of p.frames)assert.ok(Math.abs(sampleField(p,frame.t).x-frame.x)<1e-7);
});

test('deep fly behind center fielder is caught only with enough travel time',()=>{
 const input={speed:40,launch:40,angle:0,positions:{CF:[0,95]}};
 const fast=simulateField(input),slow=simulateField({...input,runSpeed:3});
 assert.equal(fast.result,'OUT');assert.ok(fast.events.find(e=>e.type==='catch').y>120);assert.notEqual(slow.result,'OUT');
});
