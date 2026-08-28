// UI. api.js 가 돌려주는 순수 데이터만 그린다.
// 모든 능력치는 하나의 20~80 눈금축 위에, 어디서나 같은 좌표로 놓인다.
import { Game } from './core/api.js';
import * as save from './save.js';

const KEY = 'dugout.save.v1';
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t);
  if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const short = (s) => String(s).split(' ')[0];

let G = null, tab = 'home', saveTimer = null, lastPhase = null;

/* ── 저장 ── */
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save.dump(G))); }
  catch { toast('저장 실패', '저장 공간이 부족하다', 'injury'); }
}
const autosave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400); };

/* ══ 눈금축 — 시그니처 ══
   실선 = 현재 추정 구간, 해칭 = 잠재력 구간. 20·35·50·65·80 눈금 위에 놓인다. */
const AXIS_KEY = '20 · 35 · 50 · 65 · 80';
const pos = (v) => (Math.max(20, Math.min(80, v)) - 20) / 60 * 100;
function axis(cur, pot) {
  const seg = (r, tag) => {
    const W = Math.max(2.5, pos(r.hi) - pos(r.lo));
    const L = Math.min(pos(r.lo), 100 - W);
    return `<${tag} style="left:${L}%;width:${W}%"></${tag}>`;
  };
  return `<span class="axrow"><span class="ax">${pot ? seg(pot, 'u') : ''}${seg(cur, 'i')}</span>`
    + `<span class="axnum">${Math.round(cur.lo)}–${Math.round(cur.hi)}</span></span>`;
}

/* ── 알림 ── */
function toast(label, text, kind = '') {
  const t = el('div', 'toast ' + kind, `<span class="lab">${esc(label)}</span>${esc(text)}`);
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4600);
}

/* ── 구단 정체성: 야구 모자 로고 ── */
const CITY_CODE = { 서울:'SE', 부산:'BS', 인천:'IC', 대구:'DG', 대전:'DJ', 광주:'GJ',
  울산:'US', 고양:'GY', 창원:'CW', 청주:'CJ', 천안:'CA', 전주:'JJ', 강릉:'GN', 제주:'JU' };
const NICK_COLOR = { 레이븐스:'#1d2b3d', 타이탄스:'#6d2c2c', 드래곤스:'#1f5c3a',
  파이러츠:'#26262b', 머스탱스:'#8a5a1e', 코메츠:'#27508c', 울브스:'#474d56',
  팰컨스:'#7c3c14', 바이슨:'#5a3a22', 스톰:'#3b3f6d', 레인저스:'#7c1f2c',
  포세이돈:'#136260', 샤크스:'#2a5f74', 아이언스:'#4a4136' };
const capOf = (name) => {
  const [city, nick] = name.split(' ');
  return { code: CITY_CODE[city] || city.slice(0,1), color: NICK_COLOR[nick] || '#3a3a3a' };
};
const cap = (name, size = 44) => {
  const c = capOf(name);
  return `<span class="cap" style="background:${c.color};width:${size}px;height:${size}px;
    font-size:${Math.round(size*0.34)}px">${c.code}</span>`;
};

