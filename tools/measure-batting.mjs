// 타자 편 스킬 사다리 측정. 정해진 정책으로 수천 타석을 돌려 층별 기여를 잰다.
//   node tools/measure-batting.mjs [스테이지당 시도 수=2000] [9이닝 경기 수=200]
// 실제 난수(LCG)를 그대로 쓴다. 목표 구간은 proto/DESIGN_BATTING.md 의 사다리다.
import {BattingGame,deliverPitch,inStrikeZone,SWING_WINDOW} from '../web/js/batting-game.js';
import {FullGame} from '../web/js/full-game.js';
import {STAGES} from '../web/js/inning-stages.js';

const HITS=['1B','2B','3B','HR'];
const sweet=()=>(SWING_WINDOW.from+SWING_WINDOW.to)/2;
const locationOf=p=>p.z>.4?'high':p.z<-.4?'low':p.x<0?'in':'out';
// 다음 10롤을 미리 본다. 상태는 되돌리므로 게임에는 흔적이 없다(하네스 전용).
const peek=g=>{const rng=g.rng,roll=Array.from({length:10},()=>g.random());g.rng=rng;return roll;};

// 정책: choose(game) → 사전 선택, decide(game, delivery) → {action, timing}
export const POLICIES={
  random:{label:'무작위',choose:()=>({target:'any',approach:'contact',location:'any'}),decide:g=>({action:(g.rng>>>8)&1?'swing':'take',timing:null})},
  zone:{label:'존 판독',choose:()=>({target:'any',approach:'contact',location:'any'}),decide:(g,d)=>({action:inStrikeZone(d.x,d.z)?'swing':'take',timing:null})},
  timer:{label:'존 판독 + 타이밍',choose:()=>({target:'any',approach:'contact',location:'any'}),decide:(g,d)=>({action:inStrikeZone(d.x,d.z)?'swing':'take',timing:sweet()})},
  oracle:{label:'+ 예측 적중(예지)',choose:g=>{const p=deliverPitch(g.pitcher,g,peek(g));return {target:p.t,approach:'contact',location:locationOf(p)};},decide:(g,d)=>({action:inStrikeZone(d.x,d.z)?'swing':'take',timing:sweet()})},
};
// 9이닝용. naive 는 timer 와 같고, learner 는 카운트별로 본 구종을 기억해 최빈값을 노린다.
export const LEARNERS={
  naive:{label:'기억 없음',...POLICIES.timer},
  learner:{label:'카운트별 기억',choose:g=>{
    // 지금 마운드에 있는 투수만 기억한다(교체는 화면에서 알 수 있다). 확신이 있을 때만 노린다: 네 번 이상 봤고 한 구종이 70% 이상.
    const seen={};for(const h of g.histories.bottom.slice(g.armChangedAt??0)){const k=h.balls+'-'+h.strikes;(seen[k]??={FF:0,SL:0,CH:0})[h.type]++;}
    const k=g.balls+'-'+g.strikes,m=seen[k];const n=m?m.FF+m.SL+m.CH:0,top=m?Object.entries(m).sort((a,b)=>b[1]-a[1])[0]:null;
    const target=n>=4&&top[1]/n>=.7?top[0]:'any';
    return {target,approach:'contact',location:'any'};
  },decide:POLICIES.timer.decide},
};

