// 경기 엔진: 진루 모델 + 이닝 루프 + 투수 교체 AI + 박스스코어.
import { simulatePA, z, K, BB, HBP, OUT, S1B, D2B, T3B, HR } from './pa.js';

export const ADV = {
  b1_first_to_third: 0.300, b1_second_scores: 0.665, b2_first_scores: 0.505,
  speed_coeff: 0.090, of_arm_coeff: -0.055,
  gidp_base: 0.400, gidp_speed: -0.055, gidp_infield: 0.030,
  sacfly_base: 0.550, gb_r3_scores: 0.320, gb_r2_to_third: 0.450, fb_r2_to_third: 0.130,
  sb_attempt_base: 0.165, sb_attempt_speed: 0.075,
  sb_success_base: 0.720, sb_success_speed: 0.055,
};

class Bases {
  constructor() { this.r = [null,null,null]; this.resp = [null,null,null]; }
  put(i, runner, resp) { this.r[i] = runner; this.resp[i] = resp; }
  take(i) { const x = [this.r[i], this.resp[i]]; this.r[i] = null; this.resp[i] = null; return x; }
  move(s, d) { this.r[d] = this.r[s]; this.resp[d] = this.resp[s]; this.r[s] = null; this.resp[s] = null; }
  occupied() { return this.r.filter(Boolean).length; }
}

const batLine = (b) => ({ b, pa:0,ab:0,h:0,b2:0,b3:0,hr:0,bb:0,k:0,rbi:0,run:0,sb:0,cs:0,hbp:0 });
const pitLine = (p) => ({ p, outs:0,bf:0,h:0,hr:0,bb:0,k:0,r:0,hbp:0,fatigue:0,
                          entered_inning:0, entered_lead:0, w:false,l:false,sv:false,hld:false });

export const starterCapacity = (p) => 9.0 + 0.15 * p.stamina;
export const relieverCapacity = (p) => 3.0 + 0.045 * p.stamina;
function fatigueOf(line, isStarter) {
  const cap = isStarter ? starterCapacity(line.p) : relieverCapacity(line.p);
  const span = isStarter ? 10.0 : 4.0;
  return Math.max(0, Math.min(1.5, (line.bf - cap) / span));
}

class TeamGameState {
  constructor(team) {
    this.team = team;
    this.order = [...team.lineup];
    this.spot = 0;
    this.bat = new Map();
    for (const b of team.lineup) this.bat.set(b.pid, batLine(b));
    this.starter = team.nextStarter();
    this.pitchers = [pitLine(this.starter)];
    const unavail = team.unavailable || new Set();
    let avail = team.bullpen.filter(p => !unavail.has(p.pid));
    if (avail.length < 3) {
      const rest = team.bullpen.filter(p => unavail.has(p.pid));
      avail = avail.concat(rest.slice(0, 3 - avail.length));
    }
    this.bullpenLeft = avail;
    this.runs = 0; this.hits = 0; this.lob = 0;
    this.line = []; this.por = null; this.lp = null;
  }
  get cur() { return this.pitchers[this.pitchers.length - 1]; }
  batterUp() { const b = this.order[this.spot]; this.spot = (this.spot + 1) % 9; return b; }
  lineFor(b) {
    if (!this.bat.has(b.pid)) this.bat.set(b.pid, batLine(b));
    return this.bat.get(b.pid);
  }
}

function maybeChangePitcher(defn, inning, lead) {
  const cur = defn.cur;
  const isStarter = defn.pitchers.length === 1;
  const f = fatigueOf(cur, isStarter);
  cur.fatigue = f;
  if (!defn.bullpenLeft.length) return;
  let pull = false;
  if (isStarter) {
    if (f >= 1.0) pull = true;
    else if (f >= 0.55 && inning >= 5) pull = true;
    else if (cur.r >= 6) pull = true;
  } else {
    if (f >= 0.85) pull = true;
    else if (inning > cur.entered_inning && cur.bf >= 4 && defn.bullpenLeft.length >= 3) pull = true;
  }
  if (inning >= 9 && lead > 0 && lead <= 3 && defn.bullpenLeft.length
      && cur.p !== defn.bullpenLeft[0] && (isStarter || f > 0.2)) pull = true;
  if (!pull) return;
  let nxt;
  if (inning >= 9 && lead > 0 && lead <= 3) nxt = defn.bullpenLeft.shift();
  else nxt = defn.bullpenLeft.splice(defn.bullpenLeft.length > 1 ? Math.floor(defn.bullpenLeft.length/2) : 0, 1)[0];
  const nl = pitLine(nxt);
  nl.entered_inning = inning; nl.entered_lead = lead;
  defn.pitchers.push(nl);
}

