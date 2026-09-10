import {paceLabel,armLabel,batLabel,visionLabel,disciplineLabel,positionLabel} from './player-traits.js';
export function mountScouting(root,batting){
 const tray=document.createElement('div');tray.className='inning-scout';
 tray.innerHTML='<span class="scout-batter"></span><button class="scout-toggle" aria-expanded="false" aria-controls="scoutPanel">선수 ◇</button><section id="scoutPanel" class="scout-panel" aria-label="선수와 수비 배치" hidden><header><b>선수 · 수비 배치</b><button aria-label="선수 정보 닫기">×</button></header><div class="scout-content"></div></section>';
 root.append(tray);const toggle=tray.querySelector('.scout-toggle'),panel=tray.querySelector('.scout-panel');
 const close=()=>{panel.hidden=true;tray.style.zIndex='18';toggle.setAttribute('aria-expanded','false');};
 const open=()=>{panel.hidden=false;tray.style.zIndex='35';panel.querySelector('button').focus();toggle.setAttribute('aria-expanded','true');};
 toggle.onclick=()=>panel.hidden?open():close();panel.querySelector('button').onclick=()=>{close();toggle.focus();};
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.stopImmediatePropagation();close();toggle.focus();}});
 const spots=[['LF',1,1],['CF',1,2],['RF',1,3],['3B',2,1],['SS',2,2],['2B',2,3],['P',3,2],['1B',3,3],['C',4,2]];
 return {close,paint(s){
  const b=s.batter;
  tray.querySelector('.scout-batter').textContent=(batting?'나 ':'타자 ')+b.name+' · '+batLabel(b);
  tray.querySelector('.scout-content').innerHTML=`<div class="scout-runners">${s.baseRunners.map((r,i)=>`<div><b>${i+1}루</b><span>${r?r.name:'비어 있음'}</span>${r?`<strong>${paceLabel(r.speed)}</strong>`:''}</div>`).join('')}</div><div class="scout-field">${spots.map(([pos,row,col])=>{const f=s.defense[pos];return `<div style="grid-area:${row}/${col}" data-position="${pos}"><b>${positionLabel[pos]}</b><span>${pos==='P'?(s.pitcher?.name||'나의 마무리'):f.name}</span><strong>${paceLabel(f.speed,'fielder')}</strong><span>${armLabel(f.arm)}</span></div>`;}).join('')}</div><div class="scout-own"><b>${b.name}</b> · ${batLabel(b)} · ${paceLabel(b.speed)}${batting?' · '+visionLabel(b)+' · '+disciplineLabel(b):' · '+(b.chase<.3?'유인구 잘 참음':b.chase>.5?'적극적 스윙':'선구 보통')}</div>`;
 }};
}
