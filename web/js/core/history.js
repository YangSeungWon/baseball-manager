// 구단 연혁. 리그가 시작되기 전의 40여 년을 만든다.
// 장식이 아니다 — 무관 기간은 구단주 인내심을 갉아먹는다.
import { personName } from './names.js';

const LEAGUE_FOUNDED = 1982;
// 창단 물결: 원년 6팀 → 확장. KBO 의 리듬을 빌렸다.
const EXPANSION = [1982, 1982, 1982, 1982, 1982, 1982, 1986, 1991, 2000, 2013,
                   2015, 2019, 2022, 2024];

const POS = ['C','1B','2B','3B','SS','LF','CF','RF','DH'];

export function buildHistory(teams, rng, upToYear) {
  const founded = rng.shuffle(EXPANSION.slice(0, teams.length));
  teams.forEach((t, i) => {
    t.history = { founded: founded[i] ?? 1982, titles: [], pennants: [] };
  });

  // 왕조가 생기도록 시대별 강세를 흔든다. 균등 추첨이면 역사가 밋밋해진다.
  let era = teams.map(() => rng.gauss(0, 0.6));
  for (let y = LEAGUE_FOUNDED; y <= upToYear; y++) {
    if (y % 4 === 0) era = era.map(v => v * 0.55 + rng.gauss(0, 0.7));
    const live = teams.filter(t => t.history.founded <= y);
    if (!live.length) continue;
    const pick = (arr) => {
      const w = arr.map(t => Math.exp(era[teams.indexOf(t)] * 1.35));
      const tot = w.reduce((a, b) => a + b, 0);
      let r = rng.random() * tot;
      for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r < 0) return arr[i]; }
      return arr[arr.length - 1];
    };
    pick(live).history.pennants.push(y);
    pick(live).history.titles.push(y);
  }

  for (const t of teams) {
    const h = t.history;
    const yrs = upToYear - h.founded + 1;
    h.seasons = yrs;
    // 실제 프랜차이즈 통산 승률은 .460~.560 안에 들어온다. 우승 횟수는
    // 리그 평균 기대치(1/팀수)와의 차이만큼만 승률을 밀어 올린다.
    const expected = 1 / teams.length;
    const pct = Math.max(0.455, Math.min(0.558,
      0.5 + (h.titles.length / yrs - expected) * 0.30 + rng.gauss(0, 0.011)));
    h.allW = Math.round(yrs * 144 * pct);
    h.allL = yrs * 144 - h.allW;
    h.pct = pct;
    h.lastTitle = h.titles.length ? h.titles[h.titles.length - 1] : null;
    h.drought = h.lastTitle ? upToYear - h.lastTitle : yrs;
    h.legend = makeLegend(rng, h, upToYear);
    h.tagline = tagline(h, upToYear);
  }
  return teams;
}

function makeLegend(rng, h, upToYear) {
  const debut = h.founded + rng.randint(2, Math.max(3, Math.min(28, upToYear - h.founded - 14)));
  const span = rng.randint(13, 20);
  const pitcher = rng.random() < 0.38;
  return {
    // 1980년대에 데뷔한 레전드가 요즘 이름을 갖고 있으면 안 된다. 데뷔 22년 전 출생.
    name: personName(rng, debut - 22),
    pos: pitcher ? 'SP' : rng.choice(POS),
    from: debut, to: Math.min(upToYear - 1, debut + span),
    number: rng.randint(1, 68),
    line: pitcher
      ? `통산 ${rng.randint(148, 232)}승 · ${rng.randint(1900, 2900)}탈삼진`
      : `통산 ${rng.randint(286, 548)}홈런 · ${rng.randint(1180, 1810)}타점`,
  };
}

export function tagline(h, upToYear, lastRank = null) {
  const n = h.titles.length;
  if (h.founded >= upToYear - 8) return `${h.founded}년 창단, 아직 역사를 쓰는 중`;
  if (n === 0) return `창단 ${h.seasons}년, 아직 우승이 없다`;
  if (h.drought === 0) return n === 1
    ? `${h.lastTitle}년 창단 첫 우승, 디펜딩 챔피언`
    : `통산 ${n}번째 우승을 막 차지한 디펜딩 챔피언`;
  // 지난 시즌 하위권이면 '전성기' 같은 말을 쓸 수 없다
  const slumping = lastRank !== null && lastRank >= 7;
  if (n >= 9 && h.drought >= 15) return `우승 ${n}회의 명가, 그러나 ${h.drought}년째 무관`;
  if (n >= 9) return `우승 ${n}회, 리그를 대표하는 명문`;
  if (n >= 5 && h.drought <= 2 && !slumping) return `우승 ${n}회, 지금이 전성기다`;
  if (n >= 5 && h.drought <= 2) return `우승 ${n}회, 그런데 지난 시즌 ${lastRank}위`;
  if (n >= 5 && h.drought >= 15) return `${h.lastTitle}년을 마지막으로 ${h.drought}년째 무관`;
  if (n >= 5) return `우승 ${n}회, 마지막은 ${h.lastTitle}년`;
  if (n === 1) return `${h.lastTitle}년 단 한 번의 우승, 그로부터 ${h.drought}년`;
  if (h.drought >= 18) return `우승 ${n}회, ${h.drought}년째 우승이 없다`;
  return `우승 ${n}회, ${h.lastTitle}년 이후 ${h.drought}년`;
}

/** 프롤로그로 실제 치른 시즌을 연혁에 반영한다.
 *  이걸 빼먹으면 8위 팀이 '디펜딩 챔피언' 이 된다. */
export function syncHistory(teams, year, championName, standings) {
  const rank = new Map(standings.map((r, i) => [r.team_id, i + 1]));
  for (const t of teams) {
    const h = t.history;
    if (!h) continue;
    if (t.name === championName && !h.titles.includes(year)) h.titles.push(year);
    h.seasons = year - h.founded + 1;
    h.lastTitle = h.titles.length ? h.titles[h.titles.length - 1] : null;
    h.drought = h.lastTitle ? year - h.lastTitle : h.seasons;
    h.tagline = tagline(h, year, rank.get(t.team_id) ?? null);
  }
}

/** 무관이 길수록 구단주는 조급해진다. 역사가 기계와 연결되는 지점. */
export function droughtPressure(h) {
  if (!h) return 0;
  return Math.min(16, h.drought * 0.42);
}
