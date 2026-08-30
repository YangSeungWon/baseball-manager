// 시즌: 일정 생성 / 하루 단위 진행 / 기록 집계 / WAR / 포스트시즌
import { playGameGen, playGame } from './game.js';
import { scan as scanFeats } from './feats.js';
import * as staff from './staff.js';

// 시즌을 8등분한 강수 확률. 장마가 한가운데에 온다.
const RAIN = [0.088, 0.076, 0.118, 0.200, 0.182, 0.112, 0.070, 0.047];
// 비로 멈춘 경기 중 이미 성립된 것(5회 이후)의 비율. 나머지는 노게임이다.
const CALLED_SHARE = 0.19;
import * as injury from './injury.js';
import { setActive } from './roster.js';
import { attendRate } from './contract.js';

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

export const BAT_LINE = ['g','pa','ab','h','b2','b3','hr','bb','k','rbi','r','sb','cs','hbp','sh'];
export const PIT_LINE = ['g','gs','outs','bf','h','hr','bb','k','r','er','np','w','l','sv','hld','hbp'];

const zeros = (n) => new Array(n).fill(0);
export class SeasonBat {
  constructor(p, team) { this.p = p; this.team = team; for (const f of BAT_LINE) this[f] = 0;
    this.sp = { H:zeros(10), A:zeros(10), L:zeros(10), R:zeros(10), S:zeros(10) }; }
  add(L) { this.g++; for (const f of ['pa','ab','h','b2','b3','hr','bb','k','rbi','sb','cs','hbp','sh']) this[f]+=L[f]; this.r += L.run;
    if (L.sp) for (const k of ['H','A','L','R','S']) for (let i=0;i<10;i++) this.sp[k][i] += L.sp[k][i]; }
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
  constructor(p, team) { this.p = p; this.team = team; for (const f of PIT_LINE) this[f] = 0;
    this.sp = { H:zeros(7), A:zeros(7) }; }
  add(L, started) {
    this.g++; if (started) this.gs++;
    for (const f of ['outs','bf','h','hr','bb','k','r','er','np','hbp']) this[f] += L[f] || 0;
    if (L.sp) for (const k of ['H','A']) for (let i=0;i<7;i++) this.sp[k][i] += L.sp[k][i];
    if (L.w) this.w++; if (L.l) this.l++; if (L.sv) this.sv++; if (L.hld) this.hld++;
  }
  get ip() { return this.outs/3; }
  // 평균자책은 자책점으로 낸다. 실책으로 살아나간 주자의 득점은 빠진다.
  get era() { return this.outs ? this.er*9/this.ip : 0; }
  get ra9() { return this.outs ? this.r*9/this.ip : 0; }
  get pitPerIp() { return this.outs ? this.np/this.ip : 0; }
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
    this.results = []; this.injuries = []; this.feats = [];
    this.postponed = []; this.rained = [];   // 연기된 경기와 그 기록
    this.availDay = new Map(); this.lastUsed = new Map(); this.consec = new Map();
    this.att = new Map(teams.map(t => [t.team_id, { games: 0, total: 0 }]));
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

  /** 등판 간격을 지금 시점 기준으로 다시 계산한다. */
  _refreshAvail(t, day) {
    t.unavailable = new Set(t.bullpen
      .filter(p => (this.availDay.get(p.pid) ?? 0) > day).map(p => p.pid));
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
    const care = staff.injuryMult(t), heal = staff.healMult(t);
    for (const b of t.lineup) {
      const L = S.bat.get(b.pid);
      if (!L || !L.pa) continue;
      const r = injury.roll(b, this.rng, 0, 1, care, heal);
      if (r) this._hurt(b, t, day, r[0], r[1]);
    }
    for (const pl of S.pitchers) {
      if (!pl.bf) continue;
      const r = injury.roll(pl.p, this.rng, pl.fatigue,
        1 + 0.02*Math.max(0, pl.bf-20), care, heal);
      if (r) this._hurt(pl.p, t, day, r[0], r[1]);
    }
  }
  _hurt(p, t, day, days, label) {
    const lost = injury.apply(p, days, this.rng);
    this.injuries.push({ day, team: t, player: p, days, label, lost });
  }

  /** 비. 장마철에 몰리고, 돔은 취소가 없다.
   *  경기 전에 그치면 취소(노게임), 도중에 쏟아지면 강우 콜드다.
   *  콜드로 끝난 경기가 동점이면 무승부로 성립한다. */
  _rain(hi, day) {
    const park = this.teams[hi].park;
    if (park && park.dome) return null;
    const p = RAIN[Math.min(RAIN.length - 1,
      Math.floor(day / this.totalDays * RAIN.length))];
    if (this.rng.random() >= p) return null;
    if (this.rng.random() < CALLED_SHARE) return 5 + Math.floor(this.rng.random() * 4);
    return 'wash';
  }

