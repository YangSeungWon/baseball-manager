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

/* ── 모음 ──────────────────────────────────────────────────
   말은 못 만들어도 모음은 만들 수 있다. 목소리는 성대의 톱니파를 포먼트
   대역 셋으로 거른 것이고, 모음마다 그 대역이 다르다. 한글 음절에서 모음만
   뽑아 부르면 "김! 도! 영!" 이 "이! 오! 어!" 로 들린다 — 멀리서 듣는 떼창은
   실제로 딱 그만큼만 들린다. */
const FORMANT = {                       // [F1, F2, F3] — 남성 평균
  a: [730, 1090, 2440], eo: [600, 1000, 2300], o: [570, 840, 2410], u: [300, 870, 2240],
  eu: [400, 1500, 2400], i: [270, 2290, 3010], e: [530, 1840, 2480],
};
// 한글 중성 21개 → 기본 모음. 이중모음은 끝나는 소리로 친다 (ㅑ→ㅏ, ㅝ→ㅓ, ㅢ→ㅣ).
const JUNG = ['a','e','a','e','eo','e','eo','e','o','a','e','e','o','u','eo','e','i','u','eu','i','i'];
export function vowelOf(ch) {
  const c = ch.codePointAt(0) - 0xAC00;
  if (c < 0 || c > 11171) return null;
  return JUNG[Math.floor(c / 28) % 21];
}
/** 구호 → 음절 열. '!' '~' 는 앞 음절을 늘이고, 띄어쓰기는 쉼이다. */
export function syllables(text) {
  const out = [];
  for (const ch of String(text || '')) {
    const v = vowelOf(ch);
    if (v) out.push({ v, len: 1 });
    else if ((ch === '!' || ch === '~') && out.length) out[out.length - 1].len += ch === '~' ? 1.5 : 0.5;
    else if (ch === ' ' && out.length && out[out.length - 1].v) out.push({ v: null, len: 0.5 });
  }
  return out;
}

export class Sfx {
  constructor() { this.ctx = null; this.on = false; this.muted = false; this.crowdG = null; this.crowdLevel = 0; }

