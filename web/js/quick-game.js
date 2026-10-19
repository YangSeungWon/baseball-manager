// Ten pitches, one decision. Rendering never participates in scoring.
export const PITCH_COUNT = 10;
export const PERFECT_MS = 65;
export const HIT_MS = 150;
export const FEEDBACK_MS = 1050;
export const WINDUP_MS = 700;

export function makePitches(seed) {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
  // Exactly three balls, never on the first two pitches. Everyone gets seven chances to hit.
  const positions = Array.from({length: 8}, (_, i) => i + 2);
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const balls = new Set(positions.slice(0, 3));
  return Array.from({length: PITCH_COUNT}, (_, i) => ({
    strike: !balls.has(i),
    // The opening two pitches teach the timing; later pitches mix two readable speeds.
    flight: i < 2 ? 1250 : random() < .4 ? 1300 : 950,
    side: random() < .5 ? -1 : 1,
    bend: (random() - .5) * .12,
  }));
}

export function judgePitch(pitch, offset) {
  if (offset === null) return pitch.strike
    ? {kind: 'miss', label: '스트라이크', tip: '원으로 오는 공은 쳐보세요.', base: 0, offset}
    : {kind: 'take', label: '잘 참았다!', tip: '원 밖의 공. 좋은 판단이에요.', base: 100, offset};
  if (!Number.isFinite(offset)) throw new Error('Invalid swing timing');
  if (!pitch.strike) return {kind: 'chase', label: '볼에 헛스윙', tip: '원 밖으로 빠지는 공은 그냥 보내세요.', base: 0, offset};
  if (Math.abs(offset) <= PERFECT_MS) return {kind: 'perfect', label: '정타!', tip: '지금 타이밍을 기억하세요.', base: 200, offset};
  if (Math.abs(offset) <= HIT_MS) return {kind: 'hit', label: offset < 0 ? '안타 · 조금 빨랐어요' : '안타 · 조금 늦었어요', tip: offset < 0 ? '다음엔 조금 더 기다려보세요.' : '다음엔 조금 더 일찍 눌러보세요.', base: 100, offset};
  return {kind: 'miss', label: offset < 0 ? '너무 빨랐어요' : '너무 늦었어요', tip: '공이 원에 도착할 때 한 번 누르세요.', base: 0, offset};
}

export class QuickGame {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.pitches = makePitches(this.seed);
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