function forceAdvance(bases, batter, resp) {
  let scored = null;
  if (bases.r[0]) {
    if (bases.r[1]) {
      if (bases.r[2]) scored = [bases.r[2], bases.resp[2]];
      bases.move(1, 2);
    }
    bases.move(0, 1);
  }
  bases.put(0, batter, resp);
  return scored;
}

function resolve(res, bbt, batter, bases, outs, off, defn, rng) {
  const bl = off.lineFor(batter);
  const zs = z(batter.speed), zarm = z(defn.team.defense.outfield);
  const me = defn.cur;
  const scored = [];
  let addedOuts = 0, desc = '';

  if (res === K) { addedOuts = 1; desc = '삼진'; }
  else if (res === BB || res === HBP) {
    const s = forceAdvance(bases, batter, me);
    if (s) scored.push(s);
    desc = res === BB ? '볼넷' : '몸에 맞는 공';
  } else if (res === OUT) {
    addedOuts = 1;
    if (bbt === 'GB' && bases.r[0] && outs < 2) {
      const pdp = ADV.gidp_base + ADV.gidp_speed*zs + ADV.gidp_infield*z(defn.team.defense.infield);
      if (rng.random() < pdp) {
        addedOuts = 2; bases.take(0);
        if (outs === 0 && bases.r[2]) scored.push(bases.take(2));
        if (bases.r[1] && !bases.r[2]) bases.move(1, 2);
        desc = '병살타';
      } else {
        bases.take(0);
        if (bases.r[2] && rng.random() < ADV.gb_r3_scores + 0.25) scored.push(bases.take(2));
        if (bases.r[1] && !bases.r[2] && rng.random() < 0.35) bases.move(1, 2);
        bases.put(0, batter, me);
        desc = '야수선택';
      }
    } else if (bbt === 'GB') {
      if (outs < 2) {
        if (bases.r[2] && rng.random() < ADV.gb_r3_scores) scored.push(bases.take(2));
        if (bases.r[1] && !bases.r[2] && rng.random() < ADV.gb_r2_to_third) bases.move(1, 2);
      }
      desc = '땅볼 아웃';
    } else {
      if (bbt === 'FB' && outs < 2) {
        if (bases.r[2] && rng.random() < ADV.sacfly_base + ADV.of_arm_coeff*zarm) {
          scored.push(bases.take(2)); desc = '희생플라이';
        } else if (bases.r[1] && !bases.r[2] && rng.random() < ADV.fb_r2_to_third) bases.move(1, 2);
      }
      if (!desc) desc = {FB:'뜬공 아웃', LD:'직선타 아웃', PU:'내야 뜬공'}[bbt];
    }
  } else {
    me.h++; off.hits++;
    if (res === HR) {
      me.hr++;
      for (const i of [2,1,0]) if (bases.r[i]) scored.push(bases.take(i));
      scored.push([batter, me]); desc = '홈런';
    } else if (res === T3B) {
      for (const i of [2,1,0]) if (bases.r[i]) scored.push(bases.take(i));
      bases.put(2, batter, me); desc = '3루타';
    } else if (res === D2B) {
      if (bases.r[2]) scored.push(bases.take(2));
      if (bases.r[1]) scored.push(bases.take(1));
      if (bases.r[0]) {
        const [r1, rp1] = bases.take(0);
        const p = ADV.b2_first_scores + ADV.speed_coeff*z(r1.speed) + ADV.of_arm_coeff*zarm;
        if (rng.random() < p) scored.push([r1, rp1]); else bases.put(2, r1, rp1);
      }
      bases.put(1, batter, me); desc = '2루타';
    } else {
      if (bases.r[2]) scored.push(bases.take(2));
      const [r2, rp2] = bases.take(1);
      const [r1, rp1] = bases.take(0);
      if (r2) {
        const p = ADV.b1_second_scores + ADV.speed_coeff*z(r2.speed) + ADV.of_arm_coeff*zarm;
        if (rng.random() < p) scored.push([r2, rp2]); else bases.put(2, r2, rp2);
      }
      if (r1) {
        const p = ADV.b1_first_to_third + ADV.speed_coeff*z(r1.speed) + ADV.of_arm_coeff*zarm;
        if (!bases.r[2] && rng.random() < p) bases.put(2, r1, rp1); else bases.put(1, r1, rp1);
      }
      bases.put(0, batter, me); desc = '안타';
    }
  }
  for (const [runner, resp] of scored) {
    off.runs++; off.lineFor(runner).run++; (resp || me).r++;
  }
  bl.rbi += scored.length;
  return [addedOuts, scored.length, desc];
}

