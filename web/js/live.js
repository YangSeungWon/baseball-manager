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
import { Sfx } from './sfx.js';
import { RT } from './core/run.js';

const rad = Math.PI / 180;
const short = (s) => String(s || '').split(' ')[0];
/* ── 아이콘 ────────────────────────────────────────────────
   글자 대신 모양으로 위계를 만든다. 자주 누르는 것은 아이콘만, 결과가 큰 것은 아이콘과 글자. */
const IC = {
  pause: '<path d="M6 4h3v12H6zM11 4h3v12h-3z"/>',
  play:  '<path d="M6 4l10 6-10 6z"/>',
  skip:  '<path d="M4 4l8 6-8 6z"/><path d="M13 4h3v12h-3z"/>',
  end:   '<path d="M3 5l6 5-6 5zM9 5l6 5-6 5z"/><path d="M15 5h2v10h-2z"/>',
  ball:  '<circle cx="10" cy="10" r="7" fill="none" stroke-width="1.8"/><path d="M6 5.5c2 2.5 2 6.5 0 9M14 5.5c-2 2.5-2 6.5 0 9" fill="none" stroke-width="1.6"/>',
  bat:   '<path d="M4 16l1.5-1.5 8-9.5 2 2-9.5 8L4.5 16.5z"/><circle cx="15" cy="5" r="1.6"/>',
  pinch: '<path d="M4 7h9l-3-3M16 13H7l3 3" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  bunt:  '<path d="M3 12h7l6-6 1.5 1.5L11 14H3z"/>',
  steal: '<circle cx="12" cy="4" r="1.8"/><path d="M11 7l-4 4 3 2-2 4M11 7l3 3 3-1" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  hook:  '<path d="M5 15V5l5 4V5l5 4" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15" cy="14" r="2.2"/>',
  ibb:   '<circle cx="5" cy="10" r="1.7"/><circle cx="10" cy="10" r="1.7"/><circle cx="15" cy="10" r="1.7"/><path d="M3 15h14" stroke-width="1.6" stroke-linecap="round"/>',
  shift: '<path d="M3 10h14M13 6l4 4-4 4" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  swing: '<path d="M4 15l9-9M12 5l3 3" fill="none" stroke-width="2.2" stroke-linecap="round"/>',
  glove: '<path d="M6 16c-2 0-3-2-3-5V7a1.5 1.5 0 013 0v3M9 10V5a1.5 1.5 0 013 0v5M12 10V6a1.5 1.5 0 013 0v5c0 3-2 5-5 5H6" fill="none" stroke-width="1.7" stroke-linecap="round"/>',
  owner: '<circle cx="10" cy="7" r="3.2"/><path d="M4 17c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5z"/><path d="M6.5 3l2 1.5L10 2l1.5 2.5 2-1.5-.8 3.2H7.3z"/>',
  park:  '<path d="M2 12a8 8 0 0116 0v4H2z" fill="none" stroke-width="1.8"/><path d="M6 16v-3M10 16v-4M14 16v-3" stroke-width="1.6" stroke-linecap="round"/><path d="M4 9h12" stroke-width="1.2"/>',
  won:   '<circle cx="10" cy="10" r="7.5" fill="none" stroke-width="1.8"/><path d="M6 7l1.6 6 2.4-6 2.4 6L14 7M5.5 10h9M5.5 12h9" fill="none" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
  trophy:'<path d="M6 3h8v4a4 4 0 01-8 0z"/><path d="M6 4H3v2a3 3 0 003 3M14 4h3v2a3 3 0 01-3 3" fill="none" stroke-width="1.5"/><path d="M8.5 11h3v3h2v2h-7v-2h2z"/>',
  star:  '<path d="M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7z"/>',
  bolt:  '<path d="M11 2L4 11h5l-1 7 7-9h-5z"/>',
  hurt:  '<path d="M8 3h4v5h5v4h-5v5H8v-5H3V8h5z"/>',
  back:  '<path d="M8 5L3 9.5 8 14V11h5a3 3 0 0 1 0 6h-2v2h2a5 5 0 0 0 0-10H8z"/>',
  gem:   '<path d="M10 2l7 7-7 9-7-9z"/>',
  news:  '<path d="M3 4h14v12H3z" fill="none" stroke-width="1.8"/><path d="M6 8h8M6 11h8M6 14h5" stroke-width="1.6" stroke-linecap="round"/>',
  eye:   '<path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z" fill="none" stroke-width="1.8"/><circle cx="10" cy="10" r="2.6"/>',
  arrow: '<path d="M3 9h9V5l5 5-5 5v-4H3z"/>',
  rank:  '<path d="M3 16h4V9H3zM8 16h4V4H8zM13 16h4v-5h-4z"/>',
  pen:   '<path d="M3 17l4-1 9-9-3-3-9 9zM12.5 5.5l3 3" fill="none" stroke-width="1.8" stroke-linejoin="round"/>',
};
const ic = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">${IC[k]}</svg>`;
export { ic as icon };

