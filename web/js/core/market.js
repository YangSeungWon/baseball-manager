// FA 시장 & 트레이드. 두 시장 모두 팀의 스카우팅 추정치로 돌아간다.
import * as C from './contract.js';

export const CONTENDER = '우승도전', NEUTRAL = '중립', REBUILD = '리빌딩';
export const MODE_W = {
  [CONTENDER]: [1.45,1.18,0.92,0.72,0.58,0.48],
  [NEUTRAL]:   [1.04,1.02,1.00,0.96,0.92,0.88],
  [REBUILD]:   [0.55,0.82,1.12,1.28,1.30,1.24],
};
const w_ = (mode, i) => MODE_W[mode][Math.min(i, MODE_W[mode].length-1)];
const isP = (p) => p.kind === 'P';

export function teamMode(t, rec) {
  const pct = rec ? rec.pct : 0.5;
  const ages = [...t.lineup, ...t.rotation].map(p => p.age);
  const avgAge = ages.length ? ages.reduce((a,b)=>a+b,0)/ages.length : 28;
  if (pct >= 0.545 || (pct >= 0.50 && avgAge >= 28.5)) return CONTENDER;
  if (pct <= 0.455 && avgAge <= 28.5) return REBUILD;
  return NEUTRAL;
}

export function tradeValue(L, t, p, year, mode, inFarm = false) {
  const ip = isP(p);
  if (inFarm) {
    const pot = L.see(t, p).pot;
    const reach = Math.max(0.04, Math.min(0.88, (pot - 43)/21));
    const eta = Math.max(1, Math.min(5, 23 - p.age));
    let val = 0;
    for (let i = 0; i < 6; i++) val += C.projWar(pot,26,ip)*C.WAR_PRICE*0.55*reach*w_(mode, eta+i);
    return val;
  }
  const ovr = L.see(t, p).ovr;
  const rem = C.controlHorizon(p, ovr, year, ip);
  if (!rem.length) return 0;
  let v = 0;
  rem.forEach((sal, i) => { v += C.projWar(ovr, p.age, ip, i+1)*C.WAR_PRICE*w_(mode,i) - sal; });
  return v;
}

function faUtility(p, offer, bestTotal, team, curTeam, winPct, playChance) {
  const h = p.hidden;
  const wm=h.w_money??1, ww=h.w_winning??0.55, wp=h.w_playtime??0.45, wl=h.w_loyalty??0.18;
  const s = wm+ww+wp+wl;
  const money = bestTotal > 0 ? offer.total/bestTotal : 0;
  return (wm*money + ww*Math.min(1.5, winPct/0.5 - 0.4) + wp*playChance
    + wl*(team === curTeam ? 1 : 0)) / s;
}

function needScore(L, t, p, ovr) {
  const ip = isP(p);
  const pool = ip ? t.pitchers : t.batters;
  if (!pool.length) return 1;
  const vals = pool.map(x => L.see(t,x).ovr).sort((a,b)=>b-a);
  const cap = ip ? 12 : 13;
  const bar = pool.length >= cap+2
    ? (vals.length >= cap ? vals[cap-1] : vals[vals.length-1])
    : vals[Math.min(vals.length-1, cap-3)];
  let gain = ovr - bar;
  if (gain <= -3) return 0;
  if (!ip && !pool.some(b => b.position === p.position)) gain += 4;
  return Math.max(0, Math.min(1, 0.18 + gain/12));
}

function playChance(L, t, p) {
  const pool = isP(p) ? t.pitchers : t.batters;
  if (!pool.length) return 1;
  const ovr = L.see(t,p).ovr;
  const better = pool.filter(x => L.see(t,x).ovr > ovr).length;
  return Math.max(0, Math.min(1, 1 - better/(isP(p) ? 8 : 9)));
}