/* ── 시작 화면 ── */
let bootGame = null, bootSel = 1;
function boot() {
  const seed = Math.floor(Math.random() * 1e9);
  bootGame = new Game({ userTeamId: 1, nTeams: 10, games: 144, seed }).prologue();
  const list = bootGame.teamList();
  bootSel = list[0].id;
  const wrap = $('#teamPick');
  wrap.innerHTML = '';
  list.forEach(t => {
    const d = bootGame.teamDossier(t.id);
    const b = el('button', 'trow');
    b.setAttribute('aria-pressed', String(t.id === bootSel));
    b.innerHTML = `${cap(d.name)}
      <span><span class="tname">${esc(d.nick)}<small>${esc(d.city)}</small></span>
        <span class="tnote">${esc(d.history ? d.history.tagline : d.note)}</span></span>
      <span class="tlast">지난 시즌<b>${d.last.rank}위 ${d.last.w}–${d.last.l}</b></span>
      <span class="diff" title="난이도 ${d.difficulty}/5">${
        [1,2,3,4,5].map(i => `<i class="${i <= d.difficulty ? 'on' : ''}"></i>`).join('')}</span>`;
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

function meter(label, rank, of, warn) {
  const pct = ((of - rank + 1) / of) * 100;
  return `<div class="meter ${warn ? 'warn' : ''}">
    <span class="top"><span>${label}</span><b>${rank}위</b></span>
    <span class="track"><i style="width:${pct}%"></i></span></div>`;
}

function drawDossier() {
  const d = bootGame.teamDossier(bootSel);
  const R = d.rank;
  const saved = localStorage.getItem(KEY);
  const player = (p) => `<div class="dplayer"><span>${esc(p.name)}
      <span class="sub">${p.age} ${p.slot}</span></span>${axis(p.ovr, p.pot)}</div>`;
  $('#dossier').innerHTML = `
    <div class="dhead">${cap(d.name, 52)}
      <h2>${esc(d.nick)}<small>${esc(d.city)} · 시장 규모 ${d.market}</small></h2></div>
    ${d.history ? `<p class="dhist"><b>${esc(d.history.tagline)}</b>
      <span>창단 ${d.history.founded} · 통산 ${esc(d.history.record)} (${d.history.pct})
      · 우승 ${d.history.titles}회${d.history.titles ? ` · 최근 ${d.history.lastTitle}` : ''}</span></p>` : ''}
    <p class="dnote">${esc(d.note)}</p>

    <div class="dgrid">
      ${meter('전력', R.strength, R.of)}
      ${meter('자금', R.budget, R.of)}
      ${meter('타선', R.batting, R.of)}
      ${meter('마운드', R.pitching, R.of)}
    </div>
    ${meter('유망주', R.farm, R.of)}

    <div class="dsec">
      <div class="lab">구단주</div>
      <div class="demand"><b>${esc(d.demand)}</b>
        <span class="sub">을(를) 요구한다</span></div>
      ${meter('인내심', Math.max(1, Math.round((100 - d.patience) / 100 * R.of)), R.of, d.patience < 35)}
    </div>

    <div class="dsec">
      <div class="lab">재정</div>
      <div class="kv"><span>운영 예산</span><b class="m">${d.budget}억</b></div>
      <div class="kv"><span>현재 연봉</span><b class="m">${d.payroll}억</b></div>
      <div class="kv"><span>여유 자금</span><b class="m ${d.room < 10 ? 'mark' : ''}">${d.room}억</b></div>
    </div>

    <div class="dsec">
      <div class="lab">핵심 선수</div>
      ${d.key.map(player).join('')}
    </div>
    <div class="dsec">
      <div class="lab">최고 유망주</div>
      ${d.prospect.map(player).join('')}
    </div>
    ${d.history && d.history.legend ? `<div class="dsec">
      <div class="lab">프랜차이즈 레전드</div>
      <div class="legend"><span class="lnum">${d.history.legend.number}</span>
        <span><b>${esc(d.history.legend.name)}</b>
          <span class="sub">${d.history.legend.pos} · ${d.history.legend.from}–${d.history.legend.to}</span>
          <span class="sub">${esc(d.history.legend.line)}</span></span></div>
    </div>` : ''}

    <div class="dstart">
      <button id="btnNew" class="primary">${esc(d.nick)}의 단장이 된다</button>
      ${saved ? '<button id="btnResume" class="quiet">이어하기</button>' : ''}
      <p>선택과 진행은 자동 저장되며 이전 상태로 돌아갈 수 없습니다.</p>
    </div>`;
  $('#btnNew').onclick = () => { bootGame.userId = bootSel; G = bootGame; start(); };
  if ($('#btnResume')) $('#btnResume').onclick = () => {
    try { G = save.load(JSON.parse(saved)); start(); }
    catch (e) { localStorage.removeItem(KEY); toast('불러오기 실패', '새 게임으로 시작하세요', 'injury');
      drawDossier(); }
  };
}

function start() { $('#boot').hidden = true; $('#app').hidden = false; persist(); render(); }

/* ── 상단 ── */
const TABS = [['home','홈'],['team','팀'],['league','리그'],['front','프런트'],['history','역사']];
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
    case 'off_fa': btn('시장 마감', () => { if (confirm('FA 시장을 마감한다. 되돌릴 수 없다.'))
        act(() => modalSignings(G.resolveFA())); }, 'danger'); break;
    case 'off_trade': btn('트레이드 마감', () => act(() => G.resolveTrades()), 'danger'); break;
  }
  const tb = $('#tabs'); tb.innerHTML = '';
  TABS.forEach(([k, label]) => {
    const b = el('button', '', label);
    if (k === tab) b.setAttribute('aria-current', 'page');
    b.onclick = () => { tab = k; render(); }; tb.appendChild(b);
  });
}
function act(fn) { const r = fn(); autosave(); render(); return r; }
function report(r) {
  if (r && r.games) for (const g of r.games.slice(-2)) toast(g.result, `${g.score}  ${short(g.opponent)}`);
  for (const n of G.state().notices) toast(n.kind === 'injury' ? '부상' : '', n.text, n.kind);
}

/* ── 뼈대 ── */
function render() {
  renderTop();
  const v = $('#view'); v.innerHTML = '';
  ({ home:viewHome, team:viewTeam, league:viewLeague, front:viewFront, history:viewHistory }[tab])(v);
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
  t.appendChild(tb); return t;
}
const nameCell = (p) => `<span class="name">${esc(p.name)}</span>`
  + (p.injury_days ? `<span class="tag inj">✚${p.injury_days}</span>` : '');

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
  const two2 = el('div', 'grid g2');
  two2.appendChild(sect('최근 경기', '', rec.length
    ? rec.slice().reverse().map(r => `<div class="row">
        <span><span class="res ${r.result === '승' ? 'w' : r.result === '무' ? 'd' : 'l'}">${r.result}</span>
          ${r.home ? '' : '@'} ${esc(short(r.opponent))}</span>
        <span class="m">${r.score}</span></div>`).join('')
    : '<div class="empty">—</div>'));
  two2.appendChild(sect(day.rows.length ? `${day.day}일차 리그 결과` : '리그 결과', '',
    day.rows.length ? day.rows.map(r => `<div class="row ${r.user ? 'me' : ''}">
        <span>${esc(short(r.away))} <span class="dim">@</span> ${esc(short(r.home))}</span>
        <span class="m">${r.ar}<span class="dim">:</span>${r.hr}</span></div>`).join('')
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
    : '<div class="empty">없음</div>'));

  const sch = G.schedule(6).rows;
  if (sch.length) right.appendChild(sect('다음 경기', '', sch.map(r =>
    `<div class="row"><span class="m dim">${r.day}일</span>
     <span>${r.is_home ? '' : '@'} ${esc(short(r.opponent))}</span></div>`).join('')));

  right.appendChild(sect('구단', '', `
    <div class="kv"><span>연봉</span><b class="m">${ros.payroll}억</b></div>
    <div class="kv"><span>예산</span><b class="m">${ros.budget}억</b></div>`));

  g.appendChild(left); g.appendChild(right); v.appendChild(g);
  v.querySelectorAll('[data-pid]').forEach(r => r.onclick = () => openPlayer(+r.dataset.pid));
}

