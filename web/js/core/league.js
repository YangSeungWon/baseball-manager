// 다년 리그: 시즌 → 성장/노화 → 은퇴 → FA → 트레이드 → 드래프트
import { RNG } from './rng.js';
import * as dev from './development.js';
import * as R from './roster.js';
import { franchiseOf } from './names.js';
import * as C from './contract.js';
import * as market from './market.js';
import { ScoutingDept } from './scouting.js';
import * as staff from './staff.js';
import * as persona from './persona.js';
import * as mil from './military.js';
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
  static FARM_CAP = 50;      // 실제 구단의 소속선수는 정식 65 + 육성 15 안팎이다

  constructor(nTeams = 8, startYear = 2030, games = 84, seed = 1) {
    this.rng = new RNG(seed);
    this.year = startYear; this.games = games;
    this.teams = R.makeLeague(nTeams, this.rng, startYear);
    this.careers = new Map(); this.history = []; this.champions = [];
    this.feats = [];   // 한 경기 대기록. 시즌이 끝나면 여기로 옮겨 리그에 남는다.
    this.unsigned = []; this.draftLog = [];
    this.scouts = new Map(this.teams.map(t => [t.team_id, new ScoutingDept(this.rng)]));
    this.ensureStaff();
    this.ensureMil();          // 시즌을 돌리기 전에 정해 둬야 한다
    this.modes = new Map(this.teams.map(t => [t.team_id, market.NEUTRAL]));
    this.recPct = new Map(this.teams.map(t => [t.team_id, 0.5]));
    this.season = null;
    buildHistory(this.teams, this.rng, startYear - 1);
    for (const t of this.teams) {
      // 구단의 성격은 연고를 따라간다. 매 판 새로 뽑으면 이야기가 붙지 않는다.
      const fr = franchiseOf(t.name);
      t.upside_weight = Math.max(0.5, Math.min(0.9,
        this.rng.gauss(fr && fr.bias ? fr.bias : 0.70, 0.05)));
      t.finance = new C.Finance(this.rng, fr);
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
    for (const t of this.teams) if (!t.staff) t.staff = staff.makeStaff(this.rng, 0, this.year);
  }

  /** 창단 시점의 병역. 스물다섯이 넘었으면 이미 겪은 사람들이다.
   *  이걸 안 해두면 개막하자마자 리그의 절반이 입대한다. */
  ensureMil() {
    const rng = this.rng;
    for (const t of this.teams)
      for (const p of [...t.batters, ...t.pitchers, ...t.farm]) {
        if (!mil.isKorean(p) || p.mil) continue;
        const r = rng.random();
        if (p.age >= 25) p.mil = r < 0.22 ? 'exempt' : 'done';
        else if (p.age >= 23) {
          // 이 나이대는 이미 다녀온 사람, 지금 가 있는 사람, 아직 안 간 사람이 섞인다
          if (r < 0.30) p.mil = 'done';
          else if (r < 0.38) p.mil = 'exempt';
          else if (r < 0.46) this._enlistNow(p, t, rng);
          else p.mil = 'none';
        } else {
          if (r < 0.018) this._enlistNow(p, t, rng);
          else p.mil = 'none';
        }
      }
  }

  _enlistNow(p, t, rng) {
    p.mil = 'serving';
    p.milKind = rng.random() < 0.45 ? 'sangmu' : 'active';
    p.milLeft = 1 + Math.floor(rng.random() * mil.MIL.years);
    for (const arr of [t.batters, t.pitchers]) {
      const i = arr.indexOf(p); if (i >= 0) { arr.splice(i, 1); break; }
    }
    if (!t.farm.includes(p)) t.farm.push(p);
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
    // 1군에 있었는데 안 나왔다. 그것도 정보다.
    // 2군에서 매일 뛰는 것보다 못 큰다 — 그래서 강등이 선택이 된다.
    return p.age <= 23 ? 0.30 : 0.20;
  }

  /* ── 국제대회와 병역 ──────────────────────────────────────
     1군에서 쓴 선수만 대표팀에 뽑힌다. 금메달이면 커리어 2년이
     돌아오고, 못 받으면 스물일곱에 2년이 사라진다. */

  /** 그 시즌 1군에서 얼마나 잘했는가. 대표팀 승선의 근거다. */
  natValue(t, p, S) {
    if (!S) return 0;
    const [bw, pw] = this._warCache || [null, null];
    const w = (p.kind === 'P' ? pw : bw);
    return w ? Math.max(0, w.get(p.pid) ?? 0) : 0;
  }

  /** WBC. 3월이라 스프링캠프 대신 전력투구를 하고 시즌에 들어간다.
   *  면제는 없다. 남는 건 명예와 부상뿐이다. */
  runWBC() {
    if (!mil.meets(this.year).includes(mil.WBC)) return null;
    const prev = this.history.length;
    this._warCache = null;
    // 지난 시즌 성적으로 뽑는다. 3월이니 올해 기록은 아직 없다.
    const val = (t, p) => Math.max(0, this.see(t, p).ovr - 44);
    const squad = mil.pickSquad(this.teams, null, this.rng, val, mil.WBC);
    if (squad.length < 12) return null;
    const medal = mil.result(mil.WBC, squad, this.rng);
    const hurt = [];
    for (const c of squad) {
      c.p.natl = (c.p.natl || 0) + 1;
      c.p.wbc = this.year;
      if (this.rng.random() < mil.MIL.wbcInjury) {
        const d = 10 + Math.floor(this.rng.random() * this.rng.random() * 50);
        c.p.injury_days = Math.max(c.p.injury_days, d);
        c.p.career_injuries++; c.p.career_injury_days += d;
        hurt.push({ p:c.p, t:c.t, days:d });
      }
    }
    this.log(`${this.year} WBC 야구 ${medal ? mil.MEDAL_KR[medal] : '1라운드 탈락'}`);
    void prev;
    return { kind: mil.WBC, medal, exempt: false,
      squad: squad.map(c => ({ pid:c.p.pid, name:c.p.name, team:c.t.name,
        age:c.p.age, war: Math.round(c.v * 10) / 10 })),
      hurt: hurt.map(h => ({ name:h.p.name, team:h.t.name, days:h.days })) };
  }

  runTournament() {
    const kinds = mil.meets(this.year).filter(k => k !== mil.WBC);
    const kind = kinds[0];
    if (!kind || !this.season) return null;
    this._warCache = this.season.wars();
    const squad = mil.pickSquad(this.teams, this.season, this.rng,
      (t, p, S) => this.natValue(t, p, S), kind);
    this._warCache = null;
    if (squad.length < 12) return null;
    const medal = mil.result(kind, squad, this.rng);
    const free = mil.exempts(kind, medal);
    if (free) for (const c of squad) if (c.p.mil !== 'done') c.p.mil = 'exempt';
    for (const c of squad) c.p.natl = (c.p.natl || 0) + 1;
    this.log(`${this.year} ${mil.MEET_KR[kind]} 야구 ${medal ? mil.MEDAL_KR[medal] : '노메달'}`
      + (free ? ' — 대표팀 전원 병역 면제' : ''));
    return { kind, medal, exempt: free,
      squad: squad.map(c => ({ pid:c.p.pid, name:c.p.name, team:c.t.name,
        age:c.p.age, wild:c.wild, war: Math.round(c.v * 10) / 10 })) };
  }

  /** 복무를 한 해 보낸다. 상무는 뛰고, 현역은 못 뛴다. */
  runService(rng) {
    const out = [];
    for (const t of this.teams) {
      // 복무 중인 선수가 어디에 있든 한 해는 지나간다.
      for (const p of [...t.farm, ...t.batters, ...t.pitchers]) {
        if (p.mil !== 'serving') continue;
        dev.develop(p, rng, p.milKind === 'sangmu' ? mil.MIL.sangmuDev : mil.MIL.activeDev);
        if (--p.milLeft <= 0) { p.mil = 'done'; p.milKind = null; out.push({ p, t }); }
      }
    }
    return out;
  }

  /** 입대. 스물일곱까지 미필이면 더 미룰 수 없다.
   *  상무는 자리가 정해져 있어 잘하는 순으로 간다. */
  runEnlist(rng) {
    const due = [];
    for (const t of this.teams) {
      const active = new Set([...t.batters, ...t.pitchers].map(p => p.pid));
      for (const p of [...t.batters, ...t.pitchers, ...t.farm]) {
        if (!mil.isKorean(p) || p.mil === 'exempt' || p.mil === 'done'
            || p.mil === 'serving') continue;
        // 스물여섯이면 더 못 미룬다. 그 전이라도 1군에 못 올라온 채
        // 스물둘을 넘기면 대개 그때 다녀온다 — 기다릴 이유가 없다.
        const forced = p.age >= mil.MIL.callAge;
        const idle = !active.has(p.pid) && p.age >= 22
          && rng.random() < mil.MIL.idleEnlist;
        if (forced || idle || p.enlistNow) due.push({ p, t });
      }
    }
    due.sort((a, b) => dev.overall(b.p) - dev.overall(a.p));
    const out = [];
    due.forEach(({ p, t }, i) => {
      p.mil = 'serving';
      p.milKind = i < mil.MIL.sangmuPerYear ? 'sangmu' : 'active';
      p.milLeft = mil.MIL.years;
      p.enlistNow = false;
      for (const arr of [t.batters, t.pitchers]) {
        const j = arr.indexOf(p); if (j >= 0) { arr.splice(j, 1); break; }
      }
      if (!t.farm.includes(p)) t.farm.push(p);
      out.push({ p, t, kind: p.milKind });
    });
    return out;
  }

  // ---- 오프시즌 단계 ------------------------------------------------
  offRollover() {
    const S = this.season, rng = this.rng;
    const summary = { retired: [], breakout: [], decline: [], honored: [] };
    summary.tournament = this.runTournament();
    summary.discharged = this.runService(rng);
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
      // 복무 중인 선수는 따로 굴렸다.
      for (const p of t.farm) if (p.mil !== 'serving')
        dev.develop(p, rng, p.age <= 22 ? 0.85 : 0.6);
    }
    for (const p of this.unsigned) dev.develop(p, rng, 0.30);
    summary.enlisted = this.runEnlist(rng);

    for (const t of this.teams) {
      for (const group of ['batters','pitchers']) {
        const keep = [];
        for (const p of t[group]) {
          // 외국인은 은퇴하지 않는다. 재계약이 안 되면 떠날 뿐이다.
          if (!p.foreign && rng.random() < dev.retireProb(p, this.playingTime(p, S))) {
            const c = this.career(p); c.retired_year = this.year;
            if (c.years >= 3) this.log(`${p.name} 은퇴 (${c.years}시즌, 통산 WAR ${c.war.toFixed(1)})`);
            const hon = this.honorNumber(t, p, c);
            if (hon) summary.honored.push({ ...hon, team: t.name, mine: t.team_id === this.userId });
            summary.retired.push({ p, t, honored: !!hon });
          } else {
            keep.push(p);
            const d = dev.overall(p) - (before.get(p.pid) ?? dev.overall(p));
            if (d >= 3) summary.breakout.push({ p, t, d });
            else if (d <= -3) summary.decline.push({ p, t, d });
          }
        }
        t[group] = keep;
      }
      const cut = t.farm.filter(p => p.age > 24 && p.mil !== 'serving');
      t.farm = t.farm.filter(p => p.age <= 24 || p.mil === 'serving');
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
      // 복무 중인 선수는 군보류다. 2군 정원에 들지 않는다.
      const held = t.farm.filter(p => p.mil === 'serving');
      t.farm = t.farm.filter(p => p.mil !== 'serving');
      while (t.farm.length > League.FARM_CAP) {
        const worst = t.farm.reduce((a,b) => this.farmValue(t,b) < this.farmValue(t,a) ? b : a);
        t.farm.splice(t.farm.indexOf(worst), 1);
        const c = this.careers.get(worst.pid);
        if (c && c.seasons.length) c.retired_year = this.year;
      }
      t.farm.push(...held);
    }
  }

  /* 영구결번. 흔하면 값이 없다 — 한 구단에서 오래, 크게 남긴 선수만.
     KBO 는 40여 년 동안 전 구단 합쳐 열댓 명뿐이다. */
  honorNumber(t, p, c) {
    if (!p.number || !c || c.years < 8) return null;
    const h = t.history; if (!h) return null;
    const mine = c.seasons.filter(s => s.team === t.name);
    if (mine.length < 8) return null;
    // 커리어의 대부분을 이 구단에서 보냈어야 한다. 떠돌이는 결번이 안 된다.
    const warHere = mine.reduce((a, s) => a + s.war, 0);
    if (c.war <= 0 || warHere / c.war < 0.62) return null;
    const awards = Object.values(c.awards || {}).reduce((a, b) => a + b, 0);
    const rings = mine.filter(s => this.champions.some(x => x.year === s.year && x.team === t.name)).length;
    // 세 갈래로 연다 — 압도적인 커리어, 훈장, 우승, 또는 한 구단에서 오래 버틴 얼굴.
    const ok = c.war >= 35
      || (c.war >= 28 && awards >= 1)
      || (c.war >= 26 && rings >= 2)
      || (c.war >= 30 && mine.length >= 12);
    if (!ok) return null;
    h.retired = h.retired || [];
    if (h.retired.some(r => r.number === p.number)) return null;   // 이미 걸린 번호
    const bat = p.kind === 'B';
    const tot = mine.reduce((a, s) => { const l = s.line;
      a.hr += l.hr || 0; a.rbi += l.rbi || 0; a.h += l.h || 0;
      a.w += l.w || 0; a.k += l.k || 0; a.sv += l.sv || 0; return a; }, {hr:0,rbi:0,h:0,w:0,k:0,sv:0});
    const rec = { number: p.number, name: p.name, pos: bat ? p.position : p.role,
      from: mine[0].year, to: mine[mine.length - 1].year, years: mine.length,
      war: Math.round(c.war * 10) / 10, awards, rings,
      line: bat ? `통산 ${tot.h}안타 · ${tot.hr}홈런 · ${tot.rbi}타점`
                : `통산 ${tot.w}승 · ${tot.k}탈삼진${tot.sv ? ` · ${tot.sv}세이브` : ''}` };
    h.retired.push(rec);
    this.log(`★ ${t.name} ${p.number}번 영구결번 — ${p.name}`);
    return rec;
  }

  newDraftSession() {
    const order = this.season.standings().slice().reverse().map(r => r.team);
    const pool = draft.makeClass(this.rng, this.year + 1);
    return new draft.DraftSession(this.teams, this.scouts, order, pool, this.rng, this.year + 1);
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
