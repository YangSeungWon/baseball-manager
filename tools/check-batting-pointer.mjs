import test from 'node:test';
import assert from 'node:assert/strict';
import {mountBattingPointer} from '../web/js/batting-pointer.js';
function setup(){
 const surface=new EventTarget(),input=new AbortController(),aims=[],previews=[];let swings=0;
 surface.getBoundingClientRect=()=>({left:0,top:0,right:400,bottom:800,width:400,height:800});
 mountBattingPointer(surface,{signal:input.signal,aimAt:(x,y)=>({x,z:y}),onAim:(x,z)=>aims.push({x,z}),onSwing:()=>swings++,onPreview:p=>previews.push(p)});
 const fire=(type,props={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,pointerType:'touch',button:0,buttons:0,clientX:200,clientY:400,...props});surface.dispatchEvent(e);};
 return {input,aims,previews,fire,get swings(){return swings;}};
}
test('mouse moves aim and swings once on left press, not release or keyboard',()=>{
 const s=setup();s.fire('pointermove',{pointerType:'mouse'});assert.deepEqual(s.aims.at(-1),{x:200,z:400});
 s.fire('keydown',{key:' '});assert.equal(s.swings,0);
 s.fire('pointerdown',{pointerType:'mouse',button:2});assert.equal(s.swings,0);
 s.fire('pointerdown',{pointerType:'mouse'});s.fire('pointerup',{pointerType:'mouse'});assert.equal(s.swings,1);
});
test('touch drags above the finger and only release swings',()=>{
 const s=setup();s.fire('pointerdown');assert.equal(s.swings,0);assert.deepEqual(s.aims.at(-1),{x:200,z:336});
 s.fire('pointermove',{clientX:250,clientY:450});assert.deepEqual(s.aims.at(-1),{x:250,z:386});
 s.fire('pointerup',{clientX:250,clientY:450});assert.equal(s.swings,1);assert.equal(s.previews.at(-1),null);
 s.fire('pointerup');assert.equal(s.swings,1);
});
test('cancel area prevents swing; moving back out restores the gesture',()=>{
 const s=setup();s.fire('pointerdown');s.fire('pointermove',{clientY:760});assert.equal(s.previews.at(-1).cancel,true);
 s.fire('pointerup',{clientY:760});assert.equal(s.swings,0);
 s.fire('pointerdown',{clientY:760});s.fire('pointermove',{clientY:400});assert.equal(s.previews.at(-1).cancel,false);
 s.fire('pointerup');assert.equal(s.swings,1);
});
test('other fingers, OS cancellation, lost capture and expired pitches cannot swing',()=>{
 for(const cancel of ['pointercancel','lostpointercapture','abort']){
  const s=setup();s.fire('pointerdown');s.fire('pointerdown',{pointerId:2});s.fire('pointerup',{pointerId:2});assert.equal(s.swings,0);
  if(cancel==='abort')s.input.abort();else s.fire(cancel);
  assert.equal(s.previews.at(-1),null);s.fire('pointerup');assert.equal(s.swings,0);
 }
});
