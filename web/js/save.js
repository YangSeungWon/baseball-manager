// 자동저장 단일 슬롯. 불러오기 UI 는 없고, 백업용 내보내기/가져오기만 남긴다.
import { Game } from './core/api.js';
import { League, Career } from './core/league.js';
import { Season, SeasonBat, SeasonPit, TeamRecord, BAT_LINE, PIT_LINE } from './core/season.js';
import { RNG } from './core/rng.js';
import * as R from './core/roster.js';
import * as C from './core/contract.js';
import * as dev from './core/development.js';
import { ScoutingDept } from './core/scouting.js';
import { DraftSession } from './core/draft.js';
import { Mailbox } from './core/mail.js';

export const VERSION = 2;
const BF = ['contact','avoid_k','discipline','gap_power','hr_power','speed','fielding','arm','gb_tendency'];
const PF = ['stuff','command','movement','stamina','velo','gb_tendency'];
const META = ['pid','name','age','service','injury_days','career_injuries',
  'career_injury_days','debut_year','draft_year','unsigned_years','height','weight'];
const f3 = (v) => Math.round(v*1000)/1000;

function dumpPlayer(p) {
  const ip = p.kind === 'P';
  const d = { k: p.kind };
  for (const m of META) if (p[m] !== undefined && p[m] !== null) d[m] = p[m];
  for (const f of (ip ? PF : BF)) d[f] = f3(p[f]);
  d.pot = {}; for (const a in p.pot) d.pot[a] = f3(p.pot[a]);
  d.hid = {}; for (const a in p.hidden)
    d.hid[a] = typeof p.hidden[a] === 'string' ? p.hidden[a] : f3(p.hidden[a]);
  if (ip) { d.throws = p.throws; d.role = p.role; d.ars = p.arsenal; }
  else { d.bats = p.bats; d.position = p.position; }
  if (p.contract) d.ct = [p.contract.start_year, p.contract.salaries.map(f3)];
  for (const o of ['origin','scout_difficulty','drafted_round','drafted_overall','drafted_by','foreign','nation','kbo_years'])
    if (p[o] !== undefined) d[o] = p[o];
  if (p.scout_consensus) {
    const attrs = dev.attrsOf(p);
    d.sc = [attrs.map(a=>f3(p.scout_consensus[a])), attrs.map(a=>f3(p.scout_consensus_pot[a]))];
  }
  return d;
}
function loadPlayer(d) {
  const ip = d.k === 'P';
  const p = ip ? { kind:'P', throws:d.throws, role:d.role, arsenal:d.ars || ['FF','SL','CH'] }
                : { kind:'B', bats:d.bats, position:d.position };
  for (const m of META) if (d[m] !== undefined) p[m] = d[m];
  for (const f of (ip ? PF : BF)) p[f] = d[f] ?? 50;   // 예전 저장본에 없던 능력치
  p.pot = { ...d.pot }; p.hidden = { ...d.hid };
  p.contract = d.ct ? new C.Contract(d.ct[0], d.ct[1]) : null;
  for (const o of ['origin','scout_difficulty','drafted_round','drafted_overall','drafted_by','foreign','nation','kbo_years'])
    if (d[o] !== undefined) p[o] = d[o];
  if (d.sc) {
    const attrs = dev.attrsOf(p);
    p.scout_consensus = {}; p.scout_consensus_pot = {};
    attrs.forEach((a,i) => { p.scout_consensus[a] = d.sc[0][i]; p.scout_consensus_pot[a] = d.sc[1][i]; });
  }
  p.injury_days = d.injury_days ?? 0; p.service = d.service ?? 0;
  return p;
}

class Line {
  constructor(kind, vals) {
    const fields = kind === 'B' ? BAT_LINE : PIT_LINE;
    fields.forEach((f,i) => { this[f] = vals[i]; });
  }
  get b1() { return this.h - this.b2 - this.b3 - this.hr; }
  get avg() { return this.ab ? this.h/this.ab : 0; }
  get obp() { return this.pa ? (this.h+this.bb+this.hbp)/this.pa : 0; }
  get tb() { return this.b1 + 2*this.b2 + 3*this.b3 + 4*this.hr; }
  get slg() { return this.ab ? this.tb/this.ab : 0; }
  get ops() { return this.obp + this.slg; }
  get ip() { return this.outs/3; }
  get era() { return this.outs ? this.r*9/this.ip : 0; }
  get whip() { return this.outs ? (this.h+this.bb)/this.ip : 0; }
  get ipStr() { return `${Math.floor(this.outs/3)}.${this.outs%3}`; }
}

