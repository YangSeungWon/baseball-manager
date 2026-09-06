// 경기 엔진: 진루 모델 + 이닝 루프 + 투수 교체 AI + 박스스코어.
const r2 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
import { z, K, BB, HBP, OUT, S1B, D2B, T3B, HR, ERR } from './pa.js';
import { playCount, FOUL_OUT, PITCH, kmh } from './pitch.js';
import * as BIP from './bip.js';
import * as RUNT from './run.js';
import * as dev from './development.js';
import * as R from './roster.js';
import { C as PACOEF } from './pa.js';
const PC_FATIGUE_S = PACOEF.fatigueStuff, PC_FATIGUE_C = PACOEF.fatigueCommand;

// 포수 뒤로 빠지는 공, 보크, 런다운. 전부 주자가 있을 때만 의미가 있다.
export const MISC = {
  blockBase: 0.845, blockDef: 0.055,      // 포수가 원바운드를 막을 확률
  d3Reach: 0.60, d3Arm: -0.070, d3Speed: 0.055,   // 낫아웃으로 살아나갈 확률
  // 구원은 한두 이닝만 던지니 아낄 이유가 없다. 공이 빠르고 힘이 실린다.
  // 대신 용량이 짧아 금방 지친다 — 그건 relieverCapacity 가 이미 한다.
  reliefStuff: 0.16, reliefCommand: 0.12, reliefVelo: 2,
  balk: 0.0025,                           // 주자 있을 때 타석당
  // 견제. 1루 주자가 있을 때만. 대부분은 아무 일도 없지만 가끔 잡히고,
  // 가끔은 던진 공이 흘러 주자가 그냥 한 베이스를 간다.
  pickOut: 0.0048, pickSpeed: -0.34, pickCommand: 0.22,
  pickErr: 0.0012, pickErrTwo: 0.30,      // 악송구 중 두 베이스까지 가는 비율
  rundown: 0.185, rundownArm: 0.045,      // 과감한 주루가 협살로 끝날 확률
};

/* 주루. 같은 출루·장타에서 실제보다 0.5점이 덜 났는데, 원인이 여기 있었다.
   주자가 실제 야구보다 덜 갔다 — 단타에 2루 주자가 홈에 들어오는 비율이
   51.6% 였다. 실제는 60% 안팎이다. */
/* 홈 이점. 엔진에 아예 없었다 — 홈 승률이 49.5% 였다 (KBO 53~54%).
   관중이 그 자리를 채운다. 기본값이 있고, 관중석이 얼마나 찼는지가 그 위에 얹힌다.
   다만 순환이 너무 세면 안 된다. 이기면 관중이 늘고 관중이 늘면 또 이기니까,
   기본을 크게 두고 관중분은 작게 둔다. */
export const HOME = { base: 0.205, crowd: 0.285, pitch: 0.55 };

