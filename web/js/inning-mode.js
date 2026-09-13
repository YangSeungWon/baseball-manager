import { FRANCHISES } from './core/names.js';
import { flippedBat, celebrationPlayers, CELEBRATION_DURATION } from './celebration.js';
import { STAGES, getStage, clearStage, clearedStages } from './inning-stages.js';
import { mountPitcherTag, positionPlayerTag } from './pitcher-tag.js';
import { leadPosition } from './runner-motion.js';
import { mountScouting } from './scouting-ui.js';
import { paceLabel, visionLabel, disciplineLabel } from './player-traits.js';
import { sampleField, FIELD_POSITIONS } from './field-sim.js';
import { pitchPressure, releaseMarker } from './pitch-control.js';
import { InningGame, PITCHES } from './inning-game.js';
import { observedChart, tellLabel } from './pitcher-grammar.js';
import { BattingGame, readWindowFor } from './batting-game.js';
import { BATTING } from './batting-tuning.js';
const READ_MS=BATTING.read?.windowMs||2500,READ_LABEL=(READ_MS/1000).toFixed(1)+'초';
import { FullGame, FULL_STAGE } from './full-game.js';
import { LiveView, Timeline } from './live.js';
import { battingResult, resultCard, copyChallenge } from './inning-share.js';
import { layoutPitchMarkers } from './pitch-zone.js';
const BASE=[[0,0],[19.4,19.4],[0,38.8],[-19.4,19.4],[0,0]];
const pitchIcon=type=>`<svg class="inning-pitch-icon" viewBox="0 0 24 28" aria-hidden="true"><path d="${type==='FF'?'M12 3v19':type==='SL'?'M18 3c0 11-1 14-12 19':'M7 3c0 6 10 7 10 19'}" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="${type==='FF'?12:type==='SL'?6:17}" cy="22" r="3" fill="currentColor"/></svg>`;
const choiceIcon=kind=>`<svg class="batting-choice-icon" viewBox="0 0 24 24" aria-hidden="true">${({
  any:'<circle cx="12" cy="12" r="8"/><path d="M7 6q7 6 0 12M17 6q-7 6 0 12"/>',
  contact:'<path d="m4 19 9-9 3 3-9 9zM14 6l1-3M18 9l3-1"/><circle cx="18" cy="5" r="2"/>',
  power:'<path d="m3 20 8-8 3 3-8 8M8 10Q13 1 21 4M17 2l4 2-2 4"/>',
  swing:'<path d="m4 20 11-13 3 3L7 23M3 12q3-9 13-9"/>',
  take:'<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
})[kind]}</svg>`;
let opened=false;
export function openInningMode(role='pitcher',initialSeed=null,initialStage=0,continuedGame=null) {
  const full=role==='full',batting=full?continuedGame?.half==='bottom':role!=='pitcher';
  let stage=full?FULL_STAGE:getStage(batting?initialStage:0);
  if(opened)return;opened=true;
  const origin=document.activeElement,previousOverflow=document.body.style.overflow;
  const backgrounds=[document.querySelector('#boot'),document.querySelector('#app')].filter(Boolean),inert=backgrounds.map(e=>e.inert);
  backgrounds.forEach(e=>e.inert=true);document.body.style.overflow='hidden';
  const root=document.createElement('section');root.className='inning-mode';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',stage.title+' · '+stage.situation);
  root.innerHTML=`<div class="inning-shell"><header class="inning-head"><button class="inning-sound" aria-label="소리 켜기" aria-pressed="false"></button><button class="inning-exit" aria-label="나가기" title="나가기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
  <div class="inning-presentation"><div class="inning-score"></div><div class="inning-live"></div>
  <div class="inning-batter-entry" role="status" hidden></div><div class="inning-transition" role="status" hidden></div><div class="inning-live-zone" hidden></div><div class="inning-feedback" role="status" aria-live="polite"></div>
  <div class="inning-history sr-only" aria-label="현재 타석 투구 기록"></div></div>
  <div class="inning-controls" id="inningPlan"><div class="inning-opponent"></div>
  ${batting?`<fieldset class="inning-picks"><legend class="sr-only">노릴 공과 타격 방식</legend>
  <div class="inning-label">예상 코스</div><div class="inning-options" data-group="location"><button data-value="any" aria-pressed="true">전체</button><button data-value="in" aria-pressed="false">몸쪽</button><button data-value="out" aria-pressed="false">바깥쪽</button><button data-value="low" aria-pressed="false">낮게</button><button data-value="high" aria-pressed="false">높게</button></div><div class="inning-zone-slot"></div><div class="inning-label">노릴 구종</div><div class="inning-options" data-group="target"><button data-value="any" aria-pressed="true">모든 공</button>${Object.entries(PITCHES).map(([k,p])=>`<button data-value="${k}" aria-pressed="false">${pitchIcon(k)}${p.name}</button>`).join('')}</div>

  </fieldset>`:`<fieldset class="inning-picks"><legend class="sr-only">다음 투구 선택</legend>
  <div class="inning-label">구종</div><div class="inning-options" data-group="type">${Object.entries(PITCHES).map(([k,p])=>`<button data-value="${k}" aria-pressed="${k==='FF'}">${pitchIcon(k)}${p.name}<small>${p.speed} km/h</small></button>`).join('')}</div>
  <div class="inning-zone-slot"></div>
  <div class="inning-label">승부 방식</div><div class="inning-options" data-group="intent"><button data-value="attack" aria-pressed="true">존 안 승부</button><button data-value="chase" aria-pressed="false">유인구</button></div>
  <button class="go inning-throw">이 공 던지기</button></fieldset>`}
  <div class="inning-result" hidden></div></div></div>`;
  document.body.append(root);
  if(batting){root.classList.add('has-batting-dock');root.insertAdjacentHTML('beforeend','<div class="batting-decision"><div class="batting-decision-title"><strong class="sr-only">스윙</strong><span class="batting-time" aria-hidden="true">'+READ_LABEL+'</span></div><div class="batting-clock" aria-hidden="true"><em class="batting-next"></em><i></i><b class="batting-band">스윙 구간</b></div><button class="batting-hold" type="button" disabled><span>스윙</span><small>누르면 배트를 당기고 · 놓으면 휘두름 · 안 놓으면 참기<kbd>Space</kbd></small></button><button class="go inning-throw inning-time" type="button"><span>타임</span></button></div>');}
  const $=s=>root.querySelector(s);
  const flightRead=document.createElement('div');flightRead.className='flight-read';flightRead.hidden=true;flightRead.setAttribute('aria-hidden','true');root.append(flightRead);
  const scouting=mountScouting(root,batting);
  let entryKey=null;
  const entryLabel=$('.inning-batter-entry');
  const showEntry=(key,name,trait)=>{entryKey=key;entryLabel.innerHTML=`<b>${name}</b><span>${trait}</span>`;};
  const hideEntry=()=>{entryKey=null;entryLabel.hidden=true;};
  const pitcherTrait=p=>`${p.style} · ${p.fast>=.5?'직구 위주':'변화구 위주'}`;
  const batterEntry=(key,b)=>showEntry(key,b.name,batting?`${visionLabel(b)} · ${disciplineLabel(b)}`:`${b.style} · ${paceLabel(b.speed)}`);
  const pitcherTag=batting?mountPitcherTag(root,$('.inning-opponent'),()=>{scouting.close();if(!busy&&!paused){paused=true;holdClock();dock();}}):null;
  if(batting)root.insertAdjacentHTML('beforeend','<div class="inning-compact-plan" aria-label="선택한 타격 작전" hidden></div><div class="pitch-tell" aria-label="투구 단서" hidden></div>');
  root.insertAdjacentHTML('beforeend','<button class="inning-plan-toggle" aria-controls="inningPlan" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"/></svg><span>'+ (batting?'노릴 공':'투구 선택')+'</span></button>');
  if(!batting){const action=document.createElement('div');action.className='pitching-action';action.append($('.inning-throw'));action.insertAdjacentHTML('afterbegin','<button class="pitch-breathe">숨 고르기</button><div class="pitch-release" hidden><div class="pitch-release-label">릴리스 <span></span></div><div class="pitch-meter"><i class="pitch-perfect"></i><i class="pitch-needle"></i></div></div>');root.append(action);}
  if(batting){
    $('.inning-presentation').append($('.inning-opponent'));
    const board=document.createElement('div'),tools=document.createElement('div');board.className='batting-plan-grid';tools.className='batting-plan-tools';
    board.append($('[data-group=location]'));tools.append($('[data-group=target]'));board.append(tools);$('.inning-picks').append(board);
    $('[data-group=target] [data-value=any]').innerHTML=choiceIcon('any')+'<span>모든 공</span>';

    $('[data-group=location] [data-value=out]').textContent='바깥';
    $('[data-group=location] [data-value=out]').setAttribute('aria-label','바깥쪽 예상');
    $('[data-group=location] [data-value=any]').setAttribute('aria-label','전체 코스 대응');

    for(const [group,label] of [['location','예상 코스'],['target','노릴 구종']])$('[data-group='+group+']').setAttribute('aria-label',label);
    // 키캡. 터치 기기에서는 CSS 가 숨긴다. 단축키는 key() 가 같은 표를 읽는다.
    for(const [selector,cap] of Object.entries(KEYCAPS))for(const b of root.querySelectorAll(selector))b.insertAdjacentHTML('beforeend','<kbd class="key">'+cap+'</kbd>');
    root.insertAdjacentHTML('beforeend','<button class="inning-look" aria-label="홈플레이트 보기 / 정면으로" title="홈플레이트 보기 / 정면으로"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12v7l-6 5-6-5zM4 3h16"/></svg></button>');
    $('.inning-look').onclick=()=>lv?.three?.lookAtPlate();
  }
  const plan=open=>{root.classList.toggle('is-planning',open);$('.inning-plan-toggle').setAttribute('aria-expanded',String(open));};
  $('.inning-plan-toggle').onclick=()=>{if(!busy)plan(!root.classList.contains('is-planning'));};
  const zoneSvg=`<svg viewBox="0 0 200 200" aria-hidden="true"><path d="M80 184h40v7l-20 8-20-8z" fill="#a5b9b6"/><rect x="62" y="56" width="76" height="80" rx="2" fill="#29444d" stroke="#e1e9d9" stroke-width="2"/><path d="M87.3 56v80M112.7 56v80M62 82.7h76M62 109.3h76" stroke="#819b9f" stroke-dasharray="3 3" opacity=".6"/><g class="zone-markers"></g></svg>`;
  $('.inning-zone-slot').innerHTML=`<div class="inning-zone-row"><div class="inning-zone-map" ${batting?'':'data-group="zone"'}>${zoneSvg}${batting?'':'<button data-value="in" aria-pressed="false" class="zone-target zone-in">몸쪽</button><button data-value="out" aria-pressed="true" class="zone-target zone-out">바깥쪽</button><button data-value="low" aria-pressed="false" class="zone-target zone-low">낮게</button><button data-value="high" aria-pressed="false" class="zone-target zone-high">높게</button>'}</div></div>`;
  $('.inning-live-zone').innerHTML=zoneSvg+'<span class="sr-only">투구 위치</span>';$('.inning-live-zone').hidden=false;

  let seed=Number.isInteger(initialSeed)&&initialSeed>=0&&initialSeed<=0xffffffff?initialSeed:crypto.getRandomValues(new Uint32Array(1))[0],game,lv,busy=false,dead=false,events=[],runEvents=[],shown=null,scrollBefore=0,choice=batting?{target:'any',approach:'contact',location:'any',action:'swing'}:{type:'FF',zone:'out',intent:'attack'};   // approach/action stay for the zone overlay; the swing itself is decided by the hold
  let sound=true;try{sound=localStorage.getItem('dugout.sfx')!=='0';}catch{}
  const KEYCAPS={'[data-group=target] [data-value=any]':'1','[data-group=target] [data-value=FF]':'2','[data-group=target] [data-value=SL]':'3','[data-group=target] [data-value=CH]':'4',
    '[data-group=location] [data-value=any]':'0','[data-group=location] [data-value=in]':'←','[data-group=location] [data-value=out]':'→','[data-group=location] [data-value=low]':'↓','[data-group=location] [data-value=high]':'↑',
    '.inning-time':'T','.inning-look':'H','.inning-sound':'M','.inning-exit':'Esc'};
  let ambience='idle',intensity=.5,cancelDecision=null,releaseNow=null,calm=false,holdDown=false;
  // 타자 편은 투수가 템포를 만든다. 결과가 뜨면 잠시 뒤 다음 공이 오고, 타자는 '타임'으로만 멈춘다.
  let autoTimer=null,paused=false;
  const AUTO_DELAY=2300;
  function scheduleNext(delay=AUTO_DELAY){
    clearTimeout(autoTimer);autoTimer=null;
    if(!batting||dead||game.done||busy||paused||document.hidden)return;
    root.style.setProperty('--next-ms',delay+'ms');root.classList.remove('is-on-clock');void root.offsetWidth;root.classList.add('is-on-clock');
    autoTimer=setTimeout(()=>{autoTimer=null;root.classList.remove('is-on-clock');play();},delay);
  }
  function holdClock(){clearTimeout(autoTimer);autoTimer=null;root.classList.remove('is-on-clock');}
  // 타임: 화면에 띠가 뜨고 투수는 세트를 푼다. 배트를 당기거나(누르기) 버튼을 다시 누르면 타석에 선다.
  function callTime(on){
    if(!batting||dead||game.done)return;paused=on;
    if(on){holdClock();atmosphere('idle',.25);if(lv.S.fielders?.P)lv.S.fielders.P.pose='field';}
    else{if(lv.S.fielders?.P)lv.S.fielders.P.pose='pitch';atmosphere('idle',.5);}
    dock();if(!on&&!busy)scheduleNext(700);
  }
  const timeBanner=document.createElement('div');timeBanner.className='time-banner';timeBanner.innerHTML='<b>TIME</b><span>배트를 당기면 타석에 섭니다</span>';root.append(timeBanner);
  if(!batting)$('.pitch-breathe').onclick=()=>breathe();
  function dock(phase='ready'){
    if(!batting)return;
    $('.batting-decision').hidden=false;root.classList.toggle('is-paused',paused);root.classList.toggle('is-timeout',paused);
    $('.batting-time').textContent=phase==='read'?READ_LABEL:phase==='warm'?'투구 중':paused?'타임':'다음 공';
    $('.batting-clock i').style.left='0%';
    const hold=$('.batting-hold');hold.disabled=phase==='ready';hold.classList.remove('is-armed','is-loaded','is-swinging');hold.querySelector('span').textContent='스윙';
    const time=$('.inning-throw');time.disabled=phase!=='ready';time.querySelector('span').textContent=paused?'타석에 서기':'타임';time.setAttribute('aria-pressed',String(paused));
    hold.disabled=phase==='ready'&&!paused;   // during a time-out the hold button is the way back in
  }
  const runTimeline=tl=>new Promise(resolve=>{lv.tl=tl;lv.resolve=resolve;});
  async function breathe(){
    if(busy||calm||dead||game.done)return;
    busy=true;plan(false);$('.inning-picks').disabled=true;$('.inning-throw').disabled=true;
    const button=$('.pitch-breathe');button.disabled=true;button.textContent='후—';root.classList.add('is-breathing');
    const tl=new Timeline();tl.add(0,1.8,k=>button.style.setProperty('--breath',String(1-k)));
    await runTimeline(tl);if(dead)return;
    calm=true;busy=false;root.classList.remove('is-breathing');button.textContent='호흡 안정';
    selection();$('.inning-picks').disabled=false;$('.inning-throw').disabled=false;
  }
  async function releasePitch(){
    const pressure=pitchPressure(game.snapshot()),meter=$('.pitch-release');
    meter.hidden=false;lv.S.broadcast={kind:'pitch'};root.classList.add('is-releasing');$('.inning-throw').disabled=false;$('.inning-throw').textContent='지금 놓기';$('.pitch-breathe').disabled=true;
    meter.querySelector('span').textContent=calm?'안정':pressure>.65?'긴장':pressure>.4?'집중':'여유';
    return new Promise(resolve=>{
      const begin=performance.now(),duration=1900;let raf,timer,settled=false,displayed=-1;
      const finish=v=>{if(settled)return;settled=true;cancelAnimationFrame(raf);clearTimeout(timer);cancelDecision=null;releaseNow=null;meter.hidden=true;root.classList.remove('is-releasing');$('.inning-throw').disabled=true;resolve(v);};
      releaseNow=()=>finish(displayed);cancelDecision=()=>finish(null);
      const tick=()=>{const p=Math.min(1,(performance.now()-begin)/duration),v=releaseMarker(p,pressure,calm);displayed=v;$('.pitch-needle').style.left=((v+1)*50)+'%';lv.S.pitcherWind=Math.min(1,p*2);if(p>=1)finish(1);else raf=requestAnimationFrame(tick);};
      timer=setTimeout(()=>finish(1),duration);tick();
    });
  }
  async function readPitch(pitch){
    // 배포 직후 모듈이 절반만 갱신된 캐시(GitHub Pages 10분)에서도 멈추지 않도록 기본값을 둔다.
    const profile=readWindowFor(game.batter,choice,pitch),H=BATTING.hold||{contactMs:110,powerMs:420};
    const compact=$('.inning-compact-plan');compact.textContent=[choice.target==='any'?'모든 공':PITCHES[choice.target].name,({any:'전체 코스',in:'몸쪽',out:'바깥쪽',low:'낮게',high:'높게'})[choice.location]].join(' · ');compact.hidden=false;
    const tell=$('.pitch-tell');if(tell){tell.textContent=tellLabel(pitch.tell);tell.hidden=!pitch.tell;}
    root.classList.add('is-reading');dock('warm');
    const preview=new Timeline(),rec={batter:game.batter.name,bh:'R',th:'R',half:game.half||'bottom',inning:game.snapshot().inning??9,zh:1};
    const arrival=lv._pitch(preview,{...pitch,r:'B'},0,.65,rec,{last:true});
    const release=1.55,flight=arrival-release,from=release+flight*profile.from,to=release+flight*profile.to;
    const readZone=$('.inning-live-zone');
    const paintRead=p=>{
      const onset=profile.onset,clarity=Math.max(0,Math.min(1,(p-onset)/(1-onset)));
      lv.S.pitchRead={clarity};
    };
    const warm=new Timeline();warm.end=from;warm.step=t=>{warm.t=Math.min(t,from);preview.step(warm.t);};
    const clock=$('.batting-clock'),hold=$('.batting-hold');
    // 스윙은 누르는 순간 시작되고 되돌릴 수 없다. 누른 길이가 힘이 된다. 끝까지 안 누르면 지켜본 것이다.
    // 당겼다 놓기. 누르면 배트를 당기고(로드), 읽기 창 안에서 놓는 순간이 스윙이다. 당긴 길이가 힘.
    // 공이 오기 전에 놓으면 당김을 푼 것이고, 끝까지 놓지 않으면 참은 것이다.
    const picked=await new Promise(resolve=>{
      const input=new AbortController();let raf,timer,settled=false,pressedAt=null,timing=null,begin=null,end=null,open=false;
      const progress=now=>begin===null?0:Math.max(0,Math.min(1,(now-begin)/READ_MS));
      const powerAt=now=>Math.max(0,Math.min(1,(now-pressedAt-H.contactMs)/(H.powerMs-H.contactMs)));
      const finish=(action,{expired=false,power=null}={})=>{if(settled)return;settled=true;cancelAnimationFrame(raf);clearTimeout(timer);input.abort();cancelDecision=null;$('.batting-decision').hidden=true;root.classList.remove('is-deciding','is-reading','is-swinging','is-loaded');hold.classList.remove('is-armed','is-loaded','is-swinging');readZone.classList.remove('is-reading-pitch');compact.hidden=true;if($('.pitch-tell'))$('.pitch-tell').hidden=true;lv.S.battingDecision=false;lv.S.pitchRead=null;lv.S.batLoadAt=null;flightRead.hidden=true;zone();readZone.hidden=events.length===0;resolve(action?{action,expired,time:preview.t,timing:action==='swing'?timing:null,power:action==='swing'?power:null}:null);};
      cancelDecision=()=>finish(null);
      const press=()=>{holdDown=true;if(settled||pressedAt!==null)return;pressedAt=performance.now();lv.S.batLoadAt=pressedAt/1000;root.classList.add('is-loaded');hold.classList.add('is-loaded');hold.querySelector('span').textContent='당기는 중';};
      const releaseHold=()=>{if(settled||pressedAt===null)return;const now=performance.now();
        if(!open){pressedAt=null;lv.S.batLoadAt=null;root.classList.remove('is-loaded');hold.classList.remove('is-loaded');hold.querySelector('span').textContent='스윙';return;}   // 공이 오기 전: 당김을 푼다
        timing=progress(now);lv.S.fpSwingAt=now/1000;root.classList.add('is-swinging');hold.classList.add('is-swinging');finish('swing',{power:powerAt(now)});};
      const on=(target,name,fn,opts)=>target&&target.addEventListener(name,fn,{signal:input.signal,...opts});
      const surface=lv.three?.canvas||null;
      for(const el of [hold,surface]){on(el,'pointerdown',e=>{if(e.button===0){e.preventDefault();el.setPointerCapture?.(e.pointerId);press();}});}
      on(hold,'keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat)press();}});
      on(document,'pointerup',releaseHold);on(document,'pointercancel',releaseHold);
      on(document,'keydown',e=>{if(e.key===' '&&!e.repeat){e.preventDefault();press();}});
      on(document,'keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();releaseHold();}});
      // 와인드업: 당길 수는 있지만 아직 놓을 공이 없다. 타임에서 당긴 채로 나왔으면 그 당김을 잇는다.
      hold.disabled=false;if(holdDown&&lv.S.batLoadAt!=null){pressedAt=lv.S.batLoadAt*1000;root.classList.add('is-loaded');hold.classList.add('is-loaded');hold.querySelector('span').textContent='당기는 중';}
      (async()=>{
        await runTimeline(warm);if(dead||settled)return;
        lv.S.battingDecision=true;root.classList.add('is-deciding');dock('read');if(pressedAt!==null){hold.classList.add('is-loaded');hold.querySelector('span').textContent='당기는 중';}
        readZone.hidden=true;readZone.classList.add('is-reading-pitch');clock.style.setProperty('--swing-from',profile.sweet.from*100+'%');clock.style.setProperty('--swing-to',profile.sweet.to*100+'%');paintRead(0);
        $('.inning-feedback').textContent='';
        begin=performance.now();end=begin+READ_MS;open=true;
        const tick=()=>{const now=performance.now(),left=Math.max(0,end-now),p=progress(now);preview.step(from+(to-from)*p);paintRead(p);
          const inBand=p>=profile.sweet.from&&p<=profile.sweet.to;hold.classList.toggle('is-armed',inBand);
          if(pressedAt!==null)hold.style.setProperty('--drive',powerAt(now));
          $('.batting-time').textContent=(left/1000).toFixed(1)+'초';$('.batting-clock i').style.left=(p*100)+'%';
          if(!left)finish('take',{expired:pressedAt!==null});else raf=requestAnimationFrame(tick);};
        timer=setTimeout(()=>finish('take',{expired:pressedAt!==null}),READ_MS+30);tick();hold.focus({preventScroll:true});
      })();
    });
    return picked;
  }
  function soundLabel(){const on=!!lv?.sfx.on,b=$('.inning-sound');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="'+(on?'M16 8q5 4 0 8M19 5q7 7 0 14':'m17 9 5 6m0-6-5 6')+'"/></svg>';b.setAttribute('aria-label',on?'소리 끄기':'소리 켜기');b.title=on?'소리 끄기':'소리 켜기';b.setAttribute('aria-pressed',String(on));}
  function atmosphere(cue,k=.5){ambience=cue;intensity=k;lv.sfx.stadium(cue,k);lv.S.crowdReaction={cue,strength:k,at:performance.now()};}
  const opt={home:stage.home.name,away:stage.away.name,park:stage.park,crowd:Math.round(stage.park.capacity*.9),cap:stage.park.capacity,colors:stage.colors,view:'three',speed:1,sound:false,playerRole:batting?'batter':'pitcher',onFlightRead:p=>{flightRead.hidden=!p;if(!p)return;flightRead.style.left=(p.x*100)+'%';flightRead.style.top=(p.y*100)+'%';flightRead.style.setProperty('--read-size',(78-p.clarity*36)+'px');flightRead.style.opacity=String(.2+p.clarity*.25);},entryPlayerKey:()=>entryKey,onEntryAnchor:p=>positionPlayerTag(entryLabel,p),onPitcherAnchor:p=>pitcherTag?.update(!busy&&!dead&&!game.done?p:null),canLook:()=>!busy&&!dead&&!game.done,stageHeight:()=>innerHeight,immersive:()=>!dead,maxH:()=>innerHeight};
  function sync(state) {
    for(const f of Object.values(lv.S.fielders))if(f.home){f.x=f.home[0];f.y=f.home[1];delete f.pose;}
    lv.S.fieldPlay=null;lv.S.looseBat=null;lv.S.celebrants=[];
    lv.S.b=state.balls;lv.S.s=state.strikes;lv.S.outs=state.outs;lv.S.ball=null;lv.S.hold=null;lv.S.trail=[];lv.S.pitcherWind=0;lv.S.swing=0;
    lv.S.batter={name:state.batter.name,hand:'R',alpha:1};
    lv.S.runners=state.bases.flatMap((yes,i)=>{if(!yes)return [];const person=state.baseRunners?.[i]||{name:'주자 '+(i+1)};return [{...lv._runner(person.name,i+1),...leadPosition(i+1,person),id:person.id,speed:person.speed}];});
    if(state.full){lv.S.inning=state.inning;lv.S.half=state.half;lv.S.lineup=state.lineup;lv.S.battingOrder=state.battingOrder;lv.line.hits={...state.hits};lv.line.top=[...state.awayLine];lv.line.bottom=[...state.homeLine];lv.three?.setGameTime(state.timeProgress);}
    else lv.line.bottom=[0,0,0,0,0,0,0,0,stage.homeScore+state.runs];
  }
  function paint() {
    const s=game.snapshot();
    scouting.paint(s);
    const dots=(count,max,kind)=>Array.from({length:max},(_,i)=>`<i class="${kind}${i<count?' lit':''}"></i>`).join('');
    const bases=s.bases.map((v,i)=>v?(i+1)+'루':'').filter(Boolean).join(' · ')||'주자 없음';
    $('.inning-score').innerHTML=`<div class="inning-scoreline"><div class="inning-scoreteams"><div class="${batting||full?'':'own-team'}" aria-label="${stage.away.name}${batting||full?'':' · 나의 팀'}"><span>${stage.away.name}</span><strong>${s.awayScore??stage.awayScore}</strong></div><div class="${batting||full?'own-team':''}" aria-label="${stage.home.name}${batting||full?' · 나의 팀':''}"><span>${stage.home.name}</span><strong>${s.homeScore??stage.homeScore+s.runs}</strong></div></div><span class="inning-frame" aria-label="${s.inning??9}회 ${s.half==='top'?'초':'말'}">${!full&&batting?`<small>${stage.id+1}/${STAGES.length}</small>`:''}${s.inning??9} ${s.half==='top'?'▴':'▾'}</span></div>
      <div class="inning-counts"><span aria-label="${s.balls}볼 ${s.strikes}스트라이크 ${s.outs}아웃"><span>B ${dots(s.balls,3,'ball')}</span><span>S ${dots(s.strikes,2,'strike')}</span><span>O ${dots(s.outs,3,'out')}</span></span><button class="inning-diamond" aria-label="${bases} · 주자 정보" title="주자 정보">${s.bases.map((v,i)=>`<i class="base${i+1}${v?' occupied':''}" title="${i+1}루${v?' · '+paceLabel(s.baseRunners[i].speed):''}" data-pace="${v&&s.baseRunners[i].speed>=8.8?'fast':v&&s.baseRunners[i].speed<7.8?'slow':'normal'}"></i>`).join('')}</button><small>${s.count}구</small></div>`;
    $('.inning-diamond').onclick=()=>$('.scout-toggle').click();
    if(batting)pitcherTag.paint(s.pitcher,observedChart(full?game.histories.bottom:game.history));else $('.inning-opponent').innerHTML=`<b>${s.batter.name}</b><span>${s.batter.style}</span>`;
  }
  function zone(event=null) {
    const selected=busy&&event?event.choice:choice;
    const aimX=batting?0:(selected.zone==='in'?-1:selected.zone==='out'?1:0)*(selected.intent==='chase'?1.4:.8);
    const aimZ=batting?0:selected.zone==='low'?(selected.intent==='chase'?-1.4:-.8):selected.zone==='high'?(selected.intent==='chase'?1.4:.8):0;
    const area={in:[62,56,38,80],out:[100,56,38,80],low:[62,109,76,27],high:[62,56,76,27]}[selected.location];
    const coverage=batting&&selected.action!=='take'?(()=>{
      const power=selected.approach==='power',chosen=selected.location||'any';
      const cells=Array.from({length:9},(_,i)=>{
        const col=i%3,row=Math.floor(i/3);
        const matched=chosen==='any'||chosen==='in'&&col===0||chosen==='out'&&col===2||chosen==='high'&&row===0||chosen==='low'&&row===2;
        const level=chosen==='any'?(power?'trade':'cover'):matched?(power?'reward':'cover'):'risk';
        return `<rect class="zone-read zone-read-${level}" data-read="${level}" x="${63+col*25.3}" y="${57+row*26.6}" width="24.3" height="25.6" rx="2"/>`;
      }).join('');
      return `<g class="zone-coverage" data-approach="${selected.approach}" aria-hidden="true">${cells}</g>`;
    })():'';
    const pressure=pitchPressure(game.snapshot()),spread=(10+pressure*9)*(calm?.68:1);
    const pitchingRisk=!batting?`<ellipse class="zone-command ${selected.intent==='chase'?'is-chase':'is-attack'}" cx="${100+aimX*38}" cy="${96-aimZ*40}" rx="${spread}" ry="${spread*.78}"/>`:'';
    const target=batting?(area?`<rect class="zone-prediction" x="${area[0]}" y="${area[1]}" width="${area[2]}" height="${area[3]}" fill="none" stroke="#d9f0c4" stroke-width="2"/>`:''):`<circle cx="${100+aimX*38}" cy="${96-aimZ*40}" r="7" fill="#d9f0c4" fill-opacity=".35" stroke="#d9f0c4" stroke-width="2"/>`;
    const q=event?.pitch,inside=q&&Math.abs(q.x)<=1&&Math.abs(q.z)<=1;
    const pitches=event&&!events.some(e=>e.after.count===event.after.count)?[...events,event]:events;
    root.classList.toggle('has-zone',pitches.length>0||!batting||selected.location!=='any');
    const leaders=[];
    if(event?.control){const t=event.control.target;leaders.push(`<path class="zone-release-error" d="M${100+t.x*38} ${96-t.z*40}L${100+event.pitch.x*38} ${96-event.pitch.z*40}" stroke="#f39d78" stroke-width="2"/>`);}
    const marks=layoutPitchMarkers(pitches).map(({event:e,x,y,labelX,labelY},i)=>{
      const color=Math.abs(e.pitch.x)<=1&&Math.abs(e.pitch.z)<=1?'#f0cc76':'#88bddb';
      const moved=Math.hypot(x-labelX,y-labelY)>1;
      if(moved)leaders.push(`<path d="M${x} ${y}L${labelX} ${labelY}" stroke="${color}" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`);
      return `<g class="zone-pitch" data-pitch="${e.pitchNumber}"><title>${e.pitchNumber}구 · ${PITCHES[e.pitch.t].name} · ${e.label}</title><circle cx="${labelX}" cy="${labelY}" r="11" fill="${color}" stroke="${i===pitches.length-1?'#fff':'#142c37'}" stroke-width="2"/><text x="${labelX}" y="${labelY+5}" text-anchor="middle" font-size="15" font-weight="700" fill="#132630">${e.pitchNumber}</text></g>`;
    }).join('');
    root.querySelectorAll('.zone-markers').forEach(g=>g.innerHTML=coverage+pitchingRisk+target+leaders.join('')+marks);
    root.querySelectorAll('.inning-zone-map').forEach(map=>map.setAttribute('aria-label',batting?(selected.action==='take'?'지켜보기 선택':(selected.approach==='power'?'장타':'컨택')+' 타격 커버리지'):(selected.intent==='chase'?'유인구':'존 안 승부')+' 제구 범위'));
    if(batting)root.querySelectorAll('[data-group=location] button').forEach(button=>{
      button.classList.remove('plan-cover','plan-reward','plan-trade','plan-risk');
      if(selected.action==='take')return;
      const chosen=selected.location||'any',matched=chosen==='any'||button.dataset.value===chosen;
      button.classList.add('plan-'+(chosen==='any'?(selected.approach==='power'?'trade':'cover'):matched?(selected.approach==='power'?'reward':'cover'):'risk'));
    });
  }
  function selection() { zone(shown); }

  function history() {
    $('.inning-history').innerHTML=events.length?'<span>현재 타석 · 최근 투구</span>'+events.slice(-5).map(e=>`<span class="inning-pitch-chip"><small>${e.pitchNumber}구 · ${PITCHES[e.pitch.t].name}</small><b>${e.label}</b></span>`).join(''):'<span>현재 타자 · 첫 공을 고르세요.</span>';
  }
  function start(same=false) {
    if(lv){continuedGame=null;lv.skip();lv.destroy();}
    if(!same)seed=crypto.getRandomValues(new Uint32Array(1))[0];game=full?(continuedGame||new FullGame(seed)):batting?new BattingGame(seed,stage.id):new InningGame(seed);busy=false;events=[];runEvents=[];shown=null;paused=false;holdClock();root.classList.remove('is-playing','is-finished');plan(false);
    Object.assign(opt,{home:stage.home.name,away:stage.away.name,park:stage.park,colors:stage.colors,cap:stage.park.capacity,crowd:Math.round(stage.park.capacity*.9)});
    root.setAttribute('aria-label',stage.title+' · '+stage.situation);
    lv=new LiveView($('.inning-live'),opt);lv.sfx.stadiumOnly=true;lv.setSound(sound);lv.sfx.mute(document.hidden);ambience='idle';atmosphere('idle');soundLabel();
    const initial=game.snapshot();lv.S.inning=initial.inning??9;lv.S.half=initial.half||'bottom';lv.line.top=initial.full?[...initial.awayLine]:[0,0,0,0,0,0,0,0,stage.awayScore];lv.line.bottom=initial.full?[...initial.homeLine]:lv.line.bottom;
    const positions=FIELD_POSITIONS;
    for(const [pos,[x,y]] of Object.entries(positions))lv.S.fielders[pos]={pos,name:pos==='P'?(batting?game.pitcher.name:'나의 마무리'):game.defense[pos].name,x,y,home:[x,y],alpha:1};
    sync(initial);lv.S.broadcast={kind:'pitch'};
    $('.inning-throw').disabled=false;$('.inning-picks').disabled=false;$('.inning-picks').hidden=false;$('.inning-result').hidden=true;
    $('.inning-feedback').textContent='';if(!batting){calm=false;$('.pitch-breathe').disabled=false;$('.pitch-breathe').textContent='숨 고르기';$('.inning-throw').textContent='투구 시작';}paint();selection();history();dock();root.scrollTop=0;$('.inning-throw').focus({preventScroll:true});intro();
  }
  async function intro(){
    busy=true;root.classList.add('is-intro');$('.inning-picks').disabled=true;$('.inning-throw').disabled=true;
    if(batting)$('.batting-hold').disabled=true;else $('.pitch-breathe').disabled=true;
    const loadingView=lv,card=document.createElement('div');card.className='match-intro';
    const team=(side)=>{const t=stage[side],f=FRANCHISES.find(f=>f.city+' '+f.nick===t.name);return `<div class="match-club" style="--club:${stage.colors[side]}"><small>${side==='home'?'HOME':'AWAY'}</small><div class="match-crest" aria-hidden="true">${f?.mark||t.short.slice(0,1)}</div><strong>${t.name}</strong>${side===(batting||full?'home':'away')?'<span class="match-own">MY TEAM</span>':''}</div>`;};
    card.innerHTML=`<p class="match-venue">${stage.park.name}</p><div class="match-pair">${team('away')}<span class="match-vs">VS</span>${team('home')}</div><p class="match-format">${full?'9이닝 경기':stage.situation}</p><div class="match-starter"><small>${batting?'상대 투수':'마운드'}</small><b>${batting?game.pitcher.name:'나의 마무리'}</b><span>${batting?game.pitcher.style:'두 점의 리드'}</span></div>`;
    if(!continuedGame){root.append(card);root.classList.add('is-match-intro');}
    const enter=document.createElement('button');enter.className='go match-enter';enter.textContent='구장 준비 중…';enter.disabled=true;card.append(enter);
    const ready=await loadingView.ready;
    if (!ready || dead || lv!==loadingView){card.remove();return;}
    enter.disabled=false;enter.textContent='경기장 입장';if(!continuedGame)enter.focus({preventScroll:true});
    if(!continuedGame)await new Promise(resolve=>{enter.onclick=()=>{enter.disabled=true;resolve();};});
    if(dead||lv!==loadingView)return;
    card.remove();root.classList.remove('is-match-intro');
    const S=lv.S,tl=new Timeline(),pitcher=S.fielders.P;S.batter=null;pitcher.x=5;pitcher.y=14;pitcher.pose='walkField';S.broadcast={kind:'entry'};
    showEntry('fP',pitcher.name,batting?pitcherTrait(game.pitcher):'직구 · 슬라이더 · 체인지업');
    tl.add(0,3,k=>{pitcher.x=5*(1-k);pitcher.y=14+4.44*k;});
    tl.at(3,()=>{lv.sfx.setChant(game.batter.name,game.order+1);pitcher.pose='pitch';S.broadcast={kind:'change'};batterEntry('change0',game.batter);});
    const batter={name:game.batter.name,x:-6.5,y:-4,pose:'walk',wait:true};S.changePlayers=[batter];
    tl.at(3,()=>{batter.wait=false;});tl.add(3,2.8,k=>{batter.x=-6.5+5.65*k;batter.y=-4+4.1*k;});
    tl.at(5.8,()=>{batter.pose='bat';});tl.add(5.8,.5,null);
    await runTimeline(tl);if(dead)return;
    S.changePlayers=[];sync(game.snapshot());S.broadcast={kind:'pitch'};hideEntry();root.classList.remove('is-intro');busy=false;$('.inning-picks').disabled=false;$('.inning-throw').disabled=false;if(batting){dock();scheduleNext(1600);}
    if(batting)dock();else $('.pitch-breathe').disabled=false;
  }
  async function changeBatter(e) {
    const S=lv.S,tl=new Timeline(),out=e.result==='K'||e.fieldPlay?.events.some(x=>x.type==='catch'),next=!e.after.done;
    if(!out&&!next)return;
    S.batter=null;S.ball=null;S.hold=null;S.trail=[];S.swing=0;
    S.broadcast={kind:'change'};S.changePlayers=[];
    root.classList.add('is-changing');
    if(out){
      const departing={name:e.before.batter.name,x:-.85,y:.1,pose:e.result==='K'?'dejected':'walk'};
      S.changePlayers.push(departing);
      tl.add(0,2.8,k=>{departing.x=-.85-5.65*k;departing.y=.1-3.1*k;departing.gone=k===1;});
    }
    if(next){
      const enter=out?1.6:.3,arriving={name:e.after.batter.name,x:-6.5,y:-4,pose:'walk',wait:true};
      S.changePlayers.push(arriving);
      tl.at(enter,()=>{
        lv.sfx.setChant(e.after.batter.name,game.order+1);
        sync(e.after);S.batter=null;events=[];shown=null;zone();history();paint();
        arriving.wait=false;batterEntry('change'+S.changePlayers.indexOf(arriving),e.after.batter);
      });
      tl.add(enter,2.8,k=>{arriving.x=-6.5+5.65*k;arriving.y=-4+4.1*k;});
      tl.at(enter+2.8,()=>{arriving.pose='bat';});
      tl.add(enter+2.8,.7,null);
    }
    await runTimeline(tl);
    S.changePlayers=[];root.classList.remove('is-changing');hideEntry();
  }
  async function thirdOutScene(e){
    const S=lv.S,final=e.after.done,duration=final?5.2:1.8,tl=new Timeline();
    root.classList.add('is-third-out');S.ball=null;S.hold=null;S.trail=[];S.fieldPlay=null;S.outs=e.after.outs;S.b=e.after.balls;S.s=e.after.strikes;
    if(e.after.full){S.inning=e.after.inning;lv.line.top=[...e.after.awayLine];lv.line.bottom=[...e.after.homeLine];paint();}
    const leaving={name:e.before.batter.name,x:-.85,y:.1,pose:'dejected',wait:false};
    S.batter=null;S.changePlayers=[leaving];
    if(S.changePlayers.length)tl.add(0,Math.min(3,duration),k=>{leaving.x=-.85-6.4*k;leaving.y=.1-4*k;});
    for(const r of S.runners){r.pose='dejected';const x=r.x,y=r.y;tl.add(0,Math.min(3,duration),k=>{r.x=x+(-7-x)*k;r.y=y+(-4-y)*k;});}
    if(final&&!e.after.tie&&(e.after.half==='top'?e.after.won:!e.after.won)){
      atmosphere(e.after.won?'cheer':'groan',1);S.broadcast={kind:'mound-celebration'};
      const spots=[[0,18.44],[-1.4,17.5],[1.3,17.2],[-2.1,19],[2.1,19],[-.5,20.3],[.9,20.2],[-2.8,17.2],[2.8,17.2]];
      Object.values(S.fielders).forEach((f,i)=>{const x=f.x,y=f.y,[tx,ty]=spots[i%spots.length],distance=Math.hypot(tx-x,ty-y),travel=Math.max(.8,distance/10),delay=i>5?.35:0;tl.add(delay,Math.min(duration-delay,travel),k=>{f.x=x+(tx-x)*k;f.y=y+(ty-y)*k;f.pose=k<.9?'runCelebrate':i%2?'clap':'celebrate';f.watch={x:0,y:18.44,z:1.3};});});
    }else if(final&&e.after.won){
      atmosphere('cheer',1);S.broadcast={kind:'mound-celebration'};
      tl.add(0,duration,k=>{S.celebrationTime=k*duration;S.celebrants=celebrationPlayers(k*duration,game.pitcher.name).map(q=>({...q,y:q.y+18.44,watch:{x:0,y:18.44,z:1.5}}));});
    }else{
      S.broadcast={kind:'change'};Object.entries(S.fielders).filter(([pos])=>['P','C','1B','2B','SS','3B'].includes(pos)).forEach(([pos,f],i)=>{f.pose=i%2?'clap':'watch';f.watch={x:0,y:18.44,z:1.4};});
    }
    await runTimeline(tl);if(dead)return;S.celebrants=[];S.changePlayers=[];root.classList.remove('is-third-out');
  }
  async function changeInning(e){
    const S=lv.S,panel=$('.inning-transition'),next=!e.after.done;
    await thirdOutScene(e);if(dead)return;
    const tl=new Timeline();
    root.classList.add('is-changing');S.batter=null;S.runners=[];S.changePlayers=[];S.ball=null;S.hold=null;S.trail=[];S.fieldPlay=null;S.broadcast={kind:'beauty'};
    const mins=Math.round(15*60+(e.after.timeProgress||0)*210),clock=String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
    const light=(e.after.timeProgress||0)<.45?'낮 경기':(e.after.timeProgress||0)<.78?'해 질 무렵':'야간 조명';
    panel.innerHTML=`<b>${e.after.done?'경기 종료':e.after.inning+'회 말'}</b><span>${stage.away.short} ${e.after.awayScore} : ${e.after.homeScore} ${stage.home.short}</span><small>${clock} · ${light}</small>`;panel.hidden=false;
    const from=e.before.timeProgress||0,to=e.after.timeProgress||from;tl.add(0,2.2,k=>lv.three?.setGameTime(from+(to-from)*k));
    await runTimeline(tl);if(dead)return;panel.hidden=true;
    if(next){sync(e.after);S.batter=null;S.broadcast={kind:'change'};const arriving={name:e.after.batter.name,x:-6.5,y:-4,pose:'walk',wait:false};S.changePlayers=[arriving];lv.sfx.setChant(e.after.batter.name,game.order+1);batterEntry('change0',e.after.batter);const enter=new Timeline();enter.add(0,2.8,k=>{arriving.x=-6.5+5.65*k;arriving.y=-4+4.1*k;});enter.at(2.8,()=>{arriving.pose='bat';});enter.add(2.8,.5,null);await runTimeline(enter);if(dead)return;S.changePlayers=[];sync(e.after);S.broadcast={kind:'pitch'};hideEntry();events=[];shown=null;zone();history();paint();}
    root.classList.remove('is-changing');
  }
  async function celebrate(e){
    const S=lv.S,tl=new Timeline(),catcher=S.fielders.C,catcherStart=catcher?{x:catcher.x,y:catcher.y}:null;root.classList.add('is-celebrating');
    S.batter=null;S.runners=[];S.changePlayers=[];S.ball=null;S.hold=null;S.trail=[];S.fieldPlay=null;S.looseBat=null;
    const hero=e.result==='HR'?e.before.batter.name:(e.before.baseRunners[2]?.name||e.before.batter.name);
    S.broadcast={kind:'celebration'};S.outs=e.after.outs;S.b=e.after.balls;S.s=e.after.strikes;
    lv.line.bottom=e.after.full?[...e.after.homeLine]:[0,0,0,0,0,0,0,0,stage.homeScore+e.after.runs];paint();atmosphere('cheer',1);
    for(const f of Object.values(S.fielders)){f.pose='watch';f.watch={x:0,y:0,z:1.5};}
    tl.add(0,CELEBRATION_DURATION,k=>{
      const t=k*CELEBRATION_DURATION;S.celebrationTime=t;S.celebrants=celebrationPlayers(t,hero);
      if(catcher){const u=Math.min(1,t/2);Object.assign(catcher,{x:catcherStart.x+(5-catcherStart.x)*u,y:catcherStart.y+(-4-catcherStart.y)*u,pose:u<1?'walkField':'watch'});}
    });
    await runTimeline(tl);if(dead)return;
    S.celebrants=[];root.classList.remove('is-celebrating');
  }
  function finish() {
    root.classList.add('is-finished');
    $('.inning-picks').hidden=true;const box=$('.inning-result');box.hidden=false;
    if(batting&&!full&&game.won)clearStage(stage.id);
    const nextStage=batting&&!full&&game.won&&stage.id<STAGES.length-1,s=game.snapshot();
    const icon=path=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
    const replayLabel=full?'다시 경기':'같은 상황 재도전';
    const replay=`<button class="${nextStage?'quiet':'go'}" data-retry>${icon('M4 10a8 8 0 1 1 0 5M4 4v6h6')}<span>${nextStage?'다시 도전':replayLabel}</span></button><button class="quiet" data-new>${icon('M4 12h16m-6-6 6 6-6 6')}<span>${full?'새 경기':'새 상대 도전'}</span></button>`;
    const title=full?(s.tie?'무승부':game.won?'경기 승리!':'경기 패배'):(batting?(game.won?(stage.id===STAGES.length-1&&clearedStages().length===STAGES.length?'세 경기 클리어!':'끝내기 승리!'):(stage.homeScore+game.runs===stage.awayScore?'동점에서 이닝 종료':'뒤집지 못했다')):(game.won?'막아냈다!':'리드를 지키지 못했다'));
    const homeScore=full?s.homeScore:stage.homeScore+game.runs,awayScore=full?s.awayScore:stage.awayScore;
    const meta=full?`${s.inning}회 · ${game.count}구 · ${game.runs}득점`:`${game.count}구 · ${game.runs}${batting?'득점':'실점'} · ${batting?game.outs+'아웃':(game.outs-1)+'아웃을 잡았습니다.'}`;
    // 단판 결과에는 세 경기의 표가 붙는다. 첫 승부를 끝낸 사람이 여기서 다음 구장을 고른다.
    const board=batting&&!full?(()=>{const cleared=clearedStages();return `<div class="stage-select result-stages" role="group" aria-label="승부 선택">${STAGES.map(st=>`<button data-stage="${st.id}" aria-pressed="${st.id===stage.id}" class="${cleared.includes(st.id)?'is-cleared':''}"><b>${cleared.includes(st.id)?'✓':st.id+1} ${st.title}</b><span>${st.situation}</span></button>`).join('')}</div>`;})():'';
    box.innerHTML=`<section class="result-overview">${batting?`<small class="result-stage">${full?'9이닝 경기 · '+stage.title:stage.id+1+' / '+STAGES.length+' · '+stage.title}</small>`:''}<h2>${title}</h2><div class="result-final-score"><span>${stage.home.short}</span><strong>${homeScore} : ${awayScore}</strong><span>${stage.away.short}</span></div><p>${meta}</p></section><div class="result-replay">${nextStage?`<button class="go" data-next>다음 경기 ${icon('M4 12h16m-6-6 6 6-6 6')}</button><div class="result-other-games">${replay}</div>`:replay}</div>${board}`;
    box.querySelectorAll('.result-stages button').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.stage);if(id===stage.id)return start(true);stage=getStage(id);start(false);});
    if(batting&&!full){
      const result=battingResult(game.snapshot(),seed,runEvents);
      box.insertAdjacentHTML('beforeend',`<section class="inning-sharing"><button class="quiet" data-share>${icon('M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8')}<span>결과 공유</span></button><div class="result-share-tools"><button class="quiet" data-copy>${icon('M9 8V4h11v13h-4M4 8h11v13H4z')}<span>링크 복사</span></button><button class="quiet" data-card>${icon('M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4')}<span>카드 저장</span></button></div><p class="inning-share-status" role="status"></p><textarea class="inning-share-fallback" aria-label="복사할 결과와 도전 링크" readonly hidden></textarea></section>`);
      const status=box.querySelector('.inning-share-status'),shareText=result.text+'\n'+result.url;
      const fallback=()=>{const field=box.querySelector('textarea');field.hidden=false;field.value=shareText;field.focus();field.select();status.textContent='아래 결과와 링크를 복사해 주세요.';};
      box.querySelector('[data-copy]').onclick=async()=>{if(await copyChallenge(result.url))status.textContent='같은 상황에 도전하는 링크를 복사했습니다.';else fallback();};
      box.querySelector('[data-share]').onclick=async()=>{
        if(navigator.share){try{await navigator.share({title:'DUGOUT · '+result.title,text:result.text,url:result.url});return;}catch(e){if(e.name==='AbortError')return;}}
        if(await copyChallenge(shareText))status.textContent='결과와 도전 링크를 복사했습니다. 원하는 곳에 붙여넣으세요.';else fallback();
      };
      box.querySelector('[data-card]').onclick=async()=>{try{const blob=await resultCard(result);if(dead)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='dugout-b7-'+result.stageId+'-'+result.seed+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='결과 카드를 저장했습니다. 도전 링크도 함께 보내보세요.';}catch{status.textContent='카드를 만들지 못했습니다. 도전 링크를 복사해 주세요.';}};
    }
    if(nextStage)box.querySelector('[data-next]').onclick=()=>{stage=getStage(stage.id+1);start(false);};
    box.querySelector('[data-retry]').onclick=()=>start(true);box.querySelector('[data-new]').onclick=()=>start(false);box.querySelector('button').focus({preventScroll:true});box.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function close(){if(dead)return;dead=true;holdClock();cancelDecision?.();lv?.skip();lv?.destroy();root.remove();backgrounds.forEach((e,i)=>e.inert=inert[i]);document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);opened=false;origin?.focus();}
  function key(e){if(e.key==='Escape'){e.preventDefault();close();}
    if(batting&&!e.repeat&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'')){
      const k=e.key.toLowerCase();
      const tap=sel=>{const b=root.querySelector(sel);if(b&&!b.disabled&&b.getClientRects().length){e.preventDefault();b.click();}};
      if(k==='t')tap('.inning-time');else if(k==='h')tap('.inning-look');else if(k==='m')tap('.inning-sound');
      else if(!busy){const pick={'1':'[data-group=target] [data-value=any]','2':'[data-group=target] [data-value=FF]','3':'[data-group=target] [data-value=SL]','4':'[data-group=target] [data-value=CH]','0':'[data-group=location] [data-value=any]','arrowleft':'[data-group=location] [data-value=in]','arrowright':'[data-group=location] [data-value=out]','arrowdown':'[data-group=location] [data-value=low]','arrowup':'[data-group=location] [data-value=high]'}[k];if(pick)tap(pick);}
      if(k===' '&&paused&&!busy){e.preventDefault();holdDown=true;lv.S.batLoadAt=performance.now()/1000;callTime(false);}
    }if(e.key==='Tab'){const buttons=[...root.querySelectorAll('button:not(:disabled)')].filter(e=>e.getClientRects().length);const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
  function visibility(){if(dead)return;lv.sfx.mute(document.hidden||lv.speed>2);if(!document.hidden&&lv.sfx.on)lv.sfx.stadium(busy?ambience:'idle',intensity);}
  document.addEventListener('visibilitychange',visibility);
  $('.inning-sound').onclick=()=>{sound=!lv.sfx.on;lv.setSound(sound);visibility();if(sound)lv.sfx.stadium(ambience,intensity);soundLabel();};
  document.addEventListener('keydown',key);$('.inning-exit').onclick=close;
  root.querySelectorAll('[data-group] button').forEach(b=>b.onclick=()=>{if(busy)return;const group=b.parentElement;choice[group.dataset.group]=b.dataset.value;group.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));selection();if(autoTimer)scheduleNext(Math.max(1400,AUTO_DELAY*.6));});
  const play=async(action='swing')=>{
    if(busy||dead||game.done)return;scouting.close();pitcherTag?.close();plan(false);atmosphere('pitch');busy=true;scrollBefore=root.scrollTop;root.classList.add('is-playing');$('.inning-live-zone').hidden=events.length===0;$('.inning-live-zone span').textContent='현재 타석 · '+events.length+'구 기록';lv._size();$('.inning-throw').disabled=true;$('.inning-picks').disabled=true;$('.inning-feedback').textContent='';
    try {
      let e,resumeAt=0;
      if(batting){const pitch=game.preparePitch(choice),picked=await readPitch(pitch);if(dead||!picked?.action)return;resumeAt=picked.time;e=game.decidePitch(picked.action,picked.timing,picked.power);}
      else {const release=await releasePitch();if(dead||release===null)return;e=game.pitch({...choice,release});resumeAt=1.55;calm=false;}
      const tl=new Timeline(),S=lv.S;
      S.pitchStyle={type:e.pitch.t,zone:e.choice.zone,intent:e.choice.intent};
      S.batStyle=batting?{...e.choice,pitchX:e.pitch.x,pitchZ:e.pitch.z}:null;
      e.pitchNumber=events.length+1;
      const rec={batter:e.before.batter.name,bh:'R',th:'R',half:e.before.half||'bottom',inning:e.before.inning??9,zh:1};
      const r=['S','W','B','F'].includes(e.call)?e.call:'X';
      lv.pnp0=e.pitchNumber-1;lv.seq=events.map(e=>e.pitch);
      const arrival=lv._pitch(tl,{...e.pitch,r,swingLead:e.timing?.p!=null?(e.timing.window.from+e.timing.window.to)/2-e.timing.p:0},0,.65,rec,{last:true});
      tl.at(arrival,()=>{zone(r==='X'?{...e,label:'타격'}:e);$('.inning-live-zone').hidden=false;$('.inning-live-zone span').textContent=(Math.abs(e.pitch.x)<=1&&Math.abs(e.pitch.z)<=1?'존 안':'존 밖')+' · '+(r==='X'?'타격':e.label);});
      const react=()=>{
        const positive=e.after.done?e.after.won:batting?['1B','2B','3B','HR','BB'].includes(e.result):['OUT','K'].includes(e.result);
        if(e.after.done||e.terminal)atmosphere(positive?'cheer':'groan',e.after.done?1:e.result==='HR'?.85:e.scored>0?.75:.45);
        else atmosphere(r==='F'?'foul':'idle');
      };
      tl.at(arrival,()=>{if(r==='X')atmosphere('contact');else react();});
      if(r!=='X')tl.at(arrival,()=>{$('.inning-feedback').textContent=e.label;lv._flash(e.label,e.result==='K'?'k':'');});
      if(r==='X') {
        const play=e.fieldPlay,last=play.frames.at(-1),homeRun=play.events.find(x=>x.type==='home-run'),key=play.events.find(x=>['catch','pickup','home-run'].includes(x.type));
        tl.at(arrival,()=>{S.hold=null;S.batter=null;S.broadcast={kind:batting&&homeRun?'bat-flip':'field'};S.fieldPlay={physical:true,phase:'flight',fielder:play.handler};});
        tl.add(arrival,play.duration,k=>{
          const frame=sampleField(play,k*play.duration);S.fieldPlay.time=k*play.duration;S.ball={x:frame.x,y:frame.y,z:frame.z,vis:!homeRun||k*play.duration<=homeRun.t+.8};S.trail=[];
          if(frame.runners)S.runners=frame.runners.filter(r=>r.vis).map(r=>({...r,alpha:1}));
          if(batting&&homeRun){
            const t=k*play.duration,batter=S.runners.find(r=>r.id===e.before.batter.id);
            if(batter&&t<1.2)Object.assign(batter,{pose:t<.32?'admire':'batFlip',phase:t,watch:{x:frame.x,y:frame.y,z:frame.z}});
            const origin=sampleField(play,.32).runners?.find(r=>r.id===e.before.batter.id);
            S.looseBat=t>=.32&&origin?flippedBat(origin,t-.32):null;
          }
          for(const f of frame.fielders)Object.assign(S.fielders[f.pos],{x:f.x,y:f.y});
          lv._trail();
        });
        if(key&&key.type!=='home-run')tl.at(arrival+Math.max(0,key.t-.8),()=>{S.broadcast={kind:'catch',target:[key.x,key.y]};});
        for(const event of play.events)tl.at(arrival+event.t,()=>{
          S.fieldPlay.phase=event.type;S.fieldPlay.fielder=event.fielder||play.handler;
          if(event.fielder)S.fielders[event.fielder].pose=['catch','force-out','tag-out','safe'].includes(event.type)?'caught':event.type==='pickup'?'crouch':'field';
          if(['throw','carry'].includes(event.type))S.broadcast={kind:'base',target:BASE[event.base||1]};
          if(['force-out','tag-out'].includes(event.type))lv._flash('아웃','out');
          if(event.type==='safe')lv._flash('세이프','');
          if(event.type==='home-run'){
            $('.inning-feedback').textContent='홈런';lv._flash('홈런','hr');react();
            for(const f of Object.values(S.fielders)){f.pose='watch';f.watch={x:event.x,y:event.y,z:event.z};}
          }
        });
        if(batting&&homeRun)tl.at(arrival+1.2,()=>{S.broadcast={kind:'field'};});
        if(homeRun)tl.at(arrival+homeRun.t+.9,()=>{S.broadcast={kind:'beauty'};});
        const highlight=e.result==='HR'||e.result==='3B'||(key?.type==='catch'&&Math.hypot(key.x||0,key.y||0)>55);
        tl.at(arrival+play.duration,()=>{
          S.trail=[];zone(e);if(!homeRun)react();
          S.ball=e.result==='HR'?null:{x:last.x,y:last.y,z:last.z,vis:true};
        });
        if(!homeRun)tl.at(arrival+play.duration+(play.running?.contest ? .8 : 0),()=>lv._flash(e.label,e.result==='OUT'?'out':e.result==='HR'?'hr':''));
        if(highlight)tl.at(arrival+play.duration+.35,()=>{lv.three?.showBoardReplay(play,e.label);S.broadcast={kind:'scoreboard'};});
        tl.add(arrival+play.duration,highlight?3.2:1.4,null);
      }

      if(e.movements.length&&!e.fieldPlay) {
        const runStart=arrival+(r==='X'?.33:.7);
        for(const m of e.movements){let runner=m.from===0?lv._runner(e.before.batter.name,0):S.runners.find(x=>x.base===m.from);if(!runner)continue;if(m.from===0){S.runners.push(runner);tl.at(runStart,()=>{S.batter=null;});}
          const path=Array.from({length:m.to-m.from+1},(_,i)=>BASE[m.from+i]);
          const duration=path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-path[i][0],p[1]-path[i][1]),0)/7;
          tl.add(runStart,duration,k=>{const a=Math.min(path.length-2,Math.floor(k*(path.length-1))),u=k===1?1:k*(path.length-1)-a;runner.x=path[a][0]+(path[a+1][0]-path[a][0])*u;runner.y=path[a][1]+(path[a+1][1]-path[a][1])*u;});
        }
      }
      tl.add(tl.end,1.5,null);
      if(resumeAt)tl.step(resumeAt);
      await runTimeline(tl);
      if(dead)return;
      events.push(e);runEvents.push(e);shown=e;
      if(full&&e.halfEnded){await thirdOutScene(e);if(dead)return;if(!game.done){game.advanceHalf();const nextGame=game;close();openInningMode('full',seed,0,nextGame);return;}}
      else if(batting&&e.after.won){await celebrate(e);if(dead)return;}
      else if(e.terminal){await changeBatter(e);if(dead)return;}
      if(e.terminal&&!game.done){events=[];shown=null;}
      zone(shown);history();
      if(['1B','2B','3B','HR'].includes(e.result))lv.line.hits[e.before.half||'bottom']++;
      sync(e.after);lv.S.broadcast={kind:game.done?'beauty':'between'};
      $('.inning-feedback').innerHTML=`<div class="inning-verdict"><strong>${e.label}</strong><span>${PITCHES[e.pitch.t].name} · ${e.pitch.v} km/h${e.control?' · '+e.control.label:''}${e.timing?` · <em class="inning-timing is-${e.timing.kind}">${e.timing.label}</em> · ${e.timing.power>=.66?'장타 스윙':e.timing.power<=.33?'컨택 스윙':'중간 스윙'}`:''}</span></div>${e.adjusted?`<p class="inning-adjust">투수가 배합을 바꿨습니다.</p>`:''}`;paint();if(game.done)finish();
    } catch(error){if(!dead){root.classList.add('is-finished');$('.inning-feedback').textContent='화면을 다시 준비합니다. 같은 상황에서 재시작하세요.';$('.inning-result').hidden=false;$('.inning-result').innerHTML='<button class="go">같은 상황 다시 시작</button>';$('.inning-result button').onclick=()=>start(true);}console.error(error);}
    finally{busy=false;root.classList.remove('is-playing');if(!dead){lv._size();if(game.done)requestAnimationFrame(()=>{if(!dead)$('.inning-result').scrollIntoView({block:'nearest'});});else root.scrollTop=scrollBefore;}if(!dead&&!game.done){$('.inning-throw').disabled=false;if(!batting){$('.inning-throw').textContent='투구 시작';$('.pitch-breathe').disabled=calm;$('.pitch-breathe').textContent=calm?'호흡 안정':'숨 고르기';}dock();$('.inning-picks').disabled=false;if(batting){lv.S.fpSwingAt=null;scheduleNext();}else $('.inning-throw').focus({preventScroll:true});}}
  };
  $('.inning-throw').onclick=()=>{
    if(!batting)return releaseNow?releaseNow():play();
    if(busy||game.done)return;
    callTime(!paused);
  };
  // 타임 중 배트를 당기면(누르면) 타석에 선다. 누른 채로 있으면 그 당김이 투구까지 이어진다.
  if(batting){
    const resumeByLoad=e=>{if(!paused||busy||game.done)return;if(e.type==='pointerdown'&&e.button!==0)return;holdDown=true;lv.S.batLoadAt=performance.now()/1000;callTime(false);};
    $('.batting-hold').addEventListener('pointerdown',resumeByLoad);lv.three?.canvas?.addEventListener('pointerdown',resumeByLoad);
    document.addEventListener('pointerup',()=>{holdDown=false;},true);document.addEventListener('pointercancel',()=>{holdDown=false;},true);
    document.addEventListener('keyup',e=>{if(e.key===' ')holdDown=false;},true);
  }
  document.addEventListener('visibilitychange',()=>{if(dead)return;if(document.hidden)holdClock();else if(batting&&!busy&&!game.done)scheduleNext();},{signal:undefined});

  start(true);
}
