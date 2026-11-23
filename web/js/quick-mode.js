import {makeFieldReplay, drawFieldReplay, FIELD_REPLAY_START_MS} from './quick-field-replay.js';
import {QuickGame, APPROACHES, WINDUP_MS, HIT_MS, pitchLocation, inQuickZone} from './quick-game.js';
import {QUICK_PITCH_TYPES, drawSpinningBall} from './quick-pitches.js';
import {contactMotion, runnerPaths, runnerFrame, feedbackDuration, pitcherPose} from './quick-feedback.js';

const RECORD_KEY='dugout.inning.v1';
// Between pitches the next one comes on its own; tapping a card restarts the wait.
export const AUTO_PITCH_MS=1400;
const newSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
let active=false;
const icons={exit:'<path d="m14 6-6 6 6 6"/>',pause:'<path d="M9 5v14M15 5v14"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.1"/>',play:'<path d="m9 5 11 7-11 7Z"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',retry:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
function record(){try{const data=JSON.parse(localStorage.getItem(RECORD_KEY));return Number.isFinite(data?.best)?Math.max(0,data.best):0;}catch{return 0;}}
// Anyone who has finished an inning has seen the report and rules once.
export function returningPlayer(){try{return localStorage.getItem(RECORD_KEY)!==null;}catch{return false;}}

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
    <div class="quick-field"><canvas aria-label="스트라이크 존에 공이 도착할 때 스윙하세요. 볼은 누르지 않고 보냅니다."></canvas><div class="quick-message" role="status" aria-live="polite" aria-atomic="true"></div>
      <div class="quick-decision"><h2>어떤 공을 노릴까요?</h2><p class="quick-mix"></p><div class="quick-approaches" role="group" aria-label="노림수">
        ${Object.entries(APPROACHES).map(([key,value])=>`<button data-approach="${key}" aria-pressed="false"><svg viewBox="0 0 100 70" aria-hidden="true"><rect x="66" y="16" width="24" height="40" rx="2" fill="none" stroke="currentColor" opacity=".35"/><path d="${key==='fast'?'M8 35H77':key==='slow'?'M8 18Q58 10 77 45':'M15 48 70 22'}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>${key==='contact'?'<circle cx="70" cy="22" r="12" fill="none" stroke="currentColor" stroke-width="2"/>':''}<circle cx="77" cy="${key==='slow'?45:key==='fast'?35:22}" r="6" fill="currentColor"/></svg><strong>${value.label}</strong><small>${key==='fast'?'빠르게 준비':key==='slow'?'한 박자 기다리기':'넓게 대응'}</small></button>`).join('')}
      </div><i class="quick-auto" hidden></i></div>

    </div>
    <div class="quick-action">
      <button class="quick-report">투수 배합</button>
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
  let fieldReplay=null;
  let autoPitch=false,width=0,height=0,outcome=null,best=record(),displayedPitch=null,swingAt=null,overlayReturn=null;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pitcherLabel=()=>`${game.pitcher.hand==='L'?'좌완':'우완'} · ${game.pitcher.name}`;
  const dots=(label,count,total)=>`<span>${label}</span>${Array.from({length:total},(_,i)=>`<i class="${i<count?'lit':''}"></i>`).join('')}`;
  function baseDisplay(bases,moving=false){
    const label=bases.some(Boolean)?bases.flatMap((v,i)=>v?[`${i+1}루`]:[]).join(', ')+' 주자':'주자 없음';
    $('.quick-bases').setAttribute('aria-label',moving?'주자 진루 중':label);
    root.querySelectorAll('[data-base]').forEach(el=>el.classList.toggle('occupied',bases[Number(el.dataset.base)]));
  }
  function hud(){
    root.dataset.phase=phase;
    $('.quick-help').disabled=phase==='finished';
    $('.quick-points').textContent=phase==='feedback'&&outcome?outcome.before.runs:game.runs;
    $('.quick-decision').hidden=phase!=='plan';
    for(const [selector,label,value,total] of [['.count-balls','B',game.balls,3],['.count-strikes','S',game.strikes,2],['.count-outs','O',game.outs,3]]){
      const el=$(selector);el.innerHTML=dots(label,value,total);el.setAttribute('role','img');el.setAttribute('aria-label',`${label==='B'?'볼':label==='S'?'스트라이크':'아웃'} ${value}`);
    }
    baseDisplay(phase==='feedback'&&outcome?outcome.before.bases:game.bases);
    $('.quick-mix').textContent=game.pitcher.arsenal.map(({type,usage})=>`${QUICK_PITCH_TYPES[type].name} ${usage}%`).join(' · ');
    $('.quick-auto').hidden=!(phase==='plan'&&autoPitch);
    $('.quick-report').innerHTML=`<span>${pitcherLabel()}</span><span>배합 보기 ${icon('arrow')}</span>`;
    root.querySelectorAll('[data-approach]').forEach(el=>{el.setAttribute('aria-pressed',String(game.approach===el.dataset.approach));el.disabled=phase!=='plan'||paused;});
    $('.quick-hint').textContent=phase==='plan'?APPROACHES[game.approach].hint:'노림수 · '+APPROACHES[game.approach].label;
    swingButton.disabled=paused||!['plan','flight'].includes(phase);
    swingButton.innerHTML=phase==='flight'?'스윙':phase==='windup'?'준비…':phase==='feedback'?'결과 확인':(autoPitch?'바로 던지기 ':'투구 받기 ')+icon('arrow');
    $('.quick-report').disabled=!['plan','ready'].includes(phase)||paused;
  }
  function message(title,detail=''){
    const box=$('.quick-message');box.replaceChildren();
    const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=title;span.textContent=detail;box.append(strong,span);
  }
  function showCover(html){
    overlayReturn=document.activeElement;cover.hidden=false;cover.innerHTML=`<div class="quick-sheet">${html}</div>`;
    action.inert=true;$('.quick-decision').inert=true;
    cover.querySelector('button')?.focus({preventScroll:true});
  }
  function hideCover(){cover.hidden=true;action.inert=false;$('.quick-decision').inert=false;}
  function reportHTML(){
    return `<small class="sheet-eyebrow">상대 투수</small><h2>${game.pitcher.name}</h2><p class="pitcher-meta">${game.pitcher.hand==='L'?'좌완':'우완'} · 구위 ${game.pitcher.stuff>=.7?'강함':'보통'} · 제구 ${game.pitcher.command>=.7?'안정':'보통'}</p>
      <div class="pitch-mix" aria-label="투수의 기본 구종 비율">${game.pitcher.arsenal.map(({type,usage})=>`<div><b>${QUICK_PITCH_TYPES[type].name}</b><span class="mix-bar"><i style="width:${usage}%"></i></span><span>${usage}%</span></div>`).join('')}</div>
      <p class="sheet-note">기본 배합 · 카운트에 따라 달라집니다.</p>`;
  }
  function ready(seed=newSeed(),brief=!returningPlayer()){
    game=new QuickGame(seed);phase='ready';paused=false;displayedPitch=game.pitch;outcome=null;swingAt=null;
    $('.quick-pause').disabled=true;message('');hud();
    if(!brief){hideCover();start();return;}
    showCover(`${reportHTML()}<p class="intro-rule">3아웃 전까지, 최대한 많은 득점.</p><button class="quick-start sheet-primary">타석 들어가기 ${icon('arrow')}</button><span class="quick-best">내 최고 ${best}득점</span>`);
    $('.quick-start').onclick=start;draw();
  }
  function start(){hideCover();$('.quick-pause').disabled=false;plan(false);swingButton.focus({preventScroll:true});}
  function plan(auto=true){
    phase='plan';autoPitch=auto;elapsed=0;lastTime=performance.now();displayedPitch=game.pitch;swingAt=null;outcome=null;
    delete root.dataset.verdict;
    message('');
    $('.quick-decision h2').textContent=game.strikes===2?'2스트라이크, 어떻게 칠까요?':'어떤 공을 노릴까요?';
    hud();
  }
  function beginPitch(){
    phase='windup';elapsed=0;lastTime=performance.now();outcome=null;swingAt=null;delete root.dataset.verdict;
    message('');hud();root.focus({preventScroll:true});
  }
  function resolve(offset){
    if(phase!=='flight'||paused||closed)return;
    outcome=game.resolve(offset);fieldReplay=makeFieldReplay(outcome);swingAt=offset===null?null:displayedPitch.flight+offset;phase='feedback';elapsed=0;
    root.dataset.verdict=outcome.kind;
    const timing=offset===null?'':!inQuickZone(displayedPitch)?'볼에 스윙':outcome.kind==='hit'&&outcome.matched?'노림수 적중':outcome.kind==='hit'?'맞혀냈어요':outcome.kind==='out'?'빗맞았어요':offset<0?'조금 빨랐어요':'조금 늦었어요';
    message(outcome.label,`${displayedPitch.name} · ${displayedPitch.speed} km/h${outcome.runs?'':timing?' · '+timing:''}`);
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
    $('.quick-retry').onclick=()=>ready(game.seed,false);$('.quick-new').onclick=()=>ready(newSeed(),false);
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
    else{lastTime=performance.now();if(phase==='plan')elapsed=0;hud();}
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
  root.querySelectorAll('[data-approach]').forEach(el=>on(el,'click',()=>{if(phase==='plan'&&!paused){game.setApproach(el.dataset.approach);elapsed=0;hud();}}));
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
  function drawRunners(){
    if(phase==='plan'&&autoPitch)$('.quick-auto').style.setProperty('--left',String(Math.max(0,1-elapsed/AUTO_PITCH_MS)));
    if(phase!=='feedback'||!outcome)return [];
    const paths=runnerPaths(outcome.before.bases,outcome);
    const frames=paths.map(path=>runnerFrame(path,elapsed,reduced));
    if(paths.length)baseDisplay([1,2,3].map(base=>frames.some(frame=>!frame.moving&&frame.base===base)),frames.some(frame=>frame.moving));
    const scored=frames.filter(frame=>frame.scored).length;
    $('.quick-points').textContent=outcome.before.runs+scored;
    if(outcome.runs){
      const detail=`${displayedPitch.name} · ${displayedPitch.speed} km/h${scored?' · +'+scored+'득점':''}`;
      const label=$('.quick-message span');
      if(label.textContent!==detail)label.textContent=detail;
    }
    $('.quick-runs').classList.toggle('scoring',scored>0);
    return frames;
  }
  function draw() {
    const runners=drawRunners();
    if(phase!=='feedback')$('.quick-runs').classList.remove('scoring');
    if (!ctx || !width || !height) return;
    const w = width, h = height, cx = w / 2, plate = h * .69, target = Math.min(w * .14, h * .11, 46), zoneHeight = target * 1.25;
    const projectPitch=(progress)=>{
      const p=Math.max(0,Math.min(1,progress));
      // The ball travels steadily in depth. Perspective speeds up its apparent
      // approach without changing flight duration or the plate-crossing point.
      const perspective=p/(1.85-.85*p),after=Math.max(0,progress-1);
      const location=pitchLocation(displayedPitch,p);
      const courseDepth=Math.max(.001,location.depth);
      const x=location.x*Math.min(1.8,perspective/courseDepth);
      const z=location.z*Math.min(1.8,perspective/courseDepth);
      const releaseY=h*.32-25*Math.max(.6,Math.min(1.15,h/500));
      const depth=perspective+after*1.85;
      return {x:cx+x*target,y:releaseY+(plate-releaseY)*depth-z*zoneHeight,depth};
    };
    const showReplay=phase==='feedback'&&(fieldReplay||runners.length)&&(reduced||elapsed>=FIELD_REPLAY_START_MS);
    if(showReplay){
      root.dataset.view='field';
      let launchPoint;
      if(fieldReplay&&!reduced){
        const pitch=projectPitch((swingAt??displayedPitch.flight)/displayedPitch.flight);
        const motion=contactMotion(outcome,FIELD_REPLAY_START_MS);
        launchPoint=[pitch.x+motion.x*w,pitch.y+motion.y*h];
      }
      drawFieldReplay(ctx,w,h,fieldReplay,runners,elapsed,reduced,launchPoint);
      return;
    }
    if(root.dataset.view)delete root.dataset.view;
    const homeY=Math.min(h-14,plate+zoneHeight+35);
    const baseSpread=w*.34, baseY=h*.41, secondY=h*.21;
    const polygon=(points,fill)=>{
      ctx.fillStyle=fill;ctx.beginPath();
      points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
      ctx.closePath();ctx.fill();
    };
    ctx.fillStyle='#203a4c';ctx.fillRect(0,0,w,h);
    for(let row=0;row<4;row++){
      const y=h*(.055+row*.023);
      ctx.fillStyle=row%2?'#41566a':'#374d60';
      ctx.fillRect(0,y,w,h*.018);
    }
    ctx.fillStyle='#253b40';ctx.fillRect(0,h*.145,w,h*.058);
    ctx.fillStyle='#bc985a';ctx.fillRect(0,h*.145,w,2);
    ctx.fillStyle='#35654a';ctx.fillRect(0,h*.203,w,h);
    for(let stripe=-3;stripe<=3;stripe+=2){
      polygon([[cx+w*stripe*.12,h*.203],[cx+w*(stripe+1)*.12,h*.203],
        [cx+w*(stripe+1)*.42,h],[cx+w*stripe*.42,h]],'#3b6e50');
    }
    const first=[cx+baseSpread,baseY],third=[cx-baseSpread,baseY];
    polygon([[cx,h*.174],[cx+baseSpread*1.22,baseY],[cx,homeY+14],
      [cx-baseSpread*1.22,baseY]],'#936e4a');
    polygon([[cx,secondY+7],[first[0]-12,baseY],[cx,homeY-15],
      [third[0]+12,baseY]],'#35654a');
    ctx.strokeStyle='#e8dfbe';ctx.lineWidth=1.5;
    for(const side of [-1,1]){
      const edgeY=homeY+(baseY-homeY)*(.5/.34);
      ctx.beginPath();ctx.moveTo(cx,homeY);ctx.lineTo(cx+side*w*.5,edgeY);ctx.stroke();
    }
    for(const [x,y] of [first,[cx,secondY],third]){
      const size=Math.max(4,Math.min(8,w*.02));
      polygon([[x-size,y],[x,y-size*.55],[x+size,y],[x,y+size*.55]],'#efe7cd');
    }
    ctx.fillStyle='#a37b50';ctx.beginPath();ctx.ellipse(cx,h*.32,
      Math.min(35,w*.09),Math.min(12,h*.025),0,0,Math.PI*2);ctx.fill();
    // The same pose timeline is used in every viewport, mirrored for lefties.
    const figureScale=Math.max(.6,Math.min(1.15,h/500)), feet=h*.32;
    const pose=pitcherPose(phase,elapsed,game.pitcher.hand,reduced);
    const mirror=game.pitcher.hand==='L'?-1:1;
    const limb=(points,color,lineWidth)=>{
      ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.beginPath();
      points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
    };
    ctx.save();ctx.translate(cx,feet);ctx.scale(figureScale,figureScale);
    ctx.lineCap='round';ctx.lineJoin='round';
    limb([pose.hip,[6*mirror,-9],[10*mirror,0]],'#e7e7d6',8);
    limb([pose.hip,pose.knee,pose.foot],'#e7e7d6',8);
    limb([[7*mirror,0],[15*mirror,0]],'#172f32',5);
    limb([[pose.foot[0]-3,pose.foot[1]], [pose.foot[0]+4,pose.foot[1]]],'#172f32',5);
    limb([pose.hip,pose.shoulder],'#eee9d4',16);
    limb([pose.hip,pose.shoulder],'#244b53',3);
    circle(...pose.head,8,'#e5bf91');
    ctx.fillStyle='#244b53';ctx.beginPath();ctx.arc(pose.head[0],pose.head[1]-2,8,Math.PI,0);ctx.fill();ctx.fillRect(pose.head[0]-8,pose.head[1]-3,20,3);
    limb([pose.shoulder,[pose.glove[0]-5,pose.glove[1]-2],pose.glove],'#eee9d4',6);
    limb([pose.shoulder,pose.elbow,pose.hand],'#eee9d4',6);
    circle(...pose.hand,3,'#e5bf91');circle(...pose.glove,6,'#a87344');
    if(phase==='windup')circle(...pose.hand,3,'#fff3d0');
    ctx.restore();
    ctx.strokeStyle = '#f1dca4'; ctx.lineWidth = 3;
    ctx.strokeRect(cx - target, plate - zoneHeight, target * 2, zoneHeight * 2);
    ctx.fillStyle = '#f1dca410'; ctx.fillRect(cx - target, plate - zoneHeight, target * 2, zoneHeight * 2);
    ctx.strokeStyle = '#f1dca44a'; ctx.lineWidth = 1;
    for (const third of [-1/3, 1/3]) {
      ctx.beginPath(); ctx.moveTo(cx + target * third, plate - zoneHeight); ctx.lineTo(cx + target * third, plate + zoneHeight);
      ctx.moveTo(cx - target, plate + zoneHeight * third); ctx.lineTo(cx + target, plate + zoneHeight * third); ctx.stroke();
    }
    ctx.fillStyle = '#e0e9d8'; ctx.textAlign = 'center'; ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    polygon([[cx-14,homeY-7],[cx+14,homeY-7],[cx+14,homeY+1],
      [cx,homeY+8],[cx-14,homeY+1]],'#eae0bf');
    if (phase === 'flight' || phase === 'feedback') {
      const feedback=phase==='feedback';
      const motion=contactMotion(outcome,elapsed,reduced);
      // A miss continues from the actual swing instant, rather than snapping to
      // the plate. Contact departs from the rendered ball at input time.
      const progress=feedback
        ? motion.contact ? (swingAt??displayedPitch.flight)/displayedPitch.flight
          : reduced ? 1 : ((swingAt??displayedPitch.flight+HIT_MS)+elapsed)/displayedPitch.flight
        : elapsed/displayedPitch.flight;
      const {x:contactX,y:contactY,depth}=projectPitch(progress);
      const radius=3+Math.min(1.2,depth)*(target*.26-3);
      const missed=feedback&&swingAt!==null&&!motion.contact;
      if(missed){
        // Freeze the swing instant beside the pitch's plate-crossing position.
        const swingPoint=projectPitch(swingAt/displayedPitch.flight);
        const sx=swingPoint.x,sy=Math.max(12,Math.min(h-12,swingPoint.y));
        const px=cx+displayedPitch.x*target,py=plate-displayedPitch.z*zoneHeight;
        const outside=!inQuickZone(displayedPitch);
        const markerRadius=Math.max(5,target*.21);
        ctx.save();
        ctx.strokeStyle=outside?'#b3dcf0':'#f1dca4';
        ctx.lineWidth=2;
        if(Math.hypot(px-sx,py-sy)>markerRadius*2){
          ctx.setLineDash([4,5]);
          ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(px,py);ctx.stroke();
          ctx.setLineDash([]);
          circle(sx,sy,markerRadius*.65,'#fff3d0');
        }
        ctx.beginPath();ctx.arc(px,py,markerRadius,0,Math.PI*2);ctx.stroke();
        if(outside){
          ctx.beginPath();ctx.arc(px,py,markerRadius+4,0,Math.PI*2);ctx.stroke();
        }
        ctx.restore();
      }
      if(feedback&&!missed&&(motion.contact||progress>=1)&&(!motion.contact||reduced||elapsed>=180)){
        const lx=cx+displayedPitch.x*target,ly=plate-displayedPitch.z*zoneHeight;
        ctx.strokeStyle=inQuickZone(displayedPitch)?'#f1dca4':'#b3dcf0';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(lx,ly,target*.26,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle=ctx.strokeStyle;ctx.textAlign='left';
        ctx.fillText(inQuickZone(displayedPitch)?'존 안':'볼',lx+target*.26+6,ly+4);ctx.textAlign='center';
      }
      if(feedback&&swingAt!==null&&elapsed<180&&!reduced){
        const t=elapsed/180,angle=-.5+t*1.8;
        const batX=motion.contact?contactX:cx,batY=motion.contact?contactY:plate;
        ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#e5b36b';ctx.lineWidth=9;
        ctx.beginPath();ctx.moveTo(batX+Math.cos(angle)*target*1.8,batY+Math.sin(angle)*target*1.8);
        ctx.lineTo(batX-Math.cos(angle)*target*.4,batY-Math.sin(angle)*target*.4);ctx.stroke();ctx.restore();
      }
      if(feedback&&motion.impact>0){
        ctx.save();ctx.globalAlpha=motion.impact;ctx.strokeStyle=outcome.kind==='hit'?'#ffe4a2':'#ece6cf';ctx.lineWidth=2;
        const ring=radius+4+(1-motion.impact)*16;
        ctx.beginPath();ctx.arc(contactX,contactY,ring,0,Math.PI*2);ctx.stroke();
        for(let i=0;i<4;i++){
          const angle=i*Math.PI/2+.4;
          ctx.beginPath();ctx.moveTo(contactX+Math.cos(angle)*(ring+4),contactY+Math.sin(angle)*(ring+4));
          ctx.lineTo(contactX+Math.cos(angle)*(ring+10),contactY+Math.sin(angle)*(ring+10));ctx.stroke();
        }
        ctx.restore();
      }
      if(missed)return;
      const x=contactX+(feedback?motion.x*w:0),y=contactY+(feedback?motion.y*h:0);
      ctx.save();ctx.globalAlpha=feedback?motion.contact?motion.alpha:Math.min(1,Math.max(0,1-(progress-1)*4)):1;
      circle(x+2,y+4,radius*motion.scale+2,'#071b2638');
      const spinTime=feedback?((swingAt??displayedPitch.flight)+elapsed)/1000:elapsed/1000;
      drawSpinningBall(ctx,x,y,radius*(feedback?motion.scale:1),displayedPitch.spin,reduced?0:spinTime);
      ctx.restore();
    }
  }
  const resize=new ResizeObserver(()=>{
    const box=canvas.getBoundingClientRect();width=box.width;height=box.height;
    const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    ctx?.setTransform(dpr,0,0,dpr,0,0);draw();
  });resize.observe(canvas);
  function frame(now){
    if(closed)return;const delta=now-lastTime;lastTime=now;
    if(!paused&&(['windup','flight','feedback'].includes(phase)||phase==='plan'&&autoPitch)){
      if(delta>400)pause();
      else{
        elapsed+=Math.max(0,delta);
        if(phase==='plan'){if(elapsed>=AUTO_PITCH_MS)beginPitch();}
        else if(phase==='windup'&&elapsed>=WINDUP_MS){phase='flight';elapsed=0;hud();}
        else if(phase==='flight'&&elapsed>displayedPitch.flight+HIT_MS)resolve(null);
        else if(phase==='feedback'&&elapsed>=feedbackDuration(outcome))game.done?finish():plan();
      }
    }
    draw();raf=requestAnimationFrame(frame);
  }
  ready();raf=requestAnimationFrame(frame);
}
