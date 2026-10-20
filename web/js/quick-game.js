import {seededRandom, makeQuickPitcher, deliverQuickPitch} from './quick-pitches.js';
export {pitchLocation} from './quick-pitches.js';
// Ten pitches, one decision. Rendering never participates in scoring.
export const PITCH_COUNT = 10;
export const PERFECT_MS = 65;
export const HIT_MS = 150;
export const FEEDBACK_MS = 1050;
export const WINDUP_MS = 700;

// Zone half-width/half-height are both 1. The ball's center determines the call.
export const inQuickZone = ({x, z}) => Math.abs(x) <= 1 && Math.abs(z) <= 1;

export function makePitches(seed, pitcher = makeQuickPitcher(seed)) {
  const random = seededRandom(seed);
  const shuffle = values => {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  };
  // The first two are easy four-seamers. Then all six pitch families appear.
  const types = ['FF', 'FF', ...shuffle(['FT','SL','FO','FC','FF','FT','SL','CU'])];
  const chase = new Set(shuffle(Array.from({length: 8}, (_, i) => i + 2)).slice(0, 3));
  const edges = shuffle(['left', 'right', 'high', 'low']);
  let ballIndex = 0;
  return types.map((type, i) => {
    const spread = i < 2 ? .12 : .85;
    const target = {x: (random() * 2 - 1) * spread, z: (random() * 2 - 1) * spread};
    if (chase.has(i)) {
      const edge = edges[ballIndex++], outside = 1.15 + random() * .4;
      if (edge === 'left' || edge === 'right') target.x = (edge === 'left' ? -1 : 1) * outside;
      else target.z = (edge === 'low' ? -1 : 1) * outside;
    }
    const noise = Array.from({length: 8}, () => random() * 2 - 1);
    return deliverQuickPitch(type, pitcher, target, noise, {intro: i < 2});
  });
}

export function judgePitch(pitch, offset) {
  const strike = inQuickZone(pitch);
  if (offset === null) return strike
    ? {kind: 'miss', label: '스트라이크', tip: '존 안으로 들어온 공이에요.', base: 0, offset}
    : {kind: 'take', label: '잘 참았다!', tip: '존 밖으로 빠졌어요. 좋은 판단!', base: 100, offset};
  if (!Number.isFinite(offset)) throw new Error('Invalid swing timing');
  if (!strike) return {kind: 'chase', label: '볼에 헛스윙', tip: '존 밖으로 빠지는 공은 그냥 보내세요.', base: 0, offset};
  if (Math.abs(offset) <= PERFECT_MS) return {kind: 'perfect', label: '정타!', tip: '지금 타이밍을 기억하세요.', base: 200, offset};
  if (Math.abs(offset) <= HIT_MS) return {kind: 'hit', label: offset < 0 ? '안타 · 조금 빨랐어요' : '안타 · 조금 늦었어요', tip: offset < 0 ? '다음엔 조금 더 기다려보세요.' : '다음엔 조금 더 일찍 눌러보세요.', base: 100, offset};
  return {kind: 'miss', label: offset < 0 ? '너무 빨랐어요' : '너무 늦었어요', tip: '공이 존에 도착할 때 한 번 누르세요.', base: 0, offset};
}

export class QuickGame {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.pitcher = makeQuickPitcher(this.seed);
    this.pitches = makePitches(this.seed, this.pitcher);
    this.results = [];
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
  }
  get done() { return this.results.length === PITCH_COUNT; }
  get pitch() { return this.pitches[this.results.length]; }
  resolve(offset) {
    if (this.done) throw new Error('Round already finished');
    const result = judgePitch(this.pitch, offset);
    this.combo = result.base ? this.combo + 1 : 0;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const bonus = result.base ? Math.min(4, this.combo - 1) * 25 : 0;
    const scored = {...result, points: result.base + bonus, combo: this.combo};
    this.score += scored.points;
    this.results.push(scored);
    return scored;
  }
}
