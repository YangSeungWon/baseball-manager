"""계약 / FA / 트레이드 검증."""
import sys, statistics as st, math
from collections import Counter
import career, contract as C, market, development as dev
from pa_engine import Batter

N = int(sys.argv[1]) if len(sys.argv) > 1 else 40
L = career.League(8, 2030, 84, seed=13)
L.rookies_this_year = []
pay, bud, fa_n, fa_move, fa_big, tr_n, modes = [], [], [], [], [], [], Counter()
trades = []
_orig = market.run_trades
def counting_trades(lg, yr, md, log=None, max_trades=6):
    n = _orig(lg, yr, md, log=log, max_trades=max_trades)
    trades.append(n)
    return n
market.run_trades = counting_trades

for i in range(N):
    L.play_season()
    L.offseason()
    y = L.year
    pay.append([C.payroll(t, y) for t in L.teams])
    bud.append([t.finance.budget for t in L.teams])
    f = getattr(L, "fa_log", [])
    fa_n.append(len(f))
    if f:
        fa_move.append(sum(1 for (p, t, ct, cur) in f if t is not cur) / len(f))
        fa_big.append(max(ct.total for (_, _, ct, _) in f))
    for t in L.teams:
        modes[L.modes[t.team_id]] += 1

flat = lambda xs: [v for row in xs for v in row]
print(f"{N}시즌\n")
print(f"팀 연봉총액   평균 {st.mean(flat(pay)):.0f}억  "
      f"[{min(flat(pay)):.0f} ~ {max(flat(pay)):.0f}]")
print(f"구단 예산     평균 {st.mean(flat(bud)):.0f}억  "
      f"[{min(flat(bud)):.0f} ~ {max(flat(bud)):.0f}]")
over = sum(1 for row_p, row_b in zip(pay, bud) for a, b in zip(row_p, row_b) if a > b * 1.02)
print(f"예산 초과 팀-시즌  {over}/{N*8} ({over/(N*8)*100:.0f}%)")
print(f"\nFA        시즌당 {st.mean(fa_n):.1f}명 계약  "
      f"이적률 {st.mean(fa_move)*100:.0f}%  최대 계약 평균 {st.mean(fa_big):.0f}억")
print(f"트레이드   시즌당 {st.mean(trades):.1f}건")
tot = sum(modes.values())
print(f"팀 방향    " + "  ".join(f"{k} {v/tot*100:.0f}%" for k, v in modes.items()))

# 시장 규모가 성적에 미치는 영향
ms = [t.finance.market_size for t in L.teams]
pct = [L.rec_pct[t.team_id] for t in L.teams]
def corr(xs, ys):
    mx, my = st.mean(xs), st.mean(ys)
    n = sum((a-mx)*(b-my) for a, b in zip(xs, ys))
    d = math.sqrt(sum((a-mx)**2 for a in xs)*sum((b-my)**2 for b in ys))
    return n/d if d else 0

# 통산 우승 분포
ch = Counter(name for _, name in L.champions)
print(f"\n우승 분포 ({N}시즌, 8팀 균등이면 각 {N/8:.1f}회)")
print("  " + "  ".join(f"{n.split()[0]} {c}" for n, c in ch.most_common()))

# 연봉 상위
allp = [(p, t) for t in L.teams for p in t.batters + t.pitchers if p.contract]
allp.sort(key=lambda x: -x[0].contract.salary_in(L.year))
print(f"\n최고 연봉 TOP5 ({L.year})")
for p, t in allp[:5]:
    slot = p.position if isinstance(p, Batter) else p.role
    print(f"  {p.name:<6}{p.age}세 {slot:<3} {t.name[:6]:<8} "
          f"{p.contract.salary_in(L.year):>5.1f}억  ({p.contract})  "
          f"OVR {dev.overall(p):.0f}")

done = [c for c in L.careers.values() if c.retired_year and c.years >= 1]
print(f"\n커리어 길이 평균 {st.mean(c.years for c in done):.1f}시즌 "
      f"(중앙값 {st.median(c.years for c in done):.0f})  "
      f"은퇴 나이 평균 {st.mean(c.p.age for c in done):.1f}세")
