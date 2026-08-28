"""드래프트 검증: 지명 순위가 커리어를 얼마나 예측하는가, 그리고 얼마나 틀리는가."""
import sys, statistics as st
from collections import defaultdict
import career, development as dev

N = int(sys.argv[1]) if len(sys.argv) > 1 else 50
L = career.League(8, 2030, 84, seed=17)
L.rookies_this_year = []
for _ in range(N):
    L.play_season()
    L.offseason()

# 커리어가 충분히 끝난 세대만 (마지막 15시즌 지명자는 제외)
cutoff = L.year - 15
rows = []
for yr, picks in L.draft_log:
    if yr > cutoff:
        continue
    for (n, rd, t, p, rep) in picks:
        c = L.careers[p.pid]
        rows.append(dict(pick=n, rd=rd, war=c.war, yrs=c.years,
                         peak=c.peak_war, scouted=rep.pot,
                         true=dev.potential_overall(p) if not c.seasons
                              else getattr(c, "true_pot", rep.pot),
                         made=1 if c.seasons else 0,
                         origin=p.origin))

print(f"{N}시즌, 분석 대상 {len(rows)}명 (지명 {cutoff - 2030 + 1}개 학년)\n")


def band(lo, hi, label):
    g = [r for r in rows if lo <= r["pick"] <= hi]
    if not g:
        return
    made = [r for r in g if r["made"]]
    print(f"{label:<14}{len(g):>5}{sum(r['made'] for r in g)/len(g)*100:>8.0f}%"
          f"{st.mean(r['war'] for r in g):>9.1f}"
          f"{(st.mean(r['war'] for r in made) if made else 0):>9.1f}"
          f"{sum(1 for r in g if r['war'] >= 20)/len(g)*100:>8.0f}%"
          f"{sum(1 for r in g if r['war'] >= 5)/len(g)*100:>8.0f}%"
          f"{sum(1 for r in g if r['made'] and r['war'] < 3)/len(g)*100:>8.0f}%")


print(f"{'구간':<14}{'인원':>5}{'1군진입':>9}{'평균WAR':>9}{'진입자만':>9}"
      f"{'스타율':>8}{'성공률':>8}{'실패율':>8}")
print(f"{'':14}{'':>5}{'':>9}{'':>9}{'':>9}{'20+':>8}{'5+':>8}{'<3':>8}")
print("-" * 72)
band(1, 8, "1라운드")
band(9, 16, "2라운드")
band(17, 24, "3라운드")
band(25, 32, "4라운드")
print("-" * 72)
band(1, 1, "  전체 1순위")
band(1, 3, "  전체 1~3순위")

# 스카우팅 정확도
import math
def corr(xs, ys):
    mx, my = st.mean(xs), st.mean(ys)
    num = sum((a-mx)*(b-my) for a, b in zip(xs, ys))
    den = math.sqrt(sum((a-mx)**2 for a in xs) * sum((b-my)**2 for b in ys))
    return num/den if den else 0

print(f"\n지명순위 ↔ 통산 WAR 상관계수  {corr([-r['pick'] for r in rows], [r['war'] for r in rows]):.3f}"
      f"   (완벽한 스카우팅 대조군 0.552)")

# 고졸 vs 대졸
for og in ("고졸", "대졸"):
    g = [r for r in rows if r["origin"] == og]
    if g:
        print(f"{og}  지명 {len(g):>4}명  1군진입 {sum(r['made'] for r in g)/len(g)*100:>3.0f}%  "
              f"평균 WAR {st.mean(r['war'] for r in g):>5.1f}  "
              f"스타(20+) {sum(1 for r in g if r['war']>=20)/len(g)*100:>4.1f}%  "
              f"평균 커리어 {st.mean(r['yrs'] for r in g):.1f}시즌")

# 가장 큰 성공과 실패
rows.sort(key=lambda r: -r["war"])
print("\n최고의 하위 지명 (3~4라운드 출신 TOP3)")
for r in [x for x in rows if x["rd"] >= 3][:3]:
    print(f"  전체 {r['pick']:>2}순위 ({r['rd']}R) {r['origin']}  통산 WAR {r['war']:>5.1f}  {r['yrs']}시즌")
print("최악의 상위 지명 (전체 1~8순위 중 WAR 최하위 3명)")
for r in sorted([x for x in rows if x["pick"] <= 8], key=lambda r: r["war"])[:3]:
    print(f"  전체 {r['pick']:>2}순위 ({r['origin']})  통산 WAR {r['war']:>5.1f}  "
          f"{'1군 밟지 못함' if not r['made'] else str(r['yrs'])+'시즌'}")
