// 타구 파이프라인.
//
//   타구 질 → 유형 · 방향 · 깊이 → 수비 범위 경합 → 담당 야수 → 포구 판정 → 실책
//
// 방향은 좌우 3분할이 아니라 각도다. 담당 야수는 미리 정해진 표가 아니라
// 그 각도·깊이에 누가 먼저 닿느냐로 정해진다. 그래서 같은 좌중간 타구라도
// 발 빠른 중견수가 있으면 잡히고, 없으면 2루타가 된다.
// 실책은 확률로 안타를 뒤집는 것이 아니라, 닿은 타구를 처리하지 못한 결과다.

import { z, LG, C } from './pa.js';

// 각도: -45 좌익선, 0 중견, +45 우익선. 깊이: 홈플레이트에서 미터.
// 실제 수비 위치. 코너 내야수는 선상에 붙고, 유격수·2루수는 그 사이 구멍을 메운다.
const POS_ANGLE = { C: 0, P: 0, '1B': 33, '2B': 17, '3B': -33, SS: -17,
                    LF: -30, CF: 0, RF: 30 };
const POS_DEPTH = { C: 3, P: 17, '1B': 33, '2B': 41, '3B': 33, SS: 41,
                    LF: 82, CF: 90, RF: 82 };
const INFIELD = ['P', '1B', '2B', '3B', 'SS'];
const OUTFIELD = ['LF', 'CF', 'RF'];

export const ZONE_KR = [
  [-45, '좌익선상'], [-33, '좌익수'], [-18, '좌중간'], [-6, '중견수'],
  [6, '우중간'], [18, '우익수'], [33, '우익선상'], [46, '우익선상'],
];
export function zoneName(angle) {
  for (const [hi, kr] of ZONE_KR) if (angle < hi) return kr;
  return '우익선상';
}