export function dump(game) {
  const L = game.L;
  const live = {};
  for (const t of L.teams) for (const p of [...t.batters, ...t.pitchers, ...t.farm]) live[p.pid] = dumpPlayer(p);
  for (const p of L.unsigned) live[p.pid] = dumpPlayer(p);
  if (game.draftSession) for (const p of game.draftSession.available) live[p.pid] = dumpPlayer(p);

  const ghosts = {};
  for (const [pid, c] of L.careers)
    if (!live[pid] && c.seasons.length)
      ghosts[pid] = { name:c.p.name, k:c.kind,
        pos: c.kind==='B' ? c.p.position : c.p.role, debut:c.p.debut_year, age:c.p.age };

  const scoutDump = (s) => {
    const mem = {};
    for (const [pid, m] of s.memory) {
      if (!live[pid]) continue;
      const keys = Object.keys(m.cur);
      mem[pid] = [keys.map(k=>f3(m.cur[k])), keys.map(k=>f3(m.pot[k])), keys];
    }
    const looks = {};
    for (const [pid, v] of s.looks) if (live[pid]) looks[pid] = v;
    return { ec:f3(s.eval_current), ep:f3(s.eval_potential), h:f3(s.hitting), p:f3(s.pitching),
             bias: Object.fromEntries(Object.entries(s.bias).map(([k,v])=>[k,f3(v)])), mem, looks };
  };

  const dumpSeason = (S) => S ? {
    year:S.year, games:S.games, day:S.curDay, rng:S.rng.state,
    sched:S.schedule, rec:Object.fromEntries([...S.rec].map(([k,r])=>[k,[r.w,r.l,r.rs,r.ra,r.d]])),
    bat:Object.fromEntries([...S.bat].map(([pid,b])=>[pid,[b.team.team_id, BAT_LINE.map(f=>b[f]),
      [b.sp.H,b.sp.A,b.sp.L,b.sp.R,b.sp.S]]])),
    pit:Object.fromEntries([...S.pit].map(([pid,q])=>[pid,[q.team.team_id, PIT_LINE.map(f=>q[f]),
      [q.sp.H,q.sp.A]]])),
    res:S.results,
    avail:Object.fromEntries(S.availDay), last:Object.fromEntries(S.lastUsed),
    consec:Object.fromEntries(S.consec),
    feats:(S.feats||[]).map(f => [f.y,f.d,f.k,f.pid,f.name,f.team,f.opp,f.v]),
  } : null;

  return {
    v: VERSION, year:L.year, games:L.games, user:game.userId, phase:game.phase,
    rng: L.rng.state, nteams: L.teams.length,
    teams: L.teams.map(t => ({ id:t.team_id, name:t.name,
      b:t.batters.map(p=>p.pid), p:t.pitchers.map(p=>p.pid), f:t.farm.map(p=>p.pid),
      rot:t.rot_index, park:[f3(t.park.hrFactor), f3(t.park.hitFactor), t.park.name, t.park.capacity, t.park.opened],
      fin:[f3(t.finance.market_size), f3(t.finance.owner_spending), f3(t.finance.revenue),
           f3(t.finance.budget), f3(t.finance.patience), t.finance.attendance || 0,
           t.finance.homeGames || 0, t.finance.income || null],
      up:f3(t.upside_weight ?? 0.7), talent:f3(t.talent ?? 0), hist:t.history || null,
      tac:t.tactics || null })),
    players: live, ghosts,
    careers: [...L.careers.values()].filter(c => c.seasons.length || live[c.p.pid]).map(c => ({
      pid:c.p.pid, k:c.kind,
      s: c.seasons.map(x => [x.year, x.team,
          (c.kind==='B'?BAT_LINE:PIT_LINE).map(f => x.line[f] ?? 0), f3(x.war), x.age]),
      e: c.events.map(e => [e.year, e.text]), a: { ...c.awards }, r: c.retired_year })),
    unsigned: L.unsigned.map(p=>p.pid),
    scouts: Object.fromEntries([...L.scouts].map(([tid,s]) => [tid, scoutDump(s)])),
    modes: Object.fromEntries(L.modes), recPct: Object.fromEntries(L.recPct),
    history: L.history.slice(-400), champions: L.champions,
    // 대기록은 짧게 쓰고 많이 쌓인다. 최근 600건만 남긴다.
    feats: (L.feats || []).slice(-600).map(f => [f.y, f.d, f.k, f.pid, f.name, f.team, f.opp, f.v]),
    awardLog: (L.awardLog || []).slice(-300),
    mail: L.mail ? { items:L.mail.items, seq:L.mail.seq, seen:[...L.mail.seen] } : null,
    nextPid: R.getPidCounter(),
    season: dumpSeason(game.season),
    faOffers: Object.fromEntries(game.faOffers),
    champion: game.champion,
    lastTable: game.lastTable || null,
    lastPlayoffs: game.lastPlayoffs || null,
    draft: game.draftSession ? {
      order: game.draftSession.order.map(t=>t.team_id),
      pool: game.draftSession.pool.map(p=>p.pid),
      avail: game.draftSession.available.map(p=>p.pid),
      n: game.draftSession.n,
      picks: game.draftSession.picks.map(x => [x.n, x.round, x.team.team_id, x.player.pid]),
    } : null,
  };
}