const tally=()=>({pa:0,pitches:0,swings:0,whiffs:0,fouls:0,bip:0,hits:0,runs:0,chases:0,takesInZone:0,games:0,cleared:0,guesses:0,guessHits:0});
const record=(t,e)=>{
  t.pitches++;if(e.terminal)t.pa++;if(e.choice.target!=='any'){t.guesses++;if(e.choice.target===e.pitch.t)t.guessHits++;}
  if(e.choice.action==='swing'){t.swings++;if(e.call==='W')t.whiffs++;else if(e.call==='F')t.fouls++;else{t.bip++;if(HITS.includes(e.result))t.hits++;}if(!inStrikeZone(e.pitch.x,e.pitch.z))t.chases++;}
  else if(inStrikeZone(e.pitch.x,e.pitch.z))t.takesInZone++;
  t.runs+=e.scored;
};
export function playStage(policy,stageId,seed){
  const g=new BattingGame(seed,stageId),t=tally();
  while(!g.done){const d=g.preparePitch(policy.choose(g));const {action,timing}=policy.decide(g,d);record(t,g.decidePitch(action,timing));}
  t.games=1;t.cleared=g.won?1:0;return t;
}
export function playFullGame(policy,seed){
  const g=new FullGame(seed),t=tally();
  while(!g.done){
    if(g.half==='top'){g.pitch({type:'FF',zone:'out',intent:'attack',release:0});}
    else{const d=g.preparePitch(policy.choose(g));const {action,timing}=policy.decide(g,d);record(t,g.decidePitch(action,timing));}
    if(!g.done&&g.outs>=3)g.advanceHalf();
  }
  t.games=1;t.cleared=g.won?1:0;t.runs=g.homeRuns;return t;
}
export function measure(policy,play,n,stage){
  const sum=tally();
  for(let seed=1;seed<=n;seed++){const t=play(policy,stage,seed*7919+stage);for(const k in sum)sum[k]+=t[k];}
  const pct=(a,b)=>b?100*a/b:0;
  return {contact:pct(sum.bip+sum.fouls,sum.swings),whiff:pct(sum.whiffs,sum.swings),foul:pct(sum.fouls,sum.swings),hit:pct(sum.hits,sum.bip),chase:pct(sum.chases,sum.swings),
    runsPerGame:sum.runs/sum.games,clear:pct(sum.cleared,sum.games),pitchesPerPa:sum.pa?sum.pitches/sum.pa:0,guessRate:pct(sum.guesses,sum.pitches),accuracy:pct(sum.guessHits,sum.guesses)};
}
export function ladder(n=400,stages=[0,1,2]){
  const out={};
  for(const [key,policy] of Object.entries(POLICIES))out[key]=Object.fromEntries(stages.map(s=>[s,measure(policy,(p,st,seed)=>playStage(p,st,seed),n,s)]));
  return out;
}
export function learning(n=100){
  return Object.fromEntries(Object.entries(LEARNERS).map(([k,p])=>[k,measure(p,(pol,st,seed)=>playFullGame(pol,seed),n,0)]));
}

if(process.argv[1]&&process.argv[1].endsWith('measure-batting.mjs')){
  const n=parseInt(process.argv[2]||'2000'),games=parseInt(process.argv[3]||'200');
  const row=(l,v,t,d=1)=>console.log(`${l.padEnd(26)}${v.toFixed(d).padStart(8)}   ${t}`);
  const target={random:'8 ~ 14',zone:'20 ~ 30',timer:'38 ~ 48',oracle:'50 ~ 60'};
  console.log(`스테이지 ${n}회 × 정책 4 × 스테이지 3`);
  const L=ladder(n);
  for(const [key,policy] of Object.entries(POLICIES)){
    const s=L[key];
    console.log(`\n[${policy.label}]`);
    row('컨택률 (%)',s[0].contact,'');row('헛스윙률 (%)',s[0].whiff,'');row('파울률 (%)',s[0].foul,'');row('타구 안타율 (%)',s[0].hit,'');row('존 밖 스윙률 (%)',s[0].chase,'');
    row('스테이지1 클리어 (%)',s[0].clear,target[key]);row('스테이지2 클리어 (%)',s[1].clear,'');row('스테이지3 클리어 (%)',s[2].clear,'');
  }
  console.log(`\n9이닝 ${games}경기 · 말 공격 정책 비교`);
  const G=learning(games);
  for(const [k,p] of Object.entries(LEARNERS)){row(`${p.label} 경기당 득점`,G[k].runsPerGame,'',2);row(`${p.label} 승률 (%)`,G[k].clear,'');}
  row('기억 − 없음 (득점 차)',G.learner.runsPerGame-G.naive.runsPerGame,'≥ 0',2);
  row('기억 정책 예측 시도 (%)',G.learner.guessRate,'10 ~ 25');row('기억 정책 예측 정확도 (%)',G.learner.accuracy,'≥ 55 (기저율 37)');
}
