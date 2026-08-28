// 받은 편지함. 진행 버튼을 누르면 사건이 쌓이고, 플레이어는 그걸 읽으며 판단한다.
// 풋볼 매니저의 리듬을 야구의 사건들로 옮긴 것.

/** 한글 조사. 받침 유무로 갈린다. "포스트시즌였다"는 틀렸다. */
export function josa(word, kind) {
  const s = String(word);
  const c = s.charCodeAt(s.length - 1);
  const hangul = c >= 0xac00 && c <= 0xd7a3;
  const bat = hangul ? (c - 0xac00) % 28 !== 0 : /[0-9a-zA-Z]$/.test(s);
  const T = { '은는':['은','는'], '이가':['이','가'], '을를':['을','를'],
              '과와':['과','와'], '으로':['으로','로'], '이었':['이었','였'],
              '이다':['이다','다'], '이라':['이라','라'] };
  const [a, b] = T[kind];
  return s + (bat ? a : b);
}

export const KIND = {
  injury:'부상', ret:'복귀', milestone:'기록', owner:'구단주', contract:'계약',
  game:'경기', streak:'연승', standings:'순위', league:'리그', scout:'스카우트',
  transfer:'이적', draft:'드래프트',
};

// [필드, 임계값들, 단위]
const BAT_MARKS = [['hr',[100,200,300,400,500,600],'홈런'],
                   ['h',[500,1000,1500,2000,2500],'안타'],
                   ['rbi',[500,1000,1500],'타점'],
                   ['sb',[200,400,600],'도루']];
const PIT_MARKS = [['w',[50,100,150,200,250],'승'],
                   ['k',[500,1000,1500,2000,2500],'탈삼진'],
                   ['sv',[100,200,300],'세이브']];
// 리그 전체에 알릴 만한 큰 기록
const BIG = { 홈런:400, 안타:1500, 승:150, 탈삼진:1500, 세이브:200 };

export class Mailbox {
  constructor() { this.items = []; this.seq = 0; this.seen = new Set(); }

  push(m) {
    this.items.push({ id: ++this.seq, read: false, pri: 0, ...m });
    if (this.items.length > 240) this.items = this.items.slice(-240);
  }
  get unread() { return this.items.filter(m => !m.read).length; }
  markAllRead() { for (const m of this.items) m.read = true; }
  recent(n = 60) { return this.items.slice(-n).reverse(); }
}

