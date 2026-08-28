"""한 선수의 커리어 전체를 출력한다. 이 장르의 감정적 보상이 나오는 화면."""
import sys, statistics as st
import career, development as dev

N = int(sys.argv[1]) if len(sys.argv) > 1 else 40
L = career.League(8, 2030, 84, seed=int(sys.argv[2]) if len(sys.argv) > 2 else 11)
L.rookies_this_year = []
for _ in range(N):
    L.play_season()
    L.offseason()

pick = sys.argv[3] if len(sys.argv) > 3 else "war"
pool = [c for c in L.careers.values() if c.kind == "B" and c.years >= 8]
if pick == "injured":     # 부상으로 커리어가 꺾인 선수를 고른다
    pool = [c for c in pool if getattr(c, "injuries", 0) >= 1 and c.peak_war >= 3.5]
    best = max(pool, key=lambda c: c.peak_war)
else:
    best = max(pool, key=lambda c: c.war)
p = best.p
print("=" * 82)
print(f" {p.name}   {p.position}  {p.bats}타  "
      f"{'현역' if not best.retired_year else '은퇴'}   "
      f"데뷔 {p.debut_year}"
      + (f" ~ 은퇴 {best.retired_year} ({p.age}세)" if best.retired_year else f" (現 {p.age}세)"))
aw = "  ".join(f"{k} {v}회" for k, v in best.awards.items())
print(f" 통산 WAR {best.war:.1f}   {best.years}시즌   {aw}")
print("=" * 82)
print(f"{'연도':<6}{'나이':>4}{'팀':<12}{'경기':>5}{'타석':>5}{'타율':>6}{'출루':>6}{'장타':>6}"
      f"{'홈런':>5}{'타점':>5}{'도루':>5}{'WAR':>6}")
print("-" * 82)
ev = {}
for (y, txt) in best.events:
    ev.setdefault(y, []).append(txt)
for (yr, tm, l, war, age) in best.seasons:
    star = " ★" if war >= 5 else ("  ·" if war >= 3.5 else "")
    if yr in ev:
        star += "   ⚠ " + ", ".join(ev[yr])
    print(f"{yr:<6}{age:>4}{tm[:6]:<12}{l.g:>5}{l.pa:>5}{l.avg:>6.3f}{l.obp:>6.3f}"
          f"{l.slg:>6.3f}{l.hr:>5}{l.rbi:>5}{l.sb:>5}{war:>6.1f}{star}")
print("-" * 82)
tot = lambda f: best.tot(f)
ab, h = tot("ab"), tot("h")
tb = tot("h") - tot("b2") - tot("b3") - tot("hr") + 2*tot("b2") + 3*tot("b3") + 4*tot("hr")
print(f"{'통산':<6}{'':>4}{'':<12}{tot('g'):>5}{tot('pa'):>5}{h/ab:>6.3f}"
      f"{(h+tot('bb')+tot('hbp'))/tot('pa'):>6.3f}{tb/ab:>6.3f}"
      f"{tot('hr'):>5}{tot('rbi'):>5}{tot('sb'):>5}{best.war:>6.1f}")

print(f"\n[능력치 현재]  " + "  ".join(
    f"{a} {getattr(p,a):.0f}" for a in dev.attrs_of(p)))
print(f"[부상 이력]    통산 {getattr(p,'career_injuries',0)}회 / {getattr(p,'career_injury_days',0)}일 결장")
print(f"[숨은 성향]    노화유형 {p.hidden['aging_profile']}  "
      f"성실성 {p.hidden['work_ethic']:.0f}  프로의식 {p.hidden['professionalism']:.0f}")

print("\n" + "=" * 82)
print(" 리그 역사 (최근 15줄)")
print("=" * 82)
for yr, txt in L.history[-15:]:
    print(f"  {yr}  {txt}")
