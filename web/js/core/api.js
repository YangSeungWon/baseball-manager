// JSON API 레이어. UI 가 소비하는 유일한 경계면.
// 규칙: 엔진 객체를 밖으로 내보내지 않는다 / 모든 선수 데이터는 내 팀 스카우트를 통과한다.
import { League, Season, postseason } from './league.js';
import * as dev from './development.js';
import * as C from './contract.js';
import * as market from './market.js';
import * as R from './roster.js';
import * as dev2 from './development.js';

export const PRESEASON='preseason', REGULAR='regular', POSTSEASON='postseason',
  OFF_ROLLOVER='off_rollover', OFF_FA='off_fa', OFF_TRADE='off_trade', OFF_DRAFT='off_draft';
export const PHASE_LABEL = {
  [PRESEASON]:'스프링캠프', [REGULAR]:'정규시즌', [POSTSEASON]:'포스트시즌',
  [OFF_ROLLOVER]:'시즌 정리', [OFF_FA]:'FA 시장', [OFF_TRADE]:'트레이드', [OFF_DRAFT]:'신인 드래프트',
};
const r0 = (v) => Math.round(v);
const r1 = (v) => Math.round(v*10)/10;

export class Game {
  constructor(opts = {}) {
    const { userTeamId = 1, nTeams = 10, games = 144, startYear = 2030, seed = 1 } = opts;
    if (opts._empty) return;
    this.L = new League(nTeams, startYear, games, seed);
    this.userId = userTeamId;
    this.phase = PRESEASON;
    this.season = null; this.champion = null; this.playoffLog = [];
    this.faOffers = new Map(); this.draftSession = null; this.notices = [];
  }
  get me() { return this.L.team(this.userId); }
  find(pid) {
    for (const t of this.L.teams) {
      for (const p of [...t.batters, ...t.pitchers, ...t.farm]) if (p.pid === pid) return [p, t];
    }
    for (const p of this.L.unsigned) if (p.pid === pid) return [p, null];
    if (this.draftSession) for (const p of this.draftSession.available) if (p.pid === pid) return [p, null];
    return [null, null];
  }
  notice(text, kind='info') { this.notices.push({ kind, text }); }

  // ---- 조회 ----------------------------------------------------------
  ratings(p, viewer = null) {
    viewer = viewer || this.me;
    const c = this.L.careers.get(p.pid);
    const rep = this.L.scouts.get(viewer.team_id).report(p, this.L.rng, !!(c && c.seasons.length));
    const attrs = {};
    for (const a of dev.attrsOf(p)) {
      const [lo,hi] = rep.rangeOf(a,'cur'), [plo,phi] = rep.rangeOf(a,'pot');
      attrs[a] = { lo:r0(lo), hi:r0(hi), mid:r0(rep.estCur[a]), pot_lo:r0(plo), pot_hi:r0(phi) };
    }
    const [olo,ohi] = rep.ovrRange('cur'), [plo,phi] = rep.ovrRange('pot');
    return { attrs, ovr:{lo:r0(olo),hi:r0(ohi),mid:r0(rep.ovr)},
             pot:{lo:r0(plo),hi:r0(phi),mid:r0(rep.pot)},
             confidence:r0(rep.confidence), comment: rep.text() };
  }
  contractOf(p) {
    if (!p.contract) return null;
    return { years:p.contract.years, total:r1(p.contract.total), aav:r1(p.contract.aav),
             salary:r1(p.contract.salaryIn(this.L.year)), end_year:p.contract.end_year,
             text:String(p.contract) };
  }
  brief(p, team = null, viewer = null) {
    const rep = this.ratings(p, viewer);
    return { pid:p.pid, name:p.name, age:p.age,
      slot: p.kind==='P' ? p.role : p.position, kind:p.kind,
      hand: p.kind==='P' ? p.throws : p.bats,
      ovr:rep.ovr, pot:rep.pot, confidence:rep.confidence,
      team_id: team ? team.team_id : null, injury_days:p.injury_days,
      contract:this.contractOf(p), service:p.service ?? 0, origin:p.origin ?? null };
  }
  state() {
    const s = this.season;
    return { year:this.L.year, phase:this.phase, phase_label:PHASE_LABEL[this.phase],
      day: s ? s.curDay : 0, total_days: s ? s.totalDays : 0,
      user_team:{ id:this.me.team_id, name:this.me.name },
      mode:this.L.modes.get(this.userId), notices:this.notices, champion:this.champion };
  }
  /** 지난 시즌 최종 순위. 시즌 전 화면을 채운다. */
  lastStandings() {
    return { year: this.L.year - 1, rows: (this.lastTable || []).map(r =>
      ({ ...r, is_user: r.team_id === this.userId })) };
  }

