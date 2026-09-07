// 하루가 끝난 경계에서만 쉬고 멈춘다. 경기 도중의 객체는 저장하지 않는다.
export async function simulate(game, days, {
  shouldStop = () => false, cancelled = () => false,
  onDay = () => {}, yieldDay = () => new Promise(resolve => setTimeout(resolve, 0)),
} = {}) {
  const games = [], notices = [];
  let completed = 0, reason = '', important = 0;
  await yieldDay();
  while (completed < days && game.state().phase === 'regular') {
    if (cancelled()) { reason = 'cancelled'; break; }
    const before = game.mail(240).rows.reduce((n, m) => Math.max(n, m.id), 0);
    const result = game.advance(1);
    if (result.error) throw new Error(result.error);
    games.push(...result.games); notices.push(...game.state().notices);
    important += game.state().new_important;
    completed++;
    onDay(completed, days);
    const events = game.mail(240).rows.filter(m => m.id > before);
    if (events.some(shouldStop)) { reason = 'event'; break; }
    await yieldDay();
  }
  game.notices = notices; game.newImportant = important;
  return { games, completed, reason, state:game.state() };
}
