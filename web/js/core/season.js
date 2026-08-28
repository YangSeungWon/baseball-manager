// 시즌: 일정 생성 / 하루 단위 진행 / 기록 집계 / WAR / 포스트시즌
import { playGame } from './game.js';
import * as injury from './injury.js';
import { setActive } from './roster.js';

export function makeSchedule(nTeams, gamesPerTeam, rng) {
  const rounds = nTeams - 1;
  const cycles = gamesPerTeam / rounds;
  if (!Number.isInteger(cycles))
    throw new Error(`${gamesPerTeam}경기는 ${nTeams}팀 라운드로빈으로 나누어떨어지지 않는다`);
  const sched = []; let day = 0;
  for (let c = 0; c < cycles; c++) {
    let arr = Array.from({length: nTeams}, (_, i) => i);
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < nTeams/2; i++) {
        const a = arr[i], b = arr[nTeams-1-i];
        sched.push((c+i) % 2 === 0 ? [day, a, b] : [day, b, a]);
      }
      arr = [arr[0], arr[arr.length-1], ...arr.slice(1, -1)];
      day++;
    }
  }
  return sched;
}

export const BAT_LINE = ['g','pa','ab','h','b2','b3','hr','bb','k','rbi','r','sb','cs','hbp'];
export const PIT_LINE = ['g','gs','outs','bf','h','hr','bb','k','r','w','l','sv','hld','hbp'];

export class SeasonBat {
  constructor(p, team) { this.p = p; this.team = team; for (const f of BAT_LINE) this[f] = 0; }
  add(L) { this.g++; for (const f of ['pa','ab','h','b2','b3','hr','bb','k','rbi','sb','cs','hbp']) this[f]+=L[f]; this.r += L.run; }
  get b1() { return this.h - this.b2 - this.b3 - this.hr; }
  get avg() { return this.ab ? this.h/this.ab : 0; }
  get obp() { return this.pa ? (this.h+this.bb+this.hbp)/this.pa : 0; }
  get tb() { return this.b1 + 2*this.b2 + 3*this.b3 + 4*this.hr; }
  get slg() { return this.ab ? this.tb/this.ab : 0; }
  get ops() { return this.obp + this.slg; }
  get woba() { return this.pa ? (0.69*this.bb + 0.72*this.hbp + 0.89*this.b1
    + 1.27*this.b2 + 1.62*this.b3 + 2.10*this.hr)/this.pa : 0; }
}

export class SeasonPit {
  constructor(p, team) { this.p = p; this.team = team; for (const f of PIT_LINE) this[f] = 0; }
  add(L, started) {
    this.g++; if (started) this.gs++;
    for (const f of ['outs','bf','h','hr','bb','k','r','hbp']) this[f] += L[f];
    if (L.w) this.w++; if (L.l) this.l++; if (L.sv) this.sv++; if (L.hld) this.hld++;
  }
  get ip() { return this.outs/3; }
  get era() { return this.outs ? this.r*9/this.ip : 0; }
  get whip() { return this.outs ? (this.h+this.bb)/this.ip : 0; }
  get k9() { return this.outs ? this.k*9/this.ip : 0; }
  get ipStr() { return `${Math.floor(this.outs/3)}.${this.outs%3}`; }
  get fipRaw() { return this.outs ? (13*this.hr + 3*(this.bb+this.hbp) - 2*this.k)/this.ip : 0; }
}

export class TeamRecord {
  constructor(team) { this.team = team; this.w = this.l = this.d = this.rs = this.ra = 0; }
  /** KBO 승률은 무승부를 제외한다 */
  get pct() { return (this.w+this.l) ? this.w/(this.w+this.l) : 0; }
  get g() { return this.w + this.l + this.d; }
  get pyth() { if (!this.rs && !this.ra) return 0;
    const e = 1.83; return this.rs**e / (this.rs**e + this.ra**e); }
}

const POS_ADJ = { C:12.5, SS:7.0, '2B':2.5, '3B':2.5, CF:2.5, LF:-7.0, RF:-7.0, '1B':-12.5, DH:-17.5 };
const RUNS_PER_WIN = 9.5;

export function batterWar(sb, lgWoba) {
  if (!sb.pa) return 0;
  const wraa = (sb.woba - lgWoba)/1.25 * sb.pa;
  const pos = (POS_ADJ[sb.p.position] ?? 0) * sb.pa/600;
  return (wraa + pos + 20*sb.pa/600) / RUNS_PER_WIN;
}
export function pitcherWar(sp, lgRa9) {
  if (!sp.outs) return 0;
  const repl = lgRa9 * (sp.gs >= sp.g*0.5 ? 1.22 : 1.35);
  return (repl - sp.era) * sp.ip/9 / RUNS_PER_WIN;
}

