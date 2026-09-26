// Pointer type, rather than screen width, keeps mice and touch screens distinct.
// Pressing loads the swing and releasing lets it go. A deliberate cancel while loaded is a check:
// touch releases inside the bottom cancel area, a mouse adds the right button while holding the left.
export function mountBattingPointer(surface,{signal,aimAt,onAim,onLoad,onSwing,onCheck,onDrop,onPreview}){
 let active=null,touch=false;
 const release=()=>{const id=active;active=null;if(id!==null&&surface.hasPointerCapture?.(id))surface.releasePointerCapture(id);};
 const reset=()=>{release();onPreview(null);};
 const update=(e,isTouch)=>{
  const r=surface.getBoundingClientRect(),cancelHeight=Math.min(120,Math.max(72,r.height*.18));
  const cancel=isTouch&&e.clientY>=r.bottom-cancelHeight;
  const x=Math.max(r.left+18,Math.min(r.right-18,e.clientX));
  const y=Math.max(r.top+18,Math.min(r.bottom-18,e.clientY-(isTouch?64:0)));
  if(!cancel){const aim=aimAt(x,y);if(aim)onAim(aim.x,aim.z);}
  onPreview({x,y,cancel,touch:isTouch,cancelHeight,loaded:active!==null});return cancel;
 };
 const check=e=>{e.preventDefault();release();update(e,false);onCheck();};
 const on=(name,f)=>surface.addEventListener(name,f,{signal});
 on('contextmenu',e=>e.preventDefault());
 on('pointerdown',e=>{
  if(e.button===2&&active!==null&&!touch){check(e);return;}
  if(e.button!==0||active!==null)return;e.preventDefault();
  touch=e.pointerType!=='mouse';active=e.pointerId;if(e.isTrusted)surface.setPointerCapture?.(active);
  onLoad();update(e,touch);
 });
 on('pointermove',e=>{
  if(active!==null){
   if(e.pointerId!==active)return;
   // A second mouse button arrives as a chorded move, not a pointerdown.
   if(!touch&&e.buttons&2){check(e);return;}
   e.preventDefault();update(e,touch);return;
  }
  if(e.pointerType==='mouse'&&!e.buttons)update(e,false);
 });
 on('pointerup',e=>{
  if(e.pointerId!==active)return;e.preventDefault();
  if(!touch){release();update(e,false);onSwing();return;}
  const cancel=update(e,true);reset();if(cancel)onCheck();else onSwing();
 });
 const drop=e=>{if(e.pointerId===active){reset();onDrop();}};
 on('pointercancel',drop);on('lostpointercapture',drop);
 on('pointerleave',()=>{if(active===null)onPreview(null);});
 signal.addEventListener('abort',reset,{once:true});
 return reset;
}
