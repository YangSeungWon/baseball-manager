import { InningGame, PITCHES } from './inning-game.js';
import { BattingGame } from './batting-game.js';
import { LiveView, Timeline } from './live.js';
const BASE=[[0,0],[19.4,19.4],[0,38.8],[-19.4,19.4],[0,0]];
const pitchIcon=type=>`<svg class="inning-pitch-icon" viewBox="0 0 24 28" aria-hidden="true"><path d="${type==='FF'?'M12 3v19':type==='SL'?'M18 3c0 11-1 14-12 19':'M7 3c0 6 10 7 10 19'}" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="${type==='FF'?12:type==='SL'?6:17}" cy="22" r="3" fill="currentColor"/></svg>`;
let opened=false;
export function openInningMode(role='pitcher') {
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
  <div class="inning-zone-slot"></div><div class="inning-label">노릴 구종</div><div class="inning-options" data-group="target"><button data-value="any" aria-pressed="true">모든 공</button>${Object.entries(PITCHES).map(([k,p])=>`<button data-value="${k}" aria-pressed="false">${pitchIcon(k)}${p.name}</button>`).join('')}</div>
  <div class="inning-label">타격 방식</div><div class="inning-options" data-group="approach"><button data-value="contact" aria-pressed="true">짧게 맞히기</button><button data-value="power" aria-pressed="false">장타 노리기</button></div>
  <p class="inning-choice-note"></p>
  <div class="inning-options inning-actions"><button class="go inning-throw" data-action="swing">스윙한다</button><button class="inning-take" data-action="take">지켜본다</button></div></fieldset>`:`<fieldset class="inning-picks"><legend class="sr-only">다음 투구 선택</legend>
  <div class="inning-label">구종</div><div class="inning-options" data-group="type">${Object.entries(PITCHES).map(([k,p])=>`<button data-value="${k}" aria-pressed="${k==='FF'}">${pitchIcon(k)}${p.name}<small>${p.speed} km/h</small></button>`).join('')}</div>
  <div class="inning-zone-slot"></div>
  <div class="inning-label">승부 방식</div><div class="inning-options" data-group="intent"><button data-value="attack" aria-pressed="true">존 안 승부</button><button data-value="chase" aria-pressed="false">유인구</button></div>
  <p class="inning-choice-note"></p><button class="go inning-throw">이 공 던지기</button></fieldset>`}
  <div class="inning-result" hidden></div><p class="inning-rule">${batting?'3아웃 전에 3점을 내면 끝내기 승리. 타선을 이어 플레이합니다.':'2실점 전에 남은 아웃 2개를 잡으세요.'} 최대 30구.</p></div></div>`;
  document.body.append(root);
  const $=s=>root.querySelector(s);
  const zoneSvg=`<svg viewBox="0 0 200 200" aria-hidden="true"><path d="M80 184h40v7l-20 8-20-8z" fill="#a5b9b6"/><rect x="62" y="56" width="76" height="80" rx="2" fill="#29444d" stroke="#e1e9d9" stroke-width="2"/><path d="M87.3 56v80M112.7 56v80M62 82.7h76M62 109.3h76" stroke="#819b9f" stroke-dasharray="3 3" opacity=".6"/><g class="zone-markers"></g></svg>`;
  $('.inning-zone-slot').innerHTML=`<div class="inning-label">${batting?'지난 공 위치':'코스 선택'} <small>포수 시점 · 게임 판정 존</small></div><div class="inning-zone-row"><div class="inning-zone-map" ${batting?'':'data-group="zone"'}>${zoneSvg}${batting?'':'<button data-value="in" aria-pressed="false" class="zone-target zone-in">몸쪽</button><button data-value="out" aria-pressed="true" class="zone-target zone-out">바깥쪽</button><button data-value="low" aria-pressed="false" class="zone-target zone-low">낮게</button>'}</div><p class="inning-zone-caption">${batting?'이번 공은 아직 모릅니다. 투구 후 위치가 표시됩니다.':'그림에서 코스를 선택하세요. 점선 원은 목표, 숫자 점은 실제 위치입니다.'}</p></div>`;
  $('.inning-live-zone').innerHTML=zoneSvg+'<span>투구 위치</span>';

  let seed=crypto.getRandomValues(new Uint32Array(1))[0],game,lv,busy=false,dead=false,events=[],shown=null,scrollBefore=0,choice=batting?{target:'any',approach:'contact'}:{type:'FF',zone:'out',intent:'attack'};
  let sound=true;try{sound=localStorage.getItem('dugout.sfx')!=='0';}catch{}
  let ambience='idle',intensity=.5;
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
    const target=batting?'':`<circle cx="${100+aimX*38}" cy="${96-aimZ*40}" r="12" fill="none" stroke="#a6d9b9" stroke-width="2" stroke-dasharray="4 3"/>`;
    const q=event?.pitch,inside=q&&Math.abs(q.x)<=1&&Math.abs(q.z)<=1;
    const mark=q?`<circle cx="${100+q.x*38}" cy="${96-q.z*40}" r="9" fill="${inside?'#f0cc76':'#88bddb'}" stroke="#142c37" stroke-width="2"/><text x="${100+q.x*38}" y="${100-q.z*40}" text-anchor="middle" font-size="11" font-weight="700" fill="#132630">${event.after.count}</text>`:'';
    root.querySelectorAll('.zone-markers').forEach(g=>g.innerHTML=target+mark);
    if(event)$('.inning-zone-caption').textContent=`${event.after.count}구 ${inside?'존 안':'존 밖'} · ${event.label}${event.call==='W'&&!inside?' — 존 밖이어도 헛스윙은 스트라이크입니다.':''}`;
    else $('.inning-zone-caption').textContent=batting?'이번 공은 아직 모릅니다. 투구 후 위치가 표시됩니다.':'그림에서 코스를 선택하세요. 점선 원은 목표, 숫자 점은 실제 위치입니다.';
  }
  function selection() {
    zone(shown);

    const note=$('.inning-choice-note');
    if(batting)note.textContent=(choice.target==='any'?'구종을 가리지 않고 대응':PITCHES[choice.target].name+'를 예상')+' · '+(choice.approach==='power'?'장타 가능성↑ · 헛스윙 위험↑':'컨택 우선 · 장타 가능성↓');
    else note.textContent=PITCHES[choice.type].name+' · '+({in:'몸쪽',out:'바깥쪽',low:'낮게'}[choice.zone])+' · '+(choice.intent==='chase'?'헛스윙 유도, 볼넷 주의':'스트라이크 확보, 안타 주의');
  }
  function history() {
    $('.inning-history').innerHTML=events.length?'<span>최근 투구</span>'+events.slice(-5).map((e,i)=>`<span class="inning-pitch-chip"><small>${events.length-Math.min(5,events.length)+i+1}구 · ${PITCHES[e.pitch.t].name}</small><b>${e.label}</b></span>`).join(''):'<span>첫 공을 고르세요. 최근 투구가 여기에 쌓입니다.</span>';
  }
  function start(same=false) {
    if(lv){lv.skip();lv.destroy();}
    if(!same)seed=crypto.getRandomValues(new Uint32Array(1))[0];game=batting?new BattingGame(seed):new InningGame(seed);busy=false;events=[];shown=null;root.classList.remove('is-playing');
    lv=new LiveView($('.inning-live'),opt);lv.sfx.stadiumOnly=true;lv.setSound(sound);lv.sfx.mute(document.hidden);ambience='idle';atmosphere('idle');soundLabel();
    lv.S.inning=9;lv.S.half='bottom';lv.line.top=[0,0,0,0,0,0,0,0,2];
    const positions={P:[0,18.44],C:[0,-1.6],'1B':[24,25],'2B':[13,38],SS:[-13,38],'3B':[-24,25],LF:[-45,75],CF:[0,95],RF:[45,75]};
    for(const [pos,[x,y]] of Object.entries(positions))lv.S.fielders[pos]={pos,name:pos==='P'?(batting?game.pitcher.name:'나의 마무리'):pos,x,y,home:[x,y],alpha:1};
    sync(game.snapshot());lv.S.broadcast={kind:'pitch'};
    $('.inning-picks').disabled=false;$('.inning-picks').hidden=false;$('.inning-result').hidden=true;
    $('.inning-feedback').textContent=batting?'1사 1·2루. 두 점 뒤진 상황, 타선을 이어 경기를 뒤집으세요.':'1사 1·2루. 공을 고르고 첫 승부를 시작하세요.';paint();selection();history();root.scrollTop=0;$('.inning-throw').focus({preventScroll:true});
  }
  function finish() {
    $('.inning-picks').hidden=true;const box=$('.inning-result');box.hidden=false;
    box.innerHTML=`<h2>${batting?(game.won?'끝내기 승리!':game.outs>=3?(game.runs===2?'동점에서 이닝 종료':'뒤집지 못했다'):'투구 제한에 도달했다'):(game.won?'막아냈다!':game.runs>=2?'리드를 지키지 못했다':'투구 제한에 도달했다')}</h2><p>${game.count}구 · ${game.runs}${batting?'득점':'실점'} · ${batting?game.outs+'아웃':(game.outs-1)+'아웃을 잡았습니다.'}</p><small class="inning-result-kicker">${game.won?'MISSION COMPLETE':'한 번 더, 다른 선택으로'}</small><div><button class="go" data-retry>같은 상황 재도전</button><button class="quiet" data-new>새 상대 도전</button></div>`;
    box.querySelector('[data-retry]').onclick=()=>start(true);box.querySelector('[data-new]').onclick=()=>start(false);box.querySelector('button').focus({preventScroll:true});box.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function close(){if(dead)return;dead=true;lv?.skip();lv?.destroy();root.remove();backgrounds.forEach((e,i)=>e.inert=inert[i]);document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);opened=false;origin?.focus();}
  function key(e){if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const buttons=[...root.querySelectorAll('button:not(:disabled)')].filter(e=>e.getClientRects().length);const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
  function visibility(){if(dead)return;lv.sfx.mute(document.hidden||lv.speed>2);if(!document.hidden&&lv.sfx.on)lv.sfx.stadium(busy?ambience:'idle',intensity);}
  document.addEventListener('visibilitychange',visibility);
  $('.inning-sound').onclick=()=>{sound=!lv.sfx.on;lv.setSound(sound);visibility();if(sound)lv.sfx.stadium(ambience,intensity);soundLabel();};
  document.addEventListener('keydown',key);$('.inning-exit').onclick=close;
  root.querySelectorAll('[data-group] button').forEach(b=>b.onclick=()=>{if(busy)return;const group=b.parentElement;choice[group.dataset.group]=b.dataset.value;group.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));selection();});
  const play=async(action='swing')=>{
    if(busy||dead||game.done)return;atmosphere('pitch');busy=true;scrollBefore=root.scrollTop;root.classList.add('is-playing');$('.inning-live-zone').hidden=true;lv._size();$('.inning-picks').disabled=true;$('.inning-feedback').textContent='승부 중…';
    try {
      const e=game.pitch(batting?{...choice,action}:choice),tl=new Timeline(),S=lv.S;
      const rec={batter:e.before.batter.name,bh:'R',th:'R',half:'bottom',inning:9,zh:1};
      const r=['S','W','B','F'].includes(e.call)?e.call:'X';
      lv.pnp0=e.before.count;lv.seq=[];
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
        tl.at(arrival+duration,()=>{S.ball=null;S.trail=[];react();lv._flash(e.label,e.result==='OUT'?'out':e.result==='HR'?'hr':'');});
      }
      if(e.movements.length) {
        const runStart=arrival+(r==='X'?.3:.7),duration=3.4;
        for(const m of e.movements){let runner=m.from===0?lv._runner(e.before.batter.name,0):S.runners.find(x=>x.base===m.from);if(!runner)continue;if(m.from===0){S.runners.push(runner);tl.at(runStart,()=>{S.batter=null;});}
          const path=Array.from({length:m.to-m.from+1},(_,i)=>BASE[m.from+i]);
          tl.add(runStart,duration,k=>{const a=Math.min(path.length-2,Math.floor(k*(path.length-1))),u=k===1?1:k*(path.length-1)-a;runner.x=path[a][0]+(path[a+1][0]-path[a][0])*u;runner.y=path[a][1]+(path[a+1][1]-path[a][1])*u;});
        }
      }
      tl.add(tl.end,1.5,null);
      await new Promise(resolve=>{lv.tl=tl;lv.resolve=resolve;});
      if(dead)return;
      events.push(e);shown=e;zone(e);history();
      if(['1B','2B','HR'].includes(e.result))lv.line.hits.bottom++;
      sync(e.after);lv.S.broadcast={kind:game.done?'beauty':'between'};
      $('.inning-feedback').innerHTML=`<div class="inning-verdict"><strong>${e.label}</strong><span>${PITCHES[e.pitch.t].name} · ${e.pitch.v} km/h</span></div><p>${e.explanation}</p>`;paint();if(game.done)finish();
    } catch(error){if(!dead){$('.inning-feedback').textContent='화면을 다시 준비합니다. 같은 상황에서 재시작하세요.';$('.inning-result').hidden=false;$('.inning-result').innerHTML='<button class="go">같은 상황 다시 시작</button>';$('.inning-result button').onclick=()=>start(true);}console.error(error);}
    finally{busy=false;root.classList.remove('is-playing');if(!dead){lv._size();if(game.done)requestAnimationFrame(()=>{if(!dead)$('.inning-result').scrollIntoView({block:'nearest'});});else root.scrollTop=scrollBefore;}if(!dead&&!game.done){$('.inning-picks').disabled=false;$('.inning-throw').focus({preventScroll:true});}}
  };
  $('.inning-throw').onclick=()=>play('swing');
  if(batting)$('.inning-take').onclick=()=>play('take');
  start(true);
}
