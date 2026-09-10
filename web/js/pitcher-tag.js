import {PITCHES} from './inning-game.js';
export function mountPitcherTag(root,old,onOpen){
 const tag=document.createElement('button');tag.className='inning-opponent pitcher-tag';tag.hidden=true;tag.setAttribute('aria-controls','pitcherDetails');tag.setAttribute('aria-expanded','false');old.replaceWith(tag);
 const panel=document.createElement('section');panel.id='pitcherDetails';panel.className='pitcher-details';panel.hidden=true;panel.setAttribute('aria-label','투수 구종과 구속');root.append(panel);
 const close=()=>{panel.hidden=true;tag.setAttribute('aria-expanded','false');};
 tag.onclick=()=>{if(panel.hidden){onOpen?.();panel.hidden=false;tag.setAttribute('aria-expanded','true');panel.querySelector('button').focus();}else close();};
 root.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!tag.contains(e.target))close();});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.stopImmediatePropagation();close();tag.focus();}});
 return {close,paint(p){
  tag.innerHTML=`<b>${p.name}</b><span>직구 ${Math.round(p.fast*100)}%</span>`;tag.setAttribute('aria-label',p.name+' 투수 정보');
  const fast=Math.round(p.fast*100),slider=Math.round((1-p.fast)*.58*100),rates={FF:fast,SL:slider,CH:100-fast-slider};
  panel.innerHTML=`<header><b>${p.name}</b><button aria-label="투수 정보 닫기">×</button></header><div class="pitcher-repertoire">${Object.entries(PITCHES).map(([type,pitch])=>`<div><b>${pitch.name}</b><span>${pitch.speed-2}–${pitch.speed+2} <small>km/h</small></span><strong>${rates[type]}%</strong></div>`).join('')}</div>`;
  panel.querySelector('button').onclick=()=>{close();tag.focus();};
 },update(anchor){
  positionPlayerTag(tag,anchor);
 }};
}
export function positionPlayerTag(tag,anchor){
 if(!anchor){tag.hidden=true;return;}
 tag.hidden=false;const width=tag.offsetWidth,height=tag.offsetHeight,x=anchor.x*innerWidth,y=anchor.y*innerHeight-8;
 if(x<0||x>innerWidth||y<height+8||y>innerHeight){tag.hidden=true;return;}
 const left=Math.round(Math.max(width/2+8,Math.min(innerWidth-width/2-8,x))),top=Math.round(y);
 // Ignore subpixel idle motion so the label remains a steady touch target.
 if(!tag.style.left||Math.abs(parseFloat(tag.style.left)-left)>=2)tag.style.left=left+'px';
 if(!tag.style.top||Math.abs(parseFloat(tag.style.top)-top)>=2)tag.style.top=top+'px';
}