export const ADV = {
  b1_first_to_third: 0.275, b1_second_scores: 0.610, b2_first_scores: 0.470,
  speed_coeff: 0.090, of_arm_coeff: -0.055,
  gidp_base: 0.400, gidp_speed: -0.055, gidp_infield: 0.030,
  sacfly_base: 0.500, gb_r3_scores: 0.330, gb_r2_to_third: 0.346, fb_r2_to_third: 0.100,
  sb_attempt_base: 0.110, sb_attempt_speed: 0.075,   // 시도. 성공은 run.js 의 시간표가 정한다
  sb_success_base: 0.688, sb_success_speed: 0.055, sb_success_arm: -0.033,
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
export const SPLIT_F = ['pa','ab','h','b2','b3','hr','bb','k','rbi','hbp'];
export const PSPLIT_F = ['outs','bf','h','hr','bb','k','r'];
const zeros = (n) => new Array(n).fill(0);
const batLine = (b) => ({ b, pa:0,ab:0,h:0,b2:0,b3:0,hr:0,bb:0,k:0,rbi:0,run:0,sb:0,cs:0,hbp:0,e:0,gsl:0,sh:0,
  sp:{ H:zeros(10), A:zeros(10), L:zeros(10), R:zeros(10), S:zeros(10) } });
const pitLine = (p) => ({ p, outs:0,bf:0,h:0,hr:0,bb:0,k:0,r:0,er:0,np:0,hbp:0,wp:0,bk:0,br:0,cold:0,fatigue:0,
                          entered_inning:0, entered_lead:0, w:false,l:false,sv:false,hld:false,
                          sp:{ H:zeros(7), A:zeros(7) } });

export const starterCapacity = (p) => 9.0 + 0.15 * p.stamina;
export const relieverCapacity = (p) => 3.0 + 0.045 * p.stamina;
/* 피로는 상대한 타자 수가 아니라 던진 공으로 쌓인다.
   한 이닝을 8구로 막은 투수와 25구로 막은 투수는 같지 않다.
   그래서 파울로 투구수를 늘리는 것이 실제로 투수를 끌어내린다.
   평균 타자당 3.75구라 기존 용량을 그대로 환산해 쓴다. */
const PER_PA = 3.75;
function fatigueOf(line, isStarter) {
  const cap = (isStarter ? starterCapacity(line.p) : relieverCapacity(line.p)) * PER_PA;
  const span = (isStarter ? 10.0 : 4.0) * PER_PA;
  return Math.max(0, Math.min(1.5, (line.np - cap) / span));
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
    // 자기 포지션이 아니라 오늘 선 자리 기준이다.
    for (const b of team.lineup) { const s = b.slot || b.position;
      if (!this.byPos[s]) this.byPos[s] = b; }
    this.bench = [...(team.bench || [])];
    this.hurt = [];                            // 이 경기에서 맞고 다친 선수
    this.usedBench = new Set();
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

function maybeChangePitcher(defn, inning, lead, outs) {
  const cur = defn.cur;
  const isStarter = defn.pitchers.length === 1 && !defn.penDay;
  // 교체 성향. 빠르게 내리는 감독일수록 같은 피로에서 먼저 손을 든다.
  const hook = [1.62, 1.26, 1.00, 0.79, 0.60][Math.max(0, Math.min(4, tac(defn.team, 'hook') | 0))];
  const f = fatigueOf(cur, isStarter) / hook;
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
  // 몸이 덜 풀렸다. 이닝 중간에 급히 올라온 투수는 처음 몇 타자가 위태롭다.
  nl.cold = outs > 0 ? 1 : 0;
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

function resolve(res, bbt, batter, bases, outs, off, defn, rng, desc0 = '', unearnedInning = false, velo0 = 140, ball = null, play = null, dims = null) {
  const bl = off.lineFor(batter);
  const me = defn.cur;
  const scored = [];
  const bases0 = bases.occupied();          // 타석 시작 시점의 주자
  let addedOuts = 0, desc = desc0, thr = null;   // thr: 송구가 향한 베이스들 (화면이 쓴다)

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
    if (res === HBP) {
      // 빠른 공에 맞으면 다친다. 손등, 팔꿈치, 발등.
      const v = (velo0 - 130) / 25;
      if (rng.random() < HBP_HURT.base * (1 + HBP_HURT.velo * Math.max(0, v))) {
        off.hurt.push([batter, 3 + Math.floor(rng.random() * rng.random() * 40)]);
        desc = '몸에 맞는 공 — 통증';
      }
    }
  } else if (res === OUT) {
    addedOuts = 1;
    const clock = ball && play && play.pos ? RUNT.ballClock(ball, { ...play, byPos: defn.byPos }, dims) : null;
    if (bbt === 'GB' && clock) {
      /* 땅볼 아웃 — 시간표로 정한다. 타자는 아웃이다 (수비 판정이 이미 그렇게 정했다).
         야수가 그 아웃을 어디서 잡느냐, 다른 주자는 어디까지 가느냐가 여기서 정해진다. */
      const f1 = !!bases.r[0], f2 = f1 && !!bases.r[1], f3 = f2 && !!bases.r[2];
      const noise = () => RUNT.execNoise(clock, rng);
      const tB = RUNT.runArrive(batter, 0, 1);
      const t1 = RUNT.throwArrive(clock, 1) + noise();
      const pushForced = () => { if (f3) scored.push(bases.take(2)); if (f2) bases.move(1, 2); if (f1) bases.move(0, 1); };
      if (outs === 2) {
        // 3아웃. 가장 가까운 포스. 화면에서만 다르다.
        const pos = play.pos;
        const slide = () => { if (bases.r[1] && !bases.r[2]) bases.move(1, 2); if (bases.r[0] && !bases.r[1]) bases.move(0, 1); };
        if (f2 && pos === '3B') { bases.take(1); slide(); bases.put(0, batter, me); }
        else if (f1 && (pos === 'SS' || pos === '2B')) { bases.take(0); slide(); bases.put(0, batter, me); }
        else slide();
        if (!desc) desc = '땅볼 아웃';
      } else if (f1) {
        const r1 = bases.r[0];
        const tR1 = RUNT.runArrive(r1, 1, 2);
        const t2 = RUNT.throwArrive(clock, 2) + noise();
        const forceOK = t2 < tR1 - 0.08;
        // 병살 — 2루 포스 뒤 1루 중계가 타자보다 빠른가
        const t1relay = forceOK ? t2 + RUNT.RT.relay + 27.43 / 31 + 0.1 + noise() : 99;
        const dpOK = forceOK && t1relay < tB - RUNT.RT.dpMargin;
        // 3루 주자 — 홈에서 잡을 수 있으면 홈으로 던진다 (2아웃 미만, 점수가 걸렸으니)
        const r3 = bases.r[2];
        const tH = r3 ? RUNT.throwArrive(clock, 4) + noise() : 99;
        const tR3 = r3 ? RUNT.runArrive(r3, 3, 4) : 0;
        if (r3 && !f3 && !dpOK && tH < tR3 - 0.12 && RUNT.dares(tR3, RUNT.throwArrive(clock, 4), rng)) {
          // 뛰었고, 잡혔다
          bases.take(2); if (bases.r[1]) bases.move(1, 2); bases.move(0, 1); bases.put(0, batter, me);
          desc = '홈 송구 아웃'; thr = [4];
        } else if (dpOK) {
          addedOuts = 2; bases.take(0);
          if (bases.r[2] && outs === 0) scored.push(bases.take(2));      // 병살 사이에 3루 주자는 들어온다
          if (bases.r[1] && !bases.r[2]) bases.move(1, 2);
          desc = '병살타'; thr = [2, 1];
        } else if (forceOK && (t2 - tR1) < (t1 - tB) - 0.05 + (f3 ? 0.3 : 0)) {
          // 선행 주자를 잡는 쪽이 더 확실하다. 타자는 산다.
          bases.take(0);
          if (bases.r[2]) { if (RUNT.dares(RUNT.runArrive(bases.r[2], 3, 4), t2 + 1.2, rng)) scored.push(bases.take(2)); }
          if (bases.r[1] && !bases.r[2]) bases.move(1, 2);
          bases.put(0, batter, me);
          desc = '야수선택'; thr = [2];
        } else {
          // 타자를 1루에서. 나머지는 밀린다.
          if (f3 && RUNT.wildThrow(clock, rng)) {
            // 1루 악송구 — 타자도 산다
            addedOuts = 0; pushForced(); bases.put(0, batter, me); defn.errors++;
            desc = `${BIP.POS_KR_OF(play.pos)} 송구 실책`; thr = [1];
          } else { pushForced(); thr = [1]; if (!desc) desc = desc0 || '땅볼 아웃'; }
        }
      } else {
        // 1루가 비었다. 3루 주자는 홈으로 뛸지 판단하고, 2루 주자는 3루로.
        const r3 = bases.r[2], r2 = bases.r[1];
        thr = [1];
        if (r3) {
          const tR3 = RUNT.runArrive(r3, 3, 4), tH = RUNT.throwArrive(clock, 4);
          if (RUNT.dares(tR3, tH, rng)) {
            if (tH + noise() < tR3 - 0.1 && !RUNT.wildThrow(clock, rng)) { bases.take(2); bases.put(0, batter, me); desc = '홈 송구 아웃'; thr = [4]; }
            else scored.push(bases.take(2));
          }
        }
        if (r2 && !bases.r[2] && RUNT.dares(RUNT.runArrive(r2, 2, 3), RUNT.throwArrive(clock, 3), rng)) bases.move(1, 2);
        if (!desc) desc = '땅볼 아웃';
      }
    } else if (bbt === 'GB') {
      if (!desc) desc = '땅볼 아웃';
    } else {
      /* 뜬공 아웃. 잡힌 뒤 태그업 — 주자는 송구보다 먼저 닿을 것 같으면 뛴다.
         직선타와 내야 뜬공에서는 뛰지 않는다. */
      if (bbt === 'FB' && outs < 2 && clock) {
        let drawn = false;                      // 송구는 선두 주자에게 간다
        for (const i of [2, 1, 0]) {
          const r = bases.r[i]; if (!r || bases.r[i + 1]) continue;
          const to = i + 2;
          const tRun = RUNT.runArrive(r, i + 1, to, { tag: clock.t });
          const tThrow = RUNT.throwArrive(clock, to) + (drawn ? 1.0 : 0);
          if (!RUNT.dares(tRun, tThrow, rng, RUNT.RT.tagBias)) continue;
          const exec = tThrow + RUNT.execNoise(clock, rng);
          if (!drawn) { drawn = true; thr = [to]; }
          if (exec < tRun - 0.05 && !RUNT.wildThrow(clock, rng)) {
            addedOuts++; bases.take(i); desc = `${desc || '뜬공 아웃'} — ${r.name} 태그업 아웃`;
          } else if (to === 4) { scored.push(bases.take(2)); desc = '희생플라이'; }
          else bases.move(i, i + 1);
        }
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
    } else {
      /* 안타. 타자의 베이스는 타구가 정했다(hitBases). 주자는 시간표를 본다 —
         최소한 타자만큼은 밀려 가고, 그 이상은 송구보다 먼저 닿을 것 같을 때만. */
      const nb = res === T3B ? 3 : res === D2B ? 2 : 1;
      const clock = ball && play && play.pos ? RUNT.ballClock(ball, { ...play, byPos: defn.byPos }, dims) : null;
      const infield = ball && (ball.depth < 52 || (ball.bbt === 'GB' && play && play.slack >= 0));
      const snapshot = [bases.take(2), bases.take(1), bases.take(0)];   // [R3, R2, R1]
      let drawn = false;
      const settle = (i, rec, dest) => { if (dest >= 4) scored.push(rec); else bases.put(dest - 1, rec[0], rec[1], rec[2]); };
      for (let k = 0; k < 3; k++) {
        const rec2 = snapshot[k]; if (!rec2[0]) continue;
        const from = 3 - k;                                  // 3, 2, 1
        let dest = Math.min(4, from + nb);
        // 그 위로 한 베이스 더 — 앞 베이스가 비었고, 시간이 된다면
        const ahead = dest + 1;
        if (dest < 4 && clock && !infield && !bases.r[dest] /* 앞 주자 */ ) {
          const tRun = RUNT.runArrive(rec2[0], from, ahead);
          const tThrow = RUNT.throwArrive(clock, ahead) + (drawn ? 1.0 : 0);
          if (RUNT.dares(tRun, tThrow, rng)) {
            const exec = tThrow + RUNT.execNoise(clock, rng);
            if (!drawn) { drawn = true; thr = [ahead]; }
            if (exec < tRun - 0.05 && !RUNT.wildThrow(clock, rng) && outs + addedOuts < 2) {
              addedOuts++; desc = `${desc || '안타'} — ${rec2[0].name} 주루사`; continue;
            }
            dest = ahead;
          }
        }
        // 앞 베이스에 주자가 서 있으면 그 뒤에 선다
        while (dest < 4 && bases.r[dest - 1]) dest--;
        settle(k, rec2, dest);
      }
      bases.put(nb - 1, batter, me);
      if (!desc) desc = nb === 3 ? '3루타' : nb === 2 ? '2루타' : '안타';
      if (!thr) thr = [Math.min(3, nb + 1)];
    }
  }
  for (const [runner, resp, ue] of scored) {
    off.runs++; off.lineFor(runner).run++;
    const rp = resp || me; rp.r++;
    if (!ue && !unearnedInning) rp.er++;
  }
  bl.rbi += scored.length;
  return [addedOuts, scored.length, desc, scored.map(x => x[0]), thr];
}

/* ── 감독의 결정 ──────────────────────────────────────────
   번트, 대타, 고의사구, 도루 지시. 전부 상황과 지시 성향이 함께 정한다.
   지시는 0(안 함) ~ 4(적극), 2가 보통이다. */

export const HBP_HURT = { base: 0.085, velo: 1.4 };   // 사구 부상

export const COLD = { hit: 0.30, span: 3 };   // 몸풀기 부족

export const CLUTCH = { clutch: 0.26, poise: 0.20 };   // z 단위 보정

export const TACTICS = { bunt:2, steal:2, pinch:2, hook:2, ibb:2, shift:2 };
const tac = (t, k) => (t.tactics && t.tactics[k] !== undefined ? t.tactics[k] : 2);
const TMUL = [0.05, 0.45, 1.00, 1.40, 1.85];   // 안 함 / 적게 / 보통 / 자주 / 적극
const tmul = (v) => TMUL[Math.max(0, Math.min(4, v | 0))];

export const MGR = {
  // KBO 는 희생번트가 팀-경기당 0.42 다 (2026 10구단 SAC 485 / 팀-경기 1152).
  // 최적 전략이 아니라 실제 감독이 하는 만큼을 흉내낸다 — 무사 1루의 번트는
  // 기대득점을 깎지만 한 점 낼 확률은 올린다. 감독들은 그래서 댄다.
  buntBase: 0.036, buntPower: -0.075, buntContact: 0.020,
  buntLate: 0.055, buntClose: 0.045,
  // 점수차가 벌어지면 번트는 의미를 잃는다. 뒤지면 한 점으로 안 되고,
  // 앞서면 굳이 아웃을 줄 이유가 없다. 3점차부터 급격히 줄어든다.
  buntBlowout: 0.42,
  buntSucceed: 0.760, buntHit: 0.110, buntForce: 0.090,
  pinchBase: 0.240, pinchGap: 0.055, pinchLate: 0.10,
  ibbBase: 0.070, ibbGap: 0.055,
  buntVsShift: 0.055, buntShiftHit: 0.46,
};

/** 희생번트. 약한 타자, 늦은 이닝, 접전에서 나온다. */
function tryBunt(bases, outs, off, defn, inning, rng) {
  if (outs >= 2) return null;
  const b0 = off.order[off.spot];
  // 시프트를 크게 걸면 빈 쪽으로 대는 번트가 대응이 된다. 주자가 없어도 시도한다.
  const sh = Math.abs(BIP.shiftDeg(b0, tac(defn.team, 'shift')));
  if (sh >= 11 && rng.random() < MGR.buntVsShift * (sh - 10) / 8
      * tmul(tac(off.team, 'bunt'))) return 'shift';
  const onFirst = bases.r[0] && !bases.r[1], onSecond = bases.r[1] && !bases.r[2];
  if (!onFirst && !onSecond) return null;
  const b = off.order[off.spot];
  const diff = off.runs - defn.runs;
  const ad = Math.abs(diff);
  let p = MGR.buntBase + MGR.buntPower * z(b.hr_power) + MGR.buntContact * z(b.contact)
    + (inning >= 7 ? MGR.buntLate : 0) + (ad <= 1 ? MGR.buntClose : 0);
  if (ad >= 3) p *= Math.pow(MGR.buntBlowout, ad - 2);
  if (outs === 1) p *= 0.55;
  p *= tmul(tac(off.team, 'bunt'));
  if (rng.random() >= Math.max(0, p)) return null;
  return true;
}

/** 대타. 늦은 이닝, 벤치에 확실히 나은 카드가 있을 때. */
function tryPinch(off, defn, inning, outs, bases, rng) {
  if (inning < 6) return null;
  const bench = off.bench.filter(b => !off.usedBench.has(b.pid));
  if (!bench.length) return null;
  const cur = off.order[off.spot];
  const best = bench.reduce((a, b) =>
    (b.contact + b.hr_power + b.discipline) > (a.contact + a.hr_power + a.discipline) ? b : a);
  const gap = (best.contact + best.hr_power + best.discipline
             - cur.contact - cur.hr_power - cur.discipline) / 3;
  if (gap <= 1) return null;
  const lev = (bases.occupied() ? 1 : 0) + (Math.abs(off.runs - defn.runs) <= 2 ? 1 : 0);
  let p = (MGR.pinchBase + MGR.pinchGap * gap / 10) * (1 + MGR.pinchLate * (inning - 6))
        * (0.4 + 0.3 * lev);
  p *= tmul(tac(off.team, 'pinch'));
  if (rng.random() >= p) return null;
  return best;
}

/** 고의사구. 1루가 비었고 무서운 타자일 때. */
function tryIbb(bases, outs, off, defn, rng) {
  if (bases.r[0] || !(bases.r[1] || bases.r[2])) return false;
  if (outs === 0) return false;
  const b = off.order[off.spot];
  const nx = off.order[(off.spot + 1) % 9];
  const gap = ((b.contact + b.hr_power) - (nx.contact + nx.hr_power)) / 2;
  if (gap <= 4) return false;
  let p = MGR.ibbBase + MGR.ibbGap * (gap - 4) / 10;
  p *= tmul(tac(defn.team, 'ibb'));
  return rng.random() < p;
}

/** 견제. 잡으면 아웃, 빠뜨리면 주자가 간다.
 *  득점은 반드시 scoreNow 를 거쳐야 한다 — 책임 투수와 자책 여부가 거기 붙는다.
 *  던진 것 자체는 기록에 남기지 않는다. 너무 잦다. */
function tryPickoff(bases, outs, off, defn, rng, scoreNow) {
  const r1 = bases.r[0];
  if (!r1 || outs >= 3) return [0, null];
  const pit = defn.cur;
  const zs = z(r1.speed), zc = z(pit && pit.p ? pit.p.command : 50);
  if (rng.random() < MISC.pickOut * Math.exp(MISC.pickSpeed * zs + MISC.pickCommand * zc)) {
    // 견제사는 도루자가 아니다. 기록에서 별개로 센다 — cs 에 넣으면 도루 성공률이 망가진다.
    bases.take(0); off.lineFor(r1).po = (off.lineFor(r1).po || 0) + 1;
    return [1, { desc: `${r1.name} 견제사`, runs: 0 }];
  }
  if (rng.random() < MISC.pickErr) {
    const two = rng.random() < MISC.pickErrTwo;
    let runs = 0;
    if (bases.r[2]) { scoreNow(bases.take(2)); runs++; }      // 3루 주자는 들어온다
    if (bases.r[1]) bases.move(1, 2);
    bases.move(0, two && !bases.r[1] ? 2 : 1);
    defn.errors++;
    return [0, { desc: `견제 악송구${two ? ' — 2루까지' : ''}`, runs, err: true }];
  }
  return [0, null];
}

const kmhOf = (p) => kmh(p, 'FF');
function trySteal(bases, outs, off, defn, rng) {
  const pit = defn.cur;
  const r1 = bases.r[0];
  if (!r1 || bases.r[1] || outs >= 2) return [0, null];
  const zs = z(r1.speed);
  // ABS 아래에서 포수의 값어치는 프레이밍이 아니라 어깨와 블로킹으로 간다.
  const c = defn && defn.byPos ? defn.byPos.C : null;
  const za = z(c ? (c.arm ?? c.fielding) : 50);
  if (rng.random() >= (ADV.sb_attempt_base + ADV.sb_attempt_speed*zs
      + ADV.sb_success_arm * 0.38 * za) * tmul(tac(off.team, 'steal'))) return [0, null];
  // 성공은 시간이 정한다 — 투구 시간, 포수의 팝, 송구, 주자의 발.
  const race = RUNT.stealRace(r1, c, pit && pit.p ? kmhOf(pit.p) : 142, rng);
  if (race.safe) {
    bases.move(0, 1); off.lineFor(r1).sb++;
    return [0, { desc: `${r1.name} 2루 도루`, runs: 0, steal: true }];
  }
  bases.take(0); off.lineFor(r1).cs++;
  return [1, { desc: `${r1.name} 도루 실패`, runs: 0, steal: true }];
}


/* ── 승부처 ────────────────────────────────────────────────
   감독이 실제로 손을 쓰는 순간에만 멈춘다. 매 타석 붙잡으면 게임이 아니라 일이다.
   늦은 이닝 · 한두 점 차 · 그 결정이 실제로 걸린 상황. 한 경기 세 번까지. */
export const CLUTCH_MAX = 4;
function lateClose(inning, off, defn) {
  const diff = off.runs - defn.runs;
  return inning >= 7 && Math.abs(diff) <= 2;
}
/** 지금 상황을 사람이 읽을 수 있게. 모달이 이걸 그대로 쓴다. */
function moment(kind, off, defn, inning, outs, bases, extra = {}) {
  return { kind, inning, half: extra.half || off.half, outs,
    us: off.team.name, them: defn.team.name,
    ours: off.runs, theirs: defn.runs,
    bases: [bases.r[0] ? bases.r[0].name : null, bases.r[1] ? bases.r[1].name : null,
            bases.r[2] ? bases.r[2].name : null],
    pitcher: defn.cur ? defn.cur.p.name : null, ...extra };
}

/** 주자의 달리는 속도 (m/s). 화면이 주루를 그릴 때 쓴다. 기록에도 남는다. */
const runSpeed = (r) => +(6.6 + 0.4 * z(r && r.speed ? r.speed : 50)).toFixed(2);
const names = (bases) => [bases.r[0] ? bases.r[0].name : null,
                          bases.r[1] ? bases.r[1].name : null,
                          bases.r[2] ? bases.r[2].name : null];
/** 이 플레이에서 누가 어디서 어디로 갔는가.
 *  f 는 출발 (0 타자 · 1~3 루), t 는 도착 (1~3 루 · 4 득점 · 0 아웃). */
function advOf(before, batter, bases, scored) {
  const out = [];
  const to = (r) => { const j = bases.r.indexOf(r);
    return j >= 0 ? j + 1 : (scored.includes(r) ? 4 : 0); };
  for (let i = 0; i < 3; i++) {
    const r = before[i]; if (!r) continue;
    const t = to(r);
    if (t === i + 1) continue;                     // 제자리
    out.push({ n: r.name, f: i + 1, t, v: runSpeed(r) });
  }
  if (batter) out.push({ n: batter.name, f: 0, t: to(batter), v: runSpeed(batter) });
  return out;
}

function* playHalf(off, defn, inning, park, rng, walkoff, ask = null, edge = 0) {
  const dims = BIP.parkDims(park);
  let unearnedInning = false;
  // 폭투·보크·낫아웃으로 들어오는 득점. 타점은 붙지 않는다.
  let scoredNow = [];
  const scoreNow = ([runner, resp, ue]) => {
    off.runs++; off.lineFor(runner).run++;
    const rp = resp || defn.cur; rp.r++; if (!ue && !unearnedInning) rp.er++;
    scoredNow.push(runner);
  };
  const bases = new Bases();
  let outs = 0;
  // 이 반 이닝에서 물어볼 수 있는가 — 공격이 내 팀일 때 번트·대타, 수비일 때 고의사구.
  const askOff = ask && ask.team === off.team.team_id ? ask : null;
  const askDef = ask && ask.team === defn.team.team_id ? ask : null;
  // 지켜보는 사람이 있다. 플레이마다 멈춰 서서 보여 주고 이어간다.
  const live = !!ask;
  const startRuns = off.runs;
  const plays = [];
  // 기록에 남기고, 보는 사람이 있으면 그 자리에서 보여 준다.
  function* emit(rec) { plays.push(rec); if (live) yield { play: rec }; }
  const common = () => ({ inning, half: off.half, outs, ro: off.runs, rd: defn.runs,
                          pitcher: defn.cur ? defn.cur.p.name : null, base: names(bases) });
  const sideRec = () => ({ evt: 'side', inning, half: off.half,
    off: off.team.name, def: defn.team.name,
    pos: Object.fromEntries(['C','1B','2B','3B','SS','LF','CF','RF']
      .map(k => [k, defn.byPos[k] ? defn.byPos[k].name : null])
      .concat([['P', defn.cur ? defn.cur.p.name : null]])) });
  if (live) yield { play: sideRec() };
  let before, batter0;
  const begin = () => { before = bases.r.slice(); scoredNow = []; };
  const adv = (batter) => advOf(before, batter, bases, scoredNow);

  while (outs < 3) {
    const lead = defn.runs - off.runs;
    const pit0 = defn.cur;
    maybeChangePitcher(defn, inning, lead, outs);
    if (defn.cur !== pit0) {
      // 감독이 알아서 바꿨다. 화면에는 누가 올라왔는지 보여야 한다.
      yield* emit({ ...common(), batter: off.order[off.spot].name,
        desc: `투수 교체 — ${defn.cur.p.name}`, runs: 0, sub: true, pitcher: defn.cur.p.name });
      if (live) yield { play: sideRec() };
    }
    begin();
    const [pkOut, pk] = tryPickoff(bases, outs, off, defn, rng, scoreNow);
    if (pk) {
      outs += pkOut;
      yield* emit({ ...common(), batter: off.order[off.spot].name,
                    desc: pk.desc, runs: pk.runs, pick: true, adv: adv(null) });
    }
    if (outs >= 3) break;
    begin();
    const [stOut, st] = trySteal(bases, outs, off, defn, rng);
    if (st) {
      outs += stOut;
      yield* emit({ ...common(), batter: off.order[off.spot].name,
                    desc: st.desc, runs: 0, steal: true, adv: adv(null) });
    }
    if (outs >= 3) break;

    // 대타. 한 번 나가면 원래 타자는 그날 끝이다.
    let ph = tryPinch(off, defn, inning, outs, bases, rng);
    if (askOff && askOff.left > 0 && lateClose(inning, off, defn)
        && off.bench.length && (bases.r[0] || bases.r[1] || bases.r[2])) {
      const up = off.order[off.spot], cand = off.bench.slice(0, 3);
      if (cand.length && (ph || dev.overall(cand[0]) > dev.overall(up) + 2)) {
        askOff.left--;
        const pick = yield moment('pinch', off, defn, inning, outs, bases,
          { batter: up.name, options: cand.map(b => ({ pid: b.pid, name: b.name, slot: b.position })) });
        ph = pick && pick.pid ? (cand.find(b => b.pid === pick.pid) || null) : null;
      }
    }
    if (ph) {
      const old = off.order[off.spot];
      off.order[off.spot] = ph;
      off.usedBench.add(ph.pid);
      off.bench = off.bench.filter(b => b.pid !== ph.pid);
      for (const k in off.byPos) if (off.byPos[k] === old) off.byPos[k] = ph;
      yield* emit({ ...common(), batter: ph.name, desc: `대타 ${ph.name}`, runs: 0, sub: true });
    }

    // 희생번트 (또는 시프트를 뚫는 기습번트)
    let buntKind = tryBunt(bases, outs, off, defn, inning, rng);
    if (askOff && askOff.left > 0 && lateClose(inning, off, defn)
        && outs < 2 && bases.r[0] && !bases.r[2]) {
      askOff.left--;
      const pick = yield moment('bunt', off, defn, inning, outs, bases,
        { batter: off.order[off.spot].name });
      buntKind = pick && pick.yes ? 'sac' : null;
    }
    if (buntKind) {
      begin();
      const b = off.batterUp(), bl2 = off.lineFor(b), pl2 = defn.cur;
      bl2.pa++; pl2.bf++; pl2.np += 2 + Math.floor(rng.random() * 3);
      const lead0 = bases.r[2] ? 2 : (bases.r[1] ? 1 : 0);
      const r = rng.random();
      const hitP = buntKind === 'shift' ? MGR.buntShiftHit : MGR.buntHit;
      let ao = 0, desc2, runs2 = 0;
      if (r < hitP) {                              // 기습번트가 살았다
        bl2.ab++; bl2.h++; pl2.h++; off.hits++;
        const s = forceAdvance(bases, b, pl2);
        if (s) { scoreNow(s); runs2 = 1; }
        desc2 = '번트 안타';
      } else if (r < hitP + MGR.buntForce) {       // 선행 주자가 잡혔다
        bases.take(lead0); bases.put(0, b, pl2);
        ao = 1; desc2 = '번트 실패';
      } else {                                     // 정상 처리
        bl2.sh++;
        for (const i of [2, 1, 0]) if (bases.r[i]) {
          if (i === 2) { scoreNow(bases.take(2)); runs2++; } else bases.move(i, i + 1);
        }
        ao = 1; desc2 = '희생번트';
      }
      outs += ao; pl2.outs += ao;
      // 번트는 3루 쪽 아니면 1루 쪽으로 굴린다. 어느 쪽인지는 타자 손에 따른다.
      const bang = (b.bats === 'L' ? 1 : -1) * (12 + rng.random() * 16);
      yield* emit({ ...common(), batter: b.name, bat: b.pid, bh: b.bats, th: pl2.p.throws,
                    desc: desc2, runs: runs2, bunt: true, bbt: 'GB',
                    ang: r2(bang), dep: r2(9 + rng.random() * 9), ev: 9,
                    pos: bang < 0 ? '3B' : '1B', adv: adv(b), pnp: pl2.np });
      if (outs >= 3) break;
      continue;
    }

    // 투수 교체. 승부처에서 감독이 가장 자주 쓰는 손이 이것인데
    // 지금까지 물어보지 않았다. 이것도 수비하는 쪽 결정이다.
    // 막 올라온 투수를 두고 '바꿀까' 를 묻는 것은 질문이 아니다.
    // 지쳤거나 · 맞고 있거나 · 투구수가 찼을 때만 묻는다.
    const cw = defn.cur;
    if (askDef && askDef.left > 0 && lateClose(inning, off, defn)
        && defn.bullpenLeft.length && cw && cw.bf >= 3
        && ((cw.fatigue || 0) >= 0.35 || cw.r >= 3 || cw.np >= 70)) {
      askDef.left--;
      const cur = cw, cands = defn.bullpenLeft.slice(0, 3);
      const pick = yield moment('hook', defn, off, inning, outs, bases,
        { half: off.half, batter: off.order[off.spot].name,
          tired: Math.round((cur.fatigue || 0) * 100), np: cur.np,
          cur: cur.p.name, pitcher: cur.p.name,
          options: cands.map(p => ({ pid: p.pid, name: p.name,
            slot: R.PEN_LABEL[p.pen_role] || '불펜' })) });
      if (pick && pick.pid) {
        const i = defn.bullpenLeft.findIndex(p => p.pid === pick.pid);
        if (i >= 0) {
          const nx = defn.bullpenLeft.splice(i, 1)[0];
          defn.pitchers.push(pitLine(nx));
          defn.cur.entered_inning = inning;
          yield* emit({ ...common(), batter: off.order[off.spot].name,
            desc: `투수 교체 — ${nx.name}`, runs: 0, pitcher: nx.name, sub: true });
          if (live) yield { play: sideRec() };
        }
      }
    }

    // 고의사구 — 이건 수비하는 쪽의 결정이다
    let ibb = tryIbb(bases, outs, off, defn, rng);
    if (askDef && askDef.left > 0 && lateClose(inning, off, defn)
        && !bases.r[0] && (bases.r[1] || bases.r[2]) && outs < 2) {
      askDef.left--;
      const pick = yield moment('ibb', defn, off, inning, outs, bases,
        { half: off.half, batter: off.order[off.spot].name,
          pitcher: defn.cur ? defn.cur.p.name : null,
          next: off.order[(off.spot + 1) % 9].name });
      ibb = !!(pick && pick.yes);
    }
    if (ibb) {
      begin();
      const b = off.batterUp(), bl2 = off.lineFor(b), pl2 = defn.cur;
      bl2.pa++; bl2.bb++; pl2.bf++; pl2.bb++; pl2.br++; pl2.np += 4;
      const s = forceAdvance(bases, b, pl2);
      let runs2 = 0; if (s) { scoreNow(s); runs2 = 1; }
      yield* emit({ ...common(), batter: b.name, bat: b.pid, bh: b.bats, th: pl2.p.throws,
                    desc: '고의사구', runs: runs2, ibb: true, adv: adv(b), pnp: pl2.np });
      continue;
    }
    const prevDiff = off.runs - defn.runs;
    const batter = off.batterUp();
    const pl = defn.cur;
    const isStarter = defn.pitchers.length === 1;
    const fat = fatigueOf(pl, isStarter);
    const tto = Math.floor(pl.bf / 9);          // 타순이 한 바퀴 돌 때마다 불리해진다
    // 이닝 중간에 올라온 투수는 처음 세 타자 동안 덜 풀린 값으로 던진다.
    const cold = pl.cold ? COLD.hit * Math.max(0, 1 - pl.bf / COLD.span) : 0;
    const relief = pl !== defn.pitchers[0];
    const ctx = { cStuff: PC_FATIGUE_S * fat - 0.13 * tto - cold
                    + (relief ? MISC.reliefStuff : 0),
                  cCommand: PC_FATIGUE_C * fat + 0.06 * tto - cold * 0.8
                    + (relief ? MISC.reliefCommand : 0),
                  effort: relief ? MISC.reliefVelo : 0,
                  fatigue: fat,                 // 구속이 내려간다
                  byPos: defn.byPos };
    // 보크. 주자가 있을 때만.
    if (bases.occupied() && rng.random() < MISC.balk) {
      begin();
      pl.bk++;
      for (const i of [2,1,0]) if (bases.r[i]) {
        if (i === 2) scoreNow(bases.take(2)); else bases.move(i, i + 1);
      }
      yield* emit({ ...common(), batter: batter.name, desc: '보크', runs: scoredNow.length,
                    balk: true, adv: adv(null) });
    }
    // 수비 시프트. 이 타자에게 얼마나 옮겨 설 것인가.
    const shift = BIP.shiftDeg(batter, tac(defn.team, 'shift'));
    // 승부처. 득점권에서 사람은 저마다 다르게 흔들린다.
    // 효과는 작다. 한 시즌 기록으로는 알 수 없고, 몇 해가 쌓여야 겨우 보인다.
    const risp = !!(bases.r[1] || bases.r[2]);
    if (risp) {
      const cl = (batter.hidden && batter.hidden.clutch) || 0;
      const po = (pl.p.hidden && pl.p.hidden.poise) || 0;
      ctx.cStuff += CLUTCH.poise * po;
      ctx.cCommand += CLUTCH.poise * po * 0.6;
      ctx.cBat = CLUTCH.clutch * cl;
    } else ctx.cBat = 0;
    // 홈 관중. 치는 쪽이 홈이면 조금 유리하고, 던지는 쪽이 홈이면 제구가 붙는다.
    if (edge) {
      if (off.venue === 'H') ctx.cBat += edge;
      else ctx.cCommand += edge * HOME.pitch;
    }
    begin();
    const pc = playCount(batter, pl.p, ctx, rng);
    pl.np += pc.np;
    // 포수 뒤로 빠진 공. 막지 못하면 폭투나 포일이다.
    // 타석 도중의 사건이라 타석 기록보다 먼저 남는다. 화면은 순서대로 그린다.
    if (pc.events.length && bases.occupied()) {
      const c = defn.byPos.C;
      for (const ev of pc.events) {
        if (rng.random() < MISC.blockBase + MISC.blockDef * z(c ? c.fielding : 50)) continue;
        const wild = ev.wild;
        if (wild) pl.wp++; else if (c) defn.pb = (defn.pb || 0) + 1;
        for (const i of [2,1,0]) if (bases.r[i]) {
          if (i === 2) scoreNow(bases.take(2)); else bases.move(i, i + 1);
        }
        yield* emit({ ...common(), batter: batter.name, bat: batter.pid, bh: batter.bats,
                      th: pl.p.throws,
                      desc: wild ? '폭투' : '포일', runs: scoredNow.length,
                      pt: ev.type, wild: true, adv: adv(null) });
        begin();
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
        play = BIP.fieldIt(ball, BIP.assign(ball, defn.byPos, shift), batter, rng);
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
      res = OUT; bbt = 'PU'; play = { pos: pc.dir, foul: true };
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
    const [ao, runs, desc, scoredR, thr] = resolve(res, bbt, batter, bases, outs, off, defn, rng, desc0, unearnedInning, pc.velo || 140, ball, play, dims);
    scoredNow.push(...scoredR);
    outs += ao; pl.outs += ao;
    // 스플릿 누적: [pa,ab,h,2b,3b,hr,bb,k,rbi]
    const isAb = (res !== BB && res !== HBP);
    const isH = (res === S1B || res === D2B || res === T3B || res === HR);
    void isH;
    const add = (a) => { a[0]++; if (isAb) a[1]++; if (isH) a[2]++;
      if (res === D2B) a[3]++; if (res === T3B) a[4]++; if (res === HR) a[5]++;
      if (res === BB) a[6]++; if (res === K) a[7]++; a[8] += runs;
      if (res === HBP) a[9]++; };
    add(bl.sp[off.venue]);
    add(bl.sp[pl.p.throws]);
    if (risp) add(bl.sp.S);                    // 득점권
    const pa2 = pl.sp[defn.venue];
    pa2[0] += ao; pa2[1]++; if (isH) pa2[2]++; if (res === HR) pa2[3]++;
    if (res === BB) pa2[4]++; if (res === K) pa2[5]++; pa2[6] += runs;
    yield* emit({ ...common(), batter: batter.name, bat: batter.pid, bh: batter.bats,
                 pit: pl.p.pid, th: pl.p.throws,
                 desc, runs, res,
                 b: pc.b, s: pc.s, np: pc.np, pt: pc.type, velo: pc.velo,
                 px: r2(pc.px), pz: r2(pc.pz),
                 seq: pc.seq, zh: pc.zh,        // 그 타석에 던진 공들. 존 그림이 이걸 쓴다.
                 sw: !!pc.swinging,             // 헛스윙 삼진인가
                 zone: ball ? ball.zone : null, bbt,
                 ang: ball ? r2(ball.angle) : null, dep: ball ? r2(ball.depth) : null,
                 // 타구의 물리. 체공(초) · 땅볼 속도(m/s) · 야수의 출발점과 속도.
                 hang: ball ? r2(ball.bbt === 'GB' ? ball.depth / ball.ev : ball.hang) : null,
                 ev: ball && ball.ev ? r2(ball.ev) : null,
                 pos: play ? play.pos : null,
                 fld: play && play.fielder ? play.fielder.name : null,
                 hard: play ? r2(1 - play.difficulty) : null,
                 reach: play ? play.slack >= 0 : null,
                 fpa: play && play.pa != null ? r2(play.pa) : null,
                 fpd: play && play.pd != null ? play.pd : null,
                 fv: play && play.v ? r2(play.v) : null,
                 fre: play && play.react ? r2(play.react) : null,
                 sh: r2(shift),
                 adv: adv(batter), thr,
                 pnp: pl.np, tired: Math.round(Math.min(1.5, fatigueOf(pl, isStarter)) * 100) });
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

// KBO 정규시즌은 연장 11회까지. 그 뒤로는 무승부다.
// 포스트시즌은 15회까지 간다 — 호출하는 쪽에서 넘긴다.
/** 경기를 한 판. 승부처마다 멈춰 서려면 이쪽을 쓴다.
 *  watch 에 구단 id 를 주면 그 구단의 결정 순간에 yield 하고, 받은 답으로 이어간다. */
export function* playGameGen(home, away, rng, maxInnings = 11, watch = null, fill = null) {
  // 관중석이 얼마나 찼나 → 홈이 얼마나 유리한가
  const edge = HOME.base + HOME.crowd * ((fill == null ? 0.6 : fill) - 0.6);
  const H = new TeamGameState(home), A = new TeamGameState(away);
  H.half = 'bottom'; A.half = 'top';
  H.venue = 'H'; A.venue = 'A';
  const ask = watch == null ? null : { team: watch, left: CLUTCH_MAX };
  let inning = 1;
  const plays = [];
  for (;;) {
    plays.push(...(yield* playHalf(A, H, inning, home.park, rng, false, ask, edge))[1]);
    if (inning >= 9 && H.runs > A.runs) break;
    const [walk, pl] = yield* playHalf(H, A, inning, home.park, rng, inning >= 9, ask, edge);
    plays.push(...pl);
    if (walk) break;
    if (inning >= 9 && H.runs !== A.runs) break;
    if (inning >= maxInnings) break;
    inning++;
  }
  assignDecisions(H, A);
  return [H, A, plays];
}

/** 묻지 않고 끝까지 돌린다. 지금까지의 호출부는 이걸 그대로 쓴다. */
export function playGame(home, away, rng, maxInnings = 11, fill = null) {
  const g = playGameGen(home, away, rng, maxInnings, null, fill);
  let r = g.next();
  while (!r.done) r = g.next(null);
  return r.value;
}
