// 경기를 본다. 공 하나하나가 날아가고, 야수가 그 공을 향해 뛰고, 주자가 돈다.
//
// 시뮬레이션은 결과를 이미 정했다. 여기서는 그 결과를 '실제 시간' 으로 보여 준다 —
// ×1 이면 145km/h 직구가 0.41초에 들어오고, 뜬공은 체공 시간만큼 떠 있고,
// 야수는 엔진이 계산한 그 속도로 달린다. 잡을 수 있을지 없을지가 화면에서
// 그대로 보이도록, 던지는 공과 달리는 주자의 승부는 기록이 정한 쪽이
// 아슬아슬하게 이기게 시간을 맞춘다.
//
// 좌표는 미터다. X 는 1루 쪽이 +, Y 는 중견수 쪽, Z 는 높이.
// 두 시점 — 방송 그래픽 같은 탑다운, 홈 뒤 높은 곳에서 보는 2.5D — 은
// 같은 장면을 다르게 투영할 뿐이다.

import * as BIP from './core/bip.js';

const rad = Math.PI / 180;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, k) => a + (b - a) * k;
const W2 = (ang, dep) => [dep * Math.sin(ang * rad), dep * Math.cos(ang * rad)];
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// 베이스. 0 홈, 1~3 루. 4 는 득점 — 홈으로 돌아온다.
const BASE = [[0, 0], [19.4, 19.4], [0, 38.8], [-19.4, 19.4]];
const baseAt = (k) => BASE[k % 4];
const MOUND = [0, 18.44];
const POS_KR = { P:'투', C:'포', '1B':'1', '2B':'2', '3B':'3', SS:'유', LF:'좌', CF:'중', RF:'우' };
const PT_KR = { FF:'포심', SI:'투심', FC:'커터', SL:'슬라이더', CU:'커브',
                CH:'체인지업', FS:'포크', KN:'너클볼' };
const RES_KR = { S:'스트라이크', B:'볼', W:'헛스윙', F:'파울', X:'타격', H:'몸에 맞는 공' };

// 그라운드 색. 스타일시트의 구장 색과 같은 값이다.
const C = {
  grass:'#14301f', grassTurf:'#1a3524', grassFoul:'#122a1c', mow:'rgba(255,255,255,.045)',
  dirt:'#3a2a1c', dirtLight:'#4a3626', track:'#33251a', line:'#e8eef4',
  fence:'#93a6b6', wall:'#182432', stands:'#0d151d', seat:'#1b2836',
  sky0:'#0a1118', sky1:'#111c28', shadow:'rgba(0,0,0,.42)', skin:'#e6c3a0',
  pants:'#d5dbe3', pantsAway:'#aab4bf', ump:'#3a4450', ball:'#f7f9fb', ballEdge:'#c9a227',
  trail:'rgba(255,212,94,.55)',
};

/* ── 시점 ────────────────────────────────────────────────── */

/** 탑다운. 방송 그래픽처럼 반경을 완만히 압축해 내야에 자리를 준다. */
class TopView {
  constructor() { this.W = 364; this.H = 300; this.HX = 182; this.HY = 266;
    this.RPOW = 0.70; this.RK = 252 / Math.pow(136, this.RPOW); }
  aspect() { return this.W / this.H; }
  // 그 깊이에서 1m 가 몇 px 인가
  mpx(dep) { return (Math.pow(dep + 1, this.RPOW) - Math.pow(dep, this.RPOW)) * this.RK; }
  proj(X, Y, Z = 0) {
    const dep = Math.hypot(X, Y), ang = Math.atan2(X, Y);
    const r = Math.pow(Math.max(0, dep), this.RPOW) * this.RK;
    const s = this.mpx(dep);
    const gx = this.HX + r * Math.sin(ang), gy = this.HY - r * Math.cos(ang);
    // 높이는 위로 띄운다. 그림자는 땅에 남는다.
    return { x: gx, y: gy - Z * s * 0.55, gx, gy, s, depth: 200 - Y, z: Z };
  }
  ballR(p) { return clamp(2.6 + p.z * 0.11, 2.6, 7.5); }
  figH(p) { return clamp(p.s * 3.4, 9, 15); }
}

/** 2.5D. 홈플레이트 뒤 높은 자리 — 중계 카메라 하나가 딱 이 자리에 있다. */
class PerspView {
  constructor() { this.W = 640; this.H = 400; this.yc = -31; this.zc = 21; this.th = 25 * rad;
    this.F = this.W * 0.70; this.cy = this.H * 0.50; }
  aspect() { return this.W / this.H; }
  proj(X, Y, Z = 0) {
    const dy = Y - this.yc, dz = Z - this.zc;
    const depth = Math.max(4, dy * Math.cos(this.th) - dz * Math.sin(this.th));
    const cy = dy * Math.sin(this.th) + dz * Math.cos(this.th);
    const s = this.F / depth;
    const g = Y - this.yc, gz = -this.zc;
    const gdepth = Math.max(4, g * Math.cos(this.th) - gz * Math.sin(this.th));
    const gcy = g * Math.sin(this.th) + gz * Math.cos(this.th);
    return { x: this.W / 2 + X * s, y: this.cy - cy * s,
             gx: this.W / 2 + X * (this.F / gdepth), gy: this.cy - gcy * (this.F / gdepth),
             s, depth, z: Z };
  }
  ballR(p) { return clamp(p.s * 0.55, 2.2, 11); }
  figH(p) { return clamp(p.s * 1.85 * 1.15, 10, 44); }
}

/* ── 타임라인 ────────────────────────────────────────────── */
class Timeline {
  constructor() { this.items = []; this.end = 0; this.t = 0; }
  /** t0 부터 dur 동안 f(k) 를 부른다. 끝나면 done() */
  add(t0, dur, f, done = null) {
    this.items.push({ t0, dur, f, done, fin: false });
    this.end = Math.max(this.end, t0 + dur); return t0 + dur;
  }
  at(t0, f) { return this.add(t0, 0, null, f); }
  step(t) {
    this.t = t;
    for (const it of this.items) {
      if (it.fin || t < it.t0) continue;
      const k = it.dur > 0 ? clamp((t - it.t0) / it.dur, 0, 1) : 1;
      if (it.f) it.f(k);
      if (k >= 1) { it.fin = true; if (it.done) it.done(); }
    }
  }
  finish() { this.step(this.end + 1e-6); }
  get over() { return this.t >= this.end; }
}

/* ── 장면 ──────────────────────────────────────────────── */
export class LiveView {
  /**
   * opts: { home, away, park, crowd, cap, colors:{home,away}, onScore(st), onLog(rec),
   *         onCount(b,s), playerBits(pid) → html, view, speed }
   */
  constructor(root, opts) {
    this.o = opts; this.root = root;
    this.view = opts.view === 'top' ? 'top' : 'persp';
    this.speed = opts.speed || 1;
    this.paused = false;
    this.views = { top: new TopView(), persp: new PerspView() };
    this.dims = BIP.parkDims(opts.park);
    this.fill = opts.crowd && opts.cap ? clamp(opts.crowd / opts.cap, .08, 1) : 0.62;
    this.S = this._blank();
    this.tl = null; this.resolve = null;
    this.hist = new Map();               // 오늘 타자 성적
    this.velos = [];                     // 이 투수의 구속 추이
    this.pitName = null;
    this.seq = []; this.zh = 1;
    this.pnp0 = 0;
    this._build();
    this._last = performance.now();
    this._raf = requestAnimationFrame(() => this._frame());
  }

  _blank() {
    return { def: {}, defTeam: null, offTeam: null, half: null, inning: 0,
      fielders: {}, runners: [], batter: null, catcher: true,
      ball: null, trail: [], cap: '', capSub: '', flash: null, flashT: 0,
      pitcherWind: 0, swing: 0, b: 0, s: 0, outs: 0 };
  }