  /** 켠다. 반드시 사용자 제스처 안에서 처음 불러야 한다. */
  enable(on) {
    this.on = on;
    if (!on) { this.stopSong(); this._stopCrowd(); return; }
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

  /** 짧은 톤. 심판 콜 대신 — 스트라이크는 높게 두 번, 볼은 낮게 한 번, 아웃은 딱 끊고, 세이프는 밝게. */
  _tone(f, dur, gain = 0.2, type = 'square', at = 0, slide = null) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 3200;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.setValueAtTime(gain, t + dur - 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  call(kind) {
    if (!this.live) return;
    if (kind === 'strike') { this._tone(1180, 0.07, 0.16); this._tone(1560, 0.09, 0.16, 'square', 0.08); }
    else if (kind === 'strike3') { this._tone(1180, 0.07, 0.2); this._tone(1560, 0.07, 0.2, 'square', 0.08); this._tone(2080, 0.16, 0.22, 'square', 0.16); }
    else if (kind === 'ball') this._tone(520, 0.11, 0.13, 'triangle');
    else if (kind === 'foul') this._tone(880, 0.05, 0.1, 'triangle');
    else if (kind === 'out') { this._tone(300, 0.12, 0.22, 'square', 0, 180); this._burst(0.05, { f: 900, q: 1.2, gain: 0.25, at: 0.0 }); }
    else if (kind === 'safe') { this._tone(1040, 0.08, 0.16, 'triangle'); this._tone(1380, 0.14, 0.16, 'triangle', 0.09); }
  }

  /** 배트에 맞았다. s 0~1 — 잘 맞을수록 낮고 굵고 길다. foul 이면 얇게.
   *  나무 배트 소리는 셋이 겹친다 — 순간의 딱(클릭), 배트의 울림(1.2k · 3.4k), 몸통의 퍽. */
  crack(s = 0.5, foul = false) {
    if (!this.live) return;
    s = clamp(s, 0, 1);
    if (foul) { this._burst(0.03, { f: 3400, q: 1.6, gain: 0.3 }); this._tone(1900, 0.04, 0.12, 'triangle', 0, 900); this._thump(320, 160, 0.04, 0.12); return; }
    this._burst(0.012, { f: 4500, q: 0.7, gain: 0.5 + s * 0.3 });                 // 클릭
    this._tone(1250 - s * 250, 0.05 + s * 0.05, 0.16 + s * 0.16, 'triangle', 0, 700);   // 배트 울림
    this._tone(3400 - s * 600, 0.03 + s * 0.02, 0.07 + s * 0.06, 'sine', 0, 2200);
    this._burst(0.04 + s * 0.05, { f: 1500 - s * 500, q: 0.8, gain: 0.3 + s * 0.35 });
    this._thump(200 - s * 60, 60, 0.06 + s * 0.1, 0.3 + s * 0.6);                  // 몸통
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

  /** 관중석. level 0~1 이 그날의 관중 비율이다.
   *  걸러 낸 노이즈는 바람 소리다. 관중은 목소리다 — 톱니파 열두 개를 저마다 다른
   *  음높이로 내고, 사람 목소리의 포먼트 대역 셋으로 거른다. 천천히 흔들리는
   *  음량이 웅성거림을 만들고, 함성은 그 목소리들이 같이 높아지는 것이다. */
  crowd(level) {
    this.crowdLevel = level;
    if (!this.on || !this.ctx) return;
    if (!this.crowdG) {
      const c = this.ctx;
      const g = c.createGain(); g.gain.value = 0;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.Q.value = 0.4;
      lp.connect(g); g.connect(this.master);
      // 포먼트 셋 — '아' 에 가까운 열린 소리
      const forms = [[420, 2.2, 1.0], [900, 2.6, 0.55], [2200, 3, 0.18]].map(([f, q, w]) => {
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const wg = c.createGain(); wg.gain.value = w; bp.connect(wg); wg.connect(lp); return bp; });
      this.crowdVoices = [];
      for (let i = 0; i < 12; i++) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        const f0 = 150 + Math.random() * 260; o.frequency.value = f0;
        // 저마다 천천히 흔들린다 — 한 사람의 소리가 아니라 무리의 소리
        const lfo = c.createOscillator(); lfo.frequency.value = 0.15 + Math.random() * 0.5;
        const lg = c.createGain(); lg.gain.value = f0 * 0.03; lfo.connect(lg); lg.connect(o.frequency);
        const vg = c.createGain(); vg.gain.value = 0.06 + Math.random() * 0.05;
        const am = c.createOscillator(); am.frequency.value = 0.3 + Math.random() * 1.2;
        const ag = c.createGain(); ag.gain.value = 0.03; am.connect(ag); ag.connect(vg.gain);
        o.connect(vg); for (const bp of forms) vg.connect(bp);
        o.start(); lfo.start(); am.start();
        this.crowdVoices.push({ o, f0, lfo, am });
      }
      // 낮은 웅성거림 — 노이즈는 바닥에만 조금
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 500;
      const ng = c.createGain(); ng.gain.value = 0.35; src.connect(nf); nf.connect(ng); ng.connect(g); src.start();
      this.crowdG = g; this.crowdSrc = src; this.crowdF = lp;
    }
    this.crowdBase = 0.03 + level * 0.09;
    this.crowdG.gain.setTargetAtTime(this.crowdBase, this.ctx.currentTime, 0.8);
  }
  _stopCrowd() {
    if (this.crowdSrc) { try { this.crowdSrc.stop(); } catch {} }
    if (this.crowdVoices) for (const v of this.crowdVoices) { try { v.o.stop(); v.lfo.stop(); v.am.stop(); } catch {} }
    this.crowdG = null; this.crowdSrc = null; this.crowdVoices = null;
  }
  /** 함성. k 0~1 — 안타면 잠깐, 홈런이면 폭발한다. 목소리들이 같이 높아지고 밝아진다. */
  cheer(k = 0.5) {
    if (!this.live || !this.crowdG) return;
    const c = this.ctx, t = c.currentTime, lv = 0.4 + this.crowdLevel * 0.6;
    const peak = this.crowdBase + (0.30 + k * 1.1) * lv;
    const hold = 0.8 + k * 3.5, tail = 1.2 + k * 2.5;
    this.crowdG.gain.cancelScheduledValues(t);
    this.crowdG.gain.setTargetAtTime(peak, t, 0.09);
    this.crowdG.gain.setTargetAtTime(this.crowdBase, t + hold, tail);
    this.crowdF.frequency.setTargetAtTime(4200, t, 0.08); this.crowdF.frequency.setTargetAtTime(1800, t + hold, tail);
    // 목소리가 올라간다 — 함성은 소리가 아니라 사람들이 지르는 것
    for (const v of this.crowdVoices || []) {
      const up = v.f0 * (1.25 + k * 0.35 + Math.random() * 0.15);
      v.o.frequency.cancelScheduledValues(t);
      v.o.frequency.setTargetAtTime(up, t, 0.12 + Math.random() * 0.1);
      v.o.frequency.setTargetAtTime(v.f0, t + hold * (0.7 + Math.random() * 0.5), tail);
    }
    // 그 위에 짧은 비명 층 — 높은 목소리 몇
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 500 + Math.random() * 500;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 800; bp.Q.value = 1.5;
      const g = c.createGain(); g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.06 * (0.3 + k) * lv, t + 0.3 + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + hold * 0.8 + tail * 0.6);
      o.connect(bp); bp.connect(g); g.connect(this.master); o.start(t); o.stop(t + hold + tail);
    }
  }
  /** 조용해진다. 원정팀이 점수를 냈다. */
  hush() {
    if (!this.live || !this.crowdG) return;
    const t = this.ctx.currentTime;
    this.crowdG.gain.cancelScheduledValues(t);
    this.crowdG.gain.setTargetAtTime(this.crowdBase * 0.35, t, 0.3);
    this.crowdG.gain.setTargetAtTime(this.crowdBase, t + 3, 1.5);
  }
  /* ── 응원 ──────────────────────────────────────────────
     KBO 응원은 북 · 박수 · 나팔 · 떼창이다. 실제 응원가는 쓸 수 없으니 멜로디는
     구단 이름에서 뽑은 고유한 모티프다. 홈팀 타석 동안 돌고, 타석이 끝나면 멈춘다.
     떼창은 말이 아니라 모음 소리다 — 멀리서 들리는 관중석이 실제로 그렇다. */
  song(seed, level = 0.6, chant = '') {
    if (!this.on || !this.ctx || this.songOn === seed) return;
    this.stopSong();
    this.songOn = seed;
    // 이름 해시로 멜로디를 정한다. 5음계 위 8음, 마디 둘.
    let h = seed >>> 0; const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
    const scale = [0, 2, 4, 7, 9, 12, 14], base = 262 * Math.pow(2, Math.floor(rnd() * 5) / 12);
    const mel = []; let deg = 2;
    for (let i = 0; i < 8; i++) { deg = Math.max(0, Math.min(6, deg + Math.floor(rnd() * 5) - 2)); mel.push(base * Math.pow(2, scale[deg] / 12)); }
    mel[7] = base * Math.pow(2, scale[deg > 3 ? 5 : 0] / 12);
    const bpm = 118 + Math.floor(rnd() * 24), beat = 60 / bpm;
    const groove = Math.floor(rnd() * 3);              // 0 북-박수 / 1 북북-박수 / 2 박수 셋
    const c = this.ctx, lv = 0.35 + level * 0.65;
    const bus = c.createGain(); bus.gain.value = 0.55 * lv; bus.connect(this.master); this.songBus = bus;
    let next = c.currentTime + 0.1, step = 0;
    const kick = (t) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.25); };
    const clap = (t) => { for (let i = 0; i < 3; i++) this._burstTo(bus, 0.04, { f: 1800, q: 0.9, gain: 0.35, at: t - c.currentTime + i * 0.012 }); };
    const oh = (t, dur, f) => {                          // 떼창 — 포먼트 두 개 얹은 노이즈 (구호가 없을 때)
      for (const [ff, q, g] of [[f, 6, 0.5], [f * 2.4, 5, 0.25]]) this._burstTo(bus, dur, { f: ff, q, gain: g * 0.5, at: t - c.currentTime, attack: 0.05 }); };
    const horn = (t, f, dur) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1800; const g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.03); g.gain.setValueAtTime(0.16, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(fl); fl.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02); };
    // 구호. 음절마다 8분음표 하나, 늘임표는 더 길게. 떼창 두 마디(32박)를 구호로 채운다 —
    // 짧은 구호는 반복하고, 한 번 부르면 한 박 쉰다.
    const syl = syllables(chant), slots = new Array(32).fill(null);
    if (syl.length) { let acc = 0, i = 0, guard = 0;
      while (acc < 32 && guard++ < 200) { const x = syl[i % syl.length];
        if (x.v) slots[Math.round(acc)] = x; acc += x.len;
        if (++i % syl.length === 0) acc += 1; } }
    const tick = () => {
      if (!this.ctx || this.songOn !== seed) return;
      while (next < c.currentTime + 0.35) {
        const e = step % 16, bar = Math.floor(step / 16) % 4;   // 8분음표 16개 = 2마디, 4바퀴 주기
        if (groove === 0) { if (e % 4 === 0) kick(next); if (e % 8 === 4) clap(next); }
        else if (groove === 1) { if (e % 4 === 0 || e % 8 === 3) kick(next); if (e % 8 === 4) clap(next); }
        else { if (e % 8 === 0) kick(next); if (e % 8 === 2 || e % 8 === 4 || e % 8 === 5) clap(next); }
        if (bar < 2) { if (e % 2 === 0) horn(next, mel[(e / 2) | 0], beat * 0.9); }
        else if (syl.length) {
          const x = slots[(bar - 2) * 16 + e];
          if (x) this.sing(bus, next, beat * 0.5 * x.len * 0.95, mel[(e / 2) | 0] / 2, x.v, 0.6);
        }
        else if (e % 2 === 0 && e !== 14) oh(next, beat * 0.8, 380 + (e % 6) * 40);   // 나팔 두 마디, 떼창 두 마디
        next += beat / 2; step++;
      }
    };
    this.songTimer = setInterval(tick, 90); tick();
  }
  stopSong() {
    if (this.songTimer) clearInterval(this.songTimer); this.songTimer = null; this.songOn = null;
    if (this.songBus && this.ctx) { const b = this.songBus, t = this.ctx.currentTime; b.gain.setTargetAtTime(0, t, 0.25); setTimeout(() => { try { b.disconnect(); } catch {} }, 1500); }
    this.songBus = null;
  }
  /** 한 음절을 부른다. 목소리 넷을 조금씩 어긋나게 겹쳐 사람 여럿처럼. */
  sing(dest, t, dur, f0, vowel, gain = 0.5) {
    const c = this.ctx, F = FORMANT[vowel] || FORMANT.a;
    const mix = c.createGain(); mix.gain.value = gain; mix.connect(dest);
    for (let vI = 0; vI < 4; vI++) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const det = 1 + (vI - 1.5) * 0.012 + (Math.random() - 0.5) * 0.01;
      o.frequency.setValueAtTime(f0 * det * 1.03, t); o.frequency.exponentialRampToValueAtTime(f0 * det, t + 0.08);
      const env = c.createGain(); env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.28, t + 0.04 + vI * 0.01);
      env.gain.setValueAtTime(0.28, t + dur - 0.06); env.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(env);
      F.forEach((f, i) => { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = [9, 12, 12][i];
        const g = c.createGain(); g.gain.value = [1, 0.55, 0.22][i]; env.connect(bp); bp.connect(g); g.connect(mix); });
      o.start(t); o.stop(t + dur + 0.02);
    }
  }
  _burstTo(dest, dur, { f = 1500, q = 1, gain = 0.5, type = 'bandpass', at = 0, attack = 0.003 } = {}) {
    const c = this.ctx, t = c.currentTime + Math.max(0, at);
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(dest); src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  }

  destroy() { this.stopSong(); this._stopCrowd(); if (this.ctx) { try { this.ctx.close(); } catch {} } this.ctx = null; }
}
