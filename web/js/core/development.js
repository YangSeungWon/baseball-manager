// 성장 / 노화 엔진. 능력마다 노화 곡선이 다르다는 것이 핵심.
export const BAT_ATTRS = ["contact","avoid_k","discipline","gap_power","hr_power","speed","fielding","arm"];
export const PIT_ATTRS = ["stuff","command","movement","stamina"];

// [정점나이, 성장계수, 하락계수]
export const AGING = {
  contact:[26.0,1.00,1.00], avoid_k:[27.0,0.85,0.80], discipline:[28.5,0.80,0.50],
  gap_power:[27.0,1.00,0.85], hr_power:[28.0,1.05,0.75], speed:[23.0,0.70,1.95],
  fielding:[25.0,0.75,1.25], arm:[24.0,0.65,0.85], stuff:[25.0,1.00,1.30], command:[28.5,0.90,0.55],
  movement:[27.0,0.90,0.75], stamina:[26.0,0.80,0.95],
};
// [정점보정, 하락보정, 성장보정]
export const PROFILES = {
  EarlyPeak:[-2.0,1.15,1.20], Normal:[0,1.00,1.00], LateBloomer:[2.5,0.95,0.80],
  SlowDecline:[1.0,0.70,0.95], RapidDecline:[-1.0,1.45,1.05],
};
const PROFILE_KEYS = Object.keys(PROFILES);
const PROFILE_W = [0.16,0.42,0.16,0.14,0.12];

const GROWTH_RATE = 0.165, DECLINE_BASE = 0.34, YOUTH_FLOOR = 17.0;
export const clamp = (v, lo=20, hi=80) => Math.max(lo, Math.min(hi, v));
export const attrsOf = (p) => (p.kind === 'B' ? BAT_ATTRS : PIT_ATTRS);

export function makeHidden(rng) {
  return {
    work_ethic: clamp(rng.gauss(50,14)), professionalism: clamp(rng.gauss(50,14)),
    consistency: clamp(rng.gauss(50,13)), injury_prone: clamp(rng.gauss(50,15)),
    ambition: clamp(rng.gauss(50,15)),
    aging_profile: rng.choices(PROFILE_KEYS, PROFILE_W),
    decline_rate: Math.max(0.45, rng.gauss(1.0,0.22)),
    dev_rate: Math.max(0.40, rng.gauss(1.0,0.26)),
    w_money: Math.max(0.15, rng.gauss(1.00,0.35)),
    w_winning: Math.max(0.05, rng.gauss(0.55,0.30)),
    w_playtime: Math.max(0.05, rng.gauss(0.45,0.25)),
    w_loyalty: Math.max(0.00, rng.gauss(0.18,0.20)),
  };
}

// 포지션별 체격 경향. 포수는 다부지고, 유격수·중견수는 날렵하고, 1루·지명은 크다.
const BODY = { C:[-2.0, 3.0], '1B':[3.0, 3.0], '2B':[-2.5, -2.0], '3B':[1.0, 1.0],
  SS:[-2.0, -2.5], LF:[1.0, 0.5], CF:[-0.5, -2.0], RF:[2.0, 1.0], DH:[3.0, 4.5] };

/** 몸무게는 현재 능력치를 따라간다. 파워가 붙으면 몸이 커지고 발이 빠르면 마른다.
 *  18세 때 한 번만 계산하면 파워 75로 자란 거포가 소년 체형으로 남는다. */
export function updateWeight(p) {
  if (!p.height) return;
  const ip = p.kind === 'P';
  const wAdj = ip ? -3.0 : (BODY[p.position] || [0, 0])[1];
  const power = ip ? 50 : p.hr_power, speed = ip ? 50 : p.speed;
  p.weight = Math.round(Math.max(65, Math.min(128,
    (p.height - 100) * 1.07 + 3 + wAdj + (power - 50) * 0.40 - (speed - 50) * 0.26)));
}

export const bodyAdj = (p) => (p.kind === 'P' ? [3.0, -3.0] : (BODY[p.position] || [0, 0]));

