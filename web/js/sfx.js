// 소리. 파일이 없다 — 전부 그 자리에서 합성한다.
//
// 배트의 '딱' 은 짧은 노이즈와 낮은 '퍽' 이 겹친 것이고, 미트의 '팡' 은 더 짧고
// 더 낮다. 관중은 낮게 걸러 낸 노이즈다. 파일로는 '타구 소리' 하나뿐이지만,
// 합성이면 잘 맞은 타구는 낮고 굵게, 빗맞은 땅볼은 얇고 짧게 난다. 화면이
// 이미 타구 질과 구속과 관중 수를 알고 있으니, 소리도 그 값을 따른다.
//
// 브라우저는 사용자가 한 번 손대기 전에는 소리를 못 낸다. 만드는 쪽에서
// 클릭 안에서 열어 주면 된다.

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export class Sfx {
  constructor() { this.ctx = null; this.on = false; this.muted = false; this.crowdG = null; this.crowdLevel = 0; }

  /** 켠다. 반드시 사용자 제스처 안에서 처음 불러야 한다. */
  enable(on) {
    this.on = on;
    if (!on) { this._stopCrowd(); return; }
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.on = false; return; }
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
      // 노이즈 한 덩어리. 전부 여기서 잘라 쓴다.
      const n = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) {                       // 분홍빛 노이즈 — 백색보다 덜 거슬린다
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + 0.029 * w; b1 = 0.985 * b1 + 0.032 * w; b2 = 0.950 * b2 + 0.048 * w;
        d[i] = (b0 + b1 + b2 + w * 0.05) * 0.5;
      }
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.crowdLevel) this.crowd(this.crowdLevel);
  }
  /** 빠른 배속에서는 소리가 뭉개진다. 잠깐 입을 다문다. */
  mute(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); }
  get live() { return this.on && this.ctx && !this.muted; }

  _burst(dur, { f = 1500, q = 1, gain = 0.5, type = 'bandpass', sweep = null, at = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    if (sweep) flt.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  }
  _thump(f0, f1, dur, gain, at = 0) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  /** 배트에 맞았다. s 0~1 — 잘 맞을수록 낮고 굵고 길다. foul 이면 얇게. */
  crack(s = 0.5, foul = false) {
    if (!this.live) return;
    s = clamp(s, 0, 1);
    if (foul) { this._burst(0.05, { f: 2600, q: 1.2, gain: 0.35 }); this._thump(320, 160, 0.04, 0.15); return; }
    this._burst(0.035 + s * 0.05, { f: 2200 - s * 900, q: 0.9, gain: 0.45 + s * 0.4 });
    this._thump(220 - s * 60, 70, 0.05 + s * 0.09, 0.25 + s * 0.55);
  }
  /** 미트에 꽂혔다. v 0~1 — 빠를수록 크다. */
  pop(v = 0.6) {
    if (!this.live) return;
    v = clamp(v, 0, 1);
    this._burst(0.03, { f: 700 + v * 300, q: 0.8, gain: 0.25 + v * 0.35 });
    this._thump(160, 60, 0.05, 0.18 + v * 0.2);
  }
  /** 헛스윙. 바람 소리. */
  whiff() { if (this.live) this._burst(0.14, { f: 500, q: 0.7, gain: 0.16, sweep: 2200 }); }
  /** 몸에 맞았다. 둔탁하게. */
  thud() { if (!this.live) return; this._burst(0.06, { f: 300, q: 0.6, gain: 0.3, type: 'lowpass' }); this._thump(110, 50, 0.1, 0.4); }
  /** 베이스를 밟는 발. 작게. */
  step() { if (this.live) this._burst(0.03, { f: 400, q: 0.6, gain: 0.08, type: 'lowpass' }); }

  /** 관중석. level 0~1 이 그날의 관중 비율이다. 낮게 계속 웅성거린다. */
  crowd(level) {
    this.crowdLevel = level;
    if (!this.on || !this.ctx) return;
    if (!this.crowdG) {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 900; flt.Q.value = 0.5;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(flt); flt.connect(g); g.connect(this.master); src.start();
      this.crowdG = g; this.crowdSrc = src; this.crowdF = flt;
    }
    this.crowdBase = 0.02 + level * 0.06;
    this.crowdG.gain.setTargetAtTime(this.crowdBase, this.ctx.currentTime, 0.8);
  }
  _stopCrowd() { if (this.crowdSrc) { try { this.crowdSrc.stop(); } catch {} } this.crowdG = null; this.crowdSrc = null; }
  /** 함성. k 0~1 — 안타면 잠깐, 홈런이면 크게 오래. */
  cheer(k = 0.5) {
    if (!this.live || !this.crowdG) return;
    const t = this.ctx.currentTime, peak = this.crowdBase + (0.12 + k * 0.4) * (0.4 + this.crowdLevel * 0.6);
    this.crowdG.gain.cancelScheduledValues(t);
    this.crowdG.gain.setTargetAtTime(peak, t, 0.12);
    this.crowdG.gain.setTargetAtTime(this.crowdBase, t + 0.6 + k * 2.2, 0.9);
    this.crowdF.frequency.setTargetAtTime(1600, t, 0.1); this.crowdF.frequency.setTargetAtTime(900, t + 1 + k * 2, 1.2);
  }
  /** 조용해진다. 원정팀이 점수를 냈다. */
  hush() {
    if (!this.live || !this.crowdG) return;
    const t = this.ctx.currentTime;
    this.crowdG.gain.cancelScheduledValues(t);
    this.crowdG.gain.setTargetAtTime(this.crowdBase * 0.35, t, 0.3);
    this.crowdG.gain.setTargetAtTime(this.crowdBase, t + 3, 1.5);
  }
  destroy() { this._stopCrowd(); if (this.ctx) { try { this.ctx.close(); } catch {} } this.ctx = null; }
}