  /** 오늘 갚을 수 있는 연기 경기. 같은 대진이 다시 잡힌 날에 더블헤더로 치른다.
   *  시즌 막바지에는 남은 것을 몰아서 갚는다. */
  _makeups(day, todays) {
    if (!this.postponed.length) return [];
    const late = day > this.totalDays - 24;
    const busy = new Set();                       // 하루에 세 경기를 뛸 수는 없다
    for (const g of todays) { busy.add(g[0]); busy.add(g[1]); }
    const twice = new Set();
    const out = [];
    for (const g of todays) {
      const i = this.postponed.findIndex(([h, a]) => {
        if (twice.has(h) || twice.has(a)) return false;
        if (h === g[0] && a === g[1]) return true;
        return late && (busy.has(h) && busy.has(a));
      });
      if (i >= 0) {
        const mk = this.postponed.splice(i, 1)[0];
        twice.add(mk[0]); twice.add(mk[1]); out.push(mk);
      }
    }
    return out;
  }

  /** 하루치 경기. watch 에 구단 id 를 주면 그 팀 경기에서 승부처마다 멈춘다. */
  *playDayGen(keepPlays = null, watch = null) {
    const day = this.curDay;
    if (!this.byDay.has(day)) { this.curDay++; return []; }
    this._newDay(day);
    const out = [];
    const todays = this.byDay.get(day);
    // 오늘 치를 경기 = 정규 편성 + 갚을 연기 경기(더블헤더)
    const card = [];
    for (const g of todays) {
      const r = this._rain(g[0], day);
      if (r === 'wash') {
        this.postponed.push([g[0], g[1]]);
        this.rained.push([day, g[0], g[1]]);
        out.push({ hi:g[0], ai:g[1], rain:true, box:null });
        continue;
      }
      card.push(r ? [g[0], g[1], false, r] : g);   // r 이 숫자면 강우 콜드
    }
    for (const g of this._makeups(day, card)) card.push([g[0], g[1], true]);
    for (const [hi, ai, dh, called] of card) {
      // 더블헤더 2차전. 1차전에 쓴 불펜은 다시 나오지 못한다.
      if (dh) for (const i of [hi, ai]) this._refreshAvail(this.teams[i], day);
      const mine = watch != null &&
        (this.teams[hi].team_id === watch || this.teams[ai].team_id === watch);
      const [H, A, plays] = mine
        ? yield* playGameGen(this.teams[hi], this.teams[ai], this.rng, called || 11, watch)
        : playGame(this.teams[hi], this.teams[ai], this.rng, called || 11);
      this._absorb(H, A.runs); this._absorb(A, H.runs);
      this.feats.push(...scanFeats(H, A, this.year, day), ...scanFeats(A, H, this.year, day));
      this._logUsage(H, day); this._logUsage(A, day);
      this._injuryRolls(H, day); this._injuryRolls(A, day);
      // 사구 부상. 맞은 그 자리에서 결정된다.
      for (const S2 of [H, A]) for (const [p, days] of S2.hurt) {
        if (p.injury_days > 0) continue;
        p.injury_days = days; p.career_injuries++; p.career_injury_days += days;
        this.injuries.push({ player:p, team:S2.team, days, label:'사구 부상' });
      }
      this.results.push([day, hi, ai, H.runs, A.runs, dh ? 1 : 0, called ? 1 : 0]);
      // 홈 구단 관중. 성적이 팬을 부르고, 팬이 다음 시즌 예산이 된다.
      const home = this.teams[hi], rec = this.rec.get(home.team_id);
      const wp = rec.g ? rec.w / Math.max(1, rec.w + rec.l) : 0.5;
      const cap = home.park.capacity || 18000;
      const a = this.att.get(home.team_id);
      a.games++;
      a.total += Math.round(cap * attendRate(home.finance, wp,
        home.lastPlayoff || false, home.lastTitle || false, this.rng));
      const keep = keepPlays !== null &&
        (this.teams[hi].team_id === keepPlays || this.teams[ai].team_id === keepPlays);
      out.push({ hi, ai, hr: H.runs, ar: A.runs, dh: !!dh, called: !!called,
                 box: keep ? { H, A, plays } : null });
    }
    this.curDay++;
    return out;
  }

