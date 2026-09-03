// 포스팅.
//
// KBO 에서 일곱 시즌을 채우면 해외로 나갈 자격이 생긴다. 다만 자격이지
// 권리가 아니다 — 구단이 동의해야 갈 수 있다. 그래서 이건 선수의 결정이
// 아니라 우리의 결정이다. 이적료를 받고 로테이션에 구멍을 낼 것인가,
// 붙잡아 두고 그가 그것을 기억하게 할 것인가.
//
// FA 자격(우리 리그는 7시즌)을 채운 뒤에는 동의 없이도 나갈 수 있으므로,
// 실제로 붙잡을 수 있는 창은 그 앞의 몇 해뿐이다.
import * as dev from './development.js';
import * as C from './contract.js';

export const POST = {
  service: 5,          // 이 시즌을 채워야 요청할 수 있다
  maxAge: 31,          // 저쪽이 부르는 나이
  minOvr: 58,          // 이 정도는 돼야 값이 붙는다
  askBase: 0.26,       // 자격자가 그 해에 말을 꺼낼 기준 확률
  feeMult: 4.0,        // 이적료 = 연 시장가치 × 이것
  years: [3, 4, 5, 6], // 저쪽에서 보내는 시간
  backOvr: [-4, 3],    // 돌아올 때 능력 변화의 폭
};

const isP = (p) => p.kind === 'P';

/** 이적료. 저쪽 구단이 우리에게 내는 돈이다. */
export function fee(p, ovr) {
  const mv = C.marketValue(ovr, p.age, isP(p));
  const youth = Math.max(0.7, Math.min(1.35, (33 - p.age) / 6));
  return Math.round(mv * POST.feeMult * youth * 10) / 10;
}

/** 올겨울 나가겠다고 말을 꺼내는 사람들. */
export function requests(L, year, rng) {
  const out = [];
  for (const t of L.teams) {
    for (const p of [...t.batters, ...t.pitchers]) {
      if (p.foreign || p.mil === 'serving' || p.mlb) continue;
      if ((p.service ?? 0) < POST.service || p.age > POST.maxAge) continue;
      // FA 자격을 이미 채운 사람은 우리 동의가 필요 없다. 물어볼 일이 아니다.
      if (C.isFreeAgent(p, year)) continue;
      const ovr = dev.overall(p);
      if (ovr < POST.minOvr) continue;
      const h = p.hidden || {};
      // 야망이 큰 쪽이 먼저 꺼낸다. 한 번 거절당하면 다음 해엔 더 세게 나온다.
      const amb = Math.max(0, Math.min(2, ((h.ambition ?? 50) - 42) / 18));
      const grudge = 1 + 0.75 * (p.post_refused || 0);
      const edge = Math.max(0, (ovr - POST.minOvr) / 14);
      if (rng.random() > POST.askBase * amb * grudge * (0.5 + edge)) continue;
      out.push({ p, t, ovr, fee: fee(p, ovr) });
    }
  }
  return out.sort((a, b) => b.fee - a.fee);
}

/** 보낸다. 로스터에서 빠지고, 이적료가 들어온다. */
export function approve(L, t, p, feeAmt, rng) {
  for (const arr of [t.batters, t.pitchers, t.farm]) {
    const i = arr.indexOf(p); if (i >= 0) { arr.splice(i, 1); break; }
  }
  p.mlb = 'gone';
  p.mlbLeft = POST.years[Math.floor(rng.random() * POST.years.length)];
  p.mlbFrom = t.team_id;
  p.contract = null;
  t.finance.budget += feeAmt;
  (L.abroad ||= []).push(p);
  L.log(`[포스팅] ${p.name} 메이저리그행 · 이적료 ${feeAmt.toFixed(0)}억 (${t.name})`);
  return p;
}

/** 붙잡는다. 공짜가 아니다. */
export function refuse(p, year) {
  p.post_refused = (p.post_refused || 0) + 1;
  p.post_refused_year = year;
  const h = p.hidden;
  // 구단에 대한 정은 이렇게 깎인다. 재계약 때 저울에 그대로 올라간다.
  if (h) h.w_loyalty = Math.max(0, (h.w_loyalty ?? 0.18) - 0.09);
  return p;
}

/** 한 해가 간다. 다 채운 사람은 돌아온다 — 대개 미계약 신분으로. */
export function tick(L, rng) {
  const back = [];
  const still = [];
  for (const p of (L.abroad || [])) {
    p.age += 1;
    // 저쪽에서 보낸 시간은 그냥 흐르지 않는다. 는 사람도 있고 아닌 사람도 있다.
    const [lo, hi] = POST.backOvr;
    for (const a of dev.attrsOf(p)) p[a] = dev.clamp(p[a] + rng.uniform(lo, hi) * 0.5);
    p.kbo_years = (p.kbo_years ?? 0);
    if (--p.mlbLeft <= 0) {
      p.mlb = null; p.mlbLeft = 0; p.contract = null;
      back.push(p); L.unsigned.push(p);
      L.log(`[복귀] ${p.name} 국내 복귀 (${p.age}세)`);
    } else still.push(p);
  }
  L.abroad = still;
  return back;
}
