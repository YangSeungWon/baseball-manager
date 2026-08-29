// 병역과 국제대회.
//
// 한국 야구에서 이 둘은 떼어놓을 수 없다. 스물다섯의 유망주를
// 1군에서 쓰느냐가 대표팀 승선을 정하고, 금메달 하나가 그 선수의
// 커리어 2년을 돌려준다. 못 받으면 스물일곱에 2년이 사라진다.

export const AG = 'ag', OL = 'ol', WBC = 'wbc';
export const MEET_KR = { ag:'아시안게임', ol:'올림픽', wbc:'WBC' };

// 올림픽 야구는 상설 종목이 아니다. 2012·2016 빠졌고 2020 도쿄에 부활했다가
// 2024 파리에서 또 빠졌다. 2028 LA 는 채택이 확정됐고 그 뒤는 아무도 모른다.
const OL_YEARS = new Set([2028]);

/** 그 해에 열리는 대회들. WBC 는 3월, 아시안게임은 9월이다. */
export function meets(year) {
  const out = [];
  if ((year - 2026) % 4 === 0) out.push(WBC, AG);
  if (OL_YEARS.has(year)) out.push(OL);
  return out;
}
export const meetYear = (y) => { const m = meets(y); return m.includes(AG) ? AG : (m[0] || null); };

export const STATUS_KR = { none:'미필', serving:'복무 중', exempt:'면제', done:'필' };

export const MIL = {
  ageLimit: 25,          // 대표팀 연령 제한 (초과는 와일드카드로만)
  wildcards: 3,
  squad: 24,
  callAge: 26,           // 이 나이 겨울까지 미필이면 더 미룰 수 없다
  years: 2,              // 시즌 두 번을 통째로 빠진다
  sangmuPerYear: 14,     // 상무가 한 해에 받는 인원
  idleEnlist: 0.11,      // 1군에 못 올라온 선수가 그 해에 갈 확률
  sangmuDev: 0.80,       // 상무는 퓨처스에서 뛴다
  activeDev: 0.15,       // 현역은 공을 못 만진다
  // WBC 는 3월이다. 스프링캠프 대신 전력투구를 하고 시즌에 들어간다.
  wbcInjury: 0.16,       // 차출 선수의 시즌 초 부상 확률
  wbcSlump: 0.62,        // 몸이 덜 만들어진 채 시작한다 (첫 달 성장/컨디션)
};

// 대회별 성적 분포. 아시안게임은 금메달만, 올림픽은 동메달 이상이 면제다.
// WBC 는 아무리 잘해도 면제가 없다 — 2006 특례 이후 사라졌다.
const MEDAL = {
  ag:  { gold: 0.58, silver: 0.27 },
  ol:  { gold: 0.16, silver: 0.20, bronze: 0.26 },
  wbc: { gold: 0.06, silver: 0.09, bronze: 0.13 },   // 8강 밖이 흔하다
};

export const isKorean = (p) => !p.foreign;
export const status = (p) => p.mil || (isKorean(p) ? 'none' : 'na');
export const serving = (p) => p.mil === 'serving';

/** 이 선수가 병역을 앞두고 있는가. 팀을 짤 때 이게 시한이다. */
export function pressure(p, year) {
  if (!isKorean(p) || p.mil === 'exempt' || p.mil === 'done') return 0;
  if (p.mil === 'serving') return 0;
  return Math.max(0, MIL.callAge - p.age);   // 남은 해
}

/** 대표팀 승선 자격. 어리거나, 와일드카드로 뽑히거나. */
export const eligible = (p, kind) => {
  if (!isKorean(p) || p.mil === 'serving' || p.injury_days > 0) return false;
  if (kind === WBC) return true;              // WBC 는 나이 제한이 없다. 최정예가 간다.
  return p.age <= MIL.ageLimit || (p.service ?? 0) <= 4;
};

/** 대표팀을 뽑는다. 그 시즌에 1군에서 뛴 성적이 근거다.
 *  안 쓴 선수는 뽑히지 않는다 — 그게 이 제도의 핵심이다. */
export function pickSquad(teams, season, rng, value, kind = AG) {
  const cands = [];
  for (const t of teams)
    for (const p of [...t.batters, ...t.pitchers]) {
      if (!eligible(p, kind)) continue;
      const v = value(t, p, season);
      if (v <= 0) continue;                 // 1군에서 안 뛰었으면 후보가 아니다
      cands.push({ p, t, v, wild: kind !== WBC && p.age > MIL.ageLimit });
    }
  cands.sort((a, b) => b.v - a.v);
  if (kind === WBC) return cands.slice(0, MIL.squad);
  const young = [], wild = [];
  for (const c of cands) {
    if (c.wild) { if (wild.length < MIL.wildcards) wild.push(c); }
    else if (young.length < MIL.squad - MIL.wildcards) young.push(c);
    if (young.length + wild.length >= MIL.squad) break;
  }
  return young.concat(wild);
}

/** 메달. 대표팀이 강할수록 확률이 오르지만 보장은 없다. */
export function result(kind, squad, rng, value) {
  const avg = squad.length ? squad.reduce((a, c) => a + c.v, 0) / squad.length : 0;
  const edge = Math.max(-0.25, Math.min(0.25, (avg - 1.6) * 0.09));
  const m = MEDAL[kind];
  const g = Math.max(0.02, Math.min(0.92, m.gold + edge));
  const r = rng.random();
  if (r < g) return 'gold';
  if (r < g + m.silver) return 'silver';
  if (m.bronze && r < g + m.silver + m.bronze) return 'bronze';
  return null;
}

/** 면제가 되는 성적인가.
 *  아시안게임은 금, 올림픽은 동메달 이상. WBC 는 면제가 없다. */
export const exempts = (kind, medal) => {
  if (kind === WBC) return false;
  if (medal === 'gold') return true;
  return kind === OL && (medal === 'silver' || medal === 'bronze');
};

export const MEDAL_KR = { gold:'금메달', silver:'은메달', bronze:'동메달' };
