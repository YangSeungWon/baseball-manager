// 선수 / 팀 생성. 베테랑은 18세 유망주를 성장 엔진으로 늙혀서 만든다.
import { newBatter, newPitcher } from './pa.js';
import * as dev from './development.js';
import { personName, teamNames, franchiseOf } from './names.js';

const RHO = 0.55;
// 노화를 거친 뒤 리그 평균이 50(타석 엔진 기준선)에 오도록 하는 보정
export const CALIB = { contact:1.7, avoid_k:2.7, discipline:2.8, gap_power:3.3,
  hr_power:0.6, speed:6.8, fielding:3.6, arm:3.2, stuff:2.0, command:2.5, movement:3.7, stamina:7.9, velo:3.0 };
const YOUTH_GAP = { contact:1.00, avoid_k:0.90, discipline:1.30, gap_power:1.20,
  hr_power:1.40, speed:0.35, fielding:0.80, arm:0.70, stuff:1.00, command:1.30, movement:1.10, stamina:0.90, velo:0.75 };
// [타격보정, 수비요구, 주력보정, 송구요구]
// 포수와 3루수·유격수는 어깨가 필요하고, 우익수는 3루 송구 때문에 강견을 쓴다.
export const POS = { C:[-0.35,0.55,-0.60,0.70], '1B':[0.45,-0.35,-0.45,-0.55],
  '2B':[-0.15,0.35,0.25,-0.20], '3B':[0.15,0.15,-0.10,0.55], SS:[-0.25,0.60,0.30,0.45],
  LF:[0.25,-0.20,0.05,-0.25], CF:[-0.10,0.45,0.60,0.20], RF:[0.20,-0.05,0.10,0.60],
  DH:[0.55,-1.00,-0.35,-0.70] };
export const LINEUP_POS = ['C','1B','2B','3B','SS','LF','CF','RF','DH'];

// 수비 스펙트럼. 오른쪽으로 갈수록 어렵다.
// 어려운 자리에서 쉬운 자리로 가는 건 공짜지만, 반대는 값을 치른다.
const SPECTRUM = ['DH','1B','LF','RF','3B','CF','2B','SS','C'];
const SPEC_I = Object.fromEntries(SPECTRUM.map((p,i)=>[p,i]));

/** 이 선수를 이 자리에 세우면 수비가 얼마나 깎이는가.
 *  포수는 아무나 못 선다. */
export function posPenalty(p, pos) {
  const from = SPEC_I[p.position] ?? 0, to = SPEC_I[pos] ?? 0;
  if (pos === 'C' && p.position !== 'C') return 26;      // 포수는 전문 자리다
  if (p.position === 'C' && pos !== 'C') return 3;       // 포수가 나오면 조금 어색하다
  const step = to - from;
  if (step <= 0) return 0;
  return [0, 4, 9, 14, 19, 24, 28, 32][Math.min(7, step)];
}
export const posFit = (p, pos) => {
  const d = posPenalty(p, pos);
  return d === 0 ? '적합' : d <= 4 ? '가능' : d <= 14 ? '무리' : '불가';
};
export const FIELD_POS = ['C','1B','2B','3B','SS','LF','CF','RF'];

let _pid = 1;
export const newPid = () => ++_pid;
export const getPidCounter = () => _pid;
export const setPidCounter = (v) => { _pid = v; };

const attr = (talent, rng, rho = RHO, shift = 0) => {
  const n = rng.gauss(0, 1);
  return Math.max(20, Math.min(80, 50 + 10 * (rho*talent + Math.sqrt(1-rho*rho)*n + shift)));
};

/** 키는 창단 시 한 번 정한다 (20세까지만 조금 더 자란다). 몸무게는 성장에 따라 변한다. */
function physique(p, rng) {
  const hAdj = dev.bodyAdj(p)[0];
  p.height = Math.round(Math.max(168, Math.min(199, 179 + hAdj + rng.gauss(0, 5.2))));
  dev.updateWeight(p);
}

