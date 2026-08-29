// 스카우팅: 팀에게 틀린 정보를 준다. 오차의 72%는 리그 전체가 공유한다.
import * as dev from './development.js';

export const SIGMA_CUR_AMATEUR = 6.5, SIGMA_POT_AMATEUR = 16.0;
export const SIGMA_CUR_PRO = 2.2, SIGMA_POT_PRO = 7.0;
export const CONSENSUS_SHARE = 0.72;
export const FOREIGN_OPTIMISM = 3.4;
// 외국인은 잠재력뿐 아니라 '지금 이 리그에서 얼마나 하느냐'가 불확실하다.
// 국내 프로는 여기서 뛴 기록이 있지만, 외국인은 번역해야 한다.
export const FOREIGN_CUR_MULT = 1.95;

const clamp = (v) => Math.max(20, Math.min(80, v));

export class ScoutingDept {
  constructor(rng) {
    this.eval_current = clamp(rng.gauss(50,11));
    this.eval_potential = clamp(rng.gauss(50,12));
    this.hitting = clamp(rng.gauss(50,10));
    this.pitching = clamp(rng.gauss(50,10));
    this.bias = { speed: rng.gauss(0,2.6), hr_power: rng.gauss(0,2.6),
      stuff: rng.gauss(0,2.6), contact: rng.gauss(0,1.8),
      command: rng.gauss(0,1.8), discipline: rng.gauss(0,2.2) };
    this.memory = new Map();
    this.looks = new Map();
  }
  _seed(p, rng) {
    if (!p.scout_consensus) {
      p.scout_consensus = {}; p.scout_consensus_pot = {};
      for (const a of dev.attrsOf(p)) { p.scout_consensus[a] = rng.gauss(0,1);
                                        p.scout_consensus_pot[a] = rng.gauss(0,1); }
    }
    if (!this.memory.has(p.pid)) {
      const cur = {}, pot = {};
      for (const a of dev.attrsOf(p)) { cur[a] = rng.gauss(0,1); pot[a] = rng.gauss(0,1); }
      this.memory.set(p.pid, { cur, pot });
    }
    return this.memory.get(p.pid);
  }
  _quality(p, which) {
    const base = which === 'cur' ? this.eval_current : this.eval_potential;
    const know = p.kind === 'B' ? this.hitting : this.pitching;
    const z = ((base-50)/10)*0.75 + ((know-50)/10)*0.25;
    return Math.max(0.45, 1.30 - 0.32*z);
  }
  observe(p, rng, n = 1) { this._seed(p, rng); this.looks.set(p.pid, (this.looks.get(p.pid) ?? 0) + n); }
  report(p, rng, isPro = false, staffMult = 1) {
    const seed = this._seed(p, rng);
    const looks = this.looks.get(p.pid) ?? 0;
    const shrink = staffMult / Math.sqrt(1 + 0.40*looks);
    const sc = (isPro ? SIGMA_CUR_PRO : SIGMA_CUR_AMATEUR) * shrink * this._quality(p,'cur')
      * (p.foreign ? FOREIGN_CUR_MULT : 1);
    const sp = (isPro ? SIGMA_POT_PRO : SIGMA_POT_AMATEUR) * shrink * this._quality(p,'pot')
      * (p.scout_difficulty ?? 1.0);
    const kc = Math.sqrt(CONSENSUS_SHARE), ki = Math.sqrt(1 - CONSENSUS_SHARE);
    // 외국인은 다른 리그 성적으로 판단한다. 그 성적은 이쪽으로 그대로 옮겨오지
    // 않는데, 보고서는 그걸 충분히 깎지 못한다. 리그 전체가 같은 방향으로 틀린다.
    const fb = p.foreign ? FOREIGN_OPTIMISM : 0;
    const estCur = {}, estPot = {};
    for (const a of dev.attrsOf(p)) {
      const b = this.bias[a] ?? 0;
      const ec = kc*p.scout_consensus[a] + ki*seed.cur[a];
      const ep = kc*p.scout_consensus_pot[a] + ki*seed.pot[a];
      estCur[a] = clamp(p[a] + ec*sc + b + fb);
      estPot[a] = clamp(Math.max(p.pot[a] + ep*sp + b*1.3 + fb, estCur[a]));
    }
    return new Report(p, estCur, estPot, sc, sp, looks);
  }
}

export class Report {
  constructor(p, estCur, estPot, sc, sp, looks) {
    this.p = p; this.estCur = estCur; this.estPot = estPot;
    this.sigmaCur = sc; this.sigmaPot = sp; this.looks = looks;
  }
  _ovr(table) {
    const saved = {};
    for (const a in table) { saved[a] = this.p[a]; this.p[a] = table[a]; }
    const o = dev.overall(this.p);
    for (const a in saved) this.p[a] = saved[a];
    return o;
  }
  get ovr() { return this._ovr(this.estCur); }
  get pot() { return this._ovr(this.estPot); }
  get confidence() { return Math.max(5, Math.min(99, 100*(1 - this.sigmaPot/18))); }
  rangeOf(attr, which='cur') {
    const v = (which==='cur'?this.estCur:this.estPot)[attr];
    const s = (which==='cur'?this.sigmaCur:this.sigmaPot) * 0.9;
    return [clamp(v-s), clamp(v+s)];
  }
  ovrRange(which='cur') {
    const v = which==='cur' ? this.ovr : this.pot;
    const s = (which==='cur'?this.sigmaCur:this.sigmaPot) * 0.50;
    return [clamp(v-s), clamp(v+s)];
  }
  text() {
    const h = this.p.hidden, out = [];
    const we = h.work_ethic;
    out.push(we>=65 ? '훈련 태도가 대단히 성실하다.' : we>=52 ? '성실한 선수로 평가된다.'
      : we<38 ? '훈련 태도에 관한 우려가 있다.' : '훈련 태도는 평범하다.');
    if (h.professionalism>=65) out.push('자기 관리가 뛰어나다.');
    else if (h.professionalism<35) out.push('프로 의식에 물음표가 붙는다.');
    if (h.injury_prone>=63) out.push('부상 이력과 체질이 걱정스럽다.');
    else if (h.injury_prone<=37) out.push('몸이 튼튼하다.');
    if (this.looks<=1) out.push('관찰 기회가 적어 평가의 불확실성이 크다.');
    else if (this.looks>=3) out.push('장기간 추적 관찰한 선수다.');
    return out.join(' ');
  }
}
