import {QuickGame, PITCH_COUNT, WINDUP_MS, FEEDBACK_MS, HIT_MS, pitchLocation, inQuickZone} from './quick-game.js';
import {QUICK_PITCH_TYPES, drawSpinningBall} from './quick-pitches.js';

const RECORD_KEY = 'dugout.quick.v1';
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
let active = false;
function record() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORD_KEY));
    return {best: Number.isFinite(data?.best) ? Math.max(0, data.best) : 0};
  } catch { return {best: 0}; }
}

export function openQuickMode() {
  if (active) return;
  active = true;
  const origin = document.activeElement, overflow = document.body.style.overflow;
  const backgrounds = [...document.querySelectorAll('#boot,#app')];
  const priorInert = backgrounds.map(el => el.inert);
  backgrounds.forEach(el => el.inert = true);
  document.body.style.overflow = 'hidden';
  const root = document.createElement('section');
  root.className = 'quick-mode';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', '10구 승부');
  root.innerHTML = `
    <header class="quick-head"><b>10구 승부</b><span class="quick-best"></span><button class="quick-pause" aria-label="일시정지" disabled>일시정지</button><button class="quick-exit" aria-label="게임 나가기">나가기</button></header>
    <div class="quick-score"><span><small>점수</small><strong class="quick-points">0</strong></span><span class="quick-combo">한 공씩, 차근차근.</span><span><small>투구</small><strong class="quick-count">1 / 10</strong></span></div>
    <div class="quick-track" aria-label="10구 결과"></div>
    <div class="quick-field"><canvas aria-label="공이 스트라이크 존에 도착할 때 스윙하세요. 존 밖의 공은 참으세요."></canvas><div class="quick-message" role="status" aria-live="polite"></div><div class="quick-cover"></div></div>
    <div class="quick-action"><button class="quick-swing" disabled>스윙 <small>터치 · 클릭 · Space</small></button><p>존 안으로 오는 공은 도착할 때 스윙. 존 밖은 참기.</p></div>`;
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  const cover = $('.quick-cover'), swingButton = $('.quick-swing');
  const lifecycle = new AbortController();
  const on = (el, event, fn) => el.addEventListener(event, fn, {signal: lifecycle.signal});
  let game, phase = 'ready', elapsed = 0, paused = false, closed = false, raf;
  let lastTime = performance.now(), width = 0, height = 0, outcome = null, best = record().best;
  let displayedPitch = null, swingAt = null;
  const pitcherLabel = () => `${game.pitcher.hand === 'L' ? '좌완' : '우완'} · 구위 ${game.pitcher.stuff >= .7 ? '날카로움' : '보통'} · 제구 ${game.pitcher.command >= .7 ? '안정' : '흔들림'}`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hud() {
    root.dataset.phase = phase;
    $('.quick-best').textContent = `최고 ${best.toLocaleString()}`;
    $('.quick-points').textContent = game.score.toLocaleString();
    $('.quick-count').textContent = `${Math.min(PITCH_COUNT, game.results.length + (phase === 'feedback' ? 0 : 1))} / ${PITCH_COUNT}`;
    $('.quick-combo').textContent = game.combo > 1 ? `${game.combo}연속 성공 · 보너스 +${Math.min(4, game.combo - 1) * 25}` : '안타도, 잘 참기도 연속 성공!';
    $('.quick-track').innerHTML = game.pitches.map((_, i) => {
      const result = game.results[i];
      return `<span class="${result?.kind || (i === game.results.length ? 'current' : '')}" title="${i + 1}구${result ? ' · ' + result.label : ''}">${result ? result.base ? '●' : '×' : i + 1}</span>`;
    }).join('');
  }
  function message(title, detail = '') {
    $('.quick-message').innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
  }
  function ready() {
    game = new QuickGame(newSeed()); displayedPitch = game.pitch;
    hud();
    cover.innerHTML = `<div><small>약 40초 · 10번의 선택</small><h2>칠까, 참을까?</h2><p>공이 <b>스트라이크 존에 도착할 때</b> 스윙.<br>실밥 회전과 궤적을 끝까지 보세요.<br>존 밖으로 빠지면 누르지 마세요.</p><small>${pitcherLabel()}</small><p class="quick-rule">정타 200점 · 안타 / 참기 100점<br>연속 성공하면 최대 +100점 보너스</p><button class="quick-start">첫 공 받기</button></div>`;
    $('.quick-start').onclick = () => start(game.seed);
    $('.quick-start').focus();
    draw();
  }
  function start(seed) {
    game = new QuickGame(seed); paused = false; outcome = null; swingAt = null;
    cover.hidden = true;
    $('.quick-pause').disabled = false;
    $('.quick-pause').textContent = '일시정지';
    $('.quick-pause').setAttribute('aria-label', '일시정지');
    beginPitch();
    // Keep Space on the play surface, never on a result or menu button.
    swingButton.focus({preventScroll: true});
  }
  function beginPitch() {
    phase = 'windup'; elapsed = 0; lastTime = performance.now();
    delete root.dataset.verdict;
    displayedPitch = game.pitch; outcome = null; swingAt = null;
    swingButton.disabled = true;
    message(game.results.length === 0 ? '첫 두 공은 천천히 옵니다' : `${game.results.length + 1}번째 공`, pitcherLabel());
    hud();
  }
  function resolve(offset) {
    if (phase !== 'flight' || paused || closed) return;
    outcome = game.resolve(offset);
    swingAt = offset === null ? null : elapsed;
    phase = 'feedback'; elapsed = 0;
    swingButton.disabled = true;
    root.dataset.verdict = outcome.kind;
    message(`${outcome.label} · ${displayedPitch.name}`, `${displayedPitch.speed} km/h · ${outcome.points ? '+' + outcome.points + '점 · ' : ''}${QUICK_PITCH_TYPES[displayedPitch.type].hint}`);
    hud();
  }
  function swing() {
    if (phase !== 'flight' || paused || document.hidden) return;
    // Score at the actual input time, independent of the last rendered frame.
    const offset = elapsed + Math.max(0, performance.now() - lastTime) - displayedPitch.flight;
    resolve(offset > HIT_MS ? null : offset);
  }
  function finish() {
    phase = 'finished'; elapsed = 0;
    $('.quick-pause').disabled = true;
    const previousBest = best;
    best = Math.max(best, game.score);
    let saved = true;
    try { localStorage.setItem(RECORD_KEY, JSON.stringify({best})); } catch { saved = false; }
    hud(); message('');
    const perfect = game.results.filter(r => r.kind === 'perfect').length;
    const hits = game.results.filter(r => r.kind === 'hit' || r.kind === 'perfect').length;
    const takes = game.results.filter(r => r.kind === 'take').length;
    const early = game.results.filter(r => r.offset !== null && r.offset < -65 && r.kind !== 'chase').length;
    const late = game.results.filter(r => r.offset !== null && r.offset > 65 && r.kind !== 'chase').length;
    const advice = game.results.some(r => r.kind === 'chase') ? '다음 판엔 존 밖의 공을 보내보세요.' : early > late ? '다음 판엔 반 박자 더 기다려보세요.' : late > early ? '다음 판엔 조금 더 일찍 눌러보세요.' : '이번 감각으로 정타를 하나 더!';
    cover.hidden = false;
    const strikes = game.pitches.filter(p => p.strike).length;
    cover.innerHTML = `<div><small>${game.score > previousBest ? '새 최고 기록!' : '10구 끝!'}</small><h2>${game.score.toLocaleString()}<small>점</small></h2><p>안타 ${hits}/${strikes} · 정타 ${perfect} · 참기 ${takes}/${PITCH_COUNT-strikes}<br>최대 ${game.bestCombo}연속 성공</p><p>${advice}</p><button class="quick-retry">같은 10구 다시</button><button class="quick-new">새 투수와 한 판</button><small>${saved ? '최고 기록은 이 브라우저에 저장됩니다.' : '이 브라우저에서 기록을 저장하지 못했습니다.'}</small></div>`;
    $('.quick-retry').onclick = () => start(game.seed);
    $('.quick-new').onclick = () => start(newSeed());
    $('.quick-retry').focus();
  }
  function pause() {
    if (paused || phase === 'ready' || phase === 'finished') return;
    paused = true;
    swingButton.disabled = true;
    $('.quick-pause').textContent = '계속';
    $('.quick-pause').setAttribute('aria-label', '경기 계속');
    cover.hidden = false;
    cover.innerHTML = '<div><h2>잠깐 쉬어가기</h2><p>현재 공은 처음부터 다시 옵니다.<br>점수와 기록은 그대로예요.</p><button class="quick-resume">계속하기</button></div>';
    $('.quick-resume').onclick = resume;
    $('.quick-resume').focus();
  }
  function resume() {
    if (!paused || document.hidden) return;
    paused = false; cover.hidden = true;
    $('.quick-pause').textContent = '일시정지';
    $('.quick-pause').setAttribute('aria-label', '일시정지');
    if (phase === 'feedback') { elapsed = 0; lastTime = performance.now(); }
    else beginPitch();
  }
  function close() {
    if (closed) return;
    closed = true; active = false;
    lifecycle.abort(); cancelAnimationFrame(raf); resize.disconnect(); root.remove();
    backgrounds.forEach((el, i) => el.inert = priorInert[i]);
    document.body.style.overflow = overflow;
    origin?.focus();
  }
  on($('.quick-exit'), 'click', close);
  on($('.quick-pause'), 'click', () => paused ? resume() : pause());
  for (const el of [canvas, swingButton]) on(el, 'pointerdown', e => {
    if (e.button !== 0 || !e.isPrimary) return;
    e.preventDefault(); swing();
  });
  // Keyboard/assistive button activation; pointer clicks already swing on pointerdown.
  on(swingButton, 'click', e => { if (e.detail === 0) swing(); });
  on(document, 'keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      const buttons = [...root.querySelectorAll('button:not(:disabled)')].filter(el => el.getClientRects().length);
      const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const control = e.target.closest?.('button,input,select,textarea,a');
    if (e.code === 'Space' && cover.hidden && (!control || control === swingButton)) { e.preventDefault(); swing(); }
    if (e.key.toLowerCase() === 'p') { e.preventDefault(); paused ? resume() : pause(); }
  });
  on(document, 'visibilitychange', () => { if (document.hidden) pause(); });
  on(window, 'blur', pause);

  function circle(x, y, radius, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }
  function draw() {
    if (!ctx || !width || !height) return;
    const w = width, h = height, cx = w / 2, plate = h * .69, target = Math.min(w * .14, h * .11, 46), zoneHeight = target * 1.25;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#163f38'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#204e42'; ctx.beginPath(); ctx.moveTo(cx, h * .24); ctx.lineTo(w * .98, h); ctx.lineTo(w * .02, h); ctx.fill();
    ctx.strokeStyle = '#9bb7a459'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(cx, h * .28); ctx.lineTo(w, h); ctx.stroke();
    ctx.fillStyle = '#98764f'; ctx.beginPath(); ctx.ellipse(cx, h * .32, 35, 12, 0, 0, Math.PI * 2); ctx.fill();
    // A small, readable pitcher and a fixed landing target; no camera movement.
    circle(cx, h * .23, 10, '#f3d5ad');
    ctx.strokeStyle = '#f4eee0'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, h * .25); ctx.lineTo(cx, h * .29); ctx.moveTo(cx, h * .29); ctx.lineTo(cx - 10, h * .32); ctx.moveTo(cx, h * .29); ctx.lineTo(cx + 10, h * .32); ctx.stroke();
    ctx.strokeStyle = '#f1dca4'; ctx.lineWidth = 3;
    ctx.strokeRect(cx - target, plate - zoneHeight, target * 2, zoneHeight * 2);
    ctx.fillStyle = '#f1dca410'; ctx.fillRect(cx - target, plate - zoneHeight, target * 2, zoneHeight * 2);
    ctx.strokeStyle = '#f1dca44a'; ctx.lineWidth = 1;
    for (const third of [-1/3, 1/3]) {
      ctx.beginPath(); ctx.moveTo(cx + target * third, plate - zoneHeight); ctx.lineTo(cx + target * third, plate + zoneHeight);
      ctx.moveTo(cx - target, plate + zoneHeight * third); ctx.lineTo(cx + target, plate + zoneHeight * third); ctx.stroke();
    }
    ctx.fillStyle = '#e0e9d8'; ctx.textAlign = 'center'; ctx.font = '12px sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('스트라이크 존', 12, h - 12); ctx.textAlign = 'center';
    ctx.fillStyle = '#d9d5b8'; ctx.beginPath();
    ctx.moveTo(cx - 14, plate + zoneHeight + 28); ctx.lineTo(cx + 14, plate + zoneHeight + 28); ctx.lineTo(cx + 14, plate + zoneHeight + 36); ctx.lineTo(cx, plate + zoneHeight + 44); ctx.lineTo(cx - 14, plate + zoneHeight + 36); ctx.fill();
    if (phase === 'flight' || phase === 'feedback') {
      let progress = phase === 'flight' ? elapsed / displayedPitch.flight : 1;
      const location = pitchLocation(displayedPitch, progress);
      const depth = progress <= 1 ? location.depth : 1 + (progress - 1) * 3;
      let x = cx + location.x * target;
      let y = h * .27 + (plate - h * .27) * depth - location.z * zoneHeight;
      let radius = 3 + Math.min(1.2, depth) ** 2 * (target * .26 - 3);
      // Reveal the actual plate-crossing location only after the decision.
      if (phase === 'feedback') {
        const lx = cx + displayedPitch.x * target, ly = plate - displayedPitch.z * zoneHeight;
        ctx.strokeStyle = inQuickZone(displayedPitch) ? '#f1dca4' : '#b3dcf0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(lx, ly, target * .26, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle; ctx.textAlign = 'left';
        ctx.fillText(inQuickZone(displayedPitch) ? '존 안' : '볼', lx + target * .26 + 6, ly + 4); ctx.textAlign = 'center';
      }
      if (phase === 'feedback' && outcome?.base && outcome.kind !== 'take') {
        const p = reduced ? 1 : Math.min(1, elapsed / 700);
        x += (outcome.offset < 0 ? -1 : 1) * w * .32 * p;
        y -= h * .8 * p; radius *= 1 - p * .7;
      }
      circle(x + 2, y + 4, radius + 3, '#071b2638');
      const spinTime = phase === 'flight' ? elapsed / 1000 : (displayedPitch.flight + elapsed) / 1000;
      drawSpinningBall(ctx, x, y, radius, displayedPitch.spin, reduced ? 0 : spinTime);
      if (phase === 'feedback' && swingAt !== null && elapsed < 300 && !reduced) {
        const angle = -.8 + elapsed / 300 * 2;
        ctx.strokeStyle = '#e5b36b'; ctx.lineWidth = 13;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * target * 2, plate + Math.sin(angle) * target * 2); ctx.lineTo(cx - Math.cos(angle) * target, plate - Math.sin(angle) * target); ctx.stroke();
      }
    }
  }
  const resize = new ResizeObserver(() => {
    const box = canvas.getBoundingClientRect(); width = box.width; height = box.height;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  });
  resize.observe(canvas);
  function frame(now) {
    if (closed) return;
    const delta = now - lastTime; lastTime = now;
    if (!paused && phase !== 'ready' && phase !== 'finished') {
      // A suspended tab or long stall must not silently eat a pitch.
      if (delta > 400) pause();
      else {
        elapsed += Math.max(0, delta);
        if (phase === 'windup' && elapsed >= WINDUP_MS) {
          phase = 'flight'; elapsed = 0; swingButton.disabled = false;
          root.dataset.phase = phase;
          message('공을 보세요', '존 안이면 도착할 때 스윙 · 밖이면 참기');
        } else if (phase === 'flight' && elapsed > displayedPitch.flight + HIT_MS) resolve(null);
        else if (phase === 'feedback' && elapsed >= FEEDBACK_MS) game.done ? finish() : beginPitch();
      }
    }
    draw(); raf = requestAnimationFrame(frame);
  }
  ready(); raf = requestAnimationFrame(frame);
}
