"""장기 시뮬레이션 검증: 리그 환경이 표류하지 않는가, 나이 곡선이 야구다운가."""
import sys, statistics as st
from collections import defaultdict
import career, development as dev
from pa_engine import Batter

N = int(sys.argv[1]) if len(sys.argv) > 1 else 50
L = career.League(8, 2030, 84, seed=11)
L.rookies_this_year = []

env = []
inj = []
snap = defaultdict(lambda: defaultdict(list))
for i in range(N):
    S, champ = L.play_season()
    ab = sum(b.ab for b in S.bat.values()); h = sum(b.h for b in S.bat.values())
    hr = sum(b.hr for b in S.bat.values()); pa = sum(b.pa for b in S.bat.values())
    outs = sum(p.outs for p in S.pit.values()); r = sum(p.r for p in S.pit.values())
    k = sum(p.k for p in S.pit.values())
    inj.append((len(S.injuries), sum(x[3] for x in S.injuries),
                sum(1 for x in S.injuries if x[3] >= 46),
                len([b for b in S.bat.values() if b.pa > 0])))
    ages = [p.age for t in L.teams for p in t.lineup + t.rotation]
    for t in L.teams:
        for p in t.batters + t.pitchers + t.farm:
            for a in dev.attrs_of(p):
                snap[p.age][a].append(getattr(p, a))
            snap[p.age]["_ovr"].append(dev.overall(p))
    env.append(dict(year=L.year, avg=h/ab, hr=hr/pa, ra9=r*27/outs, k=k/pa,
                    age=st.mean(ages)))
    L.offseason()

print(f"{N}시즌 장기 시뮬레이션 (8팀 × 84경기)\n")
print(f"{'구간':<12}{'리그타율':>9}{'HR/PA':>8}{'K/PA':>8}{'RA9':>8}{'주전평균나이':>11}")
print("-" * 58)
for lo in range(0, N, max(1, N // 5)):
    ch = env[lo:lo + max(1, N // 5)]
    print(f"{ch[0]['year']}-{ch[-1]['year']:<7}"
          f"{st.mean(c['avg'] for c in ch):>9.3f}{st.mean(c['hr'] for c in ch):>8.3f}"
          f"{st.mean(c['k'] for c in ch):>8.3f}{st.mean(c['ra9'] for c in ch):>8.2f}"
          f"{st.mean(c['age'] for c in ch):>11.1f}")
drift = lambda f: st.mean(f(c) for c in env[-10:]) - st.mean(f(c) for c in env[:10])
print(f"\n표류(마지막10시즌 - 첫10시즌): 타율 {drift(lambda c: c['avg']):+.4f}  "
      f"RA9 {drift(lambda c: c['ra9']):+.3f}  나이 {drift(lambda c: c['age']):+.2f}")

# --- 나이별 생산성 곡선 -------------------------------------------------
byage_b = defaultdict(lambda: [0.0, 0])
byage_p = defaultdict(lambda: [0.0, 0])
for c in L.careers.values():
    for (yr, tm, line, war, age) in c.seasons:
        if c.kind == "B" and line.pa >= 100:
            byage_b[age][0] += war; byage_b[age][1] += 1
        elif c.kind == "P" and line.outs >= 90:
            byage_p[age][0] += war; byage_p[age][1] += 1

print("\n나이별 평균 WAR (규정 근접 시즌만)")
print(f"{'나이':<5}{'타자':>8}{'표본':>7}   {'투수':>8}{'표본':>7}")
for a in range(19, 41):
    b, p = byage_b.get(a), byage_p.get(a)
    if not b and not p: continue
    bs = f"{b[0]/b[1]:>8.2f}{b[1]:>7}" if b and b[1] >= 5 else f"{'-':>8}{(b[1] if b else 0):>7}"
    ps = f"{p[0]/p[1]:>8.2f}{p[1]:>7}" if p and p[1] >= 5 else f"{'-':>8}{(p[1] if p else 0):>7}"
    mark = " ←" if a in (26, 27, 28) else ""
    print(f"{a:<5}{bs}   {ps}{mark}")

print(f"\n부상: 시즌당 {st.mean(x[0] for x in inj):.1f}건 (팀당 {st.mean(x[0] for x in inj)/8:.1f}건)  "
      f"평균 결장 {st.mean(x[1] for x in inj)/st.mean(x[0] for x in inj):.0f}일  "
      f"중상 이상 {st.mean(x[2] for x in inj):.1f}건  "
      f"시즌당 출전 타자 {st.mean(x[3] for x in inj):.0f}명")

# --- 노화 모델 자체 검증 (선택편향 없이 전 선수 능력치를 나이별로) --------
print("\n나이별 평균 능력치 (1군+2군 전원, 선택편향 없음)")
print(f"{'나이':<5}{'전체':>7}{'컨택':>7}{'파워':>7}{'선구':>7}{'주력':>7}{'수비':>7}"
      f"{'구위':>7}{'제구':>7}{'표본':>6}")
for a in sorted(snap):
    d = snap[a]
    if len(d["_ovr"]) < 40: continue
    f = lambda k: f"{st.mean(d[k]):>7.1f}" if d.get(k) else f"{'-':>7}"
    print(f"{a:<5}{st.mean(d['_ovr']):>7.1f}{f('contact')}{f('hr_power')}"
          f"{f('discipline')}{f('speed')}{f('fielding')}{f('stuff')}{f('command')}"
          f"{len(d['_ovr']):>6}")

# --- 커리어 분포 --------------------------------------------------------
done = [c for c in L.careers.values() if c.retired_year and c.years >= 1]
if done:
    print(f"\n은퇴 선수 {len(done)}명")
    print(f"  1군 커리어 길이  평균 {st.mean(c.years for c in done):.1f}시즌 "
          f"(중앙값 {st.median(c.years for c in done):.0f}, 최장 {max(c.years for c in done)})")
    rage = [c.p.age for c in done]
    print(f"  은퇴 나이        평균 {st.mean(rage):.1f}세 "
          f"[{min(rage)} ~ {max(rage)}]")
    print(f"  통산 WAR 5 이상  {sum(1 for c in done if c.war >= 5)/len(done)*100:.0f}%"
          f"   / 20 이상 {sum(1 for c in done if c.war >= 20)/len(done)*100:.1f}%")

# --- 통산 기록 ----------------------------------------------------------
bats = [c for c in L.careers.values() if c.kind == "B" and c.years >= 3]
pits = [c for c in L.careers.values() if c.kind == "P" and c.years >= 3]
print("\n통산 홈런 TOP5")
for c in sorted(bats, key=lambda c: -c.tot("hr"))[:5]:
    print(f"  {c.p.name:<5} {c.tot('hr'):>4}홈런  {c.years:>2}시즌  통산 WAR {c.war:>5.1f}"
          f"  {'(현역)' if not c.retired_year else f'({c.p.debut_year}~{c.retired_year})'}")
print("통산 WAR TOP5")
for c in sorted(bats + pits, key=lambda c: -c.war)[:5]:
    aw = " ".join(f"{k}×{v}" for k, v in c.awards.items())
    print(f"  {c.p.name:<5} WAR {c.war:>5.1f}  {c.years:>2}시즌  {aw}")
