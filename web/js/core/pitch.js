// 투구 단위 타석 엔진. 판정은 ABS(자동 볼판정)를 전제한다.
//
// 그래서 심판 편차도, 카운트에 따른 존 확대도, 포수 프레이밍도 없다.
// 존은 좌표상의 딱딱한 경계다. 대신 ABS 규정대로 존의 높이가
// 타자 신장에 비례한다 — 작은 타자는 존이 작고 볼넷을 더 얻는다.
//
//   구종·구속 선택 → 존 어디에 꽂혔는가 → 타자의 스윙 판단 → 컨택 → 타구 질
//
// 볼카운트는 로그가 아니다. 유리한 카운트의 투수는 존 바깥을 겨냥하고,
// 몰린 타자는 존에서 먼 공에도 손을 댄다. 거기서 나온 타구는 약하다.
// K%·BB%·P/PA는 이 과정의 결과지 맞춰 넣은 값이 아니다.

import { z, K, BB, HBP } from './pa.js';

/** 구종. velo는 직구 대비 구속비, whiff는 헛스윙 유발, gb는 땅볼 유도,
 *  ctl은 제구 난이도(낮을수록 흔들린다), dirt는 원바운드가 되는 정도. */
export const PITCH = {
  FF: { kr:'포심',     velo:1.00, whiff:1.00, gb:0.90, ctl:1.00, dirt:0.20 },
  SI: { kr:'투심',     velo:0.97, whiff:0.80, gb:1.42, ctl:1.02, dirt:0.35 },
  FC: { kr:'커터',     velo:0.94, whiff:1.10, gb:1.06, ctl:0.97, dirt:0.35 },
  SL: { kr:'슬라이더', velo:0.87, whiff:1.34, gb:1.06, ctl:0.92, dirt:0.70 },
  CU: { kr:'커브',     velo:0.77, whiff:1.26, gb:1.22, ctl:0.86, dirt:0.85 },
  CH: { kr:'체인지업', velo:0.86, whiff:1.22, gb:1.24, ctl:0.93, dirt:0.65 },
  FS: { kr:'포크',     velo:0.85, whiff:1.40, gb:1.30, ctl:0.84, dirt:1.00 },
  KN: { kr:'너클볼',   velo:0.66, whiff:1.18, gb:1.00, ctl:0.60, dirt:1.10 },
};
export const kmh = (p, type) =>
  Math.round((143 + (z(p.velo ?? 50)) * 5.5) * PITCH[type].velo);

export const PC = {
  // 겨냥. 존 반폭을 1로 둔 좌표. 몰아붙일 땐 바깥을, 몰렸을 땐 한복판을 본다.
  aimEdge: 0.63619, aimTwoK: 1.45, aimThreeK: 0.35,   // 유인구·한복판은 겨냥점의 배수
  scatterBase: 0.60, scatterCommand: -0.115,

  // 스트라이크존 스윙률
  swZBase: 0.95000, swZDisc: -0.018, swZTwoStrike: 0.215,
  swZThreeBall: -0.165, swZFirst: -0.62673, swZ2nd: 0.68090,   // 2구는 초구 자제의 절반쯤

  // 존 밖 스윙률(체이스). 존에서 멀수록 급격히 떨어진다.
  swOBase: 0.52897, swODecay: 1.05, swODisc: -0.062, swOStuff: 0.024, swOMove: 0.018,
  swOTwoStrike: 0.205, swOThreeBall: -0.135, swOFirst: -0.38857,

  // 컨택률
  ctZBase: 0.93017, ctOBase: 0.72696, ctDecay: 0.30,
  ctContact: 0.030, ctAvoidK: 0.024, ctStuff: -0.040, ctMove: -0.014,
  ctWhiff: -0.115, ctTwoStrike: -0.032,

  // 컨택 중 파울 비율
  foulBase: 0.41683, foulTwoStrike: 0.220, foulOut: 0.155, foulContact: -0.014,

  // 파울도 잡히면 아웃이다. 이게 없으면 그 몫을 삼진이 떠안는다.
  foulCatchable: 0.0290, foulCatchBase: 0.760, foulCatchDef: 0.045, foulDropErr: 0.16,

  hbpPerBall: 0.00749, hbpInside: 1.6,

  // 타구 질(0~1). 존 한복판에서, 유리한 카운트에서 강하게 맞는다.
  qCenter: 0.150, qEdge: -0.175, qAhead: 0.095, qTwoStrike: -0.115, qSd: 0.175,

  // 원바운드. 포수가 막지 못하면 폭투나 포일이 된다.
  dirtBase: 0.760, dirtLow: 0.85,
};

