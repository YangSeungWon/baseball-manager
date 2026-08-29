// 외국인 선수 제도.
//
// 이 게임의 명제 — 선수의 진짜 능력은 아무도 모른다 — 의 극단이다.
// 다른 리그의 성적만 보고 판단해야 하고, 그 성적은 이쪽 리그로
// 그대로 옮겨오지 않는다. 스카우트 보고서는 넓고, 체계적으로 낙관적이다.
// 돈은 먼저 낸다.

import { newBatter, newPitcher } from './pa.js';
import * as dev from './development.js';
import { newPid, makeArsenal } from './roster.js';
import { CONSENSUS_SHARE, SIGMA_CUR_PRO, FOREIGN_OPTIMISM, FOREIGN_CUR_MULT } from './scouting.js';

export const QUOTA = { total: 3, pitchers: 2 };   // 보유 3명, 그중 투수 최대 2명
export const NEW_CAP = 14.0;                       // 신규 계약 상한 (억) ≈ 100만 달러
export const RESIGN_CAP = 32.0;                    // 재계약은 상한이 없다

// 다른 리그에서 잘하던 선수를 데려온다. 평균은 높고, 아래쪽 꼬리가 길다.
const TALENT_MEAN = 1.30, TALENT_SD = 0.78, TALENT_TAIL = 0.70;
export const SCOUT_DIFF = 2.15;                    // 잠재력 오차 배수

const GIVEN = ['케이시','브랜든','로건','제이크','타일러','앤서니','디에고','호세',
  '라파엘','윌슨','에르난','카를로스','미겔','후안','에두아르도','대니얼','트래비스',
  '오스틴','코너','라이언','에릭','제시','드류','발렌틴','로베르토','산티아고',
  '루카스','마르코','아드리안','페르난도','조던','네이선','개럿','콜튼','하비에르'];
const FAMILY = ['로페즈','마르티네스','로드리게스','산체스','페레스','가르시아',
  '워커','밀러','톰슨','해리스','브라운','클라크','피셔','모랄레스','바스케스',
  '레예스','오르티스','캐스트로','더건','파머','스튜어트','벤슨','콜린스',
  '해밀턴','로빈슨','메디나','게레로','알바레스','키팅','블레이크','우드워드'];
const NATION = ['미국','미국','미국','도미니카','도미니카','베네수엘라','베네수엘라',
                '푸에르토리코','쿠바','멕시코','일본','대만','네덜란드','호주'];

const foreignName = (rng) => `${rng.choice(GIVEN)} ${rng.choice(FAMILY)}`;

/** 시장에 나온 외국인 선수 한 명.
 *  즉시 쓸 수 있어야 하므로 유망주가 아니라 완성된 선수로 만든다. */
export function makeForeign(rng, kind, year) {
  const t = rng.gauss(TALENT_MEAN, TALENT_SD) - Math.abs(rng.gauss(0, TALENT_TAIL));
  const age = Math.round(Math.max(24, Math.min(36, rng.gauss(29.5, 2.6))));
  const attr = (rho = 0.55, shift = 0) => Math.max(20, Math.min(80,
    50 + 10 * (rho * t + Math.sqrt(1 - rho*rho) * rng.gauss(0,1) + shift)));

  let p;
  if (kind === 'P') {
    p = newPitcher({ throws: rng.random() < 0.30 ? 'L' : 'R', role: 'SP',
      pid: newPid(), name: foreignName(rng), gb_tendency: attr(0, 0),
      arsenal: makeArsenal(rng, 'SP') });
    // 외국인 투수는 대개 구위와 구속으로 데려온다.
    p.stuff = attr(0.62, 0.45); p.command = attr(0.45, 0.10);
    p.movement = attr(0.45, 0.20); p.stamina = attr(0.30, 0.55);
    p.velo = attr(0.35, 0.55);
  } else {
    const pos = rng.choice(['1B','LF','RF','DH','3B','2B','SS','CF']);
    p = newBatter({ bats: rng.random() < 0.34 ? 'L' : 'R', position: pos,
      pid: newPid(), name: foreignName(rng), gb_tendency: attr(0, -0.25) });
    // 중심타선을 맡기려고 데려온다. 장타가 먼저다.
    p.hr_power = attr(0.62, 0.75); p.gap_power = attr(0.55, 0.50);
    p.contact = attr(0.50, 0.15); p.avoid_k = attr(0.35, -0.10);
    p.discipline = attr(0.40, 0.25); p.speed = attr(0.20, -0.25);
    p.fielding = attr(0.20, -0.15); p.arm = attr(0.20, 0);
  }
  p.age = age;
  p.pot = {};
  for (const a of dev.attrsOf(p)) p.pot[a] = Math.min(80, p[a] + Math.max(0, (28 - age) * 0.8));
  p.hidden = dev.makeHidden(rng);
  p.height = Math.round(Math.max(175, Math.min(203, 186 + rng.gauss(0, 5.5))));
  dev.updateWeight(p);
  p.origin = '외국인';
  p.nation = rng.choice(NATION);
  p.foreign = true;
  p.scout_difficulty = SCOUT_DIFF;
  // 리그가 공통으로 갖는 오해. 몸값은 진짜 능력이 아니라 이 평판에 붙는다.
  // 그래서 자기 스카우트를 믿은 팀만 싸게 얻거나 비싸게 산다.
  p.scout_consensus = {}; p.scout_consensus_pot = {};
  const est = {};
  for (const a of dev.attrsOf(p)) {
    p.scout_consensus[a] = rng.gauss(0, 1);
    p.scout_consensus_pot[a] = rng.gauss(0, 1);
    est[a] = Math.max(20, Math.min(80, p[a]
      + p.scout_consensus[a] * SIGMA_CUR_PRO * FOREIGN_CUR_MULT * Math.sqrt(CONSENSUS_SHARE)
      + FOREIGN_OPTIMISM));
  }
  const save = {};
  for (const a in est) { save[a] = p[a]; p[a] = est[a]; }
  p.ask_ovr = dev.overall(p);
  for (const a in save) p[a] = save[a];
  p.debut_year = null; p.draft_year = null;
  p.injury_days = 0; p.career_injuries = 0; p.career_injury_days = 0;
  p.contract = null; p.service = 0;
  p.kbo_years = 0;
  return p;
}

