// 다년 리그: 시즌 → 성장/노화 → 은퇴 → FA → 트레이드 → 드래프트
import { RNG } from './rng.js';
import * as dev from './development.js';
import * as R from './roster.js';
import * as C from './contract.js';
import * as market from './market.js';
import { ScoutingDept } from './scouting.js';
import * as staff from './staff.js';
import * as persona from './persona.js';
import * as draft from './draft.js';
import { Season, postseason } from './season.js';
import { buildHistory, droughtPressure, syncHistory } from './history.js';
export { syncHistory };

export class Career {
  constructor(p, kind) {
    this.p = p; this.kind = kind; this.seasons = []; this.events = [];
    this.awards = {}; this.retired_year = null;
  }
  add(year, team, line, war, age) { this.seasons.push({ year, team, line, war, age }); }
  tot(f) { return this.seasons.reduce((s, x) => s + (x.line[f] ?? 0), 0); }
  get war() { return this.seasons.reduce((s, x) => s + x.war, 0); }
  get years() { return this.seasons.length; }
  get peakWar() { return this.seasons.length ? Math.max(...this.seasons.map(x=>x.war)) : 0; }
  award(k) { this.awards[k] = (this.awards[k] ?? 0) + 1; }
}

export class League {
  static FARM_CAP = 18;

  constructor(nTeams = 8, startYear = 2030, games = 84, seed = 1) {
    this.rng = new RNG(seed);
    this.year = startYear; this.games = games;
    this.teams = R.makeLeague(nTeams, this.rng, startYear);
    this.careers = new Map(); this.history = []; this.champions = [];
    this.feats = [];   // 한 경기 대기록. 시즌이 끝나면 여기로 옮겨 리그에 남는다.
    this.unsigned = []; this.draftLog = [];
    this.scouts = new Map(this.teams.map(t => [t.team_id, new ScoutingDept(this.rng)]));
    this.ensureStaff();
    this.modes = new Map(this.teams.map(t => [t.team_id, market.NEUTRAL]));
    this.recPct = new Map(this.teams.map(t => [t.team_id, 0.5]));
    this.season = null;
    buildHistory(this.teams, this.rng, startYear - 1);
    for (const t of this.teams) {
      t.upside_weight = this.rng.uniform(0.55, 0.85);
      t.finance = new C.Finance(this.rng);
      // 오래 무관인 구단의 구단주는 조급하다
      t.finance.patience = Math.max(12, t.finance.patience - droughtPressure(t.history));
      for (const p of [...t.batters, ...t.pitchers]) {
        p.service = Math.max(0, Math.min(12, p.age - 21));
        const ovr = dev.overall(p);
        const ip = p.kind === 'P';
        let aav, yrs;
        if (p.service >= C.FA_SERVICE) {
          aav = C.marketValue(ovr, p.age, ip);
          yrs = this.rng.randint(1, C.demandYears(p.age, ovr));
        } else { aav = C.renewalSalary(p, ovr, ip); yrs = this.rng.randint(1, 2); }
        const start = yrs > 1 ? startYear - this.rng.randint(0, yrs-1) : startYear;
        p.contract = new C.Contract(start, Array(yrs).fill(Math.round(aav*100)/100));
      }
      for (const p of [...t.batters, ...t.pitchers]) this.career(p);
    }
  }

  team(id) { return this.teams.find(t => t.team_id === id); }
  career(p) {
    if (!this.careers.has(p.pid)) this.careers.set(p.pid, new Career(p, p.kind));
    return this.careers.get(p.pid);
  }
  log(text) { this.history.push({ year: this.year, text }); }

  /** 예전 저장본에는 코치진이 없다. 없으면 만들어 준다. */
  ensureStaff() {
    for (const t of this.teams) if (!t.staff) t.staff = staff.makeStaff(this.rng);
  }

  see(t, p) {
    const c = this.careers.get(p.pid);
    return this.scouts.get(t.team_id).report(p, this.rng, !!(c && c.seasons.length),
      staff.scoutMult(t));
  }
  farmValue(t, p) { const r = this.see(t, p); return 0.65*r.pot + 0.35*r.ovr; }

