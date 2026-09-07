// UI. api.js 가 돌려주는 순수 데이터만 그린다.
// 모든 능력치는 하나의 20~80 눈금축 위에, 어디서나 같은 좌표로 놓인다.
import { MEET_KR, MEDAL_KR } from './core/military.js';
import { Game } from './core/api.js';
import { josa } from './core/mail.js';
import { SUR } from './core/names.js';
import * as save from './save.js';
import * as card from './share.js';
import * as BIP from './core/bip.js';
import { PITCH } from './core/pitch.js';
import { LiveView, icon } from './live.js';

const KEY = 'dugout.save.v1';
/* 경기는 공 하나하나 본다. 축구는 하이라이트로 봐도 되지만 야구는 투구 하나가
   장면이다. 미리 고르게 하지 않는다 — 일단 띄우고, 언제든 건너뛸 수 있게 한다.
   배속과 시점은 기억한다. */
const livePrefs = () => {
  let speed = 'auto', view = 'persp', sound = false;
  try { const v = localStorage.getItem('dugout.speed'); speed = v === null || v === 'auto' ? 'auto' : +v;
        view = localStorage.getItem('dugout.view') || 'persp';
        sound = localStorage.getItem('dugout.sfx') === '1'; } catch {}
  return { speed: speed === 'auto' || [1, 2, 4, 8].includes(speed) ? speed : 'auto', view, sound };
};
const FACE_KEY = 'dugout.faces';
let facesOn = (() => { try { return localStorage.getItem(FACE_KEY) !== '0'; }
                       catch { return true; } })();
const setFaces = (on) => { facesOn = on;
  try { localStorage.setItem(FACE_KEY, on ? '1' : '0'); } catch {} };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (t, c, h) => { const e = document.createElement(t);
  if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const short = (s) => String(s).split(' ')[0];
// 순위 색: 상위 30% 강점(그린), 하위 30% 약점(레드), 나머지 기본
const rkCls = (r, of) => r <= Math.ceil(of * 0.3) ? 'r1' : (r >= Math.floor(of * 0.7) + 1 ? 'r3' : '');
const rkNum = (r, of) => `<b class="m ${rkCls(r, of)}">${r}위</b>`;

let G = null, tab = 'home', saveTimer = null, lastPhase = null, lastBox = null;
let luSel = null, luRot = null;   // 편성 화면에서 고른 타순 / 선발

/* ── 저장 ── */
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save.dump(G))); }
  catch { toast('저장 실패', '저장 공간이 부족하다', 'injury'); }
}
const autosave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400); };

/* 세이브를 파일로 꺼낸다.
   브라우저 저장소는 영구적이지 않다 — 사파리는 한동안 안 들어오면 지운다.
   기기를 바꿔도 사라진다. 몇 시즌 키운 구단이 그렇게 없어지면 안 된다. */
function saveFileName(blob) {
  const t = blob.teams.find(x => x.id === blob.user);
  return `dugout-${(t ? t.name : '세이브').replace(/\s+/g, '')}-${blob.year}.json`;
}
async function exportSave() {
  const blob = save.dump(G);
  const name = saveFileName(blob);
  const file = new File([JSON.stringify(blob)], name, { type: 'application/json' });
  // 폰에서는 공유 시트가 낫다. 파일 앱이든 메신저든 사용자가 고른다.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }   // 사용자가 닫았다
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('내보냈다', name);
}
function importSave(file, onDone) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const g = save.load(JSON.parse(r.result));
      G = g; persist(); onDone();
    } catch (e) { toast('불러오기 실패', '세이브 파일이 아니다', 'injury'); }
  };
  r.onerror = () => toast('불러오기 실패', '파일을 읽지 못했다', 'injury');
  r.readAsText(file);
}
/** 파일 고르기 창을 띄운다. */
function pickSaveFile(onDone) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = () => { if (inp.files && inp.files[0]) importSave(inp.files[0], onDone); };
  inp.click();
}

/* ══ 눈금축 — 시그니처 ══
   실선 = 현재 추정 구간, 해칭 = 잠재력 구간. 20·35·50·65·80 눈금 위에 놓인다. */
const AXIS_KEY = '20–80';
const pos = (v) => (Math.max(20, Math.min(80, v)) - 20) / 60 * 100;
function axis(cur, pot, size = '', inline = false) {
  const seg = (r, tag) => {
    const W = Math.max(2.5, pos(r.hi) - pos(r.lo));
    const L = Math.min(pos(r.lo), 100 - W);
    return `<${tag} style="left:${L}%;width:${W}%"></${tag}>`;
  };
  const bar = `<span class="ax ${size}">${pot ? seg(pot, 'u') : ''}${seg(cur, 'i')}</span>`;
  return size === 'big' ? bar : inline ? bar
    : `<span class="axrow">${bar}<span class="axnum">${Math.round(cur.lo)}–${Math.round(cur.hi)}</span></span>`;
}

/* ── 알림 ── */
function toast(label, text, kind = '') {
  const t = el('div', 'toast ' + kind, `<span class="lab">${esc(label)}</span>${esc(text)}`);
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4600);
}

/* ── 구단 정체성: 야구 모자 로고 ── */
import { franchiseOf, FRANCHISES, GEO, COAST, JEJU } from './core/names.js';

