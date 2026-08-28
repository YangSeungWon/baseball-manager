"""리그 통계 검증 툴. 엔진이 '야구처럼' 나오는지 확인한다."""
import random, sys
from pa_engine import *

class Line:
    __slots__ = ("pa","ab","h","b2","b3","hr","bb","k","hbp","gb","ld","fb","pu")
    def __init__(self):
        for s in self.__slots__: setattr(self, s, 0)
    def add(self, res, bbt):
        self.pa += 1
        if bbt: setattr(self, bbt.lower(), getattr(self, bbt.lower()) + 1)
        if res == K: self.ab += 1; self.k += 1
        elif res == BB: self.bb += 1
        elif res == HBP: self.hbp += 1
        elif res == OUT: self.ab += 1
        else:
            self.ab += 1; self.h += 1
            if res == D2B: self.b2 += 1
            elif res == T3B: self.b3 += 1
            elif res == HR: self.hr += 1
    @property
    def avg(self): return self.h / self.ab
    @property
    def obp(self): return (self.h + self.bb + self.hbp) / self.pa
    @property
    def slg(self):
        tb = (self.h - self.b2 - self.b3 - self.hr) + 2*self.b2 + 3*self.b3 + 4*self.hr
        return tb / self.ab
    @property
    def babip(self):
        d = self.ab - self.k - self.hr
        return (self.h - self.hr) / d
    def row(self, name):
        return (f"{name:<26} {self.avg:.3f} {self.obp:.3f} {self.slg:.3f} "
                f"{self.obp+self.slg:.3f}  BB {self.bb/self.pa*100:5.2f}%  "
                f"K {self.k/self.pa*100:5.2f}%  HR {self.hr/self.pa*100:5.2f}%  "
                f"BABIP {self.babip:.3f}")

def run(bat, pit, n, seed=1, dfn=NEUTRAL_DEF, park=NEUTRAL_PARK, ctx=NEUTRAL_CTX):
    rng = random.Random(seed)
    L = Line()
    for _ in range(n):
        L.add(*simulate_pa(bat, pit, dfn, park, ctx, rng))
    return L

N = int(sys.argv[1]) if len(sys.argv) > 1 else 400_000

print("=" * 118)
print("TARGET  (리그 평균 목표)      .250  .325  .410  .735   BB  8.50%  K 20.00%  HR  3.00%  BABIP .300")
print("=" * 118)

# 1) 리그 평균 vs 리그 평균 (좌우 섞임을 흉내내기 위해 절반은 반대손)
rng = random.Random(7)
L = Line()
for i in range(N):
    b = Batter(bats="L" if i % 3 == 0 else "R")
    p = Pitcher(throws="L" if i % 4 == 0 else "R")
    L.add(*simulate_pa(b, p, rng=rng))
print(L.row("리그 평균 vs 평균"))
print(f"{'':26} 타구: GB {L.gb/(L.gb+L.ld+L.fb+L.pu)*100:.1f}%  LD {L.ld/(L.gb+L.ld+L.fb+L.pu)*100:.1f}%  "
      f"FB {L.fb/(L.gb+L.ld+L.fb+L.pu)*100:.1f}%  PU {L.pu/(L.gb+L.ld+L.fb+L.pu)*100:.1f}%")
print("-" * 118)

# 2) 타자 등급별 (vs 평균 투수)
grades = [("40 (대체선수)", 40), ("50 (리그 평균)", 50), ("60 (준수한 주전)", 60),
          ("70 (올스타)", 70), ("80 (MVP급)", 80)]
for name, g in grades:
    b = Batter(contact=g, avoid_k=g, discipline=g, gap_power=g, hr_power=g, speed=50)
    print(run(b, Pitcher(), N, seed=g).row("타자 " + name))
print("-" * 118)

# 3) 투수 등급별 (vs 평균 타자)
for name, g in grades:
    p = Pitcher(stuff=g, command=g, movement=g)
    print(run(Batter(), p, N, seed=g+1).row("투수 " + name))
print("-" * 118)

# 4) 유형별 개성 확인
cases = [
    ("컨택형 (컨택80/파워30)", Batter(contact=80, avoid_k=75, discipline=55, hr_power=30, gap_power=55, speed=65), Pitcher()),
    ("거포형 (파워80/컨택35)", Batter(contact=35, avoid_k=30, discipline=65, hr_power=80, gap_power=70, speed=40), Pitcher()),
    ("탈삼진 투수 (구위75/제구40)", Batter(), Pitcher(stuff=75, command=40, movement=55)),
    ("땅볼 투수 (GB75/구위45)", Batter(), Pitcher(stuff=45, command=60, movement=65, gb_tendency=75)),
    ("좋은 수비 뒤 평균 투수", Batter(), Pitcher()),
    ("나쁜 수비 뒤 평균 투수", Batter(), Pitcher()),
    ("타자구장 (HR +0.35)", Batter(), Pitcher()),
    ("지친 투수 (fatigue 1.0)", Batter(), Pitcher()),
]
for i, (name, b, p) in enumerate(cases):
    d, pk, cx = NEUTRAL_DEF, NEUTRAL_PARK, NEUTRAL_CTX
    if "좋은 수비" in name: d = Defense(infield=70, outfield=70)
    if "나쁜 수비" in name: d = Defense(infield=30, outfield=30)
    if "타자구장" in name: pk = Park(hr_factor=0.35, hit_factor=0.05)
    if "지친" in name: cx = Context(fatigue=1.0, times_through=3)
    print(run(b, p, N, seed=100+i, dfn=d, park=pk, ctx=cx).row(name))
print("-" * 118)

# 5) 플래툰 (같은 손 vs 반대 손)
print(run(Batter(bats="R"), Pitcher(throws="R"), N, seed=55).row("우타자 vs 우투수 (동일손)"))
print(run(Batter(bats="R"), Pitcher(throws="L"), N, seed=56).row("우타자 vs 좌투수 (반대손)"))
print("=" * 118)