  playingTime(p, S) {
    if (!S) return p.age <= 23 ? 0.85 : 0.45;
    if (p.kind === 'B') { const b = S.bat.get(p.pid); if (b && b.pa) return Math.min(1.3, b.pa/380); }
    else { const q = S.pit.get(p.pid); if (q && q.outs) return Math.min(1.3, q.gs ? q.ip/90 : q.g/40); }
    return p.age <= 23 ? 0.85 : 0.45;
  }

  // ---- 오프시즌 단계 ------------------------------------------------
  offRollover() {
    const S = this.season, rng = this.rng;
    const summary = { retired: [], breakout: [], decline: [] };
    for (const t of this.teams) {
      for (const p of [...t.batters, ...t.pitchers, ...t.farm]) p.injury_days = Math.max(0, p.injury_days - 120);
      this.trim(t);
    }
    const before = new Map();
    for (const t of this.teams) for (const p of [...t.batters, ...t.pitchers]) before.set(p.pid, dev.overall(p));
    for (const t of this.teams) {
      for (const p of [...t.batters, ...t.pitchers]) {
        persona.observe(t, p);          // 한 해를 같이 보냈다
        dev.develop(p, rng, this.playingTime(p, S), staff.devMult(t, p.kind));
      }
      for (const p of t.farm) persona.observe(t, p);
      for (const p of t.farm) dev.develop(p, rng, p.age <= 22 ? 0.85 : 0.6);
    }
    for (const p of this.unsigned) dev.develop(p, rng, 0.30);

    for (const t of this.teams) {
      for (const group of ['batters','pitchers']) {
        const keep = [];
        for (const p of t[group]) {
          // 외국인은 은퇴하지 않는다. 재계약이 안 되면 떠날 뿐이다.
          if (!p.foreign && rng.random() < dev.retireProb(p, this.playingTime(p, S))) {
            const c = this.career(p); c.retired_year = this.year;
            if (c.years >= 3) this.log(`${p.name} 은퇴 (${c.years}시즌, 통산 WAR ${c.war.toFixed(1)})`);
            summary.retired.push({ p, t });
          } else {
            keep.push(p);
            const d = dev.overall(p) - (before.get(p.pid) ?? dev.overall(p));
            if (d >= 3) summary.breakout.push({ p, t, d });
            else if (d <= -3) summary.decline.push({ p, t, d });
          }
        }
        t[group] = keep;
      }
      const cut = t.farm.filter(p => p.age > 24);
      t.farm = t.farm.filter(p => p.age <= 24);
      for (const p of cut) { const c = this.careers.get(p.pid); if (c && c.seasons.length) c.retired_year = this.year; }
    }
    for (const t of this.teams) { this.fillRoster(t); R.rebuildRoster(t); }

    const st = new Map(S.standings().map(r => [r.team.team_id, r]));
    const champ = this.champions.length ? this.champions[this.champions.length-1].team : null;
    const top4 = S.standings().slice(0,5).map(x => x.team.team_id);
    for (const t of this.teams) {
      const r = st.get(t.team_id);
      const a = S.att ? S.att.get(t.team_id) : null;
      const inPs = top4.includes(t.team_id), won = t.name === champ;
      t.finance.update(r ? r.pct : 0.5, inPs, won,
        a ? a.total : 0, a ? a.games : 0, t.park.capacity || 18000);
      t.lastPlayoff = inPs; t.lastTitle = won;   // 다음 시즌 관중에 반영
      this.modes.set(t.team_id, market.teamMode(t, r));
    }
    C.balanceBudgets(this.teams);
    return summary;
  }

  offFA(userOffers = null, userTeam = null) {
    this.faLog = market.runFreeAgency(this, this.year, this.unsigned, userOffers, userTeam, (s)=>this.log(s));
    return this.faLog;
  }
  offTrades() { return market.runTrades(this, this.year, this.modes, (s)=>this.log(s)); }

