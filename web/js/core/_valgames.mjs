import { RNG } from './rng.js';
import { makeLeague } from './roster.js';
import { Season } from './season.js';
const N = parseInt(process.argv[2] || '1500');
const rng = new RNG(99);
const teams = makeLeague(8, new RNG(1));
let R=0,H=0,HR=0,K=0,BB=0,OUTS=0,LOB=0,SB=0,CS=0,G=0, spOuts=[], nP=[], extra=0, shut=0, m1=0;
let done=0;
while (done < N) {
  const S = new Season(teams, 2030, 84, rng);
  while (!S.finished && done < N) {
    const res = S.playDay(null);
    for (const {hr, ar} of res) { done++; if (Math.abs(hr-ar)===1) m1++; }
  }
  for (const r of S.rec.values()) { R+=r.rs; G+=r.g; }
  for (const b of S.bat.values()) { H+=b.h; SB+=b.sb; CS+=b.cs; }
  for (const p of S.pit.values()) { HR+=p.hr; K+=p.k; BB+=p.bb; OUTS+=p.outs; }
  break;
}
const ip = OUTS/3;
console.log(`표본 ${done}경기 (팀-경기 ${G})\n`);
const row=(l,v,t)=>console.log(`${l.padEnd(20)}${v.toFixed(2).padStart(8)}   ${t}`);
row('팀당 득점', R/G, '4.3 ~ 4.8');
row('팀당 안타', H/G, '7.8 ~ 8.7');
row('팀당 홈런', HR/G, '1.0 ~ 1.3');
row('9이닝당 삼진', K/ip*9, '8.0 ~ 9.0');
row('9이닝당 볼넷', BB/ip*9, '3.0 ~ 3.6');
row('팀당 도루', SB/G, '0.5 ~ 0.9');
row('도루 성공률', SB/(SB+CS)*100, '70 ~ 80 (%)');
row('1점차 경기 비율', m1/done*100, '27 ~ 32 (%)');
