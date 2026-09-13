// 투수 편 정책 측정. 사람의 릴리스 오차를 흉내 낸 정책으로 수천 번 던져 전력·숨 고르기의 손익을 잰다.
//   node tools/measure-pitching.mjs [시도 수=2000]
// 릴리스: 정확한 순간(p=.5)을 노리되 손 떨림 σ 만큼 빗나간 p 에서 게이지 값을 읽는다 — 화면과 같은 수식(releaseMarker).
import {InningGame} from '../web/js/inning-game.js';
import {releaseMarker,pitchPressure,EFFORT} from '../web/js/pitch-control.js';

const lcg=seed=>{let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};
const gauss=r=>{const u=Math.max(1e-9,r()),v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
// 손 떨림: 초보 σ=.12, 숙련 σ=.05 (와인드업 진행도 단위).
export const HANDS={novice:.12,skilled:.05};
// 구종·코스 선택: 같은 구종 3연속 피함, 2스트라이크 전에는 존 승부, 2스트라이크면 유인구.
function pickPitch(g,r){
  const last=g.history.slice(-2).map(p=>p.type);
  let types=['FF','SL','CH'].filter(t=>!(last.length===2&&last[0]===t&&last[1]===t));
  const type=types[Math.floor(r()*types.length)],zone=['in','out','low','high'][Math.floor(r()*4)];
  return {type,zone,intent:g.strikes===2&&g.balls<3?'chase':'attack'};
}
export const POLICIES={
  normal:{label:'항상 보통',effort:()=>'normal'},
  max:{label:'항상 전력',effort:()=>'max'},
  putaway:{label:'2스트라이크만 전력',effort:g=>g.strikes===2?'max':'normal'},
  clutch:{label:'주자 득점권·3볼이면 숨 고르기, 2S 전력',effort:g=>g.strikes===2?'max':(g.balls===3||g.bases[1]||g.bases[2])?'calm':'normal'},
  calm:{label:'항상 숨 고르기',effort:()=>'calm'},
};
export function outing(policy,sigma,seed){
  const g=new InningGame(seed),r=lcg(seed*2654435761+7);const t={pitches:0,k:0,bb:0,hits:0,runs:0,won:0,maxUsed:0,releaseAbs:0,speed:0};
  while(!g.done&&g.count<80){
    const effort=policy.effort(g),pressure=pitchPressure(g.snapshot());
    const release=releaseMarker(.5+gauss(r)*sigma,pressure,effort);
    const e=g.pitch({...pickPitch(g,r),release,effort});
    t.pitches++;t.releaseAbs+=Math.abs(release);t.speed+=e.pitch.v;if(effort==='max')t.maxUsed++;
    if(e.result==='K')t.k++;if(e.result==='BB')t.bb++;if(['1B','2B','3B','HR'].includes(e.result))t.hits++;
  }
  t.runs=g.runs;t.won=g.won?1:0;return t;
}
export function measure(policy,sigma,n){
  const sum={pitches:0,k:0,bb:0,hits:0,runs:0,won:0,maxUsed:0,releaseAbs:0,speed:0,outings:0};
  for(let seed=1;seed<=n;seed++){const t=outing(policy,sigma,seed*7919);for(const k in t)sum[k]+=t[k];sum.outings++;}
  const pct=(a,b)=>b?100*a/b:0;
  return {win:pct(sum.won,sum.outings),runs:sum.runs/sum.outings,pitches:sum.pitches/sum.outings,k:pct(sum.k,sum.pitches),bb:pct(sum.bb,sum.pitches),hit:pct(sum.hits,sum.pitches),maxShare:pct(sum.maxUsed,sum.pitches),release:sum.releaseAbs/sum.pitches,speed:sum.speed/sum.pitches};
}
if(process.argv[1]&&process.argv[1].endsWith('measure-pitching.mjs')){
  const n=parseInt(process.argv[2]||'2000');
  const row=(l,v,t,d=1)=>console.log(`${l.padEnd(30)}${v.toFixed(d).padStart(8)}   ${t}`);
  for(const [hand,sigma] of Object.entries(HANDS)){
    console.log(`\n=== 손 떨림 ${hand} (σ ${sigma}) · 시도 ${n}회 ===`);
    for(const [key,policy] of Object.entries(POLICIES)){
      const m=measure(policy,sigma,n);
      console.log(`\n[${policy.label}]`);
      row('성공률 (%)',m.win,key==='normal'?'기준':'');row('실점',m.runs,'',2);row('투구 수',m.pitches,'');row('삼진/구 (%)',m.k,'');row('볼넷/구 (%)',m.bb,'');row('피안타/구 (%)',m.hit,'');
      row('전력 비중 (%)',m.maxShare,'');row('평균 |릴리스 오차|',m.release,'',3);row('평균 구속',m.speed,'');
    }
  }
}