function finish(p, pot, rng, year) {
  p.pot = {}; for (const a in pot) p.pot[a] = Math.min(80, pot[a] + CALIB[a]);
  p.hidden = dev.makeHidden(rng);
  p.age = 18; p.debut_year = null; p.draft_year = year;
  p.injury_days = 0; p.career_injuries = 0; p.career_injury_days = 0;
  p.contract = null; p.service = 0;
  const gap = rng.uniform(7, 19);
  for (const a of dev.attrsOf(p)) p[a] = Math.max(20, p.pot[a] - gap * YOUTH_GAP[a] * rng.uniform(0.7, 1.3));
  physique(p, rng);
  return p;
}

export function makeProspectBatter(rng, pos, talent = null, year = 0) {
  const t = talent === null ? rng.gauss(0,1) : talent;
  const [hit, fld, spd, arm] = POS[pos];
  const pot = {
    contact: attr(t,rng,RHO,hit*0.5), avoid_k: attr(t,rng,0.35,hit*0.3),
    discipline: attr(t,rng,0.40,hit*0.3), gap_power: attr(t,rng,RHO,hit*0.6),
    hr_power: attr(t,rng,RHO,hit*0.8), speed: attr(t,rng,0.20,spd),
    fielding: attr(t,rng,0.15,fld), arm: attr(t,rng,0.10,arm),
  };
  const b = newBatter({ gb_tendency: attr(0,rng,0), bats: rng.random()<0.33?'L':'R',
    position: pos, pid: newPid(), name: personName(rng) });
  return finish(b, pot, rng, year);
}

/** 레퍼토리. 선발은 3~5개, 불펜은 2~3개. 너클볼러는 아주 드물다. */
export function makeArsenal(rng, role) {
  if (rng.random() < 0.010) return ['KN', 'FF'];
  const n = role === 'SP' ? rng.choice([3,3,3,4,4,5]) : rng.choice([2,2,3,3]);
  const fast = rng.random() < 0.32 ? 'SI' : 'FF';
  const pool = ['SL','SL','SL','CH','CH','CU','CU','FC','FS'];   // 슬라이더가 가장 흔하다
  const off = [];
  while (off.length < n - 1 && pool.length) {
    const p = pool.splice(Math.floor(rng.random() * pool.length), 1)[0];
    if (!off.includes(p)) off.push(p);
  }
  return [fast, ...off];
}

export function makeProspectPitcher(rng, role = 'SP', talent = null, year = 0) {
  let t = talent === null ? rng.gauss(0,1) : talent;
  let stamShift = 0.60;
  if (role !== 'SP') { stamShift = -1.10; t += 0.15; }
  const pot = {
    stuff: attr(t,rng,RHO, role!=='SP'?0.20:0), command: attr(t,rng,0.45),
    movement: attr(t,rng,0.45), stamina: attr(t,rng,0.20,stamShift),
    // 구속은 구위와 붙어 있지만 같지는 않다. 느린 공으로 삼진 잡는 투수도 있다.
    velo: attr(t,rng,0.30, role !== 'SP' ? 0.30 : 0),
  };
  const p = newPitcher({ gb_tendency: attr(0,rng,0), throws: rng.random()<0.28?'L':'R',
    role, pid: newPid(), name: personName(rng), arsenal: makeArsenal(rng, role) });
  return finish(p, pot, rng, year);
}

export function ageTo(p, target, rng, pt = 1.0) {
  while (p.age < target) dev.develop(p, rng, pt);
  return p;
}

function makeAged(rng, kind, targetAge, year, bestOf, opts) {
  const cands = [];
  for (let i = 0; i < bestOf; i++) {
    const p = kind === 'B'
      ? makeProspectBatter(rng, opts.pos, opts.talent, year)
      : makeProspectPitcher(rng, opts.role, opts.talent, year);
    ageTo(p, targetAge, rng);
    cands.push(p);
  }
  const best = cands.reduce((a,b) => dev.overall(b) > dev.overall(a) ? b : a);
  best.debut_year = year - Math.max(0, targetAge - 21);
  return best;
}

