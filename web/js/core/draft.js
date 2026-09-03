// 아마추어 드래프트. 팀은 자기 스카우트의 추정치로 지명한다.
import * as R from './roster.js';
import * as dev from './development.js';

// 실제 KBO 신인 드래프트는 11라운드다. 4라운드로 돌리면 소속선수가 마흔에서
// 멈춰서 2군도, 보호선수 명단도 실제와 다른 물건이 된다.
export const CLASS_SIZE = 242, ROUNDS = 11, HS_RATIO = 0.60;
const POS_PREMIUM = { C:2.2, SS:1.8, CF:1.0, '2B':0.5, '3B':0.3, RF:-0.4, LF:-0.8, '1B':-1.6, DH:-2.6 };

export function makeClass(rng, year) {
  const pool = [];
  for (let i = 0; i < CLASS_SIZE; i++) {
    const talent = rng.gauss(-0.30, 1.05);
    const p = rng.random() < 0.52
      ? R.makeProspectBatter(rng, rng.choice(R.LINEUP_POS), talent, year)
      : R.makeProspectPitcher(rng, rng.choice(['SP','SP','RP']), talent, year);
    if (rng.random() < HS_RATIO) { p.origin = '고졸'; p.scout_difficulty = 1.20; }
    else {
      p.origin = '대졸';
      for (const a of dev.attrsOf(p)) p.pot[a] = Math.min(80, p.pot[a] + 1.4);
      R.ageTo(p, 21, rng, 0.90);
      p.scout_difficulty = 0.62;
    }
    pool.push(p);
  }
  return pool;
}

export function scoutClass(dept, pool, rng) {
  for (const p of pool) dept.observe(p, rng, 1);
  const rough = [...pool].sort((a,b) => dept.report(b,rng).pot - dept.report(a,rng).pot);
  rough.forEach((p, i) => {
    if (i < 12) dept.observe(p, rng, 3);
    else if (i < 26) dept.observe(p, rng, 2);
    else if (i < 42) dept.observe(p, rng, 1);
  });
}

export function pickValue(team, dept, p, rng) {
  const r = dept.report(p, rng);
  const w = team.upside_weight ?? 0.70;
  let v = w*r.pot + (1-w)*r.ovr;
  if (p.kind === 'B') v += (POS_PREMIUM[p.position] ?? 0) * 0.55;
  else v += p.role === 'SP' ? 0.6 : -0.6;
  return v;
}

export class DraftSession {
  constructor(teams, scouts, order, pool, rng, year = 0) {
    this.teams = teams; this.scouts = scouts; this.rng = rng; this.year = year;
    this.order = order; this.pool = pool; this.available = [...pool];
    this.picks = []; this.n = 0;
    for (const t of teams) scoutClass(scouts.get(t.team_id), pool, rng);
  }
  get totalPicks() { return Math.min(ROUNDS * this.order.length, this.pool.length); }
  get done() { return this.n >= this.totalPicks || !this.available.length; }
  get onClock() { return this.done ? null : this.order[this.n % this.order.length]; }
  aiChoice(t) {
    const dept = this.scouts.get(t.team_id);
    return this.available.reduce((a,b) =>
      pickValue(t, dept, b, this.rng) > pickValue(t, dept, a, this.rng) ? b : a);
  }
  pick(player = null) {
    const t = this.onClock;
    if (!t) return null;
    let p = player && this.available.includes(player) ? player : this.aiChoice(t);
    this.available.splice(this.available.indexOf(p), 1);
    this.n++;
    p.drafted_round = Math.floor((this.n-1)/this.order.length) + 1;
    p.drafted_overall = this.n;
    p.drafted_by = t.team_id;
    t.farm.push(p);
    const rec = { n: this.n, round: p.drafted_round, team: t, player: p,
                  report: this.scouts.get(t.team_id).report(p, this.rng) };
    // 지명한 구단이 그날 본 것을 남긴다. 몇 해 뒤에 이 숫자와 실제를
    // 나란히 놓는 것이 이 게임의 이야기다.
    const oR = rec.report.ovrRange('cur'), pR = rec.report.ovrRange('pot');
    p.drafted_year = this.year;
    p.draft_look = [Math.round(oR[0]), Math.round(oR[1]),
                    Math.round(pR[0]), Math.round(pR[1])];
    this.picks.push(rec);
    return rec;
  }
  runUntil(team = null) { while (!this.done && this.onClock !== team) this.pick(); return this.picks; }
}
