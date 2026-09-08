import { InningGame, PITCHES } from './inning-game.js';
import { BattingGame } from './batting-game.js';
import { LiveView, Timeline } from './live.js';
import { battingResult, resultCard, copyChallenge } from './inning-share.js';
import { layoutPitchMarkers } from './pitch-zone.js';
const BASE=[[0,0],[19.4,19.4],[0,38.8],[-19.4,19.4],[0,0]];
const pitchIcon=type=>`<svg class="inning-pitch-icon" viewBox="0 0 24 28" aria-hidden="true"><path d="${type==='FF'?'M12 3v19':type==='SL'?'M18 3c0 11-1 14-12 19':'M7 3c0 6 10 7 10 19'}" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="${type==='FF'?12:type==='SL'?6:17}" cy="22" r="3" fill="currentColor"/></svg>`;
let opened=false;
export function openInningMode(role='pitcher',initialSeed=null) {
  const batting=role==='batter';
  if(opened)return;opened=true;
  const origin=document.activeElement,previousOverflow=document.body.style.overflow;
  const backgrounds=[document.querySelector('#boot'),document.querySelector('#app')].filter(Boolean),inert=backgrounds.map(e=>e.inert);
  backgrounds.forEach(e=>e.inert=true);document.body.style.overflow='hidden';
  const root=document.createElement('section');root.className='inning-mode';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','9회 말, 두 점 차');
  root.innerHTML=`<div class="inning-shell"><header class="inning-head"><div><small>한 이닝 승부 · ${batting?'타자':'투수'} 편</small><h1>9회 말, 두 점 차</h1></div><div class="inning-head-actions"><button class="quiet inning-sound" aria-pressed="false">소리 켜기</button><button class="quiet inning-exit">나가기</button></div></header>
  <div class="inning-presentation"><div class="inning-score"></div><div class="inning-live"></div>
  <div class="inning-live-zone" hidden></div><div class="inning-feedback" role="status" aria-live="polite"></div>
  <div class="inning-history" aria-label="최근 투구 기록"></div></div>
  <div class="inning-controls"><div class="inning-opponent"></div>
  ${batting?`<fieldset class="inning-picks"><legend class="sr-only">노릴 공과 타격 방식</legend>
  <div class="inning-label">예상 코스</div><div class="inning-options" data-group="location"><button data-value="any" aria-pressed="true">전체 대응</button><button data-value="in" aria-pressed="false">몸쪽</button><button data-value="out" aria-pressed="false">바깥쪽</button><button data-value="low" aria-pressed="false">낮은 공</button></div><div class="inning-zone-slot"></div><div class="inning-label">노릴 구종</div><div class="inning-options" data-group="target"><button data-value="any" aria-pressed="true">모든 공</button>${Object.entries(PITCHES).map(([k,p])=>`<button data-value="${k}" aria-pressed="false">${pitchIcon(k)}${p.name}</button>`).join('')}</div>
  <div class="inning-label">타격 방식</div><div class="inning-options" data-group="approach"><button data-value="contact" aria-pressed="true">짧게 맞히기</button><button data-value="power" aria-pressed="false">장타 노리기</button></div>
  <p class="inning-choice-note"></p>
  <p class="inning-decision-note">하단에서 기본 행동을 고르세요. 투구 중 2.5초 동안 바꿀 수 있고, 바꾸지 않으면 그대로 실행합니다.</p></fieldset>`:`<fieldset class="inning-picks"><legend class="sr-only">다음 투구 선택</legend>
  <div class="inning-label">구종</div><div class="inning-options" data-group="type">${Object.entries(PITCHES).map(([k,p])=>`<button data-value="${k}" aria-pressed="${k==='FF'}">${pitchIcon(k)}${p.name}<small>${p.speed} km/h</small></button>`).join('')}</div>
  <div class="inning-zone-slot"></div>
  <div class="inning-label">승부 방식</div><div class="inning-options" data-group="intent"><button data-value="attack" aria-pressed="true">존 안 승부</button><button data-value="chase" aria-pressed="false">유인구</button></div>
  <p class="inning-choice-note"></p><button class="go inning-throw">이 공 던지기</button></fieldset>`}
  <div class="inning-result" hidden></div><p class="inning-rule">${batting?'3아웃 전에 3점을 내면 끝내기 승리. 타선을 이어 플레이합니다.':'2실점 전에 남은 아웃 2개를 잡으세요.'} 최대 30구.</p></div></div>`;
  document.body.append(root);
  if(batting){root.classList.add('has-batting-dock');root.insertAdjacentHTML('beforeend','<div class="batting-decision"><div class="batting-decision-title"><strong>기본 행동</strong><span class="batting-time" aria-hidden="true">2.5초 변경</span></div><div class="batting-clock" aria-hidden="true"><i></i></div><div class="batting-action-row"><button class="batting-swing" aria-pressed="true">스윙</button><button class="batting-take" aria-pressed="false">지켜보기</button></div><button class="go inning-throw">준비 완료 · 투구 시작</button></div>');}
  const $=s=>root.querySelector(s);
  const zoneSvg=`<svg viewBox="0 0 200 200" aria-hidden="true"><path d="M80 184h40v7l-20 8-20-8z" fill="#a5b9b6"/><rect x="62" y="56" width="76" height="80" rx="2" fill="#29444d" stroke="#e1e9d9" stroke-width="2"/><path d="M87.3 56v80M112.7 56v80M62 82.7h76M62 109.3h76" stroke="#819b9f" stroke-dasharray="3 3" opacity=".6"/><g class="zone-markers"></g></svg>`;
  $('.inning-zone-slot').innerHTML=`<div class="inning-label">${batting?'현재 타석 투구 위치':'코스 선택 · 현재 타석'} <small>포수 시점 · 게임 판정 존</small></div><div class="inning-zone-row"><div class="inning-zone-map" ${batting?'':'data-group="zone"'}>${zoneSvg}${batting?'':'<button data-value="in" aria-pressed="false" class="zone-target zone-in">몸쪽</button><button data-value="out" aria-pressed="true" class="zone-target zone-out">바깥쪽</button><button data-value="low" aria-pressed="false" class="zone-target zone-low">낮게</button>'}</div><p class="inning-zone-caption">${batting?'이번 공은 아직 모릅니다. 투구 후 위치가 표시됩니다.':'그림에서 코스를 선택하세요. 점선 원은 목표, 숫자 점은 실제 위치입니다.'}</p></div>`;
  $('.inning-live-zone').innerHTML=zoneSvg+'<span>투구 위치</span>';

  let seed=Number.isInteger(initialSeed)&&initialSeed>=0&&initialSeed<=0xffffffff?initialSeed:crypto.getRandomValues(new Uint32Array(1))[0],game,lv,busy=false,dead=false,events=[],runEvents=[],shown=null,scrollBefore=0,choice=batting?{target:'any',approach:'contact',location:'any',action:'swing'}:{type:'FF',zone:'out',intent:'attack'};
  let sound=true;try{sound=localStorage.getItem('dugout.sfx')!=='0';}catch{}
  let ambience='idle',intensity=.5,cancelDecision=null,chooseDecision=null;
  function dock(phase='ready'){
    if(!batting)return;const plan=choice.action==='take'?'지켜보기':'스윙';
    $('.batting-decision').hidden=false;
    $('.batting-decision-title strong').textContent=phase==='ready'?'기본 행동':phase==='read'?plan+' 예정 · 바꿀 수 있어요':plan+' 예정';
    $('.batting-time').textContent=phase==='read'?'2.5초':phase==='ready'?'2.5초 변경':'투구 중';
    $('.batting-clock i').style.transform='scaleX(1)';
    for(const action of ['swing','take']){const button=$('.batting-'+action);button.disabled=phase==='warm';button.setAttribute('aria-pressed',String(choice.action===action));}
    $('.inning-throw').disabled=phase!=='ready';$('.inning-throw').textContent=phase==='ready'?'준비 완료 · 투구 시작':phase==='read'?'선택하지 않으면 '+plan+' 실행':'공을 보는 중…';
  }
  const runTimeline=tl=>new Promise(resolve=>{lv.tl=tl;lv.resolve=resolve;});
  async function readPitch(pitch){
    const plannedAction=choice.action;dock('warm');
    const preview=new Timeline(),rec={batter:game.batter.name,bh:'R',th:'R',half:'bottom',inning:9,zh:1};
    const arrival=lv._pitch(preview,{...pitch,r:'B'},0,.65,rec,{last:true});
    const release=1.55,flight=arrival-release,from=release+flight*.25,to=release+flight*.55;
    const warm=new Timeline();warm.end=from;warm.step=t=>{warm.t=Math.min(t,from);preview.step(warm.t);};
    await runTimeline(warm);if(dead)return null;
    lv.S.battingDecision=true;root.classList.add('is-deciding');dock('read');
    $('.inning-feedback').textContent='궤적을 보고 결정하세요';
    const picked=await new Promise(resolve=>{
      const end=performance.now()+2500;let raf,timer,settled=false;
      const finish=(action,expired=false)=>{if(settled)return;settled=true;cancelAnimationFrame(raf);clearTimeout(timer);cancelDecision=null;chooseDecision=null;$('.batting-decision').hidden=true;root.classList.remove('is-deciding');lv.S.battingDecision=false;resolve({action,expired,time:preview.t});};
      cancelDecision=()=>finish(null);
      const choose=action=>finish(performance.now()>=end?plannedAction:action,performance.now()>=end);
      chooseDecision=choose;
      const tick=()=>{const left=Math.max(0,end-performance.now());preview.step(from+(to-from)*(1-left/2500));$('.batting-time').textContent=(left/1000).toFixed(1)+'초';$('.batting-clock i').style.transform='scaleX('+left/2500+')';if(!left)finish(plannedAction,true);else raf=requestAnimationFrame(tick);};
      timer=setTimeout(()=>finish(plannedAction,true),2500);tick();$('.batting-'+plannedAction).focus({preventScroll:true});
    });
    return picked;
  }
  function soundLabel(){const on=!!lv?.sfx.on;$('.inning-sound').textContent=on?'소리 끄기':'소리 켜기';$('.inning-sound').setAttribute('aria-pressed',String(on));}
  function atmosphere(cue,k=.5){ambience=cue;intensity=k;lv.sfx.stadium(cue,k);lv.S.crowdReaction={cue,strength:k,at:performance.now()};}
  const opt={home:batting?'나의 타선':'홈 타자들',away:batting?'상대 마무리':'나의 마무리',park:{name:'라스트아웃 파크',capacity:18000},crowd:16000,cap:18000,colors:{home:'#cf7756',away:'#427c83'},view:'three',speed:1,sound:false,playerRole:role,stageHeight:()=>innerWidth<=900?Math.max(105,Math.min(132,innerHeight*.17)):Math.min(430,innerHeight*.48),immersive:()=>busy&&!dead,maxH:()=>Math.min(440,innerHeight*.53)};
  function sync(state) {
    for(const f of Object.values(lv.S.fielders))if(f.home){f.x=f.home[0];f.y=f.home[1];}
    lv.S.b=state.balls;lv.S.s=state.strikes;lv.S.outs=state.outs;lv.S.ball=null;lv.S.hold=null;lv.S.trail=[];lv.S.pitcherWind=0;lv.S.swing=0;
    lv.S.batter={name:state.batter.name,hand:'R',alpha:1};
    lv.S.runners=state.bases.flatMap((yes,i)=>yes?[lv._runner('주자 '+(i+1),i+1)]:[]);
    lv.line.bottom=[0,0,0,0,0,0,0,0,state.runs];
  }
  function paint() {
    const s=game.snapshot();
    const dots=(count,max,kind)=>Array.from({length:max},(_,i)=>`<i class="${kind}${i<count?' lit':''}"></i>`).join('');
    const bases=s.bases.map((v,i)=>v?(i+1)+'루':'').filter(Boolean).join(' · ')||'주자 없음';
    $('.inning-score').innerHTML=`<div class="inning-scoreline"><span class="inning-frame">9회 말</span><b>나 <strong>${batting?s.runs:2} : ${batting?2:s.runs}</strong> 상대</b><span class="inning-goal">${game.done?'승부 종료':batting?Math.max(0,3-s.runs)+'점 내면 끝내기':Math.max(0,3-s.outs)+'아웃 더 잡으면 성공'}</span></div>
      <div class="inning-counts"><span aria-label="${s.balls}볼 ${s.strikes}스트라이크 ${s.outs}아웃"><span>B ${dots(s.balls,3,'ball')}</span><span>S ${dots(s.strikes,2,'strike')}</span><span>O ${dots(s.outs,3,'out')}</span></span><span class="inning-diamond" aria-label="${bases}">${s.bases.map((v,i)=>`<i class="base${i+1}${v?' occupied':''}" title="${i+1}루${v?' 주자':''}"></i>`).join('')}</span><small>${s.count}/30구</small></div>`;
    const repeated=game.history.length>=2 && game.history.at(-1).type===game.history.at(-2).type;
    if(batting){
      const recent=game.history.slice(-3).map(h=>PITCHES[h.type].name).join(' → ');
      $('.inning-opponent').innerHTML=`<b>${s.pitcher.name} <span>${s.pitcher.style}</span></b><p>${recent?'최근 투구: '+recent:s.pitcher.hint}</p>`;return;
    }
    $('.inning-opponent').innerHTML=`<b>${s.batter.name} <span>${s.batter.style}</span></b><p>${repeated?'같은 구종 두 개 연속. 타자가 익숙해지고 있습니다.':s.batter.hint}</p>`;
  }
  function zone(event=null) {
    const selected=busy&&event?event.choice:choice;
    const aimX=batting?0:(selected.zone==='in'?-1:selected.zone==='out'?1:0)*(selected.intent==='chase'?1.4:.8);
    const aimZ=batting?0:selected.zone==='low'?(selected.intent==='chase'?-1.4:-.8):0;
    const area={in:[62,56,38,80],out:[100,56,38,80],low:[62,109,76,27]}[selected.location];
    const target=batting?(area?`<rect class="zone-prediction" x="${area[0]}" y="${area[1]}" width="${area[2]}" height="${area[3]}" fill="#a6d9b9" fill-opacity=".22" stroke="#a6d9b9" stroke-width="2" stroke-dasharray="4 3"/>`:''):`<circle cx="${100+aimX*38}" cy="${96-aimZ*40}" r="12" fill="none" stroke="#a6d9b9" stroke-width="2" stroke-dasharray="4 3"/>`;
    const q=event?.pitch,inside=q&&Math.abs(q.x)<=1&&Math.abs(q.z)<=1;
    const pitches=event&&!events.some(e=>e.after.count===event.after.count)?[...events,event]:events;
    const leaders=[];
    const marks=layoutPitchMarkers(pitches).map(({event:e,x,y,labelX,labelY},i)=>{
      const color=Math.abs(e.pitch.x)<=1&&Math.abs(e.pitch.z)<=1?'#f0cc76':'#88bddb';
      const moved=Math.hypot(x-labelX,y-labelY)>1;
      if(moved)leaders.push(`<path d="M${x} ${y}L${labelX} ${labelY}" stroke="${color}" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`);
      return `<g class="zone-pitch" data-pitch="${e.pitchNumber}"><title>${e.pitchNumber}구 · ${PITCHES[e.pitch.t].name} · ${e.label}</title><circle cx="${labelX}" cy="${labelY}" r="11" fill="${color}" stroke="${i===pitches.length-1?'#fff':'#142c37'}" stroke-width="2"/><text x="${labelX}" y="${labelY+5}" text-anchor="middle" font-size="15" font-weight="700" fill="#132630">${e.pitchNumber}</text></g>`;
    }).join('');
    root.querySelectorAll('.zone-markers').forEach(g=>g.innerHTML=target+leaders.join('')+marks);
    if(event)$('.inning-zone-caption').textContent=`${event.pitchNumber}구 ${inside?'존 안':'존 밖'} · ${event.label}${event.call==='W'&&!inside?' — 존 밖이어도 헛스윙은 스트라이크입니다.':''}`;
    else $('.inning-zone-caption').textContent='현재 타자 · 1구부터 시작합니다. 투구 위치가 번호 순서로 쌓입니다.'+(batting?' 초록 영역은 예상 코스입니다.':' 점선 원은 목표 코스입니다.');
  }
  function selection() {
    zone(shown);

    const note=$('.inning-choice-note');
    if(batting)note.textContent=({any:'코스 전체 대응',in:'몸쪽 예상',out:'바깥쪽 예상',low:'낮은 공 예상'}[choice.location])+' · '+(choice.target==='any'?'구종을 가리지 않고 대응':PITCHES[choice.target].name+'를 예상')+' · '+(choice.approach==='power'?'장타 가능성↑ · 헛스윙 위험↑':'컨택 우선 · 장타 가능성↓')+(choice.location==='any'?'':' · 코스를 맞히면 유리, 빗나가면 컨택 불리');
    else note.textContent=PITCHES[choice.type].name+' · '+({in:'몸쪽',out:'바깥쪽',low:'낮게'}[choice.zone])+' · '+(choice.intent==='chase'?'헛스윙 유도, 볼넷 주의':'스트라이크 확보, 안타 주의');
  }
  function history() {
    $('.inning-history').innerHTML=events.length?'<span>현재 타석 · 최근 투구</span>'+events.slice(-5).map(e=>`<span class="inning-pitch-chip"><small>${e.pitchNumber}구 · ${PITCHES[e.pitch.t].name}</small><b>${e.label}</b></span>`).join(''):'<span>현재 타자 · 첫 공을 고르세요.</span>';
  }
  function start(same=false) {
    if(lv){lv.skip();lv.destroy();}
    if(!same)seed=crypto.getRandomValues(new Uint32Array(1))[0];game=batting?new BattingGame(seed):new InningGame(seed);busy=false;events=[];runEvents=[];shown=null;root.classList.remove('is-playing');
    lv=new LiveView($('.inning-live'),opt);lv.sfx.stadiumOnly=true;lv.setSound(sound);lv.sfx.mute(document.hidden);ambience='idle';atmosphere('idle');soundLabel();
    lv.S.inning=9;lv.S.half='bottom';lv.line.top=[0,0,0,0,0,0,0,0,2];
    const positions={P:[0,18.44],C:[0,-1.6],'1B':[24,25],'2B':[13,38],SS:[-13,38],'3B':[-24,25],LF:[-45,75],CF:[0,95],RF:[45,75]};
    for(const [pos,[x,y]] of Object.entries(positions))lv.S.fielders[pos]={pos,name:pos==='P'?(batting?game.pitcher.name:'나의 마무리'):pos,x,y,home:[x,y],alpha:1};
    sync(game.snapshot());lv.S.broadcast={kind:'pitch'};
    $('.inning-picks').disabled=false;$('.inning-picks').hidden=false;$('.inning-result').hidden=true;
    $('.inning-feedback').textContent=batting?'1사 1·2루. 두 점 뒤진 상황, 타선을 이어 경기를 뒤집으세요.':'1사 1·2루. 공을 고르고 첫 승부를 시작하세요.';paint();selection();history();dock();root.scrollTop=0;$('.inning-throw').focus({preventScroll:true});
  }
  function finish() {
    $('.inning-picks').hidden=true;const box=$('.inning-result');box.hidden=false;
    box.innerHTML=`<h2>${batting?(game.won?'끝내기 승리!':game.outs>=3?(game.runs===2?'동점에서 이닝 종료':'뒤집지 못했다'):'투구 제한에 도달했다'):(game.won?'막아냈다!':game.runs>=2?'리드를 지키지 못했다':'투구 제한에 도달했다')}</h2><p>${game.count}구 · ${game.runs}${batting?'득점':'실점'} · ${batting?game.outs+'아웃':(game.outs-1)+'아웃을 잡았습니다.'}</p><small class="inning-result-kicker">${game.won?'MISSION COMPLETE':'한 번 더, 다른 선택으로'}</small><div><button class="go" data-retry>같은 상황 재도전</button><button class="quiet" data-new>새 상대 도전</button></div>`;
    if(batting){
      const result=battingResult(game.snapshot(),seed,runEvents);
      box.insertAdjacentHTML('beforeend',`<div class="inning-sharing"><p>같은 상황, 친구는 뒤집을 수 있을까요?</p><button class="go" data-share>결과 공유 · 친구에게 도전</button><button class="quiet" data-copy>도전 링크 복사</button><button class="quiet" data-card>결과 카드 저장</button><p class="inning-share-status" role="status"></p><textarea class="inning-share-fallback" aria-label="복사할 결과와 도전 링크" readonly hidden></textarea></div>`);
      const status=box.querySelector('.inning-share-status'),full=result.text+'\n'+result.url;
      const fallback=()=>{const field=box.querySelector('textarea');field.hidden=false;field.value=full;field.focus();field.select();status.textContent='아래 결과와 링크를 복사해 주세요.';};
      box.querySelector('[data-copy]').onclick=async()=>{if(await copyChallenge(result.url))status.textContent='같은 상황에 도전하는 링크를 복사했습니다.';else fallback();};
      box.querySelector('[data-share]').onclick=async()=>{
        if(navigator.share){try{await navigator.share({title:'DUGOUT · '+result.title,text:result.text,url:result.url});return;}catch(e){if(e.name==='AbortError')return;}}
        if(await copyChallenge(full))status.textContent='결과와 도전 링크를 복사했습니다. 원하는 곳에 붙여넣으세요.';else fallback();
      };
      box.querySelector('[data-card]').onclick=async()=>{try{const blob=await resultCard(result);if(dead)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='dugout-b1-'+result.seed+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='결과 카드를 저장했습니다. 도전 링크도 함께 보내보세요.';}catch{status.textContent='카드를 만들지 못했습니다. 도전 링크를 복사해 주세요.';}};
    }
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
    if(busy||dead||game.done)return;atmosphere('pitch');busy=true;scrollBefore=root.scrollTop;root.classList.add('is-playing');$('.inning-live-zone').hidden=events.length===0;$('.inning-live-zone span').textContent='현재 타석 · '+events.length+'구 기록';lv._size();$('.inning-picks').disabled=true;$('.inning-feedback').textContent='승부 중…';
    try {
      let e,resumeAt=0;
      if(batting){const pitch=game.preparePitch(choice),picked=await readPitch(pitch);if(dead||!picked?.action)return;resumeAt=picked.time;e=game.decidePitch(picked.action);if(picked.expired)e.explanation='선택해 둔 '+(picked.action==='swing'?'스윙을':'지켜보기를')+' 그대로 실행했습니다. '+e.explanation;}
      else e=game.pitch(choice);
      const tl=new Timeline(),S=lv.S;
      e.pitchNumber=events.length+1;
      const rec={batter:e.before.batter.name,bh:'R',th:'R',half:'bottom',inning:9,zh:1};
      const r=['S','W','B','F'].includes(e.call)?e.call:'X';
      lv.pnp0=e.pitchNumber-1;lv.seq=events.map(e=>e.pitch);
      const arrival=lv._pitch(tl,{...e.pitch,r},0,.65,rec,{last:true});
      tl.at(arrival,()=>{zone(r==='X'?{...e,label:'타격'}:e);$('.inning-live-zone').hidden=false;$('.inning-live-zone span').textContent=(Math.abs(e.pitch.x)<=1&&Math.abs(e.pitch.z)<=1?'존 안':'존 밖')+' · '+(r==='X'?'타격':e.label);});
      const react=()=>{
        const positive=e.after.done?e.after.won:batting?['1B','2B','HR','BB'].includes(e.result):['OUT','K'].includes(e.result);
        if(e.after.done||e.terminal)atmosphere(positive?'cheer':'groan',e.after.done?1:e.result==='HR'?.85:e.scored>0?.75:.45);
        else atmosphere(r==='F'?'foul':'idle');
      };
      tl.at(arrival,()=>{if(r==='X')atmosphere('contact');else react();});
      if(r!=='X')tl.at(arrival,()=>{$('.inning-feedback').textContent=e.label+' — '+e.explanation;lv._flash(e.label,e.result==='K'?'k':'');});
      if(r==='X') {
        const angle=e.angle*Math.PI/180,depth=e.result==='HR'?135:e.result==='2B'?90:e.result==='1B'?65:70;
        const end=[Math.sin(angle)*depth,Math.cos(angle)*depth],duration=3;
        tl.at(arrival,()=>{S.broadcast={kind:'field'};});
        tl.add(arrival,duration,k=>{S.ball={x:end[0]*k,y:end[1]*k,z:1+22*4*k*(1-k),vis:true};lv._trail();});
        const f=Object.values(S.fielders).filter(x=>['LF','CF','RF'].includes(x.pos)).sort((a,b)=>Math.hypot(a.x-end[0],a.y-end[1])-Math.hypot(b.x-end[0],b.y-end[1]))[0],from=[f.x,f.y];
        tl.add(arrival,duration,k=>{f.x=from[0]+(end[0]-from[0])*k;f.y=from[1]+(end[1]-from[1])*k;});
        tl.at(arrival+duration,()=>{S.ball=null;S.trail=[];zone(e);react();lv._flash(e.label,e.result==='OUT'?'out':e.result==='HR'?'hr':'');});
      }
      if(e.movements.length) {
        const runStart=arrival+(r==='X'?.3:.7),duration=3.4;
        for(const m of e.movements){let runner=m.from===0?lv._runner(e.before.batter.name,0):S.runners.find(x=>x.base===m.from);if(!runner)continue;if(m.from===0){S.runners.push(runner);tl.at(runStart,()=>{S.batter=null;});}
          const path=Array.from({length:m.to-m.from+1},(_,i)=>BASE[m.from+i]);
          tl.add(runStart,duration,k=>{const a=Math.min(path.length-2,Math.floor(k*(path.length-1))),u=k===1?1:k*(path.length-1)-a;runner.x=path[a][0]+(path[a+1][0]-path[a][0])*u;runner.y=path[a][1]+(path[a+1][1]-path[a][1])*u;});
        }
      }
      tl.add(tl.end,1.5,null);
      if(resumeAt)tl.step(resumeAt);
      await runTimeline(tl);
      if(dead)return;
      events.push(e);runEvents.push(e);shown=e;
      if(e.terminal&&!game.done){events=[];shown=null;}
      zone(shown);history();
      if(['1B','2B','HR'].includes(e.result))lv.line.hits.bottom++;
      sync(e.after);lv.S.broadcast={kind:game.done?'beauty':'between'};
      $('.inning-feedback').innerHTML=`<div class="inning-verdict"><strong>${e.label}</strong><span>${PITCHES[e.pitch.t].name} · ${e.pitch.v} km/h</span></div><p>${e.explanation}</p>`;paint();if(game.done)finish();
    } catch(error){if(!dead){$('.inning-feedback').textContent='화면을 다시 준비합니다. 같은 상황에서 재시작하세요.';$('.inning-result').hidden=false;$('.inning-result').innerHTML='<button class="go">같은 상황 다시 시작</button>';$('.inning-result button').onclick=()=>start(true);}console.error(error);}
    finally{busy=false;root.classList.remove('is-playing');if(!dead){lv._size();if(game.done)requestAnimationFrame(()=>{if(!dead)$('.inning-result').scrollIntoView({block:'nearest'});});else root.scrollTop=scrollBefore;}if(!dead&&!game.done){dock();$('.inning-picks').disabled=false;$('.inning-throw').focus({preventScroll:true});}}
  };
  $('.inning-throw').onclick=()=>play();
  if(batting)for(const action of ['swing','take'])$('.batting-'+action).onclick=()=>{if(chooseDecision)chooseDecision(action);else if(!busy&&!game.done){choice.action=action;dock();}};

  start(true);
}
