// 플레이어가 실제로 본 리포트만 기록한다. 숨겨진 능력치에는 접근하지 않는다.
export function experience(game) {
  const e = game.experience ||= {};
  e.watched ||= []; e.guide ||= {}; e.stops ||= { injury:true, owner:true, contract:true, transfer:true };
  return e;
}
export function watchPlayer(game, p) {
  const e = experience(game), found = e.watched.find(x => x.pid === p.pid);
  if (found) { e.watched = e.watched.filter(x => x !== found); return false; }
  e.watched.push({ pid:p.pid, name:p.name, year:game.state().year,
    ovr:{ ...p.ovr }, pot:{ ...p.pot }, confidence:p.confidence, war:p.career_war || 0 });
  return true;
}
export function updateChallenge(game) {
  const c = experience(game).challenge;
  if (!c || c.result) return c;
  const s = game.state();
  const finished = s.phase === 'postseason' || s.phase.startsWith('off_');
  const mine = game.standings().rows.find(x => x.is_user);
  if (finished && mine?.playoff) c.result = 'success';
  else if (s.year > c.start + 2 || (s.year === c.start + 2 && finished)) c.result = 'ended';
  if (c.result) c.end = s.year;
  return c;
}
