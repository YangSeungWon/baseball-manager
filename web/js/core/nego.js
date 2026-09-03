// FA 협상.
//
// 시장은 표가 아니라 대화다. 선수는 요구를 하고, 우리는 받거나 자른다.
// 자른 말은 남는다. 그리고 같은 말도 어떻게 하느냐에 따라 다르게 꽂히는데,
// 무엇이 꽂히는지는 그 사람을 겪어봐야 안다 — 능력치와 같은 규칙이다.
import * as C from './contract.js';
import * as M from './market.js';
import * as persona from './persona.js';

export const DAYS = 5;
const isP = (p) => p.kind === 'P';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = (v) => Math.round(v * 10) / 10;

/* ── 어조 ──────────────────────────────────────────────────
   숨은 성향에 따라 먹히는 말이 다르다. 표에는 없다.
   aff: 그 성향이 높을수록 이 어조가 잘 먹히면 +, 역효과면 −.        */
export const TONES = [
  { key:'plain', label:'담담하게', hint:'무난하다. 크게 얻지도 잃지도 않는다',
    gain:0.55, aff:{ professionalism:0.5 } },
  { key:'firm',  label:'단호하게', hint:'선을 긋는다',
    gain:1.00, aff:{ professionalism:0.8, ambition:-0.7, w_money:-0.5 } },
  { key:'warm',  label:'치켜세우며', hint:'자존심을 건드린다',
    gain:1.00, aff:{ ambition:0.9, w_loyalty:0.6, professionalism:-0.4 } },
  { key:'angry', label:'언성을 높여', hint:'크게 얻거나 크게 잃는다',
    gain:1.70, aff:{ work_ethic:0.7, professionalism:-0.9, w_loyalty:-0.6 } },
];
const toneOf = (k) => TONES.find(t => t.key === k) || TONES[0];

/** 그 어조가 이 사람에게 얼마나 먹히는가. −1 ~ +1 근처. */
function toneFit(p, tone) {
  const h = p.hidden || {};
  let s = 0, n = 0;
  for (const k in tone.aff) {
    const raw = h[k];
    if (raw === undefined) continue;
    // 20~80 눈금인 것과 가중치인 것이 섞여 있다
    const z = k.startsWith('w_') ? (raw - (k==='w_money'?1.0:k==='w_loyalty'?0.18:0.5))
                                   / 0.6 : (raw - 50) / 14;
    s += tone.aff[k] * z; n += Math.abs(tone.aff[k]);
  }
  return n ? clamp(s / n, -1.4, 1.4) : 0;
}

/* ── 요구 ──────────────────────────────────────────────────
   한 번에 하나만 말한다. 여러 개를 늘어놓으면 표가 되어버린다.      */
const DEMANDS = {
  money: { label:'금액', say:(d) => `총액 ${r1(d.want)}억은 되어야 한다고 한다` },
  years: { say:(d) => `${d.want}년은 보장해 달라고 한다`, label:'기간' },
  starter: { label:'주전 보장', say:() => '주전으로 쓴다는 약속을 원한다' },
  optout:  { label:'옵트아웃',  say:() => '중간에 나갈 수 있는 조항을 넣어 달라고 한다' },
};

function askDemand(row, rng) {
  const p = row.p, h = p.hidden || {}, o = row.offer;
  const cands = [];
  if (!o || o.total < row.ask.total * 0.98)
    cands.push(['money', (h.w_money ?? 1) * 1.5,
      { want: Math.max(row.ask.total, (o ? o.total : 0) * 1.12) }]);
  if (!o || o.years < row.wantYears)
    cands.push(['years', 0.8 + (p.age >= 33 ? 0.9 : 0), { want: row.wantYears }]);
  if (o && !o.starter) cands.push(['starter', (h.w_playtime ?? 0.45) * 2.2, {}]);
  if (o && !o.optout && p.age <= 32) cands.push(['optout', (h.ambition ?? 50) / 60, {}]);
  if (!cands.length) return null;
  const tot = cands.reduce((a, c) => a + Math.max(0.05, c[1]), 0);
  let r = rng.random() * tot;
  for (const [key, w, extra] of cands) { r -= Math.max(0.05, w); if (r <= 0)
    return { key, ...extra, text: DEMANDS[key].say(extra), label: DEMANDS[key].label }; }
  return null;
}

/* ── 협상 ────────────────────────────────────────────────── */
export class Negotiation {
  constructor(L, year, pool, userTeam) {
    this.L = L; this.year = year; this.me = userTeam;
    this.day = 0; this.closed = false; this.log = [];
    this.room = M.faRoom(L, year);
    this.rows = new Map();
    for (const p of pool) {
      const r = L.see(this.me, p);
      const aav = C.marketValue(r.ovr, p.age, isP(p));
      const yrs = C.demandYears(p.age, r.ovr);
      this.rows.set(p.pid, {
        pid: p.pid, p, from: p.former_team ?? null,
        ask: { years: yrs, aav: r1(aav), total: r1(aav * yrs) },
        wantYears: yrs, offer: null, demand: null, mood: 50,
        heat: this._heat(p), talked: 0, tones: {}, signed: null, walked: false,
        news: [],
      });
    }
  }
  // 다른 구단이 이 선수를 얼마나 원하는가. 처음엔 우리도 모른다.
  _heat(p) {
    let n = 0;
    for (const t of this.L.teams) {
      if (t === this.me) continue;
      if (M.needScore(this.L, t, p, this.L.see(t, p).ovr) > 0.34) n++;
    }
    return n;
  }
  row(pid) { return this.rows.get(pid); }
  list() { return [...this.rows.values()]; }