// 스피커 아이콘. 켜지면 파형이, 꺼지면 빗금이 보인다 — CSS 가 고른다.
const SND_ICON = `<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
  <path class="sp" d="M3 7.5v5h3l4 3.5v-12l-4 3.5z"/>
  <path class="wv" d="M12.5 7.2a4 4 0 0 1 0 5.6M14.6 5a7 7 0 0 1 0 10" fill="none" stroke-width="1.6" stroke-linecap="round"/>
  <path class="mx" d="M12.5 7.5l5 5m0-5l-5 5" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const hashOf = (s) => [...String(s || '')].reduce((a, c) => (Math.imul(a, 31) + c.codePointAt(0)) >>> 0, 7);
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
const AP_KR = { power:'강공', line:'끊어치기', oppo:'밀어치기', contact:'컨택' };
const POS_FULL = { P:'투수', C:'포수', '1B':'1루수', '2B':'2루수', '3B':'3루수', SS:'유격수', LF:'좌익수', CF:'중견수', RF:'우익수' };
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
    this.auto = opts.speed === 'auto' || opts.speed == null;   // 배속은 상황이 정한다
    this.speed = this.auto ? 2 : (opts.speed || 1);
    this.paused = false;
    this.views = { top: new TopView(), persp: new PerspView() };
    this.dims = BIP.parkDims(opts.park);
    this.fill = opts.crowd && opts.cap ? clamp(opts.crowd / opts.cap, .08, 1) : 0.62;
    this.S = this._blank();
    this.tl = null; this.resolve = null;
    this.hist = new Map();               // 오늘 타자 성적
    this.line = { top: [], bottom: [], hits: { top: 0, bottom: 0 }, err: { top: 0, bottom: 0 } };   // 전광판
    this.maxFastball = 0;                // 이 투수의 최고 직구 구속
    this.pitName = null;
    this.seq = []; this.zh = 1;
    this.pnp0 = 0;
    this.sfx = new Sfx();
    this._build();
    if (opts.sound) this.setSound(true);          // 클릭 안에서 만들어졌으니 지금 열 수 있다
    this._last = performance.now();
    this._raf = requestAnimationFrame(() => this._frame());
  }

  _blank() {
    return { def: {}, defTeam: null, offTeam: null, half: null, inning: 0,
      fielders: {}, runners: [], batter: null, catcher: true,
      ball: null, hold: null, trail: [], cap: '', capSub: '', flash: null, flashT: 0,
      pitcherWind: 0, swing: 0, b: 0, s: 0, outs: 0 };
  }

  _build() {
    this.root.innerHTML = `<div class="lv">
      <div class="lv-main">
        <div class="lv-stage ${this.view}">
          <canvas class="lv-c"></canvas>
          <div class="lv-bug">
            <div class="lv-bug-top">
              <div class="lv-bug-teams">
                <div class="lv-bug-t" style="--tc:${this.o.colors.away}"><i></i><span>${short(this.o.away)}</span><b data-gs="a">0</b></div>
                <div class="lv-bug-t" style="--tc:${this.o.colors.home}"><i></i><span>${short(this.o.home)}</span><b data-gs="h">0</b></div>
              </div>
              <div class="lv-bug-sit">
                <div class="lv-bug-inn"><em data-gs="arr"></em><b data-gs="inn">—</b></div>
                <svg class="lv-bug-dia" viewBox="0 0 34 34" aria-hidden="true">
                  <rect data-gs="d2" x="13" y="1"  width="9" height="9" transform="rotate(45 17.5 5.5)"/>
                  <rect data-gs="d3" x="1"  y="13" width="9" height="9" transform="rotate(45 5.5 17.5)"/>
                  <rect data-gs="d1" x="25" y="13" width="9" height="9" transform="rotate(45 29.5 17.5)"/>
                </svg>
                <div class="lv-bug-cnt" data-gs="bso"></div>
              </div>
            </div>
            <div class="lv-bug-strip">
              <span class="lv-bug-p"><small class="lv-mobile-role">투수</small>${ic('ball')}<b class="lv-bug-pn">—</b><i class="lv-bug-pc"></i></span>
              <span class="lv-bug-b"><small class="lv-mobile-role">타자</small>${ic('bat')}<b class="lv-bug-bn">—</b><i class="lv-bug-bl"></i></span>
            </div>
          </div>
          <div class="lv-cap"><b class="lv-cap-main"></b><span class="lv-cap-sub"></span></div>
          <div class="lv-flash"></div>
          <div class="lv-panel lv-pl">
            <div class="lv-who pit"><span class="lab">투수</span>
              <b class="lv-pn">—</b><i class="lv-ph"></i>
              <div class="lv-pitch"><em class="lv-pt">—</em><span class="lv-pv"></span></div>
              <div class="lv-pstat"><span>투구수 <b class="m lv-np">0</b></span>
                <span>최고 <b class="m lv-vmax">—</b></span>
                <span class="lv-tired"><i></i></span></div>
              <div class="lv-bits lv-pbits"></div>
            </div>
            <div class="lv-who bat"><span class="lab">타자</span>
              <b class="lv-bn">—</b><i class="lv-bh"></i>
              <div class="lv-today">—</div>
              <div class="lv-ap"></div>
              <div class="lv-bits lv-bbits"></div>
            </div>
            <div class="pzbox lv-zone"><div class="pzempty">투구 없음</div></div>
          </div>
          <div class="lv-panel lv-mgr" hidden></div>
          <div class="lv-card lv-pre" hidden></div>
          <div class="lv-card lv-inn" hidden></div>
          <div class="lv-tools">
            <button class="lv-mobile-skip quiet">이 장면 넘기기</button>
            <span class="lv-seg lv-view">
              <button data-v="persp" class="${this.view === 'persp' ? 'on' : ''}">입체</button>
              <button data-v="top" class="${this.view === 'top' ? 'on' : ''}">위에서</button></span>
            <span class="lv-seg lv-spd"><button data-s="auto" class="${this.auto ? 'on' : ''}">자동</button>${[1, 2, 4, 8].map(s =>
              `<button data-s="${s}" class="${!this.auto && s === this.speed ? 'on' : ''}">×${s}</button>`).join('')}</span>
            <span class="lv-seg lv-snd"><button class="lv-sndb ${this.o.sound ? 'on' : ''}" title="소리" aria-pressed="${!!this.o.sound}">${SND_ICON}</button></span>
          </div>
          <div class="lv-ask" hidden></div>
        </div>
        <div class="lv-bar">
          <button class="quiet lv-pause" title="일시정지">${ic('pause')}<span>일시정지</span></button>
          <button class="quiet lv-skip" title="이 장면 건너뛰기">${ic('skip')}<span>장면 건너뛰기</span></button>
          <span class="lv-sp"></span>
          <label class="lv-mobile-speed"><span class="sr-only">재생 속도</span><select aria-label="재생 속도"><option value="auto">자동 속도</option><option value="1">1배</option><option value="2">2배</option><option value="4">4배</option><option value="8">8배</option></select></label>
          <button class="quiet lv-end" title="결과로">${ic('end')}<span>경기 끝까지</span></button>
        </div>
        <details name="live-mobile-panels" class="lv-mobile-details lv-manager-details" ${this.o.command ? '' : 'hidden'}>
          <summary>작전 지시</summary><p class="lv-detail-note">펼쳐 두면 경기가 멈춥니다. 지시를 고르고 접으면 다음 타석에 적용됩니다.</p><div class="lv-manager-slot"></div>
        </details>
        <details name="live-mobile-panels" class="lv-mobile-details lv-record-details">
          <summary>기록 · 화면 설정</summary><p class="lv-detail-note">접으면 경기가 이어집니다.</p><div class="lv-settings-slot"></div><div class="lv-player-slot"></div><div class="lv-log-slot"></div>
        </details>
      </div>
      <aside class="lv-side">
        <div class="rplog lv-log"></div>
      </aside>
    </div>`;
    const q = (s) => this.root.querySelector(s);
    this.cv = q('.lv-c'); this.ctx = this.cv.getContext('2d');
    this.stage = q('.lv-stage');
    this.el = { cap: q('.lv-cap-main'), capSub: q('.lv-cap-sub'), flash: q('.lv-flash'),
      ask: q('.lv-ask'), pn: q('.lv-pn'), ph: q('.lv-ph'), pt: q('.lv-pt'), pv: q('.lv-pv'),
      np: q('.lv-np'), vmax: q('.lv-vmax'), tired: q('.lv-tired i'), pbits: q('.lv-pbits'),
      bn: q('.lv-bn'), bh: q('.lv-bh'), today: q('.lv-today'), bbits: q('.lv-bbits'),
      zone: q('.lv-zone'), log: q('.lv-log'), pause: q('.lv-pause'), ap: q('.lv-ap'),
      bugPn: q('.lv-bug-pn'), bugPc: q('.lv-bug-pc'), bugBn: q('.lv-bug-bn'), bugBl: q('.lv-bug-bl'),
      mgr: q('.lv-mgr'), pre: q('.lv-pre'), inn: q('.lv-inn') };
    this.pending = {};                          // 감독 패널에 걸어 둔 명령
    this.root.querySelectorAll('[data-v]').forEach(b => b.onclick = () => this.setView(b.dataset.v));
    this.root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => b.dataset.s === 'auto' ? this.setAuto(true) : this.setSpeed(+b.dataset.s, true));
    q('.lv-skip').onclick = () => this.skip();
    q('.lv-mobile-skip').onclick = () => this.skip();
    q('.lv-mobile-speed select').value = this.auto ? 'auto' : String(this.speed);
    q('.lv-mobile-speed select').onchange = e => e.target.value === 'auto' ? this.setAuto(true) : this.setSpeed(+e.target.value, true);
    this.root.querySelectorAll('.lv-mobile-details').forEach(panel => panel.addEventListener('toggle', () => {
      if (panel.open && this._narrow) this.root.querySelectorAll('.lv-mobile-details').forEach(other => { if (other !== panel) other.open = false; });
      this.panelPaused = this._narrow && [...this.root.querySelectorAll('.lv-mobile-details')].some(x => x.open);
    }));
    q('.lv-sndb').onclick = () => this.setSound(!this.sfx.on);
    q('.lv-end').onclick = () => { this._closePanels(); if (this.o.onEnd) this.o.onEnd(); };
    this.el.pause.onclick = () => this.togglePause();
    // 크기는 창이 바뀔 때만 다시 잰다. ResizeObserver 로 부모 칸을 지켜보면
    // 옆 칸의 문자중계가 자랄 때마다 불려 레이아웃이 매 프레임 흔들린다.
    this._onResize = () => this._size();
    window.addEventListener('resize', this._onResize);
    this._size();
    setTimeout(() => this._size(), 250);           // 글꼴·레이아웃이 자리잡은 뒤 한 번 더
  }

  destroy() { cancelAnimationFrame(this._raf); window.removeEventListener('resize', this._onResize); this._dead = true; this.sfx.destroy(); }

  setSound(on) {
    this.sfx.enable(on);
    on = this.sfx.on;
    const b = this.root.querySelector('.lv-sndb'); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    try { localStorage.setItem('dugout.sfx', on ? '1' : '0'); } catch {}
    if (on) { this.sfx.crowd(this.fill); this.sfx.mute(this.speed > 2); }
  }

  setView(v) {
    this.view = v; this.stage.classList.toggle('top', v === 'top'); this.stage.classList.toggle('persp', v !== 'top');
    this.root.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    try { localStorage.setItem('dugout.view', v); } catch {}
    this._size();
  }
  setSpeed(s, manual = false) {
    if (manual) { this.auto = false; try { localStorage.setItem('dugout.speed', s); } catch {} }
    this.speed = s;
    const select = this.root.querySelector('.lv-mobile-speed select'); if (select) select.value = this.auto ? 'auto' : String(s);
    this.sfx.mute(s > 2);                            // ×4 부터는 소리가 뭉개진다
    this.root.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === 'auto' ? this.auto : (!this.auto && +b.dataset.s === s)));
  }
  setAuto(on) { this.auto = on; try { localStorage.setItem('dugout.speed', 'auto'); } catch {} this.setSpeed(this.speed); }
  /** 상황이 배속을 정한다. 접전의 늦은 이닝은 ×1, 크게 벌어진 이른 이닝은 ×4. 사람이 손대면 그만둔다. */
  _autoSpeed(rec) {
    if (!this.auto) return;
    const diff = Math.abs((rec.ro || 0) - (rec.rd || 0)), late = (rec.inning || 1) >= 7;
    const risp = (rec.base || []).slice(1).some(Boolean);
    let s = 2;
    if (diff >= 5) s = 4;
    if (late && diff <= 2) s = 1;
    else if (risp && diff <= 3) s = Math.min(s, late ? 1 : 2);
    if (rec.inning >= 9 && diff <= 3) s = 1;
    this.setSpeed(s);
  }
  togglePause() { this.paused = !this.paused;
    this.el.pause.innerHTML = this.paused ? `${ic('play')}<span>계속</span>` : `${ic('pause')}<span>일시정지</span>`; }
  /** 지금 장면을 끝까지 돌린다 */
  skip() { this._closePanels(); if (this.tl) { this.tl.finish(); const done = this.resolve; this.tl = null; this.resolve = null; if (done) done(); } else if (this._preDone && !this.el.pre.hidden) this._preDone(); }

  _closePanels() { this.root.querySelectorAll('.lv-mobile-details').forEach(p => p.open = false); this.panelPaused = false; }

  _size() {
    if (this._dead) return;
    const V = this.views[this.view];
    // 무대의 폭은 캔버스가 정하면 안 된다 (캔버스가 커지면 무대도 커져 서로 밀어낸다).
    // 부모 칸의 폭을 잰다.
    const r = (this.stage.parentElement || this.stage).getBoundingClientRect();
    // 폭에 맞추되, 세로가 화면을 넘지 않게. 남는 폭은 무대 배경으로 둔다.
    const maxH = window.innerWidth <= 900 ? Math.max(140, Math.min(260, window.innerHeight * .30))
      : Math.max(220, (this.o.maxH ? this.o.maxH() : window.innerHeight - 230));
    let w = Math.max(200, Math.floor(r.width)), h = Math.round(w / V.aspect());
    if (h > maxH) { h = maxH; w = Math.round(h * V.aspect()); }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // 좁은 화면에서는 패널을 구장 밖으로 내린다. 구장 위에 얹으면 필드가 안 보인다.
    const narrow = window.innerWidth <= 900;
    if (narrow !== this._narrow) {
      this._narrow = narrow;
      const q = s => this.root.querySelector(s), main = q('.lv-main');
      this._closePanels();
      if (narrow) {
        main.insertBefore(q('.lv-bug'), this.stage);
        this.stage.after(q('.lv-cap'));
        q('.lv-manager-slot').appendChild(this.el.mgr);
        q('.lv-player-slot').appendChild(q('.lv-pl'));
        q('.lv-settings-slot').appendChild(q('.lv-tools'));
        q('.lv-log-slot').appendChild(this.el.log);
        main.insertBefore(this.el.pre, this.stage);
        q('.lv').appendChild(this.el.ask);
      } else {
        for (const selector of ['.lv-bug', '.lv-cap', '.lv-mgr', '.lv-pl', '.lv-tools', '.lv-pre', '.lv-ask']) this.stage.appendChild(q(selector));
        q('.lv-side').appendChild(this.el.log);
      }
      main.inert = narrow && !this.el.ask.hidden;
      const top = this.root.closest('.gs')?.querySelector('.gs-top'); if (top) top.inert = main.inert;
      this.el.pre.querySelectorAll('details').forEach(d => d.open = !narrow);
    }

    // 같은 크기면 손대지 않는다. 캔버스 크기를 다시 쓰면 그림이 지워지고,
    // ResizeObserver 가 매 프레임 부르면 그린 직후마다 지워져 빈 화면이 된다.
    if (this.cw === w && this.ch === h && this.dpr === dpr) return;
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
    if (this.tl && !this.paused && !this.panelPaused) {
      this.tl.step(this.tl.t + dt * this.speed);
      if (this.tl.over) { const r = this.resolve; this.tl = null; this.resolve = null; if (r) r(); }
    }
    if (this.S.flash && (this.S.flashT -= dt * Math.min(this.speed, 2)) <= 0) this._flash(null);
    this._draw();
    this._raf = requestAnimationFrame(() => this._frame());
  }

  /** 한 플레이를 보여 준다. 끝나면 resolve. */
  play(rec) {
    if (rec.evt === 'lineup') return new Promise((res) => this._preCard(rec, res));
    return new Promise((res) => {
      this.resolve = res; this._rec = rec;
      const tl = new Timeline();
      try { this._script(tl, rec); }
      catch (e) { console.error(e); tl.end = Math.max(tl.end, 0.1); }
      // 장면이 끝나면 기록과 맞춘다. 건너뛰었어도 화면은 진실이어야 한다.
      if (!rec.evt) tl.at(tl.end, () => this._settle(rec));
      this.tl = tl;
      // 문자중계 줄은 결과를 미리 말하면 안 된다. 시작할 때는 '진행 중' 으로 붙이고
      // 장면이 끝나 확정될 때 결과로 바꾼다.
      if (this.o.onLog && !rec.evt) this.o.onLog(rec, false);
    });
  }

  /* ── 상태 ── */
  /** 더그아웃. 홈은 1루 쪽, 원정은 3루 쪽. 그라운드 밖 파울 지역이다. */
  _dugout(team) { return team === this.o.home ? [23, -7] : [-23, -7]; }
  _side(rec, tl = null) {
    const S = this.S;
    const newHalf = S.half !== rec.half || S.inning !== rec.inning;
    const had = Object.keys(S.fielders).length > 0;
    S.half = rec.half; S.inning = rec.inning; S.def = rec.pos || S.def;
    if (rec.mine !== undefined) { this.side = rec; this._mgr(); }
    const prevDef = S.defTeam;
    S.defTeam = rec.def; S.offTeam = rec.off;
    if (newHalf) { S.runners = []; S.outs = 0; S.batter = null;
      const L = this.line; while (L[rec.half].length < rec.inning) L[rec.half].push(0); }
    const spot = (pos) => { const sp = BIP.fielderSpot(pos, 0);
      return pos === 'C' ? [0, -1.6] : pos === 'P' ? MOUND : W2(sp.angle, sp.depth); };
    if (!newHalf) {
      // 같은 이닝. 이름만 바꾼다. 자리는 그대로 (투수 교체 장면이 이미 움직였다).
      for (const pos of Object.keys(POS_KR)) { if (S.fielders[pos]) S.fielders[pos].name = S.def[pos] || null;
        else { const w = spot(pos); S.fielders[pos] = { pos, name: S.def[pos] || null, x: w[0], y: w[1], home: w, alpha: 1 }; } }
    } else if (tl && had && prevDef) {
      // 공수 교대. 나가던 수비는 더그아웃으로 들어가고, 새 수비가 나온다.
      const out = this._dugout(prevDef), inn = this._dugout(rec.def);
      const old = Object.values(S.fielders); S.fielders = {};
      S.exiting = old; for (const f of old) f.color = this._offColor();
      for (const f of old) { const from = [f.x, f.y];
        tl.add(0.1, 2.0, (k) => { f.x = lerp(from[0], out[0], k); f.y = lerp(from[1], out[1], k); f.moving = k < 1; f.alpha = k > 0.75 ? 1 - (k - 0.75) * 4 : 1; }); }
      tl.at(2.1, () => { S.exiting = null; });
      for (const pos of Object.keys(POS_KR)) {
        const w = spot(pos);
        const f = { pos, name: S.def[pos] || null, x: inn[0], y: inn[1], home: w, alpha: 0, wait: true };
        S.fielders[pos] = f;
        const d = dist2(inn, w), dur = clamp(d / 5.2, 1.2, 3.2);
        tl.add(1.0, dur, (k) => { f.wait = false; f.alpha = Math.min(1, k * 4); f.x = lerp(inn[0], w[0], k); f.y = lerp(inn[1], w[1], k); f.moving = k < 1; });
      }
    } else {
      for (const pos of Object.keys(POS_KR)) { const w = spot(pos);
        S.fielders[pos] = { pos, name: S.def[pos] || null, x: w[0], y: w[1], home: w, alpha: 1 }; }
    }
    if (rec.pos && rec.pos.P && rec.pos.P !== this.pitName) { this.pitName = rec.pos.P; this.maxFastball = 0; }
    this.el.pn.textContent = rec.pos && rec.pos.P ? rec.pos.P : this.el.pn.textContent;
    this.el.bugPn.textContent = this.el.pn.textContent;
  }
  /** 투수 교체. 내려가는 투수는 더그아웃으로, 올라오는 투수는 불펜에서 뛰어 들어온다. */
  _pitcherChange(tl, rec, name) {
    const S = this.S, old = S.fielders.P;
    const out = this._dugout(S.defTeam);
    const side = S.defTeam === this.o.home ? 1 : -1;
    const pen = [side * 34, 62];                    // 불펜 — 파울 지역 깊숙이
    if (old) { const from = [old.x, old.y];
      const walker = { ...old, name: old.name, color: this._defColor() };
      S.exiting = [walker];
      tl.add(0.3, 2.6, (k) => { walker.x = lerp(from[0], out[0], k); walker.y = lerp(from[1], out[1], k); walker.moving = k < 1; walker.alpha = k > 0.8 ? 1 - (k - 0.8) * 5 : 1; });
      tl.at(2.95, () => { S.exiting = null; }); }
    const nf = { pos: 'P', name, x: pen[0], y: pen[1], home: MOUND, alpha: 0, wait: true };
    S.fielders.P = nf;
    tl.add(0.8, 3.0, (k) => { nf.wait = false; nf.alpha = 1; nf.x = lerp(pen[0], MOUND[0], k); nf.y = lerp(pen[1], MOUND[1], k); nf.moving = k < 1; });
    tl.add(3.8, 0.8, null);
    this.pitName = name; this.maxFastball = 0;
    this.el.pn.textContent = name; this.el.bugPn.textContent = name; this.el.bugPc.textContent = '';
    this.el.np.textContent = 0; this.el.vmax.textContent = '—';
  }

  _defColor() { return this.S.half === 'top' ? this.o.colors.home : this.o.colors.away; }
  _offColor() { return this.S.half === 'top' ? this.o.colors.away : this.o.colors.home; }

  _flash(text, cls = '', sub = '') {
    if (cls === 'out') this.sfx.call('out'); else if (cls === 'safe') this.sfx.call('safe'); else if (cls === 'k') this.sfx.call('strike3');
    this.S.flash = text; this.S.flashT = cls === 'inn' ? 3.4 : (cls === 'cmd' || cls === 'err') ? 2.0 : cls === 'score' ? 2.6 : 1.6;
    this.el.flash.innerHTML = text ? `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}` : '';
    this.el.flash.className = 'lv-flash' + (text ? ' on ' + cls : '');
  }
  _cap(main, sub = '') { this.el.cap.textContent = main || ''; this.el.capSub.textContent = sub || ''; }

  _score(delta, rec) {
    // 득점은 주자가 홈을 밟는 그 순간 올라간다. 홈 팀이면 함성, 아니면 정적.
    if (rec && rec.half === 'bottom') this.sfx.cheer(0.85); else this.sfx.hush();
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
    if (rec.evt === 'pick') { this._syncRunners(rec); return this._pickoff(tl, rec); }
    if (rec.evt === 'cmd') {
      // 감독 지시가 지금 적용됐다. 크게 알린다.
      this._flash('감독 지시', 'cmd', rec.text);
      this._cap(`감독 지시 · ${rec.text}`, '');
      tl.add(0, 1.3, null); return;
    }
    if (rec.evt === 'start') { this._cap(`${rec.away} vs ${rec.home}`, rec.crowd ? `관중 ${rec.crowd.toLocaleString()}` : ''); tl.add(0, 1.2, null); return; }
    if (rec.evt === 'side') {
      const newHalf = S.half !== rec.half || S.inning !== rec.inning;
      this._side(rec, tl);
      if (newHalf) {
        // 공수 교대 — 이닝 카드. 다음 타순과 불펜을 보여 주는 동안 야수들이 들어가고 나온다.
        this._cap('', '');
        this._innCard(rec);
        tl.add(0, 4.2, null);
        tl.at(4.15, () => { this.el.inn.hidden = true; });
      } else tl.add(0, 0.2, null);
      return;
    }
    // 재생(기록만 있을 때)이면 side 이벤트가 없다. 이닝이 바뀌면 여기서 세운다.
    if (S.half !== rec.half || S.inning !== rec.inning) {
      this._side({ inning: rec.inning, half: rec.half, pos: S.def, def: S.defTeam, off: S.offTeam });
      this._cap(`${rec.inning}회 ${rec.half === 'top' ? '초' : '말'}`, '');
    }
    if (rec.pitcher && rec.pitcher !== this.pitName) {
      this.pitName = rec.pitcher; this.maxFastball = 0;
      if (S.fielders.P) S.fielders.P.name = rec.pitcher;
      this.el.pn.textContent = rec.pitcher;
    }
    this._runs = (rec.ro || 0) - (rec.runs || 0);
    // 지금 서 있는 주자를 기록과 맞춘다 (재생 중 건너뛰기 등으로 틀어졌을 때)
    this._syncRunners(rec);
    this.el.ph.textContent = rec.th ? (rec.th === 'L' ? '좌완' : '우완') : '';
    if (rec.batter && !rec.sub) {
      this.el.bugBn.textContent = rec.batter; this.el.bugBl.textContent = this._todayLine(rec.batter);
      this.el.bugPn.textContent = rec.pitcher || this.el.bugPn.textContent;
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
      if (rec.pitcher && /투수 교체/.test(rec.desc)) { this._pitcherChange(tl, rec, rec.pitcher); return; }
      tl.add(0, 1.4, null); return;
    }
    if (rec.steal) return this._steal(tl, rec);
    if (rec.pick || rec.evt === 'pick') return this._pickoff(tl, rec);
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
  /** 주자를 리드만큼 떼어 세운다. 1루 주자는 기록의 리드, 나머지는 기본 리드. */
  _lead(lead1) {
    for (const r of this.S.runners) {
      if (r.gone || r.wait || r.base < 1 || r.base > 3) continue;
      const A = baseAt(r.base), B = baseAt(r.base + 1);
      const L = (r.base === 1 && lead1 != null ? lead1 : RT.lead) / 27.43;
      r.x = lerp(A[0], B[0], L); r.y = lerp(A[1], B[1], L);
    }
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
    tl.at(t0, () => this._hold(S.fielders.P));
    tl.add(t0, 0.9, (k) => { S.pitcherWind = k; });
    tl.at(t0 + 0.9, () => { S.hold = null; });
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
    if (q.r === 'W') tl.at(tArr - 0.12, () => this.sfx.whiff());
    tl.at(tArr, () => {
      if (q.r === 'S' || q.r === 'B' || q.r === 'W') this.sfx.pop((v - 110) / 50);
      else if (q.r === 'F') this.sfx.crack(0.3, true);
      // 판정 소리. 스트라이크는 짧고 낮게 울린다.
      if (q.r === 'S' || q.r === 'W') { if (!(opts.last && S.s >= 3)) setTimeout(() => this.sfx.call('strike'), 120); }
      else if (q.r === 'B') setTimeout(() => this.sfx.call('ball'), 120);
      else if (q.r === 'F') setTimeout(() => this.sfx.call('foul'), 200);
      else if (q.r === 'H') this.sfx.thud();
      else if (q.r === 'X') this.sfx.crack(opts.hit ?? 0.5);
    });
    tl.at(tArr, () => {
      this.seq.push(q); this._zone(rec);
      // 최고 구속은 직구 계열을 기준으로 표시한다.
      if (q.t === 'FF' || q.t === 'SI' || q.t === 'FC') this.maxFastball = Math.max(this.maxFastball, v);
      this.el.vmax.textContent = this.maxFastball || '—';
      this.el.pt.textContent = PT_KR[q.t] || q.t; this.el.pv.innerHTML = `${v}<i>km/h</i>`;
      this.el.np.textContent = this.pnp0 + i + 1;
      this.el.bugPc.textContent = `${this.pnp0 + i + 1}구 · ${PT_KR[q.t] || q.t} ${v}`;
      if (q.r === 'S' || q.r === 'W') S.s++;
      else if (q.r === 'F') { if (S.s < 2) S.s++; }
      else if (q.r === 'B') S.b++;
      const last = opts.last;
      if (!last) this._cap(`${i + 1}구 ${PT_KR[q.t] || q.t} ${v}`, RES_KR[q.r] + `  ${S.b}-${S.s}`);
      if (this.o.onCount) this.o.onCount(S.b, S.s);
    });
    // 결과에 따른 공의 뒷처리
    if (q.r === 'S' || q.r === 'B' || q.r === 'W') {
      tl.add(tArr, 0.12, (k) => { S.ball = { x: end[0] * 0.6, y: -1.2 * k, z: 0.6, vis: true }; }, () => this._hold(S.fielders.C));
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
  /* ── 타석 ── */
  _pa(tl, rec) {
    const S = this.S;
    S.b = 0; S.s = 0; this.seq = []; this.zh = rec.zh || 1;
    this.pnp0 = (rec.pnp || 0) - (rec.np || 0);
    this.el.np.textContent = this.pnp0; this.el.bugPc.textContent = `${this.pnp0}구`;
    this._mgrConsumed();
    // 접근. 타자가 고른 것인지 감독이 시킨 것인지도.
    this.el.ap.innerHTML = rec.ap ? `<span class="lab">접근</span><b>${AP_KR[rec.ap] || rec.ap}</b>${rec.apBy === 'mgr' ? '<i>감독 지시</i>' : ''}` : '';
    if (rec.tired != null) this.el.tired.style.width = (100 - clamp(rec.tired, 0, 100)) + '%';
    S.batter = { name: rec.batter, hand: rec.bh || 'R', alpha: 1 };
    this._autoSpeed(rec);
    this._lead(rec.lead);
    this._flash(null);
    // 타자마다 자기 응원가가 있다. 이름이 멜로디를 정한다. 원정 응원석은 작다.
    const home = rec.half === 'bottom';
    const chant = this.o.chant ? this.o.chant(rec.batter, rec.inning) : '';
    if (this.fill > 0.2) this.sfx.song(hashOf(rec.batter), home ? this.fill : this.fill * 0.35, chant);
    else this.sfx.stopSong();
    // 구호는 전광판에 띄운다. 타석 내내 켜져 있다.
    this.chantText = home && chant && this.fill > 0.3 ? chant : '';
    this._cap(`${rec.batter}${rec.bh ? (rec.bh === 'L' ? ' · 좌타' : ' · 우타') : ''}`, this._todayLine(rec.batter));
    this._resetDefense(tl, rec.sh);
    this._zone(rec);
    if (this.o.onCount) this.o.onCount(0, 0);
    const seq = rec.seq && rec.seq.length ? rec.seq : [{ x: 0, z: 0, t: rec.pt || 'FF', v: rec.velo || 140, r: 'X' }];
    let t = 0.4, tArr = 0;
    // 타구 소리의 세기. 담장을 넘기면 1, 빗맞은 땅볼은 0.2 근처.
    const hit = rec.res === 'HR' ? 1
      : rec.bbt === 'GB' ? clamp(0.15 + ((rec.ev || 26) - 18) / 30, 0.1, 0.7)
      : rec.bbt === 'PU' ? 0.3
      : clamp(0.25 + ((rec.dep || 60) - 40) / 90, 0.2, 0.95);
    seq.forEach((q, i) => {
      const last = i === seq.length - 1;
      tArr = this._pitch(tl, q, i, t, rec, { last, hit });
      t = tArr + (q.r === 'F' ? 1.7 : q.r === 'X' ? 0 : 1.1);
    });
    const res = rec.res;
    if (res === 'K') {
      const label = rec.sw ? '헛스윙 삼진' : '루킹 삼진';
      tl.at(tArr, () => { this._cap(`${rec.batter}  ${label}`, `${seq.length}구 ${PT_KR[rec.pt] || ''} ${rec.velo || ''}`); this._flash('삼진', 'k'); this._outs(rec, 1);
        if (rec.half === 'top') this.sfx.cheer(0.4); });
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

  /** 야수가 공을 들었다. 던질 때까지 손에 보인다. */
  _hold(f) { this.S.ball = null; this.S.trail = []; this.S.hold = f || null; }
  _outs(rec, n) { this.S.outs = Math.min(3, this.S.outs + n); this._emitScore(rec, this._runs); }
  _settle(rec) {
    const S = this.S;
    if (rec.outs != null) S.outs = rec.outs;
    S.ball = null; S.hold = null; S.trail = []; S.swing = 0; S.pitcherWind = 0;
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
    if (this.o.onLog) this.o.onLog(rec, true);
    this.sfx.stopSong(); this.chantText = '';
    this._tallyLine(rec);
  }
  /** 전광판 숫자. 이닝별 득점 · 안타 · 실책. 기록에서 셈한다. */
  _tallyLine(rec) {
    const L = this.line, h = rec.half, i = (rec.inning || 1) - 1;
    if (!h) return;
    while (L[h].length <= i) L[h].push(0);
    L[h][i] += rec.runs || 0;
    if (['1B', '2B', '3B', 'HR'].includes(rec.res) || rec.desc === '번트 안타') L.hits[h]++;
    if (rec.res === 'E' || /실책|악송구/.test(rec.desc || '')) L.err[h === 'top' ? 'bottom' : 'top']++;
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
    // 엔진의 체공 시간은 수비 판정용이라 여유가 얹혀 있다 (hangK). 화면에서는
    // 뜬공을 조금 짧게, 홈런은 실제 타구처럼 3~5초 안에 넘긴다.
    let T = Math.max(0.35, gb ? rec.dep / ev * gbK : (rec.hang || 2.5) * (rec.bbt === 'FB' ? 0.88 : 1));
    if (rec.res === 'HR') T = Math.min(T, clamp(3.3 + ((rec.dep || 120) - 100) * 0.022, 2.4, 4.8));
    const hr = rec.res === 'HR';
    const out = rec.res === 'OUT', err = rec.res === 'E';
    const hit = !out && !err && !hr;
    // 정점 높이. 물리대로면 50m 를 넘는데 그러면 카메라 밖으로 나간다.
    // 엔진의 체공 시간이 여유를 얹은 값이기도 해서, 절반쯤으로 눌러 그린다.
    const peak = gb ? 0 : clamp(9.81 * T * T / 8 * 0.45, 1.5, 24);
    const fence = BIP.fence(rec.ang, this.dims);

    // 맞는 순간에는 타구만 말한다. 결과는 아직 모른다 — 잡을 수도, 놓칠 수도 있다.
    // 방향은 각도로만, 깊이는 말로. '우익수 뜬공' 이라 해 놓고 2루수가 잡으면 거짓말이다.
    const kind = rec.bbt === 'LD' ? '직선타' : rec.bbt === 'PU' ? '높이 뜬 공' : '뜬공';
    const side = rec.ang < -12 ? '좌측' : rec.ang > 12 ? '우측' : '중앙';
    const where = gb ? `${POS_FULL[rec.pos] || ''} 쪽 땅볼`
      : rec.dep < 45 ? `${side} 내야 ${kind}`
      : rec.dep < 68 ? `얕은 ${rec.zone || side} ${kind}`
      : rec.dep > 100 ? `깊은 ${rec.zone || side} ${kind}` : `${rec.zone || side} ${kind}`;
    tl.at(tC, () => { S.batter = null; this._cap(hr && rec.dep > 125 ? '큰 타구' : where, ''); });
    if (hit && rec.half === 'bottom') tl.at(tC + T * 0.9, () => this.sfx.cheer(0.45));
    if (out && rec.half === 'top') tl.at(tC + T, () => this.sfx.cheer(0.15));

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
      tl.at(tC + T * 0.85, () => { this._flash('홈런', 'hr'); if (rec.half === 'bottom') this.sfx.cheer(1); else this.sfx.hush(); });
      this._runnersGo(tl, rec, tC + 0.3, { trot: true });
      this._final(tl, rec); tl.add(tl.end, 1.0, null); return;
    }
    if (F) move(F, fstart, icpt, tC + fre, tF);
    // 아슬아슬한 타구 — 몸을 던진다. 닿았으면 잡고, 못 닿았으면 공이 옆으로 빠져나간다.
    // 높은 직선타는 뛰어오른다.
    const diff = rec.hard != null ? 1 - rec.hard : 0;
    const zAt = gb ? 0.3 : 0.9 + peak * 4 * 0.98 * 0.02;      // 잡는 순간 공 높이 (거의 땅 · 낙하 직전)
    const late = tF - (tC + Ti);                              // 못 닿았으면 얼마나 늦었나
    // 엔진이 '던졌다' 고 했으면 던지고, 아니면 아슬아슬할 때만.
    const dove = rec.dive === 'catch' || rec.dive === 'miss';
    if (F && !hr && (dove || (!rec.dive && ((reach && diff > 0.55) || (!reach && late < 0.7))))) {
      const dir = rec.ang > (rec.fpa ?? 0) ? 1 : -1;
      tl.add(tC + Ti - 0.25, 1.0, (k) => { F.pose = 'dive'; F.dir = dir; }, () => { F.pose = null; });
    } else if (F && !gb && !hr && rec.bbt === 'LD' && diff > 0.35) {
      tl.add(tC + Ti - 0.2, 0.6, (k) => { F.pose = 'jump'; F.jump = Math.sin(Math.PI * k); }, () => { F.pose = null; });
    }
    void zAt;

    let pickup = null, pickT = 0, thrower = F;
    if (rec.dive === 'catch') {
      // 다이빙 캐치. 그 자리에서 잡는다.
      pickup = icpt; pickT = tC + Ti + 0.5;
      tl.at(tC + Ti, () => { this._hold(F); this.sfx.pop(0.7); this._flash('다이빙 캐치', 'out'); });
    } else if (reach && !err && hit && !gb) {
      // 닿았는데 떨어졌다. 공이 앞에서 튀고, 야수가 집어 든다.
      pickup = [icpt[0], icpt[1] + 2.5]; pickT = tC + T + 0.7;
      tl.add(tC + T, 0.6, (k) => { S.ball = { x: lerp(icpt[0], pickup[0], k), y: lerp(icpt[1], pickup[1], k), z: 1.2 * Math.sin(Math.PI * k) * (1 - k * 0.5), vis: true }; this._trail(); });
      tl.at(pickT, () => this._hold(F));
    } else if (reach && !err) {
      pickup = icpt; pickT = tC + Ti;
      tl.at(pickT, () => { this._hold(F); this.sfx.pop(gb ? 0.3 : 0.55); if (out && !gb) this._flash('아웃', 'out'); });
    } else if (err) {
      // 닿았는데 놓쳤다. 공이 튀어 달아난다.
      const tE = tC + Ti;
      pickup = [icpt[0] + (rec.ang > 0 ? 3 : -3), icpt[1] + 4]; pickT = tE + 1.4;
      tl.at(tE, () => this._flash('실책!', 'err'));
      tl.add(tE, 1.0, (k) => { S.ball = { x: lerp(icpt[0], pickup[0], k), y: lerp(icpt[1], pickup[1], k), z: 0.6 * Math.abs(Math.sin(Math.PI * 2 * k)) * (1 - k), vis: true }; this._trail(); });
      move(F, icpt, pickup, tE + 0.3, pickT);
      tl.at(pickT, () => this._hold(F));
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
      tl.at(pickT, () => this._hold(thrower));
    }

    // 2b. 나머지 야수. 공을 쫓는 사람만 움직이면 야구가 아니다.
    //     베이스 커버 · 컷오프 · 백업. 누가 어디로 가는지는 타구 방향이 정한다.
    const cover = this._coverage(tl, rec, pos, thrower, tC, gb, L);   // 베이스마다 커버 도착 시각

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
      // 태그업 주자가 있으면 그 베이스로 던진다. 홈에서의 승부 — 주자가 조금 먼저다.
      const tag = adv.filter(a => a.f > 0 && a.t > a.f).sort((p, q) => q.t - p.t)[0];
      const home = F ? [F.home[0], F.home[1]] : icpt;
      if (tag) {
        const to = baseAt(tag.t), Fl = dist2(icpt, to) / 29 + 0.1;
        const rA = tC + T + 27.4 * (tag.t - tag.f) / tag.v;
        const tRel = Math.max(pickT + 0.3, rA + 0.3 - Fl);
        const tArr = this._throw(tl, icpt, to, tRel, Fl);
        if (tag.t === 4) tl.at(tArr, () => this._flash('세이프', 'safe'));
      } else this._throw(tl, icpt, BASE[2], pickT + 0.6, 1);
      move(F, icpt, home, tl.end + 0.3, tl.end + 0.3 + dist2(icpt, home) / 4.5);
      this._final(tl, rec); tl.add(tl.end, 0.9, null); return;
    }
    // 땅볼 아웃 · 병살 · 야수선택 · 안타 · 실책
    // 송구 목표: 아웃될 주자가 향하는 베이스, 먼 베이스부터. 없으면 선두 주자 앞 베이스.
    // 송구가 향한 베이스. 엔진이 시간표로 정했으면(thr) 그대로, 없으면 아웃될 주자 쪽.
    let targets;
    if (rec.thr && rec.thr.length) targets = rec.thr.map(b => ({ a: outsHere.find(a => a.f + 1 === b || (b === 4 && a.f === 3)) || null, base: b }));
    else {
      targets = outsHere.map(a => ({ a, base: a.f + 1 })).sort((p, q) => q.base - p.base);
      if (!targets.length) {
        const lead = adv.filter(a => a.t >= 1 && a.t <= 3).sort((p, q) => q.t - p.t)[0];
        targets = [{ a: null, base: lead ? Math.min(3, lead.t + (lead.t < 3 ? 1 : 0)) : 2 }];
      }
    }
    const ofThrow = thrower && ['LF', 'CF', 'RF'].includes(thrower.pos);
    let tRel = pickT + (ofThrow ? RT.releaseOF : RT.releaseIF), from = pickup || ballAt;
    const speedIF = RT.throwIF, speedOF = RT.throwOF;
    const runnerArr = (a) => runStart + (a.f === 0 ? 0.2 : 0) + 27.4 * Math.max(1, (a.t || a.f + 1) - a.f) / a.v;
    const clips = new Map();
    targets.forEach((tg, i) => {
      const to = baseAt(tg.base);
      // 먼 외야 송구는 중계수를 거친다 — 엔진과 같은 규칙, 화면에서는 두 번 날아간다.
      const dTh = dist2(from, to);
      const viaCut = i === 0 && ofThrow && !reach && dTh > RT.cutoff && tg.base === 4;
      const Fl = dTh / (i === 0 && ofThrow ? speedOF : speedIF) + 0.1 + (viaCut ? RT.cutoffRelay : 0);
      // 받을 사람이 베이스에 닿기 전에는 던지지 않는다. 투수가 1루 커버를 가는 번트가 그렇다.
      if (cover[tg.base] != null) tRel = Math.max(tRel, cover[tg.base] + 0.05 - Fl);
      if (tg.a) {
        // 아웃. 야수는 잡자마자 던진다 — 일부러 기다렸다 던지는 야수는 없다.
        // 공이 주자보다 0.25초 이상 먼저 못 가는 때만 주자를 그만큼 늦춘다.
        const rA = runnerArr(tg.a);
        if (tRel + Fl > rA - 0.25) {
          const slow = (tRel + Fl + 0.25 - runStart) / (rA - runStart);
          clips.set(tg.a, { speedMul: 1 / Math.max(1, slow) });
        }
      } else {
        // 아무도 안 잡힌다. 살아 들어가는 주자보다 공이 늦게 온다.
        const rA = Math.max(...adv.filter(a => a.t >= 1).map(runnerArr), tRel + Fl);
        tRel = Math.max(tRel, rA + 0.3 - Fl);
        // 하지만 내야 안타는 아슬아슬해야 한다
        const bat = adv.find(a => a.f === 0 && a.t === 1);
        if (bat && gb && reach) tRel = Math.max(pickT + 0.3, runnerArr(bat) + 0.18 - Fl);
      }
      const tArr = viaCut ? this._relayThrow(tl, from, to, tRel, Fl) : this._throw(tl, from, to, tRel, Fl);
      if (tg.a) {
        const a = tg.a, c = clips.get(a) || {};
        this._runnerClip(tl, a, runStart, { ...c, outAt: tArr, fadeAt: tArr + 0.25, out: true });
        tl.at(tArr, () => { this._flash(i === 0 && targets.length > 1 ? '하나' : '아웃', 'out'); this._outs(rec, 1); });
      }
      from = to; tRel = tArr + RT.relay;
    });
    for (const a of adv) if (a.t !== 0) this._runnerClip(tl, a, runStart, {});
    // 3아웃이 되는 땅볼. 밀려야 하는 주자는 기록에 갈 곳이 없어도 뛴다 — 야구는 그렇게 끝난다.
    if (gb && rec.outs >= 3 && adv.some(a => a.f === 0)) {
      const names = new Set(adv.map(a => a.n));
      // 시작 시점에 그 루에 누가 있었나. 기록에 있는 사람(뛰다 죽은 사람 포함)도 센다.
      const at = (b) => S.runners.find(r => r.base === b && !r.gone && !r.wait) || null;
      let forced = true;                           // 타자가 1루로 가니 1루 주자부터 밀린다
      for (let b = 1; b <= 3 && forced; b++) {
        const r = at(b) || (adv.find(a => a.f === b) ? {} : null);
        if (!r) { forced = false; break; }
        if (r.name && !names.has(r.name)) this._runnerClip(tl, { n: r.name, f: b, t: b + 1, v: 6.8 }, runStart, { cosmetic: true });
      }
    }
    this._final(tl, rec);
    tl.add(tl.end, 0.9, null);
  }
  /** 결과가 정해진 뒤에야 결과를 말한다. */
  _final(tl, rec) { tl.at(tl.end, () => this._cap(rec.desc, rec.bbt === 'GB' ? '' : (rec.zone || ''))); }

  /** 공 없는 야수들의 움직임. 타구를 쫓는 야수(pos)와 주우러 가는 야수(thrower)는 뺀다. */
  _coverage(tl, rec, pos, thrower, tC, gb, L) {
    const S = this.S, busy = new Set([pos, thrower && thrower.pos]);
    const cover = {};                                   // 베이스 번호 → 커버가 닿는 시각
    const go = (p, to, t0, v = 6.0, frac = 1, base = null) => {
      const f = S.fielders[p]; if (!f || busy.has(p)) return;
      const from = [f.x, f.y], tgt = [lerp(from[0], to[0], frac), lerp(from[1], to[1], frac)];
      const d = dist2(from, tgt);
      if (base) cover[base] = d < 0.5 ? tC : t0 + d / v;
      if (d < 0.5) return;
      tl.add(t0, d / v, (k) => { f.x = lerp(from[0], tgt[0], k); f.y = lerp(from[1], tgt[1], k); });
    };
    const t0 = tC + 0.35, right = rec.ang > 0;
    const runnersOn = S.runners.some(r => !r.gone && !r.wait);
    // 1루 — 1루수가 잡으러 갔으면 투수가 커버한다
    if (busy.has('1B')) go('P', BASE[1], t0, 6.0, 1, 1); else go('1B', BASE[1], t0, 6.0, 1, 1);
    // 2루 — 유격수와 2루수 중 공 반대편이 베이스로, 같은 편은 공 쪽으로 (백업·컷오프)
    const midCover = right ? 'SS' : '2B', midHelp = right ? '2B' : 'SS';
    go(midCover, BASE[2], t0, 6.0, 1, 2);
    if (gb) go(midHelp, L, t0 + 0.1, 6.0, 0.35);
    else go(midHelp, L, t0 + 0.1, 6.0, 0.45);             // 컷오프 자리로
    // 3루 — 주자가 있거나 좌측 타구면 3루수는 베이스를 지킨다
    if (runnersOn || !right) go('3B', BASE[3], t0, 6.0, 1, 3);
    // 투수 — 외야로 간 공이면 송구가 올 베이스 뒤를 백업한다
    if (!gb && !busy.has('P')) {
      const back = runnersOn ? BASE[3] : BASE[2];
      go('P', [back[0] * 1.15, back[1] * 1.15 + 3], t0 + 0.2, 5.5);
    }
    // 다른 외야수들은 공 쪽으로 몇 걸음 백업
    for (const p of ['LF', 'CF', 'RF']) go(p, L, t0, 5.5, 0.28);
    return cover;
  }

  /** 중계 송구. 외야수 → 중계수 → 베이스. 중계수는 둘 사이 40% 지점의 내야수다. */
  _relayThrow(tl, from, to, t0, Fl) {
    const cut = [lerp(from[0], to[0], 0.55), lerp(from[1], to[1], 0.55)];
    const d1 = dist2(from, cut), d2 = dist2(cut, to);
    const f1 = (Fl - RT.cutoffRelay - 0.1) * d1 / (d1 + d2) + 0.05, f2 = Fl - RT.cutoffRelay - f1;
    // 가장 가까운 내야수가 그 자리로 간다
    let best = null;
    for (const p of ['SS', '2B', '1B', '3B']) { const f = this.S.fielders[p]; if (!f) continue;
      const d = dist2([f.x, f.y], cut); if (!best || d < best.d) best = { f, d }; }
    if (best) { const fr = [best.f.x, best.f.y]; tl.add(t0 - 0.5, Math.max(0.2, f1 + 0.3), (k) => { best.f.x = lerp(fr[0], cut[0], k); best.f.y = lerp(fr[1], cut[1], k); }); }
    const t1 = this._throw(tl, from, cut, t0, f1);
    return this._throw(tl, cut, to, t1 + RT.cutoffRelay, f2);
  }

  /** 송구. 도착 시각을 돌려준다. */
  _throw(tl, from, to, t0, Fl) {
    const S = this.S;
    const d = dist2(from, to), arc = clamp(d / 14, 0.8, 4.5);
    tl.add(t0, Fl, (k) => { S.hold = null; S.ball = { x: lerp(from[0], to[0], k), y: lerp(from[1], to[1], k), z: 1.4 + arc * 4 * k * (1 - k), vis: true }; this._trail(); },
      () => {
        // 받는 사람 — 그 베이스에 가장 가까운 야수. 없으면 공은 그냥 사라진다.
        let best = null;
        for (const f of Object.values(S.fielders)) { const dd = dist2([f.x, f.y], to); if (dd < 4 && (!best || dd < best.dd)) best = { f, dd }; }
        this._hold(best ? best.f : null); this.sfx.pop(0.5);
      });
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
      if (a.t === 4 && o.cosmetic) { r.gone = true; return; }     // 뛰기는 했지만 득점은 아니다
      if (a.t === 4) {
        r.gone = true; this._score(1, this._rec);
        // 점수가 났다 — 이닝 카드처럼 크게. 몇 대 몇이 됐는지.
        const rec = this._rec, top = rec && rec.half === 'top';
        const A = top ? this._runs : rec.rd, H = top ? rec.rd : this._runs;
        this._flash(`<span class="${top ? 'lit' : ''}">${short(this.o.away)} ${A}</span><i>:</i><span class="${top ? '' : 'lit'}">${H} ${short(this.o.home)}</span>`, 'score', `${a.n} 득점`);
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
      tl.at(tArr + 1.3, () => this._hold(Cf));
      tl.add(tArr + 2.4, 1.2, (k) => { Cf.x = 1.5 * (1 - k); Cf.y = -10.6 + 9 * k; }); }
    if (d3) { this._throw(tl, [1.5, -10.6], BASE[1], tArr + 1.6, 1.1); }
    else if (!Cf) tl.at(tArr + 1.4, () => { S.ball = null; });
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
    this._cap(rec.desc, rec.lead ? `리드 ${rec.lead}m` : '');
    const r = a ? S.runners.find(x => x.name === a.n && !x.gone) : S.runners.find(x => x.base === 1 && !x.gone);
    const A = BASE[1], toward = BASE[2];
    const L = (rec.lead || RT.lead) / 27.43;
    if (r) { r.x = lerp(A[0], toward[0], L); r.y = lerp(A[1], toward[1], L); }
    const tHit = this._throw(tl, MOUND, A, 0.45, 0.55);
    // 귀루 — 헤드퍼스트. 리드가 클수록 아슬아슬하다.
    if (r) tl.add(0.5, 0.45 + L * 2.5, (k) => { r.x = lerp(lerp(A[0], toward[0], L), A[0], k); r.y = lerp(lerp(A[1], toward[1], L), A[1], k); r.moving = k < 1; });
    if (a && a.t === 0 && r) { tl.at(tHit + 0.1, () => { r.out = true; this._flash('아웃', 'out'); this._outs(rec, 1); });
      tl.add(tHit + 0.4, 0.6, (k) => { r.alpha = 1 - k; }, () => { r.gone = true; }); }
    else if (a) { /* 악송구 */ this._runnersGo(tl, rec, tHit + 0.2, {}); }
    else tl.at(tHit + 0.1, () => this._flash('세이프', 'safe'));
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
    this._scoreboard(ctx, V);
    const S = this.S;
    // 그림자와 사람은 멀리 있는 것부터
    const items = [];
    const defC = this._defColor(), offC = this._offColor();
    for (const f of Object.values(S.fielders)) {
      if (f.pos === 'C' && !S.catcher) continue;
      if (f.wait) continue;
      items.push({ kind: 'fig', p: V.proj(f.x, f.y), color: defC, label: f.pos, name: f.name, dir: f.dir, jump: f.jump,
        pose: f.pose || (f.moving ? 'run' : f.pos === 'C' ? 'crouch' : f.pos === 'P' ? 'pitch' : 'field'), alpha: f.alpha });
    }
    // 들어가는 사람들 — 공수 교대, 내려가는 투수
    if (S.exiting) for (const f of S.exiting)
      items.push({ kind: 'fig', p: V.proj(f.x, f.y), color: f.color || defC, pose: 'run', alpha: f.alpha });
    for (const r of S.runners) if (!r.gone && !r.wait) items.push({ kind: 'fig', p: V.proj(r.x, r.y), color: offC, pose: r.moving ? 'run' : 'stand', alpha: r.alpha, out: r.out, name: r.name, runner: true });
    if (S.batter) items.push({ kind: 'fig', p: V.proj(S.batter.hand === 'L' ? 0.85 : -0.85, 0.1), color: offC, pose: 'bat', hand: S.batter.hand, alpha: S.batter.alpha, swing: S.swing, bunt: S.batter.bunt });
    items.push({ kind: 'fig', p: V.proj(0, -3.2), color: C.ump, pose: 'ump', alpha: 1 });
    if (S.ball && S.ball.vis) items.push({ kind: 'ball', p: V.proj(S.ball.x, S.ball.y, S.ball.z) });
    if (S.hold) { const p = V.proj(S.hold.x, S.hold.y); items.push({ kind: 'held', p: { ...p, depth: p.depth - 0.01 } }); }
    items.sort((a, b) => b.p.depth - a.p.depth);
    // 궤적
    if (S.trail.length > 1) {
      ctx.beginPath();
      S.trail.forEach((t, i) => { const p = V.proj(t[0], t[1], t[2]); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.strokeStyle = C.trail; ctx.lineWidth = this.view === 'top' ? 1.6 : 2; ctx.lineCap = 'round'; ctx.stroke();
    }
    for (const it of items) {
      if (it.kind === 'ball') this._ball(ctx, V, it.p);
      else if (it.kind === 'held') this._held(ctx, V, it.p);
      else if (this.view === 'top') this._dot(ctx, V, it);
      else this._figure(ctx, V, it);
    }
  }

  /** 전광판. 중견수 뒤 관중석 위에 선다. 야구장에 있는 그것 — 이닝별 득점과 R H E. */
  _scoreboard(ctx, V) {
    const persp = this.view !== 'top';
    const L = this.line, S = this.S;
    const n = Math.max(9, L.top.length, L.bottom.length);
    const w = V.W * (persp ? 0.29 : 0.34), cols = n + 3, cw = w / (cols + 1.6);
    const rh = persp ? 11 : 10, h = rh * 3.9;
    const dims = this.dims, fc = BIP.fence(0, dims);
    const standD = 14 + ((this.o.park && this.o.park.capacity ? this.o.park.capacity : 18000) - 13000) / 13500 * 12;
    const fh = dims.real ? dims.real.fH || 3 : 3;
    const p = persp ? V.proj(0, fc, fh) : V.proj(0, fc + standD + 2);
    const x0 = p.x - w / 2 + (persp ? -6 : 0), y0 = persp ? Math.max(2, p.y - h - 4) : Math.max(3, p.y - h - 3);
    // 판. 밤의 전광판은 검고, 숫자는 주황 LED 다.
    ctx.fillStyle = '#070b10'; rr(ctx, x0, y0, w, h, 2); ctx.fill();
    ctx.strokeStyle = '#2b3a4b'; ctx.lineWidth = 1; rr(ctx, x0 + 0.5, y0 + 0.5, w - 1, h - 1, 2); ctx.stroke();
    if (persp) { ctx.fillStyle = '#1b2634'; ctx.fillRect(p.x - 3, y0 + h, 6, 5); }   // 기둥
    const led = '#ffb84d', dim = '#3b4756', lit = '#fff1d6';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const fx = (c) => x0 + cw * 1.6 + cw * (c + 0.5);
    ctx.font = `700 ${rh * 0.62}px "IBM Plex Mono",ui-monospace,monospace`;
    // 머릿줄
    for (let c = 0; c < n; c++) { const on = S.inning === c + 1; ctx.fillStyle = on ? lit : dim; ctx.fillText(c + 1, fx(c), y0 + rh * 0.6); }
    ['R', 'H', 'E'].forEach((t, k) => { ctx.fillStyle = dim; ctx.fillText(t, fx(n + k), y0 + rh * 0.6); });
    const row = (half, name, y) => {
      const arr = L[half], cur = S.half === half;
      ctx.textAlign = 'left'; ctx.fillStyle = cur ? lit : '#aab6c3';
      ctx.font = `700 ${rh * 0.66}px "Pretendard","Apple SD Gothic Neo",sans-serif`;
      ctx.fillText(short(name).slice(0, 3), x0 + cw * 0.35, y);
      ctx.textAlign = 'center'; ctx.font = `700 ${rh * 0.72}px "IBM Plex Mono",ui-monospace,monospace`;
      for (let c = 0; c < n; c++) {
        const played = c < arr.length;
        ctx.fillStyle = played ? (arr[c] > 0 ? led : '#c9a56a') : dim;
        ctx.fillText(played ? arr[c] : '', fx(c), y);
      }
      ctx.fillStyle = led;
      const R = arr.reduce((a, b) => a + b, 0);
      [R, L.hits[half], L.err[half]].forEach((v, k) => ctx.fillText(v, fx(n + k), y));
    };
    row('top', this.o.away, y0 + rh * 1.6);
    row('bottom', this.o.home, y0 + rh * 2.55);
    // 아래 줄 — B S O
    const dots = (label, cnt, max, x, col) => {
      ctx.textAlign = 'left'; ctx.font = `700 ${rh * 0.55}px "IBM Plex Mono",ui-monospace,monospace`;
      ctx.fillStyle = dim; ctx.fillText(label, x, y0 + rh * 3.45);
      for (let k = 0; k < max; k++) { ctx.beginPath(); ctx.arc(x + rh * 0.7 + k * rh * 0.5, y0 + rh * 3.45, rh * 0.17, 0, Math.PI * 2);
        ctx.fillStyle = k < cnt ? col : '#22303e'; ctx.fill(); }
    };
    dots('B', S.b, 3, x0 + cw * 0.35, '#4bb37b'); dots('S', S.s, 2, x0 + cw * 0.35 + rh * 2.6, '#e8c23a'); dots('O', Math.min(S.outs, 2), 2, x0 + cw * 0.35 + rh * 4.6, '#d85e5e');
    // 오른쪽에는 응원 구호. 전광판이 실제로 띄우는 그것 — 타석 내내 켜져 있다.
    if (this.chantText) {
      ctx.textAlign = 'right'; ctx.fillStyle = led;
      ctx.font = `700 ${rh * 0.62}px "Pretendard","Apple SD Gothic Neo",sans-serif`;
      ctx.fillText(this.chantText, x0 + w - cw * 0.4, y0 + rh * 3.45);
    }
    ctx.textBaseline = 'alphabetic';
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

  /** 손에 든 공. 사람 옆에 작은 흰 점 하나. */
  _held(ctx, V, p) {
    const top = this.view === 'top';
    const h = top ? 5.4 : V.figH(p);
    const x = top ? p.x + 5.2 : p.x + h * 0.3, y = top ? p.y - 4.6 : p.y - h * 0.62;
    const r = top ? 2.2 : Math.max(1.8, h * 0.075);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = C.ball; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = C.ballEdge; ctx.stroke();
  }

  /** 탑다운의 사람 — 점과 글자 */
  _dot(ctx, V, it) {
    const p = it.p, r = 5.4;
    ctx.save(); ctx.globalAlpha = it.alpha ?? 1;
    ctx.beginPath();
    if (it.pose === 'dive') ctx.ellipse(p.x + (it.dir || 1) * r * 0.8, p.y, r * 1.7, r * 0.75, 0, 0, Math.PI * 2);
    else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
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
    let x = p.x, y = p.y;
    ctx.save(); ctx.globalAlpha = it.alpha ?? 1;
    if (it.pose === 'dive') {
      // 몸을 던진다 — 발을 축으로 눕힌다. 그림자는 길게.
      ctx.fillStyle = C.shadow; ctx.beginPath(); ctx.ellipse(x + (it.dir || 1) * h * 0.3, y, h * 0.55, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(x, y); ctx.rotate((it.dir || 1) * 1.25); ctx.translate(-x, -y);
    } else if (it.pose === 'jump') {
      ctx.fillStyle = C.shadow; ctx.beginPath(); ctx.ellipse(x, y, h * 0.3, h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      y -= h * 0.32 * (it.jump || 0);
    }
    if (it.pose !== 'dive' && it.pose !== 'jump') { ctx.fillStyle = C.shadow;
      ctx.beginPath(); ctx.ellipse(x, y, h * 0.34, h * 0.09, 0, 0, Math.PI * 2); ctx.fill(); }
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
    } else if (it.pose === 'jump' || it.pose === 'dive') {
      ctx.moveTo(x - tw / 2, ty + th * 0.2); ctx.lineTo(x - tw * 0.6, ty - h * 0.2);
      ctx.moveTo(x + tw / 2, ty + th * 0.2); ctx.lineTo(x + tw * 0.6, ty - h * 0.22); ctx.stroke();
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

  /* ── 경기 전 카드 ───────────────────────────────────────
     오늘의 카드. 선발 대결 · 라인업 · 불펜. '플레이볼' 을 누르면 시작한다. */
  _preCard(rec, done) {
    const el = this.el.pre;
    const side = (S, cls) => `<div class="lv-pre-team ${cls}" style="--tc:${cls === 'home' ? this.o.colors.home : this.o.colors.away}">
      <div class="lv-pre-name"><i></i>${short(S.team)}</div>
      <div class="lv-pre-sp">${ic('ball')}<b>${S.starter.name}</b><span>${S.starter.throws === 'L' ? '좌완' : '우완'}${S.penDay ? ' · 불펜데이' : ''}</span></div>
      <details class="lv-pre-roster" ${this._narrow ? '' : 'open'}><summary>라인업 · 불펜</summary><ol class="lv-pre-order">${S.order.map(b => `<li><em>${b.pos}</em>${b.name}<span>${b.bats === 'L' ? '좌' : '우'}</span></li>`).join('')}</ol>
      <div class="lv-pre-pen">${ic('glove')}${S.pen.slice(0, 5).map(p => `<span>${p.name}</span>`).join('')}${S.pen.length > 5 ? `<span>+${S.pen.length - 5}</span>` : ''}</div></details>
    </div>`;
    el.innerHTML = `<div class="lv-pre-in">
      <div class="lv-pre-head">${this.o.crowd ? `관중 ${this.o.crowd.toLocaleString()} · ` : ''}${this.o.park && this.o.park.name ? this.o.park.name : ''}</div>
      <div class="lv-pre-grid">${side(rec.away, 'away')}<div class="lv-pre-vs">VS</div>${side(rec.home, 'home')}</div>
      <button class="go lv-pre-go">${ic('play')}<span>플레이볼</span></button>
    </div>`;
    el.hidden = false;
    el.querySelector('.lv-pre-go').focus();
    el.querySelector('.lv-pre-go').onclick = () => { el.hidden = true; done(); };
    this._preDone = () => { el.hidden = true; done(); };
  }
  /** 이닝 사이 카드. 다음 타순과 불펜. 감독이 손을 쓰는 시간이다. */
  _innCard(rec) {
    this.o.onScore?.({ inn:rec.inning, half:rec.half, outs:0, base:[null,null,null], b:0, s:0 });
    if (rec.due?.[0]) this.el.bugBn.textContent = rec.due[0].name;
    const el = this.el.inn;
    const due = (rec.due || []).map((b, i) => `<li><em>${b.pos}</em>${b.name}</li>`).join('');
    const pen = (rec.pen || []).slice(0, 4).map(p => `<span>${p.name}<i>${p.slot}</i></span>`).join('');
    el.innerHTML = `<div class="lv-inn-h">${rec.inning}회 ${rec.half === 'top' ? '초' : '말'}<small>${rec.off} 공격</small></div>
      <div class="lv-inn-body">
        <div><div class="lab">${ic('bat')} 타순</div><ol>${due}</ol></div>
        <div><div class="lab">${ic('glove')} ${short(rec.def)} 불펜</div><div class="lv-inn-pen">${pen || '—'}</div></div>
      </div>`;
    el.hidden = false;
  }

  /* ── 감독 패널 ────────────────────────────────────────────
     경기 중 손을 쓴다. 명령은 다음 타석 전에 엔진이 꺼내 쓴다. */
  _mgr() {
    const el = this.el.mgr, sd = this.side;
    if (!el || !this.o.command || !sd || !sd.mine) { if (el) el.hidden = true; return; }
    el.hidden = false;
    const summary = this.root.querySelector('.lv-manager-details summary');
    if (summary) summary.textContent = '작전 지시' + (Object.keys(this.pending).length ? ' · 예약 있음' : '');
    const P = this.pending, off = sd.mine === 'off';
    const pend = (k, label) => P[k] ? `<div class="lv-pend"><span>다음 타석 · ${label}</span><button data-cancel="${k}" class="quiet">취소</button></div>` : '';
    if (off) {
      el.innerHTML = `<div class="lv-mgr-h">감독 · 공격</div>
        ${pend('pinch', `대타 ${P.pinch && P.pinch.name || ''}`)}${pend('bunt', '번트')}${pend('steal', '도루')}${pend('approach', `타격 ${P.approach ? AP_KR[P.approach.mode] : ''}`)}
        <div class="lv-mgr-row">
          <button data-open="pinch" ${sd.bench.length ? '' : 'disabled'}>${ic('pinch')}<span>대타</span></button>
          <button data-cmd="bunt" class="${P.bunt ? 'on' : ''}">${ic('bunt')}<span>번트</span></button>
          <button data-cmd="steal" class="${P.steal ? 'on' : ''}">${ic('steal')}<span>도루</span></button>
        </div>
        <div class="lv-mgr-row lv-shift"><span class="lab">${ic('swing')} 타격</span>${['power','line','oppo','contact'].map(m =>
          `<button data-ap="${m}" class="${P.approach && P.approach.mode === m ? 'on' : ''}">${AP_KR[m]}</button>`).join('')}</div>
        <div class="lv-mgr-list" hidden>${sd.bench.map(b => `<button data-pinch="${b.pid}">${b.name}<i>${b.slot}</i></button>`).join('')}</div>`;
    } else {
      const cur = sd.cur;
      el.innerHTML = `<div class="lv-mgr-h">감독 · 수비</div>
        ${cur ? `<div class="lv-mgr-cur">${cur.name} <b class="m">${cur.np}구</b><span class="lv-tired"><i style="width:${100 - clamp(cur.tired, 0, 100)}%"></i></span></div>` : ''}
        ${pend('hook', `투수 ${P.hook && P.hook.name || ''}`)}${pend('ibb', '고의사구')}
        <div class="lv-mgr-row">
          <button data-open="hook" ${sd.pen.length ? '' : 'disabled'}>${ic('hook')}<span>투수 교체</span></button>
          <button data-cmd="ibb" class="${P.ibb ? 'on' : ''}">${ic('ibb')}<span>고의사구</span></button>
        </div>
        <div class="lv-mgr-row lv-shift"><span class="lab">${ic('shift')} 시프트</span>${[0,1,2,3,4].map(d =>
          `<button data-shift="${d}" class="${(P.shift ? P.shift.dial : sd.shift) === d ? 'on' : ''}">${['없음','약간','보통','자주','적극'][d]}</button>`).join('')}</div>
        <div class="lv-mgr-list" hidden>${sd.pen.map(p => `<button data-hook="${p.pid}">${p.name}<i>${p.slot}</i></button>`).join('')}</div>`;
    }
    const list = el.querySelector('.lv-mgr-list');
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { list.hidden = !list.hidden; });
    el.querySelectorAll('[data-pinch]').forEach(b => b.onclick = () => this._cmd('pinch', { pid: +b.dataset.pinch, name: b.firstChild.textContent }));
    el.querySelectorAll('[data-hook]').forEach(b => b.onclick = () => this._cmd('hook', { pid: +b.dataset.hook, name: b.firstChild.textContent }));
    el.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => P[b.dataset.cmd] ? this._uncmd(b.dataset.cmd) : this._cmd(b.dataset.cmd, {}));
    el.querySelectorAll('[data-shift]').forEach(b => b.onclick = () => this._cmd('shift', { dial: +b.dataset.shift }));
    el.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => P.approach && P.approach.mode === b.dataset.ap ? this._uncmd('approach') : this._cmd('approach', { mode: b.dataset.ap }));
    el.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => this._uncmd(b.dataset.cancel));
  }
  _cmd(kind, a) { this.pending[kind] = a; this.o.command({ kind, ...a }); this._mgr(); }
  _uncmd(kind) { delete this.pending[kind]; if (this.o.cancel) this.o.cancel(kind); this._mgr(); }
  /** 타석이 시작됐다. 엔진이 명령을 꺼내 썼으니 표시를 지운다. 시프트는 유지된다. */
  _mgrConsumed() { const sh = this.pending.shift; this.pending = sh ? { shift: sh } : {}; if (this.side) this._mgr(); }

  /* ── 승부처 오버레이 ── */
  ask(html) {
    this._closePanels(); this.askFocus = document.activeElement;
    this.el.ask.innerHTML = html; this.el.ask.hidden = false;
    this.el.ask.setAttribute('role', 'group'); this.el.ask.setAttribute('aria-label', '승부처 선택');
    this.root.querySelector('.lv-main').inert = this._narrow;
    const top = this.root.closest('.gs')?.querySelector('.gs-top'); if (top) top.inert = this._narrow;
    this.el.ask.tabIndex = -1; this.el.ask.focus();
    return this.el.ask;
  }
  unask() {
    this.el.ask.hidden = true; this.el.ask.innerHTML = '';
    this.root.querySelector('.lv-main').inert = false;
    const top = this.root.closest('.gs')?.querySelector('.gs-top'); if (top) top.inert = false;
    if (this.askFocus?.isConnected) this.askFocus.focus();
  }
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
