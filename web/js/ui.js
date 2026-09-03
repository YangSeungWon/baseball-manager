// UI. api.js 가 돌려주는 순수 데이터만 그린다.
// 모든 능력치는 하나의 20~80 눈금축 위에, 어디서나 같은 좌표로 놓인다.
import { Game } from './core/api.js';
import { josa } from './core/mail.js';
import * as save from './save.js';
import * as card from './share.js';
import * as BIP from './core/bip.js';
import { PITCH } from './core/pitch.js';

const KEY = 'dugout.save.v1', WKEY = 'dugout.watch';
/* 경기를 어떻게 볼 것인가. 야구는 축구와 달리 장면이 끊어져 있어서
   85개를 전부 틀어도 ×4 면 24초다 — 전체 재생이 실제로 선택지가 된다.
   기본은 하이라이트, 고른 것은 기억한다. */
const WATCH = { result:'결과만', highlight:'하이라이트', full:'전체 재생' };
const WATCH_NOTE = {
  result:'승부처를 감독에게 맡기고 결과만 본다',
  highlight:'승부처에서 묻고, 득점 장면을 본다',
  full:'승부처에서 묻고, 모든 타석을 본다',
};
let watchMode = 'highlight';
try { const v = localStorage.getItem(WKEY); if (WATCH[v]) watchMode = v; } catch {}
function setWatch(v) { watchMode = v; try { localStorage.setItem(WKEY, v); } catch {} }
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
  // 작년 순위대로 세운다. 순위표를 보는 것과 같은 순서여야 읽힌다.
  const list = bootGame.teamList()
    .map(t => ({ t, d: bootGame.teamDossier(t.id) }))
    .sort((a, b) => a.d.last.rank - b.d.last.rank);
  bootSel = list[0].t.id;
  const wrap = $('#teamPick');
  wrap.innerHTML = '';
  list.forEach(({ t, d }) => {
    const col = capOf(d.name).color;
    const b = el('button', 'trow');
    b.style.setProperty('--tc', col);
    b.style.setProperty('--tcfg', onColor(col));
    b.setAttribute('aria-pressed', String(t.id === bootSel));
    b.innerHTML = `<span class="tpos">${d.last.rank}</span>
      ${cap(d.name, 40)}
      <span><span class="tname">${esc(d.name)}</span>
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
      <p class="dlast">${bootGame.state().year - 1} 시즌 <b>${d.last.rank}위</b>
        <span>${d.last.w}승 ${d.last.l}패${d.last.d ? ` ${d.last.d}무` : ''}</span>
        ${d.lastRank ? `<em>득점 ${d.lastRank.rs}위 · 실점 ${d.lastRank.ra}위</em>` : ''}</p>
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
        ${d.risk.rows.length ? `<div class="riskline">${
          d.risk.rows.map(x => `<span class="s${x.s}">${x.k}<b>${x.v}</b></span>`).join('')}</div>` : ''}

      <div class="dsec">
        <div class="lab">스카우트 리포트</div>
        <div class="scout">
          <div class="axlegend"><span><b class="cur"></b>현재</span>
            <span><b class="pot"></b>잠재력</span></div>
          <div class="scoutkey"><span class="axscale">${
            SCALE.map(x => `<i>${x}</i>`).join('')}</span><span></span></div>
          <div class="sp-group">주축</div>
          ${d.key.map(scoutRow).join('')}
          ${d.prospect.length ? '<div class="sp-group">유망주</div>'
            + d.prospect.map(scoutRow).join('') : ''}
        </div>
      </div>

      <div class="dsec">
        <div class="lab">구단주</div>
        <div class="owner ${d.ownerLine.urgent ? 'urgent' : ''}">
          <span class="odemand">${esc(d.ownerLine.demand)}</span>
          <span class="otemper">인내심 ${esc(d.ownerLine.temper.replace('인내심 ', ''))}</span>
          <span class="oask">“${esc(d.ownerLine.ask)}”</span></div>
      </div>

      ${d.park && d.park.name ? `<div class="dsec">
        <div class="lab">홈 구장</div>
        <div class="parkrow">
          <span class="pkname">${esc(d.park.name)}
            <span>${d.park.opened} 개장 · ${d.park.capacity.toLocaleString()}석</span></span>
          ${d.park.avg ? `<span class="pkatt"><b>${d.park.avg.toLocaleString()}</b>
            <span>평균 관중 · 수용 ${d.park.rate}%</span></span>` : ''}
        </div>
        ${d.park.rate ? `<div class="paybar"><i style="width:${Math.min(100, d.park.rate)}%"></i></div>` : ''}
      </div>` : ''}

      <div class="dsec">
        <div class="lab">운영 예산</div>
        <div class="payline"><span>연봉으로 ${d.payroll}억 / ${d.budget}억</span><b>${pay}%</b></div>
        <div class="paybar ${payCls}"><i style="width:${Math.min(100, pay)}%"></i></div>
      </div>

      ${H && H.legend ? `<div class="dsec">
        <div class="lab">구단 역사</div>
        <p class="dhist">우승 ${H.titles}회${H.lastTitle ? ` · 최근 ${H.lastTitle}년` : ''}</p>
        <div class="legend">
          <span class="lnum">${H.legend.number}</span>
          <span><b>${esc(H.legend.name)}</b>
            <span class="sub">${H.legend.from}–${H.legend.to} · ${esc(H.legend.line)}</span></span>
        </div></div>` : ''}

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
      btn('7일', () => act(() => report(G.advance(7))));
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
  return name.length >= 3 ? name.slice(1) : name;      // 김도영 → 도영
}
/** 이름이 같으면 늘 같은 구호가 나온다. 이름과 상황으로 섞는다.
 *  구호는 응원하는 쪽 — 그러니까 그 구장 — 의 말을 쓴다. */
function chantFor(name, salt = 0, team = null) {
  const who = chantName(name);
  const d = team ? (franchiseOf(team).dialect || 'std') : 'std';
  const h = [...name].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 9973, 7) + salt;
  return CHANT_FORMS[h % CHANT_FORMS.length](who, d);
}

/* ── 하이라이트 ─────────────────────────────────────────────
   하루를 넘기면 결과 한 줄만 뜨고 끝이었다. 야구는 그렇게 보는 게 아니다.
   점수가 난 장면만 골라 흘려 보내고, 언제든 건너뛸 수 있게 한다.
   건너뛰어도 결과는 반드시 보인다. */
function highlightsOf(box) {
  const P = box.plays || [];
  const out = P.filter(p => (p.runs || 0) > 0 || /홈런/.test(p.desc || ''));
  return out.slice(-9);            // 난타전이면 뒤쪽 아홉 장면
}
function openHighlights(box, onDone) {
  const H = highlightsOf(box), aw = box.away, hm = box.home;
  const loud = box.crowd && box.cap ? box.crowd / box.cap : 0.6;
  if (!gsState) openGameShell(aw.team, hm.team, box.park, box.crowd, box.cap);
  if (!H.length) return gsResult(box, onDone);

  let i = -1, timer = null;
  gsBody(`<div class="hl">
      ${box.crowd ? `<div class="hl-crowd">${esc(short(hm.team))} 홈 ·
        관중 <b class="m">${box.crowd.toLocaleString()}</b>
        <span>${Math.round(loud * 100)}%</span></div>` : ''}
      <div class="hl-log" id="hlLog"></div>
      <div class="hl-btn"><button class="quiet" id="hlSkip">건너뛰기</button></div>
    </div>`);
  const step = () => {
    i++;
    if (i >= H.length) { clearInterval(timer); return gsResult(box, onDone); }
    const p = H[i], top = p.half === 'top';
    gsScore({ a: top ? p.ro : p.rd, h: top ? p.rd : p.ro,
              inn: p.inning, half: p.half, outs: p.outs, base: p.base });
    const atk = top ? aw.team : hm.team, cp = capOf(atk);
    const log = document.getElementById('hlLog');
    log.style.setProperty('--tc', cp.color);
    const row = el('div', 'hlrow');
    row.innerHTML = `<span class="hi">${p.inning}회${top ? '초' : '말'}</span>
      <span class="ht"><b>${esc(p.batter || '')}</b> ${esc(p.desc || '')}</span>
      ${p.runs ? `<span class="hr2">+${p.runs}</span>` : ''}`;
    log.appendChild(row);
    // 홈 팀의 득점이면 응원석이 받는다. 사람이 많을수록 진하다.
    if (!top && p.batter && loud > 0.45) {
      const c = el('div', 'chant');
      c.style.setProperty('--tc', cp.color);
      c.style.opacity = (0.45 + loud * 0.55).toFixed(2);
      c.textContent = chantFor(p.batter, p.inning, hm.team);
      log.appendChild(c);
    }
    row.scrollIntoView({ block: 'nearest' });
  };
  document.getElementById('hlSkip').onclick = () => {
    clearInterval(timer); gsResult(box, onDone);
  };
  step();
  timer = setInterval(step, 1400);
}

/** 경기가 끝났다. 같은 화면 안에서 결과로 바뀐다. */
function gsResult(box, onDone) {
  const aw = box.away, hm = box.home;
  lastBox = box;
  if (!gsState) openGameShell(aw.team, hm.team, box.park, box.crowd, box.cap);
  gsScore({ a: aw.runs, h: hm.runs, inn: null, outs: null });
  document.getElementById('gsInn').textContent = '경기 종료';
  gsBody(`<div class="gs-res">
      <div class="gs-final">
        <span>${esc(short(aw.team))}</span><b class="m">${aw.runs}</b>
        <i>:</i><b class="m">${hm.runs}</b><span>${esc(short(hm.team))}</span>
      </div>
      ${lineScore(box)}
      <div class="hl-btn">
        <button class="go" id="gsFull">경기 전체 보기</button>
        <button class="quiet" id="gsDone">구단으로</button>
      </div>
    </div>`);
  document.getElementById('gsFull').onclick = () => openReplay(box);
  document.getElementById('gsDone').onclick = () => { closeGame(); if (onDone) onDone(); };
}

function report(r) {
  if (r && r.games) {
    const one = r.games.length === 1 && r.games[0].box;
    if (!one) for (const g of r.games.slice(-2))
      toast(g.result, g.result === '우천취소' ? short(g.opponent) : `${g.score}  ${short(g.opponent)}`);
    const last = r.games.filter(g => g.box).pop();
    if (last) lastBox = last.box;              // 방금 끝난 내 팀 경기. 다시 볼 수 있다.
    // 하루만 넘겼으면 고른 방식대로 보여 준다. 여러 날은 결과만.
    if (one && watchMode !== 'result') {
      if (watchMode === 'full') openReplay(r.games[0].box);
      else openHighlights(r.games[0].box);
      return;
    }
    if (one) for (const g of r.games)
      toast(g.result, `${g.score}  ${short(g.opponent)}`);
  }
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
const MAIL_ICON = { injury:'✚', ret:'↩', milestone:'◆', owner:'§', contract:'✎',
  game:'●', streak:'▲', standings:'↕', league:'◇', scout:'⌖',
  transfer:'→', draft:'★' };

function viewInbox(v) {
  const m = G.mail(80);
  const g = el('div', 'grid');
  if (!m.rows.length) {
    v.appendChild(sect('받은 편지함', '', '<div class="empty">—</div>'));
    return;
  }
  const groups = [];
  let cur = null;
  for (const x of m.rows) {
    const key = `${x.year}${x.day ? '' : ' 오프시즌'}`;
    if (!cur || cur.key !== key) { cur = { key, year:x.year, off:!x.day, rows:[] }; groups.push(cur); }
    cur.rows.push(x);
  }
  for (const grp of groups) {
    g.appendChild(sect(`${grp.year}${grp.off ? ' 오프시즌' : ''}`, `${grp.rows.length}`,
      grp.rows.map(x => `<div class="mail ${x.read ? '' : 'new'} ${x.pri ? 'pri' : ''}
          ${x.pid ? 'click' : ''}" ${x.pid ? `data-pid="${x.pid}"` : ''}>
        <span class="mi" title="${KIND_KO(x.kind)}">${MAIL_ICON[x.kind] || '·'}</span>
        <span class="mtext">
          <span class="mtop"><b>${esc(x.title)}</b>
            <span class="mmeta">${x.day ? x.day + '일' : ''} · ${KIND_KO(x.kind)}</span></span>
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

  /* 새 소식. 편지함으로 끌고 가는 대신 여기에 굵직한 것만 얹는다.
     읽으러 갈 사람은 가고, 아닌 사람은 홈에서 흐름을 안 놓친다. */
  const mail = G.mail(40);
  const news = mail.rows.filter(m => !m.read)
    .sort((a, b) => (b.pri - a.pri)).slice(0, 4);
  if (news.length) {
    const box = el('div', 'news');
    box.innerHTML = news.map(m => `<div class="nrow ${m.kind}">
        <span class="nic">${MAIL_ICON[m.kind] || '·'}</span>
        <span class="ntx"><b>${esc(m.title)}</b>
          ${m.body ? `<span>${esc(m.body)}</span>` : ''}</span>
      </div>`).join('')
      + `<button class="linky nall">편지함에서 모두 보기${mail.unread > news.length
          ? ` (${mail.unread})` : ''}</button>`;
    v.appendChild(sect('새 소식', '', box));
    box.querySelector('.nall').onclick = () => { tab = 'inbox'; render(); };
  }

  // 오늘의 경기. 다음에 누구와 붙는지가 이 화면에서 제일 궁금한 것이다.
  const sch0 = s.phase === 'regular' ? G.schedule(8).rows : [];
  if (sch0.length) {
    const n = sch0[0], rest = sch0.slice(1, 5);
    const opp = st.find(r => r.team === n.opponent);
    const f0 = G.form(null, 10);
    v.appendChild(sect('다음 경기', `${n.day}일차`, `<div class="next">
      <div class="nx-main">
        <span class="nx-side ${n.is_home ? 'h' : 'a'}">${n.is_home ? '홈' : '원정'}</span>
        ${cap(n.opponent, 42)}
        <span class="nx-op"><b>${esc(short(n.opponent))}</b>
          ${opp ? `<i>${opp.rank}위 · ${opp.w}–${opp.l} · 최근 ${opp.pct}</i>` : ''}</span>
        <span class="nx-form">${formStrip(f0.recent)}</span>
      </div>
      ${rest.length ? `<div class="nx-rest">${rest.map(r =>
        `<span><b class="m">${r.day}</b> ${r.is_home ? '' : '@'}${esc(short(r.opponent))}</span>`
      ).join('')}</div>` : ''}
      <div class="nx-watch"><span class="lab">경기를 볼 때</span>
        ${Object.entries(WATCH).map(([k, kr]) =>
          `<button data-w="${k}" class="${k === watchMode ? 'on' : ''}">${kr}</button>`).join('')}
        <i class="nx-note">${WATCH_NOTE[watchMode]}</i>
      </div>
    </div>`));
    v.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { setWatch(b.dataset.w); render(); });
  }

  if (s.phase === 'regular' && s.day > 0) monthSection(v);

  const g = el('div', 'grid g21');
  const left = el('div', 'grid');

  if (me) {
    const ts = G.leagueTeamStats().rows.find(r => r.is_user);
    const f = G.form(null, 10);
    const own = G.ownerStatus();
    left.appendChild(sect('시즌 현황', `${s.day} / ${s.total_days}일`, `
      <div class="head-line">
        <span class="big">${me.w}<i>–</i>${me.l}${me.d ? `<i>–</i>${me.d}` : ''}</span>
        <span class="head-sub"><b class="m">${me.pct}</b> 승률
          · <b class="m">${me.rank}위</b>${me.gb !== '-' ? ` · <b class="m">${me.gb}</b> 게임차` : ''}
          ${me.playoff ? '<span class="mark">· 포스트시즌권</span>' : ''}</span>
        ${formStrip(f.recent)}
      </div>
      <div class="statgrid">
        <div><span>득점</span><b class="m">${(me.rs / (me.w + me.l + (me.d||0)) || 0).toFixed(2)}</b></div>
        <div><span>실점</span><b class="m">${(me.ra / (me.w + me.l + (me.d||0)) || 0).toFixed(2)}</b></div>
        <div><span>피타고라스</span><b class="m">${me.pyth}</b></div>
        <div><span>홈</span><b class="m">${f.home[0]}–${f.home[1]}</b></div>
        <div><span>원정</span><b class="m">${f.away[0]}–${f.away[1]}</b></div>
        <div><span>팀 타율</span><b class="m">${ts.avg}<i>${ts.rank.avg}위</i></b></div>
        <div><span>팀 홈런</span><b class="m">${ts.hr}<i>${ts.rank.hr}위</i></b></div>
        <div><span>팀 ERA</span><b class="m">${ts.era}<i>${ts.rank.era}위</i></b></div>
      </div>
      <div class="owner ${own.ok === false ? 'bad' : ''}">
        <span class="lab">구단주 요구</span>
        <b>${esc(own.demand)}</b>
        <span class="sub">${esc(own.text)} · 잔여 ${own.remaining}경기</span>
      </div>`));

    const L = G.teamLeaders(null, 4);
    const two = el('div', 'grid g2');
    const leadList = (rows) => rows.length ? rows.map(x =>
      `<div class="row click" data-pid="${x.pid}"><span><span class="name">${esc(x.name)}</span>
        <span class="sub">${x.slot}</span></span>
       <span><span class="m">${esc(x.line)}</span>
        <b class="m war">${x.war}</b></span></div>`).join('') : '<div class="empty">—</div>';
    two.appendChild(sect('팀 타격', 'WAR 순', leadList(L.batting)));
    two.appendChild(sect('팀 투구', 'WAR 순', leadList(L.pitching)));
    left.appendChild(two);
  }

  const rec = G.recentResults(8).rows;
  const day = G.dayResults();
  if (lastBox) {
    const r = lastBox, aw = r.away, hm = r.home;
    left.appendChild(sect('직전 경기', '', `<div class="lastgame">
      <div class="lgs"><span>${esc(short(aw.team))}</span><b class="m">${aw.runs}</b>
        <i>:</i><b class="m">${hm.runs}</b><span>${esc(short(hm.team))}</span></div>
      <button class="go" id="rpOpen">경기 다시 보기</button></div>`));
  }
  const two2 = el('div', 'grid g2');
  two2.appendChild(sect('최근 경기', '', rec.length
    ? rec.slice().reverse().map(r => `<div class="row">
        <span><span class="res ${r.result === '승' ? 'w' : r.result === '무' ? 'd' : 'l'}">${r.result}</span>
          ${r.home ? '' : '@'} ${esc(short(r.opponent))}</span>
        <span class="m">${r.score}</span></div>`).join('')
    : '<div class="empty">—</div>'));
  two2.appendChild(sect(day.rows.length ? `${day.day}일차 리그 결과` : '리그 결과', '',
    day.rows.length ? day.rows.map(r => `<div class="row ${r.user ? 'me' : ''}">
        <span>${esc(short(r.away))} <span class="dim">@</span> ${esc(short(r.home))}
          ${r.dh ? '<span class="tag dh">DH</span>' : ''}
          ${r.called ? '<span class="tag cl">강우 콜드</span>' : ''}</span>
        ${r.rain ? '<span class="rainy">우천취소</span>'
          : `<span class="m">${r.ar}<span class="dim">:</span>${r.hr}</span>`}</div>`).join('')
      : '<div class="empty">—</div>'));
  left.appendChild(two2);

  const right = el('div', 'grid');
  let table_st = st, stTitle = '순위';
  if (!table_st.length) { const ls = G.lastStandings(); table_st = ls.rows; stTitle = `${ls.year} 최종 순위`; }
  // 하루가 지나면 순위가 움직인다. 그 움직임이 보여야 하루를 넘긴 보람이 있다.
  const mv = (n) => !n ? '<span class="mv flat">–</span>'
    : n > 0 ? `<span class="mv up">▲${n}</span>` : `<span class="mv dn">▼${-n}</span>`;
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
  right.appendChild(sect('부상자', `${ros.injured.length}`, ros.injured.length
    ? ros.injured.sort((a,b) => a.injury_days - b.injury_days).map(p =>
      `<div class="row click" data-pid="${p.pid}"><span>${esc(p.name)}
        <span class="sub">${p.slot}</span></span>
       <b class="m mark">${p.injury_days}일</b></div>`).join('')
    : '<div class="empty">—</div>'));

  const sch = G.schedule(6).rows;
  if (sch.length) right.appendChild(sect('다음 경기', '', sch.map(r =>
    `<div class="row"><span class="m dim">${r.day}일</span>
     <span>${r.is_home ? '' : '@'} ${esc(short(r.opponent))}</span></div>`).join('')));

  right.appendChild(sect('구단', '', `
    <div class="kv"><span>연봉</span><b class="m">${ros.payroll}억</b></div>
    <div class="kv"><span>예산</span><b class="m">${ros.budget}억</b></div>`));

  g.appendChild(left); g.appendChild(right); v.appendChild(g);
  v.querySelectorAll('[data-pid]').forEach(r => r.onclick = () => openPlayer(+r.dataset.pid));
  const rpb = $('#rpOpen'); if (rpb) rpb.onclick = () => openReplay(lastBox);
}

