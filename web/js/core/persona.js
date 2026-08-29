// 선수 성격.
//
// 능력은 스카우트가 구간으로 준다. 성격은 겪어봐야 안다.
// 그래서 숫자로 보여주지 않는다. 함께한 세월과 실제로 벌어진 일이
// 쌓여야 드러나고, 성향마다 드러나는 방식이 다르다.

// 확신할 때와 짐작할 때는 말이 다르다. 한국어라 두 형태를 따로 쓴다.
export const TRAITS = [
  { key:'work_ethic',      by:'years',   need:[2, 4],
    hi:['성실하다', '성실해 보인다'],
    lo:['훈련을 게을리한다', '훈련에 소홀한 듯하다'] },
  { key:'professionalism', by:'years',   need:[2, 4],
    hi:['프로답다', '프로다운 데가 있다'],
    lo:['제멋대로다', '제멋대로인 구석이 있다'] },
  { key:'ambition',        by:'years',   need:[3, 5],
    hi:['야망이 크다', '욕심이 있어 보인다'],
    lo:['현재에 만족한다', '크게 욕심내지 않는 듯하다'] },
  { key:'consistency',     by:'seasons', need:[3, 5],
    hi:['꾸준하다', '기복이 적은 편이다'],
    lo:['기복이 심하다', '기복이 있는 듯하다'] },
  { key:'injury_prone',    by:'injury',  need:[2, 4], flip:true,
    hi:['자주 다친다', '잔부상이 잦은 듯하다'],
    lo:['몸이 튼튼하다', '몸은 튼튼한 편으로 보인다'] },
  { key:'clutch',          by:'risp',    need:[380, 900], z:true,
    hi:['승부처에 강하다', '승부처에 강한 듯하다'],
    lo:['승부처에 약하다', '승부처에서 약해 보인다'] },
  { key:'poise',           by:'risp',    need:[380, 900], z:true,
    hi:['위기에서 침착하다', '위기에 잘 버티는 듯하다'],
    lo:['위기에서 흔들린다', '위기에 흔들리는 듯하다'] },
  { key:'w_money',         by:'talks',   need:[1, 2], mid:1.00,
    hi:['돈을 먼저 본다', '돈을 따지는 듯하다'],
    lo:['돈에 연연하지 않는다', '돈에는 크게 매이지 않는 듯하다'] },
  { key:'w_winning',       by:'talks',   need:[1, 2], mid:0.55,
    hi:['우승할 팀을 찾는다', '이기는 팀을 바라는 듯하다'],
    lo:['성적에는 무덤덤하다', '성적에는 덤덤한 듯하다'] },
  { key:'w_playtime',      by:'talks',   need:[1, 2], mid:0.45,
    hi:['출전 시간을 따진다', '출전 시간을 신경 쓰는 듯하다'],
    lo:['역할을 가리지 않는다', '역할을 가리지 않는 듯하다'] },
  { key:'w_loyalty',       by:'talks',   need:[2, 3], mid:0.18,
    hi:['구단에 애착이 있다', '구단에 정이 든 듯하다'],
    lo:['미련 없이 떠난다', '언제든 떠날 수 있어 보인다'] },
];

const CUT = 0.85;          // 이 정도는 두드러져야 말할 거리가 된다

/** 우리가 이 선수를 얼마나 겪었는가. 성향마다 세는 방식이 다르다. */
function evidence(p, ctx, by) {
  const yrs = ctx.years || 0;
  if (by === 'years') return yrs;
  if (by === 'seasons') return Math.min(yrs, ctx.seasons || 0);
  if (by === 'injury') return yrs >= 1 ? yrs + (p.career_injuries || 0) * 0.7 : 0;
  if (by === 'risp') return yrs >= 1 ? (ctx.rispPa || 0) : 0;
  if (by === 'talks') return ctx.talks || 0;
  return yrs;
}

/** 성향 한 줄씩. 아직 모르는 것은 아예 말하지 않는다. */
export function read(p, ctx = {}) {
  const h = p.hidden || {};
  const out = [];
  for (const t of TRAITS) {
    const raw = h[t.key];
    if (raw === undefined) continue;
    // 20~80 눈금인 것과 가중치인 것, z 점수인 것이 섞여 있다
    const zv = t.z ? raw : (t.mid !== undefined ? (raw - t.mid) / (t.mid * 0.6)
                                                : (raw - 50) / 14);
    if (Math.abs(zv) < CUT) continue;
    const ev = evidence(p, ctx, t.by);
    const [hint, sure] = t.need;
    if (ev < hint) continue;
    const level = ev >= sure ? 'sure' : 'hint';
    const strong = zv > 0;
    const words = strong ? t.hi : t.lo;
    out.push({ key:t.key, level, good: t.flip ? !strong : strong,
      text: words[level === 'sure' ? 0 : 1] });
  }
  return out.sort((a, b) => (a.level === 'sure' ? 0 : 1) - (b.level === 'sure' ? 0 : 1));
}

/** 함께한 해를 센다. 다른 구단에서 보낸 세월은 우리 것이 아니다. */
export function observe(t, p) {
  if (!p.seen) p.seen = {};
  p.seen[t.team_id] = (p.seen[t.team_id] || 0) + 1;
}
export const yearsWith = (t, p) => (p.seen && p.seen[t.team_id]) || 0;