  standings() {
    const s = this.season;
    if (!s) return { rows: [] };
    const st = s.standings(), top = st[0];
    return { rows: st.map((r,i) => {
      const gb = ((top.w-r.w) + (r.l-top.l))/2;
      return { rank:i+1, team_id:r.team.team_id, team:r.team.name, w:r.w, l:r.l, d:r.d,
        pct:r.pct.toFixed(3), gb: gb===0 ? '-' : gb.toFixed(1), rs:r.rs, ra:r.ra,
        pyth:r.pyth.toFixed(3), playoff:i<5, is_user:r.team.team_id===this.userId };
    })};
  }
  roster(teamId = null) {
    const t = this.L.team(teamId ?? this.userId);
    R.rebuildRoster(t, true);
    const s = this.season;
    const stat = (p) => {
      if (!s) return {};
      if (p.kind === 'B') { const b = s.bat.get(p.pid);
        return b ? { g:b.g, pa:b.pa, avg:b.avg.toFixed(3), ops:b.ops.toFixed(3),
                     hr:b.hr, rbi:b.rbi, sb:b.sb } : {}; }
      const q = s.pit.get(p.pid);
      return q ? { g:q.g, ip:q.ipStr, w:q.w, l:q.l, sv:q.sv, era:q.era.toFixed(2), k:q.k } : {};
    };
    const grp = (arr, tag) => arr.map((p,i) => ({ ...this.brief(p,t), group:tag, order:i+1, stat:stat(p) }));
    const injured = [...t.batters, ...t.pitchers].filter(p => p.injury_days > 0);
    return { team_id:t.team_id, name:t.name,
      lineup:grp(t.lineup,'lineup'), bench:grp(t.bench,'bench'),
      rotation:grp(t.rotation,'rotation'), bullpen:grp(t.bullpen,'bullpen'),
      injured: injured.map(p => ({ ...this.brief(p,t), group:'injured' })),
      payroll:r1(C.payroll(t, this.L.year)), budget:r1(t.finance.budget),
      mode:this.L.modes.get(t.team_id) };
  }
  farm(teamId = null) {
    const t = this.L.team(teamId ?? this.userId);
    const rows = [...t.farm].sort((a,b) => this.L.see(t,b).pot - this.L.see(t,a).pot)
      .map(p => this.brief(p, t));
    return { team:t.name, rows };
  }
  player(pid) {
    const [p, t] = this.find(pid);
    if (!p) return { error:'not_found' };
    const c = this.L.careers.get(pid);
    const out = { ...this.brief(p, t), ...this.ratings(p) };
    out.debut_year = p.debut_year;
    out.draft = p.drafted_overall ? { round:p.drafted_round, overall:p.drafted_overall } : null;
    out.injuries = { count:p.career_injuries ?? 0, days:p.career_injury_days ?? 0 };
    out.splits = this.splits(pid);
    out.seasons = [];
    if (c) {
      for (const s of c.seasons) {
        const l = s.line;
        out.seasons.push(p.kind === 'B'
          ? { year:s.year, team:s.team, age:s.age, g:l.g, pa:l.pa, avg:l.avg.toFixed(3),
              obp:l.obp.toFixed(3), slg:l.slg.toFixed(3), hr:l.hr, rbi:l.rbi, sb:l.sb, war:r1(s.war) }
          : { year:s.year, team:s.team, age:s.age, g:l.g, gs:l.gs, ip:l.ipStr, w:l.w, l:l.l,
              sv:l.sv, era:l.era.toFixed(2), k:l.k, whip:l.whip.toFixed(2), war:r1(s.war) });
      }
      out.career_war = r1(c.war);
      out.awards = { ...c.awards };
      out.events = c.events.map(e => ({ year:e.year, text:e.text }));
    }
    return out;
  }
  leaders(n = 5) {
    const s = this.season;
    if (!s) return { batting:[], pitching:[] };
    const [bw, pw] = s.wars();
    const g = s.gamesPlayed;
    let qb = s.qualifiedBatters(g), qp = s.qualifiedPitchers(g);
    if (!qb.length) qb = [...s.bat.values()].sort((a,b)=>b.pa-a.pa).slice(0,20);
    if (!qp.length) qp = [...s.pit.values()].sort((a,b)=>b.outs-a.outs).slice(0,20);
    const top = (items, key, fmt, label) => ({ label,
      rows: [...items].sort((a,b) => key(b)-key(a)).slice(0,n)
        .map(x => ({ pid:x.p.pid, name:x.p.name, team:x.team.name, value:fmt(x) })) });
    return {
      batting: [
        top(qb, b=>b.avg, b=>b.avg.toFixed(3), '타율'),
        top(qb, b=>b.obp, b=>b.obp.toFixed(3), '출루율'),
        top(qb, b=>b.ops, b=>b.ops.toFixed(3), 'OPS'),
        top([...s.bat.values()], b=>b.hr, b=>String(b.hr), '홈런'),
        top([...s.bat.values()], b=>b.rbi, b=>String(b.rbi), '타점'),
        top([...s.bat.values()], b=>b.sb, b=>String(b.sb), '도루'),
        top(qb, b=>bw.get(b.p.pid), b=>bw.get(b.p.pid).toFixed(1), 'WAR')],
      pitching: [
        top(qp, p=>-p.era, p=>p.era.toFixed(2), 'ERA'),
        top([...s.pit.values()], p=>p.k, p=>String(p.k), '탈삼진'),
        top([...s.pit.values()], p=>p.w, p=>String(p.w), '다승'),
        top([...s.pit.values()], p=>p.sv, p=>String(p.sv), '세이브'),
        top(qp, p=>pw.get(p.p.pid), p=>pw.get(p.p.pid).toFixed(1), 'WAR')],
    };
  }
  schedule(days = 7) {
    const s = this.season;
    if (!s) return { rows: [] };
    const rows = [];
    for (let d = s.curDay; d < Math.min(s.curDay + days, s.totalDays); d++) {
      for (const [hi, ai] of (s.byDay.get(d) ?? [])) {
        const H = s.teams[hi], A = s.teams[ai];
        if (H.team_id === this.userId || A.team_id === this.userId)
          rows.push({ day:d+1, home:H.name, away:A.name, is_home:H.team_id===this.userId,
                      opponent: (H.team_id===this.userId ? A : H).name });
      }
    }
    return { rows };
  }
  recentResults(n = 8) {
    const s = this.season;
    if (!s) return { rows: [] };
    const rows = [];
    for (const [d, hi, ai, hr, ar] of s.results) {
      const H = s.teams[hi], A = s.teams[ai];
      if (H.team_id !== this.userId && A.team_id !== this.userId) continue;
      const mine = H.team_id === this.userId ? hr : ar;
      const opp = H.team_id === this.userId ? ar : hr;
      rows.push({ day:d+1, opponent:(H.team_id===this.userId?A:H).name,
        home:H.team_id===this.userId, score:`${mine} : ${opp}`,
        result: mine>opp?'승':(mine<opp?'패':'무') });
    }
    return { rows: rows.slice(-n) };
  }
  /** 팀별 시즌 집계 + 최근 폼 + 홈/원정. 시즌 중 화면의 재료. */
  leagueTeamStats() {
    const s = this.season;
    if (!s) return { rows: [] };
    const acc = new Map(this.L.teams.map(t => [t.team_id, {
      team: t.name, team_id: t.team_id, pa:0, ab:0, h:0, hr:0, bb:0, k:0, sb:0, rbi:0,
      outs:0, er:0, pk:0, pbb:0, ph:0, phr:0 }]));
    for (const b of s.bat.values()) {
      const x = acc.get(b.team.team_id); if (!x) continue;
      x.pa += b.pa; x.ab += b.ab; x.h += b.h; x.hr += b.hr;
      x.bb += b.bb; x.k += b.k; x.sb += b.sb; x.rbi += b.rbi;
    }
    for (const p of s.pit.values()) {
      const x = acc.get(p.team.team_id); if (!x) continue;
      x.outs += p.outs; x.er += p.r; x.pk += p.k; x.pbb += p.bb; x.ph += p.h; x.phr += p.hr;
    }
    const rank = (arr, key, asc) => {
      const sorted = [...arr].sort((m,n) => asc ? key(m)-key(n) : key(n)-key(m));
      return new Map(sorted.map((x,i) => [x.team_id, i+1]));
    };
    const rows = [...acc.values()].map(x => ({ ...x,
      avg: x.ab ? x.h/x.ab : 0, ip: x.outs/3,
      era: x.outs ? x.er*9/(x.outs/3) : 0,
      whip: x.outs ? (x.ph+x.pbb)/(x.outs/3) : 0 }));
    const rAvg = rank(rows, r=>r.avg), rHr = rank(rows, r=>r.hr), rSb = rank(rows, r=>r.sb);
    const rEra = rank(rows, r=>r.era, true), rK = rank(rows, r=>r.pk);
    return { rows: rows.map(r => ({
      team_id:r.team_id, team:r.team,
      avg:r.avg.toFixed(3), hr:r.hr, sb:r.sb, bb:r.bb, k:r.k,
      era:r.era.toFixed(2), whip:r.whip.toFixed(2), pk:r.pk,
      rank:{ avg:rAvg.get(r.team_id), hr:rHr.get(r.team_id), sb:rSb.get(r.team_id),
             era:rEra.get(r.team_id), k:rK.get(r.team_id) },
      is_user:r.team_id===this.userId })) };
  }

