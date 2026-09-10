import { STAGES, getStage, clearStage, clearedStages } from './inning-stages.js';
import { mountPitcherTag, positionPlayerTag } from './pitcher-tag.js';
import { leadPosition } from './runner-motion.js';
import { mountScouting } from './scouting-ui.js';
import { paceLabel } from './player-traits.js';
import { sampleField, FIELD_POSITIONS } from './field-sim.js';
import { pitchPressure, releaseMarker } from './pitch-control.js';
import { InningGame, PITCHES } from './inning-game.js';
import { BattingGame } from './batting-game.js';
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
export function openInningMode(role='pitcher',initialSeed=null,initialStage=0) {
  const batting=role==='batter';
  let stage=getStage(batting?initialStage:0);
  if(opened)return;opened=true;
  const origin=document.activeElement,previousOverflow=document.body.style.overflow;
  const backgrounds=[document.querySelector('#boot'),document.querySelector('#app')].filter(Boolean),inert=backgrounds.map(e=>e.inert);
  backgrounds.forEach(e=>e.inert=true);document.body.style.overflow='hidden';
  const root=document.createElement('section');root.className='inning-mode';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',stage.title+' · '+stage.situation);
  root.innerHTML=`<div class="inning-shell"><header class="inning-head"><button class="inning-sound" aria-label="소리 켜기" aria-pressed="false"></button><button class="inning-exit" aria-label="나가기" title="나가기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
  <div class="inning-presentation"><div class="inning-score"></div><div class="inning-live"></div>
  <div class="inning-batter-entry" role="status" hidden></div><div class="inning-live-zone" hidden></div><div class="inning-feedback" role="status" aria-live="polite"></div>
  <div class="inning-history sr-only" aria-label="현재 타석 투구 기록"></div></div>
  <div class="inning-controls" id="inningPlan"><div class="inning-opponent"></div>
  ${batting?`<fieldset class="inning-picks"><legend class="sr-only">노릴 공과 타격 방식</legend>
  <div class="inning-label">예상 코스</div><div class="inning-options" data-group="location"><button data-value="any" aria-pressed="true">전체</button><button data-value="in" aria-pressed="false">몸쪽</button><button data-value="out" aria-pressed="false">바깥쪽</button><button data-value="low" aria-pressed="false">낮게</button><button data-value="high" aria-pressed="false">높게</button></div><div class="inning-zone-slot"></div><div class="inning-label">노릴 구종</div><div class="inning-options" data-group="target"><button data-value="any" aria-pressed="true">모든 공</button>${Object.entries(PITCHES).map(([k,p])=>`<button data-value="${k}" aria-pressed="false">${pitchIcon(k)}${p.name}</button>`).join('')}</div>
  <div class="inning-label">타격 방식</div><div class="inning-options" data-group="approach"><button data-value="contact" aria-pressed="true">컨택</button><button data-value="power" aria-pressed="false">장타</button></div>

  </fieldset>`:`<fieldset class="inning-picks"><legend class="sr-only">다음 투구 선택</legend>
  <div class="inning-label">구종</div><div class="inning-options" data-group="type">${Object.entries(PITCHES).map(([k,p])=>`<button data-value="${k}" aria-pressed="${k==='FF'}">${pitchIcon(k)}${p.name}<small>${p.speed} km/h</small></button>`).join('')}</div>
  <div class="inning-zone-slot"></div>
  <div class="inning-label">승부 방식</div><div class="inning-options" data-group="intent"><button data-value="attack" aria-pressed="true">존 안 승부</button><button data-value="chase" aria-pressed="false">유인구</button></div>
  <button class="go inning-throw">이 공 던지기</button></fieldset>`}
  <div class="inning-result" hidden></div></div></div>`;
  document.body.append(root);
  if(batting){root.classList.add('has-batting-dock');root.insertAdjacentHTML('beforeend','<div class="batting-decision"><div class="batting-decision-title"><strong class="sr-only">기본 행동</strong><span class="batting-time" aria-hidden="true">2.5초 변경</span></div><div class="batting-clock" aria-hidden="true"><i></i></div><div class="batting-action-row"><button class="batting-swing" aria-pressed="true">스윙</button><button class="batting-take" aria-pressed="false">지켜보기</button></div><button class="go inning-throw">준비 완료</button></div>');}
  const $=s=>root.querySelector(s);
  const scouting=mountScouting(root,batting);
  let entryKey=null;
  const entryLabel=$('.inning-batter-entry');
  const showEntry=(key,name,trait)=>{entryKey=key;entryLabel.innerHTML=`<b>${name}</b><span>${trait}</span>`;};
  const hideEntry=()=>{entryKey=null;entryLabel.hidden=true;};
  const batterEntry=(key,b)=>showEntry(key,b.name,`${b.style} · ${paceLabel(b.speed)}`);
  const pitcherTag=batting?mountPitcherTag(root,$('.inning-opponent'),()=>scouting.close()):null;
  if(batting)root.insertAdjacentHTML('beforeend','<div class="inning-compact-plan" aria-label="선택한 타격 작전" hidden></div>');
  root.insertAdjacentHTML('beforeend','<button class="inning-plan-toggle" aria-controls="inningPlan" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"/></svg><span>'+ (batting?'노릴 공':'투구 선택')+'</span></button>');
  if(!batting){const action=document.createElement('div');action.className='pitching-action';action.append($('.inning-throw'));action.insertAdjacentHTML('afterbegin','<button class="pitch-breathe">숨 고르기</button><div class="pitch-release" hidden><div class="pitch-release-label">릴리스 <span></span></div><div class="pitch-meter"><i class="pitch-perfect"></i><i class="pitch-needle"></i></div></div>');root.append(action);}
  if(batting){
    $('.inning-presentation').append($('.inning-opponent'));
    const board=document.createElement('div'),tools=document.createElement('div');board.className='batting-plan-grid';tools.className='batting-plan-tools';
    board.append($('[data-group=location]'));tools.append($('[data-group=target]'),$('[data-group=approach]'));board.append(tools);$('.inning-picks').append(board);
    $('[data-group=target] [data-value=any]').innerHTML=choiceIcon('any')+'<span>모든 공</span>';
    for(const button of root.querySelectorAll('[data-group=approach] button'))button.innerHTML=choiceIcon(button.dataset.value)+'<span>'+button.textContent+'</span>';
    for(const action of ['swing','take']){const b=$('.batting-'+action);b.innerHTML=choiceIcon(action)+'<span>'+b.textContent+'</span>';}
    $('.batting-action-row').setAttribute('role','group');$('.batting-action-row').setAttribute('aria-label','기본 행동');
    $('[data-group=location] [data-value=out]').textContent='바깥';
    $('[data-group=location] [data-value=out]').setAttribute('aria-label','바깥쪽 예상');
    $('[data-group=location] [data-value=any]').setAttribute('aria-label','전체 코스 대응');

    for(const [group,label] of [['location','예상 코스'],['target','노릴 구종'],['approach','타격 방식']])$('[data-group='+group+']').setAttribute('aria-label',label);
    root.insertAdjacentHTML('beforeend','<button class="inning-look" aria-label="홈플레이트 보기 / 정면으로" title="홈플레이트 보기 / 정면으로"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12v7l-6 5-6-5zM4 3h16"/></svg></button>');
    $('.inning-look').onclick=()=>lv?.three?.lookAtPlate();
  }
  const plan=open=>{root.classList.toggle('is-planning',open);$('.inning-plan-toggle').setAttribute('aria-expanded',String(open));};
  $('.inning-plan-toggle').onclick=()=>{if(!busy)plan(!root.classList.contains('is-planning'));};
  const zoneSvg=`<svg viewBox="0 0 200 200" aria-hidden="true"><path d="M80 184h40v7l-20 8-20-8z" fill="#a5b9b6"/><rect x="62" y="56" width="76" height="80" rx="2" fill="#29444d" stroke="#e1e9d9" stroke-width="2"/><path d="M87.3 56v80M112.7 56v80M62 82.7h76M62 109.3h76" stroke="#819b9f" stroke-dasharray="3 3" opacity=".6"/><g class="zone-markers"></g></svg>`;
  $('.inning-zone-slot').innerHTML=`<div class="inning-zone-row"><div class="inning-zone-map" ${batting?'':'data-group="zone"'}>${zoneSvg}${batting?'':'<button data-value="in" aria-pressed="false" class="zone-target zone-in">몸쪽</button><button data-value="out" aria-pressed="true" class="zone-target zone-out">바깥쪽</button><button data-value="low" aria-pressed="false" class="zone-target zone-low">낮게</button><button data-value="high" aria-pressed="false" class="zone-target zone-high">높게</button>'}</div></div>`;
  $('.inning-live-zone').innerHTML=zoneSvg+'<span class="sr-only">투구 위치</span>';$('.inning-live-zone').hidden=false;

  let seed=Number.isInteger(initialSeed)&&initialSeed>=0&&initialSeed<=0xffffffff?initialSeed:crypto.getRandomValues(new Uint32Array(1))[0],game,lv,busy=false,dead=false,events=[],runEvents=[],shown=null,scrollBefore=0,choice=batting?{target:'any',approach:'contact',location:'any',action:'swing'}:{type:'FF',zone:'out',intent:'attack'};
  let sound=true;try{sound=localStorage.getItem('dugout.sfx')!=='0';}catch{}
  let ambience='idle',intensity=.5,cancelDecision=null,chooseDecision=null,releaseNow=null,calm=false;
  if(!batting)$('.pitch-breathe').onclick=()=>breathe();
  function dock(phase='ready'){
    if(!batting)return;const plan=choice.action==='take'?'지켜보기':'스윙';
    $('.batting-decision').hidden=false;
    $('.batting-decision-title strong').textContent=phase==='ready'?'기본 행동':phase==='read'?plan+' 예정 · 바꿀 수 있어요':plan+' 예정';
    $('.batting-time').textContent=phase==='read'?'2.5초':phase==='ready'?'2.5초 변경':'투구 중';
    $('.batting-clock i').style.transform='scaleX(1)';
    for(const action of ['swing','take']){const button=$('.batting-'+action);button.disabled=phase==='warm';button.setAttribute('aria-pressed',String(choice.action===action));}
    $('.inning-throw').disabled=phase!=='ready';$('.inning-throw').textContent=phase==='ready'?'준비 완료':phase==='read'?plan+' 유지':'…';
  }
  const runTimeline=tl=>new Promise(resolve=>{lv.tl=tl;lv.resolve=resolve;});
  async function breathe(){
    if(busy||calm||dead||game.done)return;
    busy=true;plan(false);$('.inning-picks').disabled=true;$('.inning-throw').disabled=true;
    const button=$('.pitch-breathe');button.disabled=true;button.textContent='후—';root.classList.add('is-breathing');
    const tl=new Timeline();tl.add(0,1.8,k=>button.style.setProperty('--breath',String(1-k)));
    await runTimeline(tl);if(dead)return;
    calm=true;busy=false;root.classList.remove('is-breathing');button.textContent='호흡 안정';
    $('.inning-picks').disabled=false;$('.inning-throw').disabled=false;
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
    const plannedAction=choice.action;
    const compact=$('.inning-compact-plan');compact.textContent=[choice.target==='any'?'모든 공':PITCHES[choice.target].name,({any:'전체 코스',in:'몸쪽',out:'바깥쪽',low:'낮게',high:'높게'})[choice.location],choice.approach==='power'?'장타':'컨택'].join(' · ');compact.hidden=false;
    root.classList.add('is-reading');dock('warm');
    const preview=new Timeline(),rec={batter:game.batter.name,bh:'R',th:'R',half:'bottom',inning:9,zh:1};
    const arrival=lv._pitch(preview,{...pitch,r:'B'},0,.65,rec,{last:true});
    const release=1.55,flight=arrival-release,from=release+flight*.25,to=release+flight*.55;
    const warm=new Timeline();warm.end=from;warm.step=t=>{warm.t=Math.min(t,from);preview.step(warm.t);};
    await runTimeline(warm);if(dead)return null;
    lv.S.battingDecision=true;root.classList.add('is-deciding');dock('read');
    $('.inning-feedback').textContent='';
    const picked=await new Promise(resolve=>{
      const end=performance.now()+2500;let raf,timer,settled=false;
      const finish=(action,expired=false)=>{if(settled)return;settled=true;cancelAnimationFrame(raf);clearTimeout(timer);cancelDecision=null;chooseDecision=null;$('.batting-decision').hidden=true;root.classList.remove('is-deciding','is-reading');compact.hidden=true;lv.S.battingDecision=false;resolve({action,expired,time:preview.t});};
      cancelDecision=()=>finish(null);
      const choose=action=>finish(performance.now()>=end?plannedAction:action,performance.now()>=end);
      chooseDecision=choose;
      const tick=()=>{const left=Math.max(0,end-performance.now());preview.step(from+(to-from)*(1-left/2500));$('.batting-time').textContent=(left/1000).toFixed(1)+'초';$('.batting-clock i').style.transform='scaleX('+left/2500+')';if(!left)finish(plannedAction,true);else raf=requestAnimationFrame(tick);};
      timer=setTimeout(()=>finish(plannedAction,true),2500);tick();$('.batting-'+plannedAction).focus({preventScroll:true});
    });
    return picked;
  }
  function soundLabel(){const on=!!lv?.sfx.on,b=$('.inning-sound');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="'+(on?'M16 8q5 4 0 8M19 5q7 7 0 14':'m17 9 5 6m0-6-5 6')+'"/></svg>';b.setAttribute('aria-label',on?'소리 끄기':'소리 켜기');b.title=on?'소리 끄기':'소리 켜기';b.setAttribute('aria-pressed',String(on));}
  function atmosphere(cue,k=.5){ambience=cue;intensity=k;lv.sfx.stadium(cue,k);lv.S.crowdReaction={cue,strength:k,at:performance.now()};}
  const opt={home:stage.home.name,away:stage.away.name,park:stage.park,crowd:Math.round(stage.park.capacity*.9),cap:stage.park.capacity,colors:stage.colors,view:'three',speed:1,sound:false,playerRole:role,entryPlayerKey:()=>entryKey,onEntryAnchor:p=>positionPlayerTag(entryLabel,p),onPitcherAnchor:p=>pitcherTag?.update(!busy&&!dead&&!game.done?p:null),canLook:()=>!busy&&!dead&&!game.done,stageHeight:()=>innerHeight,immersive:()=>!dead,maxH:()=>innerHeight};
  function sync(state) {
    for(const f of Object.values(lv.S.fielders))if(f.home){f.x=f.home[0];f.y=f.home[1];delete f.pose;}
    lv.S.fieldPlay=null;
    lv.S.b=state.balls;lv.S.s=state.strikes;lv.S.outs=state.outs;lv.S.ball=null;lv.S.hold=null;lv.S.trail=[];lv.S.pitcherWind=0;lv.S.swing=0;
    lv.S.batter={name:state.batter.name,hand:'R',alpha:1};
    lv.S.runners=state.bases.flatMap((yes,i)=>{if(!yes)return [];const person=state.baseRunners?.[i]||{name:'주자 '+(i+1)};return [{...lv._runner(person.name,i+1),...leadPosition(i+1,person),id:person.id,speed:person.speed}];});
    lv.line.bottom=[0,0,0,0,0,0,0,0,stage.homeScore+state.runs];
  }
  function paint() {
    const s=game.snapshot();
    scouting.paint(s);
    const dots=(count,max,kind)=>Array.from({length:max},(_,i)=>`<i class="${kind}${i<count?' lit':''}"></i>`).join('');
    const bases=s.bases.map((v,i)=>v?(i+1)+'루':'').filter(Boolean).join(' · ')||'주자 없음';
    $('.inning-score').innerHTML=`<div class="inning-scoreline"><div class="inning-scoreteams"><div class="${batting?'':'own-team'}" aria-label="${stage.away.name}${batting?'':' · 나의 팀'}"><span>${stage.away.name}</span><strong>${stage.awayScore}</strong></div><div class="${batting?'own-team':''}" aria-label="${stage.home.name}${batting?' · 나의 팀':''}"><span>${stage.home.name}</span><strong>${stage.homeScore+s.runs}</strong></div></div><span class="inning-frame" aria-label="9회 말">${batting?`<small>${stage.id+1}/${STAGES.length}</small>`:''}9 ▾</span></div>
      <div class="inning-counts"><span aria-label="${s.balls}볼 ${s.strikes}스트라이크 ${s.outs}아웃"><span>B ${dots(s.balls,3,'ball')}</span><span>S ${dots(s.strikes,2,'strike')}</span><span>O ${dots(s.outs,3,'out')}</span></span><button class="inning-diamond" aria-label="${bases} · 주자 정보" title="주자 정보">${s.bases.map((v,i)=>`<i class="base${i+1}${v?' occupied':''}" title="${i+1}루${v?' · '+paceLabel(s.baseRunners[i].speed):''}" data-pace="${v&&s.baseRunners[i].speed>=8.8?'fast':v&&s.baseRunners[i].speed<7.8?'slow':'normal'}"></i>`).join('')}</button><small>${s.count}구</small></div>`;
    $('.inning-diamond').onclick=()=>$('.scout-toggle').click();
    if(batting)pitcherTag.paint(s.pitcher);else $('.inning-opponent').innerHTML=`<b>${s.batter.name}</b><span>${s.batter.style}</span>`;
  }
  function zone(event=null) {
    const selected=busy&&event?event.choice:choice;
    const aimX=batting?0:(selected.zone==='in'?-1:selected.zone==='out'?1:0)*(selected.intent==='chase'?1.4:.8);
    const aimZ=batting?0:selected.zone==='low'?(selected.intent==='chase'?-1.4:-.8):selected.zone==='high'?(selected.intent==='chase'?1.4:.8):0;
    const area={in:[62,56,38,80],out:[100,56,38,80],low:[62,109,76,27],high:[62,56,76,27]}[selected.location];
    const target=batting?(area?`<rect class="zone-prediction" x="${area[0]}" y="${area[1]}" width="${area[2]}" height="${area[3]}" fill="#a6d9b9" fill-opacity=".22" stroke="#a6d9b9" stroke-width="2" stroke-dasharray="4 3"/>`:''):`<circle cx="${100+aimX*38}" cy="${96-aimZ*40}" r="12" fill="none" stroke="#a6d9b9" stroke-width="2" stroke-dasharray="4 3"/>`;
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
    root.querySelectorAll('.zone-markers').forEach(g=>g.innerHTML=target+leaders.join('')+marks);
  }
  function selection() { zone(shown); }

  function history() {
    $('.inning-history').innerHTML=events.length?'<span>현재 타석 · 최근 투구</span>'+events.slice(-5).map(e=>`<span class="inning-pitch-chip"><small>${e.pitchNumber}구 · ${PITCHES[e.pitch.t].name}</small><b>${e.label}</b></span>`).join(''):'<span>현재 타자 · 첫 공을 고르세요.</span>';
  }
  function start(same=false) {
    if(lv){lv.skip();lv.destroy();}
    if(!same)seed=crypto.getRandomValues(new Uint32Array(1))[0];game=batting?new BattingGame(seed,stage.id):new InningGame(seed);busy=false;events=[];runEvents=[];shown=null;root.classList.remove('is-playing','is-finished');plan(false);
    Object.assign(opt,{home:stage.home.name,away:stage.away.name,park:stage.park,colors:stage.colors,cap:stage.park.capacity,crowd:Math.round(stage.park.capacity*.9)});
    root.setAttribute('aria-label',stage.title+' · '+stage.situation);
    lv=new LiveView($('.inning-live'),opt);lv.sfx.stadiumOnly=true;lv.setSound(sound);lv.sfx.mute(document.hidden);ambience='idle';atmosphere('idle');soundLabel();
    lv.S.inning=9;lv.S.half='bottom';lv.line.top=[0,0,0,0,0,0,0,0,stage.awayScore];
    const positions=FIELD_POSITIONS;
    for(const [pos,[x,y]] of Object.entries(positions))lv.S.fielders[pos]={pos,name:pos==='P'?(batting?game.pitcher.name:'나의 마무리'):game.defense[pos].name,x,y,home:[x,y],alpha:1};
    sync(game.snapshot());lv.S.broadcast={kind:'pitch'};
    $('.inning-throw').disabled=false;$('.inning-picks').disabled=false;$('.inning-picks').hidden=false;$('.inning-result').hidden=true;
    $('.inning-feedback').textContent='';if(!batting){calm=false;$('.pitch-breathe').disabled=false;$('.pitch-breathe').textContent='숨 고르기';$('.inning-throw').textContent='투구 시작';}paint();selection();history();dock();root.scrollTop=0;$('.inning-throw').focus({preventScroll:true});intro();
  }
  async function intro(){
    busy=true;root.classList.add('is-intro');$('.inning-picks').disabled=true;$('.inning-throw').disabled=true;
    if(batting){$('.batting-swing').disabled=true;$('.batting-take').disabled=true;}else $('.pitch-breathe').disabled=true;
    const loadingView=lv;
    if (!(await loadingView.ready) || dead || lv!==loadingView) return;
    const S=lv.S,tl=new Timeline(),pitcher=S.fielders.P;S.batter=null;pitcher.x=5;pitcher.y=14;pitcher.pose='walkField';S.broadcast={kind:'entry'};
    showEntry('fP',pitcher.name,batting?`${game.pitcher.style} · 직구 ${Math.round(game.pitcher.fast*100)}%`:'직구 · 슬라이더 · 체인지업');
    tl.add(0,3,k=>{pitcher.x=5*(1-k);pitcher.y=14+4.44*k;});
    tl.at(3,()=>{lv.sfx.setChant(game.batter.name,game.order+1);pitcher.pose='pitch';S.broadcast={kind:'change'};batterEntry('change0',game.batter);});
    const batter={name:game.batter.name,x:-6.5,y:-4,pose:'walk',wait:true};S.changePlayers=[batter];
    tl.at(3,()=>{batter.wait=false;});tl.add(3,2.8,k=>{batter.x=-6.5+5.65*k;batter.y=-4+4.1*k;});
    tl.at(5.8,()=>{batter.pose='bat';});tl.add(5.8,.5,null);
    await runTimeline(tl);if(dead)return;
    S.changePlayers=[];sync(game.snapshot());S.broadcast={kind:'pitch'};hideEntry();root.classList.remove('is-intro');busy=false;$('.inning-picks').disabled=false;$('.inning-throw').disabled=false;
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
  function finish() {
    root.classList.add('is-finished');
    $('.inning-picks').hidden=true;const box=$('.inning-result');box.hidden=false;
    if(batting&&game.won)clearStage(stage.id);
    const nextStage=batting&&game.won&&stage.id<STAGES.length-1;
    const icon=path=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
    const replay=`<button class="${nextStage?'quiet':'go'}" data-retry>${icon('M4 10a8 8 0 1 1 0 5M4 4v6h6')}<span>${nextStage?'다시 도전':'같은 상황 재도전'}</span></button><button class="quiet" data-new>${icon('M4 12h16m-6-6 6 6-6 6')}<span>${nextStage?'새 상대':'새 상대 도전'}</span></button>`;
    box.innerHTML=`<section class="result-overview">${batting?`<small class="result-stage">${stage.id+1} / ${STAGES.length} · ${stage.title}</small>`:''}<h2>${batting?(game.won?(stage.id===STAGES.length-1&&clearedStages().length===STAGES.length?'세 경기 클리어!':'끝내기 승리!'):(stage.homeScore+game.runs===stage.awayScore?'동점에서 이닝 종료':'뒤집지 못했다')):(game.won?'막아냈다!':'리드를 지키지 못했다')}</h2><div class="result-final-score"><span>${stage.home.short}</span><strong>${stage.homeScore+game.runs} : ${stage.awayScore}</strong><span>${stage.away.short}</span></div><p>${game.count}구 · ${game.runs}${batting?'득점':'실점'} · ${batting?game.outs+'아웃':(game.outs-1)+'아웃을 잡았습니다.'}</p></section><div class="result-replay">${nextStage?`<button class="go" data-next>다음 경기 ${icon('M4 12h16m-6-6 6 6-6 6')}</button><div class="result-other-games">${replay}</div>`:replay}</div>`;
    if(batting){
      const result=battingResult(game.snapshot(),seed,runEvents);
      box.insertAdjacentHTML('beforeend',`<section class="inning-sharing"><button class="quiet" data-share>${icon('M12 15V3m-4 4 4-4 4 4M5 12v8h14v-8')}<span>결과 공유</span></button><div class="result-share-tools"><button class="quiet" data-copy>${icon('M9 8V4h11v13h-4M4 8h11v13H4z')}<span>링크 복사</span></button><button class="quiet" data-card>${icon('M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4')}<span>카드 저장</span></button></div><p class="inning-share-status" role="status"></p><textarea class="inning-share-fallback" aria-label="복사할 결과와 도전 링크" readonly hidden></textarea></section>`);
      const status=box.querySelector('.inning-share-status'),full=result.text+'\n'+result.url;
      const fallback=()=>{const field=box.querySelector('textarea');field.hidden=false;field.value=full;field.focus();field.select();status.textContent='아래 결과와 링크를 복사해 주세요.';};
      box.querySelector('[data-copy]').onclick=async()=>{if(await copyChallenge(result.url))status.textContent='같은 상황에 도전하는 링크를 복사했습니다.';else fallback();};
      box.querySelector('[data-share]').onclick=async()=>{
        if(navigator.share){try{await navigator.share({title:'DUGOUT · '+result.title,text:result.text,url:result.url});return;}catch(e){if(e.name==='AbortError')return;}}
        if(await copyChallenge(full))status.textContent='결과와 도전 링크를 복사했습니다. 원하는 곳에 붙여넣으세요.';else fallback();
      };
      box.querySelector('[data-card]').onclick=async()=>{try{const blob=await resultCard(result);if(dead)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='dugout-b6-'+result.stageId+'-'+result.seed+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='결과 카드를 저장했습니다. 도전 링크도 함께 보내보세요.';}catch{status.textContent='카드를 만들지 못했습니다. 도전 링크를 복사해 주세요.';}};
    }
    if(nextStage)box.querySelector('[data-next]').onclick=()=>{stage=getStage(stage.id+1);start(false);};
    box.querySelector('[data-retry]').onclick=()=>start(true);box.querySelector('[data-new]').onclick=()=>start(false);box.querySelector('button').focus({preventScroll:true});box.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function close(){if(dead)return;dead=true;cancelDecision?.();lv?.skip();lv?.destroy();root.remove();backgrounds.forEach((e,i)=>e.inert=inert[i]);document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);opened=false;origin?.focus();}
  function key(e){if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const buttons=[...root.querySelectorAll('button:not(:disabled)')].filter(e=>e.getClientRects().length);const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
  function visibility(){if(dead)return;lv.sfx.mute(document.hidden||lv.speed>2);if(!document.hidden&&lv.sfx.on)lv.sfx.stadium(busy?ambience:'idle',intensity);}
  document.addEventListener('visibilitychange',visibility);
  $('.inning-sound').onclick=()=>{sound=!lv.sfx.on;lv.setSound(sound);visibility();if(sound)lv.sfx.stadium(ambience,intensity);soundLabel();};
  document.addEventListener('keydown',key);$('.inning-exit').onclick=close;
  root.querySelectorAll('[data-group] button').forEach(b=>b.onclick=()=>{if(busy)return;const group=b.parentElement;choice[group.dataset.group]=b.dataset.value;group.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));selection();});
  const play=async(action='swing')=>{
    if(busy||dead||game.done)return;scouting.close();pitcherTag?.close();plan(false);atmosphere('pitch');busy=true;scrollBefore=root.scrollTop;root.classList.add('is-playing');$('.inning-live-zone').hidden=events.length===0;$('.inning-live-zone span').textContent='현재 타석 · '+events.length+'구 기록';lv._size();$('.inning-throw').disabled=true;$('.inning-picks').disabled=true;$('.inning-feedback').textContent='';
    try {
      let e,resumeAt=0;
      if(batting){const pitch=game.preparePitch(choice),picked=await readPitch(pitch);if(dead||!picked?.action)return;resumeAt=picked.time;e=game.decidePitch(picked.action);if(picked.expired)e.explanation='선택해 둔 '+(picked.action==='swing'?'스윙을':'지켜보기를')+' 그대로 실행했습니다. '+e.explanation;}
      else {const release=await releasePitch();if(dead||release===null)return;e=game.pitch({...choice,release});resumeAt=1.55;calm=false;}
      const tl=new Timeline(),S=lv.S;
      e.pitchNumber=events.length+1;
      const rec={batter:e.before.batter.name,bh:'R',th:'R',half:'bottom',inning:9,zh:1};
      const r=['S','W','B','F'].includes(e.call)?e.call:'X';
      lv.pnp0=e.pitchNumber-1;lv.seq=events.map(e=>e.pitch);
      const arrival=lv._pitch(tl,{...e.pitch,r},0,.65,rec,{last:true});
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
        tl.at(arrival,()=>{S.hold=null;S.batter=null;S.broadcast={kind:'field'};S.fieldPlay={physical:true,phase:'flight',fielder:play.handler};});
        tl.add(arrival,play.duration,k=>{
          const frame=sampleField(play,k*play.duration);S.fieldPlay.time=k*play.duration;S.ball={x:frame.x,y:frame.y,z:frame.z,vis:!homeRun||k*play.duration<=homeRun.t+.8};S.trail=[];
          if(frame.runners)S.runners=frame.runners.filter(r=>r.vis).map(r=>({...r,alpha:1}));
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
        if(homeRun)tl.at(arrival+homeRun.t+.9,()=>{S.broadcast={kind:'beauty'};});
        tl.at(arrival+play.duration,()=>{
          S.trail=[];zone(e);if(!homeRun)react();
          S.ball=e.result==='HR'?null:{x:last.x,y:last.y,z:last.z,vis:true};
        });
        if(!homeRun)tl.at(arrival+play.duration+(play.running?.contest ? .8 : 0),()=>lv._flash(e.label,e.result==='OUT'?'out':e.result==='HR'?'hr':''));
        tl.add(arrival+play.duration,1.4,null);
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
      if(e.terminal){await changeBatter(e);if(dead)return;}
      if(e.terminal&&!game.done){events=[];shown=null;}
      zone(shown);history();
      if(['1B','2B','3B','HR'].includes(e.result))lv.line.hits.bottom++;
      sync(e.after);lv.S.broadcast={kind:game.done?'beauty':'between'};
      $('.inning-feedback').innerHTML=`<div class="inning-verdict"><strong>${e.label}</strong><span>${PITCHES[e.pitch.t].name} · ${e.pitch.v} km/h${e.control?' · '+e.control.label:''}</span></div>`;paint();if(game.done)finish();
    } catch(error){if(!dead){root.classList.add('is-finished');$('.inning-feedback').textContent='화면을 다시 준비합니다. 같은 상황에서 재시작하세요.';$('.inning-result').hidden=false;$('.inning-result').innerHTML='<button class="go">같은 상황 다시 시작</button>';$('.inning-result button').onclick=()=>start(true);}console.error(error);}
    finally{busy=false;root.classList.remove('is-playing');if(!dead){lv._size();if(game.done)requestAnimationFrame(()=>{if(!dead)$('.inning-result').scrollIntoView({block:'nearest'});});else root.scrollTop=scrollBefore;}if(!dead&&!game.done){$('.inning-throw').disabled=false;if(!batting){$('.inning-throw').textContent='투구 시작';$('.pitch-breathe').disabled=calm;$('.pitch-breathe').textContent=calm?'호흡 안정':'숨 고르기';}dock();$('.inning-picks').disabled=false;$('.inning-throw').focus({preventScroll:true});}}
  };
  $('.inning-throw').onclick=()=>releaseNow?releaseNow():play();
  if(batting)for(const action of ['swing','take'])$('.batting-'+action).onclick=()=>{if(chooseDecision)chooseDecision(action);else if(!busy&&!game.done){choice.action=action;dock();}};

  start(true);
}
