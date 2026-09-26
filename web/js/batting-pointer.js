// 조준과 스윙은 서로 다른 동작이다.
// 마우스: 움직이면 조준, 왼쪽 버튼을 누르면 준비하고 떼면 스윙. 누른 채 오른쪽 버튼을 더하면 체크.
// 터치: 화면 위쪽을 끌어 조준하고, 아래 스윙 패드를 눌러 준비·떼서 스윙. 패드 밖으로 밀어 올린 뒤 떼면 체크.
// 손가락 하나로 조준과 준비를 겸하면, 미리 조준하려고 손을 대는 순간 장타 스윙이 확정되어 버린다.
// 조준은 절대 좌표다 — 짚은 자리가 곧 배트 자리라 조이스틱보다 빠르다. 손을 떼도 배트는 그 자리에 남는다.
export function mountBattingPointer(surface,{signal,aimAt,onAim,onLoad,onSwing,onCheck,onDrop,onPreview}){
 let aimId=null,swingId=null,mouse=false,armed=false;
 const padOf=r=>Math.min(120,Math.max(72,r.height*.18));
 const spot=(e,isTouch)=>{
  const r=surface.getBoundingClientRect(),cancelHeight=padOf(r),pad=e.clientY>=r.bottom-cancelHeight;
  return {r,cancelHeight,pad,
   x:Math.max(r.left+18,Math.min(r.right-18,e.clientX)),
   y:Math.max(r.top+18,Math.min(r.bottom-18,e.clientY-(isTouch?64:0)))};
 };
 // cancel: 지금 떼면 스윙이 아니라 참기가 된다는 뜻. 터치는 패드 밖, 마우스는 오른쪽 버튼이 그 신호다.
 const show=(p,loaded,cancel)=>onPreview(p&&{x:p.x,y:p.y,cancel:!!cancel,touch:!mouse,cancelHeight:p.cancelHeight,loaded});
 // 조준 손가락이 스윙 패드 안으로 내려와도 조준은 그 자리에 둔다. 끌다가 배트가 딸려 내려가면 안 된다.
 const aimTo=(e,isTouch)=>{const p=spot(e,isTouch);if(!(isTouch&&p.pad)){const a=aimAt(p.x,p.y);if(a)onAim(a.x,a.z);}return p;};
 const drop=id=>{if(id!==null&&surface.hasPointerCapture?.(id))surface.releasePointerCapture(id);};
 const reset=()=>{drop(aimId);drop(swingId);aimId=swingId=null;armed=false;onPreview(null);};
 const on=(name,f)=>surface.addEventListener(name,f,{signal});
 on('contextmenu',e=>e.preventDefault());
 const chord=e=>{e.preventDefault();drop(swingId);swingId=null;armed=false;show(aimTo(e,false),false,false);onCheck();};
 on('pointerdown',e=>{
  const isTouch=e.pointerType!=='mouse';
  if(!isTouch){
   mouse=true;
   if(e.button===2&&swingId!==null)return chord(e);
   if(e.button!==0||swingId!==null)return;
   e.preventDefault();swingId=e.pointerId;if(e.isTrusted)surface.setPointerCapture?.(swingId);
   onLoad();show(aimTo(e,false),true,false);return;
  }
  mouse=false;e.preventDefault();
  const p=spot(e,true);
  if(p.pad){if(swingId!==null)return;swingId=e.pointerId;armed=true;if(e.isTrusted)surface.setPointerCapture?.(swingId);onLoad();show(p,true,false);return;}
  if(aimId!==null)return;
  aimId=e.pointerId;if(e.isTrusted)surface.setPointerCapture?.(aimId);show(aimTo(e,true),swingId!==null,!armed&&swingId!==null);
 });
 on('pointermove',e=>{
  if(e.pointerId===swingId){
   if(mouse){if(e.buttons&2)return chord(e);e.preventDefault();show(aimTo(e,false),true,false);return;}
   e.preventDefault();const p=spot(e,true);armed=p.pad;show(p,true,!p.pad);return;   // 스윙 손가락은 조준을 옮기지 않는다
  }
  if(e.pointerId===aimId){e.preventDefault();show(aimTo(e,true),swingId!==null,swingId!==null&&!armed);return;}
  if(e.pointerType==='mouse'&&!e.buttons){mouse=true;show(aimTo(e,false),false,false);}
 });
 on('pointerup',e=>{
  if(e.pointerId===swingId){
   e.preventDefault();const p=mouse?aimTo(e,false):spot(e,true);const swung=mouse||p.pad;
   drop(swingId);swingId=null;armed=false;show(mouse||aimId!==null?p:null,false,false);
   if(swung)onSwing();else onCheck();return;
  }
  if(e.pointerId===aimId){e.preventDefault();drop(aimId);aimId=null;if(swingId===null)onPreview(null);}
 });
 const lost=e=>{
  if(e.pointerId===swingId){drop(swingId);swingId=null;armed=false;onDrop();if(aimId===null)onPreview(null);}
  else if(e.pointerId===aimId){drop(aimId);aimId=null;if(swingId===null)onPreview(null);}
 };
 on('pointercancel',lost);on('lostpointercapture',lost);
 on('pointerleave',()=>{if(aimId===null&&swingId===null)onPreview(null);});
 signal.addEventListener('abort',reset,{once:true});
 return reset;
}
