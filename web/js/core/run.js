// 주루는 시간이다.
//
// 표로 "단타에 2루 주자가 득점할 확률 .665" 를 뽑는 대신, 그 플레이의 시간표를
// 만든다 — 공이 떨어지는 시각, 야수가 줍는 시각, 송구가 베이스에 닿는 시각,
// 주자가 베이스에 닿는 시각. 주자는 자기가 먼저 닿을 것 같으면 뛰고, 아니면
// 선다. 판단에는 오차가 있다 — 그래서 가끔 죽고, 가끔 안 뛰어도 될 걸 안 뛴다.
// 화면은 이 시간표를 그대로 재생한다. 공과 주루가 따로 놀 수 없다.
//
// 좌표는 bip.js 와 같다. 각도 -45~45, 깊이 m. 베이스 사이 27.43m.

import { z } from './pa.js';
import * as BIP from './bip.js';

const rad = Math.PI / 180;
export const BASE_M = 27.43;
const BASE = [[0, 0], [19.4, 19.4], [0, 38.8], [-19.4, 19.4]];
const baseAt = (k) => BASE[k % 4];
const W2 = (ang, dep) => [dep * Math.sin(ang * rad), dep * Math.cos(ang * rad)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const RT = {
  // 주자. m/s. 홈-1루 27.4m 를 평균 4.2초에.
  runBase: 6.55, runSpeed: 0.38,
  runMotion: 1.12,          // 이미 뛰고 있는 주자는 타자보다 빠르다 (출발 가속이 없다)
  batterDelay: 0.25,        // 스윙 뒤 첫 발까지
  lead: 3.2,                // 1차 리드 (m). 주자의 담력과 투수의 견제가 늘리고 줄인다
  leadDare: 0.55, leadHold: 0.45, leadMin: 1.8, leadMax: 5.0,
  secondary: 1.0,           // 타구가 나갈 때는 이미 이만큼 더 나가 있다
  stealReact: 0.36,
  // 견제. 투수가 던져 1루에 닿는 시간 vs 주자의 귀루. 리드가 클수록 잡힌다.
  pickRelease: 0.32, pickReturnReact: 0.22, pickDive: 0.5,
  // 판단. 담력이 크면 덜 남기고 뛰고, 판단력이 좋으면 덜 흔들린다.
  daringBias: 0.14, readSd: 0.06,
  tagDelay: 0.15,           // 포구를 보고 출발하기까지
  // 송구. m/s. 어깨가 좋으면 빠르다. 외야는 높게 던지느라 실효 속도가 낮다.
  throwIF: 31.0, throwOF: 33.0, throwArm: 1.6,
  releaseIF: 0.45, releaseOF: 0.75, relay: 0.60,   // 잡고 던지기까지. 병살의 피벗이 relay 다
  dpMargin: 0.50,           // 병살은 이만큼 여유가 있어야 돌린다
  cutoff: 55, cutoffRelay: 0.60, cutoffAll: false,   // 이보다 먼 외야 송구(홈)는 중계를 거친다
  delivery: 1.30,           // 투수의 세트에서 릴리스까지 (도루 때)
  catcherPop: 1.95, catcherPopArm: -0.06,          // 팝타임 — 포구에서 2루 도착까지. 어깨가 좋으면 짧다
  judgeSd: 0.35, judgeBias: -0.05,   // 주자는 약간 공격적이다
  tagBias: 0.15,            // 태그업은 더 신중하다 — 잡히면 이닝이 날아간다
  // 야수. 송구 정확도 — 빗나가면 세이프. 어깨가 좋을수록 정확하다.
  wildBase: 0.045, wildArm: -0.30,
  // 송구의 실행 오차. 외야에서 홈까지는 크게 흔들린다 — 중계, 바운드, 방향.
  fieldSd: 0.20, fieldSdOF: 0.45,
  gbRoll: 34,               // 뚫린 땅볼이 외야로 더 굴러가는 거리 (m)
  flyRoll: 10, flyRollDep: 0.12, flyRollT: 1.7,
  ofPick: 0.45,             // 외야수가 굴러간 공을 줍고 몸을 돌리는 데
  gbHangK: 1.319,           // bip 의 땅볼 시간 보정
};

export const runSpeed = (r) => RT.runBase + RT.runSpeed * z(r && r.speed ? r.speed : 50);
const hid = (r, k) => (r && r.hidden && r.hidden[k]) || 0;
/** 이 주자가 이 투수에게 잡는 리드 (m). 담력은 늘리고 견제는 줄인다. */
export function leadOf(r, pit) {
  return clamp(RT.lead + RT.leadDare * hid(r, 'daring') - RT.leadHold * hid(pit, 'hold'), RT.leadMin, RT.leadMax);
}
const throwSpeed = (f, of) => (of ? RT.throwOF : RT.throwIF) + RT.throwArm * z(f ? (f.arm ?? f.fielding ?? 50) : 50);
const isOF = (pos) => pos === 'LF' || pos === 'CF' || pos === 'RF';

/** 이 타구의 시간표. 야수가 공을 쥐는 시각과 자리, 그 야수. */
export function ballClock(ball, play, dims) {
  const gb = ball.bbt === 'GB';
  const ev = ball.ev || 26;
  const T = gb ? ball.depth / ev * RT.gbHangK : ball.hang;
  const pos = play.pos || 'CF';
  const icptD = gb ? Math.min(play.pd ?? 40, ball.depth) : ball.depth;
  const Ti = gb ? icptD / ev * RT.gbHangK : T;
  const reach = play.slack >= 0;
  if (reach) {
    return { t: Ti, at: W2(ball.angle, icptD), pos, of: isOF(pos), fielder: play.fielder, caught: !gb };
  }
  // 빠졌다. 굴러가 멎은 곳에서 외야수가 줍는다.
  const fence = BIP.fence(ball.angle, dims);
  const stopD = Math.min(fence - 2.5, gb ? ball.depth + RT.gbRoll : ball.depth + RT.flyRoll + ball.depth * RT.flyRollDep);
  const Tr = gb ? 2.2 : RT.flyRollT;
  const at = W2(ball.angle, stopD);
  // 누가 줍나. 땅볼이면 가장 가까운 외야수, 뜬공이면 담당 외야수.
  let who = pos, f = play.fielder;
  if (gb && play.byPos) {
    let best = null;
    for (const p of ['LF', 'CF', 'RF']) { const sp = BIP.fielderSpot(p, 0), w = W2(sp.angle, sp.depth);
      const d = dist(w, at); if (!best || d < best.d) best = { p, d, f: play.byPos[p] }; }
    if (best) { who = best.p; f = best.f; }
  }
  const sp = BIP.fielderSpot(who, 0), from = W2(sp.angle, sp.depth);
  const m = BIP.fielderMotion(who, f);
  const tArrive = 0.5 + dist(from, at) / m.v;
  return { t: Math.max(T + Tr, tArrive) + RT.ofPick, at, pos: who, of: true, fielder: f, caught: false };
}

/** 송구가 베이스 b 에 닿는 시각. */
export function throwArrive(clock, b, relayFrom = null) {
  const from = relayFrom || clock.at;
  const rel = relayFrom ? RT.relay : (clock.of ? RT.releaseOF : RT.releaseIF);
  const v = throwSpeed(clock.fielder, clock.of && !relayFrom);
  const d = dist(from, baseAt(b));
  // 먼 외야 송구는 중계수를 거친다. 한 번 더 잡고 던지는 시간이 든다.
  // 잡은 공은 바로 던진다. 굴러간 공을 주워 먼 데로 보낼 때 중계가 낀다.
  const relay = clock.of && !relayFrom && !clock.caught && d > RT.cutoff && (b === 4 || RT.cutoffAll) ? RT.cutoffRelay : 0;
  return (relayFrom ? 0 : clock.t) + rel + d / v + relay + 0.1;
}

/** 주자가 f 루에서 t 루까지 가는 시각. 타자는 홈에서 출발하고 첫 발이 늦다. */
export function runArrive(r, f, t, opts = {}) {
  const legs = t - f;
  const v = runSpeed(r) * (f === 0 ? 1 : RT.runMotion);
  const lead = f === 0 ? 0 : (opts.lead ?? leadOf(r, opts.pit)) + (opts.tag ? 0 : RT.secondary);
  const t0 = f === 0 ? RT.batterDelay : (opts.tag ? opts.tag + RT.tagDelay : 0);
  return t0 + (legs * BASE_M - lead) / v;
}

/** 주자의 판단. 내가 먼저 닿는가 — 오차를 얹어서. */
export function dares(tRun, tThrow, rng, extra = 0, r = null) {
  const bias = RT.judgeBias - RT.daringBias * hid(r, 'daring');
  const sd = clamp(RT.judgeSd - RT.readSd * hid(r, 'read'), 0.15, 0.6);
  return tRun + bias + extra < tThrow + rng.gauss(0, sd);
}
/** 견제. 투수의 송구가 1루에 닿는 시각 vs 주자가 돌아가 닿는 시각. */
export function pickoffRace(r, pit, lead, rng) {
  const tThrow = RT.pickRelease - 0.04 * hid(pit, 'hold') + 19.4 / (RT.throwIF + 1.0) + rng.gauss(0, 0.05);
  const tBack = RT.pickReturnReact - 0.05 * hid(r, 'read') + Math.max(0, lead - RT.pickDive) / (runSpeed(r) * 0.95) + rng.gauss(0, 0.06);
  return { out: tThrow < tBack - 0.03, tThrow, tBack };
}
/** 송구가 빗나갔는가. */
export function wildThrow(clock, rng) {
  const f = clock.fielder;
  return rng.random() < RT.wildBase * Math.exp(RT.wildArm * z(f ? (f.arm ?? f.fielding ?? 50) : 50));
}
/** 도루. 투구 시간 + 포수 팝 + 송구 vs 주자. */
export function execNoise(clock, rng) { return rng.gauss(0, clock && clock.of ? RT.fieldSdOF : RT.fieldSd); }
export function stealRace(r, catcher, velo, rng, lead = RT.lead, pit = null) {
  const pitchT = 16.8 / ((velo || 142) / 3.6);
  const pop = RT.catcherPop + RT.catcherPopArm * z(catcher ? (catcher.arm ?? catcher.fielding ?? 50) : 50) + rng.gauss(0, 0.08);
  // 견제가 좋은 투수는 세트가 빠르다 (슬라이드 스텝)
  const tThrow = RT.delivery - 0.05 * hid(pit, 'hold') + pitchT + pop;
  const tRun = RT.stealReact - 0.03 * hid(r, 'read') + (BASE_M - lead - 0.5) / (runSpeed(r) * RT.runMotion) + rng.gauss(0, 0.12);
  return { safe: tRun < tThrow - 0.05 || (catcher && wildThrow({ fielder: catcher }, rng)), tRun, tThrow };
}
