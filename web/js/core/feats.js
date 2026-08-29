// 한 경기에서 나온 대기록. 시즌 통계에는 남지 않지만 사람들이 기억하는 것들.
// 박스스코어를 훑어 찾아내고, 구단 역사에 남긴다.

export const FEAT = {
  perfect:  { kr:'퍼펙트게임',   rank:1 },
  nohit:    { kr:'노히트노런',   rank:2 },
  shutout:  { kr:'완봉승',       rank:5 },
  cg:       { kr:'완투',         rank:7 },
  k15:      { kr:'한 경기 15탈삼진', rank:4 },
  cycle:    { kr:'사이클링히트', rank:3 },
  hr3:      { kr:'한 경기 3홈런', rank:4 },
  grandslam:{ kr:'만루 홈런',    rank:9, minor:true },
  hit6:     { kr:'한 경기 6안타', rank:5 },
  rbi7:     { kr:'한 경기 7타점', rank:6 },
};

/** 한 팀의 박스스코어에서 대기록을 뽑는다.
 *  @param S 공격/수비 기록을 든 팀 상태  @param opp 상대 팀 상태 */
export function scan(S, opp, year, day) {
  const found = [];
  const add = (k, p, v) => found.push({ y: year, d: day, k, pid: p.pid,
    name: p.name, team: S.team.name, opp: opp.team.name, v });

  // 투수 — 완투한 선발만 본다. 계투 노히터는 따로 세지 않는다.
  const sp = S.pitchers[0];
  if (sp && S.pitchers.length === 1 && sp.outs >= 24) {
    if (sp.br === 0) add('perfect', sp.p, `${(sp.outs/3).toFixed(0)}이닝 ${sp.k}탈삼진`);
    else if (sp.h === 0) add('nohit', sp.p, `${sp.bb}볼넷 ${sp.k}탈삼진`);
    else if (sp.r === 0) add('shutout', sp.p, `${sp.h}피안타 ${sp.k}탈삼진`);
    else add('cg', sp.p, `${sp.r}실점 ${sp.k}탈삼진`);
  }
  for (const pl of S.pitchers) if (pl.k >= 15) add('k15', pl.p, `${pl.k}탈삼진`);

  // 타자
  for (const L of S.bat.values()) {
    if (!L.pa) continue;
    const s1 = L.h - L.b2 - L.b3 - L.hr;
    if (s1 >= 1 && L.b2 >= 1 && L.b3 >= 1 && L.hr >= 1) add('cycle', L.b, `${L.h}안타 ${L.rbi}타점`);
    if (L.hr >= 3) add('hr3', L.b, `${L.hr}홈런 ${L.rbi}타점`);
    else if (L.gsl >= 1) add('grandslam', L.b, `${L.rbi}타점`);
    if (L.h >= 6) add('hit6', L.b, `${L.h}안타`);
    if (L.rbi >= 7) add('rbi7', L.b, `${L.rbi}타점`);
  }
  return found;
}

export const featLabel = (f) => FEAT[f.k] ? FEAT[f.k].kr : f.k;
