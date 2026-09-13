// Pointer type, rather than screen width, keeps mice and touch screens distinct.
export function mountBattingPointer(surface,{signal,aimAt,onAim,onSwing,onPreview}){
 let active=null;
 const reset=()=>{const id=active;active=null;onPreview(null);if(id!==null&&surface.hasPointerCapture?.(id))surface.releasePointerCapture(id);};
 const update=(e,touch)=>{
  const r=surface.getBoundingClientRect(),cancelHeight=Math.min(120,Math.max(72,r.height*.18));
  const cancel=touch&&e.clientY>=r.bottom-cancelHeight;
  const x=Math.max(r.left+18,Math.min(r.right-18,e.clientX));
  const y=Math.max(r.top+18,Math.min(r.bottom-18,e.clientY-(touch?64:0)));
  if(!cancel){const aim=aimAt(x,y);if(aim)onAim(aim.x,aim.z);}
  onPreview({x,y,cancel,touch,cancelHeight});return cancel;
 };
 const on=(name,f)=>surface.addEventListener(name,f,{signal});
 on('pointerdown',e=>{
  if(e.button!==0||active!==null)return;e.preventDefault();
  if(e.pointerType==='mouse'){update(e,false);onSwing();return;}
  active=e.pointerId;if(e.isTrusted)surface.setPointerCapture?.(active);update(e,true);
 });
 on('pointermove',e=>{
  if(active!==null){if(e.pointerId===active){e.preventDefault();update(e,true);}return;}
  if(e.pointerType==='mouse'&&!e.buttons)update(e,false);
 });
 on('pointerup',e=>{if(e.pointerId!==active)return;e.preventDefault();const cancel=update(e,true);reset();if(!cancel)onSwing();});
 on('pointercancel',e=>{if(e.pointerId===active)reset();});
 on('lostpointercapture',e=>{if(e.pointerId===active)reset();});
 on('pointerleave',()=>{if(active===null)onPreview(null);});
 signal.addEventListener('abort',reset,{once:true});
 return reset;
}