  /** 묻지 않고 하루를 끝낸다. 지금까지의 호출부는 이걸 그대로 쓴다. */
  playDay(keepPlays = null) {
    const g = this.playDayGen(keepPlays, null);
    let r = g.next();
    while (!r.done) r = g.next(null);
    return r.value;
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

/** 포스트시즌 불펜 운용. 정규시즌과 달리 아무도 등판 간격을 관리하지 않아
 *  마무리가 18경기 연속 등판해도 지치지 않는 구멍이 있었다. */
export class PostseasonBullpen {
  constructor(teams) {
    this.day = 0;
    this.avail = new Map();     // pid -> 이 날짜부터 등판 가능
    this.last = new Map();
    this.consec = new Map();
    this.teams = teams;
  }
  /** 경기 전: 등판 불가 명단을 팀에 알린다 */
  apply(t) {
    t.unavailable = new Set(t.bullpen
      .filter(p => (this.avail.get(p.pid) ?? 0) > this.day).map(p => p.pid));
  }
  /** 경기 후: 등판한 불펜의 휴식일을 계산한다 */
  record(S) {
    for (const pl of S.pitchers.slice(1)) {
      const pid = pl.p.pid;
      let rest = pl.bf <= 4 ? 0 : (pl.bf <= 8 ? 1 : 2);
      this.consec.set(pid, this.last.get(pid) === this.day - 1
        ? (this.consec.get(pid) ?? 0) + 1 : 1);
      if (this.consec.get(pid) >= 3) rest = Math.max(rest, 1);
      this.last.set(pid, this.day);
      this.avail.set(pid, this.day + 1 + rest);
    }
  }
  rest(days) { this.day += days; }   // 시리즈 사이 휴식
}

export function playSeries(higher, lower, bestOf, rng, homePattern, bp = null) {
  const need = Math.floor(bestOf/2) + 1;
  const w = { [higher.team_id]: 0, [lower.team_id]: 0 };
  const pat = homePattern || Array(bestOf).fill(true);
  const games = [];
  let g = 0;
  while (Math.max(w[higher.team_id], w[lower.team_id]) < need) {
    const [home, away] = pat[g % pat.length] ? [higher, lower] : [lower, higher];
    let H, A;
    if (bp) { bp.apply(home); bp.apply(away); }
    do { [H, A] = playGame(home, away, rng, 15); } while (H.runs === A.runs);
    if (bp) { bp.record(H); bp.record(A); bp.rest(g % 3 === 2 ? 2 : 1); }  // 3연전 뒤 이동일
    w[(H.runs > A.runs ? home : away).team_id]++;
    games.push({ home: home.name, away: away.name, hr: H.runs, ar: A.runs,
                 hostHigher: home === higher });
    g++;
  }
  return w[higher.team_id] > w[lower.team_id]
    ? [higher, lower, [w[higher.team_id], w[lower.team_id]], games]
    : [lower, higher, [w[lower.team_id], w[higher.team_id]], games];
}

/** 와일드카드 결정전. 4위는 1승만 하면 올라가고, 5위는 2연승해야 한다. */
function wildCard(fourth, fifth, rng, bp) {
  let fifthWins = 0;
  const games = [];
  for (let g = 0; g < 2; g++) {
    let H, A;
    if (bp) { bp.apply(fourth); bp.apply(fifth); }
    do { [H, A] = playGame(fourth, fifth, rng, 15); } while (H.runs === A.runs);  // 4위 홈
    if (bp) { bp.record(H); bp.record(A); bp.rest(1); }
    games.push({ home: fourth.name, away: fifth.name, hr: H.runs, ar: A.runs, hostHigher: true });
    if (A.runs > H.runs) fifthWins++;
    else return [fourth, fifth, [1, fifthWins], games];   // 4위 1승 → 즉시 진출
  }
  return [fifth, fourth, [2, 0], games];
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
  // 불펜 피로를 시리즈 너머로 이어간다. 기다린 상위 시드는 그 사이 회복한다.
  const bp = new PostseasonBullpen(season.teams);
  const [w0,l0,sc0,g0] = wildCard(s[3], s[4], rng, bp);        log.push(['와일드카드', w0, l0, sc0, g0, s[3], s[4]]);
  bp.rest(2);
  const [w1,l1,sc1,g1] = playSeries(s[2], w0, 5, rng, p1, bp); log.push(['준플레이오프', w1, l1, sc1, g1, s[2], w0]);
  bp.rest(3);
  const [w2,l2,sc2,g2] = playSeries(s[1], w1, 5, rng, p1, bp); log.push(['플레이오프', w2, l2, sc2, g2, s[1], w1]);
  bp.rest(4);
  const [w3,l3,sc3,g3] = playSeries(s[0], w2, 7, rng, [true,true,false,false,false,true,true], bp);
  log.push(['한국시리즈', w3, l3, sc3, g3, s[0], w2]);
  return [w3, log];
}