  /** 최근 n경기 승패 + 홈/원정 성적 */
  form(teamId = null, n = 10) {
    const s = this.season;
    const id = teamId ?? this.userId;
    if (!s) return { recent: [], home:[0,0], away:[0,0] };
    const recent = [];
    let hw=0, hl=0, aw=0, al=0;
    for (const [d, hi, ai, hr, ar] of s.results) {
      const H = s.teams[hi], A = s.teams[ai];
      if (H.team_id !== id && A.team_id !== id) continue;
      const home = H.team_id === id;
      const mine = home ? hr : ar, opp = home ? ar : hr;
      const res = mine > opp ? 'W' : (mine < opp ? 'L' : 'D');
      if (res !== 'D') { if (home) (res==='W'?hw++:hl++); else (res==='W'?aw++:al++); }
      recent.push(res);
    }
    return { recent: recent.slice(-n), home:[hw,hl], away:[aw,al] };
  }

  /** 그날 리그 전체 결과 */
  dayResults(day = null) {
    const s = this.season;
    if (!s) return { day:0, rows:[] };
    const d = day ?? s.curDay - 1;
    return { day: d + 1, rows: s.results.filter(r => r[0] === d).map(([, hi, ai, hr, ar]) => ({
      home: s.teams[hi].name, away: s.teams[ai].name, hr, ar,
      user: s.teams[hi].team_id === this.userId || s.teams[ai].team_id === this.userId })) };
  }

  /** 구단주 요구 대비 현재 위치 */
  ownerStatus() {
    const t = this.me, f = t.finance;
    const s = this.season;
    const st = s ? this.standings().rows : [];
    const me = st.find(r => r.is_user);
    const need = { '우승':1, '포스트시즌':5, '5할 승률':null, '재건 허용':null }[f.demand];
    let ok = null, text = '시즌 전';
    if (me) {
      const rank = me.rank, pct = parseFloat(me.pct);
      if (f.demand === '우승') { ok = rank <= 3; text = `현재 ${rank}위`; }
      else if (f.demand === '포스트시즌') { ok = rank <= 5; text = `현재 ${rank}위 (5위까지 진출)`; }
      else if (f.demand === '5할 승률') { ok = pct >= 0.5; text = `현재 승률 ${me.pct}`; }
      else { ok = true; text = `현재 ${rank}위 · 성적 압박 없음`; }
    }
    return { demand: f.demand, patience: r0(f.patience), ok, text,
      remaining: s ? s.totalDays - s.curDay : this.L.games };
  }