/* ── 팀 ── */
function statCell(p) {
  const s = p.stat || {};
  if (p.kind === 'B') return s.pa ? `<span class="m">${s.avg}<span class="dim"> · </span>${s.hr}HR<span class="dim"> · </span>${s.rbi}</span>` : '<span class="dim">—</span>';
  return s.g ? `<span class="m">${s.ip}<span class="dim"> · </span>${s.era}<span class="dim"> · </span>${s.k}K</span>` : '<span class="dim">—</span>';
}
function viewTeam(v) {
  const r = G.roster();
  const inSeason = ['regular','postseason'].includes(G.state().phase);
  const g = el('div', 'grid');
  const block = (title, list, stat) => {
    if (!list.length) return;
    g.appendChild(sect(title, `${list.length} · ${AXIS_KEY}`, table(
      ['선수','','나이','능력 / 잠재력', stat ? '성적' : '계약'],
      list.map(p => ({ p, cells: [nameCell(p), `<span class="m dim">${p.slot}</span>`,
        `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot),
        stat ? statCell(p) : (p.contract ? `<span class="m dim">${p.contract.text}</span>` : '<span class="dim">—</span>')] })),
      (row) => openPlayer(row.p.pid))));
  };
  block('라인업', r.lineup, inSeason);
  block('선발', r.rotation, inSeason);
  block('불펜', r.bullpen, inSeason);
  block('벤치', r.bench, false);
  block('부상자', r.injured, false);
  const farm = G.farm().rows;
  g.appendChild(sect('2군', `${farm.length} · ${AXIS_KEY}`, table(
    ['선수','','나이','능력 / 잠재력','확신도'],
    farm.map(p => ({ p, cells: [nameCell(p), `<span class="m dim">${p.slot}</span>`,
      `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot),
      `<span class="m dim">${p.confidence}%</span>`] })),
    (row) => openPlayer(row.p.pid))));
  v.appendChild(g);
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
  if (s === 'off_fa') return viewFA(v);
  if (s === 'off_draft') return viewDraft(v);
  if (s === 'off_trade') return viewTrade(v);
  const f = G.finances();
  const g = el('div', 'grid g21');
  g.appendChild(sect('연봉', `${f.contracts.length}`, table(['선수','나이','연봉','계약','만료'],
    f.contracts.map(x => ({ pid: x.pid, cells: [`<span class="name">${esc(x.name)}</span>`,
      `<span class="m">${x.age}</span>`, `<span class="m">${x.salary}</span>`,
      `<span class="m dim">${x.text}</span>`, `<span class="m dim">${x.end_year}</span>`] })),
    (row) => openPlayer(row.pid))));
  const al = G.contractAlerts().rows;
  const right = el('div', 'grid');
  right.appendChild(sect('재정', '', `
    <div class="kv"><span>시장</span><b class="m">${f.market_size}</b></div>
    <div class="kv"><span>수입</span><b class="m">${f.revenue}억</b></div>
    <div class="kv"><span>예산</span><b class="m">${f.budget}억</b></div>
    <div class="kv"><span>연봉</span><b class="m">${f.payroll}억</b></div>
    <div class="kv"><span>여력</span><b class="m ${f.room < 0 ? 'mark' : ''}">${f.room}억</b></div>`));
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
  const h = G.history(60), rec = G.records(10);
  const g = el('div', 'grid g21');
  g.appendChild(sect('연혁', '', h.rows.length ? h.rows.slice().reverse().map(r =>
    `<div class="row"><span class="m dim">${r.year}</span><span>${esc(r.text)}</span></div>`).join('')
    : '<div class="empty">—</div>'));
  const right = el('div', 'grid');
  right.appendChild(sect('우승', `${h.champions.length}`, h.champions.length
    ? h.champions.slice().reverse().map(c =>
      `<div class="row"><span class="m dim">${c.year}</span><b>${esc(c.team)}</b></div>`).join('')
    : '<div class="empty">—</div>'));
  const box = (t, rows) => sect(t, '', rows.length ? rows.map((r, i) =>
    `<div class="row"><span><span class="m dim">${i+1}</span>
      ${r.active ? '<span class="dot">●</span> ' : ''}${esc(r.name)}</span>
     <b class="m">${r.value}</b></div>`).join('') : '<div class="empty">—</div>');
  right.appendChild(box('통산 홈런', rec.hr));
  right.appendChild(box('통산 WAR', rec.war));
  const fr = G.teamList().map(t => G.teamDossier(t.id))
    .filter(d => d.history).sort((a,b) => b.history.titles - a.history.titles);
  g.appendChild(sect('구단 연혁', '', table(['구단','창단','통산','승률','우승','최근'],
    fr.map(d => ({ team_id: d.id, cells: [
      `<span class="name">${esc(d.name)}</span>`,
      `<span class="m dim">${d.history.founded}</span>`,
      `<span class="m">${esc(d.history.record)}</span>`,
      `<span class="m">${d.history.pct}</span>`,
      `<span class="m">${d.history.titles}</span>`,
      `<span class="m dim">${d.history.lastTitle ?? '—'}</span>`] })),
    (row) => openTeam(row.team_id))));
  g.appendChild(right); v.appendChild(g);
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
  movement:'무브먼트', stamina:'체력' };

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
          <div class="kv"><span>확신도</span><b class="m">${p.confidence}%</b></div>
          <div class="kv"><span>계약</span><b class="m">${p.contract ? p.contract.text : '—'}</b></div>
          <div class="kv"><span>연봉</span><b class="m">${p.contract ? p.contract.salary + '억' : '—'}</b></div>
          <div class="kv"><span>서비스</span><b class="m">${p.service}</b></div>
          <div class="kv"><span>통산 WAR</span><b class="m">${p.career_war ?? '—'}</b></div>
          <div class="kv"><span>부상</span><b class="m">${p.injuries.count} · ${p.injuries.days}일</b></div>
          <div style="margin-top:16px" class="report">${esc(p.comment)}</div>
        </div>
      </div>
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
