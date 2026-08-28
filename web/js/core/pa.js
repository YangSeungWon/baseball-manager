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

export const K = 'K', BB = 'BB', HBP = 'HBP', OUT = 'OUT';
export const S1B = '1B', D2B = '2B', T3B = '3B', HR = 'HR';

export const NEUTRAL_DEF = { infield: 50, outfield: 50, catcherFraming: 50 };
export const NEUTRAL_PARK = { hrFactor: 0, hitFactor: 0 };
export const NEUTRAL_CTX = { fatigue: 0, timesThrough: 1 };

/** 한 타석을 시뮬레이션한다. [결과코드, 타구유형] 반환. */
export function simulatePA(bat, pit, dfn = NEUTRAL_DEF, park = NEUTRAL_PARK,
                           ctx = NEUTRAL_CTX, rng) {
  const sameHand = bat.bats === pit.throws;
  const tto = C.tto * (ctx.timesThrough - 1);

  const zs = z(pit.stuff) + C.fatigueStuff * ctx.fatigue;
  const zc = z(pit.command) + C.fatigueCommand * ctx.fatigue;
  const zm = z(pit.movement);

  // 1. 삼진
  const lk = logit(LG.k) + C.kStuff * zs + C.kCommand * zc
    + C.kContact * z(bat.contact) + C.kAvoidK * z(bat.avoid_k)
    + (sameHand ? C.platoonK : -C.platoonK * 0.5) - tto;
  let pK = invLogit(lk);

  // 2. 볼넷
  const lbb = logit(LG.bb) + C.bbDiscipline * z(bat.discipline)
    + C.bbCommand * zc + C.bbPower * z(bat.hr_power)
    + (sameHand ? C.platoonBb : -C.platoonBb * 0.5) + tto;
  let pBB = invLogit(lbb);
  let pHBP = LG.hbp;

  const total = pK + pBB + pHBP;
  if (total > 0.92) { const s = 0.92 / total; pK *= s; pBB *= s; pHBP *= s; }

  let r = rng.random();
  if (r < pK) return [K, null];
  r -= pK;
  if (r < pBB) return [BB, null];
  r -= pBB;
  if (r < pHBP) return [HBP, null];

  // 3. 타구 유형
  const gbShift = C.gbBat * z(bat.gb_tendency) + C.gbPit * z(pit.gb_tendency);
  const ldShift = C.ldContact * z(bat.contact);
  const wGb = LG.gb * Math.exp(gbShift);
  const wFb = LG.fb * Math.exp(-gbShift);
  const wPu = LG.pu * Math.exp(-gbShift * 0.5);
  const wLd = LG.ld * Math.exp(ldShift);
  const tot = wGb + wFb + wPu + wLd;
  r = rng.random() * tot;
  let bbt;
  if (r < wGb) bbt = 'GB';
  else if (r < wGb + wLd) bbt = 'LD';
  else if (r < wGb + wLd + wFb) bbt = 'FB';
  else bbt = 'PU';

  // 4. 홈런
  if (bbt === 'FB' || bbt === 'LD') {
    const base = bbt === 'FB' ? LG.hrPerFb : LG.hrPerFb * 0.35;
    const lhr = logit(base) + C.hrPower * z(bat.hr_power) + C.hrMovement * zm
      + park.hrFactor + (sameHand ? C.platoonHr : -C.platoonHr * 0.5) + tto;
    if (rng.random() < invLogit(lhr)) return [HR, bbt];
  }

  // 5. BABIP
  const baseBabip = { GB: LG.babipGb, LD: LG.babipLd, FB: LG.babipFb, PU: LG.babipPu }[bbt];
  let lb = logit(baseBabip) + park.hitFactor + C.babipPitSoft * zm;
  if (bbt === 'GB' || bbt === 'PU') {
    lb += C.babipInfDef * z(dfn.infield);
    if (bbt === 'GB') lb += C.babipSpeedGb * z(bat.speed);
  } else {
    lb += C.babipOfDef * z(dfn.outfield);
    lb += C.babipPowerLd * z(bat.gap_power);
  }
  if (rng.random() >= invLogit(lb)) return [OUT, bbt];

  // 6. 안타 종류
  const zsp = z(bat.speed), zgp = z(bat.gap_power);
  let p2, p3;
  if (bbt === 'GB') { p2 = 0.045 + 0.009 * zgp; p3 = 0.002 + 0.002 * zsp; }
  else if (bbt === 'LD') { p2 = 0.245 + 0.032 * zgp; p3 = 0.030 + 0.012 * zsp; }
  else if (bbt === 'FB') { p2 = 0.505 + 0.045 * zgp; p3 = 0.080 + 0.025 * zsp; }
  else { p2 = 0.010; p3 = 0; }
  r = rng.random();
  if (r < p3) return [T3B, bbt];
  if (r < p3 + p2) return [D2B, bbt];
  return [S1B, bbt];
}

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