export function develop(p, rng, playingTime = 1.0) {
  const h = p.hidden, prof = PROFILES[h.aging_profile];
  const ethic = 0.65 + 0.7 * (h.work_ethic / 50);
  const pt = 0.55 + 0.45 * Math.min(playingTime, 1.3);
  const driftSd = p.age <= 22 ? 2.4 : (p.age <= 26 ? 1.4 : 0.7);
  const attrs = attrsOf(p);
  for (const a of attrs) p.pot[a] = clamp(p.pot[a] + rng.gauss(0.15*(ethic-1), driftSd));

  let yearMult = 1.0;
  const roll = rng.random();
  if (roll < 0.06 && p.age <= 25) yearMult = 2.3;
  else if (roll < 0.14) yearMult = 0.15;

  for (const a of attrs) {
    const peak = AGING[a][0] + prof[0];
    const gm = AGING[a][1], dm = AGING[a][2];
    let cur = p[a];
    if (p.age < peak) {
      const youth = Math.max(0, Math.min(1, (peak - p.age) / Math.max(1, peak - YOUTH_FLOOR)));
      const gap = p.pot[a] - cur;
      const rate = GROWTH_RATE * youth * gm * prof[2] * ethic * pt * h.dev_rate
        * yearMult * rng.uniform(0.6, 1.4);
      cur += gap * Math.min(rate, 0.75);
      if (gap < 0) cur += gap * 0.05;
    } else {
      const yrs = p.age - peak;
      let d = DECLINE_BASE * dm * prof[1] * h.decline_rate * (1 + 0.17*yrs) * rng.uniform(0.45,1.55);
      d *= (1.25 - 0.25 * (h.professionalism / 50));
      cur -= d;
    }
    p[a] = clamp(cur);
  }
  // 20세까지는 키도 조금 더 자란다
  if (p.age <= 20 && p.height) p.height = Math.min(199, p.height + (rng.random() < 0.55 ? 1 : 0));
  updateWeight(p);
  p.age += 1;
}

const zz = (v) => (v - 50) / 10;
export function overall(p) {
  let s;
  if (p.kind === 'B') {
    s = (0.30*zz(p.contact) + 0.30*zz(p.hr_power) + 0.22*zz(p.discipline)
      + 0.10*zz(p.gap_power) + 0.10*zz(p.avoid_k) + 0.09*zz(p.speed)
      + 0.16*zz(p.fielding)) / 1.10;
  } else {
    s = (0.46*zz(p.stuff) + 0.30*zz(p.command) + 0.24*zz(p.movement)
      + 0.12*zz(p.stamina)) / 1.06;
  }
  return clamp(50 + 10 * s);
}

export function potentialOverall(p) {
  const saved = {};
  for (const a of attrsOf(p)) { saved[a] = p[a]; p[a] = Math.max(p[a], p.pot[a]); }
  const v = overall(p);
  for (const a in saved) p[a] = saved[a];
  return v;
}

const AGE_RETIRE = {23:0,24:0,25:.001,26:.002,27:.004,28:.006,29:.010,30:.016,
  31:.026,32:.042,33:.070,34:.110,35:.165,36:.230,37:.310,38:.400,39:.500,
  40:.600,41:.700,42:.800,43:.900};

export function retireProb(p, playingTime = 1.0) {
  if (p.age < 23) return 0;
  if (p.age >= 44) return 1;
  let base = AGE_RETIRE[p.age] ?? 0.9;
  const ovr = overall(p);
  if (ovr < 41 && p.age >= 26) base += 0.30 + 0.06 * (41 - ovr);
  else if (ovr < 45 && p.age >= 30) base += 0.14;
  if (playingTime < 0.25 && p.age >= 31) base += 0.12;
  if (ovr >= 60) base *= 0.45;
  base *= (1.15 - 0.30 * ((p.hidden.ambition ?? 50) / 100));
  return Math.max(0, Math.min(1, base));
}