const AGE_REG = [24,25,25,26,26,27,27,28,28,29,30,30,31,32,33,34];
const AGE_SUB = [23,24,25,26,27,28,29,30,31,33];

export function refreshTeam(t) {
  if (!(t.manual && t.manual.rot && t.manual.rot.length))
    t.rotation.sort((a,b) => -(a.stuff+a.command*.7+a.movement*.5+a.stamina*.4)
                           + (b.stuff+b.command*.7+b.movement*.5+b.stamina*.4));
  t.bullpen.sort((a,b) => -(a.stuff+a.command*.6) + (b.stuff+b.command*.6));
  const manualOrder = t.manual && t.manual.order && t.manual.order.length;
  if (!manualOrder) {
    t.lineup.sort((a,b) => -(a.discipline*1.2+a.contact+a.hr_power*.6)
                          + (b.discipline*1.2+b.contact+b.hr_power*.6));
    if (t.lineup.length > 1) { const x = t.lineup[0]; t.lineup[0] = t.lineup[1]; t.lineup[1] = x; }
  }
  if (!t.lineup.length) return t;
  // 배치된 자리 기준으로 본다. 자기 자리가 아니면 그만큼 깎인다.
  const at = (b) => Math.max(20, b.fielding - posPenalty(b, b.slot || b.position));
  const inf = t.lineup.filter(b => ['C','1B','2B','3B','SS'].includes(b.slot || b.position)).map(at);
  const of = t.lineup.filter(b => ['LF','CF','RF'].includes(b.slot || b.position)).map(at);
  const c = t.lineup.filter(b => (b.slot || b.position) === 'C').map(at);
  const avg = (a) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 50;
  t.defense = { infield: avg(inf), outfield: avg(of), catcherFraming: c.length?c[0]:50 };
  assignPen(t);
  return t;
}

/** 불펜 보직. CL 마무리 / SU 필승조 / MR 추격조 / LR 롱릴리프(불펜데이 오프너).
 *  감독이 지정한 보직(pen_lock)은 건드리지 않는다. */
export function assignPen(t) {
  const pen = t.bullpen || [];
  if (!pen.length) return;
  const free = pen.filter(p => !p.pen_lock);
  for (const p of free) p.pen_role = null;
  const taken = (role) => pen.filter(p => p.pen_role === role).length;
  const take = (role, n, key) => {
    const want = n - taken(role);                       // 루프 전에 한 번만 센다
    const c = free.filter(p => !p.pen_role).sort((a,b) => key(b) - key(a));
    for (let i = 0; i < want && i < c.length; i++) c[i].pen_role = role;
  };
  // 롱릴리프는 이닝을 먹어야 하므로 스태미나가 최우선.
  take('LR', 1, p => p.stamina * 1.6 + p.command * .4 + (p.role === 'SP' ? 22 : 0));
  take('CL', 1, p => p.stuff * 1.2 + p.command * .7 + p.movement * .3);
  take('SU', 2, p => p.stuff + p.command * .7 + p.movement * .4);
  for (const p of free) if (!p.pen_role) p.pen_role = 'MR';
}
export const PEN_LABEL = { CL:'마무리', SU:'필승조', MR:'추격조', LR:'롱릴리프' };

/** 감독이 짜 둔 편성. 다친 선수는 자동으로 메운다. */
function applyManual(t, pool) {
  const m = t.manual;
  if (!m || !m.order || !m.order.length) return null;
  const by = new Map(pool.map(p => [p.pid, p]));
  const used = new Set(), lineup = [];
  for (const pid of m.order) {
    const p = by.get(pid);
    if (!p || used.has(pid)) continue;
    p.slot = (m.pos && m.pos[pid]) || p.position;
    used.add(pid); lineup.push(p);
  }
  if (lineup.length < 9) {                     // 빈 자리는 남은 선수로 메운다
    const taken = new Set(lineup.map(p => p.slot));
    const rest = pool.filter(p => !used.has(p.pid))
      .sort((a, b) => dev.overall(b) - dev.overall(a));
    for (const pos of FIELD_POS) {
      if (taken.has(pos) || lineup.length >= 9) continue;
      const i = rest.findIndex(p => p.position === pos);
      const p = rest.splice(i >= 0 ? i : 0, 1)[0];
      if (!p) break;
      p.slot = pos; taken.add(pos); used.add(p.pid); lineup.push(p);
    }
    while (lineup.length < 9 && rest.length) {
      const p = rest.shift(); p.slot = 'DH'; used.add(p.pid); lineup.push(p);
    }
  }
  return { lineup, bench: pool.filter(p => !used.has(p.pid)) };
}