/** 연고지 지도. 실제 위경도를 등장방형으로 투영한다. */
function drawMap(teams, selName) {
  // 위도 1도 ≈ 111km, 경도 1도 ≈ 90km(위도 36도). 종횡비를 지켜야 남한처럼 보인다.
  const lats = [38.6, 33.1], lons = [125.9, 129.8];
  const H = 430, W = Math.round(H * (lons[1] - lons[0]) * Math.cos(35.8 * Math.PI / 180)
    / ((lats[0] - lats[1]) * 1.0)), PAD = 12;
  const px = (lat, lon) => [
    PAD + (lon - lons[0]) / (lons[1] - lons[0]) * (W - PAD * 2),
    PAD + (lats[0] - lat) / (lats[0] - lats[1]) * (H - PAD * 2)];
  const path = (pts) => pts.map(([a, b], i) =>
    (i ? 'L' : 'M') + px(a, b).map(v => v.toFixed(1)).join(' ')).join(' ') + ' Z';
  const dots = teams.map(name => {
    const f = franchiseOf(name), g = GEO[f.city];
    if (!g) return '';
    const [x, y] = px(g[0], g[1]);
    const on = name === selName;
    return `<g class="mdot ${on ? 'on' : ''}">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 6.5 : 4}"
        fill="${f.color}" stroke="#0a1119" stroke-width="1.4"/>
      ${on ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="none"
        stroke="${f.color}" stroke-width="1.4" opacity=".5"/>
        <text x="${x.toFixed(1)}" y="${(y - 19).toFixed(1)}" text-anchor="middle"
          class="mlabel">${esc(f.city)}</text>` : ''}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="kmap" aria-label="연고지 지도">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d3346"/><stop offset="1" stop-color="#152532"/>
    </linearGradient></defs>
    <path d="${path(COAST)}" class="mland" fill="url(#lg)"/>
    <path d="${path(JEJU)}" class="mland" fill="url(#lg)"/>
    ${dots}</svg>`;
}

const SCALE = ['20','30','40','50','60','70','80'];
// '팜' 은 MLB 용어다. 한국 야구는 2군·육성·유망주라고 쓴다.
/** 이 색 위에 올릴 글자색. 팀 컬러는 금색부터 짙은 갈색까지라
 *  한쪽으로 고정하면 어느 구단에서는 반드시 안 읽힌다. */
function onColor(hex) {
  const v = (i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * v(1) + 0.7152 * v(3) + 0.0722 * v(5);
  return L > 0.34 ? '#08121b' : '#f6f9fc';
}
const capOf = (name) => { const f = franchiseOf(name);
  return { code: f.code, color: f.color, mark: f.mark || f.code[0], fg: onColor(f.color) }; };
/** 팀 색과 그 위 글자색을 한 쌍으로 심는다. */
const tcVars = (c) => `--tc:${c.color};--tcfg:${c.fg}`;
/** 선수 아바타. 체격·머리·수염·피부를 조합한다.
 *  키와 몸무게가 어깨 너비와 얼굴 폭에 반영되므로 거포는 다부지고 대도는 날렵하다. */
const SKIN = ['#e3c0a0', '#d3a985', '#bd8f68', '#9d6f4c'];
const HAIRC = ['#17120e', '#2b1c12', '#4a3320'];
/* 유니폼 한 벌. 홈은 밝은 바탕에 팀 색, 원정은 구단마다 다른 바탕. */
function jersey(fr, away, w = 96) {
  const uni = fr.uni || { hb:'#f5f6f8', hs:0, ab:'#8b939b' };
  const base = away ? uni.ab : uni.hb;
  const trim = fr.color;
  const dark = away && luma(base) < 0.45;          // 어두운 원정 바탕에는 흰 글씨
  const ink = dark ? '#f2f5f8' : trim;
  const stripes = !away && uni.hs
    ? Array.from({ length: 7 }, (_, i) =>
        `<line x1="${18 + i * 8}" y1="16" x2="${18 + i * 8}" y2="96" stroke="${trim}"
          stroke-width="1" opacity=".38"/>`).join('')
    : '';
  // 홈은 닉네임, 원정은 연고지. 실제 유니폼이 그렇게 나뉜다.
  const word = away ? fr.city : fr.nick;
  const body = 'M40 8 L60 17 L80 8 L110 21 L101 46 L90 41 V102 H30 V41 L19 46 L10 21 Z';
  return `<svg class="jsy" viewBox="0 0 120 112" width="${w}" height="${w * 0.93}">
    <path d="${body}" fill="${base}"/>
    ${stripes}
    <path d="${body}" fill="none" stroke="${trim}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M40 8 L60 17 L80 8 L73 5.5 L60 12 L47 5.5 Z" fill="${trim}"/>
    <path d="M30 102 H90" stroke="${trim}" stroke-width="4"/>
    <path d="M19 46 L10 21 M101 46 L110 21" stroke="${trim}" stroke-width="3"/>
    <line x1="60" y1="17" x2="60" y2="102" stroke="${trim}" stroke-width="1.2" opacity=".55"/>
    <text x="60" y="46" text-anchor="middle" font-weight="800" fill="${ink}"
      font-size="${word.length >= 5 ? 12 : word.length >= 4 ? 13.5 : 16}"
      textLength="${Math.min(52, word.length * 13)}" lengthAdjust="spacingAndGlyphs">${esc(word)}</text>
    <text x="60" y="82" text-anchor="middle" font-family="var(--mono)" font-size="27"
      font-weight="700" fill="${ink}" opacity=".92">${away ? '7' : '1'}</text>
  </svg>`;
}
const luma = (hex) => {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
};

function avatar(p, teamColor, size = 38, away = false, fr = null) {
  if (!facesOn) return '';
  const h = ((p.pid || 0) * 2654435761) >>> 0;
  // 국내는 피부 폭이 좁다. 외국인은 넓게 잡는다.
  const skin = p.foreign ? SKIN[h % SKIN.length] : SKIN[h % 2];
  const age = p.age || 27;
  let hair = (h >> 3) % 5;        // 0 짧음 1 옆머리 2 덥수룩 3 삭발 4 장발
  // 나이가 들면 벗겨지기도 한다
  if (age >= 34 && ((h >> 17) % 100) / 100 < (age - 33) * 0.05) hair = 3;
  const beard = (h >> 7) % 4;     // 0,1 없음 2 콧수염 3 턱수염
  // 흰머리. 33세부터 섞이기 시작해 45세면 거의 다 센다. 30시즌을 지나면 이게 보인다.
  const grey = Math.max(0, Math.min(1, (age - 33) / 12));
  const hc0 = HAIRC[(h >> 11) % 3];
  const hc = grey <= 0.02 ? hc0
    : `color-mix(in srgb, #b9b9c2 ${Math.round(grey * 100)}%, ${hc0})`;
  const ht = p.height || 182, wt = p.weight || 88;
  const build = Math.max(0, Math.min(1, (wt / ((ht / 100) ** 2) - 22) / 8));
  const sw = 10.5 + build * 5.2;                 // 어깨 반너비
  const fw = 6.4 + build * 1.1, fh = 7.4;        // 얼굴 반너비/반높이
  const cy = 17.2;                                // 얼굴 중심
  const eye = cy + 1.0;
  const crownY = cy - fh * 0.62;                  // 모자 크라운 아랫선 (눈보다 위)
  const S = (n) => n.toFixed(1);
  const sideHair = hair === 1 || hair === 2 || hair === 4;
  return `<span class="av" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">
      <rect width="40" height="40" rx="20" fill="#0c151f"/>
      <path d="M20 25.8c-1.6 0-2.9-.5-2.9-.5v2.4h5.8v-2.4s-1.3.5-2.9.5z" fill="${skin}"/>
      <path d="M${S(20 - sw)} 40c0-7.4 ${S(sw * 0.34)} -11.6 ${S(sw)} -13.2
        ${S(sw * 0.66)} 1.6 ${S(sw)} 5.8 ${S(sw)} 13.2z"
        fill="${away ? ((fr && fr.uni && fr.uni.ab) || '#8b939b') : ((fr && fr.uni && fr.uni.hb) || '#e6ecf3')}"/>
      <path d="M${S(20 - 4.6)} 27.3c1.2 2.9 2.6 5.1 4.6 7.1 2-2 3.4-4.2 4.6-7.1
        -1.4-.8-3-1.3-4.6-1.3s-3.2.5-4.6 1.3z" fill="${teamColor}"/>
      <ellipse cx="20" cy="${S(cy)}" rx="${S(fw)}" ry="${S(fh)}" fill="${skin}"/>
      ${sideHair ? `<path d="M${S(20 - fw - .5)} ${S(cy - 1)}q-.2 ${S(fh * .7)} 1.2 ${S(fh * .9)}
        l.6-${S(fh * .9)}z M${S(20 + fw + .5)} ${S(cy - 1)}q.2 ${S(fh * .7)} -1.2 ${S(fh * .9)}
        l-.6-${S(fh * .9)}z" fill="${hc}"/>` : ''}
      ${hair === 4 ? `<path d="M${S(20 - fw - 1)} ${S(cy + 1)}q0 ${S(fh)} 2 ${S(fh * 1.1)}
        l1-${S(fh * 1.1)}z M${S(20 + fw + 1)} ${S(cy + 1)}q0 ${S(fh)} -2 ${S(fh * 1.1)}
        l-1-${S(fh * 1.1)}z" fill="${hc}"/>` : ''}
      ${hair !== 3 ? `<path d="M${S(20 - fw)} ${S(crownY + 1.4)}a${S(fw)} ${S(fh * .62)} 0 0 1
        ${S(fw * 2)} 0z" fill="${hc}"/>` : ''}
      <path d="M${S(20 - fw - .5)} ${S(crownY)}a${S(fw + .5)} ${S(fh * .78)} 0 0 1
        ${S((fw + .5) * 2)} 0z" fill="${teamColor}"/>
      <path d="M${S(20 + fw)} ${S(crownY - 1.5)}h${S(7.6 - build)}a1.5 1.5 0 0 1 0 3
        h-${S(7.6 - build)}z" fill="${teamColor}"/>
      <ellipse cx="${S(20 - fw * .42)}" cy="${S(eye)}" rx=".8" ry="1" fill="#241d18"/>
      <ellipse cx="${S(20 + fw * .42)}" cy="${S(eye)}" rx=".8" ry="1" fill="#241d18"/>
      ${beard === 2 ? `<rect x="${S(20 - 2.1)}" y="${S(cy + 3.4)}" width="4.2" height="1.3"
        rx=".5" fill="${hc}" opacity=".9"/>` : ''}
      ${beard === 3 ? `<path d="M${S(20 - fw + .6)} ${S(cy + 2.2)}c0 3.6 ${S(fw - .6)} 5.4
        ${S(fw - .6)} 5.4s${S(fw - .6)}-1.8 ${S(fw - .6)}-5.4c-.8 1.6-${S(fw - .6)} 2.2
        -${S(fw - .6)} 2.2s-${S(fw - 1.4)}-.6 -${S(fw - .6)}-2.2z" fill="${hc}" opacity=".92"/>` : ''}
    </svg></span>`;
}

/* 구단 마크. 야구 모자에 박히는 그것 — 한 글자, 그 둘레에 링.
   두 겹으로 두른 건 자수 테두리를 흉내낸 것이다. */
const cap = (name, size = 44) => {
  const c = capOf(name);
  return `<svg class="cap" viewBox="0 0 44 44" width="${size}" height="${size}"
      role="img" aria-label="${esc(short(name))}">
    <circle cx="22" cy="22" r="21.2" fill="${c.color}"/>
    <circle cx="22" cy="22" r="21.2" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.6"/>
    <circle cx="22" cy="22" r="17.4" fill="none" stroke="#fff" stroke-opacity=".62" stroke-width="1.5"/>
    <text class="capm" x="22" y="22" text-anchor="middle" dominant-baseline="central"
      fill="${c.fg}" stroke="${c.fg === '#08121b' ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.25)'}"
      font-size="${(size >= 34 ? 21 : 22)}">${c.mark}</text>
  </svg>`;
};

/* ── 시작 화면 ── */
let bootGame = null, bootSel = 1;

addEventListener('resize', () => { if (G) { stickyOffsets(); } });

/* 폰에서 상단바 · 탭 · 바로가기를 다 붙여 두면 화면의 23% 가 사라진다.
   내려가는 동안에는 상단바를 한 줄로 접는다. 올리면 돌아온다. */
let shrunk = false;
addEventListener('scroll', () => {
  if (!G || window.innerWidth > 760) return;
  const want = window.scrollY > 240;
  if (want === shrunk) return;
  shrunk = want;
  document.body.classList.toggle('shrink', want);
  stickyOffsets();
}, { passive: true });

async function boot() {
  $('#btnLoad').onclick = () => pickSaveFile(() => start());
  $('#btnInfo').onclick = modalInfo;
  // 고정 리그. 한 번 구운 세계를 그대로 불러온다. 매번 시즌을 다시 돌리지 않는다.
  try {
    const res = await fetch('data/league.json', { cache: 'force-cache' });
    bootGame = save.load(await res.json());
  } catch {
    bootGame = new Game({ userTeamId: 1, nTeams: 10, games: 144,
                          startYear: 2026, seed: 94 }).prologue();
  }
  const year = bootGame.state().year;
  $('#bootYear').textContent = year;
  $('#listLabel').textContent = `${year - 1} 최종 순위`;
  drawBracket();
  // 최종 순위는 포스트시즌이 정한다. 우승 1위, 준우승 2위, PO 탈락 3위, 준PO 4위, 와일드카드 5위.
  // 그 아래는 정규시즌 순서.
  const ps = bootGame.lastPostseason().rounds || [];
  const finalRank = new Map();
  if (ps.length >= 4) {
    const [wc, sp, pl, ks] = ps;
    [[ks.winner, 1], [ks.loser, 2], [pl.loser, 3], [sp.loser, 4], [wc.loser, 5]].forEach(([n, r]) => { if (n) finalRank.set(n, r); });
  }
  const list = bootGame.teamList()
    .map(t => ({ t, d: bootGame.teamDossier(t.id) }))
    .map(x => ({ ...x, fr: finalRank.get(x.d.name) || null }))
    .sort((a, b) => (a.fr || 100 + a.d.last.rank) - (b.fr || 100 + b.d.last.rank));
  list.forEach((x, i) => { x.rank = i + 1; });
  bootSel = list[0].t.id;
  const wrap = $('#teamPick');
  wrap.innerHTML = '';
  list.forEach((x) => {
    const { t, d } = x;
    const col = capOf(d.name).color;
    const b = el('button', 'trow');
    b.style.setProperty('--tc', col);
    b.style.setProperty('--tcfg', onColor(col));
    b.setAttribute('aria-pressed', String(t.id === bootSel));
    const tag = x.fr === 1 ? '우승' : x.fr === 2 ? '준우승' : '';
    b.innerHTML = `<span class="tpos">${x.rank}</span>
      ${cap(d.name, 34)}
      <span class="tmain"><span class="tname">${esc(short(d.name))}${tag ? `<em class="ttag">${tag}</em>` : ''}</span>
        <span class="tarch">${esc(d.archetype)}</span></span>
      <span class="tdl d${d.difficulty}">${esc(d.difficultyLabel)}</span>`;
    b.onclick = () => {
      bootSel = t.id;
      [...wrap.children].forEach(c => c.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      drawDossier();
    };
    wrap.appendChild(b);
  });
  drawDossier();
}

function drawBracket() {
  const ps = bootGame.lastPostseason();
  const box = $('#bracket');
  if (!ps.rounds.length) { box.innerHTML = ''; return; }
  const rank = new Map((bootGame.lastTable || []).map(r => [r.team, r.rank]));
  const R = ps.rounds;                    // 와일드카드 · 준PO · PO · KS
  // 점수는 그 시리즈의 것이어야 한다. 이긴 쪽에 승수, 진 쪽에 패수.
  const node = (name, wins, win) => name
    ? `<div class="bn ${win ? 'win' : ''}" style="${tcVars(capOf(name))}">
        ${rank.has(name) ? `<i>${rank.get(name)}</i>` : '<i class="off">·</i>'}
        <span>${esc(short(name))}</span>
        ${wins !== null ? `<b>${wins}</b>` : ''}</div>`
    : '<div class="bn empty"></div>';
  /** 한 시리즈를 두 줄로. 위가 상위 시드, 아래가 올라온 팀. */
  const match = (r, top, bot) => {
    const tw = r.winner === top, bw = r.winner === bot;
    return node(top, tw ? r.w : r.l, tw) + node(bot, bw ? r.w : r.l, bw);
  };
  const seedOf = (n) => rank.get(n) ?? 99;
  const wc = R[0], sp = R[1], pl = R[2], ks = R[3];
  const lo5 = seedOf(wc.higher) > seedOf(wc.lower) ? wc.higher : wc.lower;
  const hi4 = lo5 === wc.higher ? wc.lower : wc.higher;

  // 계단식. 위에서 기다리던 상위 시드가 아래에서 올라온 팀을 맞는다.
  // 선을 그어야 사다리로 읽힌다 — 안 그으면 그냥 네 덩어리다.
  const round = (label, rows, cls = '') =>
    `<div class="brd ${cls}"><span class="bhd">${label}</span>
       <div class="bmatch">${rows}</div></div>`;

  box.innerHTML = `<div class="lab">${ps.year} 포스트시즌</div>
    <div class="brk">
      ${round('와일드카드', match(wc, hi4, lo5), 'r1')}
      ${round('준PO', match(sp, sp.higher, wc.winner), 'r2')}
      ${round('PO', match(pl, pl.higher, sp.winner), 'r3')}
      ${round('한국시리즈', match(ks, ks.higher, pl.winner), 'r4')}
      <div class="brd champ"><span class="bhd">우승</span>
        <div class="bchamp" style="${tcVars(capOf(ks.winner))}">
          ${cap(ks.winner, 26)}<span>${esc(short(ks.winner))}</span>
          <b>${ks.w}–${ks.l}</b></div>
      </div>
    </div>`;
}

function drawDossier() {
  const d = bootGame.teamDossier(bootSel);
  const col = capOf(d.name).color;
  const saved = localStorage.getItem(KEY);
  const c = d.contrast;
  const H = d.history;
  const fr = franchiseOf(d.name);

  const scoutRow = (p) => `<div class="sp-row">
      ${avatar(p, col, 38)}
      <span class="sp-main">
        <span class="sp-name">${esc(p.name)}<span>${p.age}세 · ${p.slot}</span></span>
        <span class="sp-bar">${axis(p.ovr, p.pot, 'big')}
          <b class="sp-num">${p.ovr.lo}–${p.ovr.hi}</b></span>
      </span></div>`;

  const pay = d.payrollRatio;
  const payCls = pay > 100 ? 'over' : pay > 90 ? 'tight' : '';

  $('#dossier').innerHTML = `
    <div class="dtop">
      <div class="dhead">${cap(d.name, 46)}
        <h2>${esc(d.name)}<small>${esc(fr.mascot)}${H ? ` · 창단 ${H.founded}` : ''}</small></h2>
        <span class="chip d${d.difficulty}">${esc(d.difficultyLabel)}</span></div>
      <p class="headline">${esc(d.headline)}</p>
      ${d.story ? `<p class="story">${d.story.split('\n').map(esc).join('<br>')}</p>` : ''}
      <div class="ptags"><span class="ptag">${bootGame.state().year - 1} 정규시즌</span><span class="ptag m"><b>${d.last.rank}위</b></span>
        <span class="ptag m">${d.last.w}승 ${d.last.l}패${d.last.d ? ` ${d.last.d}무` : ''}</span>
        ${d.lastRank ? `<span class="ptag">${icon('bat')}득점 <b class="m">${d.lastRank.rs}위</b></span><span class="ptag">${icon('ball')}실점 <b class="m">${d.lastRank.ra}위</b></span>` : ''}</div>
    </div>

    <div class="dbody">
      <div class="dsec">
        <div class="rankrow">${(() => {
          // 다섯 부문의 순위를 먼저 다 보여주고, 최고와 최저만 짚는다.
          const all = c.strong.concat(c.mid, c.weak).sort((a, b) => a.r - b.r);
          // 최고·최저라도 실제로 좋고 나쁠 때만 짚는다. 5위를 강점이라 부르지 않는다.
          const best = all[0].r <= 4 ? all[0] : null;
          const worst = all[all.length - 1].r >= 7 ? all[all.length - 1] : null;
          return all.map(x => `<div class="rk ${x === best ? 'good' : x === worst ? 'bad' : ''}">
            <span>${x.k}</span><b>${x.r}</b>
            ${x === best ? '<i class="s">강점</i>' : x === worst ? '<i class="w">리스크</i>' : ''}
          </div>`).join('');
        })()}</div>
        ${d.risk.rows.length ? `<div class="chips riskchips">${
          d.risk.rows.map(x => `<span class="chip ${x.s === 2 ? 'bad' : x.s === 1 ? 'warn' : ''}">${icon(x.s === 2 ? 'hurt' : x.s === 1 ? 'bolt' : 'news')}${x.k}<b>${x.v}</b></span>`).join('')}</div>` : ''}

      <div class="dtiles">
        <div class="dtile ${d.ownerLine.urgent ? 'urgent' : ''}">
          ${icon('owner')}
          <b>${esc(d.ownerLine.demand)}</b>
          <div class="meter"><i style="width:${Math.max(4, Math.min(100, d.patience))}%"></i><span>인내 ${d.patience}</span></div>
          <p>“${esc(d.ownerLine.ask)}”</p>
        </div>
        ${d.park && d.park.name ? `<div class="dtile">
          ${icon('park')}
          <b>${esc(d.park.name)}</b>
          <div class="meter"><i style="width:${Math.min(100, d.park.rate || 0)}%"></i><span>${d.park.rate ? `관중 ${d.park.rate}%` : `${d.park.capacity.toLocaleString()}석`}</span></div>
          <p>${d.park.opened} 개장 · ${d.park.capacity.toLocaleString()}석${d.park.avg ? ` · 평균 ${d.park.avg.toLocaleString()}명` : ''}</p>
        </div>` : ''}
        <div class="dtile">
          ${icon('won')}
          <b><span class="m">${d.payroll}</span>억 <small>/ ${d.budget}억</small></b>
          <div class="meter ${payCls}"><i style="width:${Math.min(100, pay)}%"></i><span>소진 ${pay}%</span></div>
          <p>${d.room > 0 ? `여유 ${d.room}억` : `초과 ${Math.abs(d.room)}억`}</p>
        </div>
      </div>

      <div class="scout">
        <div class="scouthead">
          <div class="axlegend"><span><b class="cur"></b>현재</span><span><b class="pot"></b>잠재력</span></div>
          <div class="scoutkey"><span class="axscale">${SCALE.map(x => `<i>${x}</i>`).join('')}</span><span></span></div>
        </div>
        <div class="sp-group">주축</div>
        ${d.key.map(scoutRow).join('')}
        ${d.prospect.length ? '<div class="sp-group">유망주</div>' + d.prospect.map(scoutRow).join('') : ''}
      </div>

      ${H ? `<div class="dhistory">
        <span class="trophies">${H.titles ? Array.from({ length: Math.min(H.titles, 8) }, () => icon('trophy')).join('') + (H.titles > 8 ? `<i>+${H.titles - 8}</i>` : '') : '<i>우승 없음</i>'}</span>
        <span class="htext">${H.titles ? `우승 ${H.titles}회${H.lastTitle ? ` · 최근 ${H.lastTitle}` : ''}` : ''}</span>
        ${H.legend ? `<span class="legend"><span class="lnum">${H.legend.number}</span>
          <span><b>${esc(H.legend.name)}</b><span class="sub">${H.legend.from}–${H.legend.to} · ${esc(H.legend.line)}</span></span></span>` : ''}
      </div>` : ''}

    </div>
    <div class="dstart">
      <button id="btnNew" class="go">${esc(josa(d.name, '으로'))} 시작</button>
      ${saved ? '<button id="btnResume" class="second">이어하기</button>' : ''}
    </div>`;
  const mapBox = $('#kmap');
  if (mapBox) mapBox.innerHTML = drawMap(bootGame.teamList().map(t => t.name), d.name);
  for (const el of [$('#dossier'), document.querySelector('.boot-main')]) {
    el.style.setProperty('--tc', col);
    el.style.setProperty('--tcfg', onColor(col));
  }
  $('#btnNew').onclick = () => { bootGame.userId = bootSel; G = bootGame; start(); };

  if ($('#btnResume')) $('#btnResume').onclick = () => {
    try { G = save.load(JSON.parse(saved)); start(); }
    catch (e) { localStorage.removeItem(KEY); toast('불러오기 실패', '새 게임으로 시작하세요', 'injury');
      drawDossier(); }
  };
}

function start() { $('#boot').hidden = true; $('#app').hidden = false; persist(); render(); }

/* ── 상단 ── */
const TABS = [['home','홈'],['inbox','받은 편지함'],['team','팀'],['league','리그'],['front','프런트'],['history','역사']];
function renderTop() {
  const s = G.state();
  if (s.phase !== lastPhase) {
    if (s.phase.startsWith('off_')) tab = 'front';
    else if (s.phase === 'regular' || s.phase === 'preseason') tab = 'home';
    lastPhase = s.phase;
  }
  $('#tbYear').textContent = s.year;
  $('#tbPhase').textContent = s.phase_label;
  $('#tbCount').textContent = s.phase === 'regular' ? `${s.day}/${s.total_days}` : '';
  $('#tbTeam').textContent = s.user_team.name;
  $('#tbMode').textContent = s.mode || '';
  const a = $('#tbActions'); a.innerHTML = '';
  const btn = (t, fn, c = '') => { const b = el('button', c, t); b.onclick = fn; a.appendChild(b); };
  switch (s.phase) {
    case 'preseason': btn('시즌 시작', () => act(() => G.startSeason()), 'primary'); break;
    case 'regular':
      btn('다음 날', () => nextDay(), 'primary');
      btn('이번 주는 맡긴다', () => act(() => weekReport(G.advance(7))));
      btn('끝까지', () => act(() => report(G.simToEnd())));
      break;
    case 'postseason': btn('포스트시즌', () => act(() => modalPost(G.runPostseason())), 'primary'); break;
    case 'off_rollover': btn('시즌 정리', () => act(() => modalRollover(G.offseasonRollover())), 'primary'); break;
    case 'off_foreign': btn('외국인 확정', () => {
        const m = G.foreignMarket(), keep = m.mine.filter(p => p.contract).length;
        const msg = keep < 3
          ? `외국인 ${keep}명으로 시즌을 치른다. 시장은 다시 열리지 않는다. 확정하겠는가?`
          : '외국인 계약을 확정한다. 되돌릴 수 없다.';
        if (confirm(msg)) act(() => G.finishForeign());
      }, 'danger'); break;
    case 'off_post':
      btn('포스팅 요청', () => openPosting(), 'primary');
      btn('전부 불허', () => { if (confirm('남은 요청을 모두 불허한다.'))
        act(() => G.finishPosting()); }, 'quiet');
      break;
    case 'off_comp': {
      const cb = G.compBoard();
      if (!cb.done) btn(cb.i_sign ? `보호 명단 (${cb.left})` : `보상 선택 (${cb.left})`,
        () => openComp(), 'primary');
      btn('나머지 자동', () => { if (confirm('남은 보상을 전부 자동으로 넘긴다.'))
        act(() => G.finishComps()); }, 'quiet');
      break; }
    case 'off_fa': {
      const f = G.freeAgents();
      if (!f.closed) btn(`하루 보낸다 (${f.day}/${f.days})`, () => act(() => G.faAdvance()), 'primary');
      btn('시장 마감', () => { if (confirm('남은 협상을 모두 끝내고 시장을 닫는다. 되돌릴 수 없다.'))
        act(() => modalSignings(G.resolveFA())); }, 'danger'); break; }
    case 'off_trade': btn('트레이드 마감', () => act(() => G.resolveTrades()), 'danger'); break;
  }
  const tb = $('#tabs'); tb.innerHTML = '';
  TABS.forEach(([k, label]) => {
    const b = el('button', '', label +
      (k === 'inbox' && s.unread ? ` <em class="badge">${s.unread}</em>` : ''));
    if (k === tab) b.setAttribute('aria-current', 'page');
    b.onclick = () => { tab = k; render(); }; tb.appendChild(b);
  });
}
function act(fn) { const r = fn(); autosave(); render(); return r; }
/* ── 응원 ──────────────────────────────────────────────────
   KBO 응원은 대개 이름 음절을 두드린다. 실제 응원가는 저작권이 걸린
   개사곡이라 쓸 수 없고, 소리 없이 글자만으로도 분위기는 산다.
   이름에서 규칙으로 뽑아내니 선수마다 자기 구호가 생긴다. */
// 같은 말도 지역마다 다르다. 경상권 구장에서는 '날려라' 가 아니라 '쌔려라' 다.
const CHANT_VERB = { hit: { std:'날려라', gs:'쌔려라' } };
const CHANT_FORMS = [
  (n) => n.split('').join('! ') + '!',                    // 김! 도! 영!
  (n) => `오 오 오~ ${n}`,
  (n) => `${n} ${n} 안타!`,
  (n, d) => `${CHANT_VERB.hit[d] || CHANT_VERB.hit.std} ${n}`,
  (n) => `${n[n.length - 1]}! ${n}!`,
];
/** 부르는 이름. 한국 선수는 이름(성 뗀 쪽), 외국인은 성을 통째로 부른다.
 *  '하비에르 콜린스' 를 '린스' 라고 부르지는 않는다. */
function chantName(name) {
  if (name.includes(' ')) {
    const sur = name.split(' ').pop();
    return sur.length <= 4 ? sur : sur.slice(-3);
  }
  // 한국 성으로 시작하는 세 글자 이름만 성을 뗀다. 등록명(오스틴 · 페디)은 통째로 부른다.
  const isKr = name.length === 3 && SUR.includes(name[0]);
  return isKr ? name.slice(1) : name;                    // 김도영 → 도영
}
/** 이름이 같으면 늘 같은 구호가 나온다. 이름과 상황으로 섞는다.
 *  구호는 응원하는 쪽 — 그러니까 그 구장 — 의 말을 쓴다. */
function chantFor(name, salt = 0, team = null) {
  const who = chantName(name);
  const d = team ? (franchiseOf(team).dialect || 'std') : 'std';
  const h = [...name].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 9973, 7) + salt;
  return CHANT_FORMS[h % CHANT_FORMS.length](who, d);
}

/** 경기가 끝났다. 같은 화면 안에서 결과로 바뀐다. */
function gsResult(box, onDone) {
  const aw = box.away, hm = box.home;
  lastBox = box;
  if (!gsState) openGameShell(aw.team, hm.team, box.park, box.crowd, box.cap);
  gsScore({ a: aw.runs, h: hm.runs, inn: null, outs: null });
  document.getElementById('gsInn').textContent = '경기 종료';
  const me = G.state().user_team.name;
  const mine = hm.team === me ? 'home' : aw.team === me ? 'away' : null;
  const myS = mine === 'home' ? hm : mine === 'away' ? aw : null, opS = mine === 'home' ? aw : hm;
  const won = myS ? myS.runs > opS.runs : null, tie = myS ? myS.runs === opS.runs : false;
  // 오늘의 장면. 홈런 · 득점 · 다이빙 캐치 · 주루사. 많으면 뒤쪽 여섯.
  const P = box.plays || [];
  const hl = P.filter(p => (p.runs || 0) > 0 || p.res === 'HR' || p.dive === 'catch' || /주루사|태그업 아웃|홈 송구/.test(p.desc || '')).slice(-6);
  const canNext = G.state().phase === 'regular' && !G.state().notices.some(n => n.kind === 'phase');
  /* 결정 — 승·패·세이브·홀드 투수. 칩 하나에 이름과 기록. */
  const decs = [...aw.pitchers.map(p => ({ ...p, team: aw.team })), ...hm.pitchers.map(p => ({ ...p, team: hm.team }))]
    .filter(p => p.dec).sort((x, y) => '승패세홀'.indexOf(x.dec) - '승패세홀'.indexOf(y.dec));
  /* 오늘의 선수 — 안타·홈런·타점을 합쳐 상위 셋. */
  const stars = [...aw.batters.map(b => ({ ...b, team: aw.team })), ...hm.batters.map(b => ({ ...b, team: hm.team }))]
    .map(b => ({ ...b, sc: b.h + b.hr * 2 + b.rbi * 1.5 })).filter(b => b.sc >= 2)
    .sort((x, y) => y.sc - x.sc).slice(0, 3);
  const bline = (b) => [b.ab ? `${b.ab}타수 ${b.h}안타` : '', b.hr ? `${b.hr}홈런` : '', b.rbi ? `${b.rbi}타점` : '', b.bb ? `${b.bb}볼넷` : ''].filter(Boolean).join(' · ');
  const ptable = (S) => `<div class="gs-side"><div class="tchd">${cap(S.team, 22)}<b>${esc(short(S.team))} 투수</b></div>
    <table class="gs-tb"><thead><tr><th></th><th>IP</th><th>H</th><th>R</th><th>K</th><th>BB</th><th>NP</th></tr></thead><tbody>
    ${S.pitchers.map(p => `<tr><td><span class="name">${esc(p.name)}</span>${p.dec ? `<i class="dec d${'승패세홀'.indexOf(p.dec)}">${p.dec}</i>` : ''}</td>
      <td class="m">${p.ip}</td><td class="m">${p.h}</td><td class="m ${p.r ? '' : 'dim'}">${p.r}</td><td class="m">${p.k}</td><td class="m">${p.bb}</td><td class="m dim">${p.np}</td></tr>`).join('')}</tbody></table>
    <div class="tchd">${cap(S.team, 22)}<b>${esc(short(S.team))} 타자</b></div>
    <table class="gs-tb"><thead><tr><th></th><th>AB</th><th>H</th><th>HR</th><th>RBI</th><th>BB</th><th>K</th></tr></thead><tbody>
    ${S.batters.map(b => `<tr><td><span class="name">${esc(b.name)}</span><span class="sub">${b.slot}</span></td>
      <td class="m">${b.ab}</td><td class="m ${b.h ? '' : 'dim'}">${b.h}</td><td class="m ${b.hr ? 'mark' : 'dim'}">${b.hr}</td><td class="m ${b.rbi ? '' : 'dim'}">${b.rbi}</td><td class="m dim">${b.bb}</td><td class="m dim">${b.k}</td></tr>`).join('')}</tbody></table></div>`;
  gsBody(`<div class="gs-res wide">
      ${myS ? `<div class="gs-verdict ${tie ? 'tie' : won ? 'w' : 'l'}"><b>${tie ? '무승부' : won ? '승리' : '패배'}</b>
        <span>${esc(whyOf(box, mine, won))}</span></div>` : ''}
      <div class="gs-final">
        <span class="gs-fteam">${cap(aw.team, 40)}${esc(short(aw.team))}</span><b class="m">${aw.runs}</b>
        <i>:</i><b class="m">${hm.runs}</b><span class="gs-fteam">${cap(hm.team, 40)}${esc(short(hm.team))}</span>
      </div>
      ${lineScore(box)}
      ${decs.length ? `<div class="gs-decs">${decs.map(p => `<span class="ptag dec d${'승패세홀'.indexOf(p.dec)}"><b>${p.dec}</b>${cap(p.team, 18)}${esc(p.name)}<i class="m">${p.ip}이닝 ${p.r}실점 ${p.k}K</i></span>`).join('')}</div>` : ''}
      ${stars.length ? `<div class="gs-stars">${stars.map(b => `<div class="pcard"><span class="gs-star">${icon('star')}</span>${cap(b.team, 30)}
        <span class="pc-main"><b>${esc(b.name)}</b><i>${bline(b)}</i></span></div>`).join('')}</div>` : ''}
      ${hl.length ? `<div class="lead">${icon('bolt', 'lead-ic')}<span class="pcnt">장면 ${hl.length}</span></div>
      <div class="gs-hl">${hl.map(p => `<div class="gs-hlrow">
        <span class="m">${p.inning}${p.half === 'top' ? '초' : '말'}</span>${cap(p.half === 'top' ? aw.team : hm.team, 18)}<b>${esc(p.batter || '')}</b>
        <span>${esc(p.desc || '')}</span>${p.runs ? `<em>+${p.runs}</em>` : ''}</div>`).join('')}</div>` : ''}
      <div class="hl-btn">
        ${canNext ? '<button class="go" id="gsNext">다음 날</button>' : ''}
        <button class="quiet" id="gsFull">다시 보기</button>
        <button class="quiet" id="gsDone">구단으로</button>
      </div>
      <div class="gs-box">${ptable(aw)}${ptable(hm)}</div>
    </div>`);
  document.getElementById('gsFull').onclick = () => openReplay(box);
  document.getElementById('gsDone').onclick = () => { closeGame(); if (onDone) onDone(); };
  const nx = document.getElementById('gsNext');
  if (nx) nx.onclick = () => { closeGame(); if (onDone) onDone(); nextDay(); };
}

/* ── 주간 보고 ─────────────────────────────────────────────
   일주일을 감독에게 맡겼다. 단장은 결과와 함께 감독이 무슨 손을 썼는지,
   왜 이겼고 왜 졌는지를 받는다. 경기 기록에서 뽑는다 — 감독은 따로 말하지 않는다. */
function decisionsOf(box, mine) {
  const P = box.plays || [], out = [];
  const myHalf = mine === 'home' ? 'bottom' : 'top';        // 내 팀이 공격하는 반이닝
  for (let i = 0; i < P.length; i++) {
    const p = P[i], inn = `${p.inning}${p.half === 'top' ? '초' : '말'}`;
    const off = p.half === myHalf;                             // 이 플레이에서 내 팀이 공격인가
    const next = P.slice(i + 1).find(x => x.res);
    if (p.sub && /대타/.test(p.desc) && off)
      out.push({ inn, what: p.desc, then: next ? `→ ${next.desc}` : '' });
    else if (p.sub && /투수 교체/.test(p.desc) && !off) {
      const name = p.desc.replace('투수 교체 — ', '');
      const side = mine === 'home' ? box.home : box.away;
      const pl = side.pitchers.find(x => x.name === name);
      out.push({ inn, what: p.desc, then: pl ? `→ ${pl.ip}이닝 ${pl.r}실점${pl.dec ? ' · ' + pl.dec : ''}` : '' });
    }
    else if (p.bunt && off) out.push({ inn, what: '번트 지시', then: `→ ${p.desc}` });
    else if (p.ibb && !off) out.push({ inn, what: `고의사구 ${p.batter}`, then: next ? `→ ${next.batter} ${next.desc}` : '' });
    else if (p.steal && off) out.push({ inn, what: '도루 시도', then: `→ ${p.desc}` });
  }
  return out;
}
/** 승부를 가른 장면. 마지막으로 앞서 나간 플레이, 또는 가장 많이 내준 반이닝. */
function whyOf(box, mine, won) {
  const P = box.plays || [];
  const myHalf = mine === 'home' ? 'bottom' : 'top';
  if (won) {
    let go = null, myR = 0, opR = 0;
    for (const p of P) {
      if (!p.res && !p.runs) continue;
      const before = myR - opR;
      if (p.half === myHalf) myR += p.runs || 0; else opR += p.runs || 0;
      if (before <= 0 && myR - opR > 0 && p.runs) go = p;
    }
    return go ? `${go.inning}${go.half === 'top' ? '초' : '말'} ${go.batter} ${go.desc}로 앞서 나갔다` : '끝까지 지켰다';
  }
  const by = new Map();
  for (const p of P) if (p.half !== myHalf && p.runs) {
    const k = `${p.inning}${p.half === 'top' ? '초' : '말'}`;
    const v = by.get(k) || { r: 0, pit: p.pitcher }; v.r += p.runs; by.set(k, v);
  }
  const worst = [...by.entries()].sort((a, b) => b[1].r - a[1].r)[0];
  return worst ? `${worst[0]} ${worst[1].pit} 가 ${worst[1].r}점을 내줬다` : '점수를 못 냈다';
}
function weekReport(r) {
  reportNotices();
  const games = (r && r.games) || [];
  if (!games.length) return;
  const last = games.filter(g => g.box).pop(); if (last) lastBox = last.box;
  const me = G.state().user_team.name;
  const w = games.filter(g => g.result === '승').length, l = games.filter(g => g.result === '패').length;
  const t = games.length - w - l - games.filter(g => !g.box).length;
  let rf = 0, ra = 0;
  const DEC_IC = (what) => /투수 교체/.test(what) ? 'hook' : /대타/.test(what) ? 'pinch' : /번트/.test(what) ? 'bunt'
    : /도루/.test(what) ? 'steal' : /고의사구/.test(what) ? 'ibb' : 'glove';
  const tally = {};
  const detail = games.map(g => {
    if (!g.box) return { g, dec: [] };
    const mine = g.box.home.team === me ? 'home' : 'away';
    const my = g.box[mine], op = g.box[mine === 'home' ? 'away' : 'home'];
    rf += my.runs; ra += op.runs;
    const dec = decisionsOf(g.box, mine).map(d => ({ ...d, ic: DEC_IC(d.what) }));
    for (const d of dec) tally[d.ic] = (tally[d.ic] || 0) + 1;
    return { g, mine, won: g.result === '승', dec };
  });
  const st = G.standings().rows.find(x => x.is_user);
  const DEC_KR = { hook: '투수 교체', pinch: '대타', bunt: '번트', steal: '도루', ibb: '고의사구', glove: '기타' };
  /* 첫 줄 — 한 주를 숫자 넷으로. 전적, 득실, 순위, 감독이 쓴 손. */
  const tiles = `<div class="ptiles t4">
    <div class="htile ${w > l ? 'good' : l > w ? 'bad' : ''}">${icon('trophy')}<b><span class="m">${w}승 ${l}패${t ? ` ${t}무` : ''}</span></b>
      <div class="form">${detail.map(d => `<b class="${d.g.result === '승' ? 'w' : d.g.result === '패' ? '' : 'd'}"></b>`).join('')}</div></div>
    <div class="htile">${icon('bat')}<b><span class="m">${rf}</span><small>득</small><span class="m">${ra}</span><small>실</small></b><p>${rf - ra >= 0 ? '+' : ''}${rf - ra}</p></div>
    ${st ? `<div class="htile">${icon('rank')}<b><span class="m">${st.rank}</span>위</b><p>${st.w}–${st.l} · ${st.gb === '-' ? '선두' : `${st.gb} 경기 차`}</p></div>` : ''}
    <div class="htile">${icon('owner')}<b><span class="m">${Object.values(tally).reduce((x, y) => x + y, 0)}</span><small>번 손을 썼다</small></b>
      <div class="alrow">${Object.entries(tally).map(([k, n]) => `<span class="lb">${icon(k)}${DEC_KR[k]}<i>${n}</i></span>`).join('') || '<span class="dim">없다</span>'}</div></div>
  </div>`;
  /* 경기 하나에 카드 하나. 상대 모자, 점수, 승패, 승부처 한 줄, 감독의 손은 아이콘 칩. */
  const rows = detail.map(({ g, mine, won, dec }) => {
    if (!g.box) return `<div class="wk-g rain"><span class="m">${g.day}일</span>${cap(g.opponent, 24)}<b>${esc(short(g.opponent))}</b><span>${g.result}</span></div>`;
    return `<div class="wk-g ${won ? 'w' : g.result === '패' ? 'l' : ''}">
      <div class="wk-head"><span class="m">${g.day}일</span>${cap(g.opponent, 24)}<b>${mine === 'home' ? '' : '@'}${esc(short(g.opponent))}</b>
        <em class="m">${g.score}</em><i>${g.result}</i></div>
      <div class="wk-why">${esc(whyOf(g.box, mine, won))}</div>
      ${dec.length ? `<div class="wk-dec">${dec.map(d => `<span class="wk-d">${icon(d.ic)}<span class="m">${d.inn}</span>${esc(d.what.replace(/^투수 교체 — /, '').replace(/^고의사구 /, ''))}<i>${esc(d.then.replace(/^→ /, ''))}</i></span>`).join('')}</div>`
                   : '<div class="wk-dec dim">감독이 손을 쓰지 않았다</div>'}
    </div>`;
  }).join('');
  modal(`<div class="wk">
    <div class="wk-top"><b>이번 주</b><span class="wk-note">감독에게 맡긴 ${games.length}경기</span></div>
    ${tiles}
    ${rows}
    <div class="hl-btn"><button class="go" id="wkOk">확인</button>${last ? '<button class="quiet" id="wkLast">마지막 경기 다시 보기</button>' : ''}</div>
  </div>`);
  document.getElementById('wkOk').onclick = closeModal;
  const wl = document.getElementById('wkLast'); if (wl) wl.onclick = () => { closeModal(); openReplay(last.box); };
}

/** 여러 날을 넘긴 뒤. 결과는 토스트로, 마지막 경기는 다시 볼 수 있게. */
function report(r) {
  if (r && r.games) {
    for (const g of r.games.slice(-2))
      toast(g.result, g.result === '우천취소' ? short(g.opponent) : `${g.score}  ${short(g.opponent)}`);
    const last = r.games.filter(g => g.box).pop();
    if (last) lastBox = last.box;              // 방금 끝난 내 팀 경기. 다시 볼 수 있다.
  }
  reportNotices();
}
function reportNotices() {
  const s = G.state();
  for (const n of s.notices) toast(n.kind === 'injury' ? '부상' : '', n.text, n.kind);
  // 사건이 있어도 편지함으로 끌고 가지 않는다. 홈이 더 중요하다.
  // 대신 홈 맨 위에 요약을 얹고, 탭에는 숫자만 붙인다.
}

/* ── 뼈대 ── */
/* 상단바는 좁은 화면에서 두 줄로 접힌다. 탭과 바로가기 줄이 고정 픽셀로
   붙어 있으면 그때 서로 겹친다. 실제 높이를 재서 알려 준다. */
function stickyOffsets() {
  const tb = document.querySelector('.topbar'), tabs = document.querySelector('.tabs');
  if (!tb || !tabs) return;
  const h1 = Math.round(tb.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--tb-h', h1 + 'px');
  document.documentElement.style.setProperty('--tabs-h',
    Math.round(tabs.getBoundingClientRect().height) + 'px');
}

function render() {
  renderTop();
  const v = $('#view'); v.innerHTML = '';
  ({ inbox:viewInbox, home:viewHome, team:viewTeam, league:viewLeague,
     front:viewFront, history:viewHistory }[tab])(v);
  jumpBar(v);
  if (shrunk && window.scrollY <= 240) {
    shrunk = false; document.body.classList.remove('shrink');
  }
  stickyOffsets();
}

/* 좁은 화면에서 팀 화면은 6,000px 가 넘는다. 접어서 감추면 이 게임이
   아니게 되니, 다 펼쳐 두고 찾아갈 수 있게만 한다. */
function jumpBar(v) {
  if (window.innerWidth > 760) return;
  const heads = [...v.querySelectorAll('.sect > h3')];
  if (heads.length < 4) return;
  const bar = el('nav', 'jump');
  bar.innerHTML = heads.map((h, i) => {
    const t = (h.firstChild && h.firstChild.textContent || h.textContent).trim();
    return `<button data-j="${i}">${esc(t)}</button>`;
  }).join('');
  v.insertBefore(bar, v.firstChild);
  bar.querySelectorAll('button').forEach(b => b.onclick = () => {
    const el2 = heads[+b.dataset.j];
    const y = el2.getBoundingClientRect().top + window.scrollY - 96;   // 상단바·탭·이 줄
    window.scrollTo({ top: y, behavior: 'smooth' });
  });
}
function sect(title, note, body) {
  const s = el('section', 'sect');
  if (title) s.appendChild(el('h3', null, `${esc(title)}${note ? `<i>${note}</i>` : ''}`));
  if (typeof body === 'string') s.appendChild(el('div', null, body));
  else if (body) s.appendChild(body);
  return s;
}
function table(head, rows, onRow) {
  const t = el('table');
  t.innerHTML = `<thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
  const tb = el('tbody');
  rows.forEach(r => {
    const tr = el('tr', (r._cls || '') + (onRow ? ' click' : ''));
    tr.innerHTML = r.cells.map(c => `<td>${c}</td>`).join('');
    if (onRow) { tr.tabIndex = 0; tr.onclick = () => onRow(r);
      tr.onkeydown = (e) => { if (e.key === 'Enter') onRow(r); }; }
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  // 좁은 화면에서는 표만 카드 안에서 옆으로 민다. 열을 지우지 않기 위해서다.
  const wrap = el('div', 'tw'); wrap.appendChild(t); return wrap;
}
const nameCell = (p) => `<span class="name">${esc(p.name)}</span>`
  + (p.injury_days ? `<span class="tag inj">✚${p.injury_days}</span>` : '');

/* ── 받은 편지함 ── */
const MAIL_ICON = { injury:'hurt', ret:'back', milestone:'gem', owner:'owner', contract:'pen',
  game:'ball', streak:'bolt', standings:'rank', league:'news', scout:'eye',
  transfer:'arrow', draft:'star' };
let mailFilter = null;

function viewInbox(v) {
  const m = G.mail(80);
  if (!m.rows.length) { v.appendChild(sect('', '', '<div class="empty">아직 온 편지가 없다.</div>')); return; }
  /* 종류별로 칸을 나눈다 — 글자로 '부상' 이라 쓰는 대신 아이콘과 숫자를 누르면 그것만 남는다. */
  const tally = {};
  for (const x of m.rows) tally[x.kind] = (tally[x.kind] || 0) + 1;
  const kinds = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
  if (mailFilter && !tally[mailFilter]) mailFilter = null;
  const bar = el('div', 'mailbar');
  bar.innerHTML = `<button class="mk ${mailFilter ? '' : 'on'}" data-k="">${icon('news')}<b>${m.rows.length}</b></button>` +
    kinds.map(k => `<button class="mk k-${k} ${mailFilter === k ? 'on' : ''}" data-k="${k}" title="${KIND_KO(k)}">${icon(MAIL_ICON[k] || 'news')}<span>${KIND_KO(k)}</span><b>${tally[k]}</b></button>`).join('');
  v.appendChild(bar);
  bar.querySelectorAll('.mk').forEach(b => b.onclick = () => { mailFilter = b.dataset.k || null; render(); });

  const rows = mailFilter ? m.rows.filter(x => x.kind === mailFilter) : m.rows;
  const g = el('div', 'grid');
  const groups = [];
  let cur = null;
  for (const x of rows) {
    const key = `${x.year}${x.day ? '' : ' 오프시즌'}`;
    if (!cur || cur.key !== key) { cur = { key, year:x.year, off:!x.day, rows:[] }; groups.push(cur); }
    cur.rows.push(x);
  }
  for (const grp of groups) {
    g.appendChild(sect(`${grp.year}${grp.off ? ' 오프시즌' : ''}`, `${grp.rows.length}`,
      grp.rows.map(x => `<div class="mail k-${x.kind} ${x.read ? '' : 'new'} ${x.pri ? 'pri' : ''}
          ${x.pid ? 'click' : ''}" ${x.pid ? `data-pid="${x.pid}"` : ''}>
        <span class="mi" title="${KIND_KO(x.kind)}">${icon(MAIL_ICON[x.kind] || 'news')}</span>
        <span class="mtext">
          <span class="mtop"><b>${esc(x.title)}</b>
            <span class="mmeta">${x.day ? x.day + '일' : ''}</span></span>
          <span class="mbody">${esc(x.body).replace(/\n/g, '<br>')}</span>
        </span></div>`).join('')));
  }
  v.appendChild(g);
  v.querySelectorAll('.mail.click').forEach(e => e.onclick = () => openPlayer(+e.dataset.pid));
  G.markMailRead();
  renderTop();          // 배지를 즉시 반영한다
  autosave();
}
const KIND_KO = (k) => ({ injury:'부상', ret:'복귀', milestone:'기록', owner:'구단주',
  contract:'계약', game:'경기', streak:'흐름', standings:'순위', league:'리그',
  scout:'스카우트', transfer:'이적', draft:'드래프트' }[k] || k);

/* 순위표 한 칸. 1위는 크게, 나머지는 줄로. 제목은 굵게 한 번만. */
function ldrBoard(groups, { sub = false, team = true } = {}) {
  return `<div class="ldrs">${groups.map(b => {
    const top = b.rows[0];
    if (!top) return `<div class="ldr"><div class="ldr-k">${esc(b.label)}</div><div class="empty">—</div></div>`;
    const act = (r) => r.active === false ? '' : (r.active ? '<i class="dot">●</i>' : '');
    const tm = (r) => team && r.team ? `<i class="sub">${esc(short(r.team))}</i>` : '';
    return `<div class="ldr">
      <div class="ldr-k">${esc(b.label)}</div>
      <div class="ldr-top ${top.pid ? 'click' : ''}" ${top.pid ? `data-pid="${top.pid}"` : ''}>
        ${top.team ? cap(top.team, 30) : ''}<span class="ldr-nm">${act(top)}${esc(top.name)}${tm(top)}${sub ? `<i class="sub">${top.year}</i>` : ''}</span>
        <b class="m">${top.value}</b></div>
      ${b.rows.slice(1).map((r, i) => `<div class="row ${r.pid ? 'click' : ''}" ${r.pid ? `data-pid="${r.pid}"` : ''}>
        <span><span class="m dim pn">${i + 2}</span>${act(r)}${esc(r.name)} ${tm(r)}${sub ? `<i class="sub">${r.year}</i>` : ''}</span>
        <b class="m">${r.value}</b></div>`).join('')}
    </div>`; }).join('')}</div>`;
}

/* ── 홈 ── */
const formStrip = (arr) => `<span class="form">${arr.map(r =>
  `<b class="${r === 'W' ? 'w' : r === 'D' ? 'd' : ''}"></b>`).join('')}</span>`;

let calMonth = null;
/* 한 달치 달력. 날짜·상대·스코어, 그리고 그 달이 무엇이었는지.
   경기는 흘러가는데 돌아볼 자리가 없으면 시즌이 기억에 남지 않는다. */
function monthSection(v) {
  const b = G.monthBoard(calMonth);
  if (!b.weeks.length) return;
  const D = ['일','월','화','수','목','금','토'];
  const cell = (c) => {
    if (!c) return '<div class="cd off"></div>';
    if (!c.opp) return `<div class="cd rest"><i>${c.date}</i></div>`;
    if (c.future) return `<div class="cd fut"><i>${c.date}</i>
      <b>${esc(c.opp.slice(0, 2))}</b><span class="ha">${c.home ? '홈' : '원정'}</span></div>`;
    if (c.rained) return `<div class="cd rain"><i>${c.date}</i>
      <b>${c.home ? '' : '@'}${esc(c.opp.slice(0, 2))}</b><s>우천</s></div>`;
    return `<div class="cd ${c.result === 'W' ? 'win' : c.result === 'L' ? 'lose' : 'tie'}">
      <i>${c.date}</i><b>${c.home ? '' : '@'}${esc(c.opp.slice(0, 2))}</b>
      <s>${c.score}</s></div>`;
  };
  const sm = b.summary;
  const head = `<div class="calbar">${b.months.map(m =>
    `<button data-mon="${m}" class="${m === b.month ? 'on' : ''}">${m}월</button>`).join('')}</div>`;
  const grid = `<div class="cal"><div class="calhd">${D.map((d, i) =>
      `<span class="${i === 0 ? 'sun' : ''}">${d}</span>`).join('')}</div>
    ${b.weeks.map(wk => `<div class="calrow">${wk.map(cell).join('')}</div>`).join('')}</div>`;
  const rankMove = sm && sm.rank_from !== sm.rank_to
    ? ` · ${sm.rank_from}위 → <b>${sm.rank_to}위</b>` : sm ? ` · ${sm.rank_to}위` : '';
  const tot = sm ? `<div class="monsum">
      <b class="big">${sm.w}승 ${sm.l}패${sm.t ? ` ${sm.t}무` : ''}</b>
      <span class="m">${sm.pct.toFixed(3)}</span>${rankMove}
      <i>홈 ${sm.home} · 원정 ${sm.away} · 득실 ${sm.rf}–${sm.ra}${
        sm.streak_w >= 3 ? ` · 최다 ${sm.streak_w}연승` : ''}${
        sm.streak_l >= 3 ? ` · ${sm.streak_l}연패` : ''}</i>
    </div>` : '';
  const notes = [
    ...b.feats.map(f => `<span class="chip good">${f.date}일 ${esc(f.name)} ${esc(f.label)}</span>`),
    ...b.injuries.map(f => `<span class="chip bad">${f.date}일 ${esc(f.name)} 부상 ${f.days}일</span>`)];
  const w = sect(`${b.month}월`, `${b.year}`, head + grid + tot
    + (notes.length ? `<div class="lab" style="margin-top:14px">그 달의 일</div>
        <div class="chips">${notes.join('')}</div>` : ''));
  v.appendChild(w);
  w.querySelectorAll('[data-mon]').forEach(b2 => b2.onclick = () => {
    calMonth = +b2.dataset.mon; render();
  });
}

function viewHome(v) {
  const s = G.state();
  const st = G.standings().rows;
  const me = st.find(r => r.is_user);
  const n = st.length || 10;
  // 순위 칩. 상위 셋은 초록, 하위 셋은 빨강. 숫자 하나로 리그 안의 자리를 말한다.
  const rk = (r) => `<i class="rkc ${r <= 3 ? 'top' : r >= n - 2 ? 'low' : ''}">${r}위</i>`;

  /* 첫 화면의 한 덩어리 — 다음 상대, 우리 흐름, 직전 경기. 제목 없이 자리로 읽힌다. */
  const sch0 = s.phase === 'regular' ? G.schedule(8).rows : [];
  const f0 = G.form(null, 10);
  if (sch0.length || me) {
    const nx = sch0[0], rest = sch0.slice(1, 5);
    const opp = nx ? st.find(r => r.team === nx.opponent) : null;
    const lb = lastBox;
    v.appendChild(sect('', '', `<div class="hero">
      ${nx ? `<div class="hero-next">
        <span class="nx-side ${nx.is_home ? 'h' : 'a'}">${nx.is_home ? '홈' : '원정'}<small>${nx.day}일차</small></span>
        ${cap(nx.opponent, 56)}
        <span class="nx-op"><b>${esc(short(nx.opponent))}</b>
          ${opp ? `<i>${opp.rank}위 · ${opp.w}–${opp.l}</i>` : ''}</span>
        ${rest.length ? `<span class="nx-rest">${rest.map(r =>
          `<span><b class="m">${r.day}</b>${r.is_home ? '' : '@'}${esc(short(r.opponent))}</span>`).join('')}</span>` : ''}
      </div>` : '<div class="hero-next"></div>'}
      ${me ? `<div class="hero-me">
        <span class="big">${me.w}<i>–</i>${me.l}${me.d ? `<i>–</i>${me.d}` : ''}</span>
        <span class="hero-rank">${rk(me.rank)}${me.gb !== '-' ? `<em class="m">${me.gb} 게임차</em>` : ''}${me.playoff ? '<em class="mark">★ 포스트시즌권</em>' : ''}</span>
        ${formStrip(f0.recent)}
      </div>` : ''}
      ${lb ? `<button class="hero-last" id="rpOpen">
        <span class="lgs"><span>${esc(short(lb.away.team))}</span><b class="m">${lb.away.runs}</b><i>:</i><b class="m">${lb.home.runs}</b><span>${esc(short(lb.home.team))}</span></span>
        <span class="lgl">${icon('play')}다시 보기</span></button>` : ''}
    </div>`));
  }

  /* 새 소식. 아이콘이 종류를 말한다. 제목은 없다. */
  const mail = G.mail(40);
  const news = mail.rows.filter(m => !m.read).sort((a, b) => (b.pri - a.pri)).slice(0, 4);
  if (news.length) {
    const box = el('div', 'news');
    box.innerHTML = news.map(m => `<div class="nrow ${m.kind}">
        <span class="nic">${MAIL_ICON[m.kind] || '·'}</span>
        <span class="ntx"><b>${esc(m.title)}</b>${m.body ? `<span>${esc(m.body)}</span>` : ''}</span>
      </div>`).join('')
      + `<button class="linky nall">편지함${mail.unread ? ` <b class="badge">${mail.unread}</b>` : ''}</button>`;
    v.appendChild(sect('', '', box));
    box.querySelector('.nall').onclick = () => { tab = 'inbox'; render(); };
  }

  if (s.phase === 'regular' && s.day > 0) monthSection(v);

  const g = el('div', 'grid g21');
  const left = el('div', 'grid');

  if (me) {
    const ts = G.leagueTeamStats().rows.find(r => r.is_user);
    const f = G.form(null, 10);
    const own = G.ownerStatus();
    const gp = (me.w + me.l + (me.d || 0)) || 1;
    const tile = (val, cap, rank = null, cls = '') => `<div class="htile ${cls}"><b class="m">${val}</b><span>${cap}${rank ? rk(rank) : ''}</span></div>`;
    left.appendChild(sect('', '', `
      <div class="htiles">
        ${tile((me.rs / gp).toFixed(2), '득점 / 경기')}
        ${tile((me.ra / gp).toFixed(2), '실점 / 경기')}
        ${tile(`${f.home[0]}–${f.home[1]}`, '홈')}
        ${tile(`${f.away[0]}–${f.away[1]}`, '원정')}
        ${tile(ts.avg, '팀 타율', ts.rank.avg)}
        ${tile(ts.hr, '팀 홈런', ts.rank.hr)}
        ${tile(ts.era, '팀 ERA', ts.rank.era)}
        ${tile(me.pyth, '피타고라스 승률')}
        <div class="htile owner ${own.ok === false ? 'bad' : ''}">${icon('owner')}
          <div class="owner-main"><b>${esc(own.demand)}</b><span>${esc(own.text)}</span></div>
          <div class="meter"><i style="width:${Math.round((1 - own.remaining / (s.total_days || 144)) * 100)}%"></i><span>잔여 ${own.remaining}경기</span></div></div>
      </div>`));

    const L = G.teamLeaders(null, 4);
    const two = el('div', 'grid g2');
    const leadList = (rows, ic) => `<div class="lead">${ic}${rows.length ? rows.map(x =>
      `<div class="row click" data-pid="${x.pid}"><span><span class="name">${esc(x.name)}</span>
        <span class="sub">${x.slot}</span></span>
       <span><span class="m">${esc(x.line)}</span>
        <b class="m war">${x.war}<small>WAR</small></b></span></div>`).join('') : '<div class="empty">—</div>'}</div>`;
    two.appendChild(sect('', '', leadList(L.batting, icon('bat', 'lead-ic'))));
    two.appendChild(sect('', '', leadList(L.pitching, icon('ball', 'lead-ic'))));
    left.appendChild(two);
  }

  const rec = G.recentResults(8).rows;
  const day = G.dayResults();
  const two2 = el('div', 'grid g2');
  two2.appendChild(sect('', '', `<div class="lead">${icon('star', 'lead-ic')}${rec.length
    ? rec.slice().reverse().map(r => `<div class="row">
        <span><span class="res ${r.result === '승' ? 'w' : r.result === '무' ? 'd' : 'l'}">${r.result}</span>
          <span class="m dim">${r.day}일</span> ${r.home ? '' : '@'}${esc(short(r.opponent))}</span>
        <span class="m">${r.score}</span></div>`).join('')
    : '<div class="empty">아직 치른 경기가 없다</div>'}</div>`));
  two2.appendChild(sect(day.rows.length ? `${day.day}일차 리그` : '', '',
    day.rows.length ? day.rows.map(r => `<div class="row ${r.user ? 'me' : ''}">
        <span>${esc(short(r.away))} <span class="dim">@</span> ${esc(short(r.home))}
          ${r.dh ? '<span class="tag dh">DH</span>' : ''}
          ${r.called ? '<span class="tag cl">강우 콜드</span>' : ''}</span>
        ${r.rain ? '<span class="rainy">우천취소</span>'
          : `<span class="m">${r.ar}<span class="dim">:</span>${r.hr}</span>`}</div>`).join('')
      : '<div class="empty">—</div>'));
  left.appendChild(two2);

  const right = el('div', 'grid');
  let table_st = st, stTitle = '';
  if (!table_st.length) { const ls = G.lastStandings(); table_st = ls.rows; stTitle = `${ls.year} 최종 순위`; }
  const mv = (x) => !x ? '<span class="mv flat">–</span>'
    : x > 0 ? `<span class="mv up">▲${x}</span>` : `<span class="mv dn">▼${-x}</span>`;
  const hasMove = table_st.some(r => r.move);
  if (table_st.length) right.appendChild(sect(stTitle, '',
    table(['팀', ...(hasMove ? [''] : []), 'W','L','PCT','GB'],
    table_st.map(r => ({ _cls: r.is_user ? 'me' : '', team_id: r.team_id, cells: [
      (r.playoff ? '<span class="mark">★</span> ' : '　') + esc(short(r.team)),
      ...(hasMove ? [mv(r.move || 0)] : []),
      `<span class="m">${r.w}</span>`, `<span class="m">${r.l}</span>`,
      `<span class="m">${r.pct}</span>`,
      `<span class="m dim">${r.gb ?? '-'}</span>`] })), (row) => openTeam(row.team_id))));

  const ros = G.roster();
  right.appendChild(sect('', '', `<div class="lead">${icon('bolt', 'lead-ic hurt')}${ros.injured.length
    ? ros.injured.sort((a,b) => a.injury_days - b.injury_days).map(p =>
      `<div class="row click" data-pid="${p.pid}"><span>${esc(p.name)}
        <span class="sub">${p.slot}</span></span>
       <b class="m mark">${p.injury_days}일</b></div>`).join('')
    : '<div class="empty">부상자 없음</div>'}</div>`));

  const pay = ros.budget ? Math.round(ros.payroll / ros.budget * 100) : 0;
  right.appendChild(sect('', '', `<div class="htile fin">${icon('won')}
    <b><span class="m">${ros.payroll}</span>억 <small>/ ${ros.budget}억</small></b>
    <div class="meter ${pay > 100 ? 'over' : pay > 90 ? 'tight' : ''}"><i style="width:${Math.min(100, pay)}%"></i><span>소진 ${pay}%</span></div></div>`));

  g.appendChild(left); g.appendChild(right); v.appendChild(g);
  v.querySelectorAll('[data-pid]').forEach(r => r.onclick = () => openPlayer(+r.dataset.pid));
  const rpb = $('#rpOpen'); if (rpb) rpb.onclick = () => openReplay(lastBox);
}

/* ── 팀 ── */
const POS_SLOT = { C:'c', '1B':'b1', '2B':'b2', '3B':'b3', SS:'ss',
                   LF:'lf', CF:'cf', RF:'rf' };

/** 수비 배치. 그라운드 그림 위에 사람을 세운다. 상자 격자가 아니라 야구장이다. */
const FC_POS = { LF:[17,26], CF:[50,15], RF:[83,26], SS:[33,46], '2B':[67,46], '3B':[15,67], '1B':[85,67], SP:[50,59], C:[50,86], CL:[88,86] };
function fieldChart() {
  const ch = G.lineupChart();
  const chip = (pos, p, cls = '') => { const [x, y] = FC_POS[pos];
    return `<span class="fcp ${cls} ${p ? 'click' : 'empty'}" style="left:${x}%;top:${y}%"${p ? ` data-pid="${p.pid}"` : ''}>
      <i>${pos}</i>${p ? `<b>${esc(p.name)}</b><u>${p.ovr.mid}</u>` : ''}</span>`; };
  return `<div class="fieldchart">
    <svg viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
      <path class="fc-grass" d="M200 285 L18 90 Q200 -40 382 90 Z"/>
      <path class="fc-dirt" d="M200 285 L120 205 L200 125 L280 205 Z"/>
      <path class="fc-inner" d="M200 262 L143 205 L200 148 L257 205 Z"/>
      <circle class="fc-mound" cx="200" cy="205" r="9"/>
      <path class="fc-line" d="M200 285 L18 90 M200 285 L382 90"/>
    </svg>
    ${['LF','CF','RF','SS','2B','3B','1B','C'].map(pos => chip(pos, ch.pos[pos])).join('')}
    ${chip('SP', ch.sp, 'pit')}${chip('CL', ch.closer, 'pit')}
  </div>`;
}

function batRow(p, live) {
  const s = p.stat || {};
  const c = [nameCell(p), `<span class="pen">${p.pen || p.slot}</span>`,
             `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot)];
  if (live) c.push(`<span class="m">${s.g ?? 0}</span>`, `<span class="m">${s.pa ?? 0}</span>`,
    `<span class="m">${s.avg ?? '—'}</span>`, `<span class="m">${s.ops ?? '—'}</span>`,
    `<span class="m">${s.hr ?? 0}</span>`, `<span class="m">${s.rbi ?? 0}</span>`,
    `<span class="m">${s.sb ?? 0}</span>`);
  c.push(p.contract ? `<span class="m dim">${p.contract.text}</span>` : '<span class="dim">—</span>');
  return { p, cells: c };
}
function pitRow(p, live) {
  // 보직(1선발 / 마무리 / 필승조…)이 포지션 표기보다 정보가 많다.
  const s = p.stat || {};
  const c = [nameCell(p), `<span class="pen">${p.pen || p.slot}</span>`,
             `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot)];
  if (live) c.push(`<span class="m">${s.g ?? 0}</span>`, `<span class="m">${s.ip ?? '—'}</span>`,
    `<span class="m">${s.w ?? 0}<span class="dim">-</span>${s.l ?? 0}</span>`,
    `<span class="m">${s.sv ?? 0}</span>`, `<span class="m">${s.era ?? '—'}</span>`,
    `<span class="m">${s.k ?? 0}</span>`);
  c.push(p.contract ? `<span class="m dim">${p.contract.text}</span>` : '<span class="dim">—</span>');
  return { p, cells: c };
}
const BAT_HEAD = (live) => ['선수','P','나이','능력 / 잠재력',
  ...(live ? ['G','PA','AVG','OPS','HR','RBI','SB'] : []), '계약'];
const PIT_HEAD = (live) => ['선수','보직','나이','능력 / 잠재력',
  ...(live ? ['G','IP','W-L','SV','ERA','K'] : []), '계약'];

let teamTab = 'prep';                 // 경기 준비 · 선수단 · 2군 · 병역
function viewTeam(v) {
  const r = G.roster();
  const live = ['regular','postseason'].includes(G.state().phase);
  const g = el('div', 'grid');

  // 한 화면에 다 쌓지 않는다. 할 일이 다른 셋으로 나눈다.
  const segs = [['prep', '경기 준비', icon('glove')], ['roster', '선수단', icon('bat')], ['farm', '2군 · 병역', icon('pinch')]];
  const seg = el('div', 'tseg');
  seg.innerHTML = segs.map(([k, t, ic]) => `<button data-tt="${k}" class="${teamTab === k ? 'on' : ''}">${ic}<span>${t}</span></button>`).join('');
  v.appendChild(seg);
  seg.querySelectorAll('[data-tt]').forEach(b => b.onclick = () => { teamTab = b.dataset.tt; render(); });

  const lu = G.lineup();
  const ps = G.pitcherStatus();
  const forcedPid = ps.forced_pid;
  const fitCls = (f) => f === '적합' ? '' : f === '가능' ? 'w1' : f === '무리' ? 'w2' : 'w3';

  if (teamTab === 'prep') {
    /* 수비 배치와 타순은 한 장면이다. 왼쪽은 그라운드, 오른쪽은 타순. */
    g.appendChild(sect('', lu.manual ? '수동 편성' : '자동 편성', `<div class="prep">
      ${fieldChart()}
      <div class="lurows">${lu.slots.map(s => `
        <div class="lurow${luSel === s.order ? ' sel' : ''}" data-slot="${s.order}">
          <span class="lo">${s.order}</span>
          <span class="ln">${esc(s.name)}<i>${s.nat}</i></span>
          <select class="lp" data-pos="${s.order}">${lu.positions.map(p =>
            `<option value="${p}"${p === s.slot ? ' selected' : ''}>${p}</option>`).join('')}</select>
          <span class="lf ${fitCls(s.fit)}">${s.fit}${s.pen ? ` <i>-${s.pen}</i>` : ''}</span>
          <span class="la">${axis(s.ovr, s.pot)}</span>
        </div>`).join('')}
        <div class="luhint">${luSel === null ? '타순 둘을 차례로 누르면 바뀐다 · 벤치를 누르면 그 자리에 들어간다' : `${luSel}번과 바꿀 자리를 고른다`}</div>
      </div>
    </div>
    <div class="prep3">
      <div class="pcol">${icon('pinch', 'pcol-ic')}<span class="pcnt">${lu.bench.length}</span>
        ${lu.bench.length ? lu.bench.map(b => `<button class="lb" data-bench="${b.pid}">${esc(b.name)}<i>${b.nat}</i></button>`).join('') : '<div class="empty">벤치 없음</div>'}</div>
      <div class="pcol">${icon('ball', 'pcol-ic')}<span class="pcnt">${lu.rotation.length}</span>
        <div class="lurot">${lu.rotation.map(p => `<button class="lb rot ${luRot === p.pid ? 'sel' : ''}" data-rot="${p.pid}">${p.order}<i>${esc(p.name)}</i></button>`).join('')}</div></div>
      <div class="pcol">${icon('glove', 'pcol-ic')}<span class="pcnt">${lu.bullpen.length}</span>
        <div class="lupen">${lu.bullpen.map(p => `<div class="pnrow">
          <span class="pnn">${esc(p.name)}${p.locked ? '<em>지정</em>' : ''}</span>
          <select class="lp" data-pen="${p.pid}">${lu.penRoles.map(rr =>
            `<option value="${rr.key}"${rr.key === p.role ? ' selected' : ''}>${rr.label}</option>`).join('')}</select>
        </div>`).join('')}</div></div>
    </div>
    <div class="prepbar"><button class="quiet luauto" id="luAuto">자동 편성으로</button></div>`));

    // 투수 운용. 오늘 누가 던질 수 있는가.
    const prow = (p, isRot) => `<div class="prow ${p.ready ? '' : 'off'}${
        isRot && p.pid === forcedPid ? ' pick' : ''}" data-pid="${p.pid}"${
        isRot && p.ready ? ` data-sp="${p.pid}"` : ''}>
      <span class="pr-role ${isRot && ((forcedPid ? p.pid === forcedPid
        : p.turn === 0 && !ps.pen_day_next)) ? 'next' : ''}">${
        isRot ? (p.pid === forcedPid ? '다음 선발' :
          (!forcedPid && !ps.pen_day_next && p.turn === 0 ? '다음 선발' : `${p.turn}일 뒤`))
        : esc(p.role)}</span>
      <span class="pr-name">${esc(p.name)}<i>스태미나 ${p.stamina}</i></span>
      <span class="pr-state">${p.hurt ? `<em class="mark">✚${p.hurt}일</em>`
        : p.ready ? '<em class="ok">등판 가능</em>'
        : `<em class="rest">${p.rest_left}일 휴식</em>`}</span>
      <span class="pr-last">${p.consec ? `<b class="warn">연투 ${p.consec}일</b>` : ''}${
        p.days_off != null ? `<span>${p.days_off}일 전 등판</span>` : ''}</span>
    </div>`;
    g.appendChild(sect('', `불펜 ${ps.ready}/${ps.total} 가능${ps.bullpen_day ? ' · 오늘은 불펜데이' : ''}`,
      `<div class="pstat">
        <div class="lead">${icon('ball', 'lead-ic')}
          ${ps.rotation.map(p => prow(p, true)).join('')}
          <div class="spbar">
            <button id="spPen" class="${ps.pen_day_next ? 'on' : ''}">불펜데이로 간다</button>
            ${(ps.forced || ps.pen_day_next) ? '<button id="spClr" class="quiet">순번대로</button>' : ''}
            <i>${ps.pen_day_next ? '다음 경기는 오프너가 나간다.' : ps.forced ? `다음 경기 선발은 ${esc(ps.forced)}.` : '선발을 누르면 다음 경기에 앞세운다.'}</i>
          </div>
          ${ps.thin ? `<p class="note">${ps.bullpen_day ? '던질 선발이 없다. 롱릴리프가 오프너로 나간다.' : '선발에 빈자리가 있다. 순번이 돌아오면 불펜이 메운다.'}</p>` : ''}</div>
        <div class="lead">${icon('glove', 'lead-ic')}
          ${ps.bullpen.map(p => prow(p, false)).join('')}</div>
      </div>`));

    // 감독 성향. 경기 중 결정은 감독이 한다.
    const tc = G.tactics();
    g.appendChild(sect('', '', `<div class="tacs">${tc.rows.map(rr => `
      <div class="tac">
        <div class="tk">${esc(rr.label)}<i>${esc(rr.hint)}</i></div>
        <div class="tsteps">${rr.steps.map((s2, i) =>
          `<button data-tk="${rr.key}" data-tv="${i}" class="${i === rr.value ? 'on' : ''}">${esc(s2)}</button>`).join('')}</div>
      </div>`).join('')}</div>`));
  }

  if (teamTab === 'roster') {
    if (live) {
      const ts = G.leagueTeamStats().rows.find(x => x.is_user);
      const f = G.form(null, 10);
      const st = G.standings().rows.find(x => x.is_user);
      const n = G.standings().rows.length || 10;
      const rk = (x) => `<i class="rkc ${x <= 3 ? 'top' : x >= n - 2 ? 'low' : ''}">${x}위</i>`;
      const tile = (val, cap, rank = null) => `<div class="htile"><b class="m">${val}</b><span>${cap}${rank ? rk(rank) : ''}</span></div>`;
      g.appendChild(sect('', '', `<div class="htiles t8">
        ${tile(`${st.w}–${st.l}`, '전적')}${tile(ts.avg, '타율', ts.rank.avg)}${tile(ts.hr, '홈런', ts.rank.hr)}${tile(ts.sb, '도루', ts.rank.sb)}
        ${tile(ts.era, 'ERA', ts.rank.era)}${tile(ts.whip, 'WHIP')}${tile(ts.pk, '탈삼진', ts.rank.k)}${tile(`${f.home[0]}–${f.home[1]} <small>홈</small>${f.away[0]}–${f.away[1]} <small>원정</small>`, '홈 · 원정')}
      </div>`));
    }
    // 타자 한 표, 투수 한 표. 그룹은 첫 칸이 말한다.
    const grpCell = (t, cls) => `<span class="grp ${cls}">${t}</span>`;
    const bats = r.lineup.map(p => ({ p, grp: grpCell('선발', 'g1') })).concat(r.bench.map(p => ({ p, grp: grpCell('벤치', 'g2') })));
    const pits = r.rotation.map(p => ({ p, grp: grpCell('선발', 'g1') })).concat(r.bullpen.map(p => ({ p, grp: grpCell(p.pen || '불펜', 'g2') })));
    g.appendChild(sect('', `${bats.length} · ${AXIS_KEY}`, `<div class="lead">${icon('bat', 'lead-ic')}</div>` ));
    g.lastChild.appendChild(table(['', ...BAT_HEAD(live)], bats.map(({ p, grp }) => { const row = batRow(p, live); row.cells.unshift(grp); return row; }), (row) => openPlayer(row.p.pid)));
    g.appendChild(sect('', `${pits.length}`, `<div class="lead">${icon('ball', 'lead-ic')}</div>`));
    g.lastChild.appendChild(table(['', ...PIT_HEAD(live)], pits.map(({ p, grp }) => { const row = pitRow(p, live); row.cells.unshift(grp); return row; }), (row) => openPlayer(row.p.pid)));
    if (r.injured.length) {
      g.appendChild(sect('', `${r.injured.length}`, `<div class="lead">${icon('bolt', 'lead-ic hurt')}</div>`));
      g.lastChild.appendChild(table(['선수','P','나이','능력 / 잠재력','복귀까지','계약'],
        r.injured.map(p => ({ p, cells: [nameCell(p), `<span class="m dim">${p.slot}</span>`,
          `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot),
          `<b class="m mark">${p.injury_days}일</b>`,
          p.contract ? `<span class="m dim">${p.contract.text}</span>` : '—'] })),
        (row) => openPlayer(row.p.pid)));
    }
  }

  if (teamTab === 'farm') {
    const fm = G.farmMoves();
    const roleCls = { 주전:'r1', 선발:'r1', 불펜:'r2', 대기:'r3' };
    g.appendChild(sect('', `등록 ${fm.count} / ${fm.max}`, `<div class="fm2">
      <div class="lead">${icon('star', 'lead-ic')}<span class="pcnt">1군 ${fm.active.length}</span>
        <div class="fmlist">${fm.active.map(p => `<div class="fmrow">
          <span class="fr ${roleCls[p.role] || ''}">${p.role}</span>
          <span class="fn2">${esc(p.name)}<i>${p.slot} · ${p.age}세</i></span>
          <span class="fs">${p.hurt ? `<em class="mark">✚${p.hurt}일</em>` : (p.stat ? esc(p.stat) : '')}</span>
          <span class="fb"><button data-down="${p.pid}">2군</button><button data-rel="${p.pid}" class="q">방출</button></span>
        </div>`).join('')}</div></div>
      <div class="lead">${icon('pinch', 'lead-ic')}<span class="pcnt">2군 ${fm.farm.length}</span>
        <div class="fmlist">${fm.farm.map(p => `<div class="fmrow">
          <span class="fn2">${esc(p.name)}<i>${p.slot} · ${p.age}세</i></span>
          <span class="fa2">${axis(p.ovr, p.pot)}</span>
          <span class="fb">${p.wait ? `<span class="dim">${p.wait}일 대기</span>` : `<button data-up="${p.pid}">1군</button>`}</span>
        </div>`).join('')}</div></div>
    </div>`));

    const farm = G.farm().rows;
    g.appendChild(sect('', `${farm.length} · ${AXIS_KEY}`, `<div class="lead">${icon('pinch', 'lead-ic')}</div>`));
    g.lastChild.appendChild(table(['선수','P','나이','능력 / 잠재력','확신도','출신','지명'],
      farm.map(p => ({ p, cells: [nameCell(p), `<span class="m dim">${p.slot}</span>`,
        `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot),
        `<span class="m dim">${p.confidence}%</span>`,
        p.origin ? `<span class="tag hs">${p.origin[0]}</span>` : '<span class="dim">—</span>',
        `<span class="m dim">${p.draft ? '#' + p.draft.overall : '—'}</span>`] })),
      (row) => openPlayer(row.p.pid)));

    const ml = G.military();
    const milRow = (p, kind) => `<div class="mrow">
      <span class="mn">${esc(p.name)}<i>${p.slot} · ${p.age}세</i></span>
      ${kind === 'serving' ? `<span class="mk">${p.kind}</span><span class="ml2">${p.left}년 남음</span>`
        : kind === 'due' ? `<span class="mk ${p.active ? 'on' : ''}">${p.active ? '1군' : '2군'}</span>
            <span class="ml2 ${p.due <= 1 ? 'urg' : ''}">${p.due === 0 ? '올겨울 입대' : `${p.due}년 뒤`}</span>`
        : `<span class="mk ok">면제</span><span class="ml2">${p.natl ? `대표 ${p.natl}회` : ''}</span>`}
    </div>`;
    g.appendChild(sect('', ml.calendar.length ? ml.calendar.map(c => `${c.year} ${c.meets.join('·')}`).join('  ·  ') : '',
      `<div class="mil3">
        <div><span class="pcnt">미필 ${ml.due.length}</span>
          <div class="mlist">${ml.due.length ? ml.due.map(p => milRow(p, 'due')).join('') : '<div class="empty">—</div>'}</div></div>
        <div><span class="pcnt">복무 중 ${ml.serving.length}</span>
          <div class="mlist">${ml.serving.length ? ml.serving.map(p => milRow(p, 'serving')).join('') : '<div class="empty">—</div>'}</div></div>
        <div><span class="pcnt">면제 ${ml.exempt.length}</span>
          <div class="mlist">${ml.exempt.length ? ml.exempt.map(p => milRow(p, 'exempt')).join('') : '<div class="empty">—</div>'}</div>
          <p class="note">대표팀은 그 시즌 1군 성적으로 뽑는다. ${ml.ageLimit}세 이하, 와일드카드 셋. 아시안게임 금 · 올림픽 동 이상이 면제. WBC 는 면제가 없다.</p></div>
      </div>`));
  }

  v.appendChild(g);
  const move = (fn, pid, ok) => { const r = fn(pid);
    if (r.error === 'full') toast('', '1군 등록이 꽉 찼다', 'warn');
    else if (r.error === 'thin') toast('', '1군 인원이 모자란다', 'warn');
    else if (r.error === 'wait') toast('', `${r.days}일 뒤에 올릴 수 있다`, 'warn');
    else if (r.error) toast('', '움직일 수 없다', 'warn');
    else ok(r);
    autosave(); render(); };
  v.querySelectorAll('[data-up]').forEach(b => b.onclick = () =>
    move(x => G.callUpPlayer(x), +b.dataset.up, r => toast('1군 등록', r.name)));
  v.querySelectorAll('[data-down]').forEach(b => b.onclick = () =>
    move(x => G.sendDownPlayer(x), +b.dataset.down, r => toast('2군', r.name)));
  v.querySelectorAll('[data-rel]').forEach(b => b.onclick = () => {
    const nm = b.closest('.fmrow').querySelector('.fn2').textContent.trim();
    if (!confirm(`${nm} 을(를) 방출한다. 잔여 연봉은 그대로 나간다.`)) return;
    move(x => G.releasePlayer(x), +b.dataset.rel, r => toast('방출', `${r.name} · ${r.cost}억`));
  });
  v.querySelectorAll('.lurow').forEach(r => r.onclick = (e) => {
    if (e.target.tagName === 'SELECT') return;
    const n = +r.dataset.slot;
    if (luSel === null) { luSel = n; render(); return; }
    if (luSel === n) { luSel = null; render(); return; }
    G.swapLineup(luSel, n); luSel = null; autosave(); render();
  });
  v.querySelectorAll('[data-pos]').forEach(s => s.onchange = () => {
    G.setSlotPos(+s.dataset.pos, s.value); autosave(); render();
  });
  v.querySelectorAll('[data-pen]').forEach(s => s.onchange = () => {
    const r = G.setPenRole(+s.dataset.pen, s.value);
    if (!r.error) toast(r.kr, r.name);
    autosave(); render();
  });
  v.querySelectorAll('[data-bench]').forEach(b => b.onclick = () => {
    if (luSel === null) { toast('', '먼저 바꿀 타순을 고른다', 'warn'); return; }
    G.placeInLineup(luSel, +b.dataset.bench); luSel = null; autosave(); render();
  });
  v.querySelectorAll('[data-rot]').forEach(b => b.onclick = () => {
    if (luRot === null) { luRot = +b.dataset.rot; render(); return; }
    const list = G.lineup().rotation;
    const to = list.findIndex(p => p.pid === +b.dataset.rot) + 1;
    G.setRotation(to, luRot); luRot = null; autosave(); render();
  });
  const la = $('#luAuto'); if (la) la.onclick = () => { G.autoLineup(); luSel = null; autosave(); render(); };
  v.querySelectorAll('[data-tk]').forEach(b => b.onclick = () => {
    G.setTactic(b.dataset.tk, +b.dataset.tv); autosave(); render();
  });
  // 선발 한 번 누르면 다음 경기 선발. 다시 누르면 순번대로.
  v.querySelectorAll('[data-sp]').forEach(e => e.onclick = (ev) => {
    ev.stopPropagation();
    const pid = +e.dataset.sp;
    const r = pid === ps.forced_pid ? G.clearNextStarter() : G.setNextStarter(pid);
    if (r.error === 'hurt') toast('', `부상 중이다 — ${r.days}일 남았다`, 'warn');
    else if (r.name) toast('다음 선발', r.name);
    autosave(); render();
  });
  const sp1 = $('#spPen'); if (sp1) sp1.onclick = () => {
    const r = G.setBullpenDay(!ps.pen_day_next);
    toast(r.on ? '불펜데이' : '', r.on ? '다음 경기는 오프너로 간다' : '순번대로 돌아간다');
    autosave(); render();
  };
  const sp2 = $('#spClr'); if (sp2) sp2.onclick = () => {
    G.clearNextStarter(); autosave(); render();
  };
  v.querySelectorAll('.fcp.click').forEach(e => e.onclick = () => openPlayer(+e.dataset.pid));
}

/* ── 리그 ── */
function viewLeague(v) {
  let st = G.standings().rows;
  const g = el('div', 'grid');
  let title = '순위';
  if (!st.length) { const ls = G.lastStandings(); st = ls.rows; title = `${ls.year} 최종 순위`; }
  if (!st.length) { v.appendChild(sect('순위', '', '<div class="empty">—</div>')); return; }
  const live = !!G.state().total_days && G.state().day > 0;
  const nPo = st.filter(r => r.playoff).length;
  g.appendChild(sect(title, nPo ? `위 ${nPo}팀이 가을야구` : '', table(
    ['팀','W','L','D','PCT','GB','RS','RA','PYTH', ...(live ? ['최근 10','홈','원정'] : [])],
    st.map((r, i) => {
      const f = live ? G.form(r.team_id, 10) : null;
      return { _cls: (r.is_user ? 'me ' : '') + (nPo && i === nPo - 1 ? 'cut' : ''), team_id: r.team_id, cells: [
        `<span class="tcell"><span class="m dim pn">${i + 1}</span>${cap(r.team, 22)}<span class="name">${esc(r.team)}</span></span>`,
        `<span class="m">${r.w}</span>`, `<span class="m">${r.l}</span>`,
        `<span class="m dim">${r.d || 0}</span>`,
        `<span class="m">${r.pct}</span>`, `<span class="m dim">${r.gb}</span>`,
        `<span class="m">${r.rs}</span>`, `<span class="m">${r.ra}</span>`,
        `<span class="m dim">${r.pyth}</span>`,
        ...(live ? [formStrip(f.recent), `<span class="m dim">${f.home[0]}–${f.home[1]}</span>`,
                    `<span class="m dim">${f.away[0]}–${f.away[1]}</span>`] : [])] };
    }), (row) => openTeam(row.team_id))));

  const ts = G.leagueTeamStats().rows;
  if (ts.length && live) {
    const rk = (v, n) => `<span class="m">${v}<i class="rk">${n}</i></span>`;
    g.appendChild(sect('팀 기록', 'ERA 순', table(['팀','타율','홈런','도루','볼넷','삼진','ERA','WHIP','탈삼진'],
      ts.sort((a,b) => a.rank.era - b.rank.era).map(r => ({ _cls: r.is_user ? 'me' : '',
        team_id: r.team_id, cells: [`<span class="tcell">${cap(r.team, 22)}<span class="name">${esc(r.team)}</span></span>`,
          rk(r.avg, r.rank.avg), rk(r.hr, r.rank.hr), rk(r.sb, r.rank.sb),
          `<span class="m">${r.bb}</span>`, `<span class="m">${r.k}</span>`,
          rk(r.era, r.rank.era), `<span class="m">${r.whip}</span>`, rk(r.pk, r.rank.k)] })),
      (row) => openTeam(row.team_id))));
  }
  const L = G.leaders(5);
  g.appendChild(sect('', '', `<div class="lead">${icon('bat', 'lead-ic')}<span class="pcnt">타격</span></div>` + ldrBoard(L.batting)));
  g.appendChild(sect('', '', `<div class="lead">${icon('ball', 'lead-ic')}<span class="pcnt">투구</span></div>` + ldrBoard(L.pitching)));
  v.appendChild(g);
  v.querySelectorAll('[data-pid]').forEach(e => e.onclick = () => openPlayer(+e.dataset.pid));
}

/* ── 프런트 ── */
/** 세이브 구역. 브라우저 저장소는 영구적이지 않다는 것을 말해 준다. */
function saveSection(v) {
  const sec = sect('세이브', '', `<div class="savebox">
    <p class="note">이 구단은 이 브라우저 안에만 있다. 저장 공간을 비우거나
      한동안 들어오지 않으면 사라진다. 기기를 바꿔도 따라오지 않는다.
      파일로 꺼내 두면 어디서든 이어서 할 수 있다.</p>
    <div class="savebtn">
      <button id="svExport" class="primary">파일로 내보내기</button>
      <button id="svImport" class="quiet">파일에서 불러오기</button>
      <button id="svInfo" class="quiet">정보 · 약관</button>
    </div>
  </div>`);
  v.appendChild(sec);
  $('#svExport').onclick = () => exportSave();
  $('#svInfo').onclick = modalInfo;
  $('#svImport').onclick = () => {
    if (!confirm('불러오면 지금 구단은 사라진다. 계속하겠는가?')) return;
    pickSaveFile(() => { lastPhase = null; render(); toast('불러왔다', G.state().year + ' 시즌'); });
  };
}

function viewFront(v) {
  const s = G.state().phase;
  if (s === 'off_foreign') return viewForeign(v);
  if (s === 'off_fa') return viewFA(v);
  if (s === 'off_draft') return viewDraft(v);
  if (s === 'off_trade') return viewTrade(v);
  const f = G.finances();
  const own = G.ownerStatus();
  const inc = f.income, tot = Math.max(1, inc.ticket + inc.concession + inc.media);
  const pay = f.budget ? Math.round(f.payroll / f.budget * 100) : 0;
  const g = el('div', 'grid');

  /* 맨 위 — 돈과 구단주. 제목 대신 아이콘, 숫자, 게이지. */
  g.appendChild(sect('', '', `<div class="ftiles">
    <div class="htile fin">${icon('won')}
      <b><span class="m">${f.payroll}</span>억 <small>/ ${f.budget}억</small></b>
      <div class="meter ${pay > 100 ? 'over' : pay > 90 ? 'tight' : ''}"><i style="width:${Math.min(100, pay)}%"></i><span>소진 ${pay}%</span></div>
      <p class="${f.room < 0 ? 'mark' : ''}">${f.room >= 0 ? `여력 ${f.room}억` : `초과 ${-f.room}억`}</p>
    </div>
    <div class="htile inc">${icon('star')}
      <b><span class="m">${tot}</span>억 <small>시즌 수입</small></b>
      <div class="incbar">${[['ticket','i1'],['concession','i2'],['media','i3']].map(([k, c]) => `<i class="${c}" style="width:${inc[k] / tot * 100}%"></i>`).join('')}</div>
      <div class="inclegend"><span><i class="i1"></i>입장 ${inc.ticket}</span><span><i class="i2"></i>식음료·굿즈 ${inc.concession}</span><span><i class="i3"></i>중계·스폰서 ${inc.media}</span></div>
    </div>
    <div class="htile owner2 ${own.ok === false ? 'bad' : ''}">${icon('owner')}
      <b>${esc(own.demand)}</b>
      <div class="meter"><i style="width:${Math.max(4, Math.min(100, own.patience))}%"></i><span>인내 ${own.patience}</span></div>
      <p>${esc(own.text)}</p>
    </div>
  </div>`));

  // 계약 만료 · FA 임박. 있을 때만.
  const al = G.contractAlerts().rows;
  if (al.length) g.appendChild(sect('', '', `<div class="lead">${icon('bolt', 'lead-ic')}<span class="pcnt">계약 만료 · FA 임박 ${al.length}</span>
    <div class="alrow">${al.map(p => `<button class="lb" data-pid="${p.pid}">${esc(p.name)}<i>${p.age} ${p.slot}</i><em class="tag ${p.status === 'FA' ? 'inj' : ''}">${p.status}</em></button>`).join('')}</div></div>`));

  // 외국인. 있으면 표, 여름 시장이 열렸으면 그 아래.
  const fr = G.foreignReplacements();
  if (!fr.error && fr.mine.length) {
    g.appendChild(sect('', fr.open ? `교체 마감까지 ${fr.left - fr.deadline}일` : '교체 마감', `<div class="lead">${icon('park', 'lead-ic')}<span class="pcnt">외국인 ${fr.mine.length}</span></div>`));
    g.lastChild.appendChild(table(['선수','국적','P','능력 / 잠재력','올 시즌','WAR','연봉'],
      fr.mine.map(p => ({ p, cells: [nameCell(p), `<span class="nat">${esc(p.nation)}</span>`,
        `<span class="m dim">${p.slot}</span>`, axis(p.ovr, p.pot), `<span class="m dim">${esc(p.stat)}</span>`,
        `<b class="m ${p.war < 1 ? 'neg' : p.war >= 3 ? 'pos' : ''}">${p.war}</b>`, `<span class="m">${p.paid}억</span>`] }))));
    if (fr.open && fr.pool.length) {
      g.appendChild(sect('', `${fr.pool.length} · ${AXIS_KEY}`, `<div class="lead">${icon('pinch', 'lead-ic')}<span class="pcnt">여름 시장</span></div>`));
      g.lastChild.appendChild(table(['선수','국적','P','나이','능력 / 잠재력','잔여 몸값',''],
        fr.pool.map(p => ({ p, cells: [nameCell(p), `<span class="nat">${esc(p.nation)}</span>`,
          `<span class="m dim">${p.slot}</span>`, `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot),
          `<b class="m">${p.price}억</b>`, `<span class="fbtn"><button data-repl="${p.pid}">교체</button></span>`] }))));
      g.lastChild.appendChild(el('p', 'note', '여름에 나온 선수는 겨울에 팔리지 않았거나 다른 데서 잘린 선수다. 급이 떨어지고 볼 시간도 짧다. 방출해도 이미 준 돈은 돌아오지 않는다.'));
    }
  }

  /* 코치진. 자리마다 한 칸 — 이름과 등급이 크고, 시장은 그 아래. */
  const sf = G.staff();
  g.appendChild(sect('', `연봉 ${sf.cost}억`, `<div class="lead">${icon('glove', 'lead-ic')}<span class="pcnt">코치진 ${sf.rows.filter(r => r.cur).length}/${sf.rows.length}</span>
    <div class="stf2">${sf.rows.map(r => `
    <div class="scard">
      <div class="sk">${esc(r.label)}<i>${esc(r.hint)}</i></div>
      <div class="sc">${r.cur ? `<b>${esc(r.cur.name)}</b><span class="m sn">${r.cur.rating}</span><span class="m dim">${r.cur.salary}억 · ${r.cur.age}세</span>` : '<span class="dim">공석</span>'}</div>
      <div class="se">${esc(r.effect)}</div>
      <div class="sm">${r.market.map(c => `<button data-hire="${r.key}:${c.id}" class="${r.cur && c.rating > r.cur.rating ? 'up' : ''}">${esc(c.name)}<i>${c.rating}</i><em>${c.salary}억</em></button>`).join('')}</div>
    </div>`).join('')}</div></div>`));

  /* 구장과 유니폼. 그림이 곧 설명이다. */
  const bp = G.ballpark();
  const ufr = franchiseOf(G.state().user_team.name);
  g.appendChild(sect('', '', `<div class="parkwrap">
    <div class="parkbox">${fieldSvg(bp, capOf(G.state().user_team.name).color)}</div>
    <div class="parkside">
      <div class="parkname"><b>${esc(bp.name)}</b><span>${bp.opened} 개장 · ${bp.dome ? '돔' : '개방'} · ${bp.turf ? '인조잔디' : '천연잔디'}</span></div>
      <div class="htiles p4">
        <div class="htile"><b class="m">${bp.fL}<small>·</small>${bp.fC}<small>·</small>${bp.fR}</b><span>담장 (m)</span></div>
        <div class="htile"><b class="m">${bp.fH}<small>m</small></b><span>담장 높이</span></div>
        <div class="htile"><b class="m">${bp.capacity.toLocaleString()}</b><span>좌석</span></div>
        ${bp.attendance ? `<div class="htile"><b class="m">${bp.attendance.toLocaleString()}</b><span>평균 관중 <i class="rkc">${bp.rate}%</i></span></div>` : ''}
        ${f.park && f.park.total ? `<div class="htile"><b class="m">${Math.round(f.park.total / 10000 * 10) / 10}<small>만</small></b><span>시즌 총관중</span></div>` : ''}
      </div>
      <div class="unis"><div class="uni"><div class="ubox">${jersey(ufr, false, 92)}</div><span>홈</span></div>
        <div class="uni"><div class="ubox away">${jersey(ufr, true, 92)}</div><span>원정</span></div></div>
    </div>
  </div>`));

  // 연봉. 표가 맞는 정보다.
  g.appendChild(sect('', `${f.contracts.length}명 · ${f.payroll}억`, `<div class="lead">${icon('won', 'lead-ic')}</div>`));
  g.lastChild.appendChild(table(['선수','나이','연봉','계약','만료'],
    f.contracts.map(x => ({ pid: x.pid, cells: [`<span class="name">${esc(x.name)}</span>`,
      `<span class="m">${x.age}</span>`, `<span class="m">${x.salary}</span>`,
      `<span class="m dim">${x.text}</span>`, `<span class="m dim">${x.end_year}</span>`] })),
    (row) => openPlayer(row.pid)));
  v.appendChild(g);
  saveSection(v);
  v.querySelectorAll('[data-hire]').forEach(b => b.onclick = () => {
    const [role, id] = b.dataset.hire.split(':');
    const r = G.hireCoach(role, +id);
    if (r.error === 'budget') toast('', `예산 부족 · 여력 ${r.room}억`, 'warn');
    else if (r.error) toast('', '영입할 수 없다', 'warn');
    else toast('영입', r.name);
    autosave(); render();
  });
  v.querySelectorAll('[data-repl]').forEach(b => b.onclick = (e) => {
    e.stopPropagation(); openReplace(+b.dataset.repl);
  });
  v.querySelectorAll('[data-pid]').forEach(r => r.onclick = () => openPlayer(+r.dataset.pid));
}

/* 누구를 내보낼 것인가. 이건 되돌릴 수 없다. */
function openReplace(inPid) {
  const fr = G.foreignReplacements();
  const inc = fr.pool.find(p => p.pid === inPid);
  if (!inc) return;
  modal(`
    <div class="mhead"><div><h2>${esc(inc.name)} 영입</h2>
      <div class="meta">${inc.nation} · ${inc.age}세 · ${inc.slot} · 잔여 ${inc.price}억</div></div>
      <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
      <div class="lab">내보낼 선수</div>
      ${fr.mine.map(p => `<div class="row click" data-out="${p.pid}">
        <span><span class="name">${esc(p.name)}</span>
          <span class="sub">${esc(p.stat)}</span></span>
        <span><b class="m ${p.war < 1 ? 'neg' : ''}">${p.war}</b>
          <span class="m dim">${p.paid}억</span></span></div>`).join('')}
      <p class="note">방출한 선수의 연봉은 그대로 나간다. 새 선수 몸값 ${inc.price}억이
        더해진다. 남은 여력 ${(fr.budget - fr.payroll).toFixed(1)}억.</p>
    </div>`);
  document.querySelectorAll('[data-out]').forEach(e => e.onclick = () => {
    const out = fr.mine.find(p => p.pid === +e.dataset.out);
    if (!confirm(`${out.name}을 방출하고 ${inc.name}을 영입한다. 되돌릴 수 없다.`)) return;
    const r = G.replaceForeign(+e.dataset.out, inPid);
    closeModal();
    if (r.error === 'budget') toast('', `예산 부족 · 여력 ${r.room}억`, 'warn');
    else if (r.error) toast('', '교체할 수 없다', 'warn');
    else toast('영입', `${r.in} ${r.price}억`);
    autosave(); render();
  });
}

/* 외국인 시장. 보유 3명, 그중 투수 2명. 계약은 1년이라 매 겨울 다시 정한다.
   몸값은 리그 공통의 평판에 붙는다. 우리 스카우트가 본 것과 다를 수 있다. */
function viewForeign(v) {
  const m = G.foreignMarket();
  if (m.error) return;
  const g = el('div', 'grid');
  const held = 3 - m.room, heldP = 2 - m.pitcherRoom;
  const pay = m.budget ? Math.round(m.payroll / m.budget * 100) : 0;
  // 첫 줄 — 쿼터와 돈. 제목 없이 숫자와 게이지로.
  g.appendChild(sect('', '', `<div class="ftiles">
    <div class="htile">${icon('pinch')}<b><span class="m">${held}</span><small>/ 3 보유</small></b>
      <div class="quotadots">${[0,1,2].map(i => `<i class="${i < held ? 'on' : ''}"></i>`).join('')}</div>
      <p>투수 <b class="m">${heldP}</b>/2 · 자리 ${m.room}</p></div>
    <div class="htile">${icon('won')}<b><span class="m">${m.cap}</span>억 <small>신규 계약 상한</small></b>
      <p>재계약은 상한이 없다</p></div>
    <div class="htile fin">${icon('star')}<b><span class="m">${m.payroll}</span>억 <small>/ ${m.budget}억</small></b>
      <div class="meter ${pay > 100 ? 'over' : pay > 90 ? 'tight' : ''}"><i style="width:${Math.min(100, pay)}%"></i><span>소진 ${pay}%</span></div></div>
  </div>`));

  // 우리 외국인. 있으면 카드로 — 재계약과 방출은 얼굴을 보고 정한다.
  if (m.mine.length) g.appendChild(sect('', '', `<div class="fcards">${m.mine.map(p => `
    <div class="fcard" data-pid="${p.pid}">
      ${avatar(p, capOf(G.state().user_team.name).color, 44)}
      <div class="fc-main"><b>${esc(p.name)}</b><span>${esc(p.nation)} · ${p.slot} · ${p.age}세</span>
        <span class="m dim">${p.stat || '—'}</span></div>
      <div class="fc-ax">${axis(p.ovr, p.pot)}</div>
      <div class="fc-act">${p.contract ? '<span class="tag ok">재계약</span>'
        : `<b class="m">${p.ask}억</b><span class="fbtn"><button data-re="${p.pid}">재계약</button><button data-rel="${p.pid}" class="q">방출</button></span>`}</div>
    </div>`).join('')}</div>`));
  else g.appendChild(sect('', '', `<div class="empty">외국인 선수가 없다. 시장에서 셋까지 데려올 수 있다.</div>`));

  const canP = m.room > 0 && m.pitcherRoom > 0, canB = m.room > 0;
  g.appendChild(sect('', `${m.market.length} · ${AXIS_KEY}`, `<div class="lead">${icon('park', 'lead-ic')}<span class="pcnt">시장</span></div>`));
  g.lastChild.appendChild(table(['선수','국적','P','나이','능력 / 잠재력','몸값',''],
    m.market.map(p => ({ p, cells: [nameCell(p), `<span class="nat">${esc(p.nation)}</span>`,
      `<span class="m dim">${p.slot}</span>`, `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot),
      `<b class="m">${p.ask}억</b>`,
      (p.kind === 'P' ? canP : canB) ? `<span class="fbtn"><button data-sign="${p.pid}">계약</button></span>` : '<span class="dim">—</span>'] }))));
  g.lastChild.appendChild(el('p', 'note', '몸값은 리그 전체가 매긴 값이다. 우리 스카우트가 본 눈금과 어긋난다면 그 차이가 기회이거나 함정이다.'));
  v.appendChild(g);

  v.querySelectorAll('[data-re]').forEach(b => b.onclick = (e) => {
    e.stopPropagation(); act(() => G.resignForeign(+b.dataset.re)); });
  v.querySelectorAll('[data-rel]').forEach(b => b.onclick = (e) => {
    e.stopPropagation(); act(() => G.releaseForeign(+b.dataset.rel)); });
  v.querySelectorAll('[data-sign]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const r = G.signForeign(+b.dataset.sign);
    if (r.error === 'gone') toast('', '다른 구단이 먼저 데려갔다', 'warn');
    autosave(); render();
  });
  v.querySelectorAll('[data-pid]').forEach(r => r.onclick = () => openPlayer(+r.dataset.pid));
}

function viewFA(v) {
  const fa = G.freeAgents();
  const live = fa.rows.filter(r => !r.signed && !r.walked && !r.unsigned);
  const mine = live.filter(r => r.offer);
  const spend = mine.reduce((s, r) => s + r.offer.aav, 0);
  const done = fa.rows.filter(r => r.signed);
  const talking = live.filter(r => r.demand);
  const pct = fa.room ? Math.round(spend / fa.room * 100) : 0;

  /* 첫 줄 — 겨울 예산, 내 제시, 시장 날짜. 제목 없이. */
  v.appendChild(sect('', '', `<div class="ftiles">
    <div class="htile fin">${icon('won')}<b><span class="m">${spend.toFixed(1)}</span>억 <small>/ 여력 ${fa.room}억 (연)</small></b>
      <div class="meter ${pct > 100 ? 'over' : pct > 90 ? 'tight' : ''}"><i style="width:${Math.min(100, pct)}%"></i><span>${pct}%</span></div>
      <p>넘겨서 부를 수 없다. 자리를 비우려면 방출이나 트레이드가 먼저다.</p></div>
    <div class="htile">${icon('bat')}<b><span class="m">${mine.length}</span><small>건 제시</small></b>
      <div class="alrow">${mine.length ? mine.map(r => `<span class="lb">${esc(r.name)}<i>${r.offer.years}년 ${r.offer.total}억</i></span>`).join('') : '<span class="dim">아직 없다</span>'}</div></div>
    <div class="htile">${icon('star')}<b><span class="m">${fa.day}</span><small>/ ${fa.days}일</small></b>
      <div class="quotadots">${Array.from({ length: fa.days }, (_, i) => `<i class="${i < fa.day ? 'on' : ''}"></i>`).join('')}</div>
      <p>${done.length ? `계약 완료 ${done.length}명` : '아직 계약이 없다'}</p></div>
  </div>`));

  // 오늘 답을 기다리는 사람이 먼저다.
  if (talking.length) {
    const w = el('div', 'sect');
    w.innerHTML = `<div class="lead">${icon('owner', 'lead-ic')}<span class="pcnt">답을 기다린다 ${talking.length}</span></div>
      <div class="nego">${talking.map(r => `
        <div class="ncard" data-talk="${r.pid}">
          <div class="nhd">${avatar(r, r.former_team && r.former_team !== '미계약'
            ? capOf(r.former_team).color : '#3b4655', 34, false,
            r.former_team && r.former_team !== '미계약' ? franchiseOf(r.former_team) : null)}<b>${esc(r.name)}</b>
            <span class="m dim">${r.age} · ${r.slot} · ${esc(r.former_team)}</span>
            <span class="mood m${r.mood < 34 ? ' bad' : r.mood >= 70 ? ' good' : ''}">${r.mood_word}</span></div>
          <p class="ndem">${esc(r.demand.text)}</p>
          <div class="nfoot"><span class="m dim">내 제시 ${r.offer.years}년 ${r.offer.total}억</span>
            <button class="primary">답한다</button></div>
        </div>`).join('')}</div>`;
    v.appendChild(w);
  }

  // 시장. 표가 맞다. 시장 온도는 점으로.
  const heat = (h) => `<span class="heat ${h === '뜨겁다' ? 'h3' : h === '경쟁이 있다' ? 'h2' : h === '한 곳 정도' ? 'h1' : 'h0'}" title="${esc(h)}"><i></i><i></i><i></i></span>`;
  const narrow = window.innerWidth < 620;
  const g = el('div', done.length ? 'grid g21' : 'grid');
  g.appendChild(sect('', `${live.length} · ${AXIS_KEY}`, `<div class="lead">${icon('pinch', 'lead-ic')}<span class="pcnt">FA 시장</span></div>`));
  g.lastChild.appendChild(table(
    narrow ? ['선수','등급','요구','내 제시'] : ['선수','','나이','등급','능력','요구','시장','기분','내 제시'],
    live.map(p => {
      const ask = `<span class="m">${p.ask.years}년 ${p.ask.total}억</span>`;
      const off = p.offer ? `<b class="m mark">${p.offer.years}년 ${p.offer.total}억</b>` : '<span class="dim">—</span>';
      const gr = `<span class="gr g${p.grade}">${p.grade}</span>`;
      return { p, cells: narrow ? [nameCell(p), gr, ask, off]
        : [nameCell(p), `<span class="m dim">${p.slot}</span>`, `<span class="m">${p.age}</span>`, gr, axis(p.ovr), ask,
           heat(p.heat), `<span class="${p.mood < 34 ? 'warn' : ''}">${p.offer ? p.mood_word : '—'}</span>`, off] };
    }),
    (row) => openOffer(row.p)));

  if (done.length) g.appendChild(sect('', `${done.length}`, `<div class="lead">${icon('trophy', 'lead-ic')}<span class="pcnt">계약 완료</span></div>
    <div class="stack tight">${done.slice(0, 14).map(r =>
      `<div class="row ${r.signed.mine ? 'mine' : ''}"><span class="prow">${cap(r.signed.team, 22)} ${esc(r.name)}</span>
       <b class="m">${esc(r.signed.text)}</b></div>`).join('')}</div>`));
  v.appendChild(g);

  v.querySelectorAll('[data-talk]').forEach(c => c.onclick = () =>
    openTalk(fa.rows.find(r => r.pid === +c.dataset.talk), fa.tones));
}

/* 요구에 답한다. 무엇을 말하느냐보다 어떻게 말하느냐가 더 클 때가 있다. */
function openTalk(p, tones) {
  const col = p.former_team && p.former_team !== '미계약' ? capOf(p.former_team).color : '#3b4655';
  modal(`
    <div class="mhead"><div class="mhead-p">${avatar(p, col, 46)}
      <div><h2>${esc(p.name)}</h2>
      <div class="meta">${p.age} · ${p.slot} · ${esc(p.former_team)} · ${p.mood_word}</div></div></div>
      <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
      <p class="ndem big">${esc(p.demand.text)}</p>
      <div>
        <div class="lab" style="margin-bottom:8px">어떻게 말하는가</div>
        <div class="tones">${tones.map((t, i) =>
          `<button data-tone="${t.key}" class="${i === 0 ? 'on' : ''}">
             <b>${esc(t.label)}</b><i>${esc(t.hint)}</i></button>`).join('')}</div>
        <p class="note">무엇이 먹히는지는 그 사람에 달렸다. 겪어봐야 안다.</p>
      </div>
      <div class="trophyrow">
        <button id="yes" class="primary">받아들인다</button>
        <button id="no" class="danger">자른다</button>
      </div>
    </div>`);
  let tone = tones[0].key;
  $$('[data-tone]').forEach(b => b.onclick = () => {
    tone = b.dataset.tone;
    $$('[data-tone]').forEach(x => x.classList.toggle('on', x === b));
  });
  const answer = (ok) => {
    const r = G.faRespond(p.pid, ok, tone);
    closeModal(); autosave(); render();
    if (r && r.msg) toast(`${r.tone} ${ok ? '수용' : '거절'}`, r.msg, r.walked ? 'warn' : '');
  };
  $('#yes').onclick = () => answer(true);
  $('#no').onclick = () => answer(false);
}

function openOffer(p) {
  const cap = G.freeAgents().room;
  modal(`
    <div class="mhead"><div><h2>${esc(p.name)}</h2>
      <div class="meta">${p.age} · ${p.slot} · ${esc(p.former_team)}</div></div>
      <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
      <div>
        <div class="kv"><span>능력</span>${axis(p.ovr)}</div>
        <div class="kv"><span>요구</span><b class="m">${p.ask.years}년 · 총 ${p.ask.total}억</b></div>
        <div class="kv"><span>시장</span><b class="m dim">${esc(p.heat)}</b></div>
        <div class="kv"><span>등급</span><b><span class="gr g${p.grade}">${p.grade}</span>
          <span class="m dim" style="margin-left:6px">${esc(p.grade_cost)}</span></b></div>
        ${p.offer ? `<div class="kv"><span>그의 기분</span><b class="m">${p.mood_word}</b></div>` : ''}
      </div>
      ${p.news && p.news.length ? `<div><div class="lab">들리는 이야기</div>
        ${p.news.map(n => `<p class="note">${esc(n)}</p>`).join('')}</div>` : ''}
      <div>
        <div class="lab" style="margin-bottom:10px">제시 — 연 ${cap}억까지</div>
        <div style="display:flex;gap:20px;align-items:baseline;flex-wrap:wrap">
          <label class="lab">기간 <input id="oy" type="number" min="1" max="7" value="${
            p.offer ? p.offer.years : p.ask.years}"></label>
          <label class="lab">연평균 <input id="oa" type="number" min="0.3" step="0.5" value="${
            p.offer ? p.offer.aav : Math.min(p.ask.aav, cap)}"></label>
        </div>
        <div class="tglrow">
          <button id="tst" class="tgl${p.offer && p.offer.starter ? ' on' : ''}">주전 보장</button>
          <button id="tso" class="tgl${p.offer && p.offer.optout ? ' on' : ''}">옵트아웃</button>
        </div>
      </div>
      <div class="trophyrow">
        <button id="ok" class="primary">제시한다</button>
        ${p.offer ? '<button id="del" class="quiet">거둬들인다</button>' : ''}
      </div>
    </div>`);
  const t1 = $('#tst'), t2 = $('#tso');
  [t1, t2].forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('#ok').onclick = () => {
    const r = G.offer(p.pid, +$('#oy').value, +$('#oa').value,
      { starter: t1.classList.contains('on'), optout: t2.classList.contains('on') });
    if (r.error === 'budget') { toast('', `연 ${r.room}억까지만 쓸 수 있다`, 'warn'); return; }
    closeModal(); autosave(); render();
  };
  if ($('#del')) $('#del').onclick = () => { G.cancelOffer(p.pid); closeModal(); autosave(); render(); };
}

/* 보상선수.
   규칙은 복잡해 보이지만 한 문장이다 — 큰 FA 를 데려오면 내 선수 하나를 내준다.
   그 하나를 누가 고르느냐가 전부다. 내 명단에서 스무 명을 지키고, 나머지는 열린다.
   그리고 내가 저평가한 선수가 상대 눈에는 최고일 수 있다. */
let compPick = new Set();
function openComp() {
  const b = G.compBoard();
  if (b.done) return;
  if (b.i_sign) compPick = new Set(b.rows.slice(0, b.protect_n).map(r => r.pid));

  const row = (r) => `<div class="cprow ${b.i_sign && compPick.has(r.pid) ? 'keep' : ''}"
      data-cp="${r.pid}">
    <span class="cpn">${esc(r.name)}<i>${r.age}세 · ${r.slot}${r.farm ? ' · 2군' : ''}</i></span>
    ${axis(r.ovr, r.pot)}</div>`;

  const head = b.i_sign
    ? `<p class="cpsay">${b.grade}급 FA <b>${esc(josa(b.player, '을를'))}</b> 데려왔다.
        ${esc(josa(b.from, '이가'))} 우리 명단에서 한 명을 데려간다.
        <b>${b.protect_n}명을 지킬 수 있다.</b> 나머지는 열린다.</p>`
    : `<p class="cpsay">${b.grade}급 FA <b>${esc(josa(b.player, '이가'))}</b>
        ${esc(josa(b.to, '으로'))} 갔다. 상대가 ${b.protect_n}명을 지켰다.
        <b>남은 데서 하나를 데려오거나, 돈만 받는다.</b></p>`;

  modal(`
    <div class="mhead"><div><h2>보상선수</h2>
      <div class="meta">${esc(b.from)} → ${esc(b.to)} · 연봉 ${b.salary}억 · ${esc(b.rule)}</div></div>
      <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
      ${head}
      <div class="cpbar">
        <span id="cpn" class="m"></span>
        ${b.i_sign
          ? `<button id="cpok" class="primary">명단 제출</button>`
          : `<button id="cpok" class="primary" disabled>데려온다</button>
             <button id="cpmoney" class="quiet">돈만 받는다 (${b.money_only}억)</button>`}
      </div>
      <div class="cplist">${b.rows.map(row).join('')}</div>
    </div>`);

  const cnt = $('#cpn'), ok = $('#cpok');
  const sync = () => {
    if (b.i_sign) {
      cnt.textContent = `${compPick.size} / ${b.protect_n} 보호`;
      cnt.classList.toggle('warn', compPick.size > b.protect_n);
      ok.disabled = compPick.size > b.protect_n;
    } else {
      const one = [...compPick][0];
      const r = b.rows.find(x => x.pid === one);
      cnt.textContent = r ? `${r.name} 지명` : '고르지 않음';
      ok.disabled = !r;
    }
  };
  if (!b.i_sign) compPick = new Set();
  sync();

  $$('[data-cp]').forEach(e => e.onclick = () => {
    const pid = +e.dataset.cp;
    if (b.i_sign) {
      compPick.has(pid) ? compPick.delete(pid) : compPick.add(pid);
      e.classList.toggle('keep', compPick.has(pid));
    } else {
      compPick = new Set([pid]);
      $$('[data-cp]').forEach(x => x.classList.toggle('keep', +x.dataset.cp === pid));
    }
    sync();
  });

  const done = (r) => {
    closeModal(); compPick = new Set(); autosave(); render();
    if (r.taken) toast('보상선수', `${r.taken} · ${r.money}억`);
    else toast('보상', `${r.money}억`);
    const nb = G.compBoard();
    if (!nb.done) setTimeout(openComp, 350);
  };
  ok.onclick = () => done(b.i_sign ? G.compProtect([...compPick]) : G.compTake([...compPick][0]));
  const mb = $('#cpmoney'); if (mb) mb.onclick = () => done(G.compTake(null));
}

/* 포스팅.
   자격은 선수의 것이지만 열쇠는 우리가 쥔다. 그래서 이건 결정이다.
   보내면 돈이 들어오고 자리가 빈다. 붙잡으면 그가 그걸 기억한다. */
function openPosting() {
  const b = G.postingBoard();
  if (!b.rows.length) return;
  const p = b.rows[0];
  modal(`
    <div class="mhead"><div class="mhead-p">${avatar(p, capOf(G.state().user_team.name).color, 46)}
      <div><h2>${esc(p.name)}</h2>
      <div class="meta">${p.age} · ${p.slot} · KBO ${p.service}시즌</div></div></div>
      <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
      <p class="cpsay">${esc(josa(p.name, '이가'))} 메이저리그에 도전하고 싶다고 한다.
        ${p.again ? `<b>${p.again + 1}번째다.</b>` : ''}
        일곱 시즌을 채우기 전이라 <b>우리가 동의해야 갈 수 있다.</b></p>
      <div class="grid g2">
        <div>
          <div class="kv"><span>능력</span>${axis(p.ovr, p.pot)}</div>
          <div class="kv"><span>이적료</span><b class="m big">${esc(p.fee_text)}</b></div>
          <div class="kv"><span>구단 예산</span><b class="m">${p.budget}억</b></div>
          <div class="kv"><span>올해 연봉 총액</span><b class="m">${p.payroll}억</b></div>
        </div>
        <div class="pnote">
          <p><b>보내면</b> 이적료가 들어오고 그 자리가 빈다.
            서너 해 뒤 돌아올 수도 있다 — 그때는 미계약 신분이라 아무 팀에나 간다.</p>
          <p><b>붙잡으면</b> 공짜가 아니다. 구단에 대한 정이 깎이고,
            다음 겨울에 더 세게 말을 꺼낸다.</p>
        </div>
      </div>
      <div class="trophyrow">
        <button id="pyes" class="primary">보낸다 (${esc(p.fee_text)})</button>
        <button id="pno" class="danger">붙잡는다</button>
      </div>
    </div>`);
  const done = (allow) => {
    const r = G.postingAnswer(p.pid, allow);
    closeModal(); autosave(); render();
    if (r.sent) toast('포스팅 승인', `${r.name} · 이적료 ${r.fee.toFixed(0)}억`);
    else toast('포스팅 불허', `${r.name}을(를) 붙잡았다`, 'warn');
    if (G.postingBoard().rows.length) setTimeout(openPosting, 350);
  };
  $('#pyes').onclick = () => done(true);
  $('#pno').onclick = () => done(false);
}

function viewDraft(v) {
  const b = G.draftBoard(40);
  const g = el('div', 'grid');
  const clock = b.my_turn ? null : b.on_clock;
  /* 첫 줄 — 라운드 · 순번 · 누구 차례. 내 차례면 크게. */
  g.appendChild(sect('', '', `<div class="ftiles">
    <div class="htile"><b><span class="m">${b.round}</span><small>라운드</small></b><p>전체 ${b.pick_no} / ${b.total}</p></div>
    <div class="htile ${b.my_turn ? 'myturn' : ''}">${clock ? cap(clock, 28) : icon('star')}<b>${b.my_turn ? '내 차례' : esc(short(clock || ''))}</b>
      <p>${b.my_turn ? '보드에서 선수를 누르면 지명한다. 되돌릴 수 없다.' : '지명을 기다린다'}</p></div>
    <div class="htile">${icon('pinch')}<b><span class="m">${b.picks.filter(p => p.mine).length}</span><small>명 지명</small></b>
      <div class="alrow">${b.picks.filter(p => p.mine).map(p => `<span class="lb">${esc(p.name)}<i>${p.n}순위</i></span>`).join('') || '<span class="dim">아직 없다</span>'}</div></div>
  </div>`));
  const g2 = el('div', 'grid g21');
  g2.appendChild(sect('', AXIS_KEY, `<div class="lead">${icon('bat', 'lead-ic')}<span class="pcnt">보드 ${b.rows.length}</span></div>`));
  g2.lastChild.appendChild(table(['선수','','','나이','능력 / 잠재력','확신도'],
    b.rows.map(p => ({ p, cells: [`<span class="name">${esc(p.name)}</span>`,
      `<span class="tag hs">${p.origin ? p.origin[0] : ''}</span>`,
      `<span class="m dim">${p.slot}</span>`, `<span class="m">${p.age}</span>`,
      axis(p.ovr, p.pot), `<span class="m dim">${p.confidence}%</span>`] })),
    (row) => { if (!b.my_turn) return openPlayer(row.p.pid);
      if (confirm(`${row.p.name} 지명. 되돌릴 수 없다.`)) { G.draftPick(row.p.pid); autosave(); render(); } }));
  g2.appendChild(sect('', `${b.picks.length}`, `<div class="lead">${icon('trophy', 'lead-ic')}<span class="pcnt">지명 순서</span></div>
    <div class="stack tight">${b.picks.length ? b.picks.slice().reverse().slice(0, 24).map(p =>
      `<div class="row ${p.mine ? 'me' : ''}"><span class="prow"><span class="m dim pn">${p.n}</span>${cap(p.team, 22)}<span class="name">${esc(p.name)}</span></span></div>`).join('')
      : '<div class="empty">—</div>'}</div>`));
  g.appendChild(g2);
  v.appendChild(g);
}

function viewTrade(v) {
  const teams = G.teamList().filter(t => t.id !== G.state().user_team.id);
  const st = G.lastStandings().rows;
  const g = el('div', 'grid');
  /* 상대를 고른다. 모자와 방향성이 카드 하나 — 리빌딩 팀에 베테랑을 팔려 하면 안 된다는 걸 색이 말한다. */
  const modeCls = (m) => m === '우승도전' ? 'contend' : m === '리빌딩' ? 'rebuild' : 'neutral';
  g.appendChild(sect('', '상대를 고른다', `<div class="tgrid">${teams.map(t => {
    const r = st.find(x => x.team === t.name);
    return `<button class="tcard2 ${modeCls(t.mode)}" data-tid="${t.id}" style="${tcVars(capOf(t.name))}">
      ${cap(t.name, 40)}<span class="tc-main"><b>${esc(short(t.name))}</b><i>${r ? `${r.rank}위 · ${r.w}–${r.l}` : ''}</i></span>
      <em class="tc-mode">${esc(t.mode)}</em></button>`; }).join('')}</div>`));
  v.appendChild(g);
  v.querySelectorAll('[data-tid]').forEach(b => b.onclick = () => openTrade(+b.dataset.tid));
}

let tsel = { give: new Set(), get: new Set(), other: null };
const openTrade = (tid) => { tsel = { give: new Set(), get: new Set(), other: tid }; drawTrade(); };
function drawTrade() {
  const mine = G.tradeAssets(G.state().user_team.id);
  const theirs = G.tradeAssets(tsel.other);
  const me = G.state().user_team.name;
  const card = (p, set, side) => `<button class="tp ${set.has(p.pid) ? 'on' : ''}" data-side="${side}" data-pid="${p.pid}">
      <span class="tp-nm"><b>${esc(p.name)}</b><i>${p.age} · ${p.slot}${p.farm ? ' · 2군' : ''}</i></span>${axis(p.ovr)}</button>`;
  const col = (t, arr, set, side, color) => `<div class="tcol" style="--tc:${color}">
    <div class="tchd">${cap(t, 28)}<b>${esc(short(t))}</b><span class="m dim">${set.size ? `${set.size}명` : ''}</span></div>
    <div class="tplist">${arr.map(p => card(p, set, side)).join('')}</div></div>`;
  const ev = (tsel.give.size || tsel.get.size)
    ? G.tradeEvaluate([...tsel.give], [...tsel.get], tsel.other) : null;
  const ok = ev && ev.verdict === 'accept';
  modal(`
    <div class="mhead"><div class="mhead-p">${cap(theirs.team, 40)}<h2>${esc(theirs.team)}</h2><span class="tag">${esc(theirs.mode)}</span></div>
      <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody">
      <div class="tverdict ${ev ? (ok ? 'ok' : 'no') : ''}">${ev ? icon(ok ? 'trophy' : 'hook', 'tv-ic') : icon('pinch', 'tv-ic')}
        <span>${ev ? esc(ev.text) : '양쪽에서 선수를 고르면 상대가 답한다.'}</span>
        <button id="propose" class="primary" ${ok ? '' : 'disabled'}>제안</button></div>
      <div class="tcols">
        ${col(me, [...mine.roster, ...mine.farm.map(p => ({ ...p, farm: true }))], tsel.give, 'give', capOf(me).color)}
        ${col(theirs.team, [...theirs.roster, ...theirs.farm.map(p => ({ ...p, farm: true }))], tsel.get, 'get', capOf(theirs.team).color)}
      </div>
    </div>`);
  document.querySelectorAll('[data-pid]').forEach(row => row.onclick = () => {
    const set = row.dataset.side === 'give' ? tsel.give : tsel.get;
    const pid = +row.dataset.pid;
    set.has(pid) ? set.delete(pid) : set.add(pid);
    drawTrade();
  });
  $('#propose').onclick = () => {
    const r = G.proposeTrade([...tsel.give], [...tsel.get], tsel.other);
    if (r.ok) { toast('성사', '트레이드 완료'); closeModal(); autosave(); render(); }
    else toast('거절', r.text, 'injury');
  };
}

/* ── 역사 ── */
function viewHistory(v) {
  const g = el('div', 'grid');
  const fr = G.franchises();
  // 영구결번. 15년을 굴려야 하나 걸린다.
  const hon = fr.filter(f => f.retired && f.retired.length);
  if (hon.length) g.appendChild(sect('영구결번',
    `${hon.reduce((a, f) => a + f.retired.length, 0)}개`,
    `<div class="rnums">${hon.map(f => f.retired.map(r => `
      <div class="rnum" style="--tc:${capOf(f.name).color}">
        <b>${r.number}</b>
        <span class="rn-main"><span class="rn-name">${esc(r.name)}<i>${r.pos}</i></span>
          <span class="rn-sub">${esc(short(f.name))} · ${r.from}–${r.to} · ${r.years}시즌</span></span>
        <span class="rn-line">${esc(r.line)}<i>WAR ${r.war}</i></span>
      </div>`).join('')).join('')}</div>`));

  /* 구단 연혁. 우승은 트로피 개수로 — 13 이라는 숫자보다 줄지어 선 트로피가 먼저 보인다. */
  const trophies = (n) => n ? `<span class="trophyrow">${Array.from({ length: Math.min(n, 10) }, () => icon('trophy')).join('')}${n > 10 ? `<b class="m">+${n - 10}</b>` : ''}</span>` : '<span class="dim">—</span>';
  g.appendChild(sect('구단 연혁', `${fr.length}개 구단`, table(
    ['구단','창단','통산 전적','승률','우승','정규 1위','최근 우승','무관','프랜차이즈 레전드'],
    fr.map(f => ({ team_id: f.team_id, cells: [
      `<span class="tcell">${cap(f.name, 22)}<span class="name">${esc(f.name)}</span></span>`,
      `<span class="m dim">${f.founded}</span>`,
      `<span class="m">${esc(f.record)}</span>`,
      `<span class="m">${f.pct}</span>`,
      trophies(f.titles),
      `<span class="m dim">${f.pennants}</span>`,
      `<span class="m dim">${f.lastTitle ?? '—'}</span>`,
      `<span class="m ${f.drought >= 20 ? 'mark' : 'dim'}">${f.drought ?? '—'}</span>`,
      f.legend ? `<span class="two"><b>${f.legend.number}번 ${esc(f.legend.name)}</b><i>${esc(f.legend.line)}</i></span>` : '—'] })),
    (row) => openTeam(row.team_id))));

  const two = el('div', 'grid g2');
  const tl = G.titleTimeline();
  /* 역대 우승. 모자를 줄지어 세운다 — 왕조가 눈에 보인다. */
  two.appendChild(sect('역대 우승', `${tl.length}회`, tl.length
    ? `<div class="capline">${tl.slice(0, 40).map(t =>
        `<span class="tlc ${t.sim ? 'sim' : ''}" title="${t.year} ${esc(t.team)}">${cap(t.team, 30)}<i class="m">${String(t.year).slice(2)}</i></span>`).join('')}</div>`
    : '<div class="empty">—</div>'));
  const aw = G.awardHistory(14);
  two.appendChild(sect('수상 이력', '', aw.length
    ? aw.map(a => `<div class="row click" data-pid="${a.pid}">
        <span class="tcell"><span class="m dim">${a.year}</span> <span class="tag">${a.kind}</span>
          ${cap(a.team, 22)}<span class="name">${esc(a.name)}</span></span>
        <span class="m dim">${esc(a.line)}</span></div>`).join('')
    : '<div class="empty">—</div>'));
  g.appendChild(two);

  const rec = G.records(10), sr = G.seasonRecords(5);
  g.appendChild(sect('통산 기록', '', `<div class="lead">${icon('bat', 'lead-ic')}<span class="pcnt">타격</span></div>` + ldrBoard(rec.batting, { team: false })
    + `<div class="lead">${icon('ball', 'lead-ic')}<span class="pcnt">투구</span></div>` + ldrBoard(rec.pitching, { team: false })));
  g.appendChild(sect('단일 시즌 최고', '', `<div class="lead">${icon('bat', 'lead-ic')}<span class="pcnt">타격</span></div>` + ldrBoard(sr.batting, { sub: true, team: false })
    + `<div class="lead">${icon('ball', 'lead-ic')}<span class="pcnt">투구</span></div>` + ldrBoard(sr.pitching, { sub: true, team: false })));

  // 대기록. 통계표에는 남지 않지만 사람들이 기억하는 것들.
  const ft = G.feats(24);
  g.appendChild(sect('대기록', Object.entries(ft.tally)
    .sort((a, b) => a[1] - b[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(' · '),
    ft.rows.length ? `<div class="feats">${ft.rows.map(f => `<div class="feat r${f.rank <= 2 ? 1 : f.rank <= 4 ? 2 : 3}${f.mine ? ' mine' : ''}">
      <span class="fk">${esc(f.kind)}</span>
      <span class="fn">${esc(f.name)}<i>${esc(short(f.team))} · vs ${esc(short(f.opp))}</i></span>
      <span class="fv">${esc(f.detail)}</span>
      <span class="fy m">${f.year}</span></div>`).join('')}</div>`
    : '<div class="empty">아직 없다</div>'));

  const h = G.history(80);
  g.appendChild(sect('리그 연혁', '', h.rows.length
    ? `<div class="logscroll">${h.rows.slice().reverse().map(r =>
        `<div class="row"><span class="m dim">${r.year}</span><span>${esc(r.text)}</span></div>`).join('')}</div>`
    : '<div class="empty">—</div>'));
  v.appendChild(g);
  v.querySelectorAll('[data-pid]').forEach(e => e.onclick = () => openPlayer(+e.dataset.pid));
}

/* ── 겹칩 ── */
/* 자랑거리를 밖으로. 지명하던 날의 평가와 그 뒤 성적을 한 장에 겹친다. */
async function makeCard(p) {
  const b = $('#mshare'); if (!b) return;
  b.disabled = true; b.textContent = '만드는 중';
  try {
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    const cp = capOf(p.team || G.me.name);
    const blob = await card.playerCard(p, { team: p.team || G.me.name,
      color: cp.color, code: cp.code, year: G.state().year });
    const how = await card.shareCard(blob, `dugout-${p.name}.png`,
      `${p.name} · ${p.seasons.length}시즌 · 통산 WAR ${(p.career_war ?? 0).toFixed(1)}`);
    if (how === 'downloaded') toast('카드를 내려받았다', p.name);
  } catch (e) { toast('카드 실패', '다시 시도해 보라', 'injury'); }
  b.disabled = false; b.textContent = '카드 만들기';
}

/* ── 정보 · 약관 ──────────────────────────────────────────────
   길게 쓰지 않는다. 실제로 하는 일만 적으면 짧아진다. */
const REPO = 'https://github.com/YangSeungWon/baseball-manager';
function modalInfo() {
  modal(`<div class="mhead"><div><h2>정보</h2>
      <div class="meta">Project Dugout</div></div>
    <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack doc">
      <section>
        <h3>보기 설정</h3>
        <div class="tglrow"><button id="fcOn" class="tgl${facesOn ? ' on' : ''}">선수 얼굴</button></div>
        <p>선수 얼굴은 <b>번호에서 그려냅니다.</b> 사진이 아니고, 실존 인물과 아무 관계가
          없습니다. 나이가 들면 머리가 셉니다. 끄면 이름과 숫자만 남습니다.</p>
      </section>
      <section>
        <h3>가상입니다</h3>
        <p>이 게임에 나오는 구단, 선수, 기록, 사건은 <b>전부 지어낸 것</b>입니다.
          선수 이름은 프로그램이 음절을 조합해 만듭니다. 실존하는 인물과 이름이
          같더라도 우연입니다.</p>
        <p>구단 이름과 연고지, 리그 제도는 한국 프로야구의 리듬을 참고했지만,
          실존하는 구단·단체·인물과는 아무 관련이 없습니다. 어떤 프로야구 기구나
          구단으로부터 후원이나 승인을 받지 않았고, 그들을 대표하지도 않습니다.</p>
      </section>
      <section>
        <h3>개인정보</h3>
        <p><b>서버가 없습니다.</b> 계정도, 로그인도, 결제도 없습니다.</p>
        <ul>
          <li>세이브는 이 브라우저의 저장소에만 있습니다. 밖으로 나가지 않습니다.
            지우려면 브라우저의 사이트 데이터를 비우면 됩니다.</li>
          <li>방문 기록도, 이용 통계도, 광고 식별자도 수집하지 않습니다.
            추적 스크립트가 하나도 없습니다.</li>
          <li>글꼴을 포함한 모든 파일을 이 사이트에서 직접 보냅니다.
            페이지를 여는 동안 <b>다른 회사로 나가는 요청이 없습니다.</b></li>
          <li>다만 이 사이트는 GitHub Pages 로 서비스됩니다. 접속하는 순간
            GitHub 이 자체 운영 기록(접속 IP 등)을 남길 수 있고, 그것은
            제작자가 통제하거나 열람할 수 없습니다.</li>
        </ul>
      </section>
      <section>
        <h3>이용약관</h3>
        <ul>
          <li>무료이고, <b>있는 그대로</b> 제공됩니다. 언제든 멈추거나 바뀔 수 있습니다.</li>
          <li>세이브가 사라져도 되돌려 드릴 방법이 없습니다. 브라우저 저장소는
            영구적이지 않습니다 — <b>프런트 탭에서 파일로 내보내 두세요.</b></li>
          <li>게임을 즐기는 것 외의 용도로 쓰지 마세요. 자동화된 대량 접속처럼
            서비스를 방해하는 행위는 삼가 주십시오.</li>
          <li>이 게임을 하다 생긴 어떤 손해에 대해서도 제작자는 책임지지 않습니다.</li>
        </ul>
      </section>
      <section>
        <h3>만든 것들</h3>
        <p>글꼴 IBM Plex Mono — © IBM Corp., SIL Open Font License 1.1
          (<a href="fonts/OFL.txt" target="_blank" rel="noopener">전문</a>).</p>
        <p>문의와 버그 제보는 <a href="${REPO}" target="_blank" rel="noopener">저장소</a>로.</p>
      </section>
    </div>`);
  const fb = $('#fcOn'); if (fb) fb.onclick = () => {
    setFaces(!facesOn); fb.classList.toggle('on', facesOn); render();
  };
}

/* 하루를 넘긴다. 관전 방식이 곧 개입 여부다 —
   결과만 고르면 감독에게 맡기고 넘어가고, 보기로 했으면 승부처에서 묻는다.
   지켜볼 생각이 없는 사람에게 판단을 물을 이유가 없고,
   지켜보기로 한 사람에게 판단을 안 물을 이유도 없다. */
function nextDay() {
  const sch = G.schedule(1).rows[0];
  if (!sch) return act(() => report(G.advance(1)));
  const me = G.state().user_team.name;
  openGameShell(sch.is_home ? sch.opponent : me, sch.is_home ? me : sch.opponent);
  gsBody('<div class="gs-wait">경기가 시작된다</div>');
  watchDay();
}

/* ── 경기 화면 ─────────────────────────────────────────────
   구단을 운영하는 화면과 경기를 보는 화면, 이 게임에는 크게 둘뿐이다.
   그런데 경기 쪽이 창 넷으로 흩어져 있었다 — 승부처 · 하이라이트 ·
   결과 · 재생이 각각 열고 닫히며 스코어보드를 세 번 다시 그렸다.
   껍데기를 하나 두고 그 안에서 상태만 바꾼다. */
let gsState = null;

function openGameShell(aw, hm, park, crowd, cap) {
  gsState = { aw, hm, park, crowd, cap };
  modal(`<div class="gs">
    <div class="gs-top">
      <div class="gs-teams">
        <span class="gs-t away">${jersey(franchiseOf(aw), true, 30)}
          <b>${esc(short(aw))}</b><em id="gsA" data-gs="a">0</em></span>
        <span class="gs-t home">${jersey(franchiseOf(hm), false, 30)}
          <b>${esc(short(hm))}</b><em id="gsH" data-gs="h">0</em></span>
      </div>
      <div class="gs-sit">
        <span class="gs-inn"><i id="gsArr" class="gs-arr" data-gs="arr"></i><span id="gsInn" data-gs="inn">경기 준비</span></span>
        <svg class="gs-dia" viewBox="0 0 34 34" aria-hidden="true">
          <rect id="gd2" data-gs="d2" x="13" y="1"  width="9" height="9" transform="rotate(45 17.5 5.5)"/>
          <rect id="gd3" data-gs="d3" x="1"  y="13" width="9" height="9" transform="rotate(45 5.5 17.5)"/>
          <rect id="gd1" data-gs="d1" x="25" y="13" width="9" height="9" transform="rotate(45 29.5 17.5)"/>
        </svg>
        <span class="gs-bso" id="gsBSO" data-gs="bso"></span>
      </div>
      <button id="gsX" class="quiet gs-out"><span>구단으로</span><i>나가기</i></button>
    </div>
    <div class="gs-body" id="gsBody"></div>
  </div>`, true);
  document.getElementById('gsX').onclick = closeGame;
}
/** 스코어보드. 상단 바와 (경기 중이면) 구장 위 스코어버그, 같은 값을 둘 다에 쓴다. */
function gsScore({ a, h, inn, half, outs, b, s, base }) {
  const all = (k, fn) => document.querySelectorAll(`[data-gs="${k}"]`).forEach(fn);
  if (a != null) all('a', e => { e.textContent = a; });
  if (h != null) all('h', e => { e.textContent = h; });
  if (inn) all('inn', e => { e.textContent = `${inn}회`; });
  // 중계처럼 초는 위 화살표, 말은 아래 화살표
  if (half) all('arr', e => { e.textContent = half === 'top' ? '▲' : '▼'; });
  // 기록의 아웃카운트는 그 플레이 '뒤' 값이라 3 이 나온다. 그때는 이닝이 끝난 것이다.
  const dot = (n, k, cls) => `<i class="${cls}${n > k ? ' on' : ''}"></i>`;
  all('bso', e => { e.innerHTML = outs == null ? ''
    : `<span class="bso b"><u>B</u>${[0,1,2].map(k => dot(b ?? 0, k, 'b')).join('')}</span>
       <span class="bso s"><u>S</u>${[0,1].map(k => dot(s ?? 0, k, 's')).join('')}</span>
       <span class="bso o"><u>O</u>${[0,1].map(k => dot(Math.min(outs, 2), k, 'o')).join('')}</span>`; });
  const bs = base || [null, null, null];
  for (let k = 0; k < 3; k++) all('d' + (k + 1), e => e.classList.toggle('on', !!bs[k]));
}
const gsBody = (html) => { const e = document.getElementById('gsBody');
  if (e) e.innerHTML = html; return e; };
let curLive = null;                     // 지금 그리는 경기 화면. 닫을 때 멈춘다.
function mountLive(host, opts) {
  if (curLive) curLive.destroy();
  curLive = new LiveView(host, opts);
  return curLive;
}
function closeGame() { gsState = null; if (curLive) { curLive.destroy(); curLive = null; } closeModal(); }

/* ── 경기를 본다 ─────────────────────────────────────────────
   하루를 지켜본다. 엔진이 플레이마다 멈춰 서서 넘겨 주고, 화면은 그것을
   실제 시간으로 그린다. 감독이 손을 쓰는 순간에는 구장 위에 질문이 뜬다.
   여기서 고른 것은 진짜로 경기 결과를 바꾼다 — 재생이 아니라 진행 중인 경기다. */
function liveOpts(home, away, park, crowd, cap) {
  const pref = livePrefs();
  return { home, away, park, crowd, cap,
    colors: { home: capOf(home).color, away: capOf(away).color },
    speed: pref.speed, view: pref.view, sound: pref.sound,
    onScore: gsScore,
    zoneHtml: (seq, zh) => zoneSvg(seq, zh) + zoneList(seq),
    chant: (name, salt) => chantFor(name, salt, home),
    // 경기 중에는 능력치·잠재력이 아니라 시즌 성적이다. 잠재력은 프런트의 일이다.
    playerBits: (pid) => {
      const p = G.player(pid); if (!p || !p.team_id) return '';
      const r = G.roster(p.team_id);
      const row = [...r.lineup, ...r.bench, ...r.rotation, ...r.bullpen].find(x => x.pid === pid);
      const s = row && row.stat; if (!s || !(s.g > 0)) return '<span class="lv-season">시즌 첫 출장</span>';
      return p.kind === 'P'
        ? `<span class="lv-season">시즌 <b class="m">${s.era ?? '—'}</b> ERA · <b class="m">${s.ip ?? '—'}</b>이닝 · <b class="m">${s.w ?? 0}승 ${s.l ?? 0}패${s.sv ? ` ${s.sv}세` : ''}</b></span>`
        : `<span class="lv-season">시즌 <b class="m">${s.avg ?? '—'}</b> · OPS <b class="m">${s.ops ?? '—'}</b> · <b class="m">${s.hr ?? 0}</b>홈런 <b class="m">${s.rbi ?? 0}</b>타점</span>`; } };
}
/** 경기 안의 문자중계. 최근 40 플레이.
 *  진행 중인 타석은 결과 없이 '…' 로 서 있다가, 장면이 끝나면 결과로 바뀐다.
 *  결과를 먼저 보여 주면 공 하나하나 볼 이유가 없다. */
function liveLog(lv, plays) {
  lv.setLog(plays.slice(-40).map((x, n, a) =>
    `<div class="rpl${n === a.length - 1 ? ' cur' : ''}${x.pending ? ' pend' : ''}">
      <span class="ri">${x.inning}${x.half === 'top' ? '초' : '말'}</span>
      <span class="rb">${esc(x.batter || '')}</span>
      <span class="rd">${x.pending ? '…' : esc(x.desc || '')}</span>
      ${!x.pending && x.runs ? `<em>+${x.runs}</em>` : ''}</div>`).join(''));
}
/** onLog 콜백. 시작(done=false)이면 자리만 잡고, 끝(done=true)이면 그 자리에 결과를 넣는다. */
function logSink(seen, getLv) {
  return (rec, done) => {
    const i = seen.findIndex(x => x.pending && x.rec === rec);
    if (!done) { if (i < 0) seen.push({ ...rec, desc: '', runs: 0, pending: true, rec }); }
    else if (i >= 0) seen[i] = rec; else seen.push(rec);
    const lv = getLv(); if (lv) liveLog(lv, seen);
  };
}

function watchDay() {
  const w = G.watchDay();
  if (w.error) { closeGame(); return; }
  let lv = null, bailed = false, pendingAsk = null;
  const seen = [];
  const finish = (r) => {
    if (lv) { lv.destroy(); if (curLive === lv) curLive = null; lv = null; }
    autosave(); render(); reportNotices();
    const g = (r.result.games || []).find(x => x.box);
    if (g) { lastBox = g.box; gsResult(g.box); }
    else { closeGame(); report(r.result); }
  };
  // 창을 닫거나 '결과로' 를 누르면 남은 결정은 감독에게 맡기고 하루를 끝낸다.
  // 여기서 멈춘 채로 두면 하루가 반만 치러진 상태로 남고,
  // 그 뒤 '다음 날' 을 누르면 같은 날이 두 번 열린다.
  const bail = () => {
    if (bailed) return; bailed = true;
    if (lv) lv.skip();
    if (pendingAsk) { const p = pendingAsk; pendingAsk = null; p(null); }
  };
  const drain = (r) => { while (!r.done) r = w.step(null); return r; };
  (async () => {
    let r = w.step(null);
    while (!r.done) {
      if (bailed) { r = drain(r); break; }
      if (r.ask) {
        const ans = await new Promise((res) => { pendingAsk = res; askMoment(r.ask, lv, res); });
        pendingAsk = null; if (lv) lv.unask();
        r = w.step(bailed ? null : ans); continue;
      }
      const p = r.play;
      if (p.evt === 'start') {
        openGameShell(p.away, p.home, p.park, p.crowd, p.cap);
        const host = gsBody('');
        lv = mountLive(host, { ...liveOpts(p.home, p.away, p.park, p.crowd, p.cap),
          onLog: logSink(seen, () => lv), onEnd: bail,
          command: w.command, cancel: w.cancel });          // 감독 패널 — 다음 타석 전에 엔진이 꺼내 쓴다
        const x = document.getElementById('gsX'); if (x) x.onclick = bail;
        $('#modal').onclick = (e) => { if (e.target.id === 'modal') bail(); };
        document.onkeydown = (e) => { if (e.key === 'Escape') bail(); };
      }
      if (lv) await lv.play(p);
      r = w.step(null);
    }
    finish(r);
  })();
}

/** 감독의 질문. 구장 위에 얹힌다. 답이 정해지면 done(답). */
function askMoment(m, lv, done) {
  const on = m.bases.map((b, i) => b ? `${i + 1}루 ${esc(b)}` : null).filter(Boolean);
  const title = { bunt:'번트를 댈까', pinch:'대타를 쓸까', ibb:'거를까',
                  hook:'투수를 바꿀까' }[m.kind];
  // 세 갈래를 함수로 둔다. 객체 리터럴로 두면 번트 상황에서도 대타 쪽이
  // 함께 평가돼 m.options 를 읽다 터진다.
  const body = ({
    bunt: () => `<p class="mq">${esc(m.batter)} 타석. 아웃 하나를 주고 주자를 보낼 것인가.</p>
      <div class="mopts">
        <button data-a='{"yes":true}' class="primary">번트</button>
        <button data-a='{"yes":false}'>강공</button></div>`,
    pinch: () => `<p class="mq">${esc(m.batter)} 타석. 벤치를 쓸 것인가.
        한 번 쓰면 원래 타자는 오늘 끝이다.</p>
      <div class="mopts">${m.options.map(o =>
        `<button data-a='{"pid":${o.pid}}' class="primary">${esc(o.name)}
          <i>${o.slot}</i></button>`).join('')}
        <button data-a='null'>그대로 간다</button></div>`,
    hook: () => `<p class="mq">${esc(m.cur)} 가 ${m.np}구를 던졌다.
        ${m.tired >= 90 ? '한계다.' : m.tired >= 55 ? '지쳐 간다.' : '아직 힘이 남았다.'}
        ${esc(m.batter)} 타석이다.</p>
      <div class="mopts">${m.options.map(o =>
        `<button data-a='{"pid":${o.pid}}' class="primary">${esc(o.name)}
          <i>${esc(o.slot)}</i></button>`).join('')}
        <button data-a='null'>계속 간다</button></div>`,
    ibb: () => `<p class="mq">${esc(m.batter)} 타석. 거르면 ${esc(m.next)} 와 승부한다.</p>
      <div class="mopts">
        <button data-a='{"yes":true}' class="primary">거른다</button>
        <button data-a='{"yes":false}'>승부한다</button></div>`,
  }[m.kind])();

  gsScore({ a: m.half === 'top' ? m.ours : m.theirs, h: m.half === 'top' ? m.theirs : m.ours,
            inn: m.inning, half: m.half, outs: m.outs, base: m.bases });
  const html = `<div class="clutch">
      <div class="gs-q">${title}</div>
      <div class="csit">
        <div class="cbase">${on.length ? on.map(x => `<span>${x}</span>`).join('')
          : '<span class="dim">주자 없음</span>'}</div>
        ${m.pitcher ? `<div class="cpit">투수 ${esc(m.pitcher)}</div>` : ''}
      </div>
      ${body}
    </div>`;
  // 경기 화면이 있으면 그 위에, 없으면 (경기 시작 전) 본문에.
  const host = lv ? lv.ask(html) : gsBody(html);
  host.querySelectorAll('.mopts button').forEach(b => b.onclick = () => {
    const a = JSON.parse(b.dataset.a);
    b.closest('.mopts').querySelectorAll('button').forEach(x => x.disabled = true);
    done(a);
  });
}


function modal(html, full = false) {
  $('#modal').classList.toggle('full', !!full);
  $('#modalBody').innerHTML = html; $('#modal').hidden = false;
  const x = $('#mx'); if (x) x.onclick = closeModal;
  $('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
  document.onkeydown = (e) => { if (e.key === 'Escape') closeModal(); };
}
function closeModal() { $('#modal').hidden = true; $('#modal').classList.remove('full');
  document.onkeydown = null;
  // 경기 화면이 열려 있었으면 그리기도 멈춘다. 창만 숨기고 두면 뒤에서 계속 돈다.
  if (curLive) { curLive.destroy(); curLive = null; }
  gsState = null; }

const ATTR_KO = { contact:'컨택', avoid_k:'삼진회피', discipline:'선구안', gap_power:'갭파워',
  hr_power:'파워', speed:'주력', fielding:'수비', reaction:'순발력', positioning:'위치선정', stuff:'구위', command:'제구',
  movement:'무브먼트', stamina:'체력', arm:'송구', velo:'구속' };

function openPlayer(pid) {
  const p = G.player(pid);
  if (p.error) return;
  const row = (k, v) => `<div class="attrrow"><span>${ATTR_KO[k] || k}</span>${axis(v, { lo:v.pot_lo, hi:v.pot_hi })}</div>`;
  const keys = Object.keys(p.attrs);
  const BATK = ['contact','avoid_k','discipline','gap_power','hr_power'];
  const grpA = keys.filter(k => p.kind === 'B' ? BATK.includes(k) : true);
  const grpB = keys.filter(k => !grpA.includes(k));
  const attrCol = (ks, ic, t) => ks.length ? `<div class="attrcol"><div class="lead">${icon(ic, 'lead-ic')}<span class="pcnt">${t}</span></div>${ks.map(k => row(k, p.attrs[k])).join('')}</div>` : '';
  const bh = ['연도','팀','나이','G','AVG','OBP','SLG','HR','RBI','WAR'];
  const ph = ['연도','팀','나이','G','IP','W','L','ERA','K','WAR'];
  const seasons = p.seasons.length ? `<table><thead><tr>${(p.kind === 'B' ? bh : ph)
    .map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${p.seasons.map(s =>
    `<tr><td class="m">${s.year}</td><td><span class="tcell">${cap(s.team, 20)}${esc(short(s.team))}</span></td><td class="m">${s.age}</td>
     <td class="m">${s.g}</td>` + (p.kind === 'B'
      ? `<td class="m">${s.avg}</td><td class="m">${s.obp}</td><td class="m">${s.slg}</td>
         <td class="m">${s.hr}</td><td class="m">${s.rbi}</td>`
      : `<td class="m">${s.ip}</td><td class="m">${s.w}</td><td class="m">${s.l}</td>
         <td class="m">${s.era}</td><td class="m">${s.k}</td>`) +
    `<td class="m"><b>${s.war}</b></td></tr>`).join('')}</tbody></table>` : '';
  const awards = p.awards && Object.keys(p.awards).length
    ? Object.entries(p.awards).map(([k, v]) => `<span class="ptag gold">${icon('trophy')}${k}${v > 1 ? ` ×${v}` : ''}</span>`).join('') : '';
  const bindShare = () => { const b = $('#mshare'); if (b) b.onclick = () => makeCard(p); };
  const pcol = p.team ? capOf(p.team).color : '#3b4655';
  /* 머리 — 이름 아래에 칩. 번호·나이·자리·손·출신·지명·병역·부상. 글자 크기는 하나. */
  const mil = p.mil && p.mil.s !== 'done' ? (p.mil.s === 'serving'
      ? `<span class="ptag warn">${p.mil.kind === 'sangmu' ? '상무' : '현역'} ${p.mil.left}년</span>`
      : p.mil.s === 'exempt' ? `<span class="ptag">병역 면제</span>`
      : p.mil.due === 0 ? `<span class="ptag warn">올겨울 입대</span>` : `<span class="ptag">미필 · ${p.mil.due}년</span>`) : '';
  const chips = [
    p.number ? `<span class="ptag m">${p.number}번</span>` : '',
    `<span class="ptag">${p.age}세</span>`, `<span class="ptag">${p.slot}</span>`,
    `<span class="ptag">${p.hand}${p.kind === 'P' ? '투' : '타'}</span>`,
    p.origin ? `<span class="ptag">${esc(p.origin)}</span>` : '',
    p.draft ? `<span class="ptag">${p.draft.year ? p.draft.year + ' ' : ''}#${p.draft.overall}</span>` : '',
    mil, p.injury_days ? `<span class="ptag bad">${icon('hurt')}${p.injury_days}일</span>` : '', awards].join('');
  const conf = p.confidence;
  const c = p.contract;
  modal(`
    <div class="mhead"><div class="mhead-p">${avatar(p, pcol, 60, false, p.team ? franchiseOf(p.team) : null)}
      <div class="mh-main"><h2>${esc(p.name)}${p.fullName ? `<small class="fullname">${esc(p.fullName)}</small>` : ''}
        ${p.team ? `<span class="mh-team">${cap(p.team, 22)}${esc(short(p.team))}</span>` : ''}</h2>
      <div class="ptags">${chips}</div></div></div>
      <span class="mbtns"><button id="mshare" class="quiet">카드 만들기</button>
      <button id="mx" class="quiet">닫기</button></span></div>
    <div class="mbody stack">
      <div class="ptiles">
        <div class="htile">${icon('star')}<b><span class="m">${typeof p.ovr === 'object' ? `${p.ovr.lo}–${p.ovr.hi}` : p.ovr}</span><small>종합</small></b>${axis(p.ovr, p.pot)}
          <div class="meter ${conf < 40 ? 'tight' : ''}"><i style="width:${conf}%"></i><span>확신 ${conf}%</span></div></div>
        <div class="htile">${icon('won')}<b>${c ? `<span class="m">${c.salary}</span>억` : '<span class="dim">—</span>'}</b>
          <p>${c ? esc(c.text) : '계약 없음'}</p><p>서비스 ${p.service}년</p></div>
        <div class="htile">${icon('trophy')}<b><span class="m">${p.career_war ?? '—'}</span><small>통산 WAR</small></b>
          <p>${p.seasons.length}시즌</p></div>
        <div class="htile ${p.injuries.count >= 3 ? 'bad' : ''}">${icon('hurt')}<b><span class="m">${p.injuries.count}</span><small>회 부상</small></b>
          <p>누적 ${p.injuries.days}일</p></div>
      </div>
      <div class="attrgrid">
        ${p.kind === 'B' ? attrCol(grpA, 'bat', '타격') + attrCol(grpB, 'glove', '수비 · 주루')
          : attrCol(grpA, 'ball', '투구') + (p.arsenal ? `<div class="attrcol"><div class="lead">${icon('bolt', 'lead-ic')}<span class="pcnt">구종</span></div>
            <div class="arsenal">${p.arsenal.map(a => `<span><b>${a.kr}</b>${a.kmh}</span>`).join('')}</div></div>` : '')}
      </div>
      <div class="scout">
        <div class="lead">${icon('eye', 'lead-ic')}<span class="pcnt">스카우트</span></div>
        <div class="report">${esc(p.comment)}</div>
        <div class="prs">${p.traits && p.traits.length
          ? p.traits.map(t => `<span class="pt ${t.level}${t.good ? ' g' : ' b'}">${esc(t.text)}</span>`).join('')
          : '<span class="pt none">성향은 겪어본 게 없어 아직 모른다</span>'}</div>
      </div>
      ${p.splits ? `<div><div class="lead">${icon('shift', 'lead-ic')}<span class="pcnt">스플릿</span></div>
        <table><thead><tr>${(p.splits.kind === 'B'
          ? ['구분','PA','AVG','OBP','SLG','HR','RBI','BB','K']
          : ['구분','IP','ERA','WHIP','K/9','H','HR','BB','K'])
          .map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>
        ${p.splits.rows.map(([k, s]) => `<tr><td>${k}</td>` + (p.splits.kind === 'B'
          ? `<td class="m">${s.pa}</td><td class="m">${s.avg}</td><td class="m">${s.obp}</td>
             <td class="m">${s.slg}</td><td class="m">${s.hr}</td><td class="m">${s.rbi}</td>
             <td class="m">${s.bb}</td><td class="m">${s.k}</td>`
          : `<td class="m">${s.ip}</td><td class="m">${s.era}</td><td class="m">${s.whip}</td>
             <td class="m">${s.k9}</td><td class="m">${s.h}</td><td class="m">${s.hr}</td>
             <td class="m">${s.bb}</td><td class="m">${s.k}</td>`) + '</tr>').join('')}
        </tbody></table>
        ${p.splits.kind === 'B' && p.splits.rows.some(([k]) => k === '득점권') ? (() => {
          const s = p.splits.rows.find(([k]) => k === '득점권')[1];
          return `<p class="risp">득점권 ${s.pa}타석은 판단하기에 작은 표본이다.
            리그와 본인 통산으로 되돌리면 <b>${s.est}</b> 쯤이 맞다
            <i>신뢰 ${s.trust}%</i></p>`;
        })() : ''}</div>` : ''}
      ${seasons ? `<div><div class="lead">${icon('rank', 'lead-ic')}<span class="pcnt">연도별</span></div>${seasons}</div>` : ''}
      ${p.events && p.events.length ? `<div><div class="lead">${icon('news', 'lead-ic')}<span class="pcnt">이력</span></div>` +
        p.events.map(e => `<div class="row"><span class="m dim">${e.year}</span><span>${esc(e.text)}</span></div>`).join('')
        + '</div>' : ''}
    </div>`);
  bindShare();
}

function openTeam(tid) {
  const r = G.roster(tid);
  const d = G.teamDossier(tid);
  const n = d.rank.of;
  const rkc = (x) => `<i class="rkc ${x <= 3 ? 'top' : x >= n - 2 ? 'low' : ''}">${x}위</i>`;
  const pay = d.budget ? Math.round(d.payroll / d.budget * 100) : 0;
  const cp = capOf(r.name);
  const pcard = (p) => `<div class="pcard click" data-pid="${p.pid}">${avatar(p, cp.color, 40)}
    <span class="pc-main"><b>${esc(p.name)}</b><i>${p.age} · ${p.slot}</i></span>${axis(p.ovr, p.pot)}</div>`;
  const list = (arr) => arr.map(p => `<div class="row click" data-pid="${p.pid}"><span class="prow"><span class="m dim pn ${p.pen ? 'wide' : ''}">${p.pen || p.order}</span>${esc(p.name)}
    <span class="sub">${p.slot}</span></span>${axis(p.ovr, p.pot)}</div>`).join('');
  const h = d.history;
  const trophies = h && h.titles ? `<span class="trophyrow">${Array.from({ length: Math.min(h.titles, 10) }, () => icon('trophy')).join('')}${h.titles > 10 ? `<b class="m">+${h.titles - 10}</b>` : ''}</span>` : '<span class="dim">—</span>';
  modal(`
    <div class="mhead"><div class="mhead-p">${cap(r.name, 56)}
      <div class="mh-main"><h2>${esc(r.name)}</h2>
        <div class="ptags"><span class="ptag">${esc(d.archetype)}</span><span class="ptag">${esc(r.mode)}</span>
          ${d.last ? `<span class="ptag m">${d.last.rank}위 ${d.last.w}–${d.last.l}</span>` : ''}
          ${h ? `<span class="ptag">${h.founded} 창단</span>` : ''}</div></div></div>
      <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
      ${h ? `<div class="report">${esc(h.tagline)}</div>` : ''}
      <div class="ptiles t5">
        <div class="htile">${icon('star')}<b>${rkc(d.rank.strength)}<small>전력</small></b><p>${n}팀 중</p></div>
        <div class="htile">${icon('bat')}<b>${rkc(d.rank.batting)}<small>타선</small></b><p>평균 ${d.batting}</p></div>
        <div class="htile">${icon('ball')}<b>${rkc(d.rank.pitching)}<small>마운드</small></b><p>평균 ${d.pitching}</p></div>
        <div class="htile">${icon('pinch')}<b>${rkc(d.rank.farm)}<small>팜</small></b><p>유망주 ${d.farm}</p></div>
        <div class="htile fin">${icon('won')}<b><span class="m">${d.payroll}</span>억 <small>/ ${d.budget}억</small></b>
          <div class="meter ${pay > 100 ? 'over' : pay > 90 ? 'tight' : ''}"><i style="width:${Math.min(100, pay)}%"></i><span>${pay}%</span></div></div>
      </div>
      ${h ? `<div class="ptiles t3">
        <div class="htile">${icon('trophy')}<b><span class="m">${h.titles}</span><small>우승</small></b>${trophies}<p>${h.lastTitle ? `최근 ${h.lastTitle}` : '아직 없다'}${h.drought >= 10 ? ` · <span class="mark">${h.drought}년째 무관</span>` : ''}</p></div>
        <div class="htile">${icon('rank')}<b><span class="m">${h.pct}</span><small>통산 승률</small></b><p>${esc(h.record)} · 정규 1위 ${h.pennants}</p></div>
        <div class="htile">${icon('park')}<b>${esc(d.park.name)}</b><p>${d.park.capacity.toLocaleString()}석 · ${d.park.opened}${d.park.avg ? ` · 평균 ${d.park.avg.toLocaleString()}명` : ''}</p></div>
      </div>` : ''}
      <div class="grid g2">
        <div><div class="lead">${icon('star', 'lead-ic')}<span class="pcnt">핵심 ${d.key.length}</span></div><div class="stack tight">${d.key.map(pcard).join('')}</div></div>
        <div><div class="lead">${icon('pinch', 'lead-ic')}<span class="pcnt">유망주 ${d.prospect.length}</span></div><div class="stack tight">${d.prospect.length ? d.prospect.map(pcard).join('') : '<div class="empty">—</div>'}</div></div>
      </div>
      <div class="grid g2">
        <div><div class="lead">${icon('bat', 'lead-ic')}<span class="pcnt">라인업</span></div>${list(r.lineup)}</div>
        <div><div class="lead">${icon('ball', 'lead-ic')}<span class="pcnt">선발</span></div>${list(r.rotation)}
          <div class="lead" style="margin-top:12px">${icon('glove', 'lead-ic')}<span class="pcnt">불펜</span></div>${list(r.bullpen.slice(0, 5))}</div>
      </div>
      ${h && h.retired.length ? `<div><div class="lead">${icon('gem', 'lead-ic')}<span class="pcnt">영구결번</span></div>
        <div class="rnums">${h.retired.map(x => `<div class="rnum" style="--tc:${cp.color}"><b>${x.number}</b>
          <span class="rn-main"><span class="rn-name">${esc(x.name)}<i>${x.pos}</i></span><span class="rn-sub">${x.from}–${x.to} · ${x.years}시즌</span></span>
          <span class="rn-line">${esc(x.line)}<i>WAR ${x.war}</i></span></div>`).join('')}</div></div>` : ''}
    </div>`);
  $$('#modal [data-pid]').forEach(e => e.onclick = () => openPlayer(+e.dataset.pid));
}

function modalPost(r) {
  /* 챔피언은 크게. 시리즈는 이긴 팀 쪽에서 본 경기 점 줄 — 4승 1패면 초록 넷 빨강 하나. */
  const dots = (x) => x.games && x.games.length ? `<span class="form">${x.games.map(g => {
    const wHome = g.home === x.winner;
    const won = wHome ? g.hr > g.ar : g.ar > g.hr;
    return `<b class="${won ? 'w' : ''}"></b>`; }).join('')}</span>` : '';
  modal(`<div class="mhead"><div class="mhead-p">${cap(r.champion, 56)}
      <div class="mh-main"><h2>${esc(r.champion)}</h2>
        <div class="ptags"><span class="ptag gold">${icon('trophy')}${G.state().year} 챔피언</span>${r.user_won ? '<span class="ptag good">우리가 해냈다</span>' : ''}</div></div></div>
    <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
      <div class="brk">${r.rounds.map(x => `<div class="brk-r ${x.user ? 'me' : ''}">
        <span class="brk-k">${esc(x.round)}</span>
        <span class="brk-t win">${cap(x.winner, 30)}<b>${esc(short(x.winner))}</b></span>
        <span class="brk-s"><b class="m">${x.w}–${x.l}</b>${dots(x)}</span>
        <span class="brk-t">${cap(x.loser, 30)}<b>${esc(short(x.loser))}</b></span>
      </div>`).join('')}</div>
    </div>`);
}
function modalRollover(r) {
  const n = (a) => (a || []).length;
  const ret = r.retired || [], mineRet = ret.filter(x => x.mine);
  const tmt = r.tournament;
  const pchip = (x, extra = '') => `<span class="ptag">${esc(x.name)}${x.age ? `<i class="m">${x.age}</i>` : ''}${extra}</span>`;
  /* 첫 줄 — 겨울에 일어난 일을 숫자로. 은퇴, 급성장, 급락, 병역. */
  const tiles = `<div class="ptiles t4">
    <div class="htile">${icon('back')}<b><span class="m">${n(ret)}</span><small>명 은퇴</small></b><p>${mineRet.length ? `우리 ${mineRet.length}명` : '우리 팀은 없다'}</p></div>
    <div class="htile ${n(r.breakout) ? 'good' : ''}">${icon('bolt')}<b><span class="m">${n(r.breakout)}</span><small>명 급성장</small></b><p>우리 팀</p></div>
    <div class="htile ${n(r.decline) ? 'bad' : ''}">${icon('hurt')}<b><span class="m">${n(r.decline)}</span><small>명 급락</small></b><p>우리 팀</p></div>
    <div class="htile">${icon('shift')}<b><span class="m">${n(r.enlisted)}</span><small>입대</small><span class="m">${n(r.discharged)}</span><small>전역</small></b>
      <p>${n(r.returned) ? `해외에서 ${n(r.returned)}명 돌아왔다` : '돌아온 사람은 없다'}</p></div>
  </div>`;
  const sec = (ic, t, body) => body ? `<div><div class="lead">${icon(ic, 'lead-ic')}<span class="pcnt">${t}</span></div>${body}</div>` : '';
  modal(`<div class="mhead"><div class="mhead-p">${icon('star', 'mh-ic')}<div class="mh-main"><h2>${G.state().year} 시즌 정리</h2>
      <div class="ptags"><span class="ptag">겨울이 왔다</span></div></div></div>
    <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
    ${tiles}
    ${tmt ? `<div class="report">${esc(MEET_KR[tmt.kind] || tmt.kind)} 대표팀 ${tmt.medal ? esc(MEDAL_KR[tmt.medal] || tmt.medal) : '노메달'}${tmt.exempt ? ' — 대표팀 전원 병역 면제' : ''}.
      ${tmt.squad.filter(c => c.team === G.state().user_team.name).map(c => esc(c.name)).join(', ') || '우리 선수는 없었다'}</div>` : ''}
    ${(r.honored || []).length ? sec('gem', `영구결번 ${r.honored.length}`, `<div class="rnums">${r.honored.map(h => `
      <div class="rnum ${h.mine ? 'me' : ''}" style="--tc:${capOf(h.team).color}"><b>${h.number}</b>
        <span class="rn-main"><span class="rn-name">${esc(h.name)}</span><span class="rn-sub">${esc(short(h.team))} · ${h.from}–${h.to} · ${h.years}시즌</span></span>
        <span class="rn-line">WAR ${h.war}</span></div>`).join('')}</div>`) : ''}
    ${mineRet.length ? sec('back', `우리 팀 은퇴 ${mineRet.length}`, `<div class="stack tight">${mineRet.map(x => `<div class="row">
      <span class="prow">${cap(x.team, 22)}<b>${esc(x.name)}</b><span class="sub">${x.age}세</span></span><span class="m dim">${x.years}시즌 · WAR ${x.war}</span></div>`).join('')}</div>`) : ''}
    ${n(r.breakout) || n(r.decline) ? sec('bolt', '달라진 선수', `<div class="chips">
      ${(r.breakout || []).map(x => `<span class="chip good">${esc(x.name)} <b class="m">+${x.delta}</b></span>`).join('')}
      ${(r.decline || []).map(x => `<span class="chip bad">${esc(x.name)} <b class="m">${x.delta}</b></span>`).join('')}</div>`) : ''}
    ${n(r.enlisted) || n(r.discharged) || n(r.returned) ? sec('shift', '오가는 사람', `<div class="chips">
      ${(r.enlisted || []).map(x => `<span class="chip">${icon('shift')}${esc(x.name)} 입대${x.kind === 'sangmu' ? ' · 상무' : ''}</span>`).join('')}
      ${(r.discharged || []).map(x => `<span class="chip good">${icon('back')}${esc(x.name)} 전역</span>`).join('')}
      ${(r.returned || []).map(x => `<span class="chip ${x.mine ? 'good' : ''}">${icon('arrow')}${esc(x.name)} 해외에서 복귀</span>`).join('')}</div>`) : ''}
    ${ret.length ? sec('back', `리그 은퇴 ${ret.length}`, `<div class="stack tight">${ret.slice(0, 24).map(x => `<div class="row ${x.mine ? 'me' : ''}">
      <span class="prow">${cap(x.team, 22)}${esc(x.name)}<span class="sub">${x.age}세</span></span><span class="m dim">${x.years}시즌 · WAR ${x.war}</span></div>`).join('')}</div>`) : ''}
    </div>`);
}
function modalSignings(r) {
  const S = r.signings, mine = S.filter(s => s.mine);
  const total = (arr) => arr.reduce((a, s) => a + (parseFloat((s.text.match(/([\d.]+)억/) || [])[1]) || 0), 0);
  modal(`<div class="mhead"><div class="mhead-p">${icon('pen', 'mh-ic')}<div class="mh-main"><h2>FA 계약</h2>
      <div class="ptags"><span class="ptag">시장이 닫혔다</span></div></div></div>
    <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
      <div class="ptiles t3">
        <div class="htile">${icon('pen')}<b><span class="m">${S.length}</span><small>건</small></b><p>리그 전체</p></div>
        <div class="htile ${mine.length ? 'good' : ''}">${icon('star')}<b><span class="m">${mine.length}</span><small>건 우리 계약</small></b><p>${mine.length ? mine.map(s => esc(s.name)).join(', ') : '한 명도 못 잡았다'}</p></div>
        <div class="htile">${icon('won')}<b><span class="m">${total(S).toFixed(0)}</span>억 <small>총액</small></b><p>우리 ${total(mine).toFixed(1)}억</p></div>
      </div>
      <div class="stack tight">${S.slice(0, 40).map(s => `<div class="row ${s.mine ? 'me' : ''}">
        <span class="prow">${cap(s.team, 22)}<b>${esc(s.name)}</b><span class="sub">${s.age} · ${s.slot}</span>${s.moved ? `<span class="ptag">${icon('arrow')}이적</span>` : '<span class="ptag">잔류</span>'}</span>
        <span class="m">${esc(s.text)}</span></div>`).join('')}</div>
    </div>`);
}

boot();

/* ── 전광판 ────────────────────────────────────────────────
   이닝별 득점과 R·H·E. 야구장 전광판이 실제로 보여 주는 그것이다.
   재생 중에는 그때까지 치른 이닝만 켠다 — 앞을 미리 보여 주면
   지켜보는 뜻이 없다. */
function lineScore(box, upto = 99, half = null) {
  const aw = box.away, hm = box.home;
  const played = Math.max(aw.line.length, hm.line.length);
  const n = Math.max(played, 9);
  const cell = (arr, i, isHome) => {
    // 아직 안 온 이닝은 비운다. 홈이 칠 필요가 없어 안 친 이닝만 X 다 —
    // 강우 콜드로 아예 없던 이닝에 X 를 찍으면 안 된다.
    const done = isHome
      ? (i + 1 < upto || (i + 1 === upto && half === 'bottom'))
      : (i + 1 <= upto);
    if (!done) return '<td class="ls-x">·</td>';
    if (i >= arr.length)
      return `<td class="ls-x">${isHome && i < played ? 'X' : '·'}</td>`;
    const v = arr[i];
    return `<td class="${v > 0 ? 'ls-run' : ''}">${v}</td>`;
  };
  const row = (S, isHome) => `<tr class="${isHome ? 'ls-home' : ''}">
    <th>${esc(short(S.team))}</th>
    ${Array.from({ length: n }, (_, i) => cell(S.line, i, isHome)).join('')}
    <td class="ls-t">${S.runs}</td><td class="ls-t">${S.hits}</td>
    <td class="ls-t">${S.err ?? 0}</td></tr>`;
  return `<div class="lsbox"><table class="ls">
    <thead><tr><th></th>
      ${Array.from({ length: n }, (_, i) => `<th class="${i + 1 === upto ? 'on' : ''}">${i + 1}</th>`).join('')}
      <th class="ls-t">R</th><th class="ls-t">H</th><th class="ls-t">E</th></tr></thead>
    <tbody>${row(aw, false)}${row(hm, true)}</tbody>
  </table></div>`;
}

/* ── 스트라이크 존 ──────────────────────────────────────────
   문자중계에서 보던 그 그림. 존은 타자 키에 비례하고(ABS 전제),
   공은 하나씩 날아와 앉는다. 색은 중계 관례를 따른다 —
   스트라이크 노랑, 볼 초록. 헛스윙과 파울, 인플레이는 따로 표시한다. */
// 옆 칸이 좁다. '스트라이크' 는 잘린다 — 중계 자막처럼 줄여 쓴다.
const PITCH_RES = { S:['strike','스트'], B:['ball','볼'],
  W:['whiff','헛'], F:['foul','파울'], X:['inplay','타구'], H:['hbp','사구'] };

function zoneSvg(seq, zh = 1) {
  if (!seq || !seq.length) return '';
  const W2 = 120, H2 = 150, CX = W2 / 2, CY = H2 / 2;
  const HW = 30, HH = 30 * zh;                       // 존 반폭 · 반높이 (화면 단위)
  const X = (x) => CX + x * HW, Y = (z) => CY - z * HH;
  const dots = seq.map((q, i) => {
    const [cls] = PITCH_RES[q.r] || ['ball', ''];
    const x = X(q.x).toFixed(1), y = Y(q.z).toFixed(1);
    return `<g class="pz-ball ${cls}" style="animation-delay:${i * 170}ms">
      <circle class="pz-trail" cx="${x}" cy="${y}" r="9"/>
      <circle class="pz-dot" cx="${x}" cy="${y}" r="6.5"/>
      <text x="${x}" y="${(+y + 3.2).toFixed(1)}">${i + 1}</text>
    </g>`;
  }).join('');
  return `<svg class="pz" viewBox="0 32 ${W2} 112">
    <rect class="pz-zone" x="${CX - HW}" y="${CY - HH}" width="${HW * 2}" height="${HH * 2}"/>
    <line class="pz-grid" x1="${CX - HW / 3}" y1="${CY - HH}" x2="${CX - HW / 3}" y2="${CY + HH}"/>
    <line class="pz-grid" x1="${CX + HW / 3}" y1="${CY - HH}" x2="${CX + HW / 3}" y2="${CY + HH}"/>
    <line class="pz-grid" x1="${CX - HW}" y1="${CY - HH / 3}" x2="${CX + HW}" y2="${CY - HH / 3}"/>
    <line class="pz-grid" x1="${CX - HW}" y1="${CY + HH / 3}" x2="${CX + HW}" y2="${CY + HH / 3}"/>
    <path class="pz-plate" d="M${CX - 16} ${CY + HH + 16} L${CX + 16} ${CY + HH + 16}
      L${CX + 12} ${CY + HH + 23} L${CX} ${CY + HH + 28} L${CX - 12} ${CY + HH + 23} Z"/>
    ${dots}
  </svg>`;
}
/** 던진 공 목록. 구종과 구속이 붙는다. */
function zoneList(seq) {
  if (!seq || !seq.length) return '';
  return `<div class="pzlist">${seq.map((q, i) => {
    const [cls, kr] = PITCH_RES[q.r] || ['ball', ''];
    return `<div class="pzrow ${cls}"><span class="pzn">${i + 1}</span>
      <span class="pzt">${(PITCH[q.t] && PITCH[q.t].kr) || q.t}${q.g ? `<em class="pzg ${q.g}" title="노림수">${q.g === 'o' ? '●' : '○'}</em>` : ''}</span>
      <span class="pzv m">${q.v}</span>
      <span class="pzr">${kr}</span></div>`;
  }).join('')}</div>`;
}

/* ── 경기 재생 ────────────────────────────────────────────────
   시뮬레이션은 이미 끝났다. 여기서는 그 결과를 되짚어 보여줄 뿐이다.
   구장은 엔진과 같은 기하로 그린다. 타구는 실제로 간 곳에 떨어진다. */

const F_ANGLE = { C:0, P:0, '1B':33, '2B':17, '3B':-33, SS:-17, LF:-30, CF:0, RF:30 };
const F_DEPTH = { C:3, P:17, '1B':33, '2B':41, '3B':33, SS:41, LF:82, CF:90, RF:82 };
const F_KR = { P:'투', C:'포', '1B':'1', '2B':'2', '3B':'3', SS:'유', LF:'좌', CF:'중', RF:'우' };
const FW = 364, FH = 302, HX = 182, HY = 278;
// 실제 야구장은 내야가 외야에 비해 아주 작다. 그대로 그리면 아무것도 안 보인다.
// 방송 그래픽처럼 반경을 완만히 압축해 내야에 자리를 준다.
const RPOW = 0.70, RMAX = 252, RK = RMAX / Math.pow(136, RPOW);
const pt = (ang, dep) => {
  const a = ang * Math.PI / 180, r = Math.pow(Math.max(0, dep), RPOW) * RK;
  return [HX + r * Math.sin(a), HY - r * Math.cos(a)];
};

function fieldSvg(park, color = '#4c8ed9', fill = null) {
  const dims = BIP.parkDims(park);
  const real = dims.real || { fL:99, fC:121, fR:99, fH:3 };
  const seed = [...(park && park.name ? park.name : '구장')]
    .reduce((a, c) => (a * 31 + c.codePointAt(0)) % 9973, 7);
  const stripes = 7 + (seed % 3) * 2;                  // 잔디 줄무늬 수는 구장마다 다르다
  const standDepth = 13 + ((park && park.capacity ? park.capacity : 18000) - 13000) / 13500 * 15;

  const arc = [], out = [];
  for (let a = -45; a <= 45; a += 2.5) {
    const f = BIP.fence(a, dims);
    arc.push(pt(a, f));
    out.push(pt(a, f + standDepth / (MPXAT(f) || 1)));
  }
  const L = (p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const M = (p) => `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

  // 관중석 — 담장 바깥의 띠. 수용 인원이 많을수록 두껍다.
  const stands = M(arc[0]) + arc.slice(1).map(L).join('')
    + L(out[out.length - 1]) + out.slice().reverse().slice(1).map(L).join('') + 'Z';

  // 잔디 줄무늬 — 홈에서 부챗살로 퍼진다
  const mow = [];
  for (let i = 0; i < stripes; i += 2) {
    const a0 = -45 + i * (90 / stripes), a1 = Math.min(45, a0 + 90 / stripes);
    const seg = [];
    for (let a = a0; a <= a1 + 0.01; a += 1.5) seg.push(pt(a, BIP.fence(a, dims)));
    mow.push(`M${HX} ${HY}` + seg.map(L).join('') + 'Z');
  }

  const grass = `M${HX} ${HY}` + arc.map(L).join('') + 'Z';
  const dirt = [];
  for (let a = -46; a <= 46; a += 4) dirt.push(pt(a, 31));
  const inf = `M${HX} ${HY}` + dirt.map(L).join('') + 'Z';
  const b1 = pt(45, 27.4), b2 = pt(0, 38.8), b3 = pt(-45, 27.4);
  const men = Object.keys(F_ANGLE).filter(k => k !== 'C').map(k => {
    const [x, y] = pt(F_ANGLE[k], F_DEPTH[k]);
    return `<g class="fm" data-pos="${k}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10"/>
      <text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}">${F_KR[k]}</text></g>`;
  }).join('');
  const fw = (1.4 + real.fH * 0.45).toFixed(1);        // 담장이 높으면 두껍게 그린다
  const dome = dims.dome ? `<path class="dome" d="${M(out[0])}${out.slice(1).map(L).join('')}"/>` : '';
  const mark = (a, v) => { const [x, y] = pt(a, BIP.fence(a, dims) - 9);
    return `<text class="fdist" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
      text-anchor="${a < -10 ? 'start' : a > 10 ? 'end' : 'middle'}"
      dy="${a === 0 ? 4 : 0}">${v}</text>`; };

  /* 관중. 텅 빈 회색 띠로 두면 야구장이 아니라 도형이다.
     좌석 격자를 깔고 그 위에 사람을 앉힌다. 앉은 정도는 그날 관중 수다.
     2만 명을 점으로 찍을 수는 없으니 패턴으로 민다 — 멀리서 본 관중석은
     실제로도 그렇게 보인다. */
  const uid = 'f' + Math.random().toString(36).slice(2, 8);
  const rate = fill == null ? 0.62 : Math.max(0.08, Math.min(1, fill));
  const seats = `
    <pattern id="seat${uid}" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="none"/>
      <rect x="0" y="0" width="3" height="3" rx="0.6" class="seat"/>
    </pattern>
    <pattern id="crowd${uid}" width="4" height="4" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.15" class="head a"/>
      <circle cx="3.5" cy="3.5" r="1.15" class="head b"/>
    </pattern>`;
  return `<svg class="field ${dims.turf ? 'turf' : ''}" viewBox="0 0 ${FW} ${FH}"
      style="--pc:${color}">
    <defs>${seats}</defs>
    <path class="stands" d="${stands}"/>
    <path class="seats" d="${stands}" fill="url(#seat${uid})"/>
    <path class="crowd" d="${stands}" fill="url(#crowd${uid})" opacity="${rate.toFixed(2)}"/>
    ${dome}
    <path class="grass" d="${grass}"/>
    ${mow.map(d => `<path class="mow" d="${d}"/>`).join('')}
    <path class="dirt" d="${inf}"/>
    <path class="foul" d="M${HX} ${HY} ${L(pt(-45, BIP.fence(-45, dims)))}
      M${HX} ${HY} ${L(pt(45, BIP.fence(45, dims)))}"/>
    <path class="fence" d="${M(arc[0])}${arc.slice(1).map(L).join('')}" stroke-width="${fw}"/>
    ${mark(-40, real.fL)}${mark(0, real.fC)}${mark(40, real.fR)}
    <path class="paths" d="M${HX} ${HY} L${b1[0].toFixed(1)} ${b1[1].toFixed(1)}
      L${b2[0].toFixed(1)} ${b2[1].toFixed(1)} L${b3[0].toFixed(1)} ${b3[1].toFixed(1)} Z"/>
    ${[b1, b2, b3].map(b => `<rect class="bag" x="${(b[0]-3.5).toFixed(1)}" y="${(b[1]-3.5).toFixed(1)}"
      width="7" height="7"/>`).join('')}
    <rect class="bag home" x="${HX-3.5}" y="${HY-3.5}" width="7" height="7"/>
    ${men}
    ${[[45, 27.4, 1], [0, 38.8, 2], [-45, 27.4, 3]].map(([a, d, n]) => {
      const [x, y] = pt(a, d);
      return `<circle class="rn" id="rn${n}" cx="${(x + (n === 1 ? -9 : n === 3 ? 9 : 0)).toFixed(1)}"
        cy="${(y + (n === 2 ? 9 : 6)).toFixed(1)}" r="5.5"/>`;
    }).join('')}
    <path id="trail" class="trail" d=""/>
    <circle id="ball" class="ball" cx="${HX}" cy="${HY}" r="4" opacity="0"/>
  </svg>`;
}

// 압축된 반경에서 1m가 몇 px인지. 관중석 두께를 미터로 되돌릴 때 쓴다.
const MPXAT = (dep) => (Math.pow(dep + 1, RPOW) - Math.pow(dep, RPOW)) * RK;

/** 끝난 경기를 다시 본다. 같은 화면, 같은 시간표 — 기록만 다시 흘린다. */
function openReplay(box) {
  const P = box.plays || [];
  if (!P.length) return;
  if (!gsState) openGameShell(box.away.team, box.home.team, box.park, box.crowd, box.cap);
  const host = gsBody('');
  let stop = false, lv = null;
  const seen = [];
  const end = () => { stop = true; if (lv) { lv.skip(); } };
  lv = mountLive(host, { ...liveOpts(box.home.team, box.away.team, box.park, box.crowd, box.cap),
    onLog: logSink(seen, () => lv), onEnd: end });
  const x = document.getElementById('gsX');
  if (x) x.onclick = () => { stop = true; closeGame(); };
  (async () => {
    await lv.play({ evt: 'start', home: box.home.team, away: box.away.team,
                    park: box.park, crowd: box.crowd, cap: box.cap });
    for (const p of P) { if (stop) break; await lv.play(p); }
    lv.destroy(); if (curLive === lv) curLive = null;
    if (gsState) gsResult(box);
  })();
}