/** 하루치 사건을 훑어 편지를 만든다. */
export function scanDay(g, day, newInjuries, boxes) {
  const L = g.L, S = g.season, mb = L.mail;
  const me = g.userId;
  const teamOf = (pid) => {
    for (const t of L.teams) if ([...t.batters, ...t.pitchers].some(p => p.pid === pid)) return t;
    return null;
  };

  // 1. 부상
  for (const inj of newInjuries) {
    const mine = inj.team.team_id === me;
    if (!mine && inj.days < 120) continue;          // 남의 팀은 큰 부상만
    mb.push({ year:L.year, day, kind:'injury', pri: mine && inj.days >= 30 ? 1 : 0,
      pid: inj.player.pid, tid: inj.team.team_id,
      title: `${inj.player.name} ${inj.label}`,
      body: `${inj.team.name} ${josa(inj.player.name, '이가')} ${inj.label} 판정을 받았다. `
        + `복귀까지 약 ${inj.days}일.`
        + (inj.lost && Object.keys(inj.lost).length
           ? ' 이 정도 부상은 몸에 흔적을 남긴다.' : '') });
  }

  // 2. 통산 기록 이정표
  const check = (line, c, marks, isPit) => {
    for (const [f, cuts, unit] of marks) {
      const total = c.tot(f) + (line[f] ?? 0);
      for (const cut of cuts) {
        const key = `${c.p.pid}:${unit}:${cut}`;
        if (total < cut || mb.seen.has(key)) continue;
        mb.seen.add(key);
        const t = teamOf(c.p.pid);
        const mine = t && t.team_id === me;
        if (!mine && cut < (BIG[unit] ?? 1e9)) continue;
        mb.push({ year:L.year, day, kind:'milestone', pri: mine ? 1 : 0,
          pid: c.p.pid, tid: t ? t.team_id : null,
          title: `${c.p.name} 통산 ${cut}${unit}`,
          body: `${t ? t.name + ' ' : ''}${josa(c.p.name, '이가')} 통산 ${cut}${unit} 고지를 밟았다. `
            + `${c.years + 1}번째 시즌.` });
      }
    }
  };
  for (const b of S.bat.values()) {
    const c = L.careers.get(b.p.pid); if (c) check(b, c, BAT_MARKS, false);
  }
  for (const p of S.pit.values()) {
    const c = L.careers.get(p.p.pid); if (c) check(p, c, PIT_MARKS, true);
  }

  // 3. 우리 팀 경기 하이라이트
  for (const box of boxes) {
    const { H, A } = box;
    const usIsHome = H.team.team_id === me;
    const us = usIsHome ? H : A, them = usIsHome ? A : H;
    const diff = us.runs - them.runs;
    for (const b of us.team.lineup) {
      const L2 = us.bat.get(b.pid); if (!L2) continue;
      if (L2.hr >= 3) mb.push({ year:L.year, day, kind:'game', pri:1, pid:b.pid,
        title:`${b.name} 한 경기 ${L2.hr}홈런`,
        body:`${josa(b.name, '이가')} ${them.team.name}전에서 홈런 ${L2.hr}개를 몰아쳤다. `
          + `${L2.h}안타 ${L2.rbi}타점.` });
      else if (L2.h >= 4) mb.push({ year:L.year, day, kind:'game', pid:b.pid,
        title:`${b.name} ${L2.h}안타`,
        body:`${josa(b.name, '이가')} ${L2.ab}타수 ${L2.h}안타 ${L2.rbi}타점으로 맹타를 휘둘렀다.` });
    }
    const sp = us.pitchers[0];
    if (sp && sp.outs >= 27 && sp.r === 0) mb.push({ year:L.year, day, kind:'game', pri:1,
      pid:sp.p.pid, title:`${sp.p.name} 완봉승`,
      body:`${josa(sp.p.name, '이가')} ${josa(them.team.name, '을를')} 상대로 9이닝을 완봉했다. `
        + `피안타 ${sp.h}개, 탈삼진 ${sp.k}개.` });
    else if (sp && sp.outs >= 21 && sp.k >= 12) mb.push({ year:L.year, day, kind:'game',
      pid:sp.p.pid, title:`${sp.p.name} ${sp.k}탈삼진`,
      body:`${josa(sp.p.name, '이가')} ${Math.floor(sp.outs/3)}이닝 동안 ${sp.k}개를 잡아냈다.` });
    if (Math.abs(diff) >= 12) mb.push({ year:L.year, day, kind:'game',
      title: diff > 0 ? `${them.team.name}전 ${us.runs}–${them.runs} 대승`
                      : `${them.team.name}전 ${us.runs}–${them.runs} 대패`,
      body: diff > 0 ? `타선이 폭발했다. 안타 ${us.hits}개.`
                     : `내줄 만큼 내줬다. 다음 경기를 준비할 수밖에.` });
  }
}

