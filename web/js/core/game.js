// 경기 엔진: 진루 모델 + 이닝 루프 + 투수 교체 AI + 박스스코어.
const r2 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
import { z, K, BB, HBP, OUT, S1B, D2B, T3B, HR, ERR } from './pa.js';
import { playCount, FOUL_OUT, PITCH } from './pitch.js';
import * as BIP from './bip.js';
import { C as PACOEF } from './pa.js';
const PC_FATIGUE_S = PACOEF.fatigueStuff, PC_FATIGUE_C = PACOEF.fatigueCommand;

// 포수 뒤로 빠지는 공, 보크, 런다운. 전부 주자가 있을 때만 의미가 있다.
export const MISC = {
  blockBase: 0.845, blockDef: 0.055,      // 포수가 원바운드를 막을 확률
  d3Reach: 0.60, d3Arm: -0.070, d3Speed: 0.055,   // 낫아웃으로 살아나갈 확률
  balk: 0.0025,                           // 주자 있을 때 타석당
  rundown: 0.185, rundownArm: 0.045,      // 과감한 주루가 협살로 끝날 확률
};

export const ADV = {
  b1_first_to_third: 0.210, b1_second_scores: 0.460, b2_first_scores: 0.348,
  speed_coeff: 0.090, of_arm_coeff: -0.055,
  gidp_base: 0.400, gidp_speed: -0.055, gidp_infield: 0.030,
  sacfly_base: 0.379, gb_r3_scores: 0.222, gb_r2_to_third: 0.309, fb_r2_to_third: 0.091,
  sb_attempt_base: 0.165, sb_attempt_speed: 0.075,
  sb_success_base: 0.720, sb_success_speed: 0.055,
};

// 주자마다 책임 투수와 자책 여부를 함께 들고 다닌다.
// 실책으로 살아나간 주자의 득점은 투수 책임이 아니다.
class Bases {
  constructor() { this.r = [null,null,null]; this.resp = [null,null,null]; this.ue = [false,false,false]; }
  put(i, runner, resp, ue = false) { this.r[i] = runner; this.resp[i] = resp; this.ue[i] = ue; }
  take(i) { const x = [this.r[i], this.resp[i], this.ue[i]];
            this.r[i] = null; this.resp[i] = null; this.ue[i] = false; return x; }
  move(s, d) { this.r[d] = this.r[s]; this.resp[d] = this.resp[s]; this.ue[d] = this.ue[s];
               this.r[s] = null; this.resp[s] = null; this.ue[s] = false; }
  occupied() { return this.r.filter(Boolean).length; }
}

// 홈/원정, 상대 투수 손. 야구 팬이 판단에 쓰는 기본 스플릿.
export const SPLIT_F = ['pa','ab','h','b2','b3','hr','bb','k','rbi'];
export const PSPLIT_F = ['outs','bf','h','hr','bb','k','r'];
const zeros = (n) => new Array(n).fill(0);
const batLine = (b) => ({ b, pa:0,ab:0,h:0,b2:0,b3:0,hr:0,bb:0,k:0,rbi:0,run:0,sb:0,cs:0,hbp:0,e:0,gsl:0,
  sp:{ H:zeros(9), A:zeros(9), L:zeros(9), R:zeros(9) } });
const pitLine = (p) => ({ p, outs:0,bf:0,h:0,hr:0,bb:0,k:0,r:0,er:0,np:0,hbp:0,wp:0,bk:0,br:0,fatigue:0,
                          entered_inning:0, entered_lead:0, w:false,l:false,sv:false,hld:false,
                          sp:{ H:zeros(7), A:zeros(7) } });

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
    const unavail = team.unavailable || new Set();
    let avail = team.bullpen.filter(p => !unavail.has(p.pid));
    if (avail.length < 3) {
      const rest = team.bullpen.filter(p => unavail.has(p.pid));
      avail = avail.concat(rest.slice(0, 3 - avail.length));
    }
    this.starter = team.nextStarter();
    this.penDay = false;
    if (!this.starter) {              // 선발이 없으면 불펜데이 — 롱릴리프가 오프너
      const i = Math.max(0, avail.findIndex(p => p.pen_role === 'LR'));
      this.starter = avail.splice(i, 1)[0] || team.bullpen[0];
      this.penDay = true;
    }
    this.pitchers = [pitLine(this.starter)];
    this.bullpenLeft = avail;
    // 어느 자리에 누가 서 있는가. 타구가 향한 곳의 야수를 여기서 찾는다.
    this.byPos = {};
    for (const b of team.lineup) if (!this.byPos[b.position]) this.byPos[b.position] = b;
    this.errors = 0;
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

