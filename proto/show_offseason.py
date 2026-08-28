"""한 오프시즌 전체 — 순위 → FA → 트레이드 → 드래프트."""
import sys
import career, contract as C, market, development as dev
from pa_engine import Batter

N = int(sys.argv[1]) if len(sys.argv) > 1 else 14
L = career.League(8, 2030, 84, seed=int(sys.argv[2]) if len(sys.argv) > 2 else 13)
L.rookies_this_year = []
for _ in range(N - 1):
    L.play_season()
    L.offseason()

S, champ = L.play_season()
year = L.year
mark = len(L.history)
L.offseason()
events = [t for (y, t) in L.history[mark:]]

W = 88
print("=" * W)
print(f" {year} 시즌 종료 → {year + 1} 오프시즌".center(W - 12))
print("=" * W)
print(f"{'팀':<14}{'승':>4}{'패':>4}{'승률':>7}{'시장':>6}{'예산':>8}{'연봉총액':>10}{'방향':>10}")
for r in S.standings():
    t = r.team
    print(f"{t.name:<14}{r.w:>4}{r.l:>4}{r.pct:>7.3f}"
          f"{t.finance.market_size:>6.2f}{t.finance.budget:>8.0f}억"
          f"{C.payroll(t, year + 1):>9.0f}억{L.modes[t.team_id]:>10}")
print(f"\n★ {year} 챔피언: {champ.name}")

fa = [e for e in events if e.startswith("[FA]")]
tr = [e for e in events if e.startswith("[트레이드]")]
print("\n" + "-" * W)
print(f" FA 시장 — 총 {len(L.fa_log)}명 계약, "
      f"이적 {sum(1 for (p,t,c,cur) in L.fa_log if t is not cur)}명")
print("-" * W)
big = sorted(L.fa_log, key=lambda x: -x[2].total)[:8]
for (p, t, ct, cur) in big:
    slot = p.position if isinstance(p, Batter) else p.role
    tag = "잔류" if t is cur else f"← {cur.name[:4] if cur else '미계약'}"
    print(f"  {p.name:<6}{p.age}세 {slot:<3} → {t.name[:7]:<9} "
          f"{ct.years}년 {ct.total:>6.1f}억 (연평균 {ct.aav:>5.1f}억)  {tag}")

print("\n" + "-" * W)
print(f" 트레이드 — {len(tr)}건")
print("-" * W)
for e in tr:
    print("  " + e[6:])
if not tr:
    print("  (없음)")

print("\n" + "-" * W)
yr, picks = L.draft_log[-1]
print(f" {yr} 신인 드래프트 1라운드")
print("-" * W)
for (n, rd, t, p, rep) in picks[:8]:
    lo, hi = rep.ovr_range("pot")
    slot = p.position if isinstance(p, Batter) else p.role
    print(f"  {n}. {t.name[:7]:<9} {p.name:<6}{p.age}세 {p.origin} {slot:<3} "
          f"잠재력 {lo:.0f}~{hi:.0f} (확신 {rep.confidence:.0f}%)")
print("=" * W)