export function rebuildRoster(t, healthyOnly = false) {
  const bats = healthyOnly ? t.batters.filter(b => b.injury_days <= 0) : t.batters;
  const pits = healthyOnly ? t.pitchers.filter(p => p.injury_days <= 0) : t.pitchers;
  const pool = [...bats].sort((a,b) => dev.overall(b) - dev.overall(a));
  // 감독이 짜 둔 편성이 있으면 자동 배치는 아예 돌리지 않는다.
  // 돌리면 마지막에 남은 선수의 자리를 덮어써 버린다.
  const man = applyManual(t, pool);
  if (man) { t.lineup = man.lineup; t.bench = man.bench; }
  else {
    const used = new Set(); const lineup = [];
    for (const pos of FIELD_POS) {
      let cand = pool.filter(b => b.position === pos && !used.has(b.pid));
      if (!cand.length) cand = pool.filter(b => !used.has(b.pid));
      if (!cand.length) break;
      used.add(cand[0].pid); cand[0].slot = pos; lineup.push(cand[0]);
    }
    let rest = pool.filter(b => !used.has(b.pid));
    if (rest.length) { rest[0].slot = 'DH'; lineup.push(rest[0]); rest = rest.slice(1); }
    t.lineup = lineup; t.bench = rest;
  }

  const sp = pits.filter(p => p.role === 'SP')
    .sort((a,b) => -(a.stuff+a.command*.7+a.movement*.5+a.stamina*.4)
                   +(b.stuff+b.command*.7+b.movement*.5+b.stamina*.4));
  const rp = pits.filter(p => p.role === 'RP')
    .sort((a,b) => -(a.stuff+a.command*.6)+(b.stuff+b.command*.6));
  while (sp.length < 5 && rp.length) sp.push(rp.shift());
  if (sp.length) {
    t.rotation = sp.slice(0,5); t.bullpen = rp.concat(sp.slice(5)).slice(0,8);
    if (t.manual && t.manual.rot && t.manual.rot.length) {   // 감독이 정한 선발 순서
      const by = new Map(t.rotation.map(p => [p.pid, p]));
      const ord = t.manual.rot.map(pid => by.get(pid)).filter(Boolean);
      t.rotation = ord.concat(t.rotation.filter(p => !ord.includes(p)));
    }
  }
  else if (rp.length) { t.rotation = rp.slice(0,5); t.bullpen = rp.slice(5).length ? rp.slice(5) : rp.slice(0,1); }
  return refreshTeam(t);
}

export function callUp(t, wantPitcher, rng, year, role = null) {
  let cand = t.farm.filter(p => (p.kind === 'P') === wantPitcher && p.injury_days <= 0
                                && (role === null || p.role === role));
  let best;
  if (cand.length) {
    best = cand.reduce((a,b) => dev.overall(b) > dev.overall(a) ? b : a);
    t.farm.splice(t.farm.indexOf(best), 1);
  } else if (wantPitcher) {
    best = makeProspectPitcher(rng, role || 'RP', rng.gauss(-0.9, 0.6), year);
    ageTo(best, 22, rng, 0.85);
  } else {
    best = makeProspectBatter(rng, rng.choice(LINEUP_POS), rng.gauss(-0.9, 0.6), year);
    ageTo(best, 22, rng, 0.85);
  }
  (wantPitcher ? t.pitchers : t.batters).push(best);
  return best;
}

