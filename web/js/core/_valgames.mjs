// 경기 엔진 검증. 실제로 배포되는 세계에서 재는 것이 목적이라
// League 를 그대로 세운다 — 코치진 · 구단 재정 · 구장 규격이 다 붙은 상태.
//   node js/core/_valgames.mjs [경기수]
import { League } from './league.js';
import { Season } from './season.js';

const N = parseInt(process.argv[2] || '1500');
let R=0,H=0,AB=0,HR=0,K=0,BB=0,OUTS=0,SB=0,CS=0,G=0, m1=0, done=0, seed=99;

// 시즌마다 리그를 새로 세운다. 같은 로스터로 계속 돌리면 부상이 쌓여
// 해가 갈수록 라인업이 헐거워진다 — 재는 대상이 표류한다.
while (done < N) {
  const L = new League(10, 2030, 144, seed++);
  const S = new Season(L.teams, 2030, 144, L.rng);
  while (!S.finished && done < N) {
    for (const {hr, ar} of S.playDay(null)) { done++; if (Math.abs(hr-ar)===1) m1++; }
  }
  for (const r of S.rec.values()) { R+=r.rs; G+=r.g; }
  for (const b of S.bat.values()) { H+=b.h; AB+=b.ab; SB+=b.sb; CS+=b.cs; }
  for (const p of S.pit.values()) { HR+=p.hr; K+=p.k; BB+=p.bb; OUTS+=p.outs; }
}

const ip = OUTS/3;
console.log(`표본 ${done}경기 (팀-경기 ${G})\n`);
const row = (l, v, t, d=2) =>
  console.log(`${l.padEnd(20)}${v.toFixed(d).padStart(8)}   ${t}`);
row('리그 타율', H/AB, '.251 ~ .259', 3);
row('팀당 득점', R/G, '4.3 ~ 4.8');
row('팀당 안타', H/G, '7.8 ~ 8.7');
row('팀당 홈런', HR/G, '1.0 ~ 1.3');
row('9이닝당 삼진', K/ip*9, '8.0 ~ 9.0');
row('9이닝당 볼넷', BB/ip*9, '3.0 ~ 3.6');
row('팀당 도루', SB/G, '0.5 ~ 0.9');
row('도루 성공률', SB/(SB+CS)*100, '70 ~ 80 (%)');
row('1점차 경기 비율', m1/done*100, '27 ~ 32 (%)');
