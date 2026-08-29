// 최종 보정. 격리 실험이 아니라 실제 시즌 결과를 목표로,
// 투구 엔진과 타구 파이프라인을 함께 맞춘다.
import fs from 'fs';
import { load } from './js/save.js';
import { BC } from './js/core/bip.js';
import { PC } from './js/core/pitch.js';
import { ADV } from './js/core/game.js';
const RAW = fs.readFileSync('data/league.json', 'utf8');
function season() {
  const g = load(JSON.parse(RAW));
  g.startSeason(); g.simToEnd();
  const s = g.season; let R=0,H=0,HR=0,AB=0,IP=0,K=0,BB=0,NP=0,ER=0;
  for (const b of s.bat.values()) { R+=b.r; H+=b.h; HR+=b.hr; AB+=b.ab; K+=b.k; BB+=b.bb; }
  for (const p of s.pit.values()) { IP += p.outs/3; NP += p.np; ER += p.er; }
  const G = g.L.teams.length * 144 / 2;
  return { rpg:R/G/2, avg:H/AB, hrpg:HR/G/2, k9:K/IP*9, bb9:BB/IP*9,
           npg:NP/G/2, era:ER/IP*9 };
}
const T = { rpg:4.85, avg:0.270, hrpg:1.05, k9:7.60, bb9:3.90 };
let m = season();
for (let it = 0; it < 26; it++) {
  // 겨냥점: 존 가까이 던지면 볼넷이 준다
  PC.aimEdge = Math.max(0.30, PC.aimEdge - (m.bb9 - T.bb9) * 0.022);
  // 컨택률: 낮추면 삼진이 는다
  // 삼진이 모자라면 컨택률을 낮춘다
  const dK = m.k9 - T.k9;
  PC.ctZBase = Math.min(.98, Math.max(.55, PC.ctZBase + dK * 0.0060));
  PC.ctOBase = Math.min(.95, Math.max(.35, PC.ctOBase + dK * 0.0090));
  // 수비 범위: 안타 수를 정한다
  for (const t of ['GB','LD','FB','PU']) BC.hangK[t] = Math.max(.3, BC.hangK[t] + (m.avg - T.avg) * 1.6);
  // 담장: 홈런
  BC.fenceLine += (m.hrpg - T.hrpg) * 2.2; BC.fenceCenter += (m.hrpg - T.hrpg) * 2.5;
  // 주루 적극성: 같은 안타에서 나오는 득점
  for (const k of ['b1_first_to_third','b1_second_scores','b2_first_scores',
                   'gb_r3_scores','sacfly_base','fb_r2_to_third','gb_r2_to_third'])
    ADV[k] = Math.max(0.02, Math.min(0.95, ADV[k] * (1 - (m.rpg - T.rpg) * 0.050)));
  m = season();
  if (it % 6 === 5) console.log('  ' + (it+1) + '회  득점 ' + m.rpg.toFixed(2)
    + ' 타율 ' + m.avg.toFixed(3) + ' K/9 ' + m.k9.toFixed(2) + ' BB/9 ' + m.bb9.toFixed(2));
}
let bs = fs.readFileSync('js/core/bip.js', 'utf8');
for (const t of ['GB','LD','FB','PU'])
  bs = bs.replace(new RegExp('(hangK: \\{[^}]*\\b' + t + ': )[\\d.]+'), '$1' + BC.hangK[t].toFixed(3));
bs = bs.replace(/(\bfenceLine:\s*)[\d.]+/, '$1' + BC.fenceLine.toFixed(2))
       .replace(/(\bfenceCenter:\s*)[\d.]+/, '$1' + BC.fenceCenter.toFixed(2));
fs.writeFileSync('js/core/bip.js', bs);
let ps = fs.readFileSync('js/core/pitch.js', 'utf8');
for (const k of ['aimEdge','ctZBase','ctOBase'])
  ps = ps.replace(new RegExp('(\\b' + k + ':\\s*)[-\\d.]+'), '$1' + PC[k].toFixed(5));
fs.writeFileSync('js/core/pitch.js', ps);
let gs = fs.readFileSync('js/core/game.js', 'utf8');
for (const k of ['b1_first_to_third','b1_second_scores','b2_first_scores',
                 'gb_r3_scores','sacfly_base','fb_r2_to_third','gb_r2_to_third'])
  gs = gs.replace(new RegExp('(\\b' + k + ':\\s*)[\\d.]+'), '$1' + ADV[k].toFixed(3));
fs.writeFileSync('js/core/game.js', gs);
const f = (x,d=2)=>x.toFixed(d).padStart(6);
console.log('\n시즌 검증        우리    KBO');
console.log('  득점/경기  ' + f(m.rpg) + '    4.85');
console.log('  타율      ' + f(m.avg,3) + '   0.270');
console.log('  홈런/경기  ' + f(m.hrpg) + '    1.05');
console.log('  K/9      ' + f(m.k9) + '    7.60');
console.log('  BB/9     ' + f(m.bb9) + '    3.90');
console.log('  평균자책   ' + f(m.era) + '    4.45');
console.log('  투구수/팀  ' + f(m.npg,0) + '     145');
