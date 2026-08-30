// UI. api.js 가 돌려주는 순수 데이터만 그린다.
// 모든 능력치는 하나의 20~80 눈금축 위에, 어디서나 같은 좌표로 놓인다.
import { Game } from './core/api.js';
import { josa } from './core/mail.js';
import * as save from './save.js';
import * as BIP from './core/bip.js';

const KEY = 'dugout.save.v1';
const $ = (s, r = document) => r.querySelector(s);
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
const capOf = (name) => { const f = franchiseOf(name); return { code: f.code, color: f.color }; };
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
  const h = ((p.pid || 0) * 2654435761) >>> 0;
  const skin = SKIN[h % 4];
  const hair = (h >> 3) % 5;      // 0 짧음 1 옆머리 2 덥수룩 3 삭발 4 장발
  const beard = (h >> 7) % 4;     // 0,1 없음 2 콧수염 3 턱수염
  const hc = HAIRC[(h >> 11) % 3];
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

const cap = (name, size = 44) => {
  const c = capOf(name);
  return `<span class="cap" style="background:${c.color};width:${size}px;height:${size}px;
    font-size:${Math.round(size * 0.34)}px">${c.code}</span>`;
};

/* ── 시작 화면 ── */
let bootGame = null, bootSel = 1;

async function boot() {
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
  const node = (name, score, win, cls = '') => name
    ? `<div class="bn ${win ? 'win' : ''} ${cls}" style="--tc:${capOf(name).color}">
        ${rank.has(name) ? `<i>${rank.get(name)}</i>` : '<i class="off">·</i>'}
        <span>${esc(short(name))}</span>
        ${score !== null ? `<b>${score}</b>` : ''}</div>`
    : '<div class="bn empty"></div>';
  const seedOf = (n) => rank.get(n) ?? 99;
  const wc = R[0], sp = R[1], pl = R[2], ks = R[3];
  const lo5 = seedOf(wc.higher) > seedOf(wc.lower) ? wc.higher : wc.lower;
  const hi4 = lo5 === wc.higher ? wc.lower : wc.higher;

  box.innerHTML = `<div class="lab">${ps.year} 포스트시즌</div>
    <div class="bracket-grid">
      <div class="bcol">
        <span class="bhd">와일드카드</span>
        ${node(hi4, null, wc.winner === hi4)}
        ${node(lo5, null, wc.winner === lo5)}
      </div>
      <div class="bcol c2">
        <span class="bhd">준PO</span>
        ${node(sp.higher, null, sp.winner === sp.higher)}
        ${node(wc.winner, wc.w + '–' + wc.l, sp.winner === wc.winner, 'adv')}
      </div>
      <div class="bcol c3">
        <span class="bhd">PO</span>
        ${node(pl.higher, null, pl.winner === pl.higher)}
        ${node(sp.winner, sp.w + '–' + sp.l, pl.winner === sp.winner, 'adv')}
      </div>
      <div class="bcol c4">
        <span class="bhd">한국시리즈</span>
        ${node(ks.higher, null, ks.winner === ks.higher)}
        ${node(pl.winner, pl.w + '–' + pl.l, ks.winner === pl.winner, 'adv')}
      </div>
      <div class="bcol c5">
        <span class="bhd">우승</span>
        <div class="bchamp" style="--tc:${capOf(ks.winner).color}">
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
      <button id="btnNew" class="primary">${esc(josa(d.name, '으로'))} 시작</button>
      ${saved ? '<button id="btnResume" class="quiet">이어하기</button>' : ''}
    </div>`;
  const mapBox = $('#kmap');
  if (mapBox) mapBox.innerHTML = drawMap(bootGame.teamList().map(t => t.name), d.name);
  $('#dossier').style.setProperty('--tc', col);
  document.querySelector('.boot-main').style.setProperty('--tc', col);
  $('#btnNew').onclick = () => { bootGame.userId = bootSel; G = bootGame; start(); };
  if ($('#btnResume')) $('#btnResume').onclick = () => {
    try { G = save.load(JSON.parse(saved)); start(); }
    catch (e) { localStorage.removeItem(KEY); toast('불러오기 실패', '새 게임으로 시작하세요', 'injury');
      drawDossier(); }
  };
}

function start() { $('#boot').hidden = true; $('#app').hidden = false; persist(); render(); }