export const TALLY = { pitches:0, zone:0, swing:0, contact:0, ball:0, called:0,
                       whiff:0, foul:0, inplay:0, foulout:0, dirt:0 };

const clamp = (x, lo = 0.01, hi = 0.99) => Math.max(lo, Math.min(hi, x));

export const FOUL_OUT = 'FO', IN_PLAY = 'IP';
const FOUL_POS = ['C', '1B', '3B', 'LF', 'RF'];
const FOUL_W = [0.38, 0.62, 0.86, 0.93, 1.00];
function pickFoul(rng) {
  const r = rng.random();
  for (let i = 0; i < FOUL_W.length; i++) if (r < FOUL_W[i]) return FOUL_POS[i];
  return 'C';
}

const DEF_ARSENAL = ['FF', 'SL', 'CH'];
/** 카운트에 맞는 구종. 몰면 변화구, 몰리면 직구다. */
function choosePitch(arsenal, b, s, rng) {
  const a = arsenal && arsenal.length ? arsenal : DEF_ARSENAL;
  const off = a.slice(1);
  if (!off.length) return a[0];
  const wantOff = s >= 2 ? 0.60 : (b >= 3 ? 0.20 : 0.42);
  return rng.random() < wantOff ? off[Math.floor(rng.random() * off.length)] : a[0];
}

