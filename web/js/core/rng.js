// 시드 가능한 난수 생성기.
// Python 의 Mersenne Twister 와 난수열은 다르지만 통계적으로 동등하다.
// 세이브에 상태를 넣어야 하므로 상태가 작고 직렬화 쉬운 xoshiro128** 을 쓴다.

export class RNG {
  constructor(seed = 1) {
    // splitmix32 로 시드를 128비트 상태로 펼친다
    let x = seed >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s = [next(), next(), next(), next()];
    this._spare = null;
  }

  get state() { return [...this.s]; }
  set state(v) { this.s = [...v]; this._spare = null; }

  _next() {
    const s = this.s;
    const rot = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;
    const result = Math.imul(rot(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t;
    s[3] = rot(s[3], 11);
    return result >>> 0;
  }

  /** [0, 1) */
  random() { return this._next() / 4294967296; }

  /** [a, b) 실수 */
  uniform(a, b) { return a + (b - a) * this.random(); }

  /** [a, b] 정수 */
  randint(a, b) { return a + Math.floor(this.random() * (b - a + 1)); }

  /** 정규분포 (Box-Muller, 여분 값 캐시) */
  gauss(mu = 0, sigma = 1) {
    if (this._spare !== null) {
      const v = this._spare; this._spare = null;
      return mu + sigma * v;
    }
    let u = 0, v = 0, s = 0;
    do {
      u = this.random() * 2 - 1;
      v = this.random() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    this._spare = v * m;
    return mu + sigma * u * m;
  }

  choice(arr) { return arr[Math.floor(this.random() * arr.length)]; }

  choices(arr, weights) {
    const tot = weights.reduce((a, b) => a + b, 0);
    let r = this.random() * tot;
    for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r < 0) return arr[i]; }
    return arr[arr.length - 1];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  sample(arr, n) { return this.shuffle([...arr]).slice(0, n); }
}
