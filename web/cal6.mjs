// 최종 보정: 격리 실험이 아니라 실제 시즌 결과를 목표로 맞춘다.
import fs from 'fs';
import { load } from './js/save.js';
import { BC } from './js/core/bip.js';
import { ADV } from './js/core/game.js';
const RAW = fs.readFileSync('data/league.json', 'utf8');
function season() {
  const g = load(JSON.parse(RAW));
  g.startSeason(); g.simToEnd();
  const s = g.season; let R=0,H=0,HR=0,AB=0,IP=0,K=0,BB=0;
  for (const b of s.bat.values()) { R+=b.r; H+=b.h; HR+=b.hr; AB+=b.ab; K+=b.k; BB+=b.bb; }
  for (const p of s.pit.values()) IP += p.outs/3;
  const G = g.L.teams.length * 144 / 2;
  return { rpg: R/G/2, avg: H/AB, hrpg: HR/G/2, k9: K/IP*9, bb9: BB/IP*9 };
}
const T = { rpg: 4.85, avg: 0.270, hrpg: 1.05 };
let m = season();
for (let it = 0; it < 30; it++) {
  // 손잡이 둘. 수비 범위는 안타 수를, 주루 적극성은 그 안타가 낳는 득점을 정한다.
  const dA = m.avg - T.avg;
  for (const t of ['GB','LD','FB','PU']) BC.hangK[t] = Math.max(.3, BC.hangK[t] + dA * 1.6);
  const dR = m.rpg - T.rpg;
  for (const k of ['b1_first_to_third','b1_second_scores','b2_first_scores',
                   'gb_r3_scores','sacfly_base','fb_r2_to_third','gb_r2_to_third'])
    ADV[k] = Math.max(0.02, Math.min(0.95, ADV[k] * (1 - dR * 0.055)));
  const dHr = m.hrpg - T.hrpg;
  BC.fenceLine += dHr * 2.2; BC.fenceCenter += dHr * 2.5;
  m = season();
  if (it % 5 === 4) console.log('  ' + (it+1) + '회  득점 ' + m.rpg.toFixed(2)
    + '  타율 ' + m.avg.toFixed(3) + '  hangK ' + BC.hangK.GB.toFixed(3));
}
let src = fs.readFileSync('js/core/bip.js', 'utf8');
for (const t of ['GB','LD','FB','PU'])
  src = src.replace(new RegExp('(hangK: \\{[^}]*\\b' + t + ': )[\\d.]+'), '$1' + BC.hangK[t].toFixed(3));
src = src.replace(/(\bfenceLine:\s*)[\d.]+/, '$1' + BC.fenceLine.toFixed(2));
src = src.replace(/(\bfenceCenter:\s*)[\d.]+/, '$1' + BC.fenceCenter.toFixed(2));
fs.writeFileSync('js/core/bip.js', src);
let gsrc = fs.readFileSync('js/core/game.js', 'utf8');
for (const k of ['b1_first_to_third','b1_second_scores','b2_first_scores',
                 'gb_r3_scores','sacfly_base','fb_r2_to_third','gb_r2_to_third'])
  gsrc = gsrc.replace(new RegExp('(\\b' + k + ':\\s*)[\\d.]+'), '$1' + ADV[k].toFixed(3));
fs.writeFileSync('js/core/game.js', gsrc);
const f = (x,d=2)=>x.toFixed(d).padStart(6);
console.log('시즌 보정 결과      우리    목표');
console.log('  득점/경기     ' + f(m.rpg) + '    4.85');
console.log('  타율         ' + f(m.avg,3) + '   0.270');
console.log('  홈런/경기     ' + f(m.hrpg) + '    1.05');
console.log('  K/9          ' + f(m.k9) + '    7.60');
console.log('  BB/9         ' + f(m.bb9) + '    3.90');
console.log('\n저장  hangK ' + ['GB','LD','FB','PU'].map(t=>BC.hangK[t].toFixed(3)).join('/')
  + '  담장 ' + BC.fenceLine.toFixed(1) + '/' + BC.fenceCenter.toFixed(1));
