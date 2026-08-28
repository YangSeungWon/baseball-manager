// 타석 확률 엔진. 모든 확률은 로그오즈 공간에서 가산 합성한다.
// 계수 표가 곧 게임의 밸런스 시트다. (proto/DESIGN_PA.md 참조)

export const LG = {
  bb: 0.0850, k: 0.2000, hbp: 0.0100,
  gb: 0.4400, ld: 0.2100, fb: 0.2800, pu: 0.0700,
  hrPerFb: 0.1210,
  babipGb: 0.2450, babipLd: 0.7150, babipFb: 0.1420, babipPu: 0.0150,
};

export const C = {
  kStuff: 0.225, kContact: -0.150, kAvoidK: -0.150, kCommand: 0.05,
  bbDiscipline: 0.275, bbCommand: -0.205, bbPower: 0.06,
  hrPower: 0.330, hrMovement: -0.185,
  gbBat: 0.30, gbPit: 0.34, ldContact: 0.08,
  babipSpeedGb: 0.145, babipPowerLd: 0.05,
  babipInfDef: -0.072, babipOfDef: -0.078, babipPitSoft: -0.06,
  platoonK: 0.10, platoonBb: -0.06, platoonHr: -0.12,
  fatigueStuff: -0.90, fatigueCommand: -0.70, tto: 0.045,
};

export const z = (r) => (r - 50) / 10;
export const logit = (p) => Math.log(p / (1 - p));
export const invLogit = (x) => 1 / (1 + Math.exp(-x));

export const K = 'K', BB = 'BB', HBP = 'HBP', OUT = 'OUT', ERR = 'E';
export const S1B = '1B', D2B = '2B', T3B = '3B', HR = 'HR';

export const POS_KR = { P:'투수', C:'포수', '1B':'1루수', '2B':'2루수', '3B':'3루수',
                        SS:'유격수', LF:'좌익수', CF:'중견수', RF:'우익수' };

// 타구 방향. 우타자 기준 중립 분포이며, 당겨치는 정도에 따라 좌우로 기운다.
const DIR = {
  GB: { P:.09, C:.02, '1B':.15, '2B':.24, '3B':.20, SS:.30 },
  LD: { P:.02, '1B':.05, '2B':.07, '3B':.06, SS:.07, LF:.25, CF:.23, RF:.25 },
  FB: { '1B':.01, '2B':.01, '3B':.01, SS:.01, LF:.31, CF:.34, RF:.31 },
  PU: { P:.05, C:.22, '1B':.20, '2B':.18, '3B':.18, SS:.17 },
};
const PULL_SIDE = { '3B':1, SS:1, LF:1, '1B':-1, '2B':-1, RF:-1 };

/** 타구 방향을 뽑는다. 거포일수록 당겨친다. */
export function batDirection(bbt, bat, rng) {
  const w = DIR[bbt];
  const hand = bat.bats === 'L' ? -1 : 1;          // 우타는 좌측, 좌타는 우측으로 당긴다
  const pull = Math.max(.05, Math.min(.42, .20 + .06 * z(bat.hr_power) - .04 * z(bat.contact)));
  let tot = 0; const acc = [];
  for (const pos in w) {
    const side = (PULL_SIDE[pos] || 0) * hand;
    tot += w[pos] * (1 + side * pull);
    acc.push([pos, tot]);
  }
  const r = rng.random() * tot;
  for (const [pos, c] of acc) if (r < c) return pos;
  return acc[acc.length - 1][0];
}

// 아웃이 될 타구를 놓치는 비율. 땅볼이 압도적으로 많다.
const ERR_BASE = { GB: .052, LD: .016, FB: .009, PU: .012 };

/** 투구수와 볼카운트. 결과를 알고 있으므로 그 결과와 모순되지 않는
 *  카운트만 만든다. 평균 3.9구 (K 5.0 / BB 5.6 / 인플레이 3.4). */
const trunc = (rng, mean, max) => {
  let n = 0; const p = 1 / (1 + mean);
  while (n < max && rng.random() > p) n++;
  return n;
};
export function countFor(res, rng) {
  if (res === K)  { const b = trunc(rng, 1.3, 3), f = trunc(rng, .75, 6);
                    return { b, s: 3, np: 3 + b + f, f }; }
  if (res === BB) { const s = trunc(rng, 1.1, 2), f = trunc(rng, .50, 6);
                    return { b: 4, s, np: 4 + s + f, f }; }
  const b = trunc(rng, 1.0, 3), s = trunc(rng, .8, 2), f = trunc(rng, .6, 6);
  return { b, s, np: 1 + b + s + f, f };
}

export const NEUTRAL_DEF = { infield: 50, outfield: 50, catcherFraming: 50, byPos: null };
export const NEUTRAL_PARK = { hrFactor: 0, hitFactor: 0 };
export const NEUTRAL_CTX = { fatigue: 0, timesThrough: 1 };

// simulatePA 는 pitch.js + bip.js 파이프라인으로 대체되었다.
// 남은 것은 계수표(LG, C)와 상수들로, 새 엔진이 그대로 쓴다.

/** 기본값이 채워진 타자/투수. 생성기가 이 위에 값을 얹는다. */
export const newBatter = (o = {}) => ({
  contact: 50, avoid_k: 50, discipline: 50, gap_power: 50, hr_power: 50,
  speed: 50, gb_tendency: 50, fielding: 50, bats: 'R', position: 'DH',
  pid: 0, name: '', kind: 'B', ...o,
});

export const newPitcher = (o = {}) => ({
  stuff: 50, command: 50, movement: 50, gb_tendency: 50, stamina: 50,
  throws: 'R', role: 'SP', pid: 0, name: '', kind: 'P', ...o,
});
