"""경기 루프 검증. 타석 통계가 아니라 '경기 결과'가 야구처럼 나오는지 본다."""
import random, sys, collections
import roster
from game_engine import play_game

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
teams = roster.make_league(8, seed=1)
rng = random.Random(99)

tot = collections.Counter()
scores = collections.Counter()
margins = collections.Counter()
sp_outs = []
n_pitchers = []
extra = 0

for i in range(N):
    a, b = rng.sample(range(8), 2)
    H, A = play_game(teams[a], teams[b], rng)
    for S in (H, A):
        tot["r"] += S.runs; tot["h"] += S.hits; tot["lob"] += S.lob
        for pl in S.pitchers:
            tot["k"] += pl.k; tot["bb"] += pl.bb; tot["hr"] += pl.hr; tot["outs"] += pl.outs
        for L in S.bat.values():
            tot["sb"] += L.sb; tot["cs"] += L.cs
        sp_outs.append(S.pitchers[0].outs)
        n_pitchers.append(len(S.pitchers))
        scores[min(S.runs, 15)] += 1
    margins[abs(H.runs - A.runs)] += 1
    if len(H.line) > 9: extra += 1

g = N * 2          # 팀-경기 수
ip = tot["outs"] / 3
print(f"표본: {N}경기\n")
print(f"{'항목':<22}{'결과':>10}   {'실제 야구':>14}")
print("-" * 52)
print(f"{'팀당 득점':<22}{tot['r']/g:>10.2f}   {'4.3 ~ 4.8':>14}")
print(f"{'팀당 안타':<22}{tot['h']/g:>10.2f}   {'7.8 ~ 8.7':>14}")
print(f"{'팀당 홈런':<22}{tot['hr']/g:>10.2f}   {'1.0 ~ 1.3':>14}")
print(f"{'9이닝당 삼진':<22}{tot['k']/ip*9:>10.2f}   {'8.0 ~ 9.0':>14}")
print(f"{'9이닝당 볼넷':<22}{tot['bb']/ip*9:>10.2f}   {'3.0 ~ 3.6':>14}")
print(f"{'팀당 잔루':<22}{tot['lob']/g:>10.2f}   {'6.5 ~ 7.5':>14}")
print(f"{'팀당 도루':<22}{tot['sb']/g:>10.2f}   {'0.5 ~ 0.9':>14}")
print(f"{'도루 성공률':<22}{tot['sb']/max(1,tot['sb']+tot['cs'])*100:>9.1f}%   {'70 ~ 80%':>14}")
print(f"{'선발 평균 이닝':<22}{sum(sp_outs)/len(sp_outs)/3:>10.2f}   {'5.0 ~ 5.8':>14}")
print(f"{'경기당 팀 투수 수':<22}{sum(n_pitchers)/len(n_pitchers):>10.2f}   {'3.5 ~ 4.5':>14}")
print(f"{'연장 경기 비율':<22}{extra/N*100:>9.1f}%   {'7 ~ 10%':>14}")
print(f"{'무득점 경기 비율':<22}{scores[0]/g*100:>9.1f}%   {'6 ~ 9%':>14}")
print(f"{'1점차 경기 비율':<22}{margins[1]/N*100:>9.1f}%   {'28 ~ 32%':>14}")

print("\n팀 득점 분포")
for r in range(0, 13):
    bar = "#" * round(scores[r] / g * 200)
    print(f"  {r:>2}점 {scores[r]/g*100:5.1f}% {bar}")
