import { InningGame, PITCHES } from './inning-game.js';
import { LiveView, Timeline } from './live.js';
const BASE=[[0,0],[19.4,19.4],[0,38.8],[-19.4,19.4],[0,0]];
let opened=false;
export function openInningMode() {
  if(opened)return;opened=true;
  const origin=document.activeElement,previousOverflow=document.body.style.overflow;
  const backgrounds=[document.querySelector('#boot'),document.querySelector('#app')].filter(Boolean),inert=backgrounds.map(e=>e.inert);
  backgrounds.forEach(e=>e.inert=true);document.body.style.overflow='hidden';
  const root=document.createElement('section');root.className='inning-mode';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','9회 말, 두 점 차');
  root.innerHTML=`<div class="inning-shell"><header class="inning-head"><div><small>한 이닝 승부 · 투수 편</small><h1>9회 말, 두 점 차</h1></div><button class="quiet inning-exit">나가기</button></header>
  <div class="inning-score"></div><div class="inning-live"></div>
  <div class="inning-feedback" role="status" aria-live="polite"></div>
  <div class="inning-controls"><div class="inning-opponent"></div>
  <fieldset class="inning-picks"><legend class="sr-only">다음 투구 선택</legend>
  <div class="inning-options" data-group="type">${Object.entries(PITCHES).map(([k,p])=>`<button data-value="${k}" aria-pressed="${k==='FF'}">${p.name}<small>${p.speed} km/h</small></button>`).join('')}</div>
  <div class="inning-options" data-group="zone"><button data-value="in" aria-pressed="false">몸쪽</button><button data-value="out" aria-pressed="true">바깥쪽</button><button data-value="low" aria-pressed="false">낮게</button></div>
  <div class="inning-options" data-group="intent"><button data-value="attack" aria-pressed="true">존 안 승부</button><button data-value="chase" aria-pressed="false">유인구</button></div>
  <button class="go inning-throw">이 공 던지기</button></fieldset>
  <div class="inning-result" hidden></div><p class="inning-rule">2실점 전에 남은 아웃 2개를 잡으세요. 최대 30구.</p></div></div>`;
  document.body.append(root);
  const $=s=>root.querySelector(s);
  let seed=crypto.getRandomValues(new Uint32Array(1))[0],game,lv,busy=false,dead=false,choice={type:'FF',zone:'out',intent:'attack'};
  const opt={home:'홈 타자들',away:'나의 마무리',park:{name:'라스트아웃 파크',capacity:18000},crowd:16000,cap:18000,colors:{home:'#cf7756',away:'#427c83'},view:'three',speed:1,sound:false,maxH:()=>Math.min(300,innerHeight*.30)};
  function sync(state) {
    for(const f of Object.values(lv.S.fielders))if(f.home){f.x=f.home[0];f.y=f.home[1];}
    lv.S.b=state.balls;lv.S.s=state.strikes;lv.S.outs=state.outs;lv.S.ball=null;lv.S.hold=null;lv.S.trail=[];lv.S.pitcherWind=0;lv.S.swing=0;
    lv.S.batter={name:state.batter.name,hand:'R',alpha:1};
    lv.S.runners=state.bases.flatMap((yes,i)=>yes?[lv._runner('주자 '+(i+1),i+1)]:[]);
    lv.line.bottom=[0,0,0,0,0,0,0,0,state.runs];
  }
  function paint() {
    const s=game.snapshot();
    $('.inning-score').innerHTML=`<b>나 <strong>2 : ${s.runs}</strong> 상대</b><span>${s.outs}아웃 · ${s.balls}볼 ${s.strikes}스트라이크</span><span>${s.bases.map((v,i)=>v?(i+1)+'루':'').filter(Boolean).join(' · ')||'주자 없음'}<em>${s.count}/30구</em></span>`;
    const repeated=game.history.length>=2 && game.history.at(-1).type===game.history.at(-2).type;
    $('.inning-opponent').innerHTML=`<b>${s.batter.name} <span>${s.batter.style}</span></b><p>${repeated?'같은 구종 두 개 연속. 타자가 익숙해지고 있습니다.':s.batter.hint}</p>`;
  }
  function start(same=false) {
    if(lv){lv.skip();lv.destroy();}
    if(!same)seed=crypto.getRandomValues(new Uint32Array(1))[0];game=new InningGame(seed);busy=false;
    lv=new LiveView($('.inning-live'),opt);
    lv.S.inning=9;lv.S.half='bottom';lv.line.top=[0,0,0,0,0,0,0,0,2];
    const positions={P:[0,18.44],C:[0,-1.6],'1B':[24,25],'2B':[13,38],SS:[-13,38],'3B':[-24,25],LF:[-45,75],CF:[0,95],RF:[45,75]};
    for(const [pos,[x,y]] of Object.entries(positions))lv.S.fielders[pos]={pos,name:pos==='P'?'나의 마무리':pos,x,y,home:[x,y],alpha:1};
    sync(game.snapshot());lv.S.broadcast={kind:'pitch'};
    $('.inning-picks').disabled=false;$('.inning-picks').hidden=false;$('.inning-result').hidden=true;
    $('.inning-feedback').textContent='1사 1·2루. 공을 고르고 첫 승부를 시작하세요.';paint();$('.inning-throw').focus();
  }
  function finish() {
    $('.inning-picks').hidden=true;const box=$('.inning-result');box.hidden=false;
    box.innerHTML=`<h2>${game.won?'막아냈다!':game.runs>=2?'리드를 지키지 못했다':'투구 제한에 도달했다'}</h2><p>${game.count}구 · ${game.runs}실점 · ${game.outs-1}아웃을 잡았습니다.</p><div><button class="go" data-retry>같은 상황 재도전</button><button class="quiet" data-new>새 상대 도전</button></div>`;
    box.querySelector('[data-retry]').onclick=()=>start(true);box.querySelector('[data-new]').onclick=()=>start(false);box.querySelector('button').focus();
  }
  function close(){if(dead)return;dead=true;lv?.skip();lv?.destroy();root.remove();backgrounds.forEach((e,i)=>e.inert=inert[i]);document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',key);opened=false;origin?.focus();}
  function key(e){if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const buttons=[...root.querySelectorAll('button:not(:disabled)')].filter(e=>e.getClientRects().length);const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
  document.addEventListener('keydown',key);$('.inning-exit').onclick=close;
  root.querySelectorAll('[data-group] button').forEach(b=>b.onclick=()=>{if(busy)return;const group=b.parentElement;choice[group.dataset.group]=b.dataset.value;group.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
  $('.inning-throw').onclick=async()=>{
    if(busy||dead||game.done)return;busy=true;$('.inning-picks').disabled=true;$('.inning-feedback').textContent='승부 중…';
    try {
      const e=game.pitch(choice),tl=new Timeline(),S=lv.S;
      const rec={batter:e.before.batter.name,bh:'R',th:'R',half:'bottom',inning:9,zh:1};
      const r=['S','W','B','F'].includes(e.call)?e.call:'X';
      lv.pnp0=e.before.count;lv.seq=[];
      const arrival=lv._pitch(tl,{...e.pitch,r},0,.35,rec,{last:true});
      if(r!=='X')tl.at(arrival,()=>{lv._flash(e.label,e.result==='K'?'k':'');});
      if(r==='X') {
        const angle=e.angle*Math.PI/180,depth=e.result==='HR'?135:e.result==='2B'?90:e.result==='1B'?65:70;
        const end=[Math.sin(angle)*depth,Math.cos(angle)*depth],duration=3;
        tl.at(arrival,()=>{S.broadcast={kind:'field'};});
        tl.add(arrival,duration,k=>{S.ball={x:end[0]*k,y:end[1]*k,z:1+22*4*k*(1-k),vis:true};lv._trail();});
        const f=Object.values(S.fielders).filter(x=>['LF','CF','RF'].includes(x.pos)).sort((a,b)=>Math.hypot(a.x-end[0],a.y-end[1])-Math.hypot(b.x-end[0],b.y-end[1]))[0],from=[f.x,f.y];
        tl.add(arrival,duration,k=>{f.x=from[0]+(end[0]-from[0])*k;f.y=from[1]+(end[1]-from[1])*k;});
        tl.at(arrival+duration,()=>{S.ball=null;S.trail=[];lv._flash(e.label,e.result==='OUT'?'out':e.result==='HR'?'hr':'');});
      }
      if(e.movements.length) {
        const runStart=arrival+(r==='X'?.3:.7),duration=3.4;
        for(const m of e.movements){let runner=m.from===0?lv._runner(e.before.batter.name,0):S.runners.find(x=>x.base===m.from);if(!runner)continue;if(m.from===0){S.runners.push(runner);tl.at(runStart,()=>{S.batter=null;});}
          const path=Array.from({length:m.to-m.from+1},(_,i)=>BASE[m.from+i]);
          tl.add(runStart,duration,k=>{const a=Math.min(path.length-2,Math.floor(k*(path.length-1))),u=k===1?1:k*(path.length-1)-a;runner.x=path[a][0]+(path[a+1][0]-path[a][0])*u;runner.y=path[a][1]+(path[a+1][1]-path[a][1])*u;});
        }
      }
      tl.add(tl.end,.9,null);
      await new Promise(resolve=>{lv.tl=tl;lv.resolve=resolve;});
      if(dead)return;
      if(['1B','2B','HR'].includes(e.result))lv.line.hits.bottom++;
      sync(e.after);lv.S.broadcast={kind:game.done?'beauty':'between'};
      $('.inning-feedback').textContent=e.label+' — '+e.explanation;paint();if(game.done)finish();
    } catch(error){if(!dead){$('.inning-feedback').textContent='화면을 다시 준비합니다. 같은 상황에서 재시작하세요.';$('.inning-result').hidden=false;$('.inning-result').innerHTML='<button class="go">같은 상황 다시 시작</button>';$('.inning-result button').onclick=()=>start(true);}console.error(error);}
    finally{busy=false;if(!dead&&!game.done){$('.inning-picks').disabled=false;$('.inning-throw').focus();}}
  };
  start(true);
}
