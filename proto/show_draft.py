"""드래프트 보드 vs 실제 결과. 스카우팅이 무엇을 놓쳤는지 보여준다."""
import sys
import career, development as dev
from pa_engine import Batter

N = int(sys.argv[1]) if len(sys.argv) > 1 else 34
SHOW = int(sys.argv[2]) if len(sys.argv) > 2 else 3     # 몇 년차 드래프트를 볼지

L = career.League(8, 2030, 84, seed=int(sys.argv[3]) if len(sys.argv) > 3 else 21)
L.rookies_this_year = []
for _ in range(N):
    L.play_season()
    L.offseason()

year, picks = L.draft_log[SHOW]
print("=" * 96)
print(f" {year} 신인 드래프트  —  {L.year - 1}년 시점에서 되돌아본 결과")
print("=" * 96)
print(f"{'순위':<5}{'지명팀':<13}{'선수':<7}{'출신':<6}{'P':>4}"
      f"{'지명당시 평가':>14}{'확신':>6}   │{'실제 결과':>26}")
print("-" * 96)
for (n, rd, t, p, rep) in picks[:16]:
    c = L.careers[p.pid]
    lo, hi = rep.ovr_range("pot")
    slot = p.position if isinstance(p, Batter) else p.role
    if c.seasons:
        aw = "".join("★" for _ in range(c.awards.get("MVP", 0) + c.awards.get("최고투수", 0)))
        res = f"{c.years}시즌 WAR {c.war:>5.1f} {aw}"
    else:
        res = "1군 진입 실패"
    mark = "◎" if c.war >= 20 else ("○" if c.war >= 5 else ("×" if c.war < 1 else " "))
    print(f"{n:<5}{t.name[:6]:<13}{p.name:<7}{p.origin:<6}{slot:>4}"
          f"{f'{lo:.0f}~{hi:.0f}':>14}{rep.confidence:>5.0f}%   │ {mark} {res:>24}")

print("\n" + "=" * 96)
print(" 이 학년에서 가장 크게 빗나간 평가")
print("=" * 96)
scored = [(n, rd, t, p, rep, L.careers[p.pid]) for (n, rd, t, p, rep) in picks]
bust = min([x for x in scored if x[0] <= 8], key=lambda x: x[5].war, default=None)
gem = max([x for x in scored if x[0] > 8], key=lambda x: x[5].war, default=None)
for tag, x in (("실패", bust), ("발굴", gem)):
    if not x:
        continue
    n, rd, t, p, rep, c = x
    lo, hi = rep.ovr_range("pot")
    print(f"\n[{tag}] 전체 {n}순위  {p.name} ({p.origin}, {t.name})")
    print(f"  지명 당시 스카우팅: 잠재력 {lo:.0f}~{hi:.0f}  확신도 {rep.confidence:.0f}%")
    print(f"  실제 잠재력: {dev.potential_overall(p):.0f}")
    print(f"  코멘트: {rep.text()}")
    print(f"  결과: {c.years}시즌  통산 WAR {c.war:.1f}"
          + (f"  최고 시즌 {c.peak_war:.1f}" if c.seasons else ""))