/** 로스터의 외국인 현황. 쿼터를 넘겼는지 본다. */
export function foreignOf(t) {
  // 2군에 있어도 보유 인원에 든다.
  const all = [...t.batters, ...t.pitchers, ...(t.farm || [])].filter(p => p.foreign);
  return { all, pitchers: all.filter(p => p.kind === 'P'),
           room: QUOTA.total - all.length,
           pitcherRoom: QUOTA.pitchers - all.filter(p => p.kind === 'P').length };
}

/** 이 팀이 이 선수를 더 데려올 수 있는가. */
export function canSign(t, kind) {
  const f = foreignOf(t);
  if (f.room <= 0) return false;
  return kind === 'P' ? f.pitcherRoom > 0 : true;
}

/** 시장 물량. 매 겨울 새로 채워진다. */
export function makeMarket(rng, year, n = 16, taken = null) {
  const out = [], used = new Set(taken || []);
  let guard = 0;
  while (out.length < n && guard++ < n * 12) {
    const p = makeForeign(rng, out.length % 5 < 3 ? 'P' : 'B', year);   // 투수가 조금 더 많다
    if (used.has(p.name)) continue;
    used.add(p.name); out.push(p);
  }
  return out;
}

/** 요구 연봉. 스카우트 보고서가 아니라 진짜 능력에 붙는다.
 *  즉, 잘 본 팀은 싸게 얻고 잘못 본 팀은 비싸게 산다. */
export function askingPrice(p, resign = false) {
  // 재계약은 이 리그에서 실제로 보여준 것이 있으니 진짜 능력에 가깝게 붙는다.
  const ovr = resign ? dev.overall(p) : (p.ask_ovr ?? dev.overall(p));
  const base = Math.max(4.0, 4.0 + Math.pow(Math.max(0, ovr - 42) / 10, 2.0) * 2.4);
  const cap = resign ? RESIGN_CAP : NEW_CAP;
  return Math.round(Math.min(cap, base) * 10) / 10;
}

/* ── 시즌 중 교체 ──────────────────────────────────────────
   여름에 나와 있는 선수는 겨울에 팔리지 않았거나 다른 데서 잘린 선수다.
   급이 떨어지고, 볼 시간도 짧아 더 모른다. 그래도 지금 쓸 수 있는 건 이들뿐이다. */

export const MIDSEASON_PENALTY = 0.62;   // 여름 매물의 재능 하락폭
export const MIDSEASON_DIFF = 1.35;      // 그 위에 얹히는 추가 불확실성
export const DEADLINE_LEFT = 34;         // 남은 경기가 이보다 적으면 교체 불가

/** 여름 시장. 겨울 시장보다 얕다. */
export function makeReplacements(rng, year, n = 8, taken = null) {
  const out = [], used = new Set(taken || []);
  let guard = 0;
  while (out.length < n && guard++ < n * 12) {
    const p = makeForeign(rng, out.length % 2 ? 'P' : 'B', year);
    if (used.has(p.name)) continue;
    // 겨울에 안 팔린 데는 이유가 있다.
    for (const a of Object.keys(p.pot)) {
      p[a] = Math.max(20, p[a] - MIDSEASON_PENALTY * 10 * 0.55);
      p.pot[a] = Math.max(p[a], p.pot[a] - MIDSEASON_PENALTY * 10 * 0.35);
    }
    p.scout_difficulty = SCOUT_DIFF * MIDSEASON_DIFF;
    p.midseason = true;
    p.ask_ovr = Math.max(20, (p.ask_ovr ?? dev.overall(p)) - MIDSEASON_PENALTY * 10 * 0.5);
    used.add(p.name); out.push(p);
  }
  return out;
}

/** 남은 경기에 비례한 몸값. 시즌 절반이 지났으면 절반만 낸다. */
export function proratedPrice(p, left, total) {
  const frac = Math.max(0.15, Math.min(1, left / total));
  return Math.round(askingPrice(p, false) * frac * 10) / 10;
}
