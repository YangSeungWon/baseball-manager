// 투구 단위 타석 엔진.
//
//   볼카운트 → 투수의 존 설정 → 타자의 스윙 판단 → 컨택 → 타구 질
//
// 카운트는 로그용이 아니다. 유리한 카운트의 투수는 존을 넓게 쓰고,
// 몰린 타자는 나쁜 공에 손을 대며, 거기서 나온 타구는 약하다.
// K%·BB%·P/PA는 이 과정의 결과지 맞춰 넣은 값이 아니다.

import { z, logit, invLogit, K, BB, HBP } from './pa.js';

export const PC = {
  // 존 진입률. 몰아붙일 땐 빼고, 몰렸을 땐 넣어야 한다.
  zoneBase: 0.490, zoneCommand: 0.028, zoneStuff: -0.010,
  zoneTwoStrike: -0.128, zoneThreeBall: 0.180, zoneBehind: 0.052,

  // 스트라이크존 스윙률
  swZBase: 0.68012, swZDisc: -0.018, swZTwoStrike: 0.215,
  swZThreeBall: -0.165, swZFirst: -0.145,

  // 볼 스윙률(체이스)
  swOBase: 0.27502, swODisc: -0.062, swOStuff: 0.024, swOMove: 0.018,
  swOTwoStrike: 0.205, swOThreeBall: -0.135, swOFirst: -0.085,

  // 컨택률
  ctZBase: 0.90916, ctOBase: 0.68571,
  ctContact: 0.030, ctAvoidK: 0.024, ctStuff: -0.040, ctMove: -0.014,
  ctTwoStrike: -0.032,

  // 컨택 중 파울 비율
  foulBase: 0.37818, foulTwoStrike: 0.220, foulOut: 0.155, foulContact: -0.014,

  // 파울도 잡히면 아웃이다. 몰린 타자가 커트한 타구가 떠오르면 삼진 대신
  // 파울플라이로 타석이 끝난다. 이게 없으면 그 몫을 삼진이 떠안는다.
  foulCatchable: 0.0290, foulCatchBase: 0.760, foulCatchDef: 0.045, foulDropErr: 0.16,

  hbpPerBall: 0.00775,

  // 타구 질(0~1). 존 안에서, 유리한 카운트에서 강하게 맞는다.
  qZone: 0.105, qOut: -0.175, qAhead: 0.095, qTwoStrike: -0.115, qSd: 0.175,
};

export const TALLY = { pitches:0, zone:0, swing:0, contact:0, ball:0, called:0, whiff:0, foul:0, inplay:0, foulout:0 };

const clamp = (x, lo = 0.01, hi = 0.99) => Math.max(lo, Math.min(hi, x));

export const FOUL_OUT = 'FO', FOUL_ERR = 'FE';
// 파울 뜬공이 향하는 곳. 포수 뒤와 1·3루 파울 지역이 대부분이다.
const FOUL_POS = ['C', '1B', '3B', 'LF', 'RF'];
const FOUL_W = [0.38, 0.62, 0.86, 0.93, 1.00];
function pickFoul(rng) {
  const r = rng.random();
  for (let i = 0; i < FOUL_W.length; i++) if (r < FOUL_W[i]) return FOUL_POS[i];
  return 'C';
}

/** 한 타석을 공 하나씩 굴린다.
 *  @returns {{res, b, s, np, f, quality, inZone}} 타석 결과와 그때의 카운트 */
export function playCount(bat, pit, ctx, rng) {
  const zs = z(pit.stuff) + ctx.cStuff, zc = z(pit.command) + ctx.cCommand;
  const zm = z(pit.movement);
  const zd = z(bat.discipline), zk = z(bat.avoid_k), zct = z(bat.contact);

  let b = 0, s = 0, np = 0, f = 0;
  for (;;) {
    np++;
    const two = s >= 2, three = b >= 3, first = np === 1;

    // 1. 투수 — 존에 넣을 것인가
    const pZone = clamp(PC.zoneBase + PC.zoneCommand * zc + PC.zoneStuff * zs
      + (two ? PC.zoneTwoStrike : 0) + (three ? PC.zoneThreeBall : 0)
      + (b - s >= 2 ? PC.zoneBehind : 0), 0.20, 0.88);
    const inZone = rng.random() < pZone;
    TALLY.pitches++; if (inZone) TALLY.zone++;

    // 2. 타자 — 칠 것인가
    const pSwing = inZone
      ? clamp(PC.swZBase + PC.swZDisc * zd + (two ? PC.swZTwoStrike : 0)
          + (three ? PC.swZThreeBall : 0) + (first ? PC.swZFirst : 0))
      : clamp(PC.swOBase + PC.swODisc * zd + PC.swOStuff * zs + PC.swOMove * zm
          + (two ? PC.swOTwoStrike : 0) + (three ? PC.swOThreeBall : 0)
          + (first ? PC.swOFirst : 0));

    if (rng.random() >= pSwing) {                       // 지켜봤다
      if (inZone) TALLY.called++; else TALLY.ball++;
      if (inZone) { if (++s >= 3) return { res: K, b, s, np, f }; }
      else {
        if (rng.random() < PC.hbpPerBall) return { res: HBP, b, s, np, f };
        if (++b >= 4) return { res: BB, b, s, np, f };
      }
      continue;
    }

    // 3. 방망이에 맞았는가
    const pCt = clamp((inZone ? PC.ctZBase : PC.ctOBase)
      + PC.ctContact * zct + PC.ctAvoidK * zk + PC.ctStuff * zs + PC.ctMove * zm
      + (two ? PC.ctTwoStrike : 0));
    TALLY.swing++;
    if (rng.random() >= pCt) {                          // 헛스윙
      TALLY.whiff++;
      if (++s >= 3) return { res: K, b, s, np, f };
      continue;
    }

    // 4. 파울인가 인플레이인가
    const pFoul = clamp(PC.foulBase + (two ? PC.foulTwoStrike : 0)
      + (inZone ? 0 : PC.foulOut) + PC.foulContact * zct);
    TALLY.contact++;
    if (rng.random() < pFoul) {
      TALLY.foul++; f++;
      // 뜰 수 있는 파울인가. 포수와 코너 야수의 몫이다.
      if (rng.random() < PC.foulCatchable) {
        const dir = pickFoul(rng);
        const fd = ctx.byPos && ctx.byPos[dir];
        const pCatch = clamp(PC.foulCatchBase + PC.foulCatchDef * z(fd ? fd.fielding : 50), .25, .97);
        if (rng.random() < pCatch) { TALLY.foulout++; return { res: FOUL_OUT, b, s, np, f, dir }; }
        if (rng.random() < PC.foulDropErr) return { res: FOUL_ERR, b, s, np, f, dir };
      }
      if (s < 2) s++; continue;
    }
    TALLY.inplay++;

    // 5. 인플레이. 이 공의 카운트와 코스가 타구의 질을 정한다.
    const quality = clamp(0.5 + (inZone ? PC.qZone : PC.qOut)
      + (b - s >= 1 ? PC.qAhead : 0) + (two ? PC.qTwoStrike : 0)
      + rng.gauss(0, PC.qSd), 0.02, 0.98);
    return { res: 'IP', b, s, np, f, quality, inZone };
  }
}
