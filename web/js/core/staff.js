// 코치진.
//
// 코치는 선수의 진짜 능력을 알려주지 않는다. 알려주면 이 게임이 무너진다.
// 대신 결과를 바꾸거나(육성 속도, 부상), 우리가 보는 것의 노이즈를 줄인다.

import { personName } from './names.js';

export const ROLES = [
  { key:'bat',   label:'타격코치',   hint:'타자의 성장 속도' },
  { key:'pit',   label:'투수코치',   hint:'투수의 성장 속도' },
  { key:'train', label:'트레이닝코치', hint:'부상 빈도와 회복' },
  { key:'scout', label:'스카우트 팀장', hint:'보고서의 폭' },
  { key:'data',  label:'데이터 분석가', hint:'우리가 보는 숫자의 신뢰도' },
];
export const ROLE_KR = Object.fromEntries(ROLES.map(r => [r.key, r.label]));

const clamp = (v) => Math.max(20, Math.min(80, v));

/** 코치 한 명. 능력은 20~80 눈금 위에 있고, 여기엔 오차가 없다.
 *  코치는 뽑기 전에 이력이 보인다 — 선수와 다른 점이다. */
export function makeCoach(rng, role, level = 0, year = 2026) {
  const rating = clamp(rng.gauss(48 + level * 9, 9));
  const age = Math.round(rng.gauss(52, 8));
  return { id: Math.floor(rng.random() * 1e9), role,
    // 쉰 살 코치는 쉰 살에 흔했던 이름을 갖는다
    name: personName(rng, year - age),
    rating: Math.round(rating), age,
    salary: Math.round(price(rating) * 10) / 10, years: Math.round(rng.gauss(9, 5)) };
}
const price = (r) => Math.max(0.6, 0.6 + Math.pow(Math.max(0, r - 34) / 10, 2.1) * 0.72);

export function makeStaff(rng, level = 0, year = 2026) {
  const s = {};
  for (const r of ROLES) s[r.key] = makeCoach(rng, r.key, level, year);
  return s;
}

/** 뽑을 수 있는 사람들. 겨울마다 새로 채워진다. */
export function makeMarket(rng, n = 3, year = 2026) {
  const out = {};
  for (const r of ROLES)
    out[r.key] = Array.from({ length: n }, () => makeCoach(rng, r.key, rng.gauss(0, 0.6), year));
  return out;
}

const rate = (t, key) => {
  const c = t && t.staff && t.staff[key];
  return c ? c.rating : 50;
};

/** 육성 속도 배수. 평균 코치가 1.00, 20이면 0.76배, 80이면 1.24배. */
export const devMult = (t, kind) =>
  1.00 + 0.0080 * (rate(t, kind === 'P' ? 'pit' : 'bat') - 50);

/** 부상 확률 배수. 좋은 트레이닝 코치는 다치는 일을 줄인다. */
export const injuryMult = (t) => 1.00 - 0.0072 * (rate(t, 'train') - 50);

/** 회복 기간 배수. */
export const healMult = (t) => 1.00 - 0.0048 * (rate(t, 'train') - 50);

/** 스카우트 보고서의 폭. 좋은 팀장은 범위를 좁힌다. */
export const scoutMult = (t) => 1.00 - 0.0056 * (rate(t, 'scout') - 50);

/** 분석가. 되돌림에 쓰는 사전값이 얼마나 정확한가.
 *  못 미더운 분석가는 표본을 과신하거나 지나치게 깎는다. */
export function regressPrior(t) {
  const c = t && t.staff && t.staff.data;
  const r = c ? c.rating : 50;
  // 못 미더운 분석가는 표본을 과신하거나 지나치게 깎는다.
  // 같은 사람은 늘 같은 방향으로 틀린다 — 그래서 id 로 고정한다.
  const h = ((c ? c.id : 0) * 2654435761 >>> 0) / 4294967296 - 0.5;
  const err = (1 - (r - 20) / 60) * 1.1;
  return 260 * Math.exp(h * err);
}
export const dataTrust = (t) => Math.round((rate(t, 'data') - 20) / 60 * 100);

export const staffCost = (t) =>
  ROLES.reduce((a, r) => a + ((t.staff && t.staff[r.key]) ? t.staff[r.key].salary : 0), 0);