export const BC = {
  // 방향. 거포일수록 당겨치고, 교타자일수록 넓게 뿌린다.
  pullDeg: 10.5, pullPower: 2.6, pullContact: -2.0, spraySd: 15.5,
  // 땅볼은 더 넓게 퍼진다. 선상으로 빠지는 타구가 코너 내야수의 몫이다.
  spraySdBy: { GB: 20.5, LD: 18.0, FB: 18.5, PU: 14.0 },
  // 깊이 [평균, 표준편차] — 타구 질과 장타력이 얹힌다.
  depth: { GB: [30, 9], LD: [72, 16], FB: [88, 27], PU: [34, 12] },
  // 잘 맞은 공이 넘어간다. 뜬 공은 타구 질이 비거리를 크게 끌어올린다.
  depthQuality: { GB: 6, LD: 20, FB: 40, PU: 8 },
  depthPower: { GB: 1.5, LD: 6.5, FB: 6.5, PU: 1.5 },
  // 체공 시간 [상수, 깊이계수]. 땅볼은 타구 속도로 따로 계산한다.
  hang: { GB: [0, 0], LD: [0.72, 1 / 62], FB: [1.60, 1 / 27], PU: [2.90, 1 / 34] },
  // 땅볼 타구 속도 (m/s)
  gbSpeedBase: 30.0, gbSpeedQuality: 11.0, gbSpeedPower: 1.4,
  // 수비가 실제로 쓸 수 있는 시간의 보정. 기하 단순화를 흡수한다.
  hangK: { GB: 1.319, LD: 1.294, FB: 1.099, PU: 1.249 },
  // 야수 이동 속도 (m/s)
  rangeBase: 6.30, rangeField: 0.055, rangeSpeed: 0.022, react: 0.32,
  // 투수는 투구 동작을 막 끝낸 참이다. 반응이 늦고 옆으로 못 움직인다.
  pReact: 0.28, pRange: 0.55,
  // 여유(초)가 클수록 쉬운 타구
  tau: 0.62,
  // 땅볼은 잡아도 던져야 아웃이다
  gbOutBase: 0.962, gbSpeed: -0.045, gbArm: 0.020, gbDeep: -0.0035,
  // 닿은 타구를 아웃으로 바꾸지 못하는 정도. 어려운 타구일수록 세이프가 된다.
  gbDiff: 0.42, flyDiff: 0.50,
  // 타구 질이 유형에 미치는 영향
  qGb: 1.350, qLd: 0.95, qPu: 1.10,
  // 담장 (m). 폴대 99, 중앙 125.
  // 담장 기준 치수 (m). 보정 결과가 실제 KBO 구장 규격과 맞아떨어졌다.
  fenceLine: 104.62, fenceCenter: 131.32, fenceHeight: 2.8,
  // 낮은 직선타는 높은 담장에 걸린다. 뜬 공은 넘어간다.
  heightLd: 2.4, heightFb: 0.7,
  // 고도 100m당 비거리 (m), 인조잔디 타구 가속
  altGain: 0.55, turfEv: 0.05,
  // 시프트. 당겨치는 타자 쪽으로 야수를 옮긴다.
  // 당긴 타구는 막히고 반대쪽은 비는데, 그 둘 다 기하에서 저절로 나온다.
  shiftBase: 4.4, shiftOf: 0.35, shiftMin: 0.35,
  // 실책
  errField: 0.0732, errFieldDef: -0.34, errThrow: 0.0299, errThrowArm: -0.36,
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const num = (x, d) => (Number.isFinite(x) ? x : d);
const rad = Math.PI / 180;

/** 타구 유형. 약하게 맞으면 굴러가고, 잘 맞으면 뜬다. */
export function battedType(bat, pit, quality, rng) {
  const q = quality - 0.5;
  const gbShift = C.gbBat * z(bat.gb_tendency) + C.gbPit * z(pit.gb_tendency) - BC.qGb * q;
  const ldShift = C.ldContact * z(bat.contact) + BC.qLd * q;
  const wGb = LG.gb * Math.exp(gbShift);
  const wFb = LG.fb * Math.exp(-gbShift * 0.8);
  const wPu = LG.pu * Math.exp(-gbShift * 0.4 - BC.qPu * q);
  const wLd = LG.ld * Math.exp(ldShift);
  let r = rng.random() * (wGb + wFb + wPu + wLd);
  if (r < wGb) return 'GB';
  if (r < wGb + wLd) return 'LD';
  if (r < wGb + wLd + wFb) return 'FB';
  return 'PU';
}

/** 구장 규격. 없으면 리그 평균 구장으로 친다. */
export const stdPark = () => ({ fL: BC.fenceLine, fC: BC.fenceCenter, fR: BC.fenceLine,
  fHeight: BC.fenceHeight, foul: 1.0, turf: 0, alt: 0 });

/** 담장까지의 거리. 좌우가 다를 수 있고, 중앙이 가장 멀다. */
export function fence(angle, park) {
  const p = park && park.fL ? park : stdPark();
  const line = angle < 0 ? p.fL : p.fR;
  return line + (p.fC - line) * Math.cos(2 * angle * rad);
}

/** 담장을 넘겼는가. 낮은 직선타일수록 담장 높이의 영향을 크게 받는다. */
export function overFence(ball, park) {
  if (ball.bbt !== 'FB' && ball.bbt !== 'LD') return false;
  const p = park && park.fL ? park : stdPark();
  const extra = (p.fHeight - BC.fenceHeight) * (ball.bbt === 'LD' ? BC.heightLd : BC.heightFb);
  return ball.depth >= fence(ball.angle, p) + extra;
}

/** 타구의 물리적 서술. 어디로, 얼마나 깊게, 얼마나 오래 떠 있는가. */
export function battedBall(bbt, bat, quality, rng, park = null) {
  const hand = bat.bats === 'L' ? -1 : 1;
  const pull = BC.pullDeg + BC.pullPower * z(bat.hr_power) + BC.pullContact * z(bat.contact);
  const angle = clamp(rng.gauss(-hand * pull, BC.spraySdBy[bbt] ?? BC.spraySd), -45, 45);

  const [dm, ds] = BC.depth[bbt];
  // 뜬 공의 비거리는 장타력이, 굴러가는 타구는 갭파워가 끌고 간다.
  const zp = bbt === 'FB' || bbt === 'LD'
    ? z(bat.hr_power) * 0.78 + z(bat.gap_power) * 0.22 : z(bat.gap_power);
  // 고도가 높으면 공기가 옅어 공이 더 간다.
  const alt = park ? (park.alt || 0) : 0;
  const depth = Math.max(6, rng.gauss(
    dm + BC.depthQuality[bbt] * (quality - 0.5) + BC.depthPower[bbt] * zp, ds)
    + alt / 100 * BC.altGain);

  if (bbt === 'GB') {
    // 인조잔디는 타구를 빠르게 만든다. 내야를 그만큼 빨리 지나간다.
    const ev = Math.max(14, (BC.gbSpeedBase + BC.gbSpeedQuality * (quality - 0.5) * 2
      + BC.gbSpeedPower * z(bat.hr_power) + rng.gauss(0, 4))
      * (1 + BC.turfEv * (park ? park.turf || 0 : 0)));
    return { bbt, angle, depth, ev, hang: 0, zone: zoneName(angle) };
  }
  const [h0, h1] = BC.hang[bbt];
  return { bbt, angle, depth, hang: (h0 + depth * h1) * BC.hangK[bbt], zone: zoneName(angle) };
}

// 지시 단계별 시프트 강도
const SHIFT_MUL = [0, 0.45, 1.00, 1.55, 2.15];
// 자리마다 얼마나 따라 움직이는가. 당긴 쪽 코너는 거의 그대로 서 있고,
// 반대편 2루수·유격수가 크게 건너온다.
const SHIFT_W = { corner_pull: 0.15, mid_pull: 0.70, mid_away: 1.70, corner_away: 0.35 };
function shiftWeight(pos, shift) {
  const pullLeft = shift < 0;                       // 우타 상대 (좌측으로 이동)
  if (pos === '3B') return pullLeft ? SHIFT_W.corner_pull : SHIFT_W.corner_away;
  if (pos === '1B') return pullLeft ? SHIFT_W.corner_away : SHIFT_W.corner_pull;
  if (pos === 'SS') return pullLeft ? SHIFT_W.mid_pull : SHIFT_W.mid_away;
  if (pos === '2B') return pullLeft ? SHIFT_W.mid_away : SHIFT_W.mid_pull;
  return 1;
}

/** 이 타자에게 얼마나 옮겨 설 것인가. 안 당기는 타자에게는 움직이지 않는다. */
export function shiftDeg(bat, dial = 2) {
  const m = SHIFT_MUL[Math.max(0, Math.min(4, dial | 0))];
  if (!m) return 0;
  const pull = z(bat.hr_power) * 0.55 - z(bat.contact) * 0.35 - z(bat.speed) * 0.25;
  if (pull < BC.shiftMin) return 0;
  const hand = bat.bats === 'L' ? 1 : -1;     // 우타는 좌측, 좌타는 우측으로 당긴다
  return hand * BC.shiftBase * Math.min(2.4, pull) * m;
}

/** 그 타구에 누가 먼저 닿는가. 표가 아니라 경합으로 정한다. */
export function assign(ball, byPos, shift = 0) {
  const ground = ball.bbt === 'GB';
  const pool = ground ? INFIELD : (ball.depth < 52 ? INFIELD : OUTFIELD);
  let best = null;
  for (const pos of pool) {
    const f = byPos && byPos[pos];
    // 투수에게는 수비 능력치가 없다. 자리 기본값으로 메운다.
    const fld = num(f && f.fielding, pos === 'P' ? 45 : 50);
    const spd = num(f && f.speed, pos === 'P' ? 45 : 50);
    let v = BC.rangeBase + BC.rangeField * (fld - 50) + BC.rangeSpeed * (spd - 50);
    let react = BC.react;
    if (pos === 'P') { v *= BC.pRange; react += BC.pReact; }
    let dist, avail;
    // 시프트는 야수를 통째로 미는 게 아니다. 반대편 야수가 건너오고,
    // 당긴 쪽 코너는 선을 지킨다. 투수와 포수는 움직이지 않는다.
    const sh = (pos === 'P' || pos === 'C') ? 0
      : shift * (OUTFIELD.includes(pos) ? BC.shiftOf : shiftWeight(pos, shift));
    const pa = POS_ANGLE[pos] + sh;
    if (ground) {
      // 땅볼은 야수 쪽으로 굴러온다. 옆으로만 움직이면 되고,
      // 쓸 수 있는 시간은 공이 그 깊이까지 오는 시간이다.
      dist = Math.abs(ball.angle - pa) * rad * POS_DEPTH[pos];
      avail = POS_DEPTH[pos] / ball.ev * BC.hangK.GB;
    } else {
      dist = Math.hypot((ball.angle - pa) * rad * ball.depth,
                        ball.depth - POS_DEPTH[pos]);
      avail = ball.hang;
    }
    const slack = (avail - react) - dist / v;
    if (!best || slack > best.slack) best = { pos, fielder: f, slack, dist };
  }
  // 여유가 클수록 쉬운 타구. 0 근처면 전력질주해야 닿는다.
  best.difficulty = clamp(Math.exp(-Math.max(0, best.slack) / BC.tau), 0, 1);
  return best;
}

/** 수비 판정. 아웃인가, 안타인가, 실책인가. */
export function fieldIt(ball, play, bat, rng) {
  const f = play.fielder;
  const isP = play.pos === 'P';
  const zf = z(num(f && f.fielding, isP ? 45 : 50));
  const za = z(num(f && (f.arm ?? f.fielding), isP ? 48 : 50));
  const reached = play.slack >= 0;

  if (!reached) return { ...play, result: 'HIT' };       // 못 따라갔다

  if (ball.bbt === 'GB' || ball.depth < 52) {
    // 내야 타구 — 잡는 것과 던지는 것이 따로다.
    if (rng.random() < BC.errField * play.difficulty * Math.exp(BC.errFieldDef * zf))
      return { ...play, result: 'ERR', kind: 'field' };
    if (ball.bbt === 'GB') {
      if (rng.random() < BC.errThrow * Math.exp(BC.errThrowArm * za))
        return { ...play, result: 'ERR', kind: 'throw' };
      const pOut = clamp(BC.gbOutBase + BC.gbSpeed * z(bat.speed) + BC.gbArm * za
        + BC.gbDeep * (play.dist - 8) - BC.gbDiff * play.difficulty, 0.05, 0.995);
      return { ...play, result: rng.random() < pOut ? 'OUT' : 'HIT' };
    }
    return { ...play, result: 'OUT' };                    // 내야 뜬공·직선타
  }

  // 뜬 공 — 닿았으면 대개 잡는다. 어려운 타구일수록 흘린다.
  if (rng.random() < BC.errField * play.difficulty * 0.55 * Math.exp(BC.errFieldDef * zf))
    return { ...play, result: 'ERR', kind: 'field' };
  return { ...play, result: rng.random() < 1 - play.difficulty * BC.flyDiff ? 'OUT' : 'HIT' };
}

/** 안타의 등급. 선상과 갭으로 빠질수록, 깊을수록 길어진다. */
export function hitBases(ball, bat, rng) {
  if (ball.depth < 52) return 1;                          // 내야 안타
  const gap = Math.min(Math.abs(Math.abs(ball.angle) - 15) < 7 ? 1 : 0,
                       ball.bbt === 'GB' ? 0 : 1);
  const line = Math.abs(ball.angle) > 34 ? 1 : 0;
  let p2 = 0.125 + 0.0075 * (ball.depth - 60) + 0.20 * gap + 0.24 * line
    + 0.012 * z(bat.gap_power) * 3;
  let p3 = 0.012 + 0.030 * line + 0.010 * z(bat.speed) + 0.0016 * (ball.depth - 60);
  p2 = clamp(p2, 0, 0.90); p3 = clamp(p3, 0, 0.14);
  const r = rng.random();
  return r < p3 ? 3 : (r < p3 + p2 ? 2 : 1);
}

/** 저장된 구장 정보에서 실제 치수를 뽑는다. 없으면 홈런 팩터로 환산한다. */
// 실제 치수(m)를 모델 좌표로 옮긴다. 리그 평균 구장에서 보정을 맞췄으므로
// 평균과의 차이만큼만 밀어 준다.
const REAL_L = 98.4, REAL_C = 120.8;
export function parkDims(park) {
  if (!park) return stdPark();
  if (park.fL && park.fL > 200) return park;              // 이미 모델 좌표
  if (park.fL) return {
    fL: BC.fenceLine + (park.fL - REAL_L),
    fC: BC.fenceCenter + (park.fC - REAL_C),
    fR: BC.fenceLine + (park.fR - REAL_L),
    fHeight: park.fH ?? BC.fenceHeight,
    foul: park.foul ?? 1, turf: park.turf ?? 0, alt: park.alt ?? 0, dome: !!park.dome,
    real: { fL: park.fL, fC: park.fC, fR: park.fR, fH: park.fH } };
  const h = park.hrFactor || 0;
  return { fL: BC.fenceLine - h * 12, fC: BC.fenceCenter - h * 14, fR: BC.fenceLine - h * 12,
           fHeight: BC.fenceHeight, foul: park.foul ?? 1, turf: park.turf ?? 0, alt: park.alt ?? 0 };
}

export const POS_KR_OF = (p) => POS_KR[p] || '';
const POS_KR = { P:'투수', C:'포수', '1B':'1루수', '2B':'2루수', '3B':'3루수',
                 SS:'유격수', LF:'좌익수', CF:'중견수', RF:'우익수' };
const NEAR = { LF:'좌전', CF:'중전', RF:'우전' };

/** 중계 문구. 시스템이 실제로 아는 것만 말한다. */
export function describe(ball, play, kind, bases) {
  const pos = POS_KR[play.pos] || '';
  if (kind === 'HR') return ball.zone + ' 홈런';
  if (kind === 'ERR') return pos + (play.kind === 'throw' ? ' 송구 실책' : ' 실책');
  if (kind === 'OUT') {
    if (ball.bbt === 'GB') return pos + ' 땅볼';
    if (ball.bbt === 'LD') return pos + ' 직선타';
    if (ball.bbt === 'PU') return pos + ' 뜬공';
    return pos + ' 뜬공';
  }
  if (bases === 1) {
    // 야수가 닿았는데 세이프면 내야 안타. 뚫고 나갔으면 그냥 안타다.
    if (ball.bbt === 'GB' && play.slack >= 0 && play.difficulty > 0.42) return '내야 안타';
    const a = ball.angle;
    if (a < -38) return '좌익선상 안타';
    if (a > 38) return '우익선상 안타';
    return (a < -12 ? '좌전' : a > 12 ? '우전' : '중전') + ' 안타';
  }
  return ball.zone + (bases === 3 ? ' 3루타' : ' 2루타');
}
