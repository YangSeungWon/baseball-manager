// UI. api.js 가 돌려주는 순수 데이터만 그린다. 엔진을 직접 만지지 않는다.
import { Game, PHASE_LABEL } from './core/api.js';
import * as save from './save.js';

const KEY = 'dugout.save.v1';
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag);
  if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let G = null, tab = 'home', autosaveTimer = null, lastPhase = null;

/* ---------- 저장 ---------- */
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save.dump(G))); }
  catch (e) { console.warn('저장 실패', e); toast('저장 공간이 부족합니다', 'injury'); }
}
const autosave = () => { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(persist, 400); };
function hasSave() { return !!localStorage.getItem(KEY); }

/* ---------- 능력 막대: 이 게임의 시각 언어 ---------- */
function bar(range, cls = '') {
  const lo = Math.max(20, range.lo), hi = Math.min(80, range.hi);
  const L = (lo - 20) / 60 * 100, W = Math.max(3, (hi - lo) / 60 * 100);
  return `<span class="barwrap"><span class="bar ${cls}"><i style="left:${L}%;width:${W}%"></i></span>`
    + `<span class="barnum">${Math.round(lo)}~${Math.round(hi)}</span></span>`;
}
const conf = (c) => `<span class="dim num" title="스카우팅 확신도">${c}%</span>`;

/* ---------- 토스트 ---------- */
function toast(text, kind = 'info') {
  const t = el('div', 'toast ' + kind, esc(text));
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s';
    setTimeout(() => t.remove(), 400); }, 4200);
}

/* ---------- 부트 ---------- */
function boot() {
  const wrap = $('#teamPick');
  let sel = 1;
  const seed = Math.floor(Math.random() * 1e9);
  // 리그를 한 번만 생성해 두고, 그대로 새 게임에 재사용한다
  let preview = new Game({ userTeamId: 1, seed });
  const list = preview.teamList();
  wrap.innerHTML = '';
  list.forEach(t => {
    const b = el('button', 'tcard' + (t.id === sel ? ' sel' : ''),
      `<b>${esc(t.name)}</b><small>시장 규모 ${t.market.toFixed(2)}</small>`);
    b.onclick = () => { sel = t.id; [...wrap.children].forEach(c => c.classList.remove('sel'));
      b.classList.add('sel'); };
    wrap.appendChild(b);
  });
  $('#btnNew').onclick = () => { preview.userId = sel; G = preview; start(); };
  if (hasSave()) {
    const r = $('#btnResume'); r.hidden = false;
    r.onclick = () => {
      try { G = save.load(JSON.parse(localStorage.getItem(KEY))); start(); }
      catch (e) { alert('세이브를 불러올 수 없습니다: ' + e.message); }
    };
  }
}
function start() { $('#boot').hidden = true; $('#app').hidden = false; persist(); render(); }

/* ---------- 상단바 / 탭 ---------- */
const TABS = [['home','홈'],['team','팀'],['league','리그'],['front','프런트'],['history','역사']];