  /** 우리 팀 상위 선수 */
  teamLeaders(teamId = null, n = 4) {
    const s = this.season;
    const id = teamId ?? this.userId;
    if (!s) return { batting: [], pitching: [] };
    const [bw, pw] = s.wars();
    const bats = [...s.bat.values()].filter(b => b.team.team_id === id && b.pa >= 20)
      .sort((a,b) => bw.get(b.p.pid) - bw.get(a.p.pid)).slice(0, n);
    const pits = [...s.pit.values()].filter(p => p.team.team_id === id && p.outs >= 30)
      .sort((a,b) => pw.get(b.p.pid) - pw.get(a.p.pid)).slice(0, n);
    return {
      batting: bats.map(b => ({ pid:b.p.pid, name:b.p.name, slot:b.p.position,
        line:`${b.avg.toFixed(3)} · ${b.hr}HR · ${b.rbi}타점`, war:r1(bw.get(b.p.pid)) })),
      pitching: pits.map(p => ({ pid:p.p.pid, name:p.p.name, slot:p.p.role,
        line:`${p.ipStr}이닝 · ${p.era.toFixed(2)} · ${p.k}K`, war:r1(pw.get(p.p.pid)) })),
    };
  }

  /** 계약 만료 · FA 자격 임박 */
  contractAlerts() {
    const t = this.me, y = this.L.year;
    const rows = [];
    for (const p of [...t.batters, ...t.pitchers]) {
      const sv = p.service ?? 0;
      const expiring = p.contract && p.contract.end_year <= y;
      const faSoon = sv >= C.FA_SERVICE - 1;
      if (!expiring && !faSoon) continue;
      rows.push({ ...this.brief(p, t),
        status: expiring && sv >= C.FA_SERVICE ? 'FA'
              : expiring ? '재계약' : `FA ${C.FA_SERVICE - sv}년 전` });
    }
    return { rows: rows.sort((a,b) => b.ovr.mid - a.ovr.mid).slice(0, 12) };
  }

  finances() {
    const t = this.me, f = t.finance, y = this.L.year;
    const contracts = [...t.batters, ...t.pitchers].filter(p => p.contract)
      .sort((a,b) => b.contract.salaryIn(y) - a.contract.salaryIn(y));
    return { market_size:Math.round(f.market_size*100)/100, revenue:r0(f.revenue),
      budget:r0(f.budget), payroll:r1(C.payroll(t,y)), room:r1(f.budget - C.payroll(t,y)),
      contracts: contracts.map(p => ({ pid:p.pid, name:p.name, age:p.age,
        salary:r1(p.contract.salaryIn(y)), text:String(p.contract), end_year:p.contract.end_year })) };
  }
  history(n = 40) {
    return { rows: this.L.history.slice(-n), champions: this.L.champions };
  }
  /** 선수 스플릿 — 홈/원정, 좌투 상대/우투 상대. 야구 팬의 판단 단위. */
  splits(pid) {
    const s = this.season;
    if (!s) return null;
    const b = s.bat.get(pid);
    if (b) {
      const f = (a) => { const [pa,ab,h,d2,d3,hr,bb,k,rbi] = a;
        const tb = (h-d2-d3-hr) + 2*d2 + 3*d3 + 4*hr;
        return { pa, ab, h, hr, bb, k, rbi,
          avg: ab ? (h/ab).toFixed(3) : '—',
          obp: pa ? ((h+bb)/pa).toFixed(3) : '—',
          slg: ab ? (tb/ab).toFixed(3) : '—' }; };
      return { kind:'B', rows: [['홈', f(b.sp.H)], ['원정', f(b.sp.A)],
                                ['vs 좌완', f(b.sp.L)], ['vs 우완', f(b.sp.R)]] };
    }
    const p = s.pit.get(pid);
    if (p) {
      const f = (a) => { const [outs,bf,h,hr,bb,k,r] = a;
        return { ip: `${Math.floor(outs/3)}.${outs%3}`, bf, h, hr, bb, k,
          era: outs ? (r*27/outs).toFixed(2) : '—',
          whip: outs ? ((h+bb)*3/outs).toFixed(2) : '—',
          k9: outs ? (k*27/outs).toFixed(2) : '—' }; };
      return { kind:'P', rows: [['홈', f(p.sp.H)], ['원정', f(p.sp.A)]] };
    }
    return null;
  }

  /** 수비 위치 배치 (다이아몬드) */
  lineupChart(teamId = null) {
    const t = this.L.team(teamId ?? this.userId);
    R.rebuildRoster(t, true);
    const byPos = {};
    for (const b of t.lineup) if (!byPos[b.position]) byPos[b.position] = this.brief(b, t);
    const sp = t.rotation[0] ? this.brief(t.rotation[0], t) : null;
    const cl = t.bullpen[0] ? this.brief(t.bullpen[0], t) : null;
    return { pos: byPos, sp, closer: cl };
  }

  /** 구단 연혁 표 */
  franchises() {
    return this.L.teams.map(t => {
      const h = t.history;
      return { team_id:t.team_id, name:t.name,
        founded:h?.founded ?? null, seasons:h?.seasons ?? 0,
        record:h ? `${h.allW}–${h.allL}` : '—', pct:h ? h.pct.toFixed(3) : '—',
        titles:h?.titles.length ?? 0, pennants:h?.pennants.length ?? 0,
        lastTitle:h?.lastTitle ?? null, drought:h?.drought ?? null,
        legend:h?.legend ?? null, tagline:h?.tagline ?? '' };
    }).sort((a,b) => b.titles - a.titles || b.pct - a.pct);
  }

