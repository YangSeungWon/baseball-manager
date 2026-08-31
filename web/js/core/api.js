// JSON API 레이어. UI 가 소비하는 유일한 경계면.
// 규칙: 엔진 객체를 밖으로 내보내지 않는다 / 모든 선수 데이터는 내 팀 스카우트를 통과한다.
import { League, Season, postseason, syncHistory } from './league.js';
import * as dev from './development.js';
import * as C from './contract.js';
import * as market from './market.js';
import * as R from './roster.js';
import * as FR from './names.js';
import { PITCH, kmh } from './pitch.js';
import { FEAT } from './feats.js';
import * as FG from './foreign.js';
import * as SF from './staff.js';
import * as PS from './persona.js';
import * as ML from './military.js';
import * as dev2 from './development.js';
import { Mailbox, scanDay, scanState, scanForeign, offseasonMail, seasonEndMail, josa } from './mail.js';

export const PRESEASON='preseason', REGULAR='regular', POSTSEASON='postseason',
  OFF_ROLLOVER='off_rollover', OFF_FOREIGN='off_foreign', OFF_FA='off_fa',
  OFF_TRADE='off_trade', OFF_DRAFT='off_draft';
export const TACTIC_DEFS = [
  { key:'bunt',  label:'번트',      steps:['안 함','적게','보통','자주','적극'],
    hint:'주자를 한 베이스 보내는 대신 아웃 하나를 준다' },
  { key:'steal', label:'도루',      steps:['자제','신중','보통','적극','저돌'],
    hint:'성공하면 득점권, 실패하면 이닝이 끝난다' },
  { key:'pinch', label:'대타',      steps:['안 함','아끼기','보통','자주','총력'],
    hint:'한 번 쓰면 원래 타자는 그날 끝이다' },
  { key:'hook',  label:'투수 교체', steps:['길게','여유','보통','빠르게','즉시'],
    hint:'같은 피로에서 얼마나 먼저 손을 드는가' },
  { key:'ibb',   label:'고의사구',  steps:['안 함','드물게','보통','자주','적극'],
    hint:'무서운 타자를 거르고 다음 타자와 승부한다' },
  { key:'shift', label:'시프트',    steps:['안 함','약하게','보통','적극','극단'],
    hint:'당긴 타구를 막는 대신 반대쪽이 열린다' },
];