/* ── 상단 ── */
const TABS = [['inbox','받은 편지함'],['home','홈'],['team','팀'],['league','리그'],['front','프런트'],['history','역사']];
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
      btn('다음 날', () => act(() => report(G.advance(1))), 'primary');
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
    case 'off_fa': btn('시장 마감', () => { if (confirm('FA 시장을 마감한다. 되돌릴 수 없다.'))
        act(() => modalSignings(G.resolveFA())); }, 'danger'); break;
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
function report(r) {
  if (r && r.games) {
    for (const g of r.games.slice(-2))
      toast(g.result, g.result === '우천취소' ? short(g.opponent) : `${g.score}  ${short(g.opponent)}`);
    const last = r.games.filter(g => g.box).pop();
    if (last) lastBox = last.box;              // 방금 끝난 내 팀 경기. 다시 볼 수 있다.
  }
  const s = G.state();
  for (const n of s.notices) toast(n.kind === 'injury' ? '부상' : '', n.text, n.kind);
  if (s.new_important > 0) tab = 'inbox';        // 사건이 있으면 편지함으로
}

/* ── 뼈대 ── */
function render() {
  renderTop();
  const v = $('#view'); v.innerHTML = '';
  ({ inbox:viewInbox, home:viewHome, team:viewTeam, league:viewLeague,
     front:viewFront, history:viewHistory }[tab])(v);
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

function viewHome(v) {
  const s = G.state();
  const st = G.standings().rows;
  const me = st.find(r => r.is_user);
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
  if (table_st.length) right.appendChild(sect(stTitle, '', table(['팀','W','L','PCT','GB'],
    table_st.map(r => ({ _cls: r.is_user ? 'me' : '', team_id: r.team_id, cells: [
      (r.playoff ? '<span class="mark">★</span> ' : '　') + esc(short(r.team)),
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
  const mine = fa.rows.filter(r => r.offer);
  const spend = mine.reduce((s, r) => s + r.offer[1], 0);
  const g = el('div', 'grid g21');
  g.appendChild(sect('FA 시장', `${fa.rows.length} · ${AXIS_KEY}`, table(
    ['선수','','나이','능력','요구','예상 낙찰','내 오퍼'],
    fa.rows.map(p => ({ p, cells: [nameCell(p), `<span class="m dim">${p.slot}</span>`,
      `<span class="m">${p.age}</span>`, axis(p.ovr),
      `<span class="m">${p.ask.years}×${p.ask.aav}</span>`,
      `<span class="m dim">${p.est.low}–${p.est.high}</span>`,
      p.offer ? `<b class="m mark">${p.offer[0]}×${p.offer[1].toFixed(1)}</b>` : '<span class="dim">—</span>'] })),
    (row) => openOffer(row.p))));
  g.appendChild(sect('내 오퍼', `${mine.length}`, `
    <div class="kv"><span>여력</span><b class="m">${fa.room}억</b></div>
    <div class="kv"><span>오퍼 합계</span><b class="m ${spend > fa.room ? 'mark' : ''}">${spend.toFixed(1)}억</b></div>
    <div style="margin-top:14px">${mine.length ? mine.map(r =>
      `<div class="row"><span>${esc(r.name)}</span>
       <b class="m">${r.offer[0]}년 ${(r.offer[0] * r.offer[1]).toFixed(1)}억</b></div>`).join('')
      : '<div class="empty">—</div>'}</div>`));
  v.appendChild(g);
}

function openOffer(p) {
  modal(`
    <div class="mhead"><div><h2>${esc(p.name)}</h2>
      <div class="meta">${p.age} · ${p.slot} · ${esc(p.former_team)}</div></div>
      <button id="mx" class="quiet">닫기</button></div>
    <div class="mbody stack">
      <div>
        <div class="kv"><span>능력</span>${axis(p.ovr)}</div>
        <div class="kv"><span>요구</span><b class="m">${p.ask.years}년 · 연 ${p.ask.aav}억</b></div>
        <div class="kv"><span>예상 낙찰</span><b class="m dim">연 ${p.est.low}–${p.est.high}억</b></div>
      </div>
      <div>
        <div class="lab" style="margin-bottom:10px">오퍼</div>
        <div style="display:flex;gap:20px;align-items:baseline;flex-wrap:wrap">
          <label class="lab">기간 <input id="oy" type="number" min="1" max="6" value="${p.ask.years}"></label>
          <label class="lab">연평균 <input id="oa" type="number" min="0.3" step="0.5" value="${p.est.high}"></label>
          <button id="ok" class="primary">등록</button>
          ${p.offer ? '<button id="del" class="quiet">취소</button>' : ''}
        </div>
      </div>
    </div>`);
  $('#ok').onclick = () => { G.offer(p.pid, +$('#oy').value, +$('#oa').value); closeModal(); autosave(); render(); };
  if ($('#del')) $('#del').onclick = () => { G.cancelOffer(p.pid); closeModal(); autosave(); render(); };
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
function modal(html) {
  $('#modalBody').innerHTML = html; $('#modal').hidden = false;
  const x = $('#mx'); if (x) x.onclick = closeModal;
  $('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
  document.onkeydown = (e) => { if (e.key === 'Escape') closeModal(); };
}
function closeModal() { $('#modal').hidden = true; document.onkeydown = null; }

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
  modal(`
    <div class="mhead"><div><h2>${esc(p.name)}${awards}</h2>
      <div class="meta">${p.age} · ${p.slot} · ${p.hand}${p.kind === 'P' ? 'T' : 'B'}
        ${p.origin ? ' · ' + p.origin : ''}${p.draft ? ` · #${p.draft.overall}` : ''}
        ${p.mil && p.mil.s !== 'done' ? ` · <span class="milt ${p.mil.s}">${p.mil.s === 'serving'
          ? `${p.mil.kind === 'sangmu' ? '상무' : '현역'} ${p.mil.left}년`
          : p.mil.s === 'exempt' ? '병역 면제'
          : p.mil.due === 0 ? '올겨울 입대' : `미필 · ${p.mil.due}년`}</span>` : ''}
        ${p.injury_days ? ` · <span class="mark">✚${p.injury_days}</span>` : ''}</div></div>
      <button id="mx" class="quiet">닫기</button></div>
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

function fieldSvg(park, color = '#4c8ed9') {
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

  return `<svg class="field ${dims.turf ? 'turf' : ''}" viewBox="0 0 ${FW} ${FH}"
      style="--pc:${color}">
    <path class="stands" d="${stands}"/>
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

  modal(`<div class="rp">
    <div class="rphead">
      <div class="rpteams">
        <span class="rpt">${jersey(franchiseOf(box.away.team), true, 34)}
          <b id="rpAwayN">${esc(short(box.away.team))}</b><em id="rpAwayR">0</em></span>
        <span class="rpt">${jersey(franchiseOf(box.home.team), false, 34)}
          <b id="rpHomeN">${esc(short(box.home.team))}</b><em id="rpHomeR">0</em></span>
      </div>
      <div class="rpinn" id="rpInn">1회초</div>
      <button id="mx" class="quiet">닫기</button>
    </div>
    <div class="rpbody">
      <div class="rpfield">${fieldSvg(box.park, capOf(box.home.team).color)}</div>
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
          <div class="cnt">
            <div><span>B</span><i id="cb0"></i><i id="cb1"></i><i id="cb2"></i></div>
            <div><span>S</span><i id="cs0"></i><i id="cs1"></i></div>
            <div class="o"><span>O</span><i id="co0"></i><i id="co1"></i></div>
          </div>
        </div>
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
    $$('rpInn').textContent = `${p.inning}회${top ? '초' : '말'}`;
    // ro는 공격 팀 득점이다. 어느 쪽이 공격인지에 따라 갈라 넣는다.
    $$('rpAwayR').textContent = top ? p.ro : p.rd;
    $$('rpHomeR').textContent = top ? p.rd : p.ro;
    $$('rpPit').textContent = p.pitcher || '—';
    $$('rpBat').textContent = p.batter || '—';
    $$('rpPitch').innerHTML = p.pt
      ? `<b>${PT_KR[p.pt] || p.pt}</b>${p.velo ? `<span>${p.velo}<i>km/h</i></span>` : ''}` : '—';
    for (let k = 0; k < 3; k++)
      $$('cb' + k).classList.toggle('on', (p.b ?? 0) > k);
    for (let k = 0; k < 2; k++)
      $$('cs' + k).classList.toggle('on', (p.s ?? 0) > k);
    for (let k = 0; k < 2; k++)
      $$('co' + k).classList.toggle('on', (p.outs ?? 0) > k);
    const bs = p.base || [null, null, null];
    for (let k = 0; k < 3; k++) $$('db' + (k + 1)).classList.toggle('on', !!bs[k]);
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
  $$('rpEnd').onclick = () => { stop(); go(P.length - 1, false); };
  document.querySelectorAll('.rpspd button').forEach(b => b.onclick = () => {
    speed = +b.dataset.s;
    document.querySelectorAll('.rpspd button').forEach(x => x.classList.toggle('on', x === b));
    if (timer) { stop(); start(); }
  });
  go(0, false);
  start();
}
