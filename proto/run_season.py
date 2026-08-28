import random, sys
import roster
from season import Season, postseason

year = int(sys.argv[1]) if len(sys.argv) > 1 else 2030
seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1

teams = roster.make_league(8, seed=seed)
S = Season(teams, year=year, games=84, seed=seed * 7 + 1).run()
bw, pw = S.wars()

W = 74
print("=" * W)
print(f"{year} 시즌 최종".center(W - 8))
print("=" * W)
print(f"{'':2}{'팀':<14}{'승':>4}{'패':>4}{'승률':>7}{'게임차':>7}{'득점':>6}{'실점':>6}{'피타고라스':>9}")
st = S.standings()
top = st[0]
for i, r in enumerate(st):
    gb = ((top.w - r.w) + (r.l - top.l)) / 2
    mark = "*" if i < 4 else " "
    print(f"{mark:2}{r.team.name:<14}{r.w:>4}{r.l:>4}{r.pct:>7.3f}"
          f"{('-' if gb == 0 else f'{gb:.1f}'):>7}{r.rs:>6}{r.ra:>6}{r.pyth:>9.3f}")
print(f"\n리그 환경: wOBA {S.lg_woba:.3f} / RA9 {S.lg_ra9:.2f}")

# ---- 타자 -------------------------------------------------------------
qb = sorted(S.qualified_batters(), key=lambda b: -bw[b.p.pid])
print("\n" + "-" * W)
print(f"타자 WAR 상위 10  (규정타석 {int(3.1*84)} 이상, {len(qb)}명 충족)")
print(f"{'선수':<7}{'팀':<10}{'P':>3}{'경기':>5}{'타석':>5}{'타율':>6}{'출루':>6}{'장타':>6}"
      f"{'OPS':>6}{'홈런':>5}{'타점':>5}{'도루':>5}{'WAR':>6}")
for b in qb[:10]:
    print(f"{b.p.name:<7}{b.team.name[:5]:<10}{b.p.position:>3}{b.g:>5}{b.pa:>5}"
          f"{b.avg:>6.3f}{b.obp:>6.3f}{b.slg:>6.3f}{b.ops:>6.3f}"
          f"{b.hr:>5}{b.rbi:>5}{b.sb:>5}{bw[b.p.pid]:>6.1f}")

def title(name, key, rev=True, fmt="{:.3f}", n=3):
    xs = sorted(S.qualified_batters(), key=lambda b: -key(b) if rev else key(b))[:n]
    return f"  {name:<6} " + " | ".join(f"{b.p.name} {fmt.format(key(b))}" for b in xs)

print("\n[타이틀]")
print(title("타율", lambda b: b.avg))
print(title("출루율", lambda b: b.obp))
print(title("장타율", lambda b: b.slg))
print(title("홈런", lambda b: b.hr, fmt="{:.0f}"))
print(title("타점", lambda b: b.rbi, fmt="{:.0f}"))
print(title("도루", lambda b: b.sb, fmt="{:.0f}"))

# ---- 투수 -------------------------------------------------------------
qp = sorted(S.qualified_pitchers(), key=lambda p: -pw[p.p.pid])
print("\n" + "-" * W)
print(f"투수 WAR 상위 10  (규정이닝 {84} 이상, {len(qp)}명 충족)")
print(f"{'선수':<7}{'팀':<10}{'등판':>5}{'선발':>5}{'이닝':>7}{'승':>4}{'패':>4}{'세':>4}"
      f"{'ERA':>7}{'FIP':>7}{'K/9':>6}{'WHIP':>6}{'WAR':>6}")
for p in qp[:10]:
    print(f"{p.p.name:<7}{p.team.name[:5]:<10}{p.g:>5}{p.gs:>5}{p.ip_str:>7}"
          f"{p.w:>4}{p.l:>4}{p.sv:>4}{p.era:>7.2f}{S.fip(p):>7.2f}{p.k9:>6.2f}"
          f"{p.whip:>6.2f}{pw[p.p.pid]:>6.1f}")

allp = sorted(S.pit.values(), key=lambda p: -p.sv)[:3]
print("\n[투수 타이틀]")
qq = S.qualified_pitchers()
print("  ERA    " + " | ".join(f"{p.p.name} {p.era:.2f}"
      for p in sorted(qq, key=lambda x: x.era)[:3]))
print("  탈삼진  " + " | ".join(f"{p.p.name} {p.k}"
      for p in sorted(S.pit.values(), key=lambda x: -x.k)[:3]))
print("  다승    " + " | ".join(f"{p.p.name} {p.w}"
      for p in sorted(S.pit.values(), key=lambda x: -x.w)[:3]))
print("  세이브  " + " | ".join(f"{p.p.name} {p.sv}" for p in allp))

# ---- 시상 -------------------------------------------------------------
cands = ([(bw[b.p.pid], b.p, b.team, "타자") for b in S.bat.values() if b.pa >= 200]
         + [(pw[p.p.pid], p.p, p.team, "투수") for p in S.pit.values() if p.ip >= 50])
cands.sort(key=lambda x: -x[0])
mvp = cands[0]
cy = max(((pw[p.p.pid], p) for p in S.pit.values() if p.ip >= 50), key=lambda x: x[0])
print("\n" + "=" * W)
print(f"MVP        {mvp[1].name} ({mvp[2].name}, {mvp[3]})  WAR {mvp[0]:.1f}")
print(f"최고투수상  {cy[1].p.name} ({cy[1].team.name})  "
      f"{cy[1].w}승 {cy[1].l}패 ERA {cy[1].era:.2f} {cy[1].k}탈삼진  WAR {cy[0]:.1f}")

# ---- 포스트시즌 -------------------------------------------------------
champ, log = postseason(S, random.Random(seed * 31 + 5))
print("-" * W)
for name, w, l, sc in log:
    print(f"{name:<14} {w.name} {sc[0]}승 {sc[1]}패 {l.name}")
print(f"\n★ {year} 챔피언: {champ.name}")
print("=" * W)

# ---- 진단 -------------------------------------------------------------
sp = [p for p in S.pit.values() if p.gs >= p.g * 0.5]
rp = [p for p in S.pit.values() if p.gs < p.g * 0.5]
def agg(g):
    o = sum(p.outs for p in g); r = sum(p.r for p in g)
    return o/3, r*9/(o/3) if o else 0
sip, sera = agg(sp); rip, rera = agg(rp)
print(f"\n[진단] 선발 {len(sp)}명 {sip:.0f}이닝 ERA {sera:.2f}  "
      f"({sip/(sip+rip)*100:.0f}%)  |  불펜 {len(rp)}명 {rip:.0f}이닝 ERA {rera:.2f}")
print(f"       불펜 최다등판 {max(p.g for p in rp)}경기 / 평균 {sum(p.g for p in rp)/len(rp):.1f}경기")
print(f"       FIP 상수 {S.fip_const:.2f}  리그 ERA {sum(p.r for p in S.pit.values())*9/(sum(p.outs for p in S.pit.values())/3):.2f}")
