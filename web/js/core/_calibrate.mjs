import { RNG } from './rng.js';
import { simulatePA, newBatter, newPitcher, K, BB, HBP, OUT, S1B, D2B, T3B, HR } from './pa.js';

function line() { return { pa:0,ab:0,h:0,b2:0,b3:0,hr:0,bb:0,k:0,hbp:0 }; }
function add(L, res) {
  L.pa++;
  if (res === K) { L.ab++; L.k++; }
  else if (res === BB) L.bb++;
  else if (res === HBP) L.hbp++;
  else if (res === OUT) L.ab++;
  else { L.ab++; L.h++; if (res===D2B) L.b2++; else if (res===T3B) L.b3++; else if (res===HR) L.hr++; }
}
function row(name, L) {
  const avg=L.h/L.ab, obp=(L.h+L.bb+L.hbp)/L.pa;
  const tb=(L.h-L.b2-L.b3-L.hr)+2*L.b2+3*L.b3+4*L.hr, slg=tb/L.ab;
  const babip=(L.h-L.hr)/(L.ab-L.k-L.hr);
  return `${name.padEnd(24)} ${avg.toFixed(3)} ${obp.toFixed(3)} ${slg.toFixed(3)} ${(obp+slg).toFixed(3)}  BB ${(L.bb/L.pa*100).toFixed(2)}%  K ${(L.k/L.pa*100).toFixed(2)}%  HR ${(L.hr/L.pa*100).toFixed(2)}%  BABIP ${babip.toFixed(3)}`;
}
function run(b, p, n, seed) {
  const rng = new RNG(seed); const L = line();
  for (let i=0;i<n;i++) add(L, simulatePA(b, p, undefined, undefined, undefined, rng)[0]);
  return L;
}
const N = 300000;
console.log('TARGET  (리그 평균 목표)  .255  .325  .407  .732   BB 8.43%  K 20.62%  HR 2.89%  BABIP .301  ← Python 결과');
const rng = new RNG(7); const L = line();
for (let i=0;i<N;i++) {
  add(L, simulatePA(newBatter({bats: i%3===0?'L':'R'}), newPitcher({throws: i%4===0?'L':'R'}),
                    undefined, undefined, undefined, rng)[0]);
}
console.log(row('리그 평균 vs 평균', L));
console.log('-'.repeat(110));
for (const g of [40,50,60,70,80]) {
  const b = newBatter({contact:g,avoid_k:g,discipline:g,gap_power:g,hr_power:g});
  console.log(row(`타자 ${g}`, run(b, newPitcher(), N, g)));
}
console.log('-'.repeat(110));
for (const g of [40,50,60,70,80]) {
  console.log(row(`투수 ${g}`, run(newBatter(), newPitcher({stuff:g,command:g,movement:g}), N, g+1)));
}