  /** 역대 우승 연표 (구단 연혁 + 실제 시뮬레이션 결과) */
  titleTimeline() {
    const rows = [];
    for (const t of this.L.teams)
      for (const y of (t.history?.titles ?? [])) rows.push({ year:y, team:t.name, sim:false });
    for (const c of this.L.champions) rows.push({ year:c.year, team:c.team, sim:true });
    return rows.sort((a,b) => b.year - a.year);
  }

  awardHistory(n = 20) {
    return (this.L.awardLog || []).slice(-n).reverse();
  }

  /** 단일 시즌 최고 기록 */
  seasonRecords(n = 5) {
    const bats = [], pits = [];
    for (const c of this.L.careers.values())
      for (const s of c.seasons) {
        const row = { pid:c.p.pid, name:c.p.name, year:s.year, team:s.team, l:s.line, war:s.war };
        (c.kind === 'B' ? bats : pits).push(row);
      }
    const top = (arr, key, fmt, label, min) => ({ label, rows: arr.filter(min)
      .sort((a,b) => key(b) - key(a)).slice(0,n)
      .map(x => ({ pid:x.pid, name:x.name, year:x.year, team:x.team, value:fmt(x) })) });
    return { batting: [
      top(bats, x=>x.l.hr, x=>String(x.l.hr), '홈런', ()=>true),
      top(bats, x=>x.l.rbi, x=>String(x.l.rbi), '타점', ()=>true),
      top(bats, x=>x.l.avg, x=>x.l.avg.toFixed(3), '타율', x=>x.l.pa>=400),
      top(bats, x=>x.l.sb, x=>String(x.l.sb), '도루', ()=>true),
      top(bats, x=>x.war, x=>x.war.toFixed(1), 'WAR', ()=>true)],
      pitching: [
      top(pits, x=>x.l.w, x=>String(x.l.w), '다승', ()=>true),
      top(pits, x=>x.l.k, x=>String(x.l.k), '탈삼진', ()=>true),
      top(pits, x=>-x.l.era, x=>x.l.era.toFixed(2), 'ERA', x=>x.l.outs>=300),
      top(pits, x=>x.l.sv, x=>String(x.l.sv), '세이브', ()=>true),
      top(pits, x=>x.war, x=>x.war.toFixed(1), 'WAR', ()=>true)] };
  }

  records(n = 10) {
    const all = [...this.L.careers.values()].filter(c => c.years >= 1);
    const bats = all.filter(c => c.kind === 'B'), pits = all.filter(c => c.kind === 'P');
    const row = (c, v) => ({ pid:c.p.pid, name:c.p.name, value:v, years:c.years,
                             active: c.retired_year === null });
    const top = (arr, key, fmt, label) => ({ label, rows: [...arr]
      .sort((a,b) => key(b) - key(a)).slice(0,n).map(c => row(c, fmt(c))) });
    return {
      hr: bats.sort((a,b)=>b.tot('hr')-a.tot('hr')).slice(0,n).map(c=>row(c,c.tot('hr'))),
      war: all.sort((a,b)=>b.war-a.war).slice(0,n).map(c=>row(c,c.war.toFixed(1))),
      batting: [
        top(bats, c=>c.tot('hr'), c=>String(c.tot('hr')), '홈런'),
        top(bats, c=>c.tot('h'), c=>String(c.tot('h')), '안타'),
        top(bats, c=>c.tot('rbi'), c=>String(c.tot('rbi')), '타점'),
        top(bats, c=>c.tot('sb'), c=>String(c.tot('sb')), '도루'),
        top(bats, c=>c.war, c=>c.war.toFixed(1), 'WAR')],
      pitching: [
        top(pits, c=>c.tot('w'), c=>String(c.tot('w')), '다승'),
        top(pits, c=>c.tot('k'), c=>String(c.tot('k')), '탈삼진'),
        top(pits, c=>c.tot('sv'), c=>String(c.tot('sv')), '세이브'),
        top(pits, c=>Math.round(c.tot('outs')/3), c=>String(Math.round(c.tot('outs')/3)), '이닝'),
        top(pits, c=>c.war, c=>c.war.toFixed(1), 'WAR')],
    };
  }
  teamList() {
    return this.L.teams.map(t => ({ id:t.team_id, name:t.name,
      market: Math.round(t.finance.market_size*100)/100,
      mode: this.L.modes.get(t.team_id) }));
  }

  /** 지난 시즌을 미리 굴려 리그에 과거를 만든다. 팀 선택 화면의 재료가 된다. */
  prologue() {
    const S = new Season(this.L.teams, this.L.year, this.L.games, this.L.rng);
    S.run();
    this.season = S; this.L.season = S;
    const [champ] = postseason(S, this.L.rng);
    this.lastTable = S.standings().map((r, i) => ({
      team_id: r.team.team_id, team: r.team.name, rank: i + 1, w: r.w, l: r.l, d: r.d,
      pct: r.pct.toFixed(3), rs: r.rs, ra: r.ra, playoff: i < 5,
      champion: r.team.team_id === champ.team_id }));
    this.absorbSeason(champ);
    this.L.offRollover();
    this.L.offFA();                    // 아직 사용자가 없으므로 전 구단 AI
    this.L.offTrades();
    this.L.offCleanup();
    const d = this.L.newDraftSession(); d.runUntil(); this.L.finishDraft(d);
    this.season = null; this.L.season = null;
    this.phase = PRESEASON; this.champion = null; this.notices = [];
    return this;
  }