export class Season {
  constructor(teams, year, games, rng) {
    this.teams = teams; this.year = year; this.games = games; this.rng = rng;
    this.schedule = makeSchedule(teams.length, games, rng);
    this.byDay = new Map();
    for (const [d,h,a] of this.schedule) {
      if (!this.byDay.has(d)) this.byDay.set(d, []);
      this.byDay.get(d).push([h,a]);
    }
    this.curDay = 0;
    this.rec = new Map(teams.map(t => [t.team_id, new TeamRecord(t)]));
    this.bat = new Map(); this.pit = new Map();
    this.results = []; this.injuries = [];
    this.availDay = new Map(); this.lastUsed = new Map(); this.consec = new Map();
  }
  get totalDays() { return this.byDay.size ? Math.max(...this.byDay.keys()) + 1 : 0; }
  get finished() { return this.curDay >= this.totalDays; }
  get gamesPlayed() { return Math.max(0, ...[...this.rec.values()].map(r => r.g)); }

  _bat(p, t) { if (!this.bat.has(p.pid)) this.bat.set(p.pid, new SeasonBat(p, t)); return this.bat.get(p.pid); }
  _pit(p, t) { if (!this.pit.has(p.pid)) this.pit.set(p.pid, new SeasonPit(p, t)); return this.pit.get(p.pid); }

  _absorb(S, oppRuns) {
    const r = this.rec.get(S.team.team_id);
    r.rs += S.runs; r.ra += oppRuns;
    if (S.runs > oppRuns) r.w++; else if (S.runs < oppRuns) r.l++; else r.d++;
    for (const L of S.bat.values()) if (L.pa) this._bat(L.b, S.team).add(L);
    S.pitchers.forEach((pl, i) => this._pit(pl.p, S.team).add(pl, i === 0));
  }

  _newDay(day) {
    for (const t of this.teams) {
      for (const p of [...t.batters, ...t.pitchers, ...t.farm]) if (p.injury_days > 0) p.injury_days--;
      setActive(t, this.rng, this.year);
      t.unavailable = new Set(t.bullpen.filter(p => (this.availDay.get(p.pid) ?? 0) > day).map(p => p.pid));
    }
  }

  _logUsage(S, day) {
    for (const pl of S.pitchers.slice(1)) {
      const pid = pl.p.pid;
      let rest = pl.bf <= 4 ? 0 : (pl.bf <= 8 ? 1 : 2);
      this.consec.set(pid, this.lastUsed.get(pid) === day - 1 ? (this.consec.get(pid) ?? 0) + 1 : 1);
      if (this.consec.get(pid) >= 3) rest = Math.max(rest, 1);
      if (this.consec.get(pid) >= 4) rest = Math.max(rest, 2);
      this.lastUsed.set(pid, day);
      this.availDay.set(pid, day + 1 + rest);
    }
  }

  _injuryRolls(S, day) {
    const t = S.team;
    for (const b of t.lineup) {
      const L = S.bat.get(b.pid);
      if (!L || !L.pa) continue;
      const r = injury.roll(b, this.rng);
      if (r) this._hurt(b, t, day, r[0], r[1]);
    }
    for (const pl of S.pitchers) {
      if (!pl.bf) continue;
      const r = injury.roll(pl.p, this.rng, pl.fatigue, 1 + 0.02*Math.max(0, pl.bf-20));
      if (r) this._hurt(pl.p, t, day, r[0], r[1]);
    }
  }
  _hurt(p, t, day, days, label) {
    const lost = injury.apply(p, days, this.rng);
    this.injuries.push({ day, team: t, player: p, days, label, lost });
  }

  playDay(keepPlays = null) {
    const day = this.curDay;
    if (!this.byDay.has(day)) { this.curDay++; return []; }
    this._newDay(day);
    const out = [];
    for (const [hi, ai] of this.byDay.get(day)) {
      const [H, A, plays] = playGame(this.teams[hi], this.teams[ai], this.rng);
      this._absorb(H, A.runs); this._absorb(A, H.runs);
      this._logUsage(H, day); this._logUsage(A, day);
      this._injuryRolls(H, day); this._injuryRolls(A, day);
      this.results.push([day, hi, ai, H.runs, A.runs]);
      const keep = keepPlays !== null &&
        (this.teams[hi].team_id === keepPlays || this.teams[ai].team_id === keepPlays);
      out.push({ hi, ai, hr: H.runs, ar: A.runs, box: keep ? { H, A, plays } : null });
    }
    this.curDay++;
    return out;
  }