/* ── 팀 ── */
const POS_SLOT = { C:'c', '1B':'b1', '2B':'b2', '3B':'b3', SS:'ss',
                   LF:'lf', CF:'cf', RF:'rf' };

function diamond() {
  const ch = G.lineupChart();
  const cell = (pos) => {
    const p = ch.pos[pos];
    if (!p) return `<span class="dpos ${POS_SLOT[pos]}"><i>${pos}</i></span>`;
    return `<span class="dpos ${POS_SLOT[pos]} click" data-pid="${p.pid}"><i>${pos}</i>
      <b>${esc(p.name)}</b><u>${p.ovr.mid}</u></span>`;
  };
  const battery = (p, label) => p
    ? `<span class="dpos ${label === 'SP' ? 'sp' : 'cl'} click" data-pid="${p.pid}">
        <i>${label}</i><b>${esc(p.name)}</b><u>${p.ovr.mid}</u></span>` : '';
  return `<div class="diamond">
    ${['LF','CF','RF','SS','2B','3B','1B','C'].map(cell).join('')}
    ${battery(ch.sp, 'SP')}${battery(ch.closer, 'CL')}</div>`;
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

function viewTeam(v) {
  const r = G.roster();
  const live = ['regular','postseason'].includes(G.state().phase);
  const g = el('div', 'grid');

  if (live) {
    const ts = G.leagueTeamStats().rows.find(x => x.is_user);
    const f = G.form(null, 10);
    const st = G.standings().rows.find(x => x.is_user);
    g.appendChild(sect('팀 기록', '', `<div class="statgrid">
      <div><span>전적</span><b class="m">${st.w}–${st.l}</b></div>
      <div><span>타율</span><b class="m">${ts.avg}<i>${ts.rank.avg}위</i></b></div>
      <div><span>홈런</span><b class="m">${ts.hr}<i>${ts.rank.hr}위</i></b></div>
      <div><span>도루</span><b class="m">${ts.sb}<i>${ts.rank.sb}위</i></b></div>
      <div><span>ERA</span><b class="m">${ts.era}<i>${ts.rank.era}위</i></b></div>
      <div><span>WHIP</span><b class="m">${ts.whip}</b></div>
      <div><span>탈삼진</span><b class="m">${ts.pk}<i>${ts.rank.k}위</i></b></div>
      <div><span>홈/원정</span><b class="m">${f.home[0]}–${f.home[1]}<i>${f.away[0]}–${f.away[1]}</i></b></div>
    </div>`));
  }

  g.appendChild(sect('수비 배치', '', diamond()));

  // 편성. 타순과 자리를 직접 정한다. 출전 시간이 곧 육성이다.
  const lu = G.lineup();
  const fitCls = (f) => f === '적합' ? '' : f === '가능' ? 'w1' : f === '무리' ? 'w2' : 'w3';
  g.appendChild(sect('편성', lu.manual ? '수동' : '자동',
    `<div class="lu">
      <div class="lurows">${lu.slots.map(s => `
        <div class="lurow${luSel === s.order ? ' sel' : ''}" data-slot="${s.order}">
          <span class="lo">${s.order}</span>
          <span class="ln">${esc(s.name)}<i>${s.nat}</i></span>
          <select class="lp" data-pos="${s.order}">${lu.positions.map(p =>
            `<option value="${p}"${p === s.slot ? ' selected' : ''}>${p}</option>`).join('')}</select>
          <span class="lf ${fitCls(s.fit)}">${s.fit}${s.pen ? ` <i>-${s.pen}</i>` : ''}</span>
          <span class="la">${axis(s.ovr, s.pot)}</span>
        </div>`).join('')}</div>
      <div class="lubench">
        <div class="lab">벤치</div>
        ${lu.bench.length ? lu.bench.map(b => `<button class="lb" data-bench="${b.pid}">
          ${esc(b.name)}<i>${b.nat}</i></button>`).join('') : '<div class="empty">—</div>'}
        <div class="lab" style="margin-top:14px">선발 로테이션</div>
        <div class="lurot">${lu.rotation.map(p => `<button class="lb rot"
          data-rot="${p.pid}">${p.order}<i>${esc(p.name)}</i></button>`).join('')}</div>
        <div class="lab" style="margin-top:14px">불펜 보직</div>
        <div class="lupen">${lu.bullpen.map(p => `<div class="pnrow">
          <span class="pnn">${esc(p.name)}${p.locked ? '<em>지정</em>' : ''}</span>
          <select class="lp" data-pen="${p.pid}">${lu.penRoles.map(r =>
            `<option value="${r.key}"${r.key === p.role ? ' selected' : ''}>${r.label}</option>`
          ).join('')}</select>
        </div>`).join('')}</div>
        <button class="quiet luauto" id="luAuto">자동 편성으로</button>
      </div>
    </div>`));

  // 투수 운용. 오늘 누가 던질 수 있는지가 보여야 보직을 정하는 뜻이 있다.
  const ps = G.pitcherStatus();
  const forcedPid = ps.forced_pid;
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
  g.appendChild(sect('투수 운용',
    `불펜 ${ps.ready}/${ps.total} 가능${ps.bullpen_day ? ' · 오늘은 불펜데이' : ''}`,
    `<div class="pstat">
      <div><div class="lab">선발 로테이션</div>
        ${ps.rotation.map(p => prow(p, true)).join('')}
        <div class="spbar">
          <button id="spPen" class="${ps.pen_day_next ? 'on' : ''}">불펜데이로 간다</button>
          ${(ps.forced || ps.pen_day_next) ? '<button id="spClr" class="quiet">순번대로</button>' : ''}
          <i>${ps.pen_day_next ? '다음 경기는 오프너가 나간다. 순번은 그대로 밀린다.'
            : ps.forced ? `다음 경기 선발은 ${esc(ps.forced)}.`
            : '선발을 눌러 다음 경기에 앞세울 수 있다.'}</i>
        </div>
        ${ps.thin ? `<p class="note">${ps.bullpen_day
          ? '던질 선발이 없다. 롱릴리프가 오프너로 나간다.'
          : '선발에 빈자리가 있다. 순번이 돌아오면 불펜이 메운다.'}</p>` : ''}</div>
      <div><div class="lab">불펜</div>
        ${ps.bullpen.map(p => prow(p, false)).join('')}
        <p class="note">4타자 이하로 막으면 다음 날 바로 나올 수 있다.
          길게 던지거나 사흘 연투하면 하루 이상 쉰다.</p></div>
    </div>`));

  // 경기 중 결정은 감독이 한다. 우리는 그 성향만 정한다.
  const tc = G.tactics();
  g.appendChild(sect('감독 지시', '', `<div class="tacs">${tc.rows.map(r => `
    <div class="tac">
      <div class="tk">${esc(r.label)}<i>${esc(r.hint)}</i></div>
      <div class="tsteps">${r.steps.map((s, i) =>
        `<button data-tk="${r.key}" data-tv="${i}" class="${i === r.value ? 'on' : ''}">${esc(s)}</button>`
      ).join('')}</div>
    </div>`).join('')}</div>`));

  const block = (title, list, kind) => {
    if (!list.length) return;
    g.appendChild(sect(title, `${list.length} · ${AXIS_KEY}`, table(
      kind === 'B' ? BAT_HEAD(live) : PIT_HEAD(live),
      list.map(p => (kind === 'B' ? batRow : pitRow)(p, live)),
      (row) => openPlayer(row.p.pid))));
  };
  block('라인업', r.lineup, 'B');
  block('벤치', r.bench, 'B');
  block('선발 로테이션', r.rotation, 'P');
  block('불펜', r.bullpen, 'P');
  // 병역. 1군에서 쓴 선수만 대표팀에 뽑히고, 금메달이면 2년이 돌아온다.
  const ml = G.military();
  const milRow = (p, kind) => `<div class="mrow">
    <span class="mn">${esc(p.name)}<i>${p.slot} · ${p.age}세</i></span>
    ${kind === 'serving' ? `<span class="mk">${p.kind}</span><span class="ml2">${p.left}년 남음</span>`
      : kind === 'due' ? `<span class="mk ${p.active ? 'on' : ''}">${p.active ? '1군' : '2군'}</span>
          <span class="ml2 ${p.due <= 1 ? 'urg' : ''}">${p.due === 0 ? '올겨울 입대' : `${p.due}년 뒤`}</span>`
      : `<span class="mk ok">면제</span><span class="ml2">${p.natl ? `대표 ${p.natl}회` : ''}</span>`}
  </div>`;
  g.appendChild(sect('병역', ml.calendar.length
    ? ml.calendar.map(c => `${c.year} ${c.meets.join('·')}`).join('  ·  ') : '',
    `<div class="mil3">
      <div><div class="lab">미필 <span class="dim">${ml.due.length}</span></div>
        <div class="mlist">${ml.due.length ? ml.due.map(p => milRow(p, 'due')).join('')
          : '<div class="empty">—</div>'}</div></div>
      <div><div class="lab">복무 중 <span class="dim">${ml.serving.length}</span></div>
        <div class="mlist">${ml.serving.length ? ml.serving.map(p => milRow(p, 'serving')).join('')
          : '<div class="empty">—</div>'}</div></div>
      <div><div class="lab">면제 <span class="dim">${ml.exempt.length}</span></div>
        <div class="mlist">${ml.exempt.length ? ml.exempt.map(p => milRow(p, 'exempt')).join('')
          : '<div class="empty">—</div>'}</div>
        <p class="note">대표팀은 그 시즌 1군 성적으로 뽑는다.
          ${ml.ageLimit}세 이하가 원칙이고 와일드카드가 셋이다.
          아시안게임 금메달과 올림픽 동메달 이상이 면제다. WBC는 면제가 없다.</p></div>
    </div>`));

  // 1군 등록과 2군. 올려두고 안 쓰면 퇴보하고, 2군에서는 매일 뛴다.
  const fm = G.farmMoves();
  const roleCls = { 주전:'r1', 선발:'r1', 불펜:'r2', 대기:'r3' };
  g.appendChild(sect('1군 · 2군', `등록 ${fm.count} / ${fm.max}`, `<div class="fm2">
    <div>
      <div class="lab">1군 등록</div>
      <div class="fmlist">${fm.active.map(p => `<div class="fmrow">
        <span class="fr ${roleCls[p.role] || ''}">${p.role}</span>
        <span class="fn2">${esc(p.name)}<i>${p.slot} · ${p.age}세</i></span>
        <span class="fs">${p.hurt ? `<em class="mark">✚${p.hurt}일</em>` : (p.stat ? esc(p.stat) : '')}</span>
        <span class="fb">
          <button data-down="${p.pid}">2군</button>
          <button data-rel="${p.pid}" class="q">방출</button></span>
      </div>`).join('')}</div>
    </div>
    <div>
      <div class="lab">2군 <span class="dim">${fm.farm.length}명</span></div>
      <div class="fmlist">${fm.farm.map(p => `<div class="fmrow">
        <span class="fn2">${esc(p.name)}<i>${p.slot} · ${p.age}세</i></span>
        <span class="fa2">${axis(p.ovr, p.pot)}</span>
        <span class="fb">${p.wait ? `<span class="dim">${p.wait}일 대기</span>`
          : `<button data-up="${p.pid}">1군</button>`}</span>
      </div>`).join('')}</div>
    </div>
  </div>`));

  if (r.injured.length) g.appendChild(sect('부상자', `${r.injured.length}`, table(
    ['선수','P','나이','능력 / 잠재력','복귀까지','계약'],
    r.injured.map(p => ({ p, cells: [nameCell(p), `<span class="m dim">${p.slot}</span>`,
      `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot),
      `<b class="m mark">${p.injury_days}일</b>`,
      p.contract ? `<span class="m dim">${p.contract.text}</span>` : '—'] })),
    (row) => openPlayer(row.p.pid))));

  const farm = G.farm().rows;
  g.appendChild(sect('2군', `${farm.length} · ${AXIS_KEY}`, table(
    ['선수','P','나이','능력 / 잠재력','확신도','출신','지명'],
    farm.map(p => ({ p, cells: [nameCell(p), `<span class="m dim">${p.slot}</span>`,
      `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot),
      `<span class="m dim">${p.confidence}%</span>`,
      p.origin ? `<span class="tag hs">${p.origin[0]}</span>` : '<span class="dim">—</span>',
      `<span class="m dim">${p.draft ? '#' + p.draft.overall : '—'}</span>`] })),
    (row) => openPlayer(row.p.pid))));
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
  v.querySelectorAll('.dpos.click').forEach(e => e.onclick = () => openPlayer(+e.dataset.pid));
}