function renderTop() {
  const s = G.state();
  // 단계가 바뀐 첫 렌더에서만 해당 화면으로 데려간다 (그 뒤엔 자유롭게 이동 가능)
  if (s.phase !== lastPhase) {
    if (s.phase === 'off_fa' || s.phase === 'off_draft' || s.phase === 'off_trade') tab = 'front';
    else if (s.phase === 'regular' || s.phase === 'preseason') tab = 'home';
    lastPhase = s.phase;
  }
  $('#tbYear').textContent = s.year;
  $('#tbPhase').textContent = s.phase_label;
  $('#tbProgress').textContent = s.phase === 'regular' ? `${s.day} / ${s.total_days}일` : '';
  $('#tbTeam').textContent = s.user_team.name;
  $('#tbMode').textContent = s.mode || '';
  const a = $('#tbActions'); a.innerHTML = '';
  const btn = (label, fn, cls = '') => { const b = el('button', cls, label); b.onclick = fn; a.appendChild(b); };
  switch (s.phase) {
    case 'preseason':
      btn('시즌 시작', () => act(() => G.startSeason()), 'primary'); break;
    case 'regular':
      btn('다음 날', () => act(() => showGames(G.advance(1))), 'primary');
      btn('7일', () => act(() => showGames(G.advance(7))));
      btn('시즌 끝까지', () => act(() => showGames(G.simToEnd())));
      break;
    case 'postseason':
      btn('포스트시즌 진행', () => act(() => { const r = G.runPostseason();
        modalPostseason(r); }), 'primary'); break;
    case 'off_rollover':
      btn('시즌 정리', () => act(() => modalRollover(G.offseasonRollover())), 'primary'); break;
    case 'off_fa':
      btn('FA 시장 마감', () => { if (confirm('오퍼를 확정하고 시장을 마감합니다. 되돌릴 수 없습니다.'))
        act(() => modalSignings(G.resolveFA())); }, 'primary');
      break;
    case 'off_trade':
      btn('트레이드 마감', () => act(() => G.resolveTrades()), 'primary'); break;
    case 'off_draft': break;
  }
  const tb = $('#tabs'); tb.innerHTML = '';
  TABS.forEach(([k, label]) => {
    const b = el('button', k === tab ? 'on' : '', label);
    b.onclick = () => { tab = k; render(); }; tb.appendChild(b);
  });
}

function act(fn) { const r = fn(); autosave(); render(); return r; }

function showGames(r) {
  if (r && r.games) for (const g of r.games.slice(-3))
    toast(`${g.result === '승' ? '승리' : g.result === '패' ? '패배' : '무승부'} ${g.score} vs ${g.opponent}`);
  const st = G.state();
  for (const n of st.notices) toast(n.text, n.kind);
}

/* ---------- 화면 ---------- */
function render() {
  renderTop();
  const v = $('#view'); v.innerHTML = '';
  ({ home: viewHome, team: viewTeam, league: viewLeague, front: viewFront, history: viewHistory }[tab])(v);
}