  /** 제시한다. 금액을 올리면 기분이 풀리고, 깎으면 상한다. */
  offer(pid, years, aav, opts = {}) {
    const row = this.row(pid); if (!row || row.signed || row.walked) return { error:'closed' };
    years = clamp(Math.round(+years) || 1, 1, 7);
    aav = Math.max(C.MIN_SALARY, +aav || C.MIN_SALARY);
    // 없는 돈은 못 쓴다. 다만 최소 계약은 언제나 가능하다.
    const room = Math.max(this.room.get(this.me.team_id) ?? 0, C.MIN_SALARY * 1.6);
    if (aav > room + 1e-9) return { error:'budget', room: r1(room), aav: r1(aav) };
    const prev = row.offer;
    const total = r1(aav * years);
    row.offer = { years, aav: r1(aav), total, starter: !!opts.starter, optout: !!opts.optout };
    if (prev) row.mood = clamp(row.mood + (total > prev.total ? 3 : total < prev.total ? -6 : 0), 0, 100);
    row.p.talks = (row.p.talks || 0) + (prev ? 0 : 1);   // 협상 자리에서 사람이 드러난다
    if (row.demand && this._met(row, row.demand)) {
      row.news.push(`${row.demand.label} 요구를 맞췄다`);
      row.demand = null; row.mood = clamp(row.mood + 8, 0, 100);
    }
    return { ok:true, offer: row.offer };
  }
  cancel(pid) { const r = this.row(pid); if (r) { r.offer = null; r.demand = null; } return { ok:true }; }

  _met(row, d) {
    const o = row.offer; if (!o) return false;
    if (d.key === 'money') return o.total >= d.want * 0.995;
    if (d.key === 'years') return o.years >= d.want;
    if (d.key === 'starter') return o.starter;
    if (d.key === 'optout') return o.optout;
    return false;
  }

  /** 요구에 답한다. 받거나 자르거나 — 그리고 어떻게 말하느냐. */
  respond(pid, accept, toneKey = 'plain') {
    const row = this.row(pid);
    if (!row || row.signed || row.walked) return { error:'closed' };
    if (!row.demand) return { error:'no_demand' };
    const d = row.demand, tone = toneOf(toneKey), p = row.p;
    row.p.talks = (row.p.talks || 0) + 1;
    const fit = toneFit(p, tone);
    // 같은 어조를 되풀이하면 무뎌진다
    const used = row.tones[tone.key] || 0; row.tones[tone.key] = used + 1;
    const worn = 1 / (1 + 0.45 * used);
    const swing = tone.gain * worn * (2.5 + 9.5 * Math.abs(fit)) * (fit >= 0 ? 1 : -1);
    let msg;
    if (accept) {
      const o = row.offer || { years: row.ask.years, aav: row.ask.aav, total: row.ask.total,
                               starter:false, optout:false };
      if (d.key === 'money') { const yrs = o.years; this.offer(pid, yrs, d.want / yrs, o); }
      else if (d.key === 'years') this.offer(pid, d.want, o.aav, o);
      else this.offer(pid, o.years, o.aav, { ...o, [d.key]: true });
      row.mood = clamp(row.mood + 10 + Math.max(0, swing) * 0.5, 0, 100);
      msg = fit >= 0 ? '고개를 끄덕인다' : '받아들이지만 표정은 밝지 않다';
    } else {
      row.mood = clamp(row.mood - 12 + swing, 0, 100);
      msg = swing > 4 ? '납득한 얼굴이다' : swing > -2 ? '잠시 말이 없다'
          : swing > -8 ? '표정이 굳는다' : '자리에서 일어설 기세다';
      row.news.push(`${d.label} 요구를 거절했다`);
    }
    row.demand = null;
    if (row.mood <= 8) { row.walked = true; row.news.push('협상이 깨졌다');
      this.log.push(`${p.name} 협상 결렬`); }
    return { ok:true, msg, mood: row.mood, walked: row.walked, tone: tone.label };
  }

  /** 우리 제시가 그에게 얼마짜리인가. 기분이 저울에 얹힌다. */
  _util(row, total, best) {
    const p = row.p, o = row.offer;
    const play = o && o.starter ? 1 : M.playChance(this.L, this.me, p);
    const u = M.faUtility(p, { total }, best, this.me, row.from,
      this.L.recPct.get(this.me.team_id) ?? 0.5, play);
    return u * (0.72 + 0.56 * (row.mood / 100)) * (o && o.optout ? 1.05 : 1);
  }

