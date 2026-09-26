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
test('touch aims with one finger and swings with the pad, never the same one',()=>{
 const s=setup();
 s.fire('pointerdown',{clientY:400});                 // 위쪽을 짚으면 조준만 — 스윙 준비가 아니다
 assert.deepEqual(s.calls,[]);assert.deepEqual(s.aims.at(-1),{x:200,z:336});
 s.fire('pointermove',{clientX:250,clientY:450});assert.deepEqual(s.aims.at(-1),{x:250,z:386});
 s.fire('pointerdown',{pointerId:2,clientY:760});     // 아래 패드가 스윙을 준비한다
 assert.deepEqual(s.calls,['load']);
 s.fire('pointermove',{pointerId:2,clientX:40,clientY:770});
 assert.deepEqual(s.aims.at(-1),{x:250,z:386},'스윙 손가락은 조준을 옮기지 않는다');
 s.fire('pointerup',{pointerId:2,clientX:40,clientY:770});
 assert.deepEqual(s.calls,['load','swing']);
 s.fire('pointermove',{clientX:260,clientY:455});assert.deepEqual(s.aims.at(-1),{x:260,z:391},'조준 손가락은 그대로 살아 있다');
});
test('the aim finger keeps its place inside the pad, and the swing finger holds up outside it',()=>{
 const s=setup();
 s.fire('pointerdown',{clientY:400});s.fire('pointermove',{clientY:760});
 assert.deepEqual(s.aims.at(-1),{x:200,z:336},'패드 위로 끌어도 배트는 따라 내려가지 않는다');
 s.fire('pointerdown',{pointerId:2,clientY:770});assert.deepEqual(s.calls,['load']);
 s.fire('pointermove',{pointerId:2,clientY:500});assert.equal(s.previews.at(-1).cancel,true);
 s.fire('pointerup',{pointerId:2,clientY:500});assert.deepEqual(s.calls,['load','check']);
 const t=setup();
 t.fire('pointerdown',{pointerId:2,clientY:760});t.fire('pointermove',{pointerId:2,clientY:500});
 t.fire('pointermove',{pointerId:2,clientY:770});assert.equal(t.previews.at(-1).cancel,false);
 t.fire('pointerup',{pointerId:2,clientY:770});assert.deepEqual(t.calls,['load','swing']);
});
test('other fingers, OS cancellation, lost capture and expired pitches never swing or check',()=>{
 for(const cancel of ['pointercancel','lostpointercapture','abort']){
  const s=setup();s.fire('pointerdown',{clientY:400});s.fire('pointerdown',{pointerId:2,clientY:760});
  s.fire('pointerdown',{pointerId:3,clientY:770});assert.deepEqual(s.calls,['load'],'세 번째 손가락은 아무것도 하지 않는다');
  if(cancel==='abort')s.input.abort();else s.fire(cancel,{pointerId:2});
  assert.deepEqual(s.calls,cancel==='abort'?['load']:['load','drop']);
  s.fire('pointerup',{pointerId:2,clientY:760});
  assert.equal(s.calls.includes('swing')||s.calls.includes('check'),false);
 }
});