function card(title, bodyHtml, cls = '') {
  const c = el('div', 'card' + (cls ? ' ' + cls : ''));
  if (title) c.appendChild(el('h3', null, title));
  c.appendChild(el('div', 'body' + (cls.includes('flush') ? ' flush' : ''), bodyHtml));
  return c;
}
function tableEl(head, rows, onRow) {
  const t = el('table');
  t.innerHTML = `<thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
  const tb = el('tbody');
  rows.forEach(r => {
    const tr = el('tr', (r._cls || '') + (onRow ? ' click' : ''));
    tr.innerHTML = r.cells.map(c => `<td>${c}</td>`).join('');
    if (onRow) tr.onclick = () => onRow(r);
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  return t;
}

/* --- 홈 --- */
function viewHome(v) {
  const s = G.state();
  if (s.phase === 'preseason') {
    v.appendChild(card('스프링캠프', `<p class="dim">${s.year} 시즌 준비가 끝났습니다. 상단의 <b>시즌 시작</b>을 누르세요.</p>`));
  }
  const g = el('div', 'grid g21');
  const left = el('div', 'grid');
  const rec = G.recentResults(10).rows;
  left.appendChild(card('최근 경기',
    rec.length ? rec.slice().reverse().map(r =>
      `<div class="rowsplit"><span><span class="res ${r.result==='승'?'w':r.result==='패'?'l':'d'}">${r.result}</span>
       ${r.home?'vs':'@'} ${esc(r.opponent)}</span><span class="num">${r.score}</span></div>`).join('')
      : '<div class="empty">아직 경기가 없습니다</div>'));
  const sch = G.schedule(5).rows;
  if (sch.length) left.appendChild(card('다음 경기',
    sch.map(r => `<div class="rowsplit"><span class="dim num">${r.day}일차</span>
      <span>${r.is_home?'vs':'@'} ${esc(r.opponent)}</span></div>`).join('')));
  const st = G.standings().rows;
  const right = el('div', 'grid');
  if (st.length) {
    const t = tableEl(['팀','승','패','승률','GB'], st.map(r => ({
      _cls: r.is_user ? 'me' : '',
      cells: [(r.playoff ? '<span class="dim">★</span> ' : '　') + esc(r.team),
        `<span class="num">${r.w}</span>`, `<span class="num">${r.l}</span>`,
        `<span class="num">${r.pct}</span>`, `<span class="num dim">${r.gb}</span>`] })));
    const c = card('순위', '', 'flush'); c.querySelector('.body').appendChild(t); right.appendChild(c);
  }
  const ros = G.roster();
  right.appendChild(card('구단', `
    <div class="kv"><span>연봉 총액</span><b class="num">${ros.payroll}억</b></div>
    <div class="kv"><span>구단 예산</span><b class="num">${ros.budget}억</b></div>
    <div class="kv"><span>부상자</span><b class="num">${ros.injured.length}명</b></div>`));
  g.appendChild(left); g.appendChild(right); v.appendChild(g);
}

/* --- 팀 --- */
function playerRows(list, showStat) {
  return list.map(p => ({ p, cells: [
    esc(p.name) + (p.injury_days ? `<span class="badge inj">부상 ${p.injury_days}일</span>` : ''),
    `<span class="dim">${p.slot}</span>`, `<span class="num">${p.age}</span>`,
    bar(p.ovr), bar(p.pot, 'pot'),
    showStat ? statCell(p) : (p.contract ? `<span class="num dim">${p.contract.text}</span>` : '<span class="dim">-</span>'),
  ]}));
}
function statCell(p) {
  const s = p.stat || {};
  if (p.kind === 'B') return s.pa ? `<span class="num">${s.avg} · ${s.hr}홈런 · ${s.rbi}타점</span>` : '<span class="dim">-</span>';
  return s.g ? `<span class="num">${s.ip}이닝 · ERA ${s.era} · ${s.k}K</span>` : '<span class="dim">-</span>';
}
function viewTeam(v) {
  const r = G.roster();
  const mk = (title, list, stat) => {
    if (!list.length) return null;
    const c = card(`${title} <span class="dim">(${list.length})</span>`, '', 'flush');
    c.querySelector('.body').appendChild(tableEl(
      ['선수','P','나이','현재 능력','잠재력', stat ? '시즌 성적' : '계약'],
      playerRows(list, stat), (row) => openPlayer(row.p.pid)));
    return c;
  };
  const inSeason = G.state().phase === 'regular' || G.state().phase === 'postseason';
  const g = el('div', 'grid');
  [['라인업', r.lineup, inSeason], ['선발 로테이션', r.rotation, inSeason],
   ['불펜', r.bullpen, inSeason], ['벤치', r.bench, false],
   ['부상자', r.injured, false]].forEach(([t, l, s]) => { const c = mk(t, l, s); if (c) g.appendChild(c); });
  const farm = G.farm().rows;
  const fc = card(`2군 유망주 <span class="dim">(${farm.length})</span>`, '', 'flush');
  fc.querySelector('.body').appendChild(tableEl(['선수','P','나이','현재 능력','잠재력','확신도'],
    farm.map(p => ({ p, cells: [esc(p.name), `<span class="dim">${p.slot}</span>`,
      `<span class="num">${p.age}</span>`, bar(p.ovr), bar(p.pot,'pot'), conf(p.confidence)] })),
    (row) => openPlayer(row.p.pid)));
  g.appendChild(fc);
  v.appendChild(g);
}

/* --- 리그 --- */
function viewLeague(v) {
  const st = G.standings().rows;
  const g = el('div', 'grid');
  if (st.length) {
    const c = card('순위표', '', 'flush');
    c.querySelector('.body').appendChild(tableEl(['팀','승','패','승률','게임차','득점','실점','피타고라스'],
      st.map(r => ({ _cls: r.is_user ? 'me' : '', team_id: r.team_id, cells: [
        (r.playoff ? '★ ' : '　') + esc(r.team), `<span class="num">${r.w}</span>`,
        `<span class="num">${r.l}</span>`, `<span class="num">${r.pct}</span>`,
        `<span class="num dim">${r.gb}</span>`, `<span class="num">${r.rs}</span>`,
        `<span class="num">${r.ra}</span>`, `<span class="num dim">${r.pyth}</span>`] })),
      (row) => openTeam(row.team_id)));
    g.appendChild(c);
  }
  const L = G.leaders(5);
  const board = (groups) => groups.map(b => `<div class="sec"><h4>${b.label}</h4>` +
    b.rows.map((r,i) => `<div class="rowsplit"><span>${i+1}. ${esc(r.name)}
      <span class="dim">${esc(r.team.split(' ')[0])}</span></span>
      <b class="num">${r.value}</b></div>`).join('') + '</div>').join('');
  if (L.batting && L.batting.length) {
    const two = el('div', 'grid g2');
    two.appendChild(card('타격 리더', board(L.batting)));
    two.appendChild(card('투구 리더', board(L.pitching)));
    g.appendChild(two);
  }
  if (!st.length) g.appendChild(card(null, '<div class="empty">시즌이 시작되면 순위가 표시됩니다</div>'));
  v.appendChild(g);
}

/* --- 프런트 --- */
function viewFront(v) {
  const s = G.state();
  if (s.phase === 'off_fa') return viewFA(v);
  if (s.phase === 'off_draft') return viewDraft(v);
  if (s.phase === 'off_trade') return viewTrade(v);
  const f = G.finances();
  const g = el('div', 'grid g21');
  const c = card('연봉 현황', '', 'flush');
  c.querySelector('.body').appendChild(tableEl(['선수','나이','연봉','계약','만료'],
    f.contracts.map(x => ({ pid: x.pid, cells: [esc(x.name), `<span class="num">${x.age}</span>`,
      `<span class="num">${x.salary}억</span>`, `<span class="num dim">${x.text}</span>`,
      `<span class="num dim">${x.end_year}</span>`] })), (row) => openPlayer(row.pid)));
  g.appendChild(c);
  g.appendChild(card('구단 재정', `
    <div class="kv"><span>시장 규모</span><b class="num">${f.market_size}</b></div>
    <div class="kv"><span>연간 수입</span><b class="num">${f.revenue}억</b></div>
    <div class="kv"><span>예산</span><b class="num">${f.budget}억</b></div>
    <div class="kv"><span>연봉 총액</span><b class="num">${f.payroll}억</b></div>
    <div class="kv"><span>여력</span><b class="num ${f.room<0?'bad':'good'}">${f.room}억</b></div>
    <p class="fine">FA·트레이드는 오프시즌에 진행됩니다.</p>`));
  v.appendChild(g);
}

function viewFA(v) {
  const fa = G.freeAgents();
  const g = el('div', 'grid g21');
  const c = card(`FA 시장 <span class="dim">(${fa.rows.length}명)</span>`, '', 'flush');
  c.querySelector('.body').appendChild(tableEl(
    ['선수','P','나이','현재 능력','요구 조건','예상 낙찰가','내 오퍼'],
    fa.rows.map(p => ({ p, cells: [
      esc(p.name) + (p.former_team === '미계약' ? '<span class="badge">미계약</span>' : ''),
      `<span class="dim">${p.slot}</span>`, `<span class="num">${p.age}</span>`, bar(p.ovr),
      `<span class="num">${p.ask.years}년 ${p.ask.total}억</span>`,
      `<span class="num dim">${p.est.low}~${p.est.high}억/년</span>`,
      p.offer ? `<b class="num good">${p.offer[0]}년 ${(p.offer[0]*p.offer[1]).toFixed(1)}억</b>`
              : '<span class="dim">-</span>'] })),
    (row) => openOffer(row.p)));
  g.appendChild(c);
  const mine = fa.rows.filter(r => r.offer);
  const spend = mine.reduce((s, r) => s + r.offer[1], 0);
  g.appendChild(card('내 오퍼', `
    <div class="kv"><span>예산 여력</span><b class="num">${fa.room}억</b></div>
    <div class="kv"><span>오퍼 연봉 합계</span><b class="num ${spend>fa.room?'bad':''}">${spend.toFixed(1)}억</b></div>
    <div class="sec">${mine.length ? mine.map(r =>
      `<div class="rowsplit"><span>${esc(r.name)}</span><b class="num">${r.offer[0]}년 ${(r.offer[0]*r.offer[1]).toFixed(1)}억</b></div>`).join('')
      : '<div class="empty">오퍼 없음</div>'}</div>
    <p class="fine">다른 팀도 경쟁적으로 지릅니다. 요구 조건만 맞춰서는 잡기 어렵습니다.</p>`));
  v.appendChild(g);
}

function openOffer(p) {
  const yrsDefault = p.ask.years, aavDefault = p.est.high;
  showModal(`
    <div class="mhead"><div><h2>${esc(p.name)}</h2>
      <div class="msub">${p.age}세 · ${p.slot} · ${esc(p.former_team)}</div></div>
      <button id="mx" class="ghost">닫기</button></div>
    <div class="mbody">
      <div class="kv"><span>현재 능력</span>${bar(p.ovr)}</div>
      <div class="kv"><span>요구 조건</span><b class="num">${p.ask.years}년 · 연 ${p.ask.aav}억</b></div>
      <div class="kv"><span>예상 낙찰가</span><b class="num dim">연 ${p.est.low}~${p.est.high}억</b></div>
      <div class="sec"><h4>오퍼 제시</h4>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label class="dim">기간 <input id="oy" type="number" min="1" max="6" value="${yrsDefault}" style="width:62px"></label>
          <label class="dim">연평균 <input id="oa" type="number" min="0.3" step="0.5" value="${aavDefault}" style="width:82px">억</label>
          <button id="ok" class="primary">오퍼 등록</button>
          ${p.offer ? '<button id="del" class="ghost">오퍼 취소</button>' : ''}
        </div>
        <p class="fine">선수는 돈만 보지 않습니다. 우승 가능성과 출전 기회도 따집니다.</p>
      </div>
    </div>`);
  $('#ok').onclick = () => { G.offer(p.pid, +$('#oy').value, +$('#oa').value);
    closeModal(); autosave(); render(); };
  if ($('#del')) $('#del').onclick = () => { G.cancelOffer(p.pid); closeModal(); autosave(); render(); };
}

function viewDraft(v) {
  const b = G.draftBoard(40);
  const g = el('div', 'grid g21');
  const head = `전체 ${b.pick_no}순위 · ${b.round}라운드 · ` +
    (b.my_turn ? '<b class="good">내 차례</b>' : `${esc(b.on_clock || '')} 지명 중`);
  const c = card(`드래프트 보드 — ${head}`, '', 'flush');
  c.querySelector('.body').appendChild(tableEl(['선수','출신','P','나이','현재 능력','잠재력','확신도'],
    b.rows.map(p => ({ p, cells: [esc(p.name),
      `<span class="badge ${p.origin==='고졸'?'hs':'col'}">${p.origin||''}</span>`,
      `<span class="dim">${p.slot}</span>`, `<span class="num">${p.age}</span>`,
      bar(p.ovr), bar(p.pot,'pot'), conf(p.confidence)] })),
    (row) => { if (!b.my_turn) { openPlayer(row.p.pid); return; }
      if (confirm(`${row.p.name} 선수를 지명하시겠습니까?`)) {
        G.draftPick(row.p.pid); autosave(); render(); } }));
  g.appendChild(c);
  const picks = card('지명 현황',
    b.picks.length ? b.picks.slice().reverse().slice(0,20).map(p =>
      `<div class="rowsplit ${p.mine?'good':''}"><span class="dim num">${p.n}</span>
       <span>${esc(p.team.split(' ')[0])} · ${esc(p.name)} <span class="dim">${p.origin}</span></span></div>`).join('')
      : '<div class="empty">아직 지명이 없습니다</div>');
  g.appendChild(picks);
  v.appendChild(g);
}

function viewTrade(v) {
  const teams = G.teamList().filter(t => t.id !== G.state().user_team.id);
  const g = el('div', 'grid');
  g.appendChild(card('트레이드', `<p class="dim">상대 팀을 고르면 자산을 비교할 수 있습니다.
    리빌딩 팀에 베테랑을 팔려 하면 안 됩니다.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
    ${teams.map(t => `<button data-tid="${t.id}">${esc(t.name)} <span class="pill">${t.mode}</span></button>`).join('')}
    </div>`));
  v.appendChild(g);
  v.querySelectorAll('[data-tid]').forEach(b => b.onclick = () => openTrade(+b.dataset.tid));
}

let tradeSel = { give: new Set(), get: new Set(), other: null };
function openTrade(tid) {
  tradeSel = { give: new Set(), get: new Set(), other: tid };
  drawTrade();
}
function drawTrade() {
  const mine = G.tradeAssets(G.state().user_team.id);
  const theirs = G.tradeAssets(tradeSel.other);
  const list = (data, set, side) => [...data.roster, ...data.farm].map(p =>
    `<div class="rowsplit" style="cursor:pointer" data-side="${side}" data-pid="${p.pid}">
      <span>${set.has(p.pid)?'<b class="good">✓</b> ':''}${esc(p.name)}
        <span class="dim">${p.age}세 ${p.slot}</span>${p.farm?'<span class="badge">2군</span>':''}</span>
      ${bar(p.ovr)}</div>`).join('');
  const ev = (tradeSel.give.size || tradeSel.get.size)
    ? G.tradeEvaluate([...tradeSel.give], [...tradeSel.get], tradeSel.other) : null;
  showModal(`
    <div class="mhead"><div><h2>트레이드 — ${esc(theirs.team)}</h2>
      <div class="msub">상대 방향성 <span class="pill">${theirs.mode}</span></div></div>
      <button id="mx" class="ghost">닫기</button></div>
    <div class="mbody">
      ${ev ? `<div class="quote"><b>${ev.verdict==='accept'?'✔ ':ev.verdict==='close'?'～ ':'✘ '}${esc(ev.text)}</b></div>` : ''}
      <div class="grid g2" style="margin-top:12px">
        <div><h4 class="dim">내가 내줄 선수</h4><div style="max-height:300px;overflow:auto">${list(mine, tradeSel.give, 'give')}</div></div>
        <div><h4 class="dim">내가 받을 선수</h4><div style="max-height:300px;overflow:auto">${list(theirs, tradeSel.get, 'get')}</div></div>
      </div>
      <div class="sec"><button id="propose" class="primary" ${ev && ev.verdict==='accept' ? '' : 'disabled'}>제안하기</button></div>
    </div>`);
  document.querySelectorAll('[data-pid]').forEach(row => row.onclick = () => {
    const set = row.dataset.side === 'give' ? tradeSel.give : tradeSel.get;
    const pid = +row.dataset.pid;
    set.has(pid) ? set.delete(pid) : set.add(pid);
    drawTrade();
  });
  $('#propose').onclick = () => {
    const r = G.proposeTrade([...tradeSel.give], [...tradeSel.get], tradeSel.other);
    if (r.ok) { toast('트레이드 성사'); closeModal(); autosave(); render(); }
    else toast(r.text, 'injury');
  };
}

/* --- 역사 --- */
function viewHistory(v) {
  const h = G.history(60), rec = G.records(10);
  const g = el('div', 'grid g21');
  g.appendChild(card('리그 역사',
    h.rows.length ? h.rows.slice().reverse().map(r =>
      `<div class="rowsplit"><span class="dim num">${r.year}</span><span>${esc(r.text)}</span></div>`).join('')
      : '<div class="empty">아직 역사가 없습니다</div>'));
  const right = el('div', 'grid');
  right.appendChild(card('역대 우승',
    h.champions.length ? h.champions.slice().reverse().map(c =>
      `<div class="rowsplit"><span class="dim num">${c.year}</span><b>${esc(c.team)}</b></div>`).join('')
      : '<div class="empty">-</div>'));
  const recBox = (title, rows, unit) => card(title,
    rows.length ? rows.map((r,i) => `<div class="rowsplit"><span>${i+1}. ${esc(r.name)}
      ${r.active?'<span class="badge">현역</span>':''}</span><b class="num">${r.value}${unit}</b></div>`).join('')
      : '<div class="empty">-</div>');
  right.appendChild(recBox('통산 홈런', rec.hr, ''));
  right.appendChild(recBox('통산 WAR', rec.war, ''));
  g.appendChild(right);
  v.appendChild(g);
}

/* ---------- 모달 ---------- */
function showModal(html) {
  $('#modalBody').innerHTML = html; $('#modal').hidden = false;
  const x = $('#mx'); if (x) x.onclick = closeModal;
  $('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
}
function closeModal() { $('#modal').hidden = true; }

const ATTR_KO = { contact:'컨택', avoid_k:'삼진회피', discipline:'선구안', gap_power:'갭파워',
  hr_power:'파워', speed:'주력', fielding:'수비', stuff:'구위', command:'제구',
  movement:'무브먼트', stamina:'체력' };

function openPlayer(pid) {
  const p = G.player(pid);
  if (p.error) return;
  const attrs = Object.entries(p.attrs).map(([k, v]) =>
    `<div class="attrrow"><span>${ATTR_KO[k] || k}</span>${bar(v)}</div>`).join('');
  const seasons = p.seasons.length ? `<table><thead><tr>
    ${(p.kind==='B'?['연도','팀','나이','G','타율','출루','장타','HR','타점','WAR']
                   :['연도','팀','나이','G','이닝','승','패','ERA','K','WAR'])
      .map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${p.seasons.map(s => `<tr><td class="num">${s.year}</td><td>${esc(s.team.split(' ')[0])}</td>
      <td class="num">${s.age}</td><td class="num">${s.g}</td>` +
      (p.kind==='B' ? `<td class="num">${s.avg}</td><td class="num">${s.obp}</td><td class="num">${s.slg}</td>
        <td class="num">${s.hr}</td><td class="num">${s.rbi}</td>`
       : `<td class="num">${s.ip}</td><td class="num">${s.w}</td><td class="num">${s.l}</td>
          <td class="num">${s.era}</td><td class="num">${s.k}</td>`) +
      `<td class="num"><b>${s.war}</b></td></tr>`).join('')}</tbody></table>` : '';
  const awards = p.awards && Object.keys(p.awards).length
    ? Object.entries(p.awards).map(([k,v]) => `<span class="badge">${k} ${v}회</span>`).join('') : '';
  showModal(`
    <div class="mhead"><div><h2>${esc(p.name)} ${awards}</h2>
      <div class="msub">${p.age}세 · ${p.slot} · ${p.hand}${p.kind==='P'?'투':'타'}
        ${p.origin?' · '+p.origin:''}${p.draft?` · 전체 ${p.draft.overall}순위`:''}
        ${p.injury_days?` · <span class="bad">부상 ${p.injury_days}일</span>`:''}</div></div>
      <button id="mx" class="ghost">닫기</button></div>
    <div class="mbody">
      <div class="grid g2">
        <div>
          <div class="kv"><span>현재 능력</span>${bar(p.ovr)}</div>
          <div class="kv"><span>잠재력</span>${bar(p.pot,'pot')}</div>
          <div class="kv"><span>스카우팅 확신도</span><b class="num">${p.confidence}%</b></div>
          <div class="sec">${attrs}</div>
        </div>
        <div>
          <div class="kv"><span>계약</span><b class="num">${p.contract?p.contract.text:'없음'}</b></div>
          <div class="kv"><span>연봉</span><b class="num">${p.contract?p.contract.salary+'억':'-'}</b></div>
          <div class="kv"><span>서비스 타임</span><b class="num">${p.service}년</b></div>
          <div class="kv"><span>통산 WAR</span><b class="num">${p.career_war ?? '-'}</b></div>
          <div class="kv"><span>부상 이력</span><b class="num">${p.injuries.count}회 / ${p.injuries.days}일</b></div>
          <div class="sec"><h4>스카우팅 리포트</h4><div class="quote">${esc(p.comment)}</div></div>
        </div>
      </div>
      ${seasons ? `<div class="sec"><h4>연도별 기록</h4>${seasons}</div>` : ''}
      ${p.events && p.events.length ? `<div class="sec"><h4>이력</h4>` +
        p.events.map(e => `<div class="rowsplit"><span class="dim num">${e.year}</span><span>${esc(e.text)}</span></div>`).join('')
        + '</div>' : ''}
    </div>`);
}

function openTeam(tid) {
  const r = G.roster(tid);
  showModal(`
    <div class="mhead"><div><h2>${esc(r.name)}</h2>
      <div class="msub">방향성 <span class="pill">${r.mode}</span> · 연봉 ${r.payroll}억</div></div>
      <button id="mx" class="ghost">닫기</button></div>
    <div class="mbody">
      <div class="sec"><h4>라인업</h4>${r.lineup.map(p =>
        `<div class="rowsplit"><span>${esc(p.name)} <span class="dim">${p.age}세 ${p.slot}</span></span>${bar(p.ovr)}</div>`).join('')}</div>
      <div class="sec"><h4>선발 로테이션</h4>${r.rotation.map(p =>
        `<div class="rowsplit"><span>${esc(p.name)} <span class="dim">${p.age}세</span></span>${bar(p.ovr)}</div>`).join('')}</div>
    </div>`);
}

function modalPostseason(r) {
  showModal(`<div class="mhead"><div><h2>${r.user_won ? '🏆 우승!' : '포스트시즌 종료'}</h2>
    <div class="msub">${esc(r.champion)} 챔피언</div></div><button id="mx" class="ghost">닫기</button></div>
    <div class="mbody">${r.rounds.map(x =>
      `<div class="rowsplit"><span class="dim">${x.round}</span>
       <span><b>${esc(x.winner)}</b> ${x.score} ${esc(x.loser)}</span></div>`).join('')}</div>`);
}
function modalRollover(r) {
  const sec = (t, arr, fmt) => arr.length
    ? `<div class="sec"><h4>${t}</h4>${arr.map(fmt).join('')}</div>` : '';
  showModal(`<div class="mhead"><div><h2>시즌 정리</h2>
    <div class="msub">선수들이 한 살 더 먹었습니다</div></div><button id="mx" class="ghost">닫기</button></div>
    <div class="mbody">
    ${sec('은퇴', r.retired.slice(0,20), x => `<div class="rowsplit ${x.mine?'me':''}">
      <span>${esc(x.name)} <span class="dim">${x.age}세 ${esc(x.team.split(' ')[0])}</span></span>
      <span class="num dim">${x.years}시즌 · WAR ${x.war}</span></div>`)}
    ${sec('우리 팀 급성장', r.breakout, x => `<div class="rowsplit"><span>${esc(x.name)}</span>
      <b class="num good">+${x.delta}</b></div>`)}
    ${sec('우리 팀 급락', r.decline, x => `<div class="rowsplit"><span>${esc(x.name)}</span>
      <b class="num bad">${x.delta}</b></div>`)}
    </div>`);
}
function modalSignings(r) {
  showModal(`<div class="mhead"><div><h2>FA 계약 결과</h2>
    <div class="msub">우리 팀 계약이 위에 표시됩니다</div></div><button id="mx" class="ghost">닫기</button></div>
    <div class="mbody">${r.signings.slice(0,40).map(s =>
      `<div class="rowsplit ${s.mine?'me':''}"><span>${esc(s.name)}
        <span class="dim">${s.age}세 ${s.slot}</span> → <b>${esc(s.team)}</b>
        ${s.moved?'<span class="badge">이적</span>':'<span class="badge">잔류</span>'}</span>
       <span class="num">${esc(s.text)}</span></div>`).join('')}</div>`);
}

boot();