  _build() {
    this.root.innerHTML = `<div class="lv">
      <div class="lv-main">
        <div class="lv-stage ${this.view}">
          <canvas class="lv-c"></canvas>
          <div class="lv-cap"><b class="lv-cap-main"></b><span class="lv-cap-sub"></span></div>
          <div class="lv-flash"></div>
          <div class="lv-tools">
            <span class="lv-seg lv-view">
              <button data-v="persp" class="${this.view === 'persp' ? 'on' : ''}">2.5D</button>
              <button data-v="top" class="${this.view === 'top' ? 'on' : ''}">탑다운</button></span>
            <span class="lv-seg lv-spd">${[1, 2, 4, 8].map(s =>
              `<button data-s="${s}" class="${s === this.speed ? 'on' : ''}">×${s}</button>`).join('')}</span>
          </div>
          <div class="lv-ask" hidden></div>
        </div>
        <div class="lv-bar">
          <button class="quiet lv-pause">일시정지</button>
          <button class="quiet lv-skip">이 장면 건너뛰기</button>
          <span class="lv-sp"></span>
          <button class="quiet lv-end">결과로</button>
        </div>
      </div>
      <aside class="lv-side">
        <div class="lv-match">
          <div class="lv-who pit"><span class="lab">투수</span>
            <b class="lv-pn">—</b><i class="lv-ph"></i>
            <div class="lv-pitch"><em class="lv-pt">—</em><span class="lv-pv"></span></div>
            <div class="lv-pstat"><span>투구수 <b class="m lv-np">0</b></span>
              <span>최고 <b class="m lv-vmax">—</b></span>
              <span class="lv-tired"><i></i></span></div>
            <svg class="lv-spark" viewBox="0 0 120 28" preserveAspectRatio="none"></svg>
            <div class="lv-bits lv-pbits"></div>
          </div>
          <div class="lv-who bat"><span class="lab">타자</span>
            <b class="lv-bn">—</b><i class="lv-bh"></i>
            <div class="lv-today">—</div>
            <div class="lv-bits lv-bbits"></div>
          </div>
        </div>
        <div class="pzbox lv-zone"><div class="pzempty">투구 없음</div></div>
        <div class="rplog lv-log"></div>
      </aside>
    </div>`;
    const q = (s) => this.root.querySelector(s);
    this.cv = q('.lv-c'); this.ctx = this.cv.getContext('2d');
    this.stage = q('.lv-stage');
    this.el = { cap: q('.lv-cap-main'), capSub: q('.lv-cap-sub'), flash: q('.lv-flash'),
      ask: q('.lv-ask'), pn: q('.lv-pn'), ph: q('.lv-ph'), pt: q('.lv-pt'), pv: q('.lv-pv'),
      np: q('.lv-np'), vmax: q('.lv-vmax'), tired: q('.lv-tired i'), spark: q('.lv-spark'), pbits: q('.lv-pbits'),
      bn: q('.lv-bn'), bh: q('.lv-bh'), today: q('.lv-today'), bbits: q('.lv-bbits'),
      zone: q('.lv-zone'), log: q('.lv-log'), pause: q('.lv-pause') };
    this.root.querySelectorAll('[data-v]').forEach(b => b.onclick = () => this.setView(b.dataset.v));
    this.root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => this.setSpeed(+b.dataset.s));
    q('.lv-skip').onclick = () => this.skip();
    q('.lv-end').onclick = () => this.o.onEnd && this.o.onEnd();
    this.el.pause.onclick = () => this.togglePause();
    this.ro = new ResizeObserver(() => this._size());
    this.ro.observe(this.stage);
    this._size();
  }

  destroy() { cancelAnimationFrame(this._raf); this.ro.disconnect(); this._dead = true; }

  setView(v) {
    this.view = v; this.stage.classList.toggle('top', v === 'top'); this.stage.classList.toggle('persp', v !== 'top');
    this.root.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    try { localStorage.setItem('dugout.view', v); } catch {}
    this._size();
  }
  setSpeed(s) {
    this.speed = s;
    this.root.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('on', +b.dataset.s === s));
    try { localStorage.setItem('dugout.speed', s); } catch {}
  }
  togglePause() { this.paused = !this.paused; this.el.pause.textContent = this.paused ? '계속' : '일시정지'; }
  /** 지금 장면을 끝까지 돌린다 */
  skip() { if (this.tl) { this.tl.finish(); } }

  _size() {
    const V = this.views[this.view];
    const r = this.stage.getBoundingClientRect();
    // 폭에 맞추되, 세로가 화면을 넘지 않게. 남는 폭은 무대 배경으로 둔다.
    const maxH = Math.max(220, (this.o.maxH ? this.o.maxH() : window.innerHeight - 230));
    let w = Math.max(200, r.width), h = Math.round(w / V.aspect());
    if (h > maxH) { h = maxH; w = Math.round(h * V.aspect()); }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.height = h + 'px'; this.cv.style.width = w + 'px';
    this.dpr = dpr; this.cw = w; this.ch = h;
    this._bg = null;                              // 배경은 크기가 바뀔 때만 다시 그린다
  }

  /* ── 진행 ── */
  _frame() {
    if (this._dead) return;
    // rAF 의 시각 인자는 performance.now() 보다 앞설 수 있다. 한 시계만 쓴다.
    const now = performance.now();
    const dt = clamp((now - this._last) / 1000, 0, 0.1); this._last = now;
    if (this.tl && !this.paused) {
      this.tl.step(this.tl.t + dt * this.speed);
      if (this.tl.over) { const r = this.resolve; this.tl = null; this.resolve = null; if (r) r(); }
    }
    if (this.S.flash && (this.S.flashT -= dt * Math.min(this.speed, 2)) <= 0) this._flash(null);
    this._draw();
    this._raf = requestAnimationFrame(() => this._frame());
  }

  /** 한 플레이를 보여 준다. 끝나면 resolve. */
  play(rec) {
    return new Promise((res) => {
      this.resolve = res; this._rec = rec;
      const tl = new Timeline();
      try { this._script(tl, rec); }
      catch (e) { console.error(e); tl.end = Math.max(tl.end, 0.1); }
      // 장면이 끝나면 기록과 맞춘다. 건너뛰었어도 화면은 진실이어야 한다.
      if (!rec.evt) tl.at(tl.end, () => this._settle(rec));
      this.tl = tl;
      if (this.o.onLog && !rec.evt) this.o.onLog(rec);
    });
  }

  /* ── 상태 ── */
  _side(rec) {
    const S = this.S;
    const newHalf = S.half !== rec.half || S.inning !== rec.inning;
    S.half = rec.half; S.inning = rec.inning; S.def = rec.pos || S.def;
    S.defTeam = rec.def; S.offTeam = rec.off;
    if (newHalf) { S.runners = []; S.outs = 0; S.batter = null; }
    // 수비수를 자리에 세운다
    for (const pos of Object.keys(POS_KR)) {
      const sp = BIP.fielderSpot(pos, 0);
      const w = pos === 'C' ? [0, -1.6] : pos === 'P' ? MOUND : W2(sp.angle, sp.depth);
      S.fielders[pos] = { pos, name: S.def[pos] || null, x: w[0], y: w[1], home: w, alpha: 1 };
    }
    if (rec.pos && rec.pos.P && rec.pos.P !== this.pitName) { this.pitName = rec.pos.P; this.velos = []; }
    this.el.pn.textContent = rec.pos && rec.pos.P ? rec.pos.P : this.el.pn.textContent;
  }

  _defColor() { return this.S.half === 'top' ? this.o.colors.home : this.o.colors.away; }
  _offColor() { return this.S.half === 'top' ? this.o.colors.away : this.o.colors.home; }

  _flash(text, cls = '') {
    this.S.flash = text; this.S.flashT = 1.6;
    this.el.flash.textContent = text || '';
    this.el.flash.className = 'lv-flash' + (text ? ' on ' + cls : '');
  }
  _cap(main, sub = '') { this.el.cap.textContent = main || ''; this.el.capSub.textContent = sub || ''; }

  _score(delta, rec) {
    // 득점은 주자가 홈을 밟는 그 순간 올라간다
    this._runs = (this._runs || 0) + delta;
    this._emitScore(rec, this._runs);
  }
  _emitScore(rec, ro) {
    if (!this.o.onScore) return;
    const top = rec.half === 'top';
    this.o.onScore({ a: top ? ro : rec.rd, h: top ? rec.rd : ro, inn: rec.inning, half: rec.half,
      outs: this.S.outs, b: this.S.b, s: this.S.s, base: this._baseNames() });
  }
  _baseNames() {
    const out = [null, null, null];
    for (const r of this.S.runners) if (r.base >= 1 && r.base <= 3 && !r.gone && !r.wait) out[r.base - 1] = r.name;
    return out;
  }

  /* ── 대본 ─────────────────────────────────────────────────
     한 플레이의 시간표. 투구 → 타구 → 야수 → 송구 → 주루. */
  _script(tl, rec) {
    const S = this.S;
    if (rec.evt === 'start') { this._cap(`${rec.away} vs ${rec.home}`, rec.crowd ? `관중 ${rec.crowd.toLocaleString()}` : ''); tl.add(0, 1.2, null); return; }
    if (rec.evt === 'side') {
      this._side(rec);
      this._cap(`${rec.inning}회 ${rec.half === 'top' ? '초' : '말'}`, `${rec.off} 공격`);
      tl.add(0, 1.3, null); return;
    }
    // 재생(기록만 있을 때)이면 side 이벤트가 없다. 이닝이 바뀌면 여기서 세운다.
    if (S.half !== rec.half || S.inning !== rec.inning) {
      this._side({ inning: rec.inning, half: rec.half, pos: S.def, def: S.defTeam, off: S.offTeam });
      this._cap(`${rec.inning}회 ${rec.half === 'top' ? '초' : '말'}`, '');
    }
    if (rec.pitcher && rec.pitcher !== this.pitName) {
      this.pitName = rec.pitcher; this.velos = [];
      if (S.fielders.P) S.fielders.P.name = rec.pitcher;
      this.el.pn.textContent = rec.pitcher;
    }
    this._runs = (rec.ro || 0) - (rec.runs || 0);
    // 지금 서 있는 주자를 기록과 맞춘다 (재생 중 건너뛰기 등으로 틀어졌을 때)
    this._syncRunners(rec);
    this.el.ph.textContent = rec.th ? (rec.th === 'L' ? '좌완' : '우완') : '';
    if (rec.batter && !rec.sub) {
      this.el.bn.textContent = rec.batter;
      this.el.bh.textContent = rec.bh ? (rec.bh === 'L' ? '좌타' : '우타') : '';
      this.el.today.textContent = this._todayLine(rec.batter);
      if (this.o.playerBits) {
        this.el.bbits.innerHTML = rec.bat ? this.o.playerBits(rec.bat) : '';
        this.el.pbits.innerHTML = rec.pit ? this.o.playerBits(rec.pit) : '';
      }
    }
    if (rec.sub) {                                       // 대타 · 투수 교체
      this._cap(rec.desc, '');
      if (rec.pitcher && /투수 교체/.test(rec.desc)) { this.el.pn.textContent = rec.pitcher; }
      tl.add(0, 1.4, null); return;
    }
    if (rec.steal) return this._steal(tl, rec);
    if (rec.pick) return this._pickoff(tl, rec);
    if (rec.balk) { this._cap('보크', ''); this._runnersGo(tl, rec, 0.3, { walk: true }); tl.add(tl.end, 0.6, null); return; }
    if (rec.wild) return this._wild(tl, rec);
    if (rec.ibb) return this._ibb(tl, rec);
    if (rec.bunt) return this._bunt(tl, rec);
    return this._pa(tl, rec);
  }

  _syncRunners(rec) {
    // 플레이 시작 시점의 주자 = adv 의 출발점 + 기록 상 그대로 있는 주자.
    // adv 에 f 가 1~3 인 사람은 그 루에서 출발했고, base 에 있는 사람 중
    // adv 에 없는 사람은 자리를 지켰다. 둘을 합치면 시작 상태다.
    const start = [null, null, null];
    for (const a of rec.adv || []) if (a.f >= 1) start[a.f - 1] = a.n;
    (rec.base || []).forEach((n, i) => { if (n && !(rec.adv || []).some(a => a.n === n)) start[i] = n; });
    const cur = this._baseNames();
    if (start.join('|') === cur.join('|')) return;
    this.S.runners = [];
    start.forEach((n, i) => { if (n) this.S.runners.push(this._runner(n, i + 1)); });
  }
  _runner(name, base) {
    const p = baseAt(base);
    return { name, base, x: p[0], y: p[1], alpha: 1, gone: false, out: false };
  }

  _todayLine(name) {
    const h = this.hist.get(name);
    if (!h || !h.pa) return '첫 타석';
    const bits = [`${h.ab}타수 ${h.h}안타`];
    if (h.hr) bits.push(`${h.hr}홈런`); if (h.rbi) bits.push(`${h.rbi}타점`);
    if (h.bb) bits.push(`${h.bb}볼넷`); if (h.k) bits.push(`${h.k}삼진`);
    return bits.join(' · ');
  }
  _tally(rec) {
    if (!rec.batter || !rec.res) return;
    const h = this.hist.get(rec.batter) || { pa:0, ab:0, h:0, hr:0, rbi:0, bb:0, k:0 };
    h.pa++; h.rbi += rec.runs || 0;
    const r = rec.res;
    if (r === 'BB' || r === 'HBP') h.bb += r === 'BB' ? 1 : 0;
    else { h.ab++; if (['1B','2B','3B','HR'].includes(r)) h.h++; if (r === 'HR') h.hr++; if (r === 'K' || r === 'D3') h.k++; }
    this.hist.set(rec.batter, h);
  }

  /* ── 투구 ── */
  /** 공 하나. t0 에 와인드업을 시작하고, 홈에 도착하는 시각을 돌려준다. */
  _pitch(tl, q, i, t0, rec, opts = {}) {
    const S = this.S;
    const v = q.v || 140;
    const T = 16.8 / (v / 3.6);
    const rel = [(rec.th === 'L' ? 0.55 : -0.55), 16.8, 1.85];
    const zh = rec.zh || 1;
    const end = [clamp(q.x, -2.4, 2.4) * 0.216, 0, clamp(0.76 + q.z * 0.26 * zh, 0.05, 1.9)];
    const bend = { SL: [0.16, 0], CU: [0.05, 0.45], CH: [0, 0.18], FS: [0, 0.28], KN: [0.2, 0.25], SI: [-0.1, 0.08], FC: [0.08, 0.02] }[q.t] || [0, 0];
    const side = rec.th === 'L' ? -1 : 1;
    tl.add(t0, 0.9, (k) => { S.pitcherWind = k; });
    const tArr = t0 + 0.9 + T;
    tl.add(t0 + 0.9, T, (k) => {
      S.pitcherWind = 1 - k;
      const x = lerp(rel[0], end[0], k) + side * bend[0] * Math.sin(Math.PI * k) * k;
      const y = lerp(rel[1], end[1], k);
      const z = lerp(rel[2], end[2], k) + (0.25 + bend[1]) * Math.sin(Math.PI * k);
      S.ball = { x, y, z, vis: true }; S.trail = [];
    });
    // 스윙. 헛스윙·파울·타격이면 방망이가 돈다.
    if (q.r === 'W' || q.r === 'F' || q.r === 'X') tl.add(tArr - 0.16, 0.34, (k) => { S.swing = k; }, () => { S.swing = 0; });
    tl.at(tArr, () => {
      this.seq.push(q); this._zone(rec);
      this.velos.push(v); this._spark(); this.el.vmax.textContent = Math.max(...this.velos);
      this.el.pt.textContent = PT_KR[q.t] || q.t; this.el.pv.innerHTML = `${v}<i>km/h</i>`;
      this.el.np.textContent = this.pnp0 + i + 1;
      if (q.r === 'S' || q.r === 'W') S.s++;
      else if (q.r === 'F') { if (S.s < 2) S.s++; }
      else if (q.r === 'B') S.b++;
      const last = opts.last;
      if (!last) this._cap(`${i + 1}구 ${PT_KR[q.t] || q.t} ${v}`, RES_KR[q.r] + `  ${S.b}-${S.s}`);
      if (this.o.onCount) this.o.onCount(S.b, S.s);
    });
    // 결과에 따른 공의 뒷처리
    if (q.r === 'S' || q.r === 'B' || q.r === 'W') {
      tl.add(tArr, 0.12, (k) => { S.ball = { x: end[0] * 0.6, y: -1.2 * k, z: 0.6, vis: true }; }, () => { S.ball = null; });
    } else if (q.r === 'H') {
      const bx = rec.bh === 'L' ? 0.85 : -0.85;
      tl.add(tArr, 0.5, (k) => { S.ball = { x: bx + (bx > 0 ? 1 : -1) * k * 1.2, y: 0.1 - k * 0.8, z: Math.max(0.05, 1.0 - k * 1.1), vis: true }; }, () => { S.ball = null; });
    } else if (q.r === 'F') {
      // 파울. 기록에 방향이 없으니 공 번호로 정한다. 뒤로 가는 타구도 있다.
      const h = (i * 7 + Math.round(q.x * 10)) % 5;
      const back = h === 0;
      const ang = back ? (q.x > 0 ? 150 : -150) : (rec.bh === 'L' ? 1 : -1) * (h < 3 ? 52 + h * 9 : -60 - h * 6);
      const dep = back ? 9 + i : 18 + h * 12;
      const L = W2(ang, dep), Tf = back ? 0.9 : 1.3 + h * 0.15;
      tl.add(tArr, Tf, (k) => {
        S.ball = { x: L[0] * k, y: L[1] * k, z: back ? 6 * Math.sin(Math.PI * k) : 1 + 14 * k * (1 - k) * (Tf), vis: true };
        this._trail();
      }, () => { S.ball = null; S.trail = []; });
    }
    return tArr;
  }

  _trail() {
    const b = this.S.ball; if (!b) return;
    const t = this.S.trail; t.push([b.x, b.y, b.z]); if (t.length > 26) t.shift();
  }

  _zone(rec) {
    if (!this.o.zoneHtml) return;
    this.el.zone.innerHTML = this.o.zoneHtml(this.seq, rec.zh || 1);
  }
  _spark() {
    const vs = this.velos.slice(-40);
    if (vs.length < 2) { this.el.spark.innerHTML = ''; return; }
    const lo = Math.min(...vs) - 2, hi = Math.max(...vs) + 2;
    const pts = vs.map((v, i) => `${(i / (vs.length - 1) * 118 + 1).toFixed(1)},${(25 - (v - lo) / (hi - lo) * 22).toFixed(1)}`);
    this.el.spark.innerHTML = `<polyline points="${pts.join(' ')}"/>`;
    this.el.spark.title = `구속 추이 · 최고 ${Math.max(...this.velos)} · 최저 ${Math.min(...this.velos)}`;
  }

  /* ── 타석 ── */
  _pa(tl, rec) {
    const S = this.S;
    S.b = 0; S.s = 0; this.seq = []; this.zh = rec.zh || 1;
    this.pnp0 = (rec.pnp || 0) - (rec.np || 0);
    this.el.np.textContent = this.pnp0;
    if (rec.tired != null) this.el.tired.style.width = (100 - clamp(rec.tired, 0, 100)) + '%';
    S.batter = { name: rec.batter, hand: rec.bh || 'R', alpha: 1 };
    this._flash(null);
    this._cap(`${rec.batter}${rec.bh ? (rec.bh === 'L' ? ' · 좌타' : ' · 우타') : ''}`, this._todayLine(rec.batter));
    this._resetDefense(tl, rec.sh);
    this._zone(rec);
    if (this.o.onCount) this.o.onCount(0, 0);
    const seq = rec.seq && rec.seq.length ? rec.seq : [{ x: 0, z: 0, t: rec.pt || 'FF', v: rec.velo || 140, r: 'X' }];
    let t = 0.4, tArr = 0;
    seq.forEach((q, i) => {
      const last = i === seq.length - 1;
      tArr = this._pitch(tl, q, i, t, rec, { last });
      t = tArr + (q.r === 'F' ? 1.7 : q.r === 'X' ? 0 : 1.1);
    });
    const res = rec.res;
    if (res === 'K') {
      const label = rec.sw ? '헛스윙 삼진' : '루킹 삼진';
      tl.at(tArr, () => { this._cap(`${rec.batter}  ${label}`, `${seq.length}구 ${PT_KR[rec.pt] || ''} ${rec.velo || ''}`); this._flash('삼진', 'k'); this._outs(rec, 1); });
      // 타자가 사라진다 — 더그아웃으로.
      tl.add(tArr + 0.5, 0.9, (k) => { if (S.batter) S.batter.alpha = 1 - k; }, () => { S.batter = null; });
      this._tally(rec); tl.add(tl.end, 0.9, null); return;
    }
    if (res === 'BB' || res === 'HBP' || res === 'D3') {
      tl.at(tArr, () => { this._cap(`${rec.batter}  ${rec.desc}`, ''); if (res === 'HBP') this._flash('사구', 'hbp'); });
      if (res === 'D3') this._passedBall(tl, tArr, rec, true);
      this._runnersGo(tl, rec, tArr + 0.4, { jog: res !== 'D3' });
      this._tally(rec); tl.add(tl.end, 0.8, null); return;
    }
    // 인플레이 (파울플라이 포함)
    this._tally(rec);
    if (rec.ang == null && /파울플라이/.test(rec.desc || '')) return this._foulOut(tl, rec, tArr);
    if (rec.ang == null) { tl.at(tArr, () => this._cap(rec.desc, '')); tl.add(tArr, 1.2, null); return; }
    this._batted(tl, rec, tArr);
  }

  _outs(rec, n) { this.S.outs = Math.min(3, this.S.outs + n); this._emitScore(rec, this._runs); }
  _settle(rec) {
    const S = this.S;
    if (rec.outs != null) S.outs = rec.outs;
    S.ball = null; S.trail = []; S.swing = 0; S.pitcherWind = 0;
    if (rec.base) {
      const cur = this._baseNames();
      if (cur.join('|') !== rec.base.join('|')) {
        S.runners = [];
        rec.base.forEach((n, i) => { if (n) S.runners.push(this._runner(n, i + 1)); });
      }
    }
    S.b = rec.b ?? S.b; S.s = rec.s ?? S.s;
    this._emitScore(rec, rec.ro ?? this._runs);
    if (rec.pnp != null) this.el.np.textContent = rec.pnp;
  }
  /** 다음 타석 전에 야수들을 제자리로 돌려보낸다. 시프트가 있으면 그 자리로. */
  _resetDefense(tl, sh) {
    const S = this.S;
    for (const f of Object.values(S.fielders)) {
      const sp = BIP.fielderSpot(f.pos, sh || 0);
      const w = f.pos === 'C' ? [0, -1.6] : f.pos === 'P' ? MOUND : W2(sp.angle, sp.depth);
      f.home = w;
      const from = [f.x, f.y];
      if (dist2(from, w) < 0.3) { f.x = w[0]; f.y = w[1]; continue; }
      tl.add(0, 1.1, (k) => { f.x = lerp(from[0], w[0], k); f.y = lerp(from[1], w[1], k); });
    }
  }

  /** 타구. 여기가 이 화면의 심장이다. */
  _batted(tl, rec, tC) {
    const S = this.S;
    const gb = rec.bbt === 'GB';
    const L = W2(rec.ang, rec.dep);
    // 땅볼은 엔진이 쓰는 그 시간표대로 굴러간다 (hangK 보정 포함).
    const gbK = 1.319, ev = rec.ev || 26;
    const T = Math.max(0.35, gb ? rec.dep / ev * gbK : (rec.hang || 2.5));
    const hr = rec.res === 'HR';
    const out = rec.res === 'OUT', err = rec.res === 'E';
    const hit = !out && !err && !hr;
    // 정점 높이. 물리대로면 50m 를 넘는데 그러면 카메라 밖으로 나간다.
    // 엔진의 체공 시간이 여유를 얹은 값이기도 해서, 절반쯤으로 눌러 그린다.
    const peak = gb ? 0 : clamp(9.81 * T * T / 8 * 0.45, 1.5, 24);
    const fence = BIP.fence(rec.ang, this.dims);

    tl.at(tC, () => { S.batter = null; this._cap(rec.desc, gb ? '' : (rec.zone || '')); });

    // 1. 야수. 엔진이 정한 자리에서, 엔진이 정한 속도로.
    const pos = rec.pos || 'CF';
    const F = S.fielders[pos];
    const fstart = F ? [F.x, F.y] : W2(rec.fpa ?? 0, rec.fpd ?? 60);
    const fre = rec.fre ?? 0.32, fv = rec.fv ?? 6.3;
    const icptD = gb ? Math.min(rec.fpd ?? 40, rec.dep) : rec.dep;
    const icpt = gb ? W2(rec.ang, icptD) : L;
    const Ti = gb ? icptD / ev * gbK : T;      // 공이 그 지점에 오는 시각
    const fdist = dist2(fstart, icpt);
    let tF = tC + fre + fdist / fv;            // 야수가 지점에 닿는 시각
    const reach = rec.reach !== false;         // 닿았는가 — 기록이 정했다
    // 반올림으로 화면과 기록이 어긋나면 기록을 따른다. 아슬아슬하게.
    if (reach && tF > tC + Ti) tF = tC + Ti - 0.05;
    if (!reach && tF < tC + Ti + 0.15) tF = tC + Ti + 0.15;

    // 2. 공이 날아간다. 땅볼이 야수에게 닿으면 거기서 멎는다.
    const stopEarly = gb && !hr && (reach || err);
    const endPt = stopEarly ? icpt : L, Tf = stopEarly ? Ti : T;
    const flight = (k) => {
      const u = gb ? 1 - Math.pow(1 - k, 1.25) : k;
      const z = gb ? 0.15 + 0.5 * Math.abs(Math.sin(4 * Math.PI * u)) * (1 - u)
                   : 0.9 + peak * 4 * u * (1 - u);
      S.ball = { x: endPt[0] * u, y: endPt[1] * u, z, vis: true }; this._trail();
    };
    tl.add(tC, Tf, flight);
    let ballAt = L.slice();                    // 공이 처음 멎는 자리
    // 시프트. 내야수들은 이 타자에게 옮겨 서 있었다.
    if (rec.sh) for (const p of ['1B', '2B', '3B', 'SS']) {
      const f = S.fielders[p]; if (!f) continue;
      const sp = BIP.fielderSpot(p, rec.sh), w = W2(sp.angle, sp.depth);
      f.x = w[0]; f.y = w[1];
    }
    const move = (f, from, to, t0, t1) => {
      if (!f) return;
      tl.add(t0, Math.max(0.01, t1 - t0), (k) => { f.x = lerp(from[0], to[0], k); f.y = lerp(from[1], to[1], k); });
    };
    if (hr) {
      // 담장을 넘긴다. 야수는 쫓아가다 멈춘다.
      const wall = W2(rec.ang, fence - 3);
      const tw = tC + fre + dist2(fstart, wall) / fv;
      move(F, fstart, wall, tC + fre, Math.max(tw, tC + T * 0.9));
      tl.add(tC + T, 0.8, (k) => { S.ball = { x: L[0] + (L[0] - wall[0]) * 0.2 * k, y: L[1] + 6 * k, z: Math.max(0, 5 - 12 * k * k), vis: true }; },
        () => { S.ball = null; S.trail = []; });
      tl.at(tC + T * 0.85, () => { this._flash('홈런', 'hr'); });
      this._runnersGo(tl, rec, tC + 0.3, { trot: true });
      tl.add(tl.end, 1.0, null); return;
    }
    if (F) move(F, fstart, icpt, tC + fre, tF);

    let pickup = null, pickT = 0, thrower = F;
    if (reach && !err && hit && !gb) {
      // 닿았는데 떨어졌다. 공이 앞에서 튀고, 야수가 집어 든다.
      pickup = [icpt[0], icpt[1] + 2.5]; pickT = tC + T + 0.7;
      tl.add(tC + T, 0.6, (k) => { S.ball = { x: lerp(icpt[0], pickup[0], k), y: lerp(icpt[1], pickup[1], k), z: 1.2 * Math.sin(Math.PI * k) * (1 - k * 0.5), vis: true }; this._trail(); });
      tl.at(pickT, () => { S.ball = null; S.trail = []; });
    } else if (reach && !err) {
      pickup = icpt; pickT = tC + Ti;
      tl.at(pickT, () => { S.ball = null; S.trail = []; if (out && !gb) this._flash('아웃', 'out'); });
    } else if (err) {
      // 닿았는데 놓쳤다. 공이 튀어 달아난다.
      const tE = tC + Ti;
      pickup = [icpt[0] + (rec.ang > 0 ? 3 : -3), icpt[1] + 4]; pickT = tE + 1.4;
      tl.at(tE, () => this._flash('실책', 'err'));
      tl.add(tE, 1.0, (k) => { S.ball = { x: lerp(icpt[0], pickup[0], k), y: lerp(icpt[1], pickup[1], k), z: 0.6 * Math.abs(Math.sin(Math.PI * 2 * k)) * (1 - k), vis: true }; this._trail(); });
      move(F, icpt, pickup, tE + 0.3, pickT);
      tl.at(pickT, () => { S.ball = null; S.trail = []; });
    } else {
      // 빠졌다. 뜬공은 떨어져 굴러가고, 땅볼은 내야를 지나 외야로 간다.
      const rollTo = Math.min(fence - 2.5, gb ? rec.dep + 34 : rec.dep + 10 + rec.dep * 0.12);
      const R = W2(rec.ang, rollTo), Tr = gb ? 2.2 : 1.4;
      tl.add(tC + T, Tr, (k) => { const u = 1 - Math.pow(1 - k, 2);
        S.ball = { x: lerp(L[0], R[0], u), y: lerp(L[1], R[1], u), z: gb ? 0.1 : 0.4 * (1 - u) * Math.abs(Math.sin(6 * k)), vis: true }; this._trail(); });
      ballAt = R;
      // 누가 주우러 가나. 땅볼이면 가장 가까운 외야수.
      if (gb) {
        let best = null;
        for (const p of ['LF', 'CF', 'RF']) { const f = S.fielders[p]; if (!f) continue;
          const d = dist2([f.x, f.y], R); if (!best || d < best.d) best = { f, d }; }
        thrower = best ? best.f : F;
      }
      const tf0 = thrower === F ? Math.max(tF, tC + T) : tC + 0.5;
      const from = thrower === F ? icpt : [thrower.x, thrower.y];
      const tArrive = tf0 + dist2(from, R) / fv;
      pickT = Math.max(tC + T + Tr, tArrive) + 0.3; pickup = R;
      move(thrower, from, R, tf0, tArrive);
      tl.at(pickT, () => { S.ball = null; S.trail = []; });
    }

    // 3. 주루와 송구. 기록이 누가 살았는지 정했다. 화면은 그 결과가 아슬아슬하게 나오게 맞춘다.
    const adv = rec.adv || [];
    const flyOut = out && !gb;
    const outsHere = adv.filter(a => a.t === 0);
    // 뜬공 아웃이면 타자는 뛰다 만다. 나머지는 잡힌 뒤 (태그업) 출발.
    const runStart = tC + 0.25;
    if (flyOut) {
      const bat = adv.find(a => a.f === 0);
      if (bat) this._runnerClip(tl, bat, runStart, { stopAt: tC + T, fadeAt: tC + T + 0.2, out: true });
      for (const a of adv) if (a.f > 0) this._runnerClip(tl, a, a.t > a.f ? tC + T : runStart, {});
      tl.at(tC + T, () => this._outs(rec, 1));
      // 공을 내야로 돌려보낸다
      const home = F ? [F.home[0], F.home[1]] : icpt;
      this._throw(tl, icpt, BASE[2], pickT + 0.5, 1);
      move(F, icpt, home, pickT + 1.5, pickT + 1.5 + dist2(icpt, home) / 4.5);
      tl.add(tl.end, 0.9, null); return;
    }
    // 땅볼 아웃 · 병살 · 야수선택 · 안타 · 실책
    // 송구 목표: 아웃될 주자가 향하는 베이스, 먼 베이스부터. 없으면 선두 주자 앞 베이스.
    let targets = outsHere.map(a => ({ a, base: a.f + 1 })).sort((p, q) => q.base - p.base);
    if (!targets.length) {
      const lead = adv.filter(a => a.t >= 1 && a.t <= 3).sort((p, q) => q.t - p.t)[0];
      targets = [{ a: null, base: lead ? Math.min(3, lead.t + (lead.t < 3 ? 1 : 0)) : 2 }];
    }
    let tRel = pickT + (gb ? 0.45 : 0.35), from = pickup || ballAt;
    const speedIF = 33, speedOF = 29;
    const runnerArr = (a) => runStart + (a.f === 0 ? 0.2 : 0) + 27.4 * Math.max(1, (a.t || a.f + 1) - a.f) / a.v;
    const clips = new Map();
    targets.forEach((tg, i) => {
      const to = baseAt(tg.base);
      const Fl = dist2(from, to) / (thrower && ['LF', 'CF', 'RF'].includes(thrower.pos) ? speedOF : speedIF) + 0.1;
      if (tg.a) {
        // 승부. 아웃이면 공이 0.25초 먼저, 세이프면 주자가 0.3초 먼저.
        const rA = runnerArr(tg.a);
        let want = rA - 0.25;
        if (want - Fl < tRel) {                      // 공이 그렇게 빨리 못 간다 — 주자를 늦춘다
          const slow = (tRel + Fl + 0.25 - runStart) / (rA - runStart);
          clips.set(tg.a, { speedMul: 1 / Math.max(1, slow) });
          want = tRel + Fl;
        }
        tRel = Math.max(tRel, want - Fl);
      } else {
        // 아무도 안 잡힌다. 살아 들어가는 주자보다 공이 늦게 온다.
        const rA = Math.max(...adv.filter(a => a.t >= 1).map(runnerArr), tRel + Fl);
        tRel = Math.max(tRel, rA + 0.3 - Fl);
        // 하지만 내야 안타는 아슬아슬해야 한다
        const bat = adv.find(a => a.f === 0 && a.t === 1);
        if (bat && gb && reach) tRel = Math.max(pickT + 0.3, runnerArr(bat) + 0.18 - Fl);
      }
      const tArr = this._throw(tl, from, to, tRel, Fl);
      if (tg.a) {
        const a = tg.a, c = clips.get(a) || {};
        this._runnerClip(tl, a, runStart, { ...c, outAt: tArr, fadeAt: tArr + 0.25, out: true });
        tl.at(tArr, () => { this._flash(i === 0 && targets.length > 1 ? '하나' : '아웃', 'out'); this._outs(rec, 1); });
      }
      from = to; tRel = tArr + 0.35;
    });
    for (const a of adv) if (a.t !== 0) this._runnerClip(tl, a, runStart, {});
    if (targets.length === 1 && !targets[0].a && err) tl.at(tC + T + 0.2, () => {});
    tl.add(tl.end, 0.9, null);
  }

  /** 송구. 도착 시각을 돌려준다. */
  _throw(tl, from, to, t0, Fl) {
    const S = this.S;
    const d = dist2(from, to), arc = clamp(d / 14, 0.8, 4.5);
    tl.add(t0, Fl, (k) => { S.ball = { x: lerp(from[0], to[0], k), y: lerp(from[1], to[1], k), z: 1.4 + arc * 4 * k * (1 - k), vis: true }; this._trail(); },
      () => { S.ball = null; S.trail = []; });
    return t0 + Fl;
  }

  /** 주자 하나의 주루. f→t 를 베이스를 거쳐 달린다. */
  _runnerClip(tl, a, t0, o) {
    const S = this.S;
    let r = S.runners.find(x => x.name === a.n && !x.gone && x.base === a.f);
    if (!r) { r = this._runner(a.n, a.f);
      // 타자는 치기 전까지 주자가 아니다. 출발 시각까지 그리지 않는다.
      if (a.f === 0) { r.x = S.batter && S.batter.hand === 'L' ? 0.8 : -0.8; r.y = 0; r.wait = true; }
      S.runners.push(r); }
    const to = a.t === 0 ? a.f + 1 : a.t;            // 아웃이면 다음 베이스로 뛰다 잡힌다
    const legs = Math.max(1, to - a.f);
    const v = (a.v || 6.8) * (o.trot ? 1.75 : o.jog ? 1.0 : o.walk ? 0.55 : 1) * (o.speedMul || 1);
    const total = legs * 27.4, dur = total / v;
    const start = [r.x, r.y];
    const startBase = a.f;
    tl.add(t0, dur, (k) => {
      r.wait = false;
      if (r.gone || r.out) return;
      if (o.stopAt != null && tl.t >= o.stopAt) { r.moving = false; return; }
      const d = k * total;
      const leg = Math.min(legs - 1, Math.floor(d / 27.4)), u = (d - leg * 27.4) / 27.4;
      const A = leg === 0 ? start : baseAt(startBase + leg), B = baseAt(startBase + leg + 1);
      r.x = lerp(A[0], B[0], u); r.y = lerp(A[1], B[1], u); r.moving = k < 1;
    }, () => {
      if (r.out) return;
      r.base = to;
      if (a.t === 4) {
        r.gone = true; this._score(1, this._rec); this._flash('+1', 'run');
        // 홈 팀이 점수를 내면 응원석이 받는다
        if (this.o.chant && this._rec && this._rec.half === 'bottom' && this.fill > 0.45)
          this.el.capSub.textContent = this.o.chant(a.n, this._rec.inning);
      }
    });
    if (o.out) {
      const tOut = o.outAt != null ? o.outAt : (o.stopAt != null ? o.stopAt : t0 + dur);
      tl.at(tOut, () => { r.out = true; r.moving = false; });
      tl.add(o.fadeAt != null ? o.fadeAt : tOut + 0.3, 0.6, (k) => { r.alpha = 1 - k; }, () => { r.gone = true; });
    }
  }

  /** 기록된 이동을 전부 달리게 한다 (볼넷·보크·폭투·홈런). */
  _runnersGo(tl, rec, t0, o) {
    for (const a of (rec.adv || [])) this._runnerClip(tl, a, t0, o);
  }

  _foulOut(tl, rec, tArr) {
    const S = this.S;
    const side = rec.pos === '3B' || rec.pos === 'LF' ? -1 : rec.pos === 'C' ? (rec.bh === 'L' ? 1 : -1) : 1;
    const back = rec.pos === 'C';
    const L = back ? [side * 4, -9] : W2(side * (rec.pos === '1B' || rec.pos === '3B' ? 58 : 62), rec.pos === '1B' || rec.pos === '3B' ? 30 : 68);
    const T = back ? 2.6 : 3.2;
    tl.at(tArr, () => { S.batter = null; this._cap(rec.desc, ''); });
    tl.add(tArr, T, (k) => { S.ball = { x: L[0] * k, y: L[1] * k, z: 1 + 22 * k * (1 - k), vis: true }; this._trail(); }, () => { S.ball = null; S.trail = []; });
    const F = S.fielders[rec.pos];
    if (F) { const from = [F.x, F.y]; tl.add(tArr + 0.3, T - 0.35, (k) => { F.x = lerp(from[0], L[0], k); F.y = lerp(from[1], L[1], k); }); }
    tl.at(tArr + T, () => { this._flash('아웃', 'out'); this._outs(rec, 1); });
    const bat = (rec.adv || []).find(a => a.f === 0);
    if (bat) this._runnerClip(tl, bat, tArr + 0.25, { stopAt: tArr + T, fadeAt: tArr + T + 0.2, out: true });
    tl.add(tl.end, 0.9, null);
  }

  _passedBall(tl, tArr, rec, d3) {
    const S = this.S;
    const Cf = S.fielders.C;
    tl.add(tArr, 0.7, (k) => { S.ball = { x: 1.5 * k, y: -1.5 - 9 * k, z: 0.4, vis: true }; }, () => {});
    if (Cf) { tl.add(tArr + 0.2, 1.1, (k) => { Cf.x = 1.5 * k; Cf.y = -1.6 - 9 * k; });
      tl.add(tArr + 2.4, 1.2, (k) => { Cf.x = 1.5 * (1 - k); Cf.y = -10.6 + 9 * k; }); }
    if (d3) { this._throw(tl, [1.5, -10.6], BASE[1], tArr + 1.6, 1.1); }
    else tl.at(tArr + 1.4, () => { S.ball = null; });
  }

  _wild(tl, rec) {
    const S = this.S;
    this._cap(rec.desc, '');
    const q = { x: 0.4, z: -1.9, t: rec.pt || 'SL', v: 128, r: 'B' };
    const tArr = this._pitch(tl, q, this.seq.length, 0.2, rec, { last: true });
    tl.at(tArr, () => { this.seq.pop(); this._zone(rec); this._cap(rec.desc, ''); S.b = Math.max(0, S.b - 1); });
    this._passedBall(tl, tArr, rec, false);
    this._runnersGo(tl, rec, tArr + 0.3, {});
    tl.add(tl.end, 0.7, null);
  }

  _ibb(tl, rec) {
    const S = this.S; S.b = 0; S.s = 0; this.seq = [];
    S.batter = { name: rec.batter, hand: rec.bh || 'R', alpha: 1 };
    this._cap(`${rec.batter}  고의사구`, '');
    let t = 0.2, tArr = 0;
    for (let i = 0; i < 4; i++) { tArr = this._pitch(tl, { x: rec.bh === 'L' ? -2.3 : 2.3, z: 0.6, t: 'FF', v: 118, r: 'B' }, i, t, rec, { last: i === 3 }); t = tArr + 0.5; }
    this._runnersGo(tl, rec, tArr + 0.3, { jog: true });
    this._tally({ ...rec, res: 'BB' });
    tl.add(tl.end, 0.6, null);
  }

  _bunt(tl, rec) {
    const S = this.S; S.b = 0; S.s = 0; this.seq = [];
    S.batter = { name: rec.batter, hand: rec.bh || 'R', alpha: 1, bunt: true };
    const tArr = this._pitch(tl, { x: 0.1, z: -0.2, t: 'FF', v: rec.velo || 142, r: 'X' }, 0, 0.3, rec, { last: true });
    const b = { ...rec, bbt: 'GB', hang: 1.5, ev: 9, fre: 0.25, fv: 6.6, reach: true,
      fpa: BIP.POS_ANGLE[rec.pos] ?? 0, fpd: BIP.POS_DEPTH[rec.pos] ?? 30,
      res: rec.desc === '번트 안타' ? '1B' : 'OUT' };
    if (rec.desc === '번트 실패') b.res = 'OUT';
    this._batted(tl, b, tArr);
  }

  _steal(tl, rec) {
    const S = this.S;
    const a = (rec.adv || [])[0];
    this._cap(rec.desc, '');
    const q = { x: 0.3, z: 0.4, t: 'FF', v: 146, r: 'B' };
    const tArr = this._pitch(tl, q, this.seq.length, 0.2, rec, { last: true });
    tl.at(tArr, () => { this.seq.pop(); this._zone(rec); S.b = Math.max(0, S.b - 1); this._cap(rec.desc, ''); });
    if (!a) { tl.add(tArr, 0.8, null); return; }
    const r = S.runners.find(x => x.name === a.n && !x.gone) || (() => { const n = this._runner(a.n, a.f); S.runners.push(n); return n; })();
    // 리드를 3.5m 잡고 투구 동작에 출발한다
    const A = baseAt(a.f), B = baseAt(a.f + 1), d = 27.4;
    const lead = 3.5, k0 = lead / d;
    r.x = lerp(A[0], B[0], k0); r.y = lerp(A[1], B[1], k0);
    const t0 = 0.45, rA0 = t0 + (d - lead) / a.v;
    const Fl = dist2([0, -1.5], B) / 34;
    const out = a.t === 0;
    let want = out ? rA0 - 0.25 : rA0 + 0.3;
    let tRel = Math.max(tArr + 0.55, want - Fl), mul = 1;
    if (out && tRel + Fl > rA0 - 0.25) mul = (rA0 - t0) / (tRel + Fl + 0.25 - t0);
    const tHit = this._throw(tl, [0.5, -1.5], B, tRel, Fl);
    const dur = (d - lead) / (a.v * mul);
    tl.add(t0, dur, (k) => { if (r.gone) return; r.x = lerp(A[0], B[0], k0 + (1 - k0) * k); r.y = lerp(A[1], B[1], k0 + (1 - k0) * k); r.moving = k < 1; },
      () => { r.base = out ? a.f + 1 : a.t; });
    if (out) { tl.at(tHit, () => { r.out = true; this._flash('아웃', 'out'); this._outs(rec, 1); });
      tl.add(tHit + 0.3, 0.6, (k) => { r.alpha = 1 - k; }, () => { r.gone = true; }); }
    else tl.at(tHit, () => this._flash('세이프', 'safe'));
    tl.add(tl.end, 0.8, null);
  }

  _pickoff(tl, rec) {
    const S = this.S;
    const a = (rec.adv || [])[0];
    this._cap(rec.desc, '');
    const r = a ? S.runners.find(x => x.name === a.n && !x.gone) : null;
    const A = BASE[1], toward = BASE[2];
    if (r) { r.x = lerp(A[0], toward[0], 0.12); r.y = lerp(A[1], toward[1], 0.12); }
    const tHit = this._throw(tl, MOUND, A, 0.5, 0.55);
    if (r) tl.add(0.6, 0.5, (k) => { r.x = lerp(lerp(A[0], toward[0], 0.12), A[0], k); r.y = lerp(lerp(A[1], toward[1], 0.12), A[1], k); });
    if (a && a.t === 0 && r) { tl.at(tHit + 0.1, () => { r.out = true; this._flash('아웃', 'out'); this._outs(rec, 1); });
      tl.add(tHit + 0.4, 0.6, (k) => { r.alpha = 1 - k; }, () => { r.gone = true; }); }
    else if (a) { /* 악송구 */ this._runnersGo(tl, rec, tHit + 0.2, {}); }
    tl.add(tl.end, 0.7, null);
  }

  /* ── 그리기 ────────────────────────────────────────────── */
  _draw() {
    const ctx = this.ctx, V = this.views[this.view];
    if (!this.cw) return;
    const sc = this.cw / V.W * this.dpr;
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    if (!this._bg) this._bg = this._paintBg(V);
    ctx.drawImage(this._bg, 0, 0, V.W, V.H);
    const S = this.S;
    // 그림자와 사람은 멀리 있는 것부터
    const items = [];
    const defC = this._defColor(), offC = this._offColor();
    for (const f of Object.values(S.fielders)) {
      if (f.pos === 'C' && !S.catcher) continue;
      items.push({ kind: 'fig', p: V.proj(f.x, f.y), color: defC, label: f.pos, name: f.name, pose: f.pos === 'C' ? 'crouch' : f.pos === 'P' ? 'pitch' : 'field', alpha: f.alpha });
    }
    for (const r of S.runners) if (!r.gone && !r.wait) items.push({ kind: 'fig', p: V.proj(r.x, r.y), color: offC, pose: r.moving ? 'run' : 'stand', alpha: r.alpha, out: r.out, name: r.name, runner: true });
    if (S.batter) items.push({ kind: 'fig', p: V.proj(S.batter.hand === 'L' ? 0.85 : -0.85, 0.1), color: offC, pose: 'bat', hand: S.batter.hand, alpha: S.batter.alpha, swing: S.swing, bunt: S.batter.bunt });
    items.push({ kind: 'fig', p: V.proj(0, -3.2), color: C.ump, pose: 'ump', alpha: 1 });
    if (S.ball && S.ball.vis) items.push({ kind: 'ball', p: V.proj(S.ball.x, S.ball.y, S.ball.z) });
    items.sort((a, b) => b.p.depth - a.p.depth);
    // 궤적
    if (S.trail.length > 1) {
      ctx.beginPath();
      S.trail.forEach((t, i) => { const p = V.proj(t[0], t[1], t[2]); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.strokeStyle = C.trail; ctx.lineWidth = this.view === 'top' ? 1.6 : 2; ctx.lineCap = 'round'; ctx.stroke();
    }
    for (const it of items) {
      if (it.kind === 'ball') this._ball(ctx, V, it.p);
      else if (this.view === 'top') this._dot(ctx, V, it);
      else this._figure(ctx, V, it);
    }
  }

  _ball(ctx, V, p) {
    const r = V.ballR(p);
    // 그림자 — 높이 올라간 공은 그림자가 작고 흐리다
    ctx.save();
    ctx.globalAlpha = clamp(0.5 - p.z * 0.012, 0.12, 0.5);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(p.gx, p.gy, r * 0.9, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = C.ball; ctx.fill();
    ctx.lineWidth = Math.max(0.8, r * 0.18); ctx.strokeStyle = C.ballEdge; ctx.stroke();
  }

  /** 탑다운의 사람 — 점과 글자 */
  _dot(ctx, V, it) {
    const p = it.p, r = 5.4;
    ctx.save(); ctx.globalAlpha = it.alpha ?? 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = it.color; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = it.out ? '#ff6b6b' : 'rgba(255,255,255,.75)'; ctx.stroke();
    if (it.label) {
      ctx.fillStyle = '#fff'; ctx.font = '700 8px "Pretendard","Apple SD Gothic Neo",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(POS_KR[it.label] || it.label, p.x, p.y + 0.5);
    }
    if (it.out) { ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 4, p.y - 4); ctx.lineTo(p.x + 4, p.y + 4); ctx.moveTo(p.x + 4, p.y - 4); ctx.lineTo(p.x - 4, p.y + 4); ctx.stroke(); }
    ctx.restore();
  }

  /** 2.5D 의 사람. 키는 거리에 따라 줄지만, 멀어도 읽힐 만큼은 남긴다. */
  _figure(ctx, V, it) {
    const p = it.p, h = V.figH(p) * (it.pose === 'crouch' ? 0.72 : 1);
    const x = p.x, y = p.y;
    ctx.save(); ctx.globalAlpha = it.alpha ?? 1;
    ctx.fillStyle = C.shadow;
    ctx.beginPath(); ctx.ellipse(x, y, h * 0.34, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    const lw = Math.max(1.2, h * 0.1);
    // 다리
    ctx.strokeStyle = it.pose === 'ump' ? '#222a33' : C.pants; ctx.lineWidth = lw; ctx.lineCap = 'round';
    const run = it.pose === 'run' ? Math.sin(performance.now() / 70) * h * 0.14 : 0;
    ctx.beginPath();
    ctx.moveTo(x - h * 0.07 + run, y); ctx.lineTo(x - h * 0.04, y - h * 0.44);
    ctx.moveTo(x + h * 0.07 - run, y); ctx.lineTo(x + h * 0.04, y - h * 0.44);
    ctx.stroke();
    // 몸통
    const tw = h * 0.3, th = h * 0.36, ty = y - h * 0.44 - th;
    ctx.fillStyle = it.color;
    rr(ctx, x - tw / 2, ty, tw, th, tw * 0.3); ctx.fill();
    // 팔 — 자세별
    ctx.strokeStyle = it.color; ctx.lineWidth = lw * 0.9;
    ctx.beginPath();
    if (it.pose === 'bat') {
      const dir = it.hand === 'L' ? -1 : 1;                 // 방망이는 몸 뒤쪽으로
      const sw = it.swing || 0, ang = it.bunt ? 0.2 : (-1.1 + sw * 2.6) * dir;
      const bx = x + Math.cos(ang) * h * 0.55 * -dir, by = ty + th * 0.15 - Math.abs(Math.sin(ang)) * h * 0.45 - (it.bunt ? 0 : h * 0.15);
      ctx.moveTo(x, ty + th * 0.3); ctx.lineTo(x + dir * -h * 0.14, ty + th * 0.1);
      ctx.stroke();
      ctx.strokeStyle = '#c8a06a'; ctx.lineWidth = Math.max(1.2, h * 0.07);
      ctx.beginPath(); ctx.moveTo(x + dir * -h * 0.14, ty + th * 0.1); ctx.lineTo(bx, by); ctx.stroke();
    } else if (it.pose === 'pitch') {
      const w = this.S.pitcherWind;
      ctx.moveTo(x, ty + th * 0.25); ctx.lineTo(x + h * 0.22, ty - h * 0.25 * w + th * 0.3 * (1 - w)); ctx.stroke();
    } else if (it.pose === 'crouch') {
      ctx.moveTo(x - h * 0.1, ty + th * 0.4); ctx.lineTo(x - h * 0.2, ty + th * 0.9);
      ctx.moveTo(x + h * 0.1, ty + th * 0.4); ctx.lineTo(x + h * 0.2, ty + th * 0.9); ctx.stroke();
      ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.arc(x - h * 0.22, ty + th * 0.95, h * 0.09, 0, Math.PI * 2); ctx.fill();   // 미트
    } else {
      const r2 = it.pose === 'run' ? run * 1.2 : 0;
      ctx.moveTo(x - tw / 2, ty + th * 0.2); ctx.lineTo(x - tw * 0.85, ty + th * 0.75 + r2);
      ctx.moveTo(x + tw / 2, ty + th * 0.2); ctx.lineTo(x + tw * 0.85, ty + th * 0.75 - r2); ctx.stroke();
    }
    // 머리와 모자
    const hr = h * 0.115, hy = ty - hr * 0.9;
    ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(x, hy, hr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = it.pose === 'ump' ? '#111' : it.color;
    ctx.beginPath(); ctx.arc(x, hy - hr * 0.05, hr * 1.02, Math.PI, Math.PI * 2); ctx.fill();
    if (it.out) { ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2.2; ctx.beginPath();
      ctx.moveTo(x - h * 0.3, ty - h * 0.1); ctx.lineTo(x + h * 0.3, y - h * 0.3);
      ctx.moveTo(x + h * 0.3, ty - h * 0.1); ctx.lineTo(x - h * 0.3, y - h * 0.3); ctx.stroke(); }
    // 이름표 — 수비 위치는 늘, 주자는 뛸 때
    const lab = it.label ? (POS_KR[it.label] || it.label) : (it.runner && it.name ? it.name : null);
    if (lab) {
      ctx.font = `${Math.max(8, Math.min(11, h * 0.36))}px "Pretendard","Apple SD Gothic Neo",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(8,13,19,.55)';
      const tw2 = ctx.measureText(lab).width + 6;
      rr(ctx, x - tw2 / 2, y + 2, tw2, 12, 2); ctx.fill();
      ctx.fillStyle = it.runner ? '#ffe28a' : '#dfe7ef'; ctx.fillText(lab, x, y + 3);
    }
    ctx.restore();
  }

  /** 배경 — 구장. 크기가 바뀔 때만 다시 그린다. */
  _paintBg(V) {
    const c = document.createElement('canvas');
    c.width = Math.round(V.W * this.dpr * (this.cw / V.W)); c.height = Math.round(V.H * this.dpr * (this.cw / V.W));
    const ctx = c.getContext('2d');
    const sc = c.width / V.W; ctx.scale(sc, sc);
    const dims = this.dims, fence = (a) => BIP.fence(a, dims);
    const P = (X, Y, Z = 0) => V.proj(X, Y, Z);
    const path = (pts, close = true) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); if (close) ctx.closePath(); };
    const arc = (r, a0 = -45, a1 = 45, step = 2.5) => { const o = []; for (let a = a0; a <= a1 + 1e-6; a += step) { const w = W2(a, typeof r === 'function' ? r(a) : r); o.push(P(w[0], w[1])); } return o; };
    const persp = this.view !== 'top';
    const fh = dims.real ? dims.real.fH || 3 : 3;

    // 하늘 · 바닥
    if (persp) {
      const g = ctx.createLinearGradient(0, 0, 0, V.H); g.addColorStop(0, C.sky0); g.addColorStop(1, C.sky1);
      ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
    } else { ctx.fillStyle = '#0a1017'; ctx.fillRect(0, 0, V.W, V.H); }

    // 관중석. 담장 바깥의 띠. 2.5D 에서는 벽처럼 선다.
    const standD = 14 + ((this.o.park && this.o.park.capacity ? this.o.park.capacity : 18000) - 13000) / 13500 * 12;
    const outer = arc((a) => fence(a) + standD, -52, 52).reverse();
    const inner = arc((a) => fence(a), -52, 52);
    if (persp) {
      const top = []; for (let a = -52; a <= 52 + 1e-6; a += 2.5) { const w = W2(a, fence(a) + standD); top.push(P(w[0], w[1], 9 + standD * 0.35)); }
      const low = []; for (let a = -52; a <= 52 + 1e-6; a += 2.5) { const w = W2(a, fence(a)); low.push(P(w[0], w[1], fh)); }
      path(low.concat(top.slice().reverse())); ctx.fillStyle = mix(this.o.colors.home, C.stands, 0.26); ctx.fill();
      ctx.save(); path(low.concat(top.slice().reverse())); ctx.clip();
      ctx.fillStyle = this._crowdPattern(ctx, this.fill, sc); ctx.fillRect(0, 0, V.W, V.H); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; path(top, false); ctx.stroke();
    } else {
      path(inner.concat(outer)); ctx.fillStyle = mix(this.o.colors.home, C.stands, 0.26); ctx.fill();
      ctx.save(); path(inner.concat(outer)); ctx.clip();
      ctx.fillStyle = this._crowdPattern(ctx, this.fill, sc); ctx.fillRect(0, 0, V.W, V.H); ctx.restore();
    }
    // 파울 지역 잔디 (넓게), 그 위에 페어 지역
    const foulG = [P(0, -14)].concat(arc((a) => fence(Math.max(-45, Math.min(45, a))) * (Math.abs(a) > 45 ? 0.92 : 1), -75, 75, 3));
    ctx.fillStyle = C.grassFoul; path(foulG); ctx.fill();
    const fair = [P(0, 0)].concat(arc(fence)); ctx.fillStyle = dims.turf ? C.grassTurf : C.grass; path(fair); ctx.fill();
    // 잔디 줄무늬 — 홈에서 부챗살로
    const stripes = 11;
    ctx.fillStyle = C.mow;
    for (let i = 0; i < stripes; i += 2) {
      const a0 = -45 + i * (90 / stripes), a1 = Math.min(45, a0 + 90 / stripes);
      path([P(0, 0)].concat(arc(fence, a0, a1, 1.5))); ctx.fill();
    }
    // 워닝트랙
    ctx.fillStyle = C.track; path(arc((a) => fence(a) - 4.5).concat(arc(fence).reverse())); ctx.fill();
    // 내야 흙 — 마운드 중심 반경 29m 의 호, 홈 뒤로 원
    const inf = []; for (let a = -90; a <= 90; a += 4) { const X = 29 * Math.sin(a * rad), Y = 18.44 + 29 * Math.cos(a * rad); inf.push(P(X, Y)); }
    const backc = []; for (let a = 90; a <= 270; a += 6) { backc.push(P(8 * Math.sin(a * rad), 8 * Math.cos(a * rad))); }
    ctx.fillStyle = C.dirt; path(inf.concat(backc)); ctx.fill();
    // 내야 안쪽 잔디 (베이스라인 안쪽)
    const inset = 2.2;
    const ig = [P(0, inset * 1.6), P(19.4 - inset * 0.9, 19.4), P(0, 38.8 - inset * 1.4), P(-19.4 + inset * 0.9, 19.4)];
    ctx.fillStyle = dims.turf ? C.grassTurf : C.grass; path(ig); ctx.fill();
    // 마운드 · 홈 원
    const circ = (cx, cy, r, fill) => { const pts = []; for (let a = 0; a < 360; a += 12) pts.push(P(cx + r * Math.sin(a * rad), cy + r * Math.cos(a * rad))); ctx.fillStyle = fill; path(pts); ctx.fill(); };
    circ(0, 18.44, 2.9, C.dirtLight); circ(0, 0, 4, C.dirt);
    // 파울선 · 베이스라인
    ctx.strokeStyle = C.line; ctx.lineWidth = persp ? 1.4 : 1.1; ctx.globalAlpha = 0.85;
    for (const s of [-1, 1]) { const e = W2(s * 45, fence(s * 45)); path([P(0, 0), P(e[0], e[1])], false); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // 담장. 2.5D 에서는 높이가 있는 벽.
    if (persp) {
      const lo = arc(fence, -45, 45), hi = []; for (let a = -45; a <= 45 + 1e-6; a += 2.5) { const w = W2(a, fence(a)); hi.push(P(w[0], w[1], fh)); }
      path(lo.concat(hi.slice().reverse())); ctx.fillStyle = C.wall; ctx.fill();
      ctx.strokeStyle = '#e8c23a'; ctx.lineWidth = 1.3; path(hi, false); ctx.stroke();
    } else { ctx.strokeStyle = C.fence; ctx.lineWidth = 1.4 + fh * 0.45; path(arc(fence), false); ctx.stroke(); }
    // 거리 표시
    const real = dims.real || { fL: 99, fC: 121, fR: 99 };
    ctx.fillStyle = '#c3d2df'; ctx.font = `700 ${persp ? 9 : 10}px "IBM Plex Mono",ui-monospace,monospace`; ctx.textBaseline = 'middle';
    for (const [a, v, al] of [[-40, real.fL, 'left'], [0, real.fC, 'center'], [40, real.fR, 'right']]) {
      const w = W2(a, fence(a) - (persp ? 1 : 9)); const p = P(w[0], w[1], persp ? fh / 2 : 0);
      ctx.textAlign = al; ctx.fillText(v, p.x + (al === 'left' ? 4 : al === 'right' ? -4 : 0), p.y + (persp ? 0 : (a === 0 ? 4 : 0)));
    }
    // 베이스 · 홈플레이트 · 타자석 · 투수판
    const sq = (X, Y, m, fill) => { const pts = [P(X - m, Y - m), P(X + m, Y - m), P(X + m, Y + m), P(X - m, Y + m)]; ctx.fillStyle = fill; path(pts); ctx.fill(); };
    const bm = persp ? 0.55 : 0.9;
    for (let k = 1; k <= 3; k++) { const b = BASE[k], m = bm;
      ctx.fillStyle = '#eef3f8'; path([P(b[0], b[1] + m), P(b[0] + m, b[1]), P(b[0], b[1] - m), P(b[0] - m, b[1])]); ctx.fill(); }
    ctx.fillStyle = '#e4ebf2'; path([P(-0.43, 0.2), P(0.43, 0.2), P(0.43, -0.1), P(0, -0.43), P(-0.43, -0.1)]); ctx.fill();
    ctx.strokeStyle = 'rgba(232,238,244,.8)'; ctx.lineWidth = persp ? 1 : 0.8;
    for (const s of [-1, 1]) { path([P(s * 0.75, -0.9), P(s * 1.95, -0.9), P(s * 1.95, 0.9), P(s * 0.75, 0.9)]); ctx.stroke(); }
    sq(0, 18.44, 0.3, '#eef3f8');
    return c;
  }

  _crowdPattern(ctx, rate, sc = 1) {
    const c = document.createElement('canvas'); c.width = 6; c.height = 6;
    const g = c.getContext('2d');
    g.fillStyle = C.seat; g.fillRect(0, 0, 6, 6);
    g.fillStyle = mix(this.o.colors.home, '#b5c2ce', 0.36);
    if (rate > 0.15) { g.beginPath(); g.arc(1.6, 1.6, 1.2, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#7c8996';
    if (rate > 0.5) { g.beginPath(); g.arc(4.5, 4.5, 1.2, 0, Math.PI * 2); g.fill(); }
    if (rate > 0.8) { g.fillStyle = mix(this.o.colors.home, '#b5c2ce', 0.5); g.beginPath(); g.arc(4.5, 1.5, 1.0, 0, Math.PI * 2); g.fill(); }
    const pat = ctx.createPattern(c, 'repeat');
    // 배경은 확대해서 그린다. 관중 점은 화면 픽셀 크기로 남아야 한다.
    try { pat.setTransform(new DOMMatrix().scale(1.4 / sc)); } catch {}
    return pat;
  }

  /* ── 승부처 오버레이 ── */
  ask(html) { this.el.ask.innerHTML = html; this.el.ask.hidden = false; return this.el.ask; }
  unask() { this.el.ask.hidden = true; this.el.ask.innerHTML = ''; }
  setLog(html) { this.el.log.innerHTML = html; this.el.log.scrollTop = this.el.log.scrollHeight; }
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
/** 두 색을 섞는다. a 를 k 만큼, 나머지는 b. */
function mix(a, b, k) {
  const h = (s) => { s = String(s).replace('#', ''); if (s.length === 3) s = s.split('').map(c => c + c).join('');
    const n = parseInt(s, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const A = h(a), B = h(b);
  return `rgb(${A.map((v, i) => Math.round(v * k + B[i] * (1 - k))).join(',')})`;
}
