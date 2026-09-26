import test from 'node:test';
import assert from 'node:assert/strict';
import {mountBattingPointer} from '../web/js/batting-pointer.js';
function setup(){
 const surface=new EventTarget(),input=new AbortController(),aims=[],previews=[],calls=[];
 surface.getBoundingClientRect=()=>({left:0,top:0,right:400,bottom:800,width:400,height:800});
 const log=name=>()=>calls.push(name);
 mountBattingPointer(surface,{signal:input.signal,aimAt:(x,y)=>({x,z:y}),onAim:(x,z)=>aims.push({x,z}),onLoad:log('load'),onSwing:log('swing'),onCheck:log('check'),onDrop:log('drop'),onPreview:p=>previews.push(p)});
 const fire=(type,props={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,pointerType:'touch',button:0,buttons:0,clientX:200,clientY:400,...props});surface.dispatchEvent(e);};
 return {input,aims,previews,calls,fire};
}
test('mouse aims on hover, loads on left press and swings on release',()=>{
 const s=setup();s.fire('pointermove',{pointerType:'mouse'});assert.deepEqual(s.aims.at(-1),{x:200,z:400});
 s.fire('keydown',{key:' '});s.fire('pointerdown',{pointerType:'mouse',button:2});assert.deepEqual(s.calls,[]);
 s.fire('pointerdown',{pointerType:'mouse'});assert.deepEqual(s.calls,['load']);assert.equal(s.previews.at(-1).loaded,true);
 s.fire('pointermove',{pointerType:'mouse',buttons:1,clientX:240});assert.deepEqual(s.aims.at(-1),{x:240,z:400});
 s.fire('pointerup',{pointerType:'mouse'});assert.deepEqual(s.calls,['load','swing']);assert.equal(s.previews.at(-1).loaded,false);
 s.fire('pointerup',{pointerType:'mouse'});assert.deepEqual(s.calls,['load','swing']);
});
test('mouse right button while loaded holds up, as a pointerdown or a chorded move',()=>{
 for(const chord of [e=>e.fire('pointerdown',{pointerType:'mouse',button:2,buttons:3}),e=>e.fire('pointermove',{pointerType:'mouse',button:2,buttons:3})]){
  const s=setup();s.fire('pointerdown',{pointerType:'mouse',buttons:1});chord(s);
  s.fire('pointerup',{pointerType:'mouse'});assert.deepEqual(s.calls,['load','check']);
 }
});
test('touch loads on press, drags above the finger and swings on release',()=>{
 const s=setup();s.fire('pointerdown');assert.deepEqual(s.calls,['load']);assert.deepEqual(s.aims.at(-1),{x:200,z:336});
 s.fire('pointermove',{clientX:250,clientY:450});assert.deepEqual(s.aims.at(-1),{x:250,z:386});
 s.fire('pointerup',{clientX:250,clientY:450});assert.deepEqual(s.calls,['load','swing']);assert.equal(s.previews.at(-1),null);
 s.fire('pointerup');assert.deepEqual(s.calls,['load','swing']);
});
test('releasing in the cancel area holds up; moving back out restores the swing',()=>{
 const s=setup();s.fire('pointerdown');s.fire('pointermove',{clientY:760});assert.equal(s.previews.at(-1).cancel,true);
 s.fire('pointerup',{clientY:760});assert.deepEqual(s.calls,['load','check']);
 s.fire('pointerdown',{clientY:760});s.fire('pointermove',{clientY:400});assert.equal(s.previews.at(-1).cancel,false);
 s.fire('pointerup');assert.deepEqual(s.calls,['load','check','load','swing']);
});
test('other fingers, OS cancellation, lost capture and expired pitches never swing or check',()=>{
 for(const cancel of ['pointercancel','lostpointercapture','abort']){
  const s=setup();s.fire('pointerdown');s.fire('pointerdown',{pointerId:2});s.fire('pointerup',{pointerId:2});assert.deepEqual(s.calls,['load']);
  if(cancel==='abort')s.input.abort();else s.fire(cancel);
  assert.equal(s.previews.at(-1),null);assert.deepEqual(s.calls,cancel==='abort'?['load']:['load','drop']);
  s.fire('pointerup');assert.equal(s.calls.includes('swing')||s.calls.includes('check'),false);
 }
});