/** 상황에 맞는 보직을 꺼낸다. 마무리를 5점차에 태우지 않고, 필승조를 아껴 둔다. */
function pickReliever(pool, inning, lead) {
  const pick = (role) => {
    const i = pool.findIndex(p => p.pen_role === role);
    return i < 0 ? null : pool.splice(i, 1)[0];
  };
  if (inning >= 9 && lead > 0 && lead <= 3) return pick('CL') || pick('SU') || pool.shift();
  if (inning >= 7 && Math.abs(lead) <= 3)   return pick('SU') || pick('MR') || pool.shift();  // 마무리는 9회 전용
  if (inning <= 4)                          return pick('LR') || pick('MR') || pool.shift();
  return pick('MR') || pick('LR') || pick('SU') || pool.shift();
}

function maybeChangePitcher(defn, inning, lead) {
  const cur = defn.cur;
  const isStarter = defn.pitchers.length === 1 && !defn.penDay;
  const f = fatigueOf(cur, isStarter);
  cur.fatigue = f;
  if (!defn.bullpenLeft.length) return;
  let pull = false;
  if (isStarter) {
    if (f >= 1.0) pull = true;
    else if (f >= 0.32 && inning >= 5) pull = true;
    else if (cur.r >= 6) pull = true;
  } else {
    // 불펜은 1이닝이 기본. 이닝이 넘어가면 다음 투수에게 넘긴다. 마무리는 끝까지 간다.
    const isCL = cur.p.pen_role === 'CL' && lead > 0 && lead <= 3;
    if (f >= 0.85) pull = true;
    else if (!isCL && inning > cur.entered_inning && cur.bf >= 3
             && defn.bullpenLeft.length >= 2) pull = true;
  }
  if (inning >= 9 && lead > 0 && lead <= 3
      && defn.bullpenLeft.some(p => p.pen_role === 'CL')) pull = true;

  // 잘 던지고 있으면 끝까지 간다. 노히터를 앞두고 바꾸는 감독은 없고,
  // 투구수가 적고 주자를 안 준 투수를 8회에 내리지도 않는다.
  if (isStarter && inning >= 7 && lead >= 0) {
    if (cur.h === 0 && cur.np < 132) pull = false;
    else if (inning >= 7 && cur.br <= 4 && cur.np < 110 && f < 1.35) pull = false;
  }
  if (!pull) return;
  const nxt = pickReliever(defn.bullpenLeft, inning, lead);
  if (!nxt) return;
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

function resolve(res, bbt, batter, bases, outs, off, defn, rng, desc0 = '', unearnedInning = false) {
  const bl = off.lineFor(batter);
  const zs = z(batter.speed), zarm = z(defn.team.defense.outfield);
  const me = defn.cur;
  const scored = [];
  const bases0 = bases.occupied();          // 타석 시작 시점의 주자
  let addedOuts = 0, desc = desc0;

  if (res === K) { addedOuts = 1; desc = '삼진'; }
  else if (res === 'D3') {          // 낫아웃 — 삼진이되 아웃은 없다
    const s = forceAdvance(bases, batter, me);
    if (s) scored.push(s);
  }
  else if (res === ERR) {
    // 아웃이 될 타구를 놓쳤다. 타자는 살고, 이후 득점은 투수 책임이 아니다.
    const s = forceAdvance(bases, batter, me);
    if (s) scored.push(s);
    if (bases.r[0] === batter) bases.ue[0] = true;
    for (let i = 0; i < 3; i++) if (bases.r[i]) bases.ue[i] = true;
  }
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
      if (!desc) desc = '땅볼 아웃';
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
      if (bases0 === 3) { bl.gsl++; desc = '만루 홈런'; }
      scored.push([batter, me]); if (!desc) desc = '홈런';
    } else if (res === T3B) {
      for (const i of [2,1,0]) if (bases.r[i]) scored.push(bases.take(i));
      bases.put(2, batter, me); if (!desc) desc = '3루타';
    } else if (res === D2B) {
      if (bases.r[2]) scored.push(bases.take(2));
      if (bases.r[1]) scored.push(bases.take(1));
      if (bases.r[0]) {
        const [r1, rp1, ue1] = bases.take(0);
        const p = ADV.b2_first_scores + ADV.speed_coeff*z(r1.speed) + ADV.of_arm_coeff*zarm;
        if (rng.random() < p) scored.push([r1, rp1, ue1]); else bases.put(2, r1, rp1, ue1);
      }
      bases.put(1, batter, me); if (!desc) desc = '2루타';
    } else {
      if (bases.r[2]) scored.push(bases.take(2));
      const [r2, rp2, ue2] = bases.take(1);
      const [r1, rp1, ue1] = bases.take(0);
      if (r2) {
        const p = ADV.b1_second_scores + ADV.speed_coeff*z(r2.speed) + ADV.of_arm_coeff*zarm;
        if (rng.random() < p) scored.push([r2, rp2, ue2]);
        else if (outs < 2 && rng.random() < MISC.rundown + MISC.rundownArm * zarm) {
          addedOuts++; desc = '주루사';            // 협살에 걸렸다
        } else bases.put(2, r2, rp2, ue2);
      }
      if (r1) {
        const p = ADV.b1_first_to_third + ADV.speed_coeff*z(r1.speed) + ADV.of_arm_coeff*zarm;
        if (!bases.r[2] && rng.random() < p) bases.put(2, r1, rp1, ue1);
        else if (!bases.r[2] && outs + addedOuts < 2
                 && rng.random() < (MISC.rundown + MISC.rundownArm * zarm) * 0.6) {
          addedOuts++; desc = '주루사';
        } else bases.put(1, r1, rp1, ue1);
      }
      bases.put(0, batter, me); if (!desc) desc = '안타';
    }
  }
  for (const [runner, resp, ue] of scored) {
    off.runs++; off.lineFor(runner).run++;
    const rp = resp || me; rp.r++;
    if (!ue && !unearnedInning) rp.er++;
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
  const dims = BIP.parkDims(park);
  let unearnedInning = false;
  // 폭투·보크·낫아웃으로 들어오는 득점. 타점은 붙지 않는다.
  const scoreNow = ([runner, resp, ue]) => {
    off.runs++; off.lineFor(runner).run++;
    const rp = resp || defn.cur; rp.r++; if (!ue && !unearnedInning) rp.er++;
  };
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
    const fat = fatigueOf(pl, isStarter);
    const tto = Math.floor(pl.bf / 9);          // 타순이 한 바퀴 돌 때마다 불리해진다
    const ctx = { cStuff: PC_FATIGUE_S * fat - 0.13 * tto,
                  cCommand: PC_FATIGUE_C * fat + 0.06 * tto, byPos: defn.byPos };
    // 보크. 주자가 있을 때만.
    if (bases.occupied() && rng.random() < MISC.balk) {
      pl.bk++;
      for (const i of [2,1,0]) if (bases.r[i]) {
        if (i === 2) scoreNow(bases.take(2)); else bases.move(i, i + 1);
      }
      plays.push({ inning, half: off.half, batter: batter.name, desc: '보크', runs: 1,
                   outs, ro: off.runs, rd: defn.runs, pitcher: pl.p.name,
                   base: [bases.r[0]?bases.r[0].name:null, bases.r[1]?bases.r[1].name:null,
                          bases.r[2]?bases.r[2].name:null] });
    }
    const pc = playCount(batter, pl.p, ctx, rng);
    pl.np += pc.np;
    // 포수 뒤로 빠진 공. 막지 못하면 폭투나 포일이다.
    if (pc.events.length && bases.occupied()) {
      const c = defn.byPos.C;
      for (const ev of pc.events) {
        if (rng.random() < MISC.blockBase + MISC.blockDef * z(c ? c.fielding : 50)) continue;
        const wild = ev.wild;
        if (wild) pl.wp++; else if (c) defn.pb = (defn.pb || 0) + 1;
        for (const i of [2,1,0]) if (bases.r[i]) {
          if (i === 2) scoreNow(bases.take(2)); else bases.move(i, i + 1);
        }
        plays.push({ inning, half: off.half, batter: batter.name,
                     desc: wild ? '폭투' : '포일', runs: 0, outs, ro: off.runs, rd: defn.runs,
                     pitcher: pl.p.name, pt: ev.type,
                     base: [bases.r[0]?bases.r[0].name:null, bases.r[1]?bases.r[1].name:null,
                            bases.r[2]?bases.r[2].name:null] });
      }
    }
    let res, bbt = null, desc0 = '', ball = null, play = null;
    if (pc.res === 'IP') {
      // 볼카운트 -> 타구 질 -> 유형 -> 방향 -> 담당 야수 -> 수비 판정
      bbt = BIP.battedType(batter, pl.p, pc.quality, rng);
      ball = BIP.battedBall(bbt, batter, pc.quality, rng, dims);
      if (BIP.overFence(ball, dims)) { res = HR; desc0 = BIP.describe(ball, {}, 'HR'); }
      else {
        defn.byPos.P = pl.p;
        play = BIP.fieldIt(ball, BIP.assign(ball, defn.byPos), batter, rng);
        if (play.result === 'ERR') { res = ERR; desc0 = BIP.describe(ball, play, 'ERR'); defn.errors++; }
        else if (play.result === 'OUT') { res = OUT; desc0 = BIP.describe(ball, play, 'OUT'); }
        else {
          const nb = BIP.hitBases(ball, batter, rng);
          res = nb === 3 ? T3B : (nb === 2 ? D2B : S1B);
          desc0 = BIP.describe(ball, play, 'HIT', nb);
        }
      }
      // 인필드플라이. 1·2루가 찼고 2아웃 전이면 잡히든 놓치든 타자는 아웃이다.
      if ((res === OUT || res === ERR) && bases.r[0] && bases.r[1] && outs < 2
          && bbt === 'PU' && play && play.pos !== 'C') {
        res = OUT; desc0 = '인필드플라이';
      }
    } else if (pc.res === FOUL_OUT) {
      res = OUT; bbt = 'PU'; play = { pos: pc.dir };
      desc0 = (BIP.POS_KR_OF(pc.dir)) + ' 파울플라이';
    } else res = pc.res;
    const bl = off.lineFor(batter);
    bl.pa++; pl.bf++;
    if (res === BB) { bl.bb++; pl.bb++; }
    else if (res === HBP) { bl.hbp++; pl.hbp++; }
    else if (res === K || res === 'D3') { bl.ab++; bl.k++; pl.k++; }
    else {
      bl.ab++;
      // 실책 출루는 안타가 아니다.
      if (res !== OUT && res !== ERR) {
        bl.h++; if (res===D2B) bl.b2++; else if (res===T3B) bl.b3++; else if (res===HR) bl.hr++;
      }
    }
    // 낫아웃. 3스트라이크가 원바운드로 빠지면 타자는 뛸 수 있다.
    // 1루가 비었거나 2아웃일 때만. 삼진은 그대로 기록된다.
    let d3 = false;
    if (res === K && pc.swinging && pc.dirt && (!bases.r[0] || outs === 2)) {
      const c = defn.byPos.C;
      if (rng.random() >= MISC.blockBase + MISC.blockDef * z(c ? c.fielding : 50)) {
        const pReach = MISC.d3Reach + MISC.d3Arm * z(c ? (c.arm ?? c.fielding) : 50)
          + MISC.d3Speed * z(batter.speed);
        if (rng.random() < pReach) d3 = true;
      }
    }
    if (d3) { res = 'D3'; desc0 = '낫아웃 출루'; }
    if (res === ERR && outs === 2) unearnedInning = true;   // 이닝이 실책으로 이어졌다
    if (res !== K && res !== OUT && res !== FOUL_OUT) pl.br++;   // 출루를 허용했다
    const [ao, runs, desc] = resolve(res, bbt, batter, bases, outs, off, defn, rng, desc0, unearnedInning);
    outs += ao; pl.outs += ao;
    // 스플릿 누적: [pa,ab,h,2b,3b,hr,bb,k,rbi]
    const isAb = (res !== BB && res !== HBP);
    const isH = (res === S1B || res === D2B || res === T3B || res === HR);
    void isH;
    const add = (a) => { a[0]++; if (isAb) a[1]++; if (isH) a[2]++;
      if (res === D2B) a[3]++; if (res === T3B) a[4]++; if (res === HR) a[5]++;
      if (res === BB) a[6]++; if (res === K) a[7]++; a[8] += runs; };
    add(bl.sp[off.venue]);
    add(bl.sp[pl.p.throws]);
    const pa2 = pl.sp[defn.venue];
    pa2[0] += ao; pa2[1]++; if (isH) pa2[2]++; if (res === HR) pa2[3]++;
    if (res === BB) pa2[4]++; if (res === K) pa2[5]++; pa2[6] += runs;
    plays.push({ inning, half: off.half, batter: batter.name, bat: batter.pid,
                 pitcher: pl.p.name, desc, runs, outs, ro: off.runs, rd: defn.runs,
                 b: pc.b, s: pc.s, np: pc.np, pt: pc.type, velo: pc.velo,
                 px: r2(pc.px), pz: r2(pc.pz),
                 zone: ball ? ball.zone : null, bbt,
                 ang: ball ? r2(ball.angle) : null, dep: ball ? r2(ball.depth) : null,
                 pos: play ? play.pos : null,
                 fld: play && play.fielder ? play.fielder.name : null,
                 hard: play ? r2(1 - play.difficulty) : null,
                 base: [bases.r[0] ? bases.r[0].name : null,
                        bases.r[1] ? bases.r[1].name : null,
                        bases.r[2] ? bases.r[2].name : null] });
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
    if (pl !== wp && pl !== last && pl.entered_lead > 0 && pl.entered_lead <= 3) pl.hld = true;
  }
}

export function playGame(home, away, rng, maxInnings = 15) {
  const H = new TeamGameState(home), A = new TeamGameState(away);
  H.half = 'bottom'; A.half = 'top';
  H.venue = 'H'; A.venue = 'A';
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