  /** 하루가 간다. 다른 구단이 움직이고, 몇은 도장을 찍는다. */
  advance() {
    if (this.closed) return { done:true };
    const rng = this.L.rng, y = this.year;
    this.day++;
    const late = this.day / DAYS;
    for (const row of this.list()) {
      if (row.signed || row.walked) continue;
      const p = row.p;
      // 다른 구단의 최고 제시. 날이 갈수록 오른다.
      let bestAI = 0, bestTeam = null, bestYrs = 1, bestAav = C.MIN_SALARY;
      for (const t of this.L.teams) {
        if (t === this.me) continue;
        const r = this.L.see(t, p);
        const need = M.needScore(this.L, t, p, r.ovr);
        if (need <= 0) continue;
        const cap = this.room.get(t.team_id) ?? 0;
        const floor = C.MIN_SALARY * 1.6;
        let aav = Math.min(cap, C.marketValue(r.ovr, p.age, isP(p))
          * (0.74 + 0.55 * need + 0.30 * late) * rng.uniform(0.92, 1.10));
        if (aav < floor) { if (need < 0.42) continue; aav = floor; }
        const yrs = Math.max(1, Math.min(C.demandYears(p.age, r.ovr), p.age <= 30 ? 5 : 3));
        const tot = aav * yrs;
        if (tot > bestAI) { bestAI = tot; bestTeam = t; bestYrs = yrs; bestAav = aav; }
      }
      row.bestAI = bestAI; row.bestTeam = bestTeam; row.news = [];
      const mine = row.offer ? row.offer.total : 0;
      const best = Math.max(mine, bestAI, 0.1);

      // 에이전트가 말을 건다 — 제시가 있어야 대화가 열린다.
      // 처음 제시한 날은 반드시 한 마디 돌아온다. 돈만 던지고 끝나면 협상이 아니다.
      const first = row.offer && !row.opened;
      if (first) row.opened = true;
      if (row.offer && !row.demand && (first || rng.random() < 0.55))
        row.demand = askDemand(row, rng);
      if (row.offer) {
        if (bestAI > mine * 1.12) row.news.push(
          row.heat >= 3 ? '여러 구단이 더 부른다고 한다' : '더 부르는 곳이 있다고 한다');
        else if (mine > bestAI * 1.15) row.news.push('우리 쪽으로 기울었다는 이야기가 돈다');
      }
      // 답을 기다리는 동안에는 도장을 찍지 않는다. 마지막 날은 예외다.
      if ((first || row.demand) && this.day < DAYS) continue;
      // 도장. 늦을수록 결심이 선다.
      const uMine = mine > 0 ? this._util(row, mine, best) : 0;
      const uAI = bestAI > 0 ? M.faUtility(p, { total: bestAI }, best, bestTeam, row.from,
        this.L.recPct.get(bestTeam?.team_id) ?? 0.5, M.playChance(this.L, bestTeam, p)) : 0;
      const decisive = 0.97 - 0.28 * late;
      const top = Math.max(uMine, uAI);
      if (top >= decisive || this.day >= DAYS) {
        if (uMine >= uAI && mine > 0) this._sign(row, this.me, row.offer);
        else if (bestAI > 0) this._sign(row, bestTeam, { years: bestYrs, aav: bestAav });
        else if (this.day >= DAYS) { p.contract = null; this.L.unsigned.push(p);
          row.unsigned = true; row.news.push('아무도 부르지 않았다'); }
      }
    }
    if (this.day >= DAYS) this.closed = true;
    return { day: this.day, days: DAYS, done: this.closed };
  }

  _sign(row, team, deal) {
    const p = row.p;
    const ct = new C.Contract(this.year + 1, Array(deal.years).fill(Math.round(deal.aav*100)/100));
    if (deal.optout) ct.optout = true;
    p.contract = ct;
    if (deal.starter) p.promised_starter = this.year + 1;
    (isP(p) ? team.pitchers : team.batters).push(p);
    this.room.set(team.team_id, Math.max(0, (this.room.get(team.team_id) ?? 0) - ct.aav));
    row.signed = { team, contract: ct, mine: team === this.me };
    this.log.push(`[FA] ${p.name}(${p.age}세) ${team.name} ${ct.years}년 ${ct.total.toFixed(0)}억`
      + ` (${team === row.from ? '잔류' : '이적'})`);
  }

  /** 남은 사람 정리. 시장은 언젠가 닫힌다. */
  finish() {
    for (const row of this.list()) {
      if (row.signed) continue;
      const p = row.p;
      if (!p.contract) { p.contract = null; if (!this.L.unsigned.includes(p)) this.L.unsigned.push(p); }
    }
    this.closed = true;
    return this.list().filter(r => r.signed).map(r => ({
      player: r.p, team: r.signed.team, contract: r.signed.contract, from: r.from }));
  }
}