export function load(data) {
  if (data.v !== VERSION) throw new Error(`세이브 버전 불일치 (${data.v} ≠ ${VERSION})`);
  const players = new Map();
  for (const pid in data.players) { const p = loadPlayer(data.players[pid]); p.pid = +pid; players.set(+pid, p); }
  const ghosts = new Map();
  for (const pid in data.ghosts) {
    const d = data.ghosts[pid];
    const g = { pid:+pid, name:d.name, kind:d.k, age:d.age, debut_year:d.debut, hidden:{}, pot:{} };
    if (d.k === 'B') g.position = d.pos; else g.role = d.pos;
    ghosts.set(+pid, g);
  }

  const L = Object.create(League.prototype);
  L.rng = new RNG(1); L.rng.state = data.rng;
  L.year = data.year; L.games = data.games;
  L.history = data.history; L.champions = data.champions;
  L.feats = (data.feats || []).map(a =>
    ({ y:a[0], d:a[1], k:a[2], pid:a[3], name:a[4], team:a[5], opp:a[6], v:a[7] }));
  L.unsigned = data.unsigned.map(pid => players.get(pid)).filter(Boolean);
  L.modes = new Map(Object.entries(data.modes).map(([k,v]) => [+k, v]));
  L.recPct = new Map(Object.entries(data.recPct).map(([k,v]) => [+k, v]));
  L.draftLog = []; L.season = null; L.faLog = []; L.awardLog = data.awardLog || [];
  L.mail = new Mailbox();
  if (data.mail) { L.mail.items = data.mail.items || []; L.mail.seq = data.mail.seq || 0;
    L.mail.seen = new Set(data.mail.seen || []); }

  L.teams = data.teams.map(td => {
    const t = { team_id:td.id, name:td.name,
      batters: td.b.map(i=>players.get(i)).filter(Boolean),
      pitchers: td.p.map(i=>players.get(i)).filter(Boolean),
      farm: td.f.map(i=>players.get(i)).filter(Boolean),
      rot_index: td.rot,
      park:{ hrFactor:td.park[0], hitFactor:td.park[1], name:td.park[2],
             capacity:td.park[3] || 18000, opened:td.park[4] },
      upside_weight: td.up, talent: td.talent, history: td.hist || null,
      tactics: td.tac || null,
      unavailable:new Set(),
      lineup:[], bench:[], rotation:[], bullpen:[],
      defense:{ infield:50, outfield:50, catcherFraming:50 },
      nextStarter() { const p = this.rotation[this.rot_index % this.rotation.length];
                      this.rot_index++; return p; } };
    const f = Object.create(C.Finance.prototype);
    [f.market_size, f.owner_spending, f.revenue, f.budget, f.patience,
     f.attendance, f.homeGames, f.income] = td.fin;
    if (f.patience === undefined) f.patience = 50;
    f.attendance = f.attendance || 0; f.homeGames = f.homeGames || 0;
    t.finance = f;
    return t;
  });
  for (const t of L.teams) R.rebuildRoster(t);

  L.careers = new Map();
  for (const cd of data.careers) {
    const p = players.get(cd.pid) || ghosts.get(cd.pid);
    if (!p) continue;
    const c = new Career(p, cd.k);
    for (const [yr, tm, vals, war, age] of cd.s) c.seasons.push({ year:yr, team:tm, line:new Line(cd.k, vals), war, age });
    c.events = cd.e.map(([y,t]) => ({ year:y, text:t }));
    c.awards = { ...cd.a }; c.retired_year = cd.r;
    L.careers.set(cd.pid, c);
  }

  L.scouts = new Map();
  for (const tid in data.scouts) {
    const sd = data.scouts[tid];
    const s = Object.create(ScoutingDept.prototype);
    s.eval_current = sd.ec; s.eval_potential = sd.ep; s.hitting = sd.h; s.pitching = sd.p;
    s.bias = { ...sd.bias }; s.memory = new Map(); s.looks = new Map();
    for (const pid in sd.mem) {
      const [cur, pot, keys] = sd.mem[pid];
      const m = { cur:{}, pot:{} };
      keys.forEach((k,i) => { m.cur[k] = cur[i]; m.pot[k] = pot[i]; });
      s.memory.set(+pid, m);
    }
    for (const pid in sd.looks) s.looks.set(+pid, sd.looks[pid]);
    L.scouts.set(+tid, s);
  }
  R.setPidCounter(data.nextPid);

  const g = new Game({ _empty:true });
  g.L = L; g.userId = data.user; g.phase = data.phase;
  g.champion = data.champion ?? null; g.playoffLog = []; g.notices = [];
  g.lastTable = data.lastTable || null;
  g.lastPlayoffs = data.lastPlayoffs || null;
  g.faOffers = new Map(Object.entries(data.faOffers || {}).map(([k,v]) => [+k, v]));
  g._prev = { rank: 0, run: 0 };
  g.draftSession = null;

  if (data.season) {
    const d = data.season;
    const S = Object.create(Season.prototype);
    S.teams = L.teams; S.year = d.year; S.games = d.games;
    S.rng = new RNG(1); S.rng.state = d.rng;
    S.schedule = d.sched;
    S.byDay = new Map();
    for (const [day,h,a] of S.schedule) { if (!S.byDay.has(day)) S.byDay.set(day, []); S.byDay.get(day).push([h,a]); }
    S.curDay = d.day;
    const byId = new Map(L.teams.map(t => [t.team_id, t]));
    S.rec = new Map();
    for (const tid in d.rec) { const [w,l,rs,ra,dr] = d.rec[tid];
      const r = new TeamRecord(byId.get(+tid)); r.w=w; r.l=l; r.rs=rs; r.ra=ra; r.d=dr||0;
      S.rec.set(+tid, r); }
    S.bat = new Map(); S.pit = new Map();
    for (const pid in d.bat) { const [tid, vals, sp] = d.bat[pid];
      if (!players.has(+pid)) continue;
      const b = new SeasonBat(players.get(+pid), byId.get(tid));
      BAT_LINE.forEach((f,i) => { b[f] = vals[i]; });
      if (sp) { b.sp = { H:sp[0], A:sp[1], L:sp[2], R:sp[3], S:sp[4] || new Array(9).fill(0) }; }
      S.bat.set(+pid, b); }
    for (const pid in d.pit) { const [tid, vals, sp] = d.pit[pid];
      if (!players.has(+pid)) continue;
      const q = new SeasonPit(players.get(+pid), byId.get(tid));
      PIT_LINE.forEach((f,i) => { q[f] = vals[i]; });
      if (sp) { q.sp = { H:sp[0], A:sp[1] }; }
      S.pit.set(+pid, q); }
    S.results = d.res; S.injuries = [];
    S.availDay = new Map(Object.entries(d.avail).map(([k,v])=>[+k,v]));
    S.lastUsed = new Map(Object.entries(d.last).map(([k,v])=>[+k,v]));
    S.consec = new Map(Object.entries(d.consec).map(([k,v])=>[+k,v]));
    S.feats = (d.feats || []).map(a =>
      ({ y:a[0], d:a[1], k:a[2], pid:a[3], name:a[4], team:a[5], opp:a[6], v:a[7] }));
    g.season = S; L.season = S;
  } else g.season = null;

  if (data.draft) {
    const dd = data.draft;
    const byId = new Map(L.teams.map(t => [t.team_id, t]));
    const D = Object.create(DraftSession.prototype);
    D.teams = L.teams; D.scouts = L.scouts; D.rng = L.rng;
    D.order = dd.order.map(i => byId.get(i));
    D.pool = dd.pool.map(i => players.get(i)).filter(Boolean);
    D.available = dd.avail.map(i => players.get(i)).filter(Boolean);
    D.n = dd.n;
    D.picks = dd.picks.filter(([,,,pid]) => players.has(pid)).map(([n,rd,tid,pid]) => ({
      n, round:rd, team:byId.get(tid), player:players.get(pid),
      report: L.scouts.get(tid).report(players.get(pid), L.rng) }));
    g.draftSession = D;
  }
  return g;
}