/** 연승·연패, 순위 변동, 구단주 — 하루가 끝난 뒤 상태를 본다. */
export function scanState(g, day, prev) {
  prev = prev || { rank: 0, run: 0 };
  const L = g.L, S = g.season, mb = L.mail;
  const st = S.standings();
  const meRec = st.find(r => r.team.team_id === g.userId);
  if (!meRec) return;
  const rank = st.indexOf(meRec) + 1;

  // 연승 / 연패
  const f = g.form(null, 30).recent;
  let run = 0, ch = null;
  for (let i = f.length - 1; i >= 0; i--) {
    if (f[i] === 'D') continue;
    if (ch === null) ch = f[i];
    if (f[i] !== ch) break;
    run++;
  }
  if (ch && run >= 5 && run !== prev.run) {
    const key = `${ch}${run}:${L.year}`;
    if (!mb.seen.has(key)) {
      mb.seen.add(key);
      mb.push({ year:L.year, day, kind:'streak', pri: run >= 8 ? 1 : 0,
        title: ch === 'W' ? `${run}연승` : `${run}연패`,
        body: ch === 'W' ? `팀이 ${run}경기 연속으로 이겼다. 지금 흐름을 놓치지 말 것.`
                         : `${run}경기째 이기지 못했다. 라인업과 불펜을 점검할 때다.` });
    }
  }

  // 순위 변동 — 5·6위를 오가며 매번 알리면 편지함이 망가진다. 15일 쿨다운.
  const cool = (prev.standingsDay ?? -99) + 15;
  if (prev.rank && rank !== prev.rank && day > 15 && day >= cool) {
    prev.standingsDay = day;
    if (rank === 1 && prev.rank !== 1)
      mb.push({ year:L.year, day, kind:'standings', pri:1, title:'선두 등극',
        body:`${meRec.w}승 ${meRec.l}패로 리그 1위에 올랐다.` });
    else if (rank <= 5 && prev.rank > 5)
      mb.push({ year:L.year, day, kind:'standings', title:'포스트시즌권 진입',
        body:`${rank}위로 올라서며 가을야구 경쟁에 복귀했다.` });
    else if (rank > 5 && prev.rank <= 5)
      mb.push({ year:L.year, day, kind:'standings', pri:1, title:'포스트시즌권 이탈',
        body:`${rank}위로 밀려났다. 남은 ${S.totalDays - day}경기.` });
  }

  // 구단주 — 시즌 중반과 후반에 한 번씩
  const gate = [Math.floor(S.totalDays * 0.45), Math.floor(S.totalDays * 0.78)];
  if (gate.includes(day)) {
    const o = g.ownerStatus();
    const key = `owner:${L.year}:${day}`;
    if (!mb.seen.has(key)) {
      mb.seen.add(key);
      const harsh = o.patience < 40;
      mb.push({ year:L.year, day, kind:'owner', pri: o.ok === false ? 1 : 0,
        title: o.ok === false ? '구단주가 성적을 지적했다' : '구단주가 만족을 표했다',
        body: o.ok === false
          ? `목표는 ${josa(o.demand, '이었')}다. ${o.text}. `
            + (harsh ? '더 지켜볼 생각은 없어 보인다.' : '아직 시간은 남아 있다.')
          : `목표는 ${josa(o.demand, '이었')}고 ${o.text}. 이대로만 가면 된다.` });
    }
  }
  return { rank, run, standingsDay: prev.standingsDay };
}

/** 시즌 종료 직후 — 계약 만료 예정과 팜 보고서 */
export function seasonEndMail(g) {
  const L = g.L, mb = L.mail;
  const al = g.contractAlerts().rows.filter(r => r.status === 'FA' || r.status === '재계약');
  if (al.length) mb.push({ year:L.year, kind:'contract', pri:1,
    title:`계약 만료 ${al.length}명`,
    body: al.map(p => `${p.name}(${p.age}세 ${p.slot}) — ${p.status}`).join('\n')
      + '\n\n오프시즌에 재계약하거나 시장에 내보내야 한다.' });
  const farm = g.farm().rows.slice(0, 3);
  if (farm.length) mb.push({ year:L.year, kind:'scout',
    title:'스카우트 보고서 — 팜 상위 유망주',
    body: farm.map(p => `${p.name} ${p.age}세 ${p.slot} · 잠재력 ${p.pot.lo}~${p.pot.hi} `
      + `(확신도 ${p.confidence}%)`).join('\n') });
}

/** 오프시즌 사건 */
export function offseasonMail(g, kind, rows) {
  const L = g.L, mb = L.mail, me = g.userId;
  if (kind === 'retire') {
    for (const r of rows.filter(x => x.mine).slice(0, 12))
      mb.push({ year:L.year, kind:'contract', pri:1,
        title:`${r.name} 은퇴`,
        body:`${r.age}세. ${r.years}시즌 동안 통산 WAR ${r.war}를 남기고 유니폼을 벗는다.` });
  }
  if (kind === 'fa') {
    for (const s of rows.filter(x => x.mine))
      mb.push({ year:L.year, kind:'transfer', pri:1, title:`${s.name} 영입`,
        body:`${s.age}세 ${s.slot}. ${s.text} 조건에 합의했다.` });
    for (const s of rows.filter(x => !x.mine && x.moved).slice(0, 6))
      mb.push({ year:L.year, kind:'league', title:`${s.name} → ${s.team}`,
        body:`${s.age}세 ${s.slot}. ${josa(s.team, '과와')} ${s.text} 조건에 합의했다.` });
  }
  if (kind === 'draft') {
    for (const p of rows.filter(x => x.mine))
      mb.push({ year:L.year, kind:'draft', pri:1,
        title:`전체 ${p.n}순위 ${p.name} 지명`,
        body:`${p.age}세 ${p.origin}. 스카우트가 오래 지켜본 선수다.` });
  }
}