  run() { while (!this.finished) this.playDay(); return this; }

  get lgWoba() {
    let pa = 0, num = 0;
    for (const b of this.bat.values()) { pa += b.pa; num += b.woba * b.pa; }
    return pa ? num/pa : 0;
  }
  get lgRa9() {
    let outs = 0, r = 0;
    for (const p of this.pit.values()) { outs += p.outs; r += p.r; }
    return outs ? r*27/outs : 0;
  }
  get fipConst() {
    let outs = 0, r = 0, raw = 0;
    for (const p of this.pit.values()) { outs += p.outs; r += p.r;
      raw += 13*p.hr + 3*(p.bb+p.hbp) - 2*p.k; }
    if (!outs) return 0;
    const ip = outs/3;
    return r*9/ip - raw/ip;
  }
  fip(p) { return p.fipRaw + this.fipConst; }

  standings() {
    return [...this.rec.values()].sort((a,b) => (b.pct - a.pct) || ((b.rs-b.ra) - (a.rs-a.ra)));
  }
  qualifiedBatters(g = null) {
    const need = 3.1 * (g ?? this.games);
    return [...this.bat.values()].filter(b => b.pa >= need);
  }
  qualifiedPitchers(g = null) {
    const need = 1.0 * (g ?? this.games);
    return [...this.pit.values()].filter(p => p.ip >= need);
  }
  wars() {
    const lw = this.lgWoba, lr = this.lgRa9;
    const bw = new Map(), pw = new Map();
    for (const b of this.bat.values()) bw.set(b.p.pid, batterWar(b, lw));
    for (const p of this.pit.values()) pw.set(p.p.pid, pitcherWar(p, lr));
    return [bw, pw];
  }
}

export function playSeries(higher, lower, bestOf, rng, homePattern) {
  const need = Math.floor(bestOf/2) + 1;
  const w = { [higher.team_id]: 0, [lower.team_id]: 0 };
  const pat = homePattern || Array(bestOf).fill(true);
  let g = 0;
  while (Math.max(w[higher.team_id], w[lower.team_id]) < need) {
    const [home, away] = pat[g % pat.length] ? [higher, lower] : [lower, higher];
    let H, A;
    do { [H, A] = playGame(home, away, rng); } while (H.runs === A.runs);
    w[(H.runs > A.runs ? home : away).team_id]++;
    g++;
  }
  return w[higher.team_id] > w[lower.team_id]
    ? [higher, lower, [w[higher.team_id], w[lower.team_id]]]
    : [lower, higher, [w[lower.team_id], w[higher.team_id]]];
}

/** 와일드카드 결정전. 4위는 1승만 하면 올라가고, 5위는 2연승해야 한다. */
function wildCard(fourth, fifth, rng) {
  let fifthWins = 0;
  for (let g = 0; g < 2; g++) {
    let H, A;
    do { [H, A] = playGame(fourth, fifth, rng); } while (H.runs === A.runs);  // 4위 홈
    if (A.runs > H.runs) fifthWins++;
    else return [fourth, fifth, [1, fifthWins]];        // 4위 1승 → 즉시 진출
  }
  return [fifth, fourth, [2, 0]];
}

export function postseason(season, rng) {
  const st = season.standings();
  const log = [];
  if (st.length < 5) {                                  // 소규모 리그 대비
    const s = st.slice(0,4).map(r => r.team);
    const p1 = [true,true,false,false,true];
    const [w1,l1,sc1] = playSeries(s[2], s[3], 5, rng, p1); log.push(['준플레이오프', w1, l1, sc1]);
    const [w2,l2,sc2] = playSeries(s[1], w1, 5, rng, p1); log.push(['플레이오프', w2, l2, sc2]);
    const [w3,l3,sc3] = playSeries(s[0], w2, 7, rng, [true,true,false,false,false,true,true]);
    log.push(['한국시리즈', w3, l3, sc3]);
    return [w3, log];
  }
  const s = st.slice(0,5).map(r => r.team);
  const p1 = [true,true,false,false,true];
  const [w0,l0,sc0] = wildCard(s[3], s[4], rng);        log.push(['와일드카드', w0, l0, sc0]);
  const [w1,l1,sc1] = playSeries(s[2], w0, 5, rng, p1); log.push(['준플레이오프', w1, l1, sc1]);
  const [w2,l2,sc2] = playSeries(s[1], w1, 5, rng, p1); log.push(['플레이오프', w2, l2, sc2]);
  const [w3,l3,sc3] = playSeries(s[0], w2, 7, rng, [true,true,false,false,false,true,true]);
  log.push(['한국시리즈', w3, l3, sc3]);
  return [w3, log];
}