/** 한 타석을 공 하나씩 굴린다. */
export function playCount(bat, pit, ctx, rng) {
  const zs = z(pit.stuff) + ctx.cStuff, zc = z(pit.command) + ctx.cCommand;
  const zm = z(pit.movement);
  const cb = ctx.cBat || 0;                 // 승부처에서의 기질
  const zd = z(bat.discipline) + cb * 0.5, zk = z(bat.avoid_k) + cb, zct = z(bat.contact) + cb;
  const arsenal = pit.arsenal;
  // ABS 존 높이는 신장에 비례한다 (상단 56.35%, 하단 27.64%).
  // 리그 평균 키를 1로 두고 그 비율만 쓴다.
  const zH = Math.max(0.86, Math.min(1.14, (bat.height || 182) / 182));

  let b = 0, s = 0, np = 0, f = 0;
  const events = [];                                   // 폭투·포일 등 타석 밖 사건
  for (;;) {
    np++;
    const two = s >= 2, three = b >= 3;
    // 이른 카운트일수록 지켜본다. 초구가 가장 강하고 2구가 그다음이다.
    const early = np === 1 ? 1 : (np === 2 ? PC.swZ2nd : 0);
    const type = choosePitch(arsenal, b, s, rng);
    const P = PITCH[type];

    // 1. 겨냥과 제구. 존 반폭을 1로 둔 좌표계.
    const aim = PC.aimEdge * (two ? PC.aimTwoK : three ? PC.aimThreeK : 1);
    const sc = Math.max(0.22, (PC.scatterBase + PC.scatterCommand * zc) / P.ctl);
    const px = rng.gauss((rng.random() < 0.5 ? -1 : 1) * aim, sc);
    const pz = rng.gauss((rng.random() < 0.5 ? -1 : 1) * aim * 0.72, sc);
    const inZone = Math.abs(px) <= 1 && Math.abs(pz) <= zH;
    // 존 경계에서 얼마나 벗어났는가
    const out = Math.hypot(Math.max(0, Math.abs(px) - 1), Math.max(0, Math.abs(pz) - zH));
    const mid = Math.hypot(px, pz);                    // 한복판에서의 거리
    TALLY.pitches++; if (inZone) TALLY.zone++;

    // 원바운드 — 낮게 빠진 변화구
    const dirt = !inZone && pz < -zH && rng.random() < PC.dirtBase * P.dirt
      * (1 + PC.dirtLow * Math.max(0, -pz - zH));

    // 2. 타자 — 칠 것인가. 존 밖은 멀수록 급격히 참는다.
    const pSwing = inZone
      ? clamp(PC.swZBase + PC.swZDisc * zd + (two ? PC.swZTwoStrike : 0)
          + (three ? PC.swZThreeBall : 0) + PC.swZFirst * early)
      : clamp((PC.swOBase + PC.swODisc * zd + PC.swOStuff * zs + PC.swOMove * zm
          + (two ? PC.swOTwoStrike : 0) + (three ? PC.swOThreeBall : 0)
          + PC.swOFirst * early) * Math.exp(-PC.swODecay * out));

    if (rng.random() >= pSwing) {                      // 지켜봤다
      if (inZone) { TALLY.called++; if (++s >= 3) return done(K); }
      else {
        TALLY.ball++;
        if (dirt) { TALLY.dirt++; events.push({ e: 'dirt', type, wild: pz < -1.02 }); }
        else if (rng.random() < PC.hbpPerBall * (out > 1.2 ? PC.hbpInside : 1))
          return done(HBP);
        if (++b >= 4) return done(BB);
      }
      continue;
    }

    // 3. 방망이에 맞았는가. 존에서 멀수록, 헛스윙 잘 나는 구종일수록 못 맞춘다.
    TALLY.swing++;
    const pCt = clamp(((inZone ? PC.ctZBase : PC.ctOBase)
      + PC.ctContact * zct + PC.ctAvoidK * zk + PC.ctStuff * zs + PC.ctMove * zm
      + PC.ctWhiff * (P.whiff - 1) + (two ? PC.ctTwoStrike : 0))
      * Math.exp(-PC.ctDecay * out));
    if (rng.random() >= pCt) {
      TALLY.whiff++;
      if (++s >= 3) return done(K, { swinging: true, dirt, wild: pz < -1.02 });
      continue;
    }

    // 4. 파울인가 인플레이인가
    TALLY.contact++;
    const pFoul = clamp(PC.foulBase + (two ? PC.foulTwoStrike : 0)
      + (inZone ? 0 : PC.foulOut) + PC.foulContact * zct);
    if (rng.random() < pFoul) {
      TALLY.foul++; f++;
      if (rng.random() < PC.foulCatchable * (ctx.foulTerr ?? 1)) {
        const dir = pickFoul(rng);
        const fd = ctx.byPos && ctx.byPos[dir];
        const pCatch = clamp(PC.foulCatchBase
          + PC.foulCatchDef * z(fd ? fd.fielding : 50), .25, .97);
        if (rng.random() < pCatch) { TALLY.foulout++; return done(FOUL_OUT, { dir }); }
      }
      if (s < 2) s++; continue;
    }

    // 5. 인플레이. 이 공의 코스와 카운트가 타구의 질을 정한다.
    TALLY.inplay++;
    const quality = clamp(0.5 + PC.qCenter * Math.max(0, 1 - mid) + PC.qEdge * out
      + (b - s >= 1 ? PC.qAhead : 0) + (two ? PC.qTwoStrike : 0)
      + cb * 0.035 + rng.gauss(0, PC.qSd), 0.02, 0.98);
    return done(IN_PLAY, { quality, gbBias: P.gb });

    function done(res, extra) {
      return { res, b, s, np, f, events, type, velo: kmh(pit, type),
               px, pz, inZone, ...extra };
    }
  }
}
