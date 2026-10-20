import {QuickGame, APPROACHES, WINDUP_MS, FEEDBACK_MS, HIT_MS, pitchLocation, inQuickZone} from './quick-game.js';
import {QUICK_PITCH_TYPES, drawSpinningBall} from './quick-pitches.js';

const RECORD_KEY='dugout.inning.v1';
const newSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
let active=false;
const icons={exit:'<path d="m14 6-6 6 6 6"/>',pause:'<path d="M9 5v14M15 5v14"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.1"/>',play:'<path d="m9 5 11 7-11 7Z"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',retry:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
function record(){try{const data=JSON.parse(localStorage.getItem(RECORD_KEY));return Number.isFinite(data?.best)?Math.max(0,data.best):0;}catch{return 0;}}

export function openQuickMode(){
  if(active)return;active=true;
  const origin=document.activeElement,overflow=document.body.style.overflow;
  const backgrounds=[...document.querySelectorAll('#boot,#app')],priorInert=backgrounds.map(el=>el.inert);
  backgrounds.forEach(el=>el.inert=true);document.body.style.overflow='hidden';
  const root=document.createElement('section');root.className='quick-mode';
  root.tabIndex=-1;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','한 이닝 승부');
  root.innerHTML=`
    <header class="quick-head"><button class="quick-exit icon-button" aria-label="게임 나가기" title="나가기">${icon('exit')}</button><b>DUGOUT<span>한 이닝 승부</span></b><button class="quick-help icon-button" aria-label="도움말" title="도움말">${icon('help')}</button><button class="quick-pause icon-button" aria-label="일시정지" title="일시정지" disabled>${icon('pause')}</button></header>
    <div class="quick-score">
      <div class="quick-runs"><strong class="quick-points">0</strong><span>득점</span></div>
      <div class="quick-counts"><div class="count-balls"></div><div class="count-strikes"></div><div class="count-outs"></div></div>
      <div class="quick-bases" role="img" aria-label="주자 없음"><i data-base="2"></i><i data-base="1"></i><i data-base="0"></i></div>
    </div>
    <div class="quick-field"><canvas aria-label="스트라이크 존에 공이 도착할 때 스윙하세요. 볼은 누르지 않고 보냅니다."></canvas><div class="quick-message" role="status" aria-live="polite" aria-atomic="true"></div></div>
    <div class="quick-action">
      <button class="quick-report">투수 배합</button>
      <div class="quick-approaches" role="group" aria-label="노림수">
        ${Object.entries(APPROACHES).map(([key,value])=>`<button data-approach="${key}" aria-pressed="false">${value.label}</button>`).join('')}
      </div>
      <p class="quick-hint" id="quickApproachHint"></p>
      <button class="quick-swing" aria-describedby="quickApproachHint">투구 받기 ${icon('arrow')}</button>
      <span class="quick-input-hint">누르면 스윙 · 볼은 참기 <kbd>SPACE</kbd></span>
    </div>
    <div class="quick-cover"></div>`;
  document.body.append(root);
  const $=selector=>root.querySelector(selector),canvas=$('canvas'),ctx=canvas.getContext('2d');
  const cover=$('.quick-cover'),swingButton=$('.quick-swing'),action=$('.quick-action');
  const lifecycle=new AbortController();
  const on=(el,event,fn)=>el.addEventListener(event,fn,{signal:lifecycle.signal});
  let game,phase='ready',elapsed=0,paused=false,closed=false,raf,lastTime=performance.now();
  let width=0,height=0,outcome=null,best=record(),displayedPitch=null,swingAt=null,overlayReturn=null;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pitcherLabel=()=>`${game.pitcher.hand==='L'?'좌완':'우완'} · ${game.pitcher.name}`;
  const dots=(label,count,total)=>`<span>${label}</span>${Array.from({length:total},(_,i)=>`<i class="${i<count?'lit':''}"></i>`).join('')}`;
  function hud(){
    root.dataset.phase=phase;
    $('.quick-help').disabled=phase==='finished';
    $('.quick-points').textContent=game.runs;
    for(const [selector,label,value,total] of [['.count-balls','B',game.balls,3],['.count-strikes','S',game.strikes,2],['.count-outs','O',game.outs,3]]){
      const el=$(selector);el.innerHTML=dots(label,value,total);el.setAttribute('role','img');el.setAttribute('aria-label',`${label==='B'?'볼':label==='S'?'스트라이크':'아웃'} ${value}`);
    }
    $('.quick-bases').setAttribute('aria-label',game.bases.some(Boolean)?game.bases.flatMap((v,i)=>v?[`${i+1}루`]:[]).join(', ')+' 주자':'주자 없음');
    root.querySelectorAll('[data-base]').forEach(el=>el.classList.toggle('occupied',game.bases[Number(el.dataset.base)]));
    $('.quick-report').innerHTML=`<span>${pitcherLabel()}</span><span>배합 보기 ${icon('arrow')}</span>`;
    root.querySelectorAll('[data-approach]').forEach(el=>{el.setAttribute('aria-pressed',String(game.approach===el.dataset.approach));el.disabled=phase!=='plan'||paused;});
    $('.quick-hint').textContent=APPROACHES[game.approach].hint;
    swingButton.disabled=paused||!['plan','flight'].includes(phase);
    swingButton.innerHTML=phase==='flight'?'스윙':phase==='windup'?'준비…':phase==='feedback'?'결과 확인':'투구 받기 '+icon('arrow');
    $('.quick-report').disabled=!['plan','ready'].includes(phase)||paused;
  }
  function message(title,detail=''){
    const box=$('.quick-message');box.replaceChildren();
    const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=title;span.textContent=detail;box.append(strong,span);
  }
  function showCover(html){
    overlayReturn=document.activeElement;cover.hidden=false;cover.innerHTML=`<div class="quick-sheet">${html}</div>`;
    action.inert=true;
    cover.querySelector('button')?.focus({preventScroll:true});
  }
  function hideCover(){cover.hidden=true;action.inert=false;}
  function reportHTML(){
    return `<small class="sheet-eyebrow">상대 투수</small><h2>${game.pitcher.name}</h2><p class="pitcher-meta">${game.pitcher.hand==='L'?'좌완':'우완'} · 구위 ${game.pitcher.stuff>=.7?'강함':'보통'} · 제구 ${game.pitcher.command>=.7?'안정':'보통'}</p>
      <div class="pitch-mix" aria-label="투수의 기본 구종 비율">${game.pitcher.arsenal.map(({type,usage})=>`<div><b>${QUICK_PITCH_TYPES[type].name}</b><span class="mix-bar"><i style="width:${usage}%"></i></span><span>${usage}%</span></div>`).join('')}</div>
      <p class="sheet-note">기본 배합 · 카운트에 따라 달라집니다.</p>`;
  }
  function ready(seed=newSeed()){
    game=new QuickGame(seed);phase='ready';paused=false;displayedPitch=game.pitch;outcome=null;swingAt=null;
    $('.quick-pause').disabled=true;message('');hud();
    showCover(`${reportHTML()}<p class="intro-rule">3아웃 전까지, 최대한 많은 득점.</p><button class="quick-start sheet-primary">타석 들어가기 ${icon('arrow')}</button><span class="quick-best">내 최고 ${best}득점</span>`);
    $('.quick-start').onclick=start;draw();
  }
  function start(){hideCover();$('.quick-pause').disabled=false;plan();swingButton.focus({preventScroll:true});}
  function plan(){
    phase='plan';elapsed=0;lastTime=performance.now();displayedPitch=game.pitch;swingAt=null;outcome=null;
    delete root.dataset.verdict;
    message(game.strikes===2?'2스트라이크':game.balls===3?'3볼':`${game.plateAppearances+1}번째 타자`,
      game.strikes===2?'존을 지킬까, 한 공 더 기다릴까?':game.results.length===0?'노릴 공을 고르고 투구를 받으세요.':'');
    hud();
  }
  function beginPitch(){
    phase='windup';elapsed=0;lastTime=performance.now();outcome=null;swingAt=null;delete root.dataset.verdict;
    message('');hud();root.focus({preventScroll:true});
  }
  function resolve(offset){
    if(phase!=='flight'||paused||closed)return;
    outcome=game.resolve(offset);swingAt=offset===null?null:elapsed;phase='feedback';elapsed=0;
    root.dataset.verdict=outcome.kind;
    const timing=offset===null?'':outcome.kind==='whiff'&&!inQuickZone(displayedPitch)?'볼에 스윙':Math.abs(offset)<=40?'좋은 타이밍':offset<0?'조금 빨랐어요':'조금 늦었어요';
    message(outcome.label,`${displayedPitch.name} · ${displayedPitch.speed} km/h${outcome.runs?' · +'+outcome.runs+'득점':timing?' · '+timing:''}`);
    hud();
  }
  function swing(){
    if(paused||document.hidden||!cover.hidden)return;
    if(phase==='plan'){beginPitch();return;}
    if(phase!=='flight')return;
    const offset=elapsed+Math.max(0,performance.now()-lastTime)-displayedPitch.flight;
    resolve(offset>HIT_MS?null:offset);
  }
  function finish(){
    phase='finished';elapsed=0;$('.quick-pause').disabled=true;
    const previous=best;best=Math.max(best,game.runs);let saved=true;
    try{localStorage.setItem(RECORD_KEY,JSON.stringify({best}));}catch{saved=false;}
    message('');hud();
    showCover(`<small class="sheet-eyebrow">${game.runs>previous?'새 최고 기록':'3 OUT · 이닝 종료'}</small><h2 class="result-runs">${game.runs}<small>득점</small></h2><p class="result-line">${game.hits}안타 · ${game.walks}볼넷 · ${game.results.length}구</p><p class="sheet-note">${game.results.filter(r=>r.kind==='whiff'&&!inQuickZone(r.pitch)).length>2?'다음엔 존 밖의 공을 보내보세요.':game.hits===0?'노릴 공을 정하고 타이밍을 잡아보세요.':'이번 투수, 한 번 더 공략해볼까요?'}</p><button class="quick-retry sheet-primary">${icon('retry')} 같은 투수 다시</button><button class="quick-new sheet-secondary">다른 투수 만나기 ${icon('arrow')}</button><small class="quick-best">${saved?'내 최고 '+best+'득점 · 이 기기에 저장':'기록을 저장하지 못했습니다'}</small>`);
    $('.quick-retry').onclick=()=>ready(game.seed);$('.quick-new').onclick=()=>ready();
  }
  function pause(kind='pause'){
    if(paused||phase==='finished')return;
    paused=true;hud();
    let body;
    if(kind==='report')body=reportHTML();
    else if(kind==='help')body=`<small class="sheet-eyebrow">HOW TO PLAY</small><h2>한 공의 판단</h2><ol class="quick-instructions"><li><b>노림수</b><span>구종을 노리면 장타, 맞히기는 넓게 대응.</span></li><li><b>스윙</b><span>존에 도착할 때 누르세요. 볼은 참기.</span></li><li><b>한 이닝</b><span>4볼 출루 · 3스트라이크 삼진 · 3아웃 끝.</span></li></ol><p class="sheet-note">안타만큼 진루 · 도루·병살·희생타 생략.</p>`;
    else body='<small class="sheet-eyebrow">TIME OUT</small><h2>잠깐, 숨 고르기.</h2><p class="sheet-note">던지던 공은 처음부터 다시 받습니다.</p>';
    showCover(`${body}<button class="quick-resume sheet-primary">${phase==='ready'?'투수 확인으로':'계속하기'} ${icon('play')}</button>`);
    $('.quick-resume').onclick=resume;
  }
  function resume(){
    if(!paused||document.hidden)return;paused=false;hideCover();
    if(phase==='ready'){ready(game.seed);return;}
    if(phase==='flight'||phase==='windup')beginPitch();
    else{lastTime=performance.now();hud();}
    (['flight','windup'].includes(phase)?root:overlayReturn?.isConnected&&!overlayReturn.disabled?overlayReturn:swingButton).focus({preventScroll:true});
  }
  function close(){
    if(closed)return;closed=true;active=false;lifecycle.abort();cancelAnimationFrame(raf);resize.disconnect();root.remove();
    backgrounds.forEach((el,i)=>el.inert=priorInert[i]);document.body.style.overflow=overflow;origin?.focus();
  }
  on($('.quick-exit'),'click',close);
  on($('.quick-pause'),'click',()=>paused?resume():pause());
  on($('.quick-help'),'click',()=>{if(!paused)pause('help');});
  on($('.quick-report'),'click',()=>pause('report'));
  root.querySelectorAll('[data-approach]').forEach(el=>on(el,'click',()=>{if(phase==='plan'&&!paused){game.setApproach(el.dataset.approach);hud();}}));
  for(const el of [canvas,swingButton])on(el,'pointerdown',e=>{
    if(e.button!==0||!e.isPrimary)return;
    if(el===canvas&&phase!=='flight')return;
    e.preventDefault();swing();
  });
  on(swingButton,'click',e=>{if(e.detail===0)swing();});
  on(document,'keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();if(paused)resume();else if(phase==='ready'||phase==='finished')close();else pause();return;}
    if(e.key==='Tab'){
      const buttons=[...root.querySelectorAll('button:not(:disabled)')].filter(el=>el.getClientRects().length&&!el.closest('[inert]'));
      const first=buttons[0],last=buttons.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
    if(e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;
    const control=e.target.closest?.('button,input,select,textarea,a');
    if(e.code==='Space'&&cover.hidden&&(!control||control===swingButton)){e.preventDefault();swing();}
    if(e.key.toLowerCase()==='p'){e.preventDefault();paused?resume():pause();}
  });
  on(document,'visibilitychange',()=>{if(document.hidden&&!['ready','finished'].includes(phase))pause();});
  on(window,'blur',()=>{if(!['ready','finished'].includes(phase))pause();});
  function circle(x, y, radius, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }
  function draw() {
    if (!ctx || !width || !height) return;
    const w = width, h = height, cx = w / 2, plate = h * .69, target = Math.min(w * .14, h * .11, 46), zoneHeight = target * 1.25;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#163f38'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#204e42'; ctx.beginPath(); ctx.moveTo(cx, h * .24); ctx.lineTo(w * .98, h); ctx.lineTo(w * .02, h); ctx.fill();
    ctx.strokeStyle = '#9bb7a459'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(cx, h * .28); ctx.lineTo(w, h); ctx.stroke();
    ctx.fillStyle = '#98764f'; ctx.beginPath(); ctx.ellipse(cx, h * .32, 35, 12, 0, 0, Math.PI * 2); ctx.fill();
    // A compact pitcher silhouette stays proportional in short mobile fields.
    const figureScale=Math.max(.6,Math.min(1.15,h/500)), feet=h*.32;
    ctx.save();ctx.translate(cx,feet);ctx.scale(figureScale,figureScale);
    ctx.lineCap='round';ctx.strokeStyle='#e7e7d6';ctx.lineWidth=8;
    ctx.beginPath();ctx.moveTo(-3,-18);ctx.lineTo(-8,-1);ctx.moveTo(3,-18);ctx.lineTo(10,-1);ctx.stroke();
    ctx.strokeStyle='#172f32';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-11,0);ctx.lineTo(-4,0);ctx.moveTo(7,0);ctx.lineTo(15,0);ctx.stroke();
    ctx.fillStyle='#eee9d4';ctx.fillRect(-8,-39,16,23);
    ctx.fillStyle='#244b53';ctx.fillRect(-8,-40,16,7);ctx.fillRect(-2,-33,4,15);
    circle(0,-48,8,'#e5bf91');
    ctx.fillStyle='#244b53';ctx.beginPath();ctx.arc(0,-50,8,Math.PI,0);ctx.fill();ctx.fillRect(-8,-51,20,3);
    ctx.strokeStyle='#eee9d4';ctx.lineWidth=6;
    ctx.beginPath();ctx.moveTo(-7,-35);ctx.lineTo(-15,-25);ctx.lineTo(-8,-22);ctx.moveTo(7,-35);ctx.lineTo(13,-28);ctx.lineTo(1,-25);ctx.stroke();
    circle(-9,-24,6,'#a87344');ctx.restore();
    ctx.strokeStyle = '#f1dca4'; ctx.lineWidth = 3;
    ctx.strokeRect(cx - target, plate - zoneHeight, target * 2, zoneHeight * 2);
    ctx.fillStyle = '#f1dca410'; ctx.fillRect(cx - target, plate - zoneHeight, target * 2, zoneHeight * 2);
    ctx.strokeStyle = '#f1dca44a'; ctx.lineWidth = 1;
    for (const third of [-1/3, 1/3]) {
      ctx.beginPath(); ctx.moveTo(cx + target * third, plate - zoneHeight); ctx.lineTo(cx + target * third, plate + zoneHeight);
      ctx.moveTo(cx - target, plate + zoneHeight * third); ctx.lineTo(cx + target, plate + zoneHeight * third); ctx.stroke();
    }
    ctx.fillStyle = '#e0e9d8'; ctx.textAlign = 'center'; ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d9d5b8'; ctx.beginPath();
    ctx.moveTo(cx - 14, plate + zoneHeight + 28); ctx.lineTo(cx + 14, plate + zoneHeight + 28); ctx.lineTo(cx + 14, plate + zoneHeight + 36); ctx.lineTo(cx, plate + zoneHeight + 44); ctx.lineTo(cx - 14, plate + zoneHeight + 36); ctx.fill();
    if (phase === 'flight' || phase === 'feedback') {
      let progress = phase === 'flight' ? elapsed / displayedPitch.flight : 1;
      const location = pitchLocation(displayedPitch, progress);
      const depth = progress <= 1 ? location.depth : 1 + (progress - 1) * 3;
      let x = cx + location.x * target;
      let y = h * .27 + (plate - h * .27) * depth - location.z * zoneHeight;
      let radius = 3 + Math.min(1.2, depth) ** 2 * (target * .26 - 3);
      // Reveal the actual plate-crossing location only after the decision.
      if (phase === 'feedback') {
        const lx = cx + displayedPitch.x * target, ly = plate - displayedPitch.z * zoneHeight;
        ctx.strokeStyle = inQuickZone(displayedPitch) ? '#f1dca4' : '#b3dcf0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(lx, ly, target * .26, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle; ctx.textAlign = 'left';
        ctx.fillText(inQuickZone(displayedPitch) ? '존 안' : '볼', lx + target * .26 + 6, ly + 4); ctx.textAlign = 'center';
      }
      if (phase === 'feedback' && outcome?.kind === 'hit') {
        const p = reduced ? 1 : Math.min(1, elapsed / 700);
        x += (outcome.offset < 0 ? -1 : 1) * w * .32 * p;
        y -= h * .8 * p; radius *= 1 - p * .7;
      }
      circle(x + 2, y + 4, radius + 3, '#071b2638');
      const spinTime = phase === 'flight' ? elapsed / 1000 : (displayedPitch.flight + elapsed) / 1000;
      drawSpinningBall(ctx, x, y, radius, displayedPitch.spin, reduced ? 0 : spinTime);
      if (phase === 'feedback' && swingAt !== null && elapsed < 300 && !reduced) {
        const angle = -.8 + elapsed / 300 * 2;
        ctx.strokeStyle = '#e5b36b'; ctx.lineWidth = 13;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * target * 2, plate + Math.sin(angle) * target * 2); ctx.lineTo(cx - Math.cos(angle) * target, plate - Math.sin(angle) * target); ctx.stroke();
      }
    }
  }
  const resize=new ResizeObserver(()=>{
    const box=canvas.getBoundingClientRect();width=box.width;height=box.height;
    const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    ctx?.setTransform(dpr,0,0,dpr,0,0);draw();
  });resize.observe(canvas);
  function frame(now){
    if(closed)return;const delta=now-lastTime;lastTime=now;
    if(!paused&&['windup','flight','feedback'].includes(phase)){
      if(delta>400)pause();
      else{
        elapsed+=Math.max(0,delta);
        if(phase==='windup'&&elapsed>=WINDUP_MS){phase='flight';elapsed=0;hud();}
        else if(phase==='flight'&&elapsed>displayedPitch.flight+HIT_MS)resolve(null);
        else if(phase==='feedback'&&elapsed>=FEEDBACK_MS)game.done?finish():plan();
      }
    }
    draw();raf=requestAnimationFrame(frame);
  }
  ready();raf=requestAnimationFrame(frame);
}