  offCleanup() {
    const rng = this.rng;
    for (const t of this.teams) {
      this.shedSalary(t); this.trim(t); this.fillRoster(t); this.compete(t); R.rebuildRoster(t);
    }
    const still = [];
    for (const p of this.unsigned) {
      p.unsigned_years = (p.unsigned_years ?? 0) + 1;
      if (p.unsigned_years >= 2 || p.age >= 36) {
        const c = this.careers.get(p.pid);
        if (c && c.seasons.length && !c.retired_year) {
          c.retired_year = this.year;
          if (c.years >= 5) this.log(`${p.name} 미계약 은퇴 (${c.years}시즌, WAR ${c.war.toFixed(1)})`);
        }
      } else still.push(p);
    }
    this.unsigned = still;
    for (const t of this.teams) {
      const dept = this.scouts.get(t.team_id);
      for (const p of t.farm) dept.observe(p, rng, 1);
      while (t.farm.length > League.FARM_CAP) {
        const worst = t.farm.reduce((a,b) => this.farmValue(t,b) < this.farmValue(t,a) ? b : a);
        t.farm.splice(t.farm.indexOf(worst), 1);
        const c = this.careers.get(worst.pid);
        if (c && c.seasons.length) c.retired_year = this.year;
      }
    }
  }

  newDraftSession() {
    const order = this.season.standings().slice().reverse().map(r => r.team);
    const pool = draft.makeClass(this.rng, this.year + 1);
    return new draft.DraftSession(this.teams, this.scouts, order, pool, this.rng);
  }
  finishDraft(session) {
    this.draftLog.push({ year: this.year + 1, picks: session.picks });
    for (const rec of session.picks) {
      const c = this.career(rec.player);
      c.events.push({ year: this.year + 1, text: `전체 ${rec.n}순위 지명 (${rec.team.name})` });
      c.draft_pick = rec.n; c.draft_round = rec.round;
      c.retired_year = null; c.seasons = [];
    }
    this.year++;
  }

  // ---- 로스터 관리 ---------------------------------------------------
  trim(t) {
    for (const [group, cap, wantP] of [['batters',13,false],['pitchers',12,true]]) {
      while (t[group].length > cap) {
        const prot = new Set();
        if (wantP) {
          t.pitchers.filter(p=>p.role==='SP').sort((a,b)=>dev.overall(b)-dev.overall(a))
            .slice(0,5).forEach(p => prot.add(p.pid));
        } else {
          for (const pos of R.FIELD_POS) {
            const same = t.batters.filter(b => b.position === pos);
            if (same.length === 1) prot.add(same[0].pid);
          }
        }
        let cands = t[group].filter(p => !prot.has(p.pid));
        if (!cands.length) cands = t[group];
        const worst = cands.reduce((a,b) => dev.overall(b) < dev.overall(a) ? b : a);
        t[group].splice(t[group].indexOf(worst), 1);
        this.release(worst, t);
      }
    }
  }

  release(p, t) {
    p.contract = null;
    if (p.age <= 24) { t.farm.push(p); return; }
    this.unsigned.push(p);
  }

  shedSalary(t) {
    const y = this.year + 1;
    let guard = 0;
    while (C.payroll(t, y) > t.finance.budget && guard++ < 12) {
      const cands = [...t.batters, ...t.pitchers].filter(p => p.contract && p.contract.salaryIn(y) > 1);
      if (!cands.length) break;
      const mode = this.modes.get(t.team_id);
      const worst = cands.reduce((a,b) =>
        market.tradeValue(this,t,b,this.year,mode) < market.tradeValue(this,t,a,this.year,mode) ? b : a);
      if (market.tradeValue(this, t, worst, this.year, mode) > 3) break;
      const arr = worst.kind === 'B' ? t.batters : t.pitchers;
      arr.splice(arr.indexOf(worst), 1);
      this.release(worst, t);
    }
  }

  promote(t, wantPitcher, pos = null) {
    const match = (p) => (p.kind === 'P') === wantPitcher && (pos === null || p.position === pos);
    const free = this.unsigned.filter(match);
    const cand = t.farm.filter(match);
    if (free.length) {
      const bf = free.reduce((a,b) => this.see(t,b).ovr > this.see(t,a).ovr ? b : a);
      const bc = cand.length ? cand.reduce((a,b) => this.see(t,b).ovr > this.see(t,a).ovr ? b : a) : null;
      if (!bc || this.see(t,bf).ovr > this.see(t,bc).ovr) {
        this.unsigned.splice(this.unsigned.indexOf(bf), 1);
        bf.contract = new C.Contract(this.year+1, [C.MIN_SALARY*2]);
        return bf;
      }
    }
    if (!cand.length) return null;
    const best = cand.reduce((a,b) => this.see(t,b).ovr > this.see(t,a).ovr ? b : a);
    t.farm.splice(t.farm.indexOf(best), 1);
    const c = this.career(best);
    if (!c.seasons.length) { best.debut_year = this.year + 1;
      this.log(`${t.name} ${best.name}(${best.age}세) 1군 데뷔`); }
    return best;
  }