function trySteal(bases, outs, off, rng) {
  const r1 = bases.r[0];
  if (!r1 || bases.r[1] || outs >= 2) return 0;
  const zs = z(r1.speed);
  if (rng.random() >= ADV.sb_attempt_base + ADV.sb_attempt_speed*zs) return 0;
  if (rng.random() < ADV.sb_success_base + ADV.sb_success_speed*zs) {
    bases.move(0, 1); off.lineFor(r1).sb++; return 0;
  }
  bases.take(0); off.lineFor(r1).cs++; return 1;
}

function playHalf(off, defn, inning, park, rng, walkoff) {
  const bases = new Bases();
  let outs = 0;
  const startRuns = off.runs;
  const plays = [];
  while (outs < 3) {
    const lead = defn.runs - off.runs;
    maybeChangePitcher(defn, inning, lead);
    outs += trySteal(bases, outs, off, rng);
    if (outs >= 3) break;
    const prevDiff = off.runs - defn.runs;
    const batter = off.batterUp();
    const pl = defn.cur;
    const isStarter = defn.pitchers.length === 1;
    const ctx = { fatigue: fatigueOf(pl, isStarter), timesThrough: 1 + Math.floor(pl.bf / 9) };
    const [res, bbt] = simulatePA(batter, pl.p, defn.team.defense, park, ctx, rng);
    const bl = off.lineFor(batter);
    bl.pa++; pl.bf++;
    if (res === BB) { bl.bb++; pl.bb++; }
    else if (res === HBP) { bl.hbp++; pl.hbp++; }
    else if (res === K) { bl.ab++; bl.k++; pl.k++; }
    else {
      bl.ab++;
      if (res !== OUT) { bl.h++; if (res===D2B) bl.b2++; else if (res===T3B) bl.b3++; else if (res===HR) bl.hr++; }
    }
    const [ao, runs, desc] = resolve(res, bbt, batter, bases, outs, off, defn, rng);
    outs += ao; pl.outs += ao;
    plays.push({ inning, half: off.half, batter: batter.name, desc, runs,
                 outs, score: `${off.runs}-${defn.runs}` });
    if (off.runs > defn.runs && prevDiff <= 0) { off.por = off.cur; defn.lp = defn.cur; }
    if (walkoff && off.runs > defn.runs) {
      off.lob += bases.occupied(); off.line.push(off.runs - startRuns);
      return [true, plays];
    }
  }
  off.lob += bases.occupied();
  off.line.push(off.runs - startRuns);
  return [false, plays];
}

function assignDecisions(H, A) {
  if (H.runs === A.runs) return;
  const [win, lose] = H.runs > A.runs ? [H, A] : [A, H];
  let wp = win.por || win.pitchers[0];
  if (wp === win.pitchers[0] && wp.outs < 15 && win.pitchers.length > 1) {
    wp = win.pitchers.slice(1).reduce((a, b) => (b.outs > a.outs ? b : a));
  }
  wp.w = true;
  (lose.lp || lose.pitchers[0]).l = true;
  const last = win.pitchers[win.pitchers.length - 1];
  if (win.pitchers.length > 1 && last !== wp && win.runs - lose.runs <= 3) last.sv = true;
  for (const pl of win.pitchers.slice(1)) {
    if (pl !== wp && pl !== last && pl.entered_lead < 0 && pl.r === 0) pl.hld = true;
  }
}

export function playGame(home, away, rng, maxInnings = 15) {
  const H = new TeamGameState(home), A = new TeamGameState(away);
  H.half = 'bottom'; A.half = 'top';
  let inning = 1;
  const plays = [];
  for (;;) {
    plays.push(...playHalf(A, H, inning, home.park, rng, false)[1]);
    if (inning >= 9 && H.runs > A.runs) break;
    const [walk, pl] = playHalf(H, A, inning, home.park, rng, inning >= 9);
    plays.push(...pl);
    if (walk) break;
    if (inning >= 9 && H.runs !== A.runs) break;
    if (inning >= maxInnings) break;
    inning++;
  }
  assignDecisions(H, A);
  return [H, A, plays];
}