export const PHASE_LABEL = {
  [PRESEASON]:'스프링캠프', [REGULAR]:'정규시즌', [POSTSEASON]:'포스트시즌',
  [OFF_ROLLOVER]:'시즌 정리', [OFF_FOREIGN]:'외국인 시장', [OFF_FA]:'FA 시장',
  [OFF_TRADE]:'트레이드', [OFF_DRAFT]:'신인 드래프트',
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
    this.L.mail = new Mailbox();
    this._prev = { rank: 0, run: 0 };
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
    const rep = this.L.scouts.get(viewer.team_id)
      .report(p, this.L.rng, !!(c && c.seasons.length), SF.scoutMult(viewer));
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
    return { pid:p.pid, name:p.name, age:p.age, number:p.number ?? null,
      slot: p.kind==='P' ? p.role : p.position, kind:p.kind,
      hand: p.kind==='P' ? p.throws : p.bats,
      ovr:rep.ovr, pot:rep.pot, confidence:rep.confidence,
      team_id: team ? team.team_id : null, injury_days:p.injury_days,
      contract:this.contractOf(p), service:p.service ?? 0, origin:p.origin ?? null,
      mil: p.foreign ? null : { s:p.mil || 'none', kr:ML.STATUS_KR[p.mil || 'none'],
        kind:p.milKind || null, left:p.milLeft || 0, natl:p.natl || 0,
        due: (p.mil === 'none' && !p.foreign) ? Math.max(0, ML.MIL.callAge - p.age) : null },
      height:p.height ?? null, weight:p.weight ?? null };
  }
  state() {
    const s = this.season;
    return { year:this.L.year, phase:this.phase, phase_label:PHASE_LABEL[this.phase],
      day: s ? s.curDay : 0, total_days: s ? s.totalDays : 0,
      user_team:{ id:this.me.team_id, name:this.me.name },
      mode:this.L.modes.get(this.userId), notices:this.notices, champion:this.champion,
      unread: this.L.mail ? this.L.mail.unread : 0,
      new_important: this.newImportant || 0 };
  }
  /** 지난 시즌 포스트시즌 대진 */
  lastPostseason() {
    return { year: this.L.year - 1, rounds: this.lastPlayoffs || [] };
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
      rotation:grp(t.rotation,'rotation').map((p,i) => ({ ...p, pen:`${i+1}선발` })),
      bullpen:grp(t.bullpen,'bullpen').map((p,i) => ({ ...p, pen:R.PEN_LABEL[t.bullpen[i].pen_role] })),
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
    out.team = t ? t.name : null;
    out.debut_year = p.debut_year;
    out.draft = p.drafted_overall ? { round:p.drafted_round, overall:p.drafted_overall,
      year: p.drafted_year || null,
      look: p.draft_look ? { ovr:[p.draft_look[0], p.draft_look[1]],
                             pot:[p.draft_look[2], p.draft_look[3]] } : null } : null;
    out.injuries = { count:p.career_injuries ?? 0, days:p.career_injury_days ?? 0 };
    // 레퍼토리는 스카우팅 대상이 아니다. 무슨 공을 던지는지는 보면 안다.
    if (p.kind === 'P' && p.arsenal)
      out.arsenal = p.arsenal.map(x => ({ kr: PITCH[x].kr, kmh: kmh(p, x) }));
    out.splits = this.splits(pid);
    // 성향. 겪어본 만큼만 보인다.
    const t2 = this.find(pid)[1] || this.me;
    const car = this.L.careers.get(pid);
    const cpa = car ? car.seasons.reduce((s, x) => s + ((x.line && x.line.pa) || 0), 0) : 0;
    out.traits = PS.read(p, { years: PS.yearsWith(this.me, p),
      seasons: car ? car.seasons.length : 0,
      rispPa: Math.round(cpa * 0.22), talks: p.talks || 0 });
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
    const mine = (hi, ai) =>
      s.teams[hi].team_id === this.userId || s.teams[ai].team_id === this.userId;
    const rows = s.results.filter(r => r[0] === d).map(([, hi, ai, hr, ar, dh, cl]) => ({
      home: s.teams[hi].name, away: s.teams[ai].name, hr, ar,
      dh: !!dh, called: !!cl, tie: hr === ar, user: mine(hi, ai) }));
    // 비로 열리지 않은 경기도 그날의 결과다.
    for (const [rd, hi, ai] of s.rained) if (rd === d)
      rows.push({ home: s.teams[hi].name, away: s.teams[ai].name, rain: true, user: mine(hi, ai) });
    return { day: d + 1, rows };
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
    const inc = f.income || {};
    const contracts = [...t.batters, ...t.pitchers].filter(p => p.contract)
      .sort((a,b) => b.contract.salaryIn(y) - a.contract.salaryIn(y));
    return { market_size:Math.round(f.market_size*100)/100, revenue:r0(f.revenue),
      budget:r0(f.budget), payroll:r1(C.payroll(t,y)), room:r1(f.budget - C.payroll(t,y)),
      park:{ name:t.park.name, capacity:t.park.capacity, opened:t.park.opened,
        avg: f.homeGames ? Math.round(f.attendance/f.homeGames) : null,
        rate: f.homeGames ? Math.round(f.attendance/f.homeGames/t.park.capacity*100) : null,
        total: f.attendance || 0 },
      income:{ ticket:inc.ticket ?? 0, concession:inc.concession ?? 0, media:inc.media ?? 0 },
      contracts: contracts.map(p => ({ pid:p.pid, name:p.name, age:p.age,
        salary:r1(p.contract.salaryIn(y)), text:String(p.contract), end_year:p.contract.end_year })) };
  }
  history(n = 40) {
    return { rows: this.L.history.slice(-n), champions: this.L.champions };
  }
  mail(n = 60) {
    const mb = this.L.mail;
    return { unread: mb.unread, rows: mb.recent(n).map(m => ({
      id:m.id, year:m.year, day:m.day ?? null, kind:m.kind, pri:m.pri,
      title:m.title, body:m.body, pid:m.pid ?? null, tid:m.tid ?? null, read:m.read })) };
  }
  markMailRead() { this.L.mail.markAllRead(); return { ok:true }; }

  /** 선수 스플릿 — 홈/원정, 좌투 상대/우투 상대. 야구 팬의 판단 단위. */
  splits(pid) {
    const s = this.season;
    if (!s) return null;
    const b = s.bat.get(pid);
    if (b) {
      const f = (a) => { const [pa,ab,h,d2,d3,hr,bb,k,rbi,hbp=0] = a;
        const tb = (h-d2-d3-hr) + 2*d2 + 3*d3 + 4*hr;
        return { pa, ab, h, hr, bb, k, rbi,
          avg: ab ? (h/ab).toFixed(3) : '—',
          obp: pa ? ((h+bb+hbp)/pa).toFixed(3) : '—',
          slg: ab ? (tb/ab).toFixed(3) : '—' }; };
      // 득점권은 표본이 작다. 그 숫자를 곧이곧대로 읽으면 안 된다.
      const risp = f(b.sp.S), all = b.ab ? b.h / b.ab : 0;
      const w = risp.pa / (risp.pa + SF.regressPrior(this.me));
      risp.est = risp.ab ? (w * (b.sp.S[2] / b.sp.S[1]) + (1 - w) * all).toFixed(3) : '—';
      risp.trust = Math.round(w * 100);
      risp.analyst = SF.dataTrust(this.me);
      return { kind:'B', rows: [['홈', f(b.sp.H)], ['원정', f(b.sp.A)],
                                ['vs 좌완', f(b.sp.L)], ['vs 우완', f(b.sp.R)],
                                ['득점권', risp]] };
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
        legend:h?.legend ?? null, tagline:h?.tagline ?? '',
        retired: (h?.retired ?? []).slice().sort((a,b) => a.number - b.number) };
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
  /** 창단 시점의 외국인. 리그가 시작될 때 이미 세 명씩 뛰고 있다. */
  seedForeign() {
    const rng = this.L.rng;
    const seeded = new Set();
    for (const t of this.L.teams) {
      while (FG.foreignOf(t).room > 0) {
        const f = FG.foreignOf(t);
        const kind = f.pitcherRoom > 0 && (f.room > 1 || rng.random() < 0.6) ? 'P' : 'B';
        let p, guard = 0;
        do { p = FG.makeForeign(rng, kind, this.L.year); } while (seeded.has(p.name) && guard++ < 30);
        seeded.add(p.name);
        p.kbo_years = rng.choice([0, 0, 1, 1, 2, 3]);
        this._addForeign(t, p, FG.askingPrice(p, p.kbo_years > 0));
      }
    }
  }

  prologue() {
    const S = new Season(this.L.teams, this.L.year, this.L.games, this.L.rng);
    S.run();
    this.season = S; this.L.season = S;
    const [champ, plog] = postseason(S, this.L.rng);
    this.lastPlayoffs = plog.map(([round, w, l, sc, games, hi, lo]) => ({
      round, winner: w.name, loser: l.name, w: sc[0], l: sc[1],
      higher: hi ? hi.name : null, lower: lo ? lo.name : null,
      games: (games || []).map(g => ({ home: g.home, away: g.away, hr: g.hr, ar: g.ar })) }));
    this.lastTable = S.standings().map((r, i) => ({
      team_id: r.team.team_id, team: r.team.name, rank: i + 1, w: r.w, l: r.l, d: r.d,
      pct: r.pct.toFixed(3), rs: r.rs, ra: r.ra, playoff: i < 5,
      champion: r.team.team_id === champ.team_id }));
    // 이번 시즌에 나온 대기록을 리그 역사에 남긴다.
    if (this.season && this.season.feats) {
      this.L.feats.push(...this.season.feats);
      this.season.feats = [];            // 옮겼으면 비운다. 두 번 세면 안 된다.
    }
    this.absorbSeason(champ);
    syncHistory(this.L.teams, this.L.year, champ.name, this.lastTable);
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

    const RK = { str:strRank, bat:batRank, pit:pitRank, farm:farmRank, bud:budRank, of:n };
    const con = this._contrast(RK);
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
      story: (FR.franchiseOf(t.name) || {}).story || '',
      budget: r0(f.budget), payroll: r1(C.payroll(t, this.L.year)),
      room: r1(f.budget - C.payroll(t, this.L.year)),
      patience: r0(f.patience), demand: f.demand,
      strength: r0(strength), batting: r0(bat), pitching: r0(pit), farm: r0(farm),
      rank: { strength: strRank, batting: batRank, pitching: pitRank,
              farm: farmRank, budget: budRank, of: n },
      lastRank: (() => {
        const T = this.lastTable || [];
        if (!T.length) return null;
        const rs = [...T].sort((x, y) => y.rs - x.rs).findIndex(x => x.team_id === teamId) + 1;
        const ra = [...T].sort((x, y) => x.ra - y.ra).findIndex(x => x.team_id === teamId) + 1;
        return { rs, ra, of: T.length };
      })(),
      difficulty: diff,
      difficultyLabel: ['', '쉬움', '무난', '보통', '어려움', '극한'][diff],
      contrast: con,
      risk: this._risks(t, f, RK),
      payrollRatio: Math.round(C.payroll(t, this.L.year) / f.budget * 100),
      park: { name: t.park.name, capacity: t.park.capacity, opened: t.park.opened,
        avg: f.homeGames ? Math.round(f.attendance / f.homeGames) : null,
        rate: f.homeGames ? Math.round(f.attendance / f.homeGames / t.park.capacity * 100) : null,
        total: f.attendance || 0 },
      last, key, prospect,
      history: t.history ? {
        founded: t.history.founded, seasons: t.history.seasons,
        titles: t.history.titles.length, pennants: t.history.pennants.length,
        lastTitle: t.history.lastTitle, drought: t.history.drought,
        retired: (t.history.retired || []).slice().sort((a,b) => a.number - b.number),
        record: `${t.history.allW}승 ${t.history.allL}패`,
        pct: t.history.pct.toFixed(3), tagline: t.history.tagline,
        legend: t.history.legend, titleYears: t.history.titles,
      } : null,
      note: this._teamNote(f, strRank, farmRank, budRank, mid),
      archetype: this._archetype(t, f, RK, con),
      headline: this._headline(t, f, RK, con),
      ownerLine: this._ownerLine(f),
    };
  }

  /** 구단 유형 — 이 팀을 고르면 어떤 게임을 하게 되는가. */
  _archetype(t, f, R, con) {
    const h = t.history, n = R.of, hi = Math.ceil(n * 0.3), lo = Math.floor(n * 0.7) + 1;
    const titles = h ? h.titles.length : 0;
    const nS = con.strong.length, nW = con.weak.length;
    if (h && h.drought === 0) return '디펜딩 챔피언';
    if (R.str <= hi && f.demand === '우승') return '우승 청부';
    if (R.str <= hi && h && h.drought <= 3) return '전성기의 강팀';
    if (R.str <= hi && R.bud >= lo) return '가난한 강팀';
    if (R.str <= hi) return '우승 도전권';
    if (R.str >= lo && titles >= 6 && h && h.drought >= 15) return '몰락한 명가';
    if (R.str >= lo && R.farm <= 3 && f.patience >= 55) return '재건 초입';
    if (R.str >= lo && f.patience >= 60) return '장기 리빌딩';
    if (R.str >= lo && f.patience < 40) return '벼랑 끝';
    if (R.bud <= hi && R.str >= lo) return '자금은 있다';
    if (R.farm <= 2) return '유망주가 무기';
    if (nW >= 3 && !nS) return '전면 재건';
    if (nW >= 2 && !nS) return '구멍 난 로스터';
    if (nS >= 3 && !nW) return '빈틈없는 전력';
    return '중위권 정체';
  }

  /** 한 문장 — 데이터 요약이 아니라 이 팀으로 할 게임의 판타지. */
  _headline(t, f, R, con) {
    const n = R.of, gap = R.bat - R.pit;
    const nStrong = con.strong.length, nWeak = con.weak.length;
    const strong = (r) => r <= Math.ceil(n * 0.3), weak = (r) => r >= Math.floor(n * 0.7) + 1;
    const h = t.history;
    if (h && h.drought === 0 && strong(R.str))
      return '왕좌를 지킬 것인가. 여기서부터는 내려갈 일만 남았다.';
    if (h && h.drought === 0 && weak(R.str))
      return '우승 직후 전력이 무너졌다. 반지를 지킬 방법을 찾아야 한다.';
    if (h && h.drought === 0)
      return '작년의 반지는 이미 과거다. 두 번 연속은 훨씬 어렵다.';
    if (strong(R.pit) && weak(R.bat))
      return '마운드는 이미 우승권. 방망이 하나만 구하면 된다.';
    if (strong(R.bat) && weak(R.pit))
      return '점수는 낸다. 문제는 지켜낼 투수가 없다는 것.';
    if (weak(R.str) && strong(R.farm))
      return '리그 최고의 유망주진. 문제는 기다릴 시간이 있느냐다.';
    if (weak(R.str) && strong(R.bud))
      return '금고는 가득 찼고 로스터는 비었다. 사올 수 있는 만큼 사와야 한다.';
    if (strong(R.str) && weak(R.bud))
      return '우승권 전력, 얇은 지갑. 지키는 것만으로도 싸움이다.';
    if (strong(R.str) && f.patience < 40)
      return '이길 전력은 갖췄다. 구단주가 기다려 주지 않을 뿐.';
    if (weak(R.str) && weak(R.farm) && f.patience >= 55)
      return '바닥에서 시작한다. 대신 아무도 재촉하지 않는다.';
    if (weak(R.str) && weak(R.farm))
      return '전력도 유망주도 없다. 그런데 시간까지 없다.';
    if (h && h.titles.length >= 6 && h.drought >= 15)
      return `${h.titles.length}번 우승한 구단이 ${h.drought}년째 조용하다. 끝낼 사람이 필요하다.`;
    if (strong(R.farm) && !strong(R.str) && !weak(R.str))
      return '리그 최고의 유망주진. 몇 년만 버티면 판이 뒤집힌다.';
    if (Math.abs(gap) >= Math.ceil(n * 0.5))
      return gap > 0 ? '마운드가 혼자 팀을 끌고 간다. 타선을 채워라.'
                     : '타선이 혼자 팀을 끌고 간다. 마운드를 채워라.';
    if (strong(R.str)) return '약점이 없다. 지금 걸지 않으면 언제 거는가.';
    if (nWeak >= 3 && !nStrong) return '성한 곳이 없다. 어디부터 손댈지가 첫 질문이다.';
    if (nWeak >= 2 && !nStrong) return '구멍이 둘. 하나를 메우면 다른 하나가 드러난다.';
    if (!nStrong && !nWeak && f.patience < 40)
      return '평범한 전력에 성마른 구단주. 가장 나쁜 조합이다.';
    if (nStrong && nWeak)
      return `${con.strong[0].k}${con.strong[0].r}위로 버티고 ${con.weak[0].k}${con.weak[0].r}위를 메운다. 그게 이 팀의 시즌이다.`;
    return '어느 쪽으로도 갈 수 있다. 방향은 당신이 정한다.';
  }

  /** 리스크 — 이 팀을 맡으면 무엇이 아픈가.
   *  '약점 없음'은 재미없는 결론이다. 모든 구단은 고통을 하나씩 안고 있다. */
  _risks(t, f, R) {
    const out = [];
    const core = [...t.lineup, ...t.rotation];
    const avgAge = core.reduce((s, p) => s + p.age, 0) / (core.length || 1);
    const ovr = (p) => this.ratings(p, t).ovr.mid;
    const top = [...core].sort((a, b) => ovr(b) - ovr(a)).slice(0, 8);
    // 계약이 실제로 2년 안에 끝나고 FA 자격까지 차는 핵심 선수만 센다.
    // 서비스타임만 보면 베테랑 전원이 걸려 변별력이 없다.
    const yr = this.L.year;
    const faSoon = top.filter(p => p.contract && p.contract.end_year <= yr + 1
      && (p.service ?? 0) + (p.contract.end_year - yr) >= C.FA_SERVICE).length;
    const old = core.filter(p => p.age >= 33).length;
    const pay = C.payroll(t, this.L.year) / f.budget * 100;
    const hi = Math.ceil(R.of * 0.3), lo = Math.floor(R.of * 0.7) + 1;

    // 강팀일수록 창이 좁다. 좋기만 한 구단은 선택이 아니다.
    if (R.str <= hi && (avgAge >= 29.2 || (avgAge >= 28.2 && faSoon >= 2)))
      out.push({ k:'우승 창이 좁다', v:`평균 ${avgAge.toFixed(1)}세 · FA ${faSoon}명`, s:2 });
    if (avgAge >= 29.6) out.push({ k:'노쇠한 주축', v:`평균 ${avgAge.toFixed(1)}세`, s:2 });
    else if (avgAge >= 28.4) out.push({ k:'나이 든 라인업', v:`평균 ${avgAge.toFixed(1)}세`, s:1 });
    if (faSoon >= 3) out.push({ k:'주축 FA 이탈', v:`2년 내 ${faSoon}명`, s:2 });
    else if (faSoon >= 2) out.push({ k:'FA 임박', v:`2년 내 ${faSoon}명`, s:1 });
    if (pay >= 100) out.push({ k:'예산 초과', v:`소진율 ${Math.round(pay)}%`, s:2 });
    else if (pay >= 95) out.push({ k:'연봉 포화', v:`소진율 ${Math.round(pay)}%`, s:1 });
    if (R.farm >= lo) out.push({ k:'유망주 고갈', v:`${R.farm}위`, s:2 });
    else if (R.farm > Math.ceil(R.of / 2)) out.push({ k:'얇은 육성', v:`유망주 ${R.farm}위`, s:1 });
    if (f.patience < 35) out.push({ k:'해고 압박', v:`${f.demand} · 인내심 ${Math.round(f.patience)}`, s:2 });
    else if (f.demand === '우승' || f.demand === '포스트시즌')
      out.push({ k:'성적 압박', v:`${f.demand} 요구`, s:1 });
    if (R.bud >= lo) out.push({ k:'빠듯한 자금', v:`재정 ${R.bud}위`, s:1 });
    if (R.bat >= lo) out.push({ k:'빈약한 타선', v:`타선 ${R.bat}위`, s:2 });
    if (R.pit >= lo) out.push({ k:'약한 마운드', v:`마운드 ${R.pit}위`, s:2 });
    if (!out.length) out.push({ k:'큰 구멍은 없다', v:'지킬 것이 많다', s:0 });
    return { rows: out.sort((x, y) => y.s - x.s).slice(0, 4), avgAge: Math.round(avgAge * 10) / 10, faSoon };
  }

  /** 강점과 약점을 갈라서 내보낸다. 표로 늘어놓으면 대비가 죽는다. */
  _contrast(R) {
    // 전력은 타선과 마운드의 평균이다. 셋을 나란히 세우면 같은 말을 두 번 하고,
    // 강점 개수도 부풀려 센다 — 타선·마운드가 좋은 팀은 자동으로 전력도 강점이 된다.
    const items = [['타선', R.bat], ['마운드', R.pit], ['유망주', R.farm], ['재정', R.bud]];
    const hi = Math.ceil(R.of * 0.3), lo = Math.floor(R.of * 0.7) + 1;
    const strong = items.filter(([, r]) => r <= hi).sort((a, b) => a[1] - b[1])
      .map(([k, r]) => ({ k, r }));
    let mid = items.filter(([, r]) => r > hi && r < lo).map(([k, r]) => ({ k, r }));
    // 상위 30% 가 하나도 없으면 그중 가장 나은 둘을 '상대적 강점' 으로 올린다.
    // 칸이 비면 화면이 죽고, 어떤 팀이든 기댈 곳은 있다.
    // 올린 항목은 중간에서 빼야 한다. 안 그러면 같은 부문이 화면에 두 번 나온다.
    if (!strong.length) {
      const soft = mid.slice().sort((a, b) => a.r - b.r).slice(0, 2);
      for (const x of soft) strong.push({ ...x, soft: true });
      mid = mid.filter(x => !soft.includes(x));
    }
    return {
      strong, mid,
      weak: items.filter(([, r]) => r >= lo).sort((a, b) => b[1] - a[1])
        .map(([k, r]) => ({ k, r })),
    };
  }

  /** 구단주 기대 — 규칙처럼 읽히게. */
  _ownerLine(f) {
    const p = f.patience;
    const temper = p < 32 ? '인내심 매우 낮음' : p < 45 ? '인내심 낮음'
      : p < 60 ? '보통' : p < 72 ? '느긋함' : '매우 느긋함';
    const ask = {
      '우승': '우승하지 못하면 자리를 보전하기 어렵다.',
      '포스트시즌': '가을야구 진출이 최소 조건이다.',
      '5할 승률': '최소한 승률 5할은 지켜야 한다.',
      '재건 허용': '당장의 성적보다 미래를 보겠다고 한다.',
    }[f.demand];
    return { demand: f.demand, temper, ask,
      urgent: p < 45 && (f.demand === '우승' || f.demand === '포스트시즌') };
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
    this.replPool = null;          // 여름 시장은 시즌마다 새로 연다
    this.wbc = null;
    if (this.phase !== PRESEASON) return { error:'wrong_phase' };
    this.season = new Season(this.L.teams, this.L.year, this.L.games, this.L.rng);
    this.L.season = this.season;
    this.phase = REGULAR; this.notices = []; this.champion = null;
    this._prev = { rank: 0, run: 0 };   // 쿨다운이 시즌을 넘어가면 안 된다
    this.wbc = this.L.runWBC();         // 3월. 대회를 치르고 시즌에 들어간다
    if (this.wbc) {
      const mine = this.wbc.squad.filter(s => s.team === this.me.name);
      if (mine.length) this.notice(`WBC 차출 ${mine.length}명`, 'transfer');
      for (const h of this.wbc.hurt) if (h.team === this.me.name)
        this.notice(`${h.name} WBC 후 부상 — ${h.days}일`, 'injury');
    }
    return this.state();
  }
  advance(days = 1) {
    const it = this.advanceGen(days, null);
    let r = it.next();
    while (!r.done) r = it.next(null);
    return r.value;
  }

  /** 내 경기를 지켜본다. 승부처마다 멈춰 서고, 고른 답으로 이어간다.
   *  step(답) 이 { ask } 를 주면 사람 차례, { done } 이면 그날이 끝난 것. */
  watchDay() {
    if (this.phase !== REGULAR) return { error:'wrong_phase' };
    const it = this.advanceGen(1, this.userId);
    return { step: (answer) => { const r = it.next(answer);
      return r.done ? { done:true, result:r.value } : { ask:r.value }; } };
  }

  *advanceGen(days = 1, watch = null) {
    if (this.phase !== REGULAR) return { error:'wrong_phase' };
    this.notices = [];
    const played = [];
    let important = 0;
    for (let i = 0; i < days; i++) {
      if (this.season.finished) break;
      const nInj = this.season.injuries.length;
      const mailBefore = this.L.mail.items.length;
      const boxes = [];
      const dayRes = watch != null
        ? yield* this.season.playDayGen(this.userId, watch)
        : this.season.playDay(this.userId);
      for (const g of dayRes) {
        if (g.box) boxes.push(g.box);
        const H = this.season.teams[g.hi], A = this.season.teams[g.ai];
        if (g.rain) {
          if (H.team_id === this.userId || A.team_id === this.userId) {
            const opp = (H.team_id === this.userId ? A : H).name;
            played.push({ day:this.season.curDay, opponent:opp, score:'—', result:'우천취소', box:null });
            this.notice(`${opp}전 우천취소`, 'rain');
          }
          continue;
        }
        if (H.team_id === this.userId || A.team_id === this.userId) {
          const mine = H.team_id === this.userId ? g.hr : g.ar;
          const opp = H.team_id === this.userId ? g.ar : g.hr;
          played.push({ day:this.season.curDay, opponent:(H.team_id===this.userId?A:H).name,
            score:`${mine} : ${opp}`, result: mine>opp?'승':(mine<opp?'패':'무'),
            dh: !!g.dh, called: !!g.called, box: g.box ? this.boxscore(g.box) : null });
        }
      }
      const newInj = this.season.injuries.slice(nInj);
      for (const inj of newInj)
        if (inj.team.team_id === this.userId)
          this.notice(`${inj.player.name} ${inj.label} — ${inj.days}일 결장`, 'injury');
      const d = this.season.curDay;
      this._aiReplace(d);
      scanDay(this, d, newInj, boxes);
      for (const m of scanForeign(this, d)) this.L.mail.push(m);
      this._prev = scanState(this, d, this._prev) || this._prev;
      important += this.L.mail.items.slice(mailBefore).filter(m => m.pri >= 1).length;
    }
    this.newImportant = important;
    if (this.season.finished) { this.phase = POSTSEASON; this.notice('정규시즌 종료', 'phase');
      seasonEndMail(this); }
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
    return { home:side(box.H), away:side(box.A), park: box.H.team.park,
             plays: box.plays };
  }
  runPostseason() {
    if (this.phase !== POSTSEASON) return { error:'wrong_phase' };
    const [champ, log] = postseason(this.season, this.L.rng);
    this.champion = champ.name;
    this.playoffLog = log.map(([r,w,l,sc,games,hi,lo]) => ({ round:r, winner:w.name, loser:l.name,
      score:`${sc[0]}승 ${sc[1]}패`, w:sc[0], l:sc[1],
      higher: hi ? hi.name : null, lower: lo ? lo.name : null,
      games: (games || []).map(g => ({ home:g.home, away:g.away, hr:g.hr, ar:g.ar })),
      user: w.team_id===this.userId || l.team_id===this.userId }));
    // 이번 시즌에 나온 대기록을 리그 역사에 남긴다.
    if (this.season && this.season.feats) {
      this.L.feats.push(...this.season.feats);
      this.season.feats = [];            // 옮겼으면 비운다. 두 번 세면 안 된다.
    }
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
  /** 대기록. 최근 순으로, 굵직한 것부터. */
  feats(limit = 40) {
    const live = (this.season && this.season.feats) || [];
    const all = [...this.L.feats, ...live];
    const me = this.me;
    // 희소한 것부터. 만루홈런처럼 흔한 것은 집계에만 남기고 목록에서 뺀다.
    const rows = all.filter(f => FEAT[f.k] && !FEAT[f.k].minor)
      .sort((a, b) => (FEAT[a.k].rank - FEAT[b.k].rank) || (b.y - a.y) || (b.d - a.d))
      .slice(0, limit)
      .map(f => ({ year:f.y, day:f.d, kind:FEAT[f.k].kr, rank:FEAT[f.k].rank,
        name:f.name, team:f.team, opp:f.opp, detail:f.v,
        mine: me && f.team === me.name }));
    // 부문별 통산 횟수
    const tally = {};
    for (const f of all) tally[FEAT[f.k].kr] = (tally[FEAT[f.k].kr] || 0) + 1;
    return { rows, tally };
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
    offseasonMail(this, 'retire', out.retired);
    this._openForeign();
    out.tournament = s.tournament || null;
    out.honored = s.honored || [];          // 영구결번. 15년을 굴려야 하나 나온다.
    out.enlisted = (s.enlisted || []).filter(x => x.t.team_id === me)
      .map(x => ({ name:x.p.name, age:x.p.age, kind:x.kind }));
    out.discharged = (s.discharged || []).filter(x => x.t.team_id === me)
      .map(x => ({ name:x.p.name, age:x.p.age }));
    this.phase = OFF_FOREIGN;
    return out;
  }
  /* ── 병역 ────────────────────────────────────────────────
     1군에서 쓴 선수만 대표팀에 뽑히고, 금메달이면 커리어 2년이 돌아온다. */

  military() {
    const t = this.me, y = this.L.year;
    const all = [...t.batters, ...t.pitchers, ...t.farm].filter(p => !p.foreign);
    const row = (p) => ({ ...this.brief(p, t),
      status:p.mil || 'none', kr:ML.STATUS_KR[p.mil || 'none'],
      kind:p.milKind === 'sangmu' ? '상무' : p.milKind === 'active' ? '현역' : null,
      left:p.milLeft || 0, natl:p.natl || 0,
      due: (p.mil || 'none') === 'none' ? Math.max(0, ML.MIL.callAge - p.age) : null,
      active: t.batters.includes(p) || t.pitchers.includes(p) });
    const cal = [];
    for (let k = 0; k < 9; k++) {
      const ms = ML.meets(y + k);
      if (ms.length) cal.push({ year:y + k, meets:ms.map(m => ML.MEET_KR[m]),
        exempt: ms.some(m => m !== ML.WBC) });
    }
    return {
      calendar: cal.slice(0, 4),
      serving: all.filter(p => p.mil === 'serving').map(row)
        .sort((a, b) => a.left - b.left),
      due: all.filter(p => (p.mil || 'none') === 'none' && p.age >= 21)
        .map(row).sort((a, b) => a.due - b.due),
      exempt: all.filter(p => p.mil === 'exempt').map(row),
      ageLimit: ML.MIL.ageLimit, callAge: ML.MIL.callAge,
    };
  }

  /* ── 2군 운영 ────────────────────────────────────────────
     1군에 올려두고 안 쓰면 퇴보한다. 2군에서는 매일 뛴다.
     그래서 콜업과 강등이 육성의 절반이다. */

  static ACTIVE_MAX = 28;
  static ACTIVE_MIN = 24;
  static DOWN_DAYS = 10;      // 말소 후 재등록까지

  farmMoves() {
    const t = this.me, day = this.season ? this.season.curDay : null;
    const s = this.season;
    const line = (p) => {
      if (!s) return null;
      const q = p.kind === 'P' ? s.pit.get(p.pid) : s.bat.get(p.pid);
      if (!q || (!q.g && !q.pa)) return null;
      return p.kind === 'P' ? `${q.g}G ${q.ipStr}이닝 ERA ${q.era.toFixed(2)}`
                            : `${q.g}G ${q.avg.toFixed(3)} ${q.hr}홈런`;
    };
    const inLineup = new Set(t.lineup.map(b => b.pid));
    const inStaff = new Set([...t.rotation, ...t.bullpen].map(p => p.pid));
    const act = [...t.batters, ...t.pitchers].map(p => ({ ...this.brief(p, t),
      stat: line(p), hurt: p.injury_days > 0 ? p.injury_days : 0,
      role: inLineup.has(p.pid) ? '주전' : inStaff.has(p.pid)
        ? (t.rotation.some(x => x.pid === p.pid) ? '선발' : '불펜') : '대기',
      pay: p.contract ? r1(p.contract.salaryIn(this.L.year)) : 0 }));
    const farm = [...t.farm].sort((x, y) => this.L.see(t, y).pot - this.L.see(t, x).pot)
      .map(p => ({ ...this.brief(p, t), hurt: p.injury_days > 0 ? p.injury_days : 0,
        wait: day !== null && p.downUntil ? Math.max(0, p.downUntil - day) : 0 }));
    return { active: act, farm, count: act.length,
      max: Game.ACTIVE_MAX, min: Game.ACTIVE_MIN, inSeason: !!s };
  }

  callUpPlayer(pid) {
    const t = this.me, day = this.season ? this.season.curDay : null;
    const i = t.farm.findIndex(p => p.pid === pid);
    if (i < 0) return { error:'not_found' };
    if (t.batters.length + t.pitchers.length >= Game.ACTIVE_MAX) return { error:'full' };
    const p = t.farm[i];
    if (day !== null && p.downUntil && p.downUntil > day)
      return { error:'wait', days: p.downUntil - day };
    t.farm.splice(i, 1);
    if (p.debut_year === null || p.debut_year === undefined) p.debut_year = this.L.year;
    (p.kind === 'P' ? t.pitchers : t.batters).push(p);
    R.rebuildRoster(t);
    return { ok:true, name:p.name };
  }

  sendDownPlayer(pid) {
    const t = this.me, day = this.season ? this.season.curDay : null;
    if (t.batters.length + t.pitchers.length <= Game.ACTIVE_MIN) return { error:'thin' };
    const arr = t.batters.some(p => p.pid === pid) ? t.batters : t.pitchers;
    const i = arr.findIndex(p => p.pid === pid);
    if (i < 0) return { error:'not_found' };
    const p = arr[i];
    arr.splice(i, 1);
    if (day !== null) p.downUntil = day + Game.DOWN_DAYS;
    if (t.manual) {                              // 편성에서도 빼 준다
      if (t.manual.order) t.manual.order = t.manual.order.filter(x => x !== pid);
      if (t.manual.rot) t.manual.rot = t.manual.rot.filter(x => x !== pid);
    }
    t.farm.push(p);
    R.rebuildRoster(t);
    return { ok:true, name:p.name };
  }

  /** 방출. 잔여 연봉은 그대로 나간다. */
  releasePlayer(pid) {
    const t = this.me;
    const [p, owner] = this.find(pid);
    if (!p || owner !== t) return { error:'not_found' };
    const left = p.contract ? p.contract.remaining(this.L.year).reduce((a, b) => a + b, 0) : 0;
    t.finance.budget = Math.max(0, t.finance.budget - left);
    for (const arr of [t.batters, t.pitchers, t.farm]) {
      const i = arr.indexOf(p); if (i >= 0) arr.splice(i, 1);
    }
    p.contract = null;
    this.L.unsigned.push(p);
    R.rebuildRoster(t);
    this.L.log(`${t.name} ${p.name} 방출`);
    return { ok:true, name:p.name, cost:r1(left) };
  }

  /* ── 코치진 ──────────────────────────────────────────────
     코치는 선수의 진짜 능력을 알려주지 않는다. 결과를 바꾸거나
     우리가 보는 숫자의 노이즈를 줄일 뿐이다. */

  staff() {
    const t = this.me;
    if (!this.coachMarket) this.coachMarket = SF.makeMarket(this.L.rng, 3);
    const eff = {
      bat: `타자 성장 ×${SF.devMult(t, 'B').toFixed(2)}`,
      pit: `투수 성장 ×${SF.devMult(t, 'P').toFixed(2)}`,
      train: `부상 ×${SF.injuryMult(t).toFixed(2)} · 회복 ×${SF.healMult(t).toFixed(2)}`,
      scout: `보고서 폭 ×${SF.scoutMult(t).toFixed(2)}`,
      data: `숫자 신뢰도 ${SF.dataTrust(t)}%`,
    };
    return {
      cost: r1(SF.staffCost(t)),
      budget: r1(t.finance.budget), payroll: r1(C.payroll(t, this.L.year)),
      rows: SF.ROLES.map(r => ({ key:r.key, label:r.label, hint:r.hint,
        effect: eff[r.key],
        cur: t.staff[r.key] ? { ...t.staff[r.key] } : null,
        market: (this.coachMarket[r.key] || []).map(c => ({ ...c })) })),
    };
  }

  hireCoach(role, id) {
    const t = this.me;
    if (!this.coachMarket || !this.coachMarket[role]) return { error:'closed' };
    const i = this.coachMarket[role].findIndex(c => c.id === id);
    if (i < 0) return { error:'not_found' };
    const c = this.coachMarket[role][i];
    const room = t.finance.budget - C.payroll(t, this.L.year) - SF.staffCost(t)
      + (t.staff[role] ? t.staff[role].salary : 0);
    if (c.salary > room) return { error:'budget', room:r1(room) };
    const out = t.staff[role];
    this.coachMarket[role].splice(i, 1);
    if (out) this.coachMarket[role].push(out);      // 내보낸 코치는 시장에 남는다
    t.staff[role] = c;
    return { ok:true, name:c.name };
  }

  /* ── 감독 지시 ────────────────────────────────────────────
     경기 중 결정은 감독이 한다. 우리는 그 성향만 정한다. */

  /** 우리 구장. 규격은 그림용이 아니라 담장을 넘느냐를 정하는 숫자다. */
  ballpark() {
    const t = this.me, p = t.park, f = t.finance;
    return { name:p.name, capacity:p.capacity, opened:p.opened,
      fL:p.fL, fC:p.fC, fR:p.fR, fH:p.fH, turf:!!p.turf, dome:!!p.dome, alt:p.alt || 0,
      attendance: f.homeGames ? Math.round(f.attendance / f.homeGames) : null,
      rate: f.homeGames ? Math.round(f.attendance / f.homeGames / p.capacity * 100) : null };
  }

  /* ── 편성 ────────────────────────────────────────────────
     누구를 어디에 세우고 몇 번 타순에 놓는가. 출전 시간이 곧 육성이다. */

  lineup() {
    const t = this.me;
    const row = (b, extra = {}) => ({ ...this.brief(b, t), nat:b.position,
      slot:b.slot || b.position, fit:R.posFit(b, b.slot || b.position),
      pen:R.posPenalty(b, b.slot || b.position), ...extra });
    return {
      manual: !!(t.manual && t.manual.order && t.manual.order.length),
      positions: R.LINEUP_POS,
      slots: t.lineup.map((b, i) => row(b, { order:i + 1 })),
      bench: t.bench.map(b => row(b)),
      rotation: t.rotation.map((p, i) => ({ ...this.brief(p, t), order:i + 1 })),
      bullpen: t.bullpen.map(p => ({ ...this.brief(p, t),
        role:p.pen_role, roleKr:R.PEN_LABEL[p.pen_role], locked:!!p.pen_lock })),
      penRoles: Object.entries(R.PEN_LABEL).map(([k, v]) => ({ key:k, label:v })),
    };
  }

  /** 지금 편성을 그대로 감독의 지시로 굳힌다. */
  _pinLineup() {
    const t = this.me;
    if (!t.manual) t.manual = {};
    t.manual.order = t.lineup.map(b => b.pid);
    t.manual.pos = {};
    for (const b of t.lineup) t.manual.pos[b.pid] = b.slot || b.position;
    t.manual.rot = t.rotation.map(p => p.pid);
    R.rebuildRoster(t);
    return { ok:true };
  }

  swapLineup(a, b) {
    const t = this.me;
    if (a === b || a < 1 || b < 1 || a > t.lineup.length || b > t.lineup.length)
      return { error:'range' };
    const x = t.lineup[a - 1]; t.lineup[a - 1] = t.lineup[b - 1]; t.lineup[b - 1] = x;
    return this._pinLineup();
  }

  /** 벤치 선수를 그 타순에 넣는다. 있던 선수는 벤치로 간다. */
  placeInLineup(order, pid) {
    const t = this.me;
    if (order < 1 || order > t.lineup.length) return { error:'range' };
    const i = t.bench.findIndex(b => b.pid === pid);
    if (i < 0) return { error:'not_found' };
    const inc = t.bench[i], out = t.lineup[order - 1];
    inc.slot = out.slot || out.position;
    t.lineup[order - 1] = inc; t.bench[i] = out;
    return this._pinLineup();
  }

  setSlotPos(order, pos) {
    const t = this.me;
    if (order < 1 || order > t.lineup.length) return { error:'range' };
    if (!R.LINEUP_POS.includes(pos)) return { error:'pos' };
    const b = t.lineup[order - 1];
    const other = t.lineup.find(x => x !== b && (x.slot || x.position) === pos);
    if (other && pos !== 'DH') other.slot = b.slot || b.position;   // 자리를 맞바꾼다
    b.slot = pos;
    return this._pinLineup();
  }

  setRotation(order, pid) {
    const t = this.me;
    const i = t.rotation.findIndex(p => p.pid === pid);
    if (i < 0 || order < 1 || order > t.rotation.length) return { error:'range' };
    const x = t.rotation.splice(i, 1)[0];
    t.rotation.splice(order - 1, 0, x);
    return this._pinLineup();
  }

  setPenRole(pid, role) {
    const t = this.me;
    const p = t.bullpen.find(x => x.pid === pid);
    if (!p || !R.PEN_LABEL[role]) return { error:'not_found' };
    p.pen_role = role; p.pen_lock = true;
    R.assignPen(t);              // 지정한 자리는 그대로 두고 나머지를 다시 배분한다
    return { ok:true, name:p.name, role, kr:R.PEN_LABEL[role] };
  }

  autoLineup() {
    const t = this.me;
    t.manual = null;
    for (const b of t.batters) delete b.slot;
    for (const p of t.pitchers) delete p.pen_lock;
    R.rebuildRoster(t);
    return { ok:true };
  }

  tactics() {
    const t = this.me;
    const v = t.tactics || {};
    return { rows: TACTIC_DEFS.map(d => ({ key:d.key, label:d.label,
      value: v[d.key] ?? 2, steps:d.steps, hint:d.hint })) };
  }

  setTactic(key, value) {
    const d = TACTIC_DEFS.find(x => x.key === key);
    if (!d) return { error:'unknown' };
    const t = this.me;
    if (!t.tactics) t.tactics = {};
    t.tactics[key] = Math.max(0, Math.min(4, value | 0));
    return { ok:true };
  }

  /* ── 시즌 중 외국인 교체 ──────────────────────────────────
     여름 시장은 얕다. 방출해도 이미 준 돈은 돌아오지 않는다.
     그래도 반년을 먹튀와 함께 갈 수는 없다. */

  _replPool() {
    // 여름 내내 새 이름이 조금씩 들어온다. 다른 리그에서 방출된 선수들이다.
    if (!this.replPool || this.replPool.length < 6) {
      const taken = new Set();
      for (const t of this.L.teams)
        for (const p of [...t.batters, ...t.pitchers, ...t.farm]) taken.add(p.name);
      for (const p of this.replPool || []) taken.add(p.name);
      const add = FG.makeReplacements(this.L.rng, this.L.year,
        this.replPool ? 5 : 10, taken);
      this.replPool = (this.replPool || []).concat(add);
    }
    return this.replPool;
  }

  foreignReplacements() {
    if (this.phase !== REGULAR || !this.season) return { error:'wrong_phase' };
    const t = this.me, s = this.season;
    const left = s.totalDays - s.curDay, total = s.totalDays;
    const open = left >= FG.DEADLINE_LEFT;
    const [bw, pw] = s.wars();
    const line = (p) => {
      const q = p.kind === 'P' ? s.pit.get(p.pid) : s.bat.get(p.pid);
      if (!q || (!q.g && !q.pa)) return '기록 없음';
      return p.kind === 'P'
        ? `${q.g}G ${q.ipStr}이닝 ERA ${q.era.toFixed(2)}`
        : `${q.g}G ${q.avg.toFixed(3)} ${q.hr}홈런 ${q.rbi}타점`;
    };
    return {
      open, left, deadline: FG.DEADLINE_LEFT,
      budget: r1(t.finance.budget), payroll: r1(C.payroll(t, this.L.year)),
      mine: FG.foreignOf(t).all.map(p => ({ ...this.brief(p, t), nation:p.nation,
        stat: line(p), war: r1((p.kind === 'P' ? pw : bw).get(p.pid) ?? 0),
        paid: r1(p.contract ? p.contract.salaryIn(this.L.year) : 0) })),
      pool: open ? this._replPool().map(p => ({ ...this.brief(p, t), nation:p.nation,
        price: FG.proratedPrice(p, left, total) })) : [],
    };
  }

  replaceForeign(outPid, inPid) {
    if (this.phase !== REGULAR || !this.season) return { error:'wrong_phase' };
    const s = this.season, left = s.totalDays - s.curDay;
    if (left < FG.DEADLINE_LEFT) return { error:'deadline' };
    const t = this.me;
    const out = FG.foreignOf(t).all.find(p => p.pid === outPid);
    const i = this._replPool().findIndex(p => p.pid === inPid);
    if (!out || i < 0) return { error:'not_found' };
    const inc = this.replPool[i];
    if (out.kind !== inc.kind && !FG.canSign({ ...t, batters:t.batters.filter(x => x !== out),
        pitchers:t.pitchers.filter(x => x !== out), farm:t.farm }, inc.kind))
      return { error:'quota' };
    const price = FG.proratedPrice(inc, left, s.totalDays);
    // 방출한 선수 연봉은 그대로 나간다. 새 몸값만큼 여력이 있어야 한다.
    const room = t.finance.budget - C.payroll(t, this.L.year);
    if (price > room) return { error:'budget', room:r1(room), price };
    this.replPool.splice(i, 1);
    this._dropForeign(t, out);
    this._addForeign(t, inc, price);
    inc.debut_year = this.L.year;
    this.L.log(`${t.name} 외국인 교체 — ${out.name} 방출, ${inc.name} 영입`);
    this.notice(`${out.name} 방출 · ${inc.name} 영입 (${price}억)`, 'transfer');
    return { ok:true, price, out:out.name, in:inc.name };
  }

  /** 다른 구단도 여름에 결단한다. 성적이 확실히 나쁘면 갈아치운다. */
  _aiReplace(day) {
    const s = this.season;
    if (!s || s.totalDays - s.curDay < FG.DEADLINE_LEFT) return;
    if (s.curDay < 40) return;                   // 40경기는 봐준다
    const [bw, pw] = s.wars();
    const pace = s.totalDays / Math.max(1, s.curDay);
    for (const t of this.L.teams) {
      if (t.team_id === this.userId) continue;
      if (this.L.rng.random() > 0.11) continue;  // 매일 다 뒤집지는 않는다
      const pool = this._replPool();
      if (!pool.length) return;
      for (const p of FG.foreignOf(t).all) {
        const w = ((p.kind === 'P' ? pw : bw).get(p.pid) ?? 0) * pace;
        const hurt = p.injury_days > 30;         // 오래 못 나오면 그 자리가 비어 있는 것과 같다
        if (w >= 1.3 && !hurt) continue;         // 시즌 환산 WAR 1.3 미만이면 교체 검토
        const cands = pool.filter(x => x.kind === p.kind);
        if (!cands.length) continue;
        const best = cands.reduce((a, b) => this.L.see(t, b).ovr > this.L.see(t, a).ovr ? b : a);
        if (!hurt && this.L.see(t, best).ovr <= this.L.see(t, p).ovr + 0.5) continue;
        pool.splice(pool.indexOf(best), 1);
        this._dropForeign(t, p);
        this._addForeign(t, best, FG.proratedPrice(best, s.totalDays - s.curDay, s.totalDays));
        best.debut_year = this.L.year;
        this.L.log(`${t.name} 외국인 교체 — ${p.name} 방출, ${best.name} 영입`);
        break;
      }
    }
  }

  /* ── 외국인 시장 ──────────────────────────────────────────
     보유 3명, 그중 투수 2명. 계약은 1년이라 매 겨울 다시 정한다.
     신규 계약에만 상한이 있고 재계약에는 없다. */

  _openForeign() {
    const rng = this.L.rng;
    // 리그에 이미 있는 이름은 피한다.
    const taken = new Set();
    for (const t of this.L.teams)
      for (const p of [...t.batters, ...t.pitchers, ...t.farm]) taken.add(p.name);
    this.foreignPool = FG.makeMarket(rng, this.L.year + 1, 26, taken);
    for (const t of this.L.teams)                     // 계약은 해마다 끝난다
      for (const p of [...t.batters, ...t.pitchers]) if (p.foreign) p.contract = null;
  }

  _dropForeign(t, p) {
    for (const arr of [t.batters, t.pitchers]) {
      const i = arr.indexOf(p); if (i >= 0) arr.splice(i, 1);
    }
    R.rebuildRoster(t);
  }

  _addForeign(t, p, salary) {
    p.contract = new C.Contract(this.L.year + 1, [salary]);
    p.kbo_years = (p.kbo_years || 0) + 1;
    if (p.debut_year === null) p.debut_year = this.L.year + 1;
    (p.kind === 'P' ? t.pitchers : t.batters).push(p);
    R.rebuildRoster(t);
  }

  foreignMarket() {
    if (this.phase !== OFF_FOREIGN) return { error:'wrong_phase' };
    const t = this.me, f = FG.foreignOf(t), s = this.season;
    const [bw, pw] = s ? s.wars() : [new Map(), new Map()];
    const line = (p) => {
      if (!s) return null;
      const q = p.kind === 'P' ? s.pit.get(p.pid) : s.bat.get(p.pid);
      if (!q || (!q.g && !q.pa)) return null;
      return p.kind === 'P'
        ? `${q.g}G ${q.ipStr}이닝 ERA ${q.era.toFixed(2)}`
        : `${q.g}G ${q.avg.toFixed(3)} ${q.hr}홈런 ${q.rbi}타점`;
    };
    const row = (p, resign) => ({ ...this.brief(p, t), nation:p.nation,
      years:p.kbo_years || 0, ask:FG.askingPrice(p, resign), stat:line(p),
      war: s ? r1((p.kind === 'P' ? pw : bw).get(p.pid) ?? 0) : null });
    return {
      room: f.room, pitcherRoom: f.pitcherRoom, cap: FG.NEW_CAP,
      budget: r1(t.finance.budget), payroll: r1(C.payroll(t, this.L.year + 1)),
      mine: f.all.map(p => row(p, true)),
      market: this.foreignPool.map(p => row(p, false)),
    };
  }

  resignForeign(pid) {
    if (this.phase !== OFF_FOREIGN) return { error:'wrong_phase' };
    const t = this.me, p = FG.foreignOf(t).all.find(x => x.pid === pid);
    if (!p) return { error:'not_found' };
    p.contract = new C.Contract(this.L.year + 1, [FG.askingPrice(p, true)]);
    p.kbo_years = (p.kbo_years || 0) + 1;
    return { ok:true };
  }

  releaseForeign(pid) {
    if (this.phase !== OFF_FOREIGN) return { error:'wrong_phase' };
    const t = this.me, p = FG.foreignOf(t).all.find(x => x.pid === pid);
    if (!p) return { error:'not_found' };
    this._dropForeign(t, p);
    return { ok:true };
  }

  signForeign(pid) {
    if (this.phase !== OFF_FOREIGN) return { error:'wrong_phase' };
    const t = this.me, i = this.foreignPool.findIndex(p => p.pid === pid);
    if (i < 0) return { error:'gone' };
    const p = this.foreignPool[i];
    if (!FG.canSign(t, p.kind)) return { error:'quota' };
    const price = FG.askingPrice(p, false);
    this.foreignPool.splice(i, 1);
    this._addForeign(t, p, price);
    this._aiForeign(2);            // 고르는 동안 시장은 마른다
    return { ok:true, price };
  }

  /** 다른 구단도 움직인다. 각자 자기 스카우트가 본 값으로 고른다. */
  _aiForeign(steps = 120) {
    for (let n = 0; n < steps; n++) {
      const teams = this.L.teams.filter(t => t.team_id !== this.userId && FG.foreignOf(t).room > 0);
      if (!teams.length || !this.foreignPool.length) return;
      const t = teams[Math.floor(this.L.rng.random() * teams.length)];
      let cands = this.foreignPool.filter(p => FG.canSign(t, p.kind));
      if (!cands.length) {
        // 원하는 자리의 매물이 없으면 더 알아본다. 겨울은 길다.
        const need = FG.foreignOf(t).pitcherRoom > 0 ? 'P' : 'B';
        const extra = FG.makeForeign(this.L.rng, need, this.L.year + 1);
        this.foreignPool.push(extra); cands = [extra];
      }
      const best = cands.reduce((a, b) => this.L.see(t, b).ovr > this.L.see(t, a).ovr ? b : a);
      this.foreignPool.splice(this.foreignPool.indexOf(best), 1);
      this._addForeign(t, best, FG.askingPrice(best, false));
    }
  }

  /** AI 구단의 재계약·방출 판단. 성적이 나쁘면 갈아치운다. */
  _aiForeignDecide() {
    const s = this.season;
    const [bw, pw] = s ? s.wars() : [new Map(), new Map()];
    for (const t of this.L.teams) {
      if (t.team_id === this.userId) continue;
      for (const p of FG.foreignOf(t).all) {
        const q = s ? (p.kind === 'P' ? s.pit.get(p.pid) : s.bat.get(p.pid)) : null;
        const war = q ? ((p.kind === 'P' ? pw : bw).get(p.pid) ?? 0) : 0;
        const seen = this.L.see(t, p).ovr;
        // 첫 해 성적이 곧 판단 근거다. 스카우트 보고서보다 이게 더 믿을 만하다.
        const keep = q ? (war >= 1.4) : seen >= 56;
        if (keep) p.contract = new C.Contract(this.L.year + 1, [FG.askingPrice(p, true)]);
        else this._dropForeign(t, p);
      }
    }
  }

  finishForeign() {
    if (this.phase !== OFF_FOREIGN) return { error:'wrong_phase' };
    // 재계약하지 않은 내 외국인은 떠난다.
    for (const p of FG.foreignOf(this.me).all) if (!p.contract) this._dropForeign(this.me, p);
    this._aiForeignDecide();
    // 쿼터를 넘긴 구단을 먼저 정리하고, 그다음 빈자리를 채운다.
    for (const t of this.L.teams) {
      let f = FG.foreignOf(t), guard = 0;
      while ((f.room < 0 || f.pitchers.length > FG.QUOTA.pitchers) && guard++ < 8) {
        const over = f.pitchers.length > FG.QUOTA.pitchers ? f.pitchers : f.all;
        const worst = over.reduce((a, b) => this.L.see(t, b).ovr < this.L.see(t, a).ovr ? b : a);
        this._dropForeign(t, worst);
        f = FG.foreignOf(t);
      }
    }
    this._aiForeign();
    this.foreignPool = [];
    this.phase = OFF_FA; this.faOffers = new Map();
    return { state:this.state() };
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
    // 협상 자리에서 사람이 드러난다
    { const [p] = this.find(pid); if (p) p.talks = (p.talks || 0) + 1; }
    if (this.phase !== OFF_FA) return { error:'wrong_phase' };
    this.faOffers.set(pid, [Math.max(1,+years), Math.max(C.MIN_SALARY,+aav)]);
    return { ok:true };
  }
  cancelOffer(pid) { this.faOffers.delete(pid); return { ok:true }; }
  resolveFA() {
    if (this.phase !== OFF_FA) return { error:'wrong_phase' };
    const log = this.L.offFA(this.faOffers, this.me);
    this.phase = OFF_TRADE;
    const out = { signings: log.map(s => ({ name:s.player.name, age:s.player.age,
      slot: s.player.kind==='P' ? s.player.role : s.player.position,
      team:s.team.name, text:String(s.contract), mine:s.team.team_id===this.userId,
      moved: s.team !== s.from })).sort((a,b) => (b.mine?1:0)-(a.mine?1:0)) };
    offseasonMail(this, 'fa', out.signings);
    return out;
  }
  tradeAssets(teamId) {
    const t = this.L.team(teamId);
    return { team:t.name, mode:this.L.modes.get(t.team_id),
      // 외국인은 트레이드 대상이 아니다. 보유 쿼터가 걸려 있다.
      roster: [...t.batters, ...t.pitchers].filter(p => !p.foreign).map(p => this.brief(p, t)),
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
    const rec = d.pick(p);
    offseasonMail(this, 'draft', [{ mine:true, n:rec.n, name:p.name, age:p.age,
      origin:p.origin ?? '' }]);
    d.runUntil(this.me);
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
