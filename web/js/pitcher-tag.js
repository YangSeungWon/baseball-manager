import {PITCHES} from './inning-game.js';
export function mountPitcherTag(root,old,onOpen){
 const tag=document.createElement('button');tag.className='inning-opponent pitcher-tag';tag.hidden=true;tag.setAttribute('aria-controls','pitcherDetails');tag.setAttribute('aria-expanded','false');old.replaceWith(tag);
 const panel=document.createElement('section');panel.id='pitcherDetails';panel.className='pitcher-details';panel.hidden=true;panel.setAttribute('aria-label','투수 구종과 구속');root.append(panel);
 const close=()=>{panel.hidden=true;tag.setAttribute('aria-expanded','false');};
 tag.onclick=()=>{if(panel.hidden){onOpen?.();panel.hidden=false;tag.setAttribute('aria-expanded','true');panel.querySelector('button').focus();}else close();};
 root.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!tag.contains(e.target))close();});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.stopImmediatePropagation();close();tag.focus();}});
 return {close,paint(p,chart=null){
  tag.innerHTML=`<b>${p.name}</b><span>${p.style||''}</span>`;tag.setAttribute('aria-label',p.name+' 투수 정보');
  const seen=chart?.pitches||0,pct=n=>seen?Math.round(100*n/seen)+'%':'—';
  const counts=chart?Object.entries(chart.byCount).sort((a,b)=>a[0].localeCompare(b[0])):[];
  const chip=(t,n)=>n?`<i class="pitch-chip pitch-${t}" title="${PITCHES[t].name} ${n}구">${PITCHES[t].name[0]}${n>1?n:''}</i>`:'';
  const tells=chart?Object.entries(chart.tells).filter(([,v])=>v.seen):[];
  panel.innerHTML=`<header><b>${p.name}</b><button aria-label="투수 정보 닫기">×</button></header><p class="pitcher-style">${p.style||''} · 이 경기에서 본 ${seen}구</p>
  <div class="pitcher-repertoire">${Object.entries(PITCHES).map(([type,pitch])=>`<div><b>${pitch.name}</b><span>${pitch.speed+(p.speedOffset||0)-2}–${pitch.speed+(p.speedOffset||0)+2} <small>km/h</small></span><strong>${pct(chart?.byType[type]||0)}</strong></div>`).join('')}</div>
  ${counts.length?`<div class="pitcher-counts"><b>카운트별 관찰</b>${counts.map(([k,c])=>`<div><span>${k.replace('-','B-')}S</span><span>${chip('FF',c.FF)}${chip('SL',c.SL)}${chip('CH',c.CH)}</span><small>존 안 ${c.zoneIn} · 밖 ${c.zoneOut}</small></div>`).join('')}</div>`:'<p class="pitcher-empty">공을 보면 카운트별 기록이 쌓입니다.</p>'}
  ${tells.length?`<div class="pitcher-tells"><b>단서</b>${tells.map(([k,v])=>`<span>${k==='glove'?'미트 위치':'투구 템포'} ${v.matched}/${v.seen} 일치</span>`).join('')}</div>`:''}`;
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
