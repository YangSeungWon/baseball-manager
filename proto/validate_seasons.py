"""여러 시즌을 돌려 '리그 기록'이 야구다운 범위에 있는지 본다."""
import random, sys, statistics as st
import roster
from season import Season

N = int(sys.argv[1]) if len(sys.argv) > 1 else 20
rows = []
for s in range(N):
    teams = roster.make_league(8, seed=1000 + s)
    S = Season(teams, year=2030 + s, games=84, seed=s * 7 + 3).run()
    bw, pw = S.wars()
    qb, qp = S.qualified_batters(), S.qualified_pitchers()
    stand = S.standings()
    rows.append(dict(
        best=stand[0].w, worst=stand[-1].w,
        spread=st.pstdev([r.w for r in stand]),
        avg=max(b.avg for b in qb),
        hr=max(b.hr for b in S.bat.values()),
        rbi=max(b.rbi for b in S.bat.values()),
        sb=max(b.sb for b in S.bat.values()),
        era=min(p.era for p in qp),
        k=max(p.k for p in S.pit.values()),
        w=max(p.w for p in S.pit.values()),
        sv=max(p.sv for p in S.pit.values()),
        bwar=max(bw.values()), pwar=max(pw.values()),
        lgavg=sum(b.h for b in S.bat.values()) / sum(b.ab for b in S.bat.values()),
        lgera=sum(p.r for p in S.pit.values()) * 27 / sum(p.outs for p in S.pit.values()),
        qb=len(qb), qp=len(qp),
    ))

def show(label, key, fmt="{:.0f}", real=""):
    v = [r[key] for r in rows]
    print(f"{label:<20}{fmt.format(st.mean(v)):>8}  "
          f"[{fmt.format(min(v))} ~ {fmt.format(max(v))}]{'':4}{real}")

print(f"{N}시즌 (팀당 84경기)\n")
print(f"{'항목':<20}{'평균':>8}  {'최소~최대':<16}  실제 야구(84경기 환산)")
print("-" * 74)
show("1위 팀 승수", "best", real="50 ~ 56")
show("최하위 팀 승수", "worst", real="28 ~ 34")
show("팀 승수 표준편차", "spread", "{:.1f}", "5 ~ 8")
print("-" * 74)
show("타율 1위", "avg", "{:.3f}", ".330 ~ .360")
show("홈런 1위", "hr", real="24 ~ 33")
show("타점 1위", "rbi", real="60 ~ 80")
show("도루 1위", "sb", real="20 ~ 35")
show("타자 최고 WAR", "bwar", "{:.1f}", "4.5 ~ 6.5")
print("-" * 74)
show("ERA 1위", "era", "{:.2f}", "1.90 ~ 2.60")
show("탈삼진 1위", "k", real="110 ~ 160")
show("다승 1위", "w", real="11 ~ 15")
show("세이브 1위", "sv", real="22 ~ 30")
show("투수 최고 WAR", "pwar", "{:.1f}", "3.5 ~ 5.5")
print("-" * 74)
show("리그 타율", "lgavg", "{:.3f}", ".250 ~ .265")
show("리그 RA9", "lgera", "{:.2f}", "4.30 ~ 4.80")
show("규정타석 충족", "qb", real="45 ~ 60 (8팀)")
show("규정이닝 충족", "qp", real="30 ~ 40 (8팀)")