export function setActive(t, rng, year) {
  const ups = [];
  let guard = 0;
  while (t.batters.filter(b => b.injury_days <= 0).length < 10 && guard++ < 20)
    ups.push(callUp(t, false, rng, year));
  guard = 0;
  while (t.pitchers.filter(p => p.injury_days <= 0).length < 9 && guard++ < 20)
    ups.push(callUp(t, true, rng, year));
  guard = 0;
  while (t.pitchers.filter(p => p.injury_days <= 0 && p.role === 'SP').length < 4 && guard++ < 20)
    ups.push(callUp(t, true, rng, year, 'SP'));
  rebuildRoster(t, true);
  return ups;
}

export function makeTeam(rng, teamId, name, year = 2030, teamTalent = 0) {
  const lineup = LINEUP_POS.map(pos =>
    makeAged(rng, 'B', rng.choice(AGE_REG), year, 3, { pos, talent: rng.gauss(teamTalent, 0.85) }));
  const bench = Array.from({length:4}, () =>
    makeAged(rng, 'B', rng.choice(AGE_SUB), year, 2,
             { pos: rng.choice(LINEUP_POS), talent: rng.gauss(teamTalent-0.8, 0.7) }));
  const rotation = Array.from({length:5}, () =>
    makeAged(rng, 'P', rng.choice(AGE_REG), year, 3, { role:'SP', talent: rng.gauss(teamTalent, 0.85) }));
  const bullpen = Array.from({length:7}, () =>
    makeAged(rng, 'P', rng.choice(AGE_SUB), year, 2, { role:'RP', talent: rng.gauss(teamTalent-0.15, 0.8) }));

  const t = {
    team_id: teamId, name, lineup, bench, rotation, bullpen,
    batters: lineup.concat(bench), pitchers: rotation.concat(bullpen), farm: [],
    rot_index: 0, talent: teamTalent, unavailable: new Set(),
    park: { hrFactor: Math.max(-0.21, Math.min(0.21, rng.gauss(0, 0.095))),
            hitFactor: rng.gauss(0, 0.045),
            name: null, capacity: 18000, opened: null },
    defense: { infield:50, outfield:50, catcherFraming:50 },
    /** 로테이션 순번. 부상자는 건너뛰고, 전원 이탈이면 null → 불펜데이. */
    nextStarter() {
      const n = this.rotation.length;
      for (let i = 0; i < n; i++) {
        const p = this.rotation[(this.rot_index + i) % n];
        if (p && p.injury_days <= 0) { this.rot_index += i + 1; return p; }
      }
      this.rot_index++; return null;
    },
  };
  for (let i = 0; i < 6; i++) {
    const b = makeProspectBatter(rng, rng.choice(LINEUP_POS), rng.gauss(teamTalent,0.9), year);
    ageTo(b, rng.choice([18,19,20,21]), rng, 0.8); t.farm.push(b);
  }
  for (let i = 0; i < 6; i++) {
    const p = makeProspectPitcher(rng, rng.choice(['SP','SP','RP']), rng.gauss(teamTalent,0.9), year);
    ageTo(p, rng.choice([18,19,20,21]), rng, 0.8); t.farm.push(p);
  }
  rebuildRoster(t);
  return t;
}

export function makeLeague(nTeams, rng, year = 2030) {
  _pid = 1;
  const names = teamNames(nTeams, rng);
  return names.map((n, i) => {
    const t = makeTeam(rng, i + 1, n, year, rng.gauss(0, 0.22));
    const f = franchiseOf(n);
    t.park.name = f.park; t.park.capacity = f.cap; t.park.opened = f.opened;
    // 구장 규격. 그림용이 아니라 담장을 넘느냐를 정하는 바로 그 숫자다.
    t.park.fL = f.fL; t.park.fC = f.fC; t.park.fR = f.fR; t.park.fH = f.fH;
    t.park.turf = f.turf || 0; t.park.alt = f.alt || 0; t.park.dome = !!f.dome;
    return t;
  });
}