  /** 팀 선택 화면의 구단 서류. 능력치는 그 구단 스카우트의 눈으로 본 값이다. */
  teamDossier(teamId) {
    const t = this.L.team(teamId);
    const f = t.finance;
    const last = (this.lastTable || []).find(r => r.team_id === teamId) || null;
    const core = [...t.lineup, ...t.rotation];
    const ovr = (p) => this.ratings(p, t).ovr.mid;
    const mean = (a) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 50;
    const bat = mean(t.lineup.map(ovr));
    const pit = mean(t.rotation.concat(t.bullpen.slice(0,3)).map(ovr));
    const farmTop = [...t.farm].map(p => this.ratings(p, t).pot.mid)
      .sort((a,b) => b-a).slice(0,5);
    const strength = (bat + pit) / 2;
    const farm = mean(farmTop);
    // 리그 내 순위로 환산해야 읽힌다. "전력 49"는 아무 의미가 없다.
    const rankOf = (fn) => {
      const vals = this.L.teams.map(x => [x.team_id, fn(x)]).sort((p,q) => q[1]-p[1]);
      return vals.findIndex(v => v[0] === teamId) + 1;
    };
    const teamMean = (x, arr) => mean(arr(x).map(p => this.ratings(p, x).ovr.mid));
    const batRank = rankOf(x => teamMean(x, y => y.lineup));
    const pitRank = rankOf(x => teamMean(x, y => y.rotation.concat(y.bullpen.slice(0,3))));
    const strRank = rankOf(x => (teamMean(x, y => y.lineup)
      + teamMean(x, y => y.rotation.concat(y.bullpen.slice(0,3)))) / 2);
    const farmRank = rankOf(x => mean([...x.farm].map(p => this.ratings(p, x).pot.mid)
      .sort((m,n) => n-m).slice(0,5)));
    const budRank = rankOf(x => x.finance.budget);
    const n = this.L.teams.length, mid = (n + 1) / 2;

    const DEMAND_W = { '우승':3, '포스트시즌':2, '5할 승률':1, '재건 허용':0 };
    let diff = 3 + (strRank - mid) * 0.42 + (budRank - mid) * 0.22
      + (DEMAND_W[f.demand] - 1.5) * 0.55 - (f.patience - 50) / 20;
    diff = Math.max(1, Math.min(5, Math.round(diff)));
    const key = core.slice().sort((a,b) => ovr(b) - ovr(a)).slice(0,3)
      .map(p => this.brief(p, t));
    const prospect = [...t.farm].sort((a,b) => this.ratings(b,t).pot.mid - this.ratings(a,t).pot.mid)
      .slice(0,2).map(p => this.brief(p, t));
    return {
      id: t.team_id, name: t.name, city: t.name.split(' ')[0], nick: t.name.split(' ')[1],
      market: Math.round(f.market_size*100)/100,
      budget: r0(f.budget), payroll: r1(C.payroll(t, this.L.year)),
      room: r1(f.budget - C.payroll(t, this.L.year)),
      patience: r0(f.patience), demand: f.demand,
      strength: r0(strength), batting: r0(bat), pitching: r0(pit), farm: r0(farm),
      rank: { strength: strRank, batting: batRank, pitching: pitRank,
              farm: farmRank, budget: budRank, of: n },
      difficulty: diff, last, key, prospect,
      history: t.history ? {
        founded: t.history.founded, seasons: t.history.seasons,
        titles: t.history.titles.length, pennants: t.history.pennants.length,
        lastTitle: t.history.lastTitle, drought: t.history.drought,
        record: `${t.history.allW}승 ${t.history.allL}패`,
        pct: t.history.pct.toFixed(3), tagline: t.history.tagline,
        legend: t.history.legend, titleYears: t.history.titles,
      } : null,
      note: this._teamNote(f, strRank, farmRank, budRank, mid),
    };
  }

  /** 한 줄 성격. 데이터에서 뽑는다 (하드코딩 아님). */
  _teamNote(f, strRank, farmRank, budRank, mid) {
    const bits = [];
    if (budRank <= mid - 1.5) bits.push('풍부한 자금');
    else if (budRank >= mid + 1.5) bits.push('빠듯한 살림');
    if (strRank <= mid - 1.5) bits.push('즉시 전력');
    else if (strRank >= mid + 1.5) bits.push('얇은 선수층');
    if (farmRank <= 2) bits.push('유망주 풍년');
    if (f.patience <= 32) bits.push('성마른 구단주');
    else if (f.patience >= 65) bits.push('느긋한 구단주');
    return bits.slice(0, 3).join(' · ') || '평범한 구단';
  }

