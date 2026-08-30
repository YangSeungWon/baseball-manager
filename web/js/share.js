// 공유 카드. 이 게임의 자랑거리는 "그때 아무도 몰랐다" 는 것 하나다.
// 지명하던 날 스카우트가 본 구간과, 그 뒤 실제로 남긴 성적을 한 장에 겹친다.
// 화면의 눈금축 문법을 그대로 쓴다 — 실선은 추정, 해칭은 미확인.

const W = 1080, H = 1350;
const BG = '#080d13', S1 = '#161f2b', LINE = '#26344a';
const FG = '#f4f8fb', FG2 = '#9fb0c0', FG3 = '#6f8093';
const SCOUT = '#4076a6';
const KR = '"Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
const MONO = '"IBM Plex Mono",ui-monospace,Menlo,monospace';

const f = (w, size, family = KR) => `${w} ${size}px ${family}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** '고양 헌터스' → '헌터스'. 카드 폭이 좁다. */
const shortTeam = (n) => String(n || '').split(' ').slice(-1)[0];
/** 야구 표기 — 타율은 앞의 0 을 떼고, WAR 은 소수 한 자리로. */
const avg3 = (v) => String(v).replace(/^0/, '');
const war1 = (v) => (+v || 0).toFixed(1);

/** 20–80 눈금 위의 x 좌표. */
const scaleX = (v, x0, w) => x0 + (clamp(v, 20, 80) - 20) / 60 * w;

/** 눈금자. 카드에서 딱 한 번 그린다. */
function ruler(c, x0, y, w) {
  c.strokeStyle = LINE; c.lineWidth = 1;
  c.fillStyle = FG3; c.font = f(500, 20, MONO); c.textAlign = 'center';
  for (const v of [20, 35, 50, 65, 80]) {
    const x = scaleX(v, x0, w);
    c.beginPath(); c.moveTo(x + .5, y); c.lineTo(x + .5, y + 10); c.stroke();
    c.fillText(String(v), x, y + 34);
  }
}

/** 구간 막대. solid=추정 현재, hatch=미확인 잠재력. */
function rangeBar(c, x0, y, w, lo, hi, kind) {
  const h = 34;
  c.fillStyle = S1; c.fillRect(x0, y, w, h);
  const a = scaleX(lo, x0, w), b = scaleX(hi, x0, w);
  if (kind === 'hatch') {
    c.save(); c.beginPath(); c.rect(a, y, Math.max(3, b - a), h); c.clip();
    c.fillStyle = '#2b3d52'; c.fillRect(a, y, b - a, h);
    c.strokeStyle = '#4a6480'; c.lineWidth = 3;
    for (let x = a - h; x < b + h; x += 11) {
      c.beginPath(); c.moveTo(x, y + h); c.lineTo(x + h, y); c.stroke();
    }
    c.restore();
  } else {
    c.fillStyle = SCOUT; c.fillRect(a, y, Math.max(3, b - a), h);
  }
  c.font = f(700, 24, MONO); c.textAlign = 'left'; c.fillStyle = FG;
  c.fillText(`${lo}–${hi}`, x0 + w + 20, y + h - 8);
}

/** 글자를 폭에 맞게 줄인다. 이름이 길어도 카드가 깨지지 않게. */
function fitText(c, text, max, weight, size) {
  let s = size;
  do { c.font = f(weight, s); s -= 2; } while (c.measureText(text).width > max && s > 24);
  return c.font;
}

/**
 * 선수 카드를 그린다.
 * @param p  api.player(pid) 결과
 * @param o  { team, color, code, year }
 * @returns  Promise<Blob>
 */
export async function playerCard(p, o) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const PAD = 76, IW = W - PAD * 2;

  c.fillStyle = BG; c.fillRect(0, 0, W, H);
  c.fillStyle = o.color; c.fillRect(0, 0, W, 10);

  // ── 머리: 구단 마크와 이름
  const cx = PAD + 40, cy = 118;
  c.beginPath(); c.arc(cx, cy, 40, 0, Math.PI * 2);
  c.fillStyle = o.color; c.fill();
  c.fillStyle = '#fff'; c.font = f(700, 28, MONO);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(o.code, cx, cy + 1);
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.fillStyle = FG2; c.font = f(600, 30);
  c.fillText(o.team, PAD + 96, cy + 11);
  c.textAlign = 'right'; c.fillStyle = FG3; c.font = f(500, 28, MONO);
  c.fillText(`${o.year} 시즌`, W - PAD, cy + 11);

  // ── 이름
  c.textAlign = 'left'; c.fillStyle = FG;
  c.font = fitText(c, p.name, IW, 800, 96);
  c.fillText(p.name, PAD, 268);
  c.fillStyle = FG3; c.font = f(500, 30);
  const sub = [p.slot, `${p.age}세`, p.debut_year ? `${p.debut_year} 데뷔` : null]
    .filter(Boolean).join('  ·  ');
  c.fillText(sub, PAD, 316);

  let y = 386;
  const rule = () => { c.strokeStyle = LINE; c.lineWidth = 1;
    c.beginPath(); c.moveTo(PAD, y + .5); c.lineTo(W - PAD, y + .5); c.stroke(); y += 54; };
  const label = (t, note) => {
    c.fillStyle = FG3; c.font = f(700, 26);
    c.fillText(t, PAD, y);
    if (note) { c.textAlign = 'right'; c.fillStyle = FG3; c.font = f(500, 26, MONO);
      c.fillText(note, W - PAD, y); c.textAlign = 'left'; }
    y += 46;
  };

  rule();
  const look = p.draft && p.draft.look;
  const BX = PAD + 88, BW = IW - 88 - 120;      // 막대와 눈금자가 같은 구간을 쓴다
  if (look) {
    label('지명하던 날 스카우트가 본 것',
      `${p.draft.year || ''} ${p.draft.round}R 전체 ${p.draft.overall}순위`.trim());
    ruler(c, BX, y - 14, BW); y += 46;
    c.fillStyle = FG2; c.font = f(600, 24);
    c.fillText('현재', PAD, y + 24); rangeBar(c, BX, y, BW, look.ovr[0], look.ovr[1], 'solid');
    y += 52;
    c.fillStyle = FG2; c.font = f(600, 24);
    c.fillText('잠재력', PAD, y + 24); rangeBar(c, BX, y, BW, look.pot[0], look.pot[1], 'hatch');
    y += 78;
  } else if (p.draft) {
    label('지명', `${p.draft.year || ''} ${p.draft.round}R 전체 ${p.draft.overall}순위`.trim());
    c.fillStyle = FG; c.font = f(800, 72, MONO);
    c.fillText(`${p.draft.round}라운드`, PAD, y + 40);
    c.fillStyle = FG3; c.font = f(500, 30);
    c.fillText(`전체 ${p.draft.overall}순위 지명`, PAD + 260, y + 40);
    y += 86;
  } else {
    label('입단', p.origin ? p.origin[0] : '');
    y += 10;
  }

  rule();
  label('그 뒤 실제로', `${p.seasons.length}시즌`);

  // ── 큰 숫자 세 칸
  const bat = p.kind === 'B';
  const tot = p.seasons.reduce((a, s) => {
    a.hr += +s.hr || 0; a.rbi += +s.rbi || 0; a.k += +s.k || 0;
    // 이닝은 "123.2" 꼴이다. 소수 자리가 아니라 아웃 카운트다.
    if (s.ip) { const [w2, f2] = String(s.ip).split('.'); a.outs += (+w2 || 0) * 3 + (+f2 || 0); }
    return a;
  }, { hr:0, rbi:0, k:0, outs:0 });
  const best = p.seasons.reduce((a, s) => (+s.war > (+a.war || -9) ? s : a), {});
  const cells = bat
    ? [['통산 WAR', (p.career_war ?? 0).toFixed(1)], ['홈런', String(tot.hr)], ['타점', String(tot.rbi)]]
    : [['통산 WAR', (p.career_war ?? 0).toFixed(1)],
       ['이닝', String(Math.round(tot.outs / 3))], ['탈삼진', String(tot.k)]];
  const cw = IW / 3;
  cells.forEach(([k, v], i) => {
    const x = PAD + i * cw;
    c.fillStyle = FG3; c.font = f(600, 26); c.fillText(k, x, y);
    c.fillStyle = FG; c.font = f(800, 78, MONO); c.fillText(v, x, y + 82);
  });
  y += 138;

  // ── 수상 · 최고 시즌
  const aw = Object.entries(p.awards || {}).filter(([, n]) => n > 0)
    .map(([k, n]) => n > 1 ? `${k} ${n}회` : k);
  if (aw.length) {
    c.fillStyle = o.color; c.font = f(700, 30);
    c.fillText(aw.join('  ·  '), PAD, y); y += 46;
  }
  if (best.year) {
    c.fillStyle = FG2; c.font = f(500, 28);
    const line = bat
      ? `${best.year} · ${avg3(best.avg)} ${best.hr}홈런 ${best.rbi}타점 · WAR ${war1(best.war)}`
      : `${best.year} · ${best.w}승 ${best.l}패 ERA ${best.era} · WAR ${war1(best.war)}`;
    c.fillText(`최고 시즌  ${line}`, PAD, y); y += 40;
  }

  // ── 연도별. 빈 칸을 두느니 기록을 채운다.
  y = Math.max(y + 16, 940);
  c.strokeStyle = LINE; c.lineWidth = 1;
  c.beginPath(); c.moveTo(PAD, y + .5); c.lineTo(W - PAD, y + .5); c.stroke();
  y += 44;
  const rows = p.seasons.slice(-7);
  const colW = [110, 150, IW - 110 - 150 - 110, 110];
  const head = bat ? ['연도', '팀', '타율 · 홈런 · 타점', 'WAR']
                   : ['연도', '팀', '승 · ERA · 탈삼진', 'WAR'];
  c.fillStyle = FG3; c.font = f(600, 22);
  head.forEach((h, i) => {
    const x = PAD + colW.slice(0, i).reduce((a, b) => a + b, 0);
    c.textAlign = i === 3 ? 'right' : 'left';
    c.fillText(h, i === 3 ? x + colW[3] : x, y);
  });
  c.textAlign = 'left'; y += 12;
  const rowH = Math.min(40, (H - 130 - y) / Math.max(1, rows.length));
  for (const s2 of rows) {
    y += rowH;
    c.strokeStyle = '#1a2634'; c.beginPath();
    c.moveTo(PAD, y + .5); c.lineTo(W - PAD, y + .5); c.stroke();
    const cells2 = [String(s2.year), shortTeam(s2.team),
      bat ? `${avg3(s2.avg)}  ·  ${s2.hr}홈런  ·  ${s2.rbi}타점`
          : `${s2.w}승  ·  ${s2.era}  ·  ${s2.k}K`,
      war1(s2.war)];
    cells2.forEach((v, i) => {
      const x = PAD + colW.slice(0, i).reduce((a, b) => a + b, 0);
      c.fillStyle = i === 3 ? FG : (i === 2 ? FG2 : FG3);
      c.font = i === 3 ? f(700, 26, MONO) : (i === 1 ? f(500, 24) : f(500, 24, MONO));
      c.textAlign = i === 3 ? 'right' : 'left';
      c.fillText(v, i === 3 ? x + colW[3] : x, y - 12);
    });
    c.textAlign = 'left';
  }

  // ── 발
  c.fillStyle = FG3; c.font = f(600, 26, MONO);
  c.fillText('DUGOUT', PAD, H - 54);
  c.textAlign = 'right'; c.font = f(500, 26, MONO);
  c.fillText('baseball.ysw.kr', W - PAD, H - 54);

  return new Promise(res => cv.toBlob(res, 'image/png'));
}

/** 카드 한 장을 내보낸다. 폰이면 공유 시트, 아니면 내려받기. */
export async function shareCard(blob, name, text) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