/* ── 리그 ── */
function viewLeague(v) {
  let st = G.standings().rows;
  const g = el('div', 'grid');
  let title = '순위';
  if (!st.length) { const ls = G.lastStandings(); st = ls.rows; title = `${ls.year} 최종 순위`; }
  if (!st.length) { v.appendChild(sect('순위', '', '<div class="empty">—</div>')); return; }
  const live = !!G.state().total_days && G.state().day > 0;
  g.appendChild(sect(title, '', table(
    ['팀','W','L','D','PCT','GB','RS','RA','PYTH', ...(live ? ['최근 10','홈','원정'] : [])],
    st.map(r => {
      const f = live ? G.form(r.team_id, 10) : null;
      return { _cls: r.is_user ? 'me' : '', team_id: r.team_id, cells: [
        (r.playoff ? '<span class="mark">★</span> ' : '　') + esc(r.team),
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
    g.appendChild(sect('팀 기록', '', table(['팀','타율','홈런','도루','볼넷','삼진','ERA','WHIP','탈삼진'],
      ts.sort((a,b) => a.rank.era - b.rank.era).map(r => ({ _cls: r.is_user ? 'me' : '',
        team_id: r.team_id, cells: [esc(r.team),
          rk(r.avg, r.rank.avg), rk(r.hr, r.rank.hr), rk(r.sb, r.rank.sb),
          `<span class="m">${r.bb}</span>`, `<span class="m">${r.k}</span>`,
          rk(r.era, r.rank.era), `<span class="m">${r.whip}</span>`, rk(r.pk, r.rank.k)] })),
      (row) => openTeam(row.team_id))));
  }
  const L = G.leaders(5);
  const board = (groups) => groups.map(b => `<div style="margin-bottom:16px">
    <div class="lab" style="border-bottom:1px solid var(--rule);padding-bottom:3px;margin-bottom:2px">${b.label}</div>` +
    b.rows.map((r, i) => `<div class="row"><span><span class="m dim">${i+1}</span>
      ${esc(r.name)} <span class="sub">${esc(short(r.team))}</span></span>
      <b class="m">${r.value}</b></div>`).join('') + '</div>').join('');
  const two = el('div', 'grid g2');
  two.appendChild(sect('타격', '', board(L.batting)));
  two.appendChild(sect('투구', '', board(L.pitching)));
  g.appendChild(two);
  v.appendChild(g);
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
  const g = el('div', 'grid g21');
  const fr = G.foreignReplacements();
  if (!fr.error && fr.mine.length) {
    const box = el('div', 'grid');
    box.appendChild(sect('외국인', fr.open ? `교체 마감까지 ${fr.left - fr.deadline}일`
      : '교체 마감', table(
      ['선수','국적','P','능력 / 잠재력','올 시즌','WAR','연봉'],
      fr.mine.map(p => ({ p, cells: [nameCell(p),
        `<span class="nat">${esc(p.nation)}</span>`,
        `<span class="m dim">${p.slot}</span>`, axis(p.ovr, p.pot),
        `<span class="m dim">${esc(p.stat)}</span>`,
        `<b class="m ${p.war < 1 ? 'neg' : p.war >= 3 ? 'pos' : ''}">${p.war}</b>`,
        `<span class="m">${p.paid}억</span>`] })))));
    if (fr.open && fr.pool.length) {
      box.appendChild(sect('여름 시장', `${fr.pool.length} · ${AXIS_KEY}`, table(
        ['선수','국적','P','나이','능력 / 잠재력','잔여 몸값',''],
        fr.pool.map(p => ({ p, cells: [nameCell(p),
          `<span class="nat">${esc(p.nation)}</span>`,
          `<span class="m dim">${p.slot}</span>`,
          `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot),
          `<b class="m">${p.price}억</b>`,
          `<span class="fbtn"><button data-repl="${p.pid}">교체</button></span>`] })))));
      box.appendChild(sect('', '', `<p class="note">여름에 나와 있는 선수는 겨울에 팔리지 않았거나
        다른 데서 잘린 선수다. 급이 떨어지고 볼 시간도 짧다. 방출해도 이미 준 돈은 돌아오지 않는다.</p>`));
    }
    g.appendChild(box);
  }
  // 코치진. 코치는 정답을 주지 않는다. 결과를 바꾸거나 노이즈를 줄인다.
  const sf = G.staff();
  g.appendChild(sect('코치진', `연봉 ${sf.cost}억`, `<div class="stf">${sf.rows.map(r => `
    <div class="sr">
      <div class="sk">${esc(r.label)}<i>${esc(r.hint)}</i></div>
      <div class="sc">${r.cur ? `<b>${esc(r.cur.name)}</b>
        <span class="m sn">${r.cur.rating}</span>
        <span class="m dim">${r.cur.salary}억 · ${r.cur.age}세</span>` : '<span class="dim">공석</span>'}</div>
      <div class="se">${esc(r.effect)}</div>
      <div class="sm">${r.market.map(c => `<button data-hire="${r.key}:${c.id}"
        class="${r.cur && c.rating > r.cur.rating ? 'up' : ''}">${esc(c.name)}
        <i>${c.rating}</i><em>${c.salary}억</em></button>`).join('')}</div>
    </div>`).join('')}</div>`));

  const bp = G.ballpark();
  const bpr = el('div', 'grid');
  bpr.appendChild(sect(bp.name, `${bp.opened} 개장`, `
    <div class="parkbox">${fieldSvg(bp, capOf(G.state().user_team.name).color)}</div>
    <div class="parkspec">
      <div><span>담장</span><b class="m">${bp.fL}<i>·</i>${bp.fC}<i>·</i>${bp.fR}</b><em>m</em></div>
      <div><span>담장 높이</span><b class="m">${bp.fH}</b><em>m</em></div>
      <div><span>수용</span><b class="m">${(bp.capacity/1000).toFixed(1)}</b><em>천</em></div>
      ${bp.attendance ? `<div><span>평균 관중</span><b class="m">${(bp.attendance/1000).toFixed(1)}</b><em>천 · ${bp.rate}%</em></div>` : ''}
      <div><span>구장</span><b>${bp.dome ? '돔' : '개방'}${bp.turf ? ' · 인조잔디' : ' · 천연잔디'}</b></div>
    </div>`));
  const ufr = franchiseOf(G.state().user_team.name);
  bpr.appendChild(sect('유니폼', '', `<div class="unis">
    <div class="uni"><div class="ubox">${jersey(ufr, false, 108)}</div><span>홈</span></div>
    <div class="uni"><div class="ubox away">${jersey(ufr, true, 108)}</div><span>원정</span></div>
  </div>`));
  g.appendChild(bpr);
  g.appendChild(sect('연봉', `${f.contracts.length}`, table(['선수','나이','연봉','계약','만료'],
    f.contracts.map(x => ({ pid: x.pid, cells: [`<span class="name">${esc(x.name)}</span>`,
      `<span class="m">${x.age}</span>`, `<span class="m">${x.salary}</span>`,
      `<span class="m dim">${x.text}</span>`, `<span class="m dim">${x.end_year}</span>`] })),
    (row) => openPlayer(row.pid))));
  const al = G.contractAlerts().rows;
  const right = el('div', 'grid');
  const inc = f.income, tot = Math.max(1, inc.ticket + inc.concession + inc.media);
  const bar = (v, cls) => `<i class="${cls}" style="width:${v / tot * 100}%"></i>`;
  right.appendChild(sect('재정', '', `
    <div class="kv"><span>예산</span><b class="m">${f.budget}억</b></div>
    <div class="kv"><span>연봉</span><b class="m">${f.payroll}억</b></div>
    <div class="kv"><span>여력</span><b class="m ${f.room < 0 ? 'mark' : ''}">${f.room}억</b></div>
    <div class="incbar">${bar(inc.ticket,'i1')}${bar(inc.concession,'i2')}${bar(inc.media,'i3')}</div>
    <div class="inclegend">
      <span><i class="i1"></i>입장 ${inc.ticket}억</span>
      <span><i class="i2"></i>식음료·굿즈 ${inc.concession}억</span>
      <span><i class="i3"></i>중계·스폰서 ${inc.media}억</span></div>`));
  if (f.park && f.park.name) right.appendChild(sect('홈 구장', '', `
    <div class="kv"><span>${esc(f.park.name)}</span>
      <b class="m">${f.park.capacity.toLocaleString()}석</b></div>
    ${f.park.avg ? `<div class="kv"><span>평균 관중</span>
      <b class="m">${f.park.avg.toLocaleString()}명 <i class="off">${f.park.rate}%</i></b></div>
      <div class="kv"><span>시즌 총관중</span>
      <b class="m">${Math.round(f.park.total / 10000 * 10) / 10}만명</b></div>` : ''}`));
  if (al.length) right.appendChild(sect('계약 만료·FA 임박', `${al.length}`, al.map(p =>
    `<div class="row click" data-pid="${p.pid}"><span>${esc(p.name)}
      <span class="sub">${p.age} ${p.slot}</span></span>
     <span><span class="tag ${p.status === 'FA' ? 'inj' : ''}">${p.status}</span></span></div>`).join('')));
  const own = G.ownerStatus();
  right.appendChild(sect('구단주', '', `
    <div class="kv"><span>요구</span><b>${esc(own.demand)}</b></div>
    <div class="kv"><span>인내심</span><b class="m ${own.patience < 35 ? 'mark' : ''}">${own.patience}</b></div>
    <div class="kv"><span>현황</span><b>${esc(own.text)}</b></div>`));
  g.appendChild(right);
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
  const g = el('div', 'grid g21');
  const left = el('div', 'grid');

  const mineRows = m.mine.map(p => ({ p, cells: [
    nameCell(p),
    `<span class="nat">${esc(p.nation)}</span>`,
    `<span class="m dim">${p.slot}</span>`,
    `<span class="m">${p.age}</span>`,
    axis(p.ovr, p.pot),
    `<span class="m dim">${p.stat || '—'}</span>`,
    `<b class="m">${p.ask}억</b>`,
    p.contract ? '<span class="tag ok">재계약</span>'
      : `<span class="fbtn"><button data-re="${p.pid}">재계약</button><button data-rel="${p.pid}" class="q">방출</button></span>`,
  ] }));
  left.appendChild(sect('우리 외국인', `${m.mine.length} / 3`, m.mine.length
    ? table(['선수','국적','P','나이','능력 / 잠재력','지난 시즌','재계약','']
        , mineRows) : '<div class="empty">없다</div>'));

  const canP = m.room > 0 && m.pitcherRoom > 0, canB = m.room > 0;
  left.appendChild(sect('시장', `${m.market.length} · ${AXIS_KEY}`, table(
    ['선수','국적','P','나이','능력 / 잠재력','몸값',''],
    m.market.map(p => ({ p, cells: [
      nameCell(p),
      `<span class="nat">${esc(p.nation)}</span>`,
      `<span class="m dim">${p.slot}</span>`,
      `<span class="m">${p.age}</span>`,
      axis(p.ovr, p.pot),
      `<b class="m">${p.ask}억</b>`,
      (p.kind === 'P' ? canP : canB)
        ? `<span class="fbtn"><button data-sign="${p.pid}">계약</button></span>`
        : '<span class="dim">—</span>',
    ] })))));

  const right = el('div', 'grid');
  right.appendChild(sect('쿼터', '', `
    <div class="quota">
      <div class="qb"><span>보유</span><b>${3 - m.room}<i>/3</i></b></div>
      <div class="qb"><span>투수</span><b>${2 - m.pitcherRoom}<i>/2</i></b></div>
    </div>
    <div class="kv"><span>신규 계약 상한</span><b class="m">${m.cap}억</b></div>
    <div class="kv"><span>연봉 총액</span><b class="m">${m.payroll}억</b></div>
    <div class="kv"><span>예산</span><b class="m">${m.budget}억</b></div>`));
  right.appendChild(sect('', '', `<p class="note">몸값은 리그 전체가 매긴 값이다.
    우리 스카우트가 본 눈금과 어긋난다면, 그 차이가 곧 기회이거나 함정이다.</p>`));
  g.appendChild(left); g.appendChild(right);
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

  // 오늘 답을 기다리는 사람이 먼저다. 나머지는 그다음이다.
  if (talking.length) {
    const w = el('div', 'sect');
    w.innerHTML = `<h3>답을 기다린다 <em>${talking.length}</em></h3>
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

  // 좁은 화면에서는 협상에 필요한 칸만 남긴다. 요구와 내 제시가 핵심이다.
  const narrow = window.innerWidth < 620;
  const g = el('div', 'grid g21');
  g.appendChild(sect('FA 시장', `${fa.day}/${fa.days}일`, table(
    narrow ? ['선수','등급','요구','내 제시']
           : ['선수','','나이','등급','능력','요구','시장','기분','내 제시'],
    live.map(p => {
      const ask = `<span class="m">${p.ask.years}년 ${p.ask.total}억</span>`;
      const off = p.offer ? `<b class="m mark">${p.offer.years}년 ${p.offer.total}억</b>`
                          : '<span class="dim">—</span>';
      const gr = `<span class="gr g${p.grade}">${p.grade}</span>`;
      return { p, cells: narrow
        ? [nameCell(p), gr, ask, off]
        : [nameCell(p), `<span class="m dim">${p.slot}</span>`,
           `<span class="m">${p.age}</span>`, gr, axis(p.ovr), ask,
           `<span class="dim">${p.heat}</span>`,
           `<span class="${p.mood < 34 ? 'warn' : ''}">${p.offer ? p.mood_word : '—'}</span>`,
           off] };
    }),
    (row) => openOffer(row.p))));

  const side = el('div', 'stack');
  side.appendChild(sect('겨울 예산', '', `
    <div class="kv"><span>연 지출 여력</span><b class="m">${fa.room}억</b></div>
    <div class="kv"><span>제시 합계 (연)</span><b class="m ${spend > fa.room ? 'mark' : ''}">${spend.toFixed(1)}억</b></div>
    <p class="note">한 해에 쓸 수 있는 돈이다. 넘겨서 부를 수는 없다 —
      자리를 비우려면 방출이나 트레이드를 먼저 해야 한다.</p>
    <div style="margin-top:12px">${mine.length ? mine.map(r =>
      `<div class="row"><span>${esc(r.name)}</span>
       <b class="m">${r.offer.years}년 ${r.offer.total}억</b></div>`).join('')
      : '<div class="empty">아직 제시한 곳이 없다</div>'}</div>`));
  if (done.length) side.appendChild(sect('계약 완료', `${done.length}`,
    `<div class="stack">${done.slice(0, 14).map(r =>
      `<div class="row ${r.signed.mine ? 'mine' : ''}"><span>${esc(r.name)}</span>
       <b class="m">${esc(r.signed.team)} ${esc(r.signed.text)}</b></div>`).join('')}</div>`));
  g.appendChild(side);
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
      <div class="trow">
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
      <div class="trow">
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

function viewDraft(v) {
  const b = G.draftBoard(40);
  const g = el('div', 'grid g21');
  const note = `${b.round}R · ${b.pick_no}/${b.total} · ` +
    (b.my_turn ? '<span class="mark">내 차례</span>' : esc(short(b.on_clock || '')));
  g.appendChild(sect('드래프트 보드', `${note} · ${AXIS_KEY}`, table(
    ['선수','','','나이','능력 / 잠재력','확신도'],
    b.rows.map(p => ({ p, cells: [`<span class="name">${esc(p.name)}</span>`,
      `<span class="tag hs">${p.origin ? p.origin[0] : ''}</span>`,
      `<span class="m dim">${p.slot}</span>`, `<span class="m">${p.age}</span>`,
      axis(p.ovr, p.pot), `<span class="m dim">${p.confidence}%</span>`] })),
    (row) => { if (!b.my_turn) return openPlayer(row.p.pid);
      if (confirm(`${row.p.name} 지명. 되돌릴 수 없다.`)) { G.draftPick(row.p.pid); autosave(); render(); } })));
  g.appendChild(sect('지명', `${b.picks.length}`,
    b.picks.length ? b.picks.slice().reverse().slice(0, 24).map(p =>
      `<div class="row ${p.mine ? 'me' : ''}"><span class="m dim">${p.n}</span>
       <span>${esc(short(p.team))} <span class="name">${esc(p.name)}</span></span></div>`).join('')
      : '<div class="empty">—</div>'));
  v.appendChild(g);
}

function viewTrade(v) {
  const teams = G.teamList().filter(t => t.id !== G.state().user_team.id);
  const g = el('div', 'grid');
  g.appendChild(sect('트레이드', '', `<div style="display:grid;
    grid-template-columns:repeat(auto-fill,minmax(200px,1fr));border-top:1px solid var(--rule);
    border-left:1px solid var(--rule)">
    ${teams.map(t => `<button class="tcard" data-tid="${t.id}">
      <b>${esc(t.name)}</b><span>${t.mode}</span></button>`).join('')}</div>`));
  v.appendChild(g);
  v.querySelectorAll('[data-tid]').forEach(b => b.onclick = () => openTrade(+b.dataset.tid));
}

let tsel = { give: new Set(), get: new Set(), other: null };
const openTrade = (tid) => { tsel = { give: new Set(), get: new Set(), other: tid }; drawTrade(); };
function drawTrade() {
  const mine = G.tradeAssets(G.state().user_team.id);
  const theirs = G.tradeAssets(tsel.other);
  const group = (arr, set, side, title) => `<div class="lab"
    style="border-bottom:1px solid var(--rule);padding-bottom:3px;margin:12px 0 2px">${title}</div>` +
    arr.map(p => `<div class="row" style="cursor:pointer" data-side="${side}" data-pid="${p.pid}">
      <span>${set.has(p.pid) ? '<span class="mark">■</span> ' : '<span class="dim">□</span> '}
      ${esc(p.name)} <span class="sub">${p.age} ${p.slot}</span></span>${axis(p.ovr)}</div>`).join('');
  const ev = (tsel.give.size || tsel.get.size)
    ? G.tradeEvaluate([...tsel.give], [...tsel.get], tsel.other) : null;
  modal(`
    <div class="mhead"><div><h2>${esc(theirs.team)}</h2>
      <div class="meta">${theirs.mode}</div></div><button id="mx" class="quiet">닫기</button></div>
    <div class="mbody">
      ${ev ? `<div class="report" style="border-left-color:${ev.verdict === 'accept' ? 'var(--ink)' : 'var(--mark)'};
        margin-bottom:16px;color:var(--ink)">${esc(ev.text)}</div>` : ''}
      <div class="grid g2">
        <div><div class="lab">내가 내줄 선수</div>
          <div style="max-height:340px;overflow:auto">
          ${group(mine.roster, tsel.give, 'give', '1군')}${group(mine.farm, tsel.give, 'give', '2군')}</div></div>
        <div><div class="lab">내가 받을 선수</div>
          <div style="max-height:340px;overflow:auto">
          ${group(theirs.roster, tsel.get, 'get', '1군')}${group(theirs.farm, tsel.get, 'get', '2군')}</div></div>
      </div>
      <div style="margin-top:18px"><button id="propose" class="primary"
        ${ev && ev.verdict === 'accept' ? '' : 'disabled'}>제안</button></div>
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
  g.appendChild(sect('구단 연혁', `${fr.length}개 구단`, table(
    ['구단','창단','통산 전적','승률','우승','정규 1위','최근 우승','무관','프랜차이즈 레전드'],
    fr.map(f => ({ team_id: f.team_id, cells: [
      `<span class="name">${esc(f.name)}</span>`,
      `<span class="m dim">${f.founded}</span>`,
      `<span class="m">${esc(f.record)}</span>`,
      `<span class="m">${f.pct}</span>`,
      `<span class="m"><b>${f.titles}</b></span>`,
      `<span class="m dim">${f.pennants}</span>`,
      `<span class="m dim">${f.lastTitle ?? '—'}</span>`,
      `<span class="m ${f.drought >= 20 ? 'mark' : 'dim'}">${f.drought ?? '—'}</span>`,
      f.legend ? `<span class="sub">${f.legend.number}번 ${esc(f.legend.name)}
        <span class="dim">${esc(f.legend.line)}</span></span>` : '—'] })),
    (row) => openTeam(row.team_id))));

  const two = el('div', 'grid g2');
  const tl = G.titleTimeline();
  two.appendChild(sect('역대 우승', `${tl.length}회`, tl.length
    ? `<div class="timeline">${tl.slice(0, 40).map(t =>
        `<span class="tl ${t.sim ? 'sim' : ''}"><i class="m">${t.year}</i>
         ${esc(short(t.team))}</span>`).join('')}</div>`
    : '<div class="empty">—</div>'));
  const aw = G.awardHistory(14);
  two.appendChild(sect('수상 이력', '', aw.length
    ? aw.map(a => `<div class="row click" data-pid="${a.pid}">
        <span><span class="m dim">${a.year}</span> <span class="tag">${a.kind}</span>
          <span class="name">${esc(a.name)}</span>
          <span class="sub">${esc(short(a.team))}</span></span>
        <span class="m dim">${esc(a.line)}</span></div>`).join('')
    : '<div class="empty">—</div>'));
  g.appendChild(two);

  const rec = G.records(10), sr = G.seasonRecords(5);
  const board = (groups, sub) => groups.map(b => `<div class="lead">
    <div class="lab">${b.label}</div>` +
    (b.rows.length ? b.rows.map((r, i) => `<div class="row click" data-pid="${r.pid}">
      <span><span class="m dim">${i+1}</span> ${r.active === false ? '' : (r.active ? '<span class="dot">●</span> ' : '')}${esc(r.name)}
        ${sub ? `<span class="sub">${r.year}</span>` : ''}</span>
      <b class="m">${r.value}</b></div>`).join('') : '<div class="empty">—</div>') + '</div>').join('');
  const c1 = el('div', 'grid g2');
  c1.appendChild(sect('통산 기록 — 타격', '', `<div class="leadgrid">${board(rec.batting)}</div>`));
  c1.appendChild(sect('통산 기록 — 투구', '', `<div class="leadgrid">${board(rec.pitching)}</div>`));
  g.appendChild(c1);
  const c2 = el('div', 'grid g2');
  c2.appendChild(sect('단일 시즌 최고 — 타격', '', `<div class="leadgrid">${board(sr.batting, true)}</div>`));
  c2.appendChild(sect('단일 시즌 최고 — 투구', '', `<div class="leadgrid">${board(sr.pitching, true)}</div>`));
  g.appendChild(c2);

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
  if (watchMode === 'result') return act(() => report(G.advance(1)));
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
          <b>${esc(short(aw))}</b><em id="gsA">0</em></span>
        <span class="gs-t home">${jersey(franchiseOf(hm), false, 30)}
          <b>${esc(short(hm))}</b><em id="gsH">0</em></span>
      </div>
      <div class="gs-sit">
        <span class="gs-inn"><i id="gsArr" class="gs-arr"></i><span id="gsInn">경기 준비</span></span>
        <svg class="gs-dia" viewBox="0 0 34 34" aria-hidden="true">
          <rect id="gd2" x="13" y="1"  width="9" height="9" transform="rotate(45 17.5 5.5)"/>
          <rect id="gd3" x="1"  y="13" width="9" height="9" transform="rotate(45 5.5 17.5)"/>
          <rect id="gd1" x="25" y="13" width="9" height="9" transform="rotate(45 29.5 17.5)"/>
        </svg>
        <span class="gs-bso" id="gsBSO"></span>
      </div>
      <button id="gsX" class="quiet gs-out"><span>구단으로</span><i>나가기</i></button>
    </div>
    <div class="gs-body" id="gsBody"></div>
  </div>`, true);
  document.getElementById('gsX').onclick = closeGame;
}
function gsScore({ a, h, inn, half, outs, b, s, base }) {
  const q = (id) => document.getElementById(id);
  if (a != null && q('gsA')) q('gsA').textContent = a;
  if (h != null && q('gsH')) q('gsH').textContent = h;
  if (inn && q('gsInn')) q('gsInn').textContent = `${inn}회`;
  // 중계처럼 초는 위 화살표, 말은 아래 화살표
  if (half && q('gsArr')) q('gsArr').textContent = half === 'top' ? '▲' : '▼';
  // 기록의 아웃카운트는 그 플레이 '뒤' 값이라 3 이 나온다. 그때는 이닝이 끝난 것이다.
  const dot = (n, k, cls) => `<i class="${cls}${n > k ? ' on' : ''}"></i>`;
  if (q('gsBSO')) q('gsBSO').innerHTML = outs == null ? ''
    : `<span class="bso b">${[0,1,2].map(k => dot(b ?? 0, k, 'b')).join('')}</span>
       <span class="bso s">${[0,1].map(k => dot(s ?? 0, k, 's')).join('')}</span>
       <span class="bso o">${[0,1].map(k => dot(Math.min(outs, 2), k, 'o')).join('')}</span>`;
  const bs = base || [null, null, null];
  for (let k = 0; k < 3; k++) {
    const e = q('gd' + (k + 1)); if (e) e.classList.toggle('on', !!bs[k]);
  }
}
const gsBody = (html) => { const e = document.getElementById('gsBody');
  if (e) e.innerHTML = html; return e; };
function closeGame() { gsState = null; closeModal(); }

/* ── 승부처 ───────────────────────────────────────────────────
   하루를 지켜본다. 감독이 실제로 손을 쓰는 순간에만 멈춰 선다.
   여기서 고른 것은 진짜로 경기 결과를 바꾼다 — 재생이 아니라 진행 중인 경기다. */
function watchDay() {
  const w = G.watchDay();
  if (w.error) { closeGame(); return; }
  const finish = (r) => { autosave(); render(); report(r.result); };
  const go = (answer) => {
    const r = w.step(answer);
    if (r.done) return finish(r);
    askMoment(r.ask, go, bail);
  };
  // 창을 닫으면 남은 결정은 감독에게 맡기고 하루를 끝낸다.
  // 여기서 멈춘 채로 두면 하루가 반만 치러진 상태로 남고,
  // 그 뒤 '다음 날' 을 누르면 같은 날이 두 번 열린다.
  const bail = () => {
    let r = w.step(null);
    while (!r.done) r = w.step(null);
    finish(r);
  };
  go();
}

function askMoment(m, go, bail) {
  const half = m.half === 'top' ? '초' : '말';
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

  // 스코어보드는 껍데기가 들고 있다. 여기서는 물어볼 것만 그린다.
  gsScore({ a: m.half === 'top' ? m.ours : m.theirs, h: m.half === 'top' ? m.theirs : m.ours,
            inn: m.inning, half: m.half, outs: m.outs, base: m.bases });
  gsBody(`<div class="clutch">
      <div class="gs-q">${title}</div>
      <div class="csit">
        <div class="cbase">${on.length ? on.map(x => `<span>${x}</span>`).join('')
          : '<span class="dim">주자 없음</span>'}</div>
        ${m.pitcher ? `<div class="cpit">투수 ${esc(m.pitcher)}</div>` : ''}
      </div>
      ${body}
    </div>`);
  document.querySelectorAll('.mopts button').forEach(b => b.onclick = () => {
    const a = JSON.parse(b.dataset.a);
    b.closest('.mopts').querySelectorAll('button').forEach(x => x.disabled = true);
    go(a);
  });
  // 닫기(배경 클릭·Esc)는 취소가 아니라 위임이다
  $('#modal').onclick = (e) => { if (e.target.id === 'modal') bail(); };
  document.onkeydown = (e) => { if (e.key === 'Escape') bail(); };
  const x = document.getElementById('gsX'); if (x) x.onclick = bail;
}


function modal(html, full = false) {
  $('#modal').classList.toggle('full', !!full);
  $('#modalBody').innerHTML = html; $('#modal').hidden = false;
  const x = $('#mx'); if (x) x.onclick = closeModal;
  $('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
  document.onkeydown = (e) => { if (e.key === 'Escape') closeModal(); };
}
function closeModal() { $('#modal').hidden = true; $('#modal').classList.remove('full');
  document.onkeydown = null; }

const ATTR_KO = { contact:'컨택', avoid_k:'삼진회피', discipline:'선구안', gap_power:'갭파워',
  hr_power:'파워', speed:'주력', fielding:'수비', stuff:'구위', command:'제구',
  movement:'무브먼트', stamina:'체력', arm:'송구', velo:'구속' };

function openPlayer(pid) {
  const p = G.player(pid);
  if (p.error) return;
  const attrs = Object.entries(p.attrs).map(([k, v]) =>
    `<div class="attrrow"><span>${ATTR_KO[k] || k}</span>${axis(v, { lo:v.pot_lo, hi:v.pot_hi })}</div>`).join('');
  const bh = ['연도','팀','나이','G','AVG','OBP','SLG','HR','RBI','WAR'];
  const ph = ['연도','팀','나이','G','IP','W','L','ERA','K','WAR'];
  const seasons = p.seasons.length ? `<table><thead><tr>${(p.kind === 'B' ? bh : ph)
    .map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${p.seasons.map(s =>
    `<tr><td class="m">${s.year}</td><td>${esc(short(s.team))}</td><td class="m">${s.age}</td>
     <td class="m">${s.g}</td>` + (p.kind === 'B'
      ? `<td class="m">${s.avg}</td><td class="m">${s.obp}</td><td class="m">${s.slg}</td>
         <td class="m">${s.hr}</td><td class="m">${s.rbi}</td>`
      : `<td class="m">${s.ip}</td><td class="m">${s.w}</td><td class="m">${s.l}</td>
         <td class="m">${s.era}</td><td class="m">${s.k}</td>`) +
    `<td class="m"><b>${s.war}</b></td></tr>`).join('')}</tbody></table>` : '';
  const awards = p.awards && Object.keys(p.awards).length
    ? Object.entries(p.awards).map(([k, v]) => `<span class="tag hs">${k}×${v}</span>`).join('') : '';
  const bindShare = () => { const b = $('#mshare'); if (b) b.onclick = () => makeCard(p); };
  const pcol = p.team ? capOf(p.team).color : '#3b4655';
  modal(`
    <div class="mhead"><div class="mhead-p">${avatar(p, pcol, 52, false, p.team ? franchiseOf(p.team) : null)}
      <div><h2>${esc(p.name)}${awards}</h2>
      <div class="meta">${p.number ? `<b class="m">${p.number}번</b> · ` : ''}${p.age} · ${p.slot} · ${p.hand}${p.kind === 'P' ? 'T' : 'B'}
        ${p.origin ? ' · ' + p.origin : ''}${p.draft ? ` · #${p.draft.overall}` : ''}
        ${p.mil && p.mil.s !== 'done' ? ` · <span class="milt ${p.mil.s}">${p.mil.s === 'serving'
          ? `${p.mil.kind === 'sangmu' ? '상무' : '현역'} ${p.mil.left}년`
          : p.mil.s === 'exempt' ? '병역 면제'
          : p.mil.due === 0 ? '올겨울 입대' : `미필 · ${p.mil.due}년`}</span>` : ''}
        ${p.injury_days ? ` · <span class="mark">✚${p.injury_days}</span>` : ''}</div></div></div>
      <span class="mbtns"><button id="mshare" class="quiet">카드 만들기</button>
      <button id="mx" class="quiet">닫기</button></span></div>
    <div class="mbody stack">
      <div class="grid g2">
        <div>
          <div class="lab" style="margin-bottom:6px">능력 / 잠재력</div>
          <div class="axkey" style="margin:0 0 6px auto">${AXIS_KEY.split(' · ').map(x => `<span>${x}</span>`).join('')}</div>
          ${attrs}
        </div>
        <div>
          <div class="kv"><span>종합</span>${axis(p.ovr, p.pot)}</div>
          ${p.arsenal ? `<div class="arsenal">${p.arsenal.map(a =>
            `<span><b>${a.kr}</b>${a.kmh}</span>`).join('')}</div>` : ''}
          <div class="kv"><span>확신도</span><b class="m">${p.confidence}%</b></div>
          <div class="kv"><span>계약</span><b class="m">${p.contract ? p.contract.text : '—'}</b></div>
          <div class="kv"><span>연봉</span><b class="m">${p.contract ? p.contract.salary + '억' : '—'}</b></div>
          <div class="kv"><span>서비스</span><b class="m">${p.service}</b></div>
          <div class="kv"><span>통산 WAR</span><b class="m">${p.career_war ?? '—'}</b></div>
          <div class="kv"><span>부상</span><b class="m">${p.injuries.count} · ${p.injuries.days}일</b></div>
          ${p.traits && p.traits.length ? `<div class="prs">
            <div class="lab">성향</div>
            ${p.traits.map(t => `<span class="pt ${t.level}${t.good ? ' g' : ' b'}">${esc(t.text)}</span>`).join('')}
          </div>` : `<div class="prs"><div class="lab">성향</div>
            <span class="pt none">겪어본 게 없어 아직 모른다</span></div>`}
          <div style="margin-top:16px" class="report">${esc(p.comment)}</div>
        </div>
      </div>
      ${p.splits ? `<div><div class="lab" style="margin-bottom:6px">스플릿</div>
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
      ${seasons ? `<div><div class="lab" style="margin-bottom:6px">연도별</div>${seasons}</div>` : ''}
      ${p.events && p.events.length ? `<div><div class="lab" style="margin-bottom:6px">이력</div>` +
        p.events.map(e => `<div class="row"><span class="m dim">${e.year}</span><span>${esc(e.text)}</span></div>`).join('')
        + '</div>' : ''}
    </div>`);
  bindShare();
}

function openTeam(tid) {
  const r = G.roster(tid);
  const list = (arr) => arr.map(p => `<div class="row"><span>${esc(p.name)}
    <span class="sub">${p.age} ${p.slot}</span></span>${axis(p.ovr, p.pot)}</div>`).join('');
  modal(`
    <div class="mhead"><div><h2>${esc(r.name)}</h2>
      <div class="meta">${r.mode} · 연봉 ${r.payroll}억</div></div>
      <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
      ${(() => { const d = G.teamDossier(tid); return d.history ? `<div class="report">
        ${esc(d.history.tagline)}<br><span class="sub">창단 ${d.history.founded} ·
        통산 ${esc(d.history.record)} (${d.history.pct}) · 우승 ${d.history.titles}회</span>
        ${d.history.legend ? `<br><span class="sub">영구결번 ${d.history.legend.number}
        ${esc(d.history.legend.name)} — ${esc(d.history.legend.line)}</span>` : ''}</div>` : ''; })()}
      <div><div class="lab" style="margin-bottom:6px">라인업</div>${list(r.lineup)}</div>
      <div><div class="lab" style="margin-bottom:6px">선발</div>${list(r.rotation)}</div>
    </div>`);
}

function modalPost(r) {
  modal(`<div class="mhead"><div><h2>${esc(r.champion)}</h2>
    <div class="meta">${r.user_won ? '우리 팀 우승' : '챔피언'}</div></div>
    <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody">${r.rounds.map(x => `<div class="row ${x.user ? 'me' : ''}">
      <span class="lab">${esc(x.round)}</span>
      <span><b>${esc(x.winner)}</b> <span class="m">${x.score}</span> ${esc(x.loser)}</span></div>`).join('')}</div>`);
}
function modalRollover(r) {
  const block = (t, arr, fmt) => arr.length
    ? `<div><div class="lab" style="margin-bottom:6px">${t}</div>${arr.map(fmt).join('')}</div>` : '';
  modal(`<div class="mhead"><div><h2>${G.state().year} 시즌 정리</h2></div>
    <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
    ${(r.honored || []).length ? `<div><div class="lab" style="margin-bottom:6px">영구결번</div>
      ${r.honored.map(h => `<div class="row ${h.mine ? 'me' : ''}">
        <span><b class="m">${h.number}번</b> ${esc(h.name)}
          <span class="sub">${esc(short(h.team))} · ${h.from}–${h.to}</span></span>
        <span class="m dim">${h.years}시즌 · WAR ${h.war}</span></div>`).join('')}</div>` : ''}
    ${block('은퇴', r.retired.slice(0, 24), x => `<div class="row ${x.mine ? 'me' : ''}">
      <span>${esc(x.name)} <span class="sub">${x.age} ${esc(short(x.team))}</span></span>
      <span class="m dim">${x.years}시즌 · ${x.war}</span></div>`)}
    ${block('급성장', r.breakout, x => `<div class="row"><span>${esc(x.name)}</span>
      <b class="m">+${x.delta}</b></div>`)}
    ${block('급락', r.decline, x => `<div class="row"><span>${esc(x.name)}</span>
      <b class="m mark">${x.delta}</b></div>`)}
    </div>`);
}
function modalSignings(r) {
  modal(`<div class="mhead"><div><h2>FA 계약</h2>
    <div class="meta">${r.signings.length}건</div></div>
    <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody">${r.signings.slice(0, 40).map(s => `<div class="row ${s.mine ? 'me' : ''}">
      <span>${esc(s.name)} <span class="sub">${s.age} ${s.slot}</span>
        ${s.moved ? '<span class="dim">→</span>' : ''} <b>${esc(short(s.team))}</b></span>
      <span class="m">${esc(s.text)}</span></div>`).join('')}</div>`);
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
  W:['whiff','헛'], F:['foul','파울'], X:['inplay','타구'] };

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
      <span class="pzt">${(PITCH[q.t] && PITCH[q.t].kr) || q.t}</span>
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

const PT_KR = { FF:'포심', SI:'투심', FC:'커터', SL:'슬라이더', CU:'커브',
                CH:'체인지업', FS:'포크', KN:'너클볼' };

function openReplay(box) {
  const P = box.plays || [];
  if (!P.length) return;
  let i = 0, timer = null, speed = 1;

  if (!gsState) openGameShell(box.away.team, box.home.team, box.park, box.crowd, box.cap);
  gsBody(`<div class="rp">
    <div id="rpLine"></div>
    <div class="rpbody">
      <div class="rpfield">${fieldSvg(box.park, capOf(box.home.team).color,
        box.crowd && box.cap ? box.crowd / box.cap : null)}
        ${box.crowd ? `<div class="rpcrowd">관중 <b class="m">${box.crowd.toLocaleString()}</b>
          <span>${Math.round(box.crowd / box.cap * 100)}%</span></div>` : ''}</div>
      <div class="rpside">
        <div class="rpmatch">
          <div class="rprow"><span>투수</span><b id="rpPit">—</b></div>
          <div class="rppitch" id="rpPitch">—</div>
          <div class="rprow bat"><span>타자</span><b id="rpBat">—</b></div>
        </div>
        <div class="rpstate">
          <svg class="dia" viewBox="0 0 60 60">
            <rect class="db" id="db2" x="24" y="4"  width="12" height="12" transform="rotate(45 30 10)"/>
            <rect class="db" id="db3" x="4"  y="24" width="12" height="12" transform="rotate(45 10 30)"/>
            <rect class="db" id="db1" x="44" y="24" width="12" height="12" transform="rotate(45 50 30)"/>
            <rect class="db home" x="24" y="44" width="12" height="12" transform="rotate(45 30 50)"/>
          </svg>
        </div>
        <div class="pzbox" id="rpZone"></div>
        <div class="rplog" id="rpLog"></div>
      </div>
    </div>
    <div class="rpbar">
      <button id="rpPrev" class="quiet">◀</button>
      <button id="rpPlay" class="go">재생</button>
      <button id="rpNext" class="quiet">▶</button>
      <span class="rpspd">${[1,2,4].map(s => `<button data-s="${s}" class="${s===1?'on':''}">×${s}</button>`).join('')}</span>
      <span class="rpn"><b id="rpI">0</b> / ${P.length}</span>
      <button id="rpEnd" class="quiet">결과만 보기</button>
    </div>
  </div>`);

  const $$ = (id) => document.getElementById(id);
  const log = $$('rpLog');

  function paint(p, animate) {
    const top = p.half === 'top';
    const zb = $$('rpZone');
    if (zb) zb.innerHTML = p.seq && p.seq.length
      ? zoneSvg(p.seq, p.zh || 1) + zoneList(p.seq)
      : '<div class="pzempty">투구 없음</div>';
    // 스코어보드는 껍데기가 들고 있다. ro 는 공격 팀 득점이라 갈라 넣는다.
    gsScore({ a: top ? p.ro : p.rd, h: top ? p.rd : p.ro,
              inn: p.inning, half: p.half, outs: p.outs, b: p.b, s: p.s, base: p.base });
    const ls = $$('rpLine');
    if (ls) ls.innerHTML = lineScore(box, p.inning, p.half);
    $$('rpPit').textContent = p.pitcher || '—';
    $$('rpBat').textContent = p.batter || '—';
    $$('rpPitch').innerHTML = p.pt
      ? `<b>${PT_KR[p.pt] || p.pt}</b>${p.velo ? `<span>${p.velo}<i>km/h</i></span>` : ''}` : '—';
    const bs = p.base || [null, null, null];
    for (let k = 0; k < 3; k++) {
      $$('db' + (k + 1)).classList.toggle('on', !!bs[k]);
      // 작은 마름모만으로는 상황이 안 읽힌다. 구장 위에도 주자를 세운다.
      const r = $$('rn' + (k + 1)); if (r) r.classList.toggle('on', !!bs[k]);
    }
    document.querySelectorAll('.fm').forEach(e =>
      e.classList.toggle('on', p.pos === e.dataset.pos));
    drawBall(p, animate);
    log.innerHTML = P.slice(0, i + 1).slice(-40).map((x, n, a) =>
      `<div class="rpl${n === a.length - 1 ? ' cur' : ''}">
        <span class="ri">${x.inning}${x.half === 'top' ? '초' : '말'}</span>
        <span class="rb">${esc(x.batter || '')}</span>
        <span class="rd">${esc(x.desc || '')}</span>
        ${x.runs ? `<em>+${x.runs}</em>` : ''}</div>`).join('');
    log.scrollTop = log.scrollHeight;
    $$('rpI').textContent = i + 1;
  }

  let raf = null;
  function drawBall(p, animate) {
    const ball = $$('ball'), trail = $$('trail');
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (p.ang === null || p.ang === undefined) {
      ball.setAttribute('opacity', 0); trail.setAttribute('d', ''); return;
    }
    const [x, y] = pt(p.ang, p.dep);
    const d = `M${HX} ${HY} L${x.toFixed(1)} ${y.toFixed(1)}`;
    trail.setAttribute('d', d);
    ball.setAttribute('opacity', 1);
    if (!animate) { ball.setAttribute('cx', x); ball.setAttribute('cy', y); return; }
    const dur = 420 / speed, t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 2);
      ball.setAttribute('cx', HX + (x - HX) * e);
      ball.setAttribute('cy', HY + (y - HY) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function go(n, animate = true) {
    i = Math.max(0, Math.min(P.length - 1, n));
    paint(P[i], animate);
    if (i >= P.length - 1) stop();
  }
  function tick() { if (i < P.length - 1) go(i + 1); }
  function start() {
    if (timer) return;
    if (i >= P.length - 1) i = -1;
    $$('rpPlay').textContent = '일시정지';
    tick();
    timer = setInterval(tick, 1150 / speed);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null; $$('rpPlay').textContent = '재생';
  }
  $$('rpPlay').onclick = () => (timer ? stop() : start());
  $$('rpPrev').onclick = () => { stop(); go(i - 1, false); };
  $$('rpNext').onclick = () => { stop(); go(i + 1); };
  $$('rpEnd').onclick = () => { stop(); gsResult(box); };
  document.querySelectorAll('.rpspd button').forEach(b => b.onclick = () => {
    speed = +b.dataset.s;
    document.querySelectorAll('.rpspd button').forEach(x => x.classList.toggle('on', x === b));
    if (timer) { stop(); start(); }
  });
  go(0, false);
  start();
}