  // ---- 액션 ----------------------------------------------------------
  startSeason() {
    if (this.phase !== PRESEASON) return { error:'wrong_phase' };
    this.season = new Season(this.L.teams, this.L.year, this.L.games, this.L.rng);
    this.L.season = this.season;
    this.phase = REGULAR; this.notices = []; this.champion = null;
    return this.state();
  }
  advance(days = 1) {
    if (this.phase !== REGULAR) return { error:'wrong_phase' };
    this.notices = [];
    const played = [];
    for (let i = 0; i < days; i++) {
      if (this.season.finished) break;
      const nInj = this.season.injuries.length;
      for (const g of this.season.playDay(this.userId)) {
        const H = this.season.teams[g.hi], A = this.season.teams[g.ai];
        if (H.team_id === this.userId || A.team_id === this.userId) {
          const mine = H.team_id === this.userId ? g.hr : g.ar;
          const opp = H.team_id === this.userId ? g.ar : g.hr;
          played.push({ day:this.season.curDay, opponent:(H.team_id===this.userId?A:H).name,
            score:`${mine} : ${opp}`, result: mine>opp?'승':(mine<opp?'패':'무'),
            box: g.box ? this.boxscore(g.box) : null });
        }
      }
      for (const inj of this.season.injuries.slice(nInj))
        if (inj.team.team_id === this.userId)
          this.notice(`${inj.player.name} ${inj.label} — ${inj.days}일 결장`, 'injury');
    }
    if (this.season.finished) { this.phase = POSTSEASON; this.notice('정규시즌 종료', 'phase'); }
    return { state:this.state(), games:played };
  }
  simToEnd() { return this.advance(this.season.totalDays - this.season.curDay); }
  boxscore(box) {
    const side = (S) => ({ team:S.team.name, runs:S.runs, hits:S.hits, line:S.line,
      pitchers: S.pitchers.map(pl => ({ name:pl.p.name, ip:`${Math.floor(pl.outs/3)}.${pl.outs%3}`,
        h:pl.h, r:pl.r, k:pl.k, bb:pl.bb, dec: pl.w?'승':pl.l?'패':pl.sv?'세':'' })),
      batters: S.team.lineup.filter(b => S.bat.has(b.pid)).map(b => {
        const L = S.bat.get(b.pid);
        return { name:b.name, slot:b.position, ab:L.ab, h:L.h, hr:L.hr, rbi:L.rbi, bb:L.bb, k:L.k };
      })});
    return { home:side(box.H), away:side(box.A),
             plays: box.plays.slice(-40) };
  }
  runPostseason() {
    if (this.phase !== POSTSEASON) return { error:'wrong_phase' };
    const [champ, log] = postseason(this.season, this.L.rng);
    this.champion = champ.name;
    this.playoffLog = log.map(([r,w,l,sc]) => ({ round:r, winner:w.name, loser:l.name,
      score:`${sc[0]}승 ${sc[1]}패`, user: w.team_id===this.userId || l.team_id===this.userId }));
    this.absorbSeason(champ);
    this.phase = OFF_ROLLOVER;
    return { champion:this.champion, rounds:this.playoffLog,
             user_won: champ.team_id === this.userId };
  }
  absorbSeason(champ) {
    const L = this.L, S = this.season;
    const [bw, pw] = S.wars();
    for (const b of S.bat.values()) {
      const c = L.career(b.p);
      if (!c.seasons.length) b.p.debut_year = L.year;
      c.add(L.year, b.team.name, b, bw.get(b.p.pid), b.p.age);
    }
    for (const p of S.pit.values()) {
      const c = L.career(p.p);
      if (!c.seasons.length) p.p.debut_year = L.year;
      c.add(L.year, p.team.name, p, pw.get(p.p.pid), p.p.age);
    }
    const cands = [...S.bat.values()].filter(b=>b.pa>=200).map(b=>[bw.get(b.p.pid), b.p])
      .concat([...S.pit.values()].filter(q=>q.ip>=50).map(q=>[pw.get(q.p.pid), q.p]));
    if (!L.awardLog) L.awardLog = [];
    if (cands.length) {
      const mvp = cands.reduce((a,b)=>b[0]>a[0]?b:a)[1];
      L.career(mvp).award('MVP');
      L.log(`MVP ${mvp.name}`);
      const line = S.bat.get(mvp.pid) || S.pit.get(mvp.pid);
      L.awardLog.push({ year:L.year, kind:'MVP', pid:mvp.pid, name:mvp.name,
        team: line ? line.team.name : '', line: line ? (S.bat.has(mvp.pid)
          ? `${line.avg.toFixed(3)} · ${line.hr}HR · ${line.rbi}타점`
          : `${line.w}승 ${line.l}패 · ${line.era.toFixed(2)}`) : '' });
    }
    const cy = [...S.pit.values()].filter(q=>q.ip>=50);
    if (cy.length) {
      const best = cy.reduce((a,b)=>pw.get(b.p.pid)>pw.get(a.p.pid)?b:a);
      L.career(best.p).award('최고투수');
      L.log(`최고투수 ${best.p.name}`);
      L.awardLog.push({ year:L.year, kind:'최고투수', pid:best.p.pid, name:best.p.name,
        team:best.team.name, line:`${best.w}승 ${best.l}패 · ${best.era.toFixed(2)} · ${best.k}K` });
    }
    for (const t of L.teams) for (const p of [...t.batters, ...t.pitchers]) p.service = (p.service ?? 0)+1;
    for (const r of S.standings()) L.recPct.set(r.team.team_id, r.pct);
    L.champions.push({ year:L.year, team:champ.name });
    L.log(`★ 챔피언 ${champ.name}`);
  }
  offseasonRollover() {
    if (this.phase !== OFF_ROLLOVER) return { error:'wrong_phase' };
    const s = this.L.offRollover();
    const me = this.userId;
    const out = {
      retired: s.retired.map(({p,t}) => ({ name:p.name, age:p.age, team:t.name, mine:t.team_id===me,
        war: r1(this.L.careers.get(p.pid)?.war ?? 0), years: this.L.careers.get(p.pid)?.years ?? 0 })),
      breakout: s.breakout.filter(x=>x.t.team_id===me).map(({p,t,d}) => ({ name:p.name, delta:r1(d) })),
      decline: s.decline.filter(x=>x.t.team_id===me).map(({p,t,d}) => ({ name:p.name, delta:r1(d) })),
    };
    this.phase = OFF_FA; this.faOffers = new Map();
    return out;
  }
  freeAgents() {
    if (this.phase !== OFF_FA) return { rows: [] };
    const me = this.me, year = this.L.year;
    const cands = [];
    for (const t of this.L.teams)
      for (const p of [...t.batters, ...t.pitchers]) {
        if (p.contract && p.contract.end_year > year) continue;
        if (C.isFreeAgent(p, year)) cands.push([p, t]);
      }
    for (const p of this.L.unsigned) cands.push([p, null]);
    const rows = cands.map(([p,t]) => {
      const ip = p.kind === 'P';
      const r = this.L.see(me, p);
      const askAav = C.marketValue(r.ovr, p.age, ip);
      const askYrs = C.demandYears(p.age, r.ovr);
      return { ...this.brief(p, t), former_team: t ? t.name : '미계약',
        ask: { years:askYrs, aav:r1(askAav), total:r1(askAav*askYrs) },
        // 다른 팀들이 경쟁적으로 지르므로 실제 낙찰가는 요구액보다 높은 경우가 많다
        est: { low:r1(askAav*0.95), high:r1(askAav*1.75) },
        offer: this.faOffers.get(p.pid) ?? null };
    }).sort((a,b) => b.ask.total - a.ask.total);
    return { rows, budget:r0(me.finance.budget),
             room:r1(me.finance.budget - C.payroll(me, year+1)) };
  }
  offer(pid, years, aav) {
    if (this.phase !== OFF_FA) return { error:'wrong_phase' };
    this.faOffers.set(pid, [Math.max(1,+years), Math.max(C.MIN_SALARY,+aav)]);
    return { ok:true };
  }
  cancelOffer(pid) { this.faOffers.delete(pid); return { ok:true }; }
  resolveFA() {
    if (this.phase !== OFF_FA) return { error:'wrong_phase' };
    const log = this.L.offFA(this.faOffers, this.me);
    this.phase = OFF_TRADE;
    return { signings: log.map(s => ({ name:s.player.name, age:s.player.age,
      slot: s.player.kind==='P' ? s.player.role : s.player.position,
      team:s.team.name, text:String(s.contract), mine:s.team.team_id===this.userId,
      moved: s.team !== s.from })).sort((a,b) => (b.mine?1:0)-(a.mine?1:0)) };
  }
  tradeAssets(teamId) {
    const t = this.L.team(teamId);
    return { team:t.name, mode:this.L.modes.get(t.team_id),
      roster: [...t.batters, ...t.pitchers].map(p => this.brief(p, t)),
      farm: t.farm.map(p => ({ ...this.brief(p, t), farm:true })) };
  }
  tradeEvaluate(givePids, getPids, otherTeamId) {
    const other = this.L.team(otherTeamId), me = this.me;
    const yr = this.L.year, modes = this.L.modes;
    const val = (team, pids) => pids.reduce((s, pid) => {
      const [p] = this.find(pid);
      if (!p) return s;
      const farm = me.farm.includes(p) || other.farm.includes(p);
      return s + market.tradeValue(this.L, team, p, yr, modes.get(team.team_id), farm);
    }, 0);
    const theirGain = val(other, givePids) - val(other, getPids);
    const myGain = val(me, getPids) - val(me, givePids);
    let verdict, text;
    if (theirGain > 6) { verdict='accept'; text='받아들일 만한 제안입니다.'; }
    else if (theirGain > -2) { verdict='close'; text='조금 아쉽습니다. 뭔가 더 얹어 주시죠.'; }
    else { verdict='reject'; text='우리에게 손해입니다.'; }
    return { verdict, text, my_gain:r1(myGain), mode:modes.get(otherTeamId) };
  }
  proposeTrade(givePids, getPids, otherTeamId) {
    const r = this.tradeEvaluate(givePids, getPids, otherTeamId);
    if (r.verdict !== 'accept') return { ...r, ok:false };
    const me = this.me, other = this.L.team(otherTeamId);
    for (const pid of givePids) { const [p] = this.find(pid); market.movePlayer(me, p, me.farm.includes(p), other); }
    for (const pid of getPids) { const [p] = this.find(pid); market.movePlayer(other, p, other.farm.includes(p), me); }
    this.L.log(`[트레이드] ${me.name} ↔ ${other.name} (${givePids.length}:${getPids.length})`);
    return { ...r, ok:true };
  }
  resolveTrades() {
    if (this.phase !== OFF_TRADE) return { error:'wrong_phase' };
    const n = this.L.offTrades();
    this.L.offCleanup();
    this.draftSession = this.L.newDraftSession();
    this.draftSession.runUntil(this.me);
    this.phase = OFF_DRAFT;
    return { ai_trades:n };
  }
  draftBoard(n = 40) {
    const d = this.draftSession;
    if (!d) return { rows: [] };
    const rows = d.available.map(p => ({ ...this.brief(p, null), origin:p.origin ?? null }))
      .sort((a,b) => (b.pot.mid*0.7 + b.ovr.mid*0.3) - (a.pot.mid*0.7 + a.ovr.mid*0.3));
    return { on_clock: d.onClock ? d.onClock.name : null, my_turn: d.onClock === this.me,
      pick_no: d.n + 1, round: Math.floor(d.n/d.order.length)+1, total: d.totalPicks,
      rows: rows.slice(0, n),
      picks: d.picks.map(x => ({ n:x.n, round:x.round, team:x.team.name, name:x.player.name,
        age:x.player.age, origin:x.player.origin ?? '', mine:x.team.team_id===this.userId })) };
  }
  draftPick(pid) {
    const d = this.draftSession;
    if (!d || d.onClock !== this.me) return { error:'not_your_turn' };
    const [p] = this.find(pid);
    if (!p) return { error:'not_found' };
    d.pick(p); d.runUntil(this.me);
    if (d.done) return this.finishOffseason();
    return { picked:p.name, board:this.draftBoard() };
  }
  finishOffseason() {
    const d = this.draftSession;
    if (d) { d.runUntil(); this.L.finishDraft(d); }
    this.draftSession = null;
    this.phase = PRESEASON; this.season = null;
    return { state:this.state() };
  }
}