export function runFreeAgency(L, year, extra = [], userOffers = null, userTeam = null, log = null) {
  const rng = L.rng;
  const signings = [];
  const pool = [];
  for (const t of L.teams) {
    for (const group of ['batters','pitchers']) {
      const keep = [];
      for (const p of t[group]) {
        if (p.contract && p.contract.end_year > year) { keep.push(p); continue; }
        if (C.isFreeAgent(p, year)) { p.former_team = t; pool.push(p); }
        else {
          const ovr = L.see(t,p).ovr;
          p.contract = new C.Contract(year+1, [C.renewalSalary(p, ovr, isP(p))]);
          keep.push(p);
        }
      }
      t[group] = keep;
    }
  }
  for (const p of extra) pool.push(p);
  L.unsigned = [];
  if (!pool.length) return signings;

  const room = new Map(L.teams.map(t => [t.team_id, Math.max(0, t.finance.budget - C.payroll(t, year+1))]));
  const mv = (p) => {
    const best = Math.max(...L.teams.map(t => L.see(t,p).ovr));
    return C.marketValue(best, p.age, isP(p));
  };
  pool.sort((a,b) => mv(b) - mv(a));

  for (const p of pool) {
    const ip = isP(p);
    const offers = [];
    if (userOffers && userOffers.has(p.pid) && userTeam) {
      const [yrs, aav] = userOffers.get(p.pid);
      offers.push([userTeam, new C.Contract(year+1, Array(yrs).fill(Math.round(aav*100)/100))]);
    }
    for (const t of L.teams) {
      if (userTeam && t === userTeam) continue;
      const r = L.see(t, p);
      const need = needScore(L, t, p, r.ovr);
      if (need <= 0) continue;
      const aav0 = C.marketValue(r.ovr, p.age, ip);
      const aggression = 0.70 + 0.58*need + 0.32*Math.min(1, room.get(t.team_id)/40);
      let bid = aav0 * aggression * rng.uniform(0.88, 1.16);
      let cap = room.get(t.team_id);
      if (t === p.former_team) cap *= 1.10;
      if (bid > cap) bid = cap;
      if (bid < C.MIN_SALARY) { if (need < 0.42) continue; bid = C.MIN_SALARY*1.6; }
      const yrs = Math.max(1, Math.min(C.demandYears(p.age, r.ovr), p.age <= 30 ? 5 : 3));
      offers.push([t, new C.Contract(year+1, Array(yrs).fill(Math.round(bid*100)/100))]);
    }
    if (!offers.length) { p.contract = null; L.unsigned.push(p); continue; }
    const bestTotal = Math.max(...offers.map(o => o[1].total));
    const cur = p.former_team ?? null;
    const pick = offers.reduce((a,b) => {
      const ua = faUtility(p, a[1], bestTotal, a[0], cur, L.recPct.get(a[0].team_id) ?? 0.5, playChance(L, a[0], p));
      const ub = faUtility(p, b[1], bestTotal, b[0], cur, L.recPct.get(b[0].team_id) ?? 0.5, playChance(L, b[0], p));
      return ub > ua ? b : a;
    });
    const [t, ct] = pick;
    p.contract = ct;
    (ip ? t.pitchers : t.batters).push(p);
    room.set(t.team_id, Math.max(0, room.get(t.team_id) - ct.aav));
    signings.push({ player: p, team: t, contract: ct, from: cur });
    if (log && ct.total >= 25) log(`[FA] ${p.name}(${p.age}세) ${t.name} ${ct.years}년 ${ct.total.toFixed(0)}억 (${t===cur?'잔류':'이적'})`);
  }
  return signings;
}

function locked(t, p, farm) {
  if (farm) return false;
  if (p.kind === 'B') return t.batters.filter(b => b.position === p.position).length <= 1;
  return t.pitchers.filter(x => x.role === 'SP').length <= 5 && p.role === 'SP';
}
export function movePlayer(src, p, farm, dst) {
  const arr = farm ? src.farm : (p.kind === 'B' ? src.batters : src.pitchers);
  arr.splice(arr.indexOf(p), 1);
  (farm ? dst.farm : (p.kind === 'B' ? dst.batters : dst.pitchers)).push(p);
}

export function runTrades(L, year, modes, log = null, maxTrades = 6) {
  const rng = L.rng;
  const val = new Map();
  const V = (t, p, farm) => {
    const k = `${t.team_id}:${p.pid}`;
    if (!val.has(k)) val.set(k, tradeValue(L, t, p, year, modes.get(t.team_id), farm));
    return val.get(k);
  };
  // 외국인은 오가지 않는다. 보유 쿼터가 걸려 있어 사실상 트레이드가 안 된다.
  const assets = (t) => [...t.batters, ...t.pitchers].filter(p => !p.foreign).map(p => [p, false])
    .concat(t.farm.filter(p => p.age >= 19 && !p.foreign).map(p => [p, true]));

  let done = 0;
  const perTeam = new Map(L.teams.map(t => [t.team_id, 0]));
  const CAP = 2;
  const pairs = [];
  for (let i = 0; i < L.teams.length; i++)
    for (let j = i+1; j < L.teams.length; j++) pairs.push([L.teams[i], L.teams[j]]);
  rng.shuffle(pairs);
  for (const [A, B] of pairs) {
    if (done >= maxTrades) break;
    if (perTeam.get(A.team_id) >= CAP || perTeam.get(B.team_id) >= CAP) continue;
    let best = null;
    for (const [pa, fa] of assets(A)) {
      if (locked(A, pa, fa)) continue;
      const vaA = V(A, pa, fa), vaB = V(B, pa, fa);
      for (const [pb, fb] of assets(B)) {
        if (locked(B, pb, fb) || (fa !== fb && Math.abs(vaA) < 1)) continue;
        const vbB = V(B, pb, fb), vbA = V(A, pb, fb);
        const gainA = vbA - vaA, gainB = vaB - vbB;
        if (gainA > 6 && gainB > 6) {
          const sc = Math.min(gainA, gainB);
          if (!best || sc > best[0]) best = [sc, pa, fa, pb, fb];
        }
      }
    }
    if (best) {
      const [, pa, fa, pb, fb] = best;
      movePlayer(A, pa, fa, B); movePlayer(B, pb, fb, A);
      done++; perTeam.set(A.team_id, perTeam.get(A.team_id)+1);
      perTeam.set(B.team_id, perTeam.get(B.team_id)+1);
      if (log) log(`[트레이드] ${A.name} ${pa.name}${fa?'(유망주)':''} ↔ ${B.name} ${pb.name}${fb?'(유망주)':''}`);
    }
  }
  return done;
}