  fillRoster(t) {
    const rng = this.rng;
    for (const pos of R.FIELD_POS) {
      if (!t.batters.some(b => b.position === pos)) {
        let p = this.promote(t, false, pos);
        if (!p) { p = R.makeProspectBatter(rng, pos, rng.gauss(0,0.8), this.year);
                  R.ageTo(p, 22, rng, 0.85); p.debut_year = this.year+1; }
        t.batters.push(p);
      }
    }
    while (t.batters.length < 13) {
      let p = this.promote(t, false);
      if (!p) { p = R.makeProspectBatter(rng, rng.choice(R.LINEUP_POS), rng.gauss(-0.4,0.8), this.year);
                R.ageTo(p, 22, rng, 0.85); p.debut_year = this.year+1; }
      t.batters.push(p);
    }
    let needSp = 5 - t.pitchers.filter(p => p.role === 'SP').length;
    let guard = 0;
    while ((t.pitchers.length < 12 || needSp > 0) && guard++ < 30) {
      const role = needSp > 0 ? 'SP' : 'RP';
      const cand = t.farm.filter(p => p.kind === 'P' && p.role === role);
      let p;
      if (cand.length) {
        p = cand.reduce((a,b) => this.see(t,b).ovr > this.see(t,a).ovr ? b : a);
        t.farm.splice(t.farm.indexOf(p), 1);
        const c = this.career(p);
        if (!c.seasons.length) p.debut_year = this.year + 1;
      } else {
        p = R.makeProspectPitcher(rng, role, rng.gauss(-0.3,0.8), this.year);
        R.ageTo(p, 22, rng, 0.85); p.debut_year = this.year + 1;
      }
      t.pitchers.push(p);
      if (role === 'SP') needSp--;
      if (t.pitchers.length >= 12 && needSp <= 0) break;
    }
  }

  compete(t) {
    const MARGIN = 0.8;
    for (let iter = 0; iter < 4; iter++) {
      for (const wantP of [false, true]) {
        const pool = wantP ? t.pitchers : t.batters;
        const cand = t.farm.filter(p => (p.kind === 'P') === wantP);
        if (!cand.length || pool.length <= (wantP ? 12 : 13) - 1) continue;
        const best = cand.reduce((a,b) => this.see(t,b).ovr > this.see(t,a).ovr ? b : a);
        const prot = new Set();
        if (wantP) {
          if (best.role !== 'SP')
            t.pitchers.filter(p=>p.role==='SP').sort((a,b)=>dev.overall(b)-dev.overall(a))
              .slice(0,5).forEach(p => prot.add(p.pid));
        } else {
          for (const pos of R.FIELD_POS) {
            const same = pool.filter(b => b.position === pos);
            if (same.length === 1 && same[0].position !== best.position && dev.overall(same[0]) >= 43)
              prot.add(same[0].pid);
          }
        }
        const dropC = pool.filter(p => !prot.has(p.pid));
        if (!dropC.length) continue;
        const worst = dropC.reduce((a,b) => this.see(t,b).ovr < this.see(t,a).ovr ? b : a);
        if (this.see(t,best).ovr <= this.see(t,worst).ovr + MARGIN) continue;
        pool.splice(pool.indexOf(worst), 1);
        t.farm.splice(t.farm.indexOf(best), 1);
        if (!wantP && best.position !== worst.position && !pool.some(b => b.position === worst.position)) {
          this.log(`${best.name} ${best.position} → ${worst.position} 전향`);
          best.position = worst.position;
        }
        pool.push(best);
        const c = this.career(best);
        if (!c.seasons.length) best.debut_year = this.year + 1;
        this.release(worst, t);
      }
    }
  }
}

export { postseason, Season };
