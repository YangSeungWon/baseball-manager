// 브라우저 없이 한 이닝 모드를 열어 본다. 진입 시 터지는 오류(선언 전 접근, 아직 없는 객체 참조)를 잡는 스모크.
//   JSDOM_MODULE=/path/to/node_modules/jsdom node --test tools/check-inning-smoke.mjs
// jsdom 이 없으면 건너뛴다. WebGL 은 없으므로 3D 는 실패 경로로 흐르고, 그 실패는 정상으로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const candidates=[process.env.JSDOM_MODULE,resolve('node_modules/jsdom'),resolve('../node_modules/jsdom'),'/tmp/node_modules/jsdom'].filter(Boolean);
const jsdomPath=candidates.find(p=>existsSync(p));
const ours=/\/web\/js\/(inning-mode|inning-game|batting-game|full-game|inning-stages|inning-share|pitcher-tag|scouting-ui|player-traits|pitch-control|batting-tuning|motion-clips|pitcher-grammar)\.js/;
function boot(){
  const {JSDOM}=require(jsdomPath);
  const dom=new JSDOM('<!doctype html><html><body><div id="boot"></div><div id="app" hidden></div></body></html>',{pretendToBeVisual:true,url:'http://localhost/'});
  const w=dom.window;
  // 캔버스: 2D 는 아무 일도 하지 않는 컨텍스트, WebGL 은 없음(→ 3D 실패 경로).
  const noop=new Proxy(function(){},{get:(t,k)=>k==='canvas'?null:k===Symbol.toPrimitive?()=>0:noop,apply:()=>noop,set:()=>true});
  w.HTMLCanvasElement.prototype.getContext=function(kind){return kind==='2d'?noop:null;};
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  if(!w.PointerEvent)w.PointerEvent=class PointerEvent extends w.MouseEvent{constructor(t,i={}){super(t,i);this.pointerId=i.pointerId??1;}};
  w.Element.prototype.setPointerCapture=w.Element.prototype.setPointerCapture||function(){};w.Element.prototype.releasePointerCapture=w.Element.prototype.releasePointerCapture||function(){};w.Element.prototype.hasPointerCapture=w.Element.prototype.hasPointerCapture||(()=>false);
  w.Element.prototype.scrollIntoView=w.Element.prototype.scrollIntoView||function(){};
  for(const k of ['window','document','navigator','localStorage','sessionStorage','HTMLElement','Element','Node','Event','CustomEvent','MouseEvent','KeyboardEvent','PointerEvent','matchMedia','requestAnimationFrame','cancelAnimationFrame','getComputedStyle','location','history','innerWidth','innerHeight','devicePixelRatio','HTMLCanvasElement','Image','DOMParser','XMLHttpRequest','FontFace','screen'])if(w[k]!==undefined)Object.defineProperty(globalThis,k,{value:w[k],configurable:true,writable:true});
  for(const [k,v] of [['innerWidth',390],['innerHeight',844],['devicePixelRatio',2]])Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});
  const errors=[];
  w.addEventListener('error',e=>errors.push(e.error||e.message));
  const onRej=r=>errors.push(r);process.on('unhandledRejection',onRej);
  return {w,errors,stop:()=>process.off('unhandledRejection',onRej)};
}
const settle=ms=>new Promise(r=>setTimeout(r,ms));
const oursOnly=errors=>errors.filter(e=>ours.test(String(e&&e.stack||e)));

test('every inning mode opens without an error in our modules, then closes and reopens',{skip:jsdomPath?false:'jsdom not found — set JSDOM_MODULE'},async()=>{
  const {w,errors,stop}=boot();
  const {openInningMode}=await import('../web/js/inning-mode.js');
  const $=s=>w.document.querySelector(s);
  try{
    for(const [role,seed,stage,expect] of [['batter',7,0,['.batting-hold','.inning-time','[data-group=target]','.batting-clock']],['pitcher',7,0,['.pitch-breathe','.pitch-effort','.pitch-hold','[data-group=type]']],['batter',7,2,['.batting-hold']],['full',null,0,['.pitch-hold','.pitch-breathe']]]){
      const before=errors.length;
      openInningMode(role,seed,stage);
      assert.ok($('.inning-mode'),`${role}: mode element exists`);
      for(const sel of expect)assert.ok($(sel),`${role} stage ${stage}: ${sel} present`);
      await settle(400);
      const mine=oursOnly(errors.slice(before));
      assert.equal(mine.length,0,`${role}: errors in our modules:\n`+mine.map(e=>String(e&&e.stack||e).split('\n').slice(0,3).join('\n')).join('\n---\n'));
      $('.inning-exit').click();
      await settle(50);
      assert.equal($('.inning-mode'),null,`${role}: closed`);
    }
  } finally {stop();w.close();}
});
