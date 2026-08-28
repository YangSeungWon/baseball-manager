// UI. api.js 가 돌려주는 순수 데이터만 그린다.
// 모든 능력치는 하나의 20~80 눈금축 위에, 어디서나 같은 좌표로 놓인다.
import { Game } from './core/api.js';
import { josa } from './core/mail.js';
import * as save from './save.js';

const KEY = 'dugout.save.v1';
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t);
  if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const short = (s) => String(s).split(' ')[0];
// 순위 색: 상위 30% 강점(그린), 하위 30% 약점(레드), 나머지 기본
const rkCls = (r, of) => r <= Math.ceil(of * 0.3) ? 'r1' : (r >= Math.floor(of * 0.7) + 1 ? 'r3' : '');
const rkNum = (r, of) => `<b class="m ${rkCls(r, of)}">${r}위</b>`;

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
function axis(cur, pot, size = '') {
  const seg = (r, tag) => {
    const W = Math.max(2.5, pos(r.hi) - pos(r.lo));
    const L = Math.min(pos(r.lo), 100 - W);
    return `<${tag} style="left:${L}%;width:${W}%"></${tag}>`;
  };
  return `<span class="axrow"><span class="ax ${size}">${pot ? seg(pot, 'u') : ''}${seg(cur, 'i')}</span>`
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
// 팀 고유색. 어두운 배경 위에서 읽히도록 조금 올렸다.
// 팀 고유색. 어두운 배경 위에서 읽히도록 명도를 올렸다.
const NICK_COLOR = { 울브스:'#5c646f', 팰컨스:'#9a4d1c', 샤크스:'#35748c',
  재규어스:'#a07a24', 코브라스:'#6d7a2c', 레이븐스:'#2c3f57',
  타이탄스:'#8a3a38', 드래곤스:'#2a7150', 피닉스:'#b04a26',
  썬더스:'#4a54a0', 타이푼스:'#1c7a75',
  스타즈:'#8a6d1c', 킹스:'#6a4a8a', 나이츠:'#3a4a5c' };
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
    const col = capOf(d.name).color;
    const b = el('button', 'trow');
    b.style.setProperty('--tc', col);
    b.setAttribute('aria-pressed', String(t.id === bootSel));
    // 유형 배지는 특별한 팀에만. 전부 배지면 배지가 아니라 장식이다.
    const hot = ['디펜딩 챔피언', '우승 청부', '몰락한 명가', '벼랑 끝', '팜이 무기']
      .includes(d.archetype);
    b.innerHTML = `${cap(d.name, 46)}
      <span><span class="tname">${esc(d.name)}
          <small>${esc(d.history ? d.history.tagline : d.note)}</small></span>
        <span class="tarch ${hot ? 'hot' : ''}">${esc(d.archetype)}</span></span>
      <span class="tlast"><span class="rank">${d.last.rank}<i class="off">위</i></span>
        <span class="rec">${d.last.w}–${d.last.l}</span>
        <span class="dl d${d.difficulty}">난이도 ${esc(d.difficultyLabel)}</span></span>`;
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

function drawDossier() {
  const d = bootGame.teamDossier(bootSel);
  const col = capOf(d.name).color;
  const saved = localStorage.getItem(KEY);
  const c = d.contrast;
  const H = d.history;

  const scoutRow = (p) => `<div class="sp-row">
      <span class="sp-top">
        <span class="sp-name">${esc(p.name)}<span>${p.age}세 · ${p.slot}</span></span>
        <span class="sp-num"><b>${p.ovr.lo}–${p.ovr.hi}</b>
          <span class="off">/ ${p.pot.lo}–${p.pot.hi}</span></span>
      </span>${axis(p.ovr, p.pot, 'big')}</div>`;

  const pay = d.payrollRatio;
  const payCls = pay > 100 ? 'over' : pay > 90 ? 'tight' : '';

  $('#dossier').innerHTML = `
    <div class="dtop">
      <div class="dhead">${cap(d.name, 54)}
        <h2>${esc(d.name)}<small>${esc(d.city)} · 시장 규모 ${d.market}
          ${H ? ` · 창단 ${H.founded}` : ''}</small></h2></div>
      <p class="headline">${esc(d.headline)}</p>
      <div class="dchips">
        <span class="chip tc">${esc(d.archetype)}</span>
        <span class="chip d${d.difficulty}">난이도 ${esc(d.difficultyLabel)}</span>
        <span class="chip">지난 시즌 ${d.last.rank}위</span>
        ${H && H.titles ? `<span class="chip">우승 ${H.titles}회</span>` : ''}
      </div>
    </div>

    <div class="dbody">
      <div class="dsec">
        <div class="contrast">
          <div class="cbox s"><div class="ctitle">강점</div>
            ${c.strong.length ? c.strong.map(x =>
              `<div class="citem"><span>${x.k}</span><b>${x.r}위</b></div>`).join('')
              : '<div class="cnone">두드러진 강점 없음</div>'}</div>
          <div class="cbox w"><div class="ctitle">약점</div>
            ${c.weak.length ? c.weak.map(x =>
              `<div class="citem"><span>${x.k}</span><b>${x.r}위</b></div>`).join('')
              : '<div class="cnone">치명적 약점 없음</div>'}</div>
        </div>
        ${c.mid.length ? `<div class="cmid">${c.mid.map(x =>
          `<span>${x.k}<b>${x.r}위</b></span>`).join('')}</div>` : ''}
      </div>

      <div class="dsec">
        <div class="lab">핵심 선수 — 스카우트가 본 범위</div>
        <div class="scout">
          <div class="scoutkey">${AXIS_KEY.split(' · ').map(x => `<span>${x}</span>`).join('')}</div>
          ${d.key.map(scoutRow).join('')}
          ${d.prospect.length ? d.prospect.map(scoutRow).join('') : ''}
          <div class="axlegend"><span><b class="cur"></b>추정 능력</span>
            <span><b class="pot"></b>잠재력 — 아직 확인되지 않음</span></div>
        </div>
      </div>

      <div class="dsec">
        <div class="lab">재정</div>
        <div class="payline"><span>연봉 소진율</span><b>${pay}%</b></div>
        <div class="paybar ${payCls}"><i style="width:${Math.min(100, pay)}%"></i></div>
        <div class="paysub"><span>연봉 ${d.payroll}억</span><span>예산 ${d.budget}억</span></div>
      </div>

      <div class="dsec">
        <div class="lab">구단주</div>
        <div class="owner ${d.ownerLine.urgent ? 'urgent' : ''}">
          <span class="odemand">${esc(d.ownerLine.demand)}</span>
          <span class="otemper">${esc(d.ownerLine.temper)}</span>
          <span class="oask">“${esc(d.ownerLine.ask)}”</span></div>
      </div>

      ${H ? `<div class="dsec">
        <div class="lab">연혁</div>
        <p class="dhist">통산 ${esc(H.record)} · 승률 ${H.pct} · 우승 ${H.titles}회${
          H.lastTitle ? ` (최근 ${H.lastTitle})` : ''}</p>
        ${H.legend ? `<div class="legend" style="margin-top:8px">
          <span class="lnum">${H.legend.number}</span>
          <span><b>${esc(H.legend.name)}</b>
            <span class="sub">${H.legend.from}–${H.legend.to} · ${esc(H.legend.line)}</span></span>
        </div>` : ''}</div>` : ''}

      <div class="dstart">
        <button id="btnNew" class="primary">${esc(josa(d.name, '으로'))} 시작</button>
        ${saved ? '<button id="btnResume" class="quiet">이어하기</button>' : ''}
        <p>자동 저장 · 되돌리기 없음</p>
      </div>
    </div>`;
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
  if (r && r.games) for (const g of r.games.slice(-2)) toast(g.result, `${g.score}  ${short(g.opponent)}`);
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
  t.appendChild(tb); return t;
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
  const c = [nameCell(p), `<span class="m dim">${p.slot}</span>`,
             `<span class="m">${p.age}</span>`, axis(p.ovr, p.pot)];
  if (live) c.push(`<span class="m">${s.g ?? 0}</span>`, `<span class="m">${s.pa ?? 0}</span>`,
    `<span class="m">${s.avg ?? '—'}</span>`, `<span class="m">${s.ops ?? '—'}</span>`,
    `<span class="m">${s.hr ?? 0}</span>`, `<span class="m">${s.rbi ?? 0}</span>`,
    `<span class="m">${s.sb ?? 0}</span>`);
  c.push(p.contract ? `<span class="m dim">${p.contract.text}</span>` : '<span class="dim">—</span>');
  return { p, cells: c };
}
function pitRow(p, live) {
  const s = p.stat || {};
  const c = [nameCell(p), `<span class="m dim">${p.slot}</span>`,
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
const PIT_HEAD = (live) => ['선수','P','나이','능력 / 잠재력',
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
        </tbody></table></div>` : ''}
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
