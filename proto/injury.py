"""
Project Dugout - Injury Engine

두 단계로 나눈다.
  1) 발생 (InjuryRisk)  — 매 출전마다 굴린다. 나이 / 부상 성향 / 피로가 좌우한다.
  2) 심각도 (Severity)  — 결장 일수를 뽑는다.
그리고 중상 이상은 **능력치와 잠재력에 영구 손상**을 남긴다.
이 영구 손상이 커리어 서사를 만든다. 팔꿈치를 다친 파이어볼러는 다시는
그 구속을 되찾지 못한다.
"""
import development as dev
from pa_engine import Batter

# 출전 1회당 기본 부상 확률
BASE = {"BAT": 0.0063, "SP": 0.0170, "RP": 0.0078}

# 심각도 구간: (누적확률, 최소일, 최대일, 이름)
SEVERITY_BAT = [(0.56, 4, 15, "경상"), (0.86, 16, 45, "중경상"),
                (0.97, 46, 120, "중상"), (1.01, 150, 260, "시즌아웃")]
SEVERITY_PIT = [(0.48, 4, 15, "경상"), (0.80, 16, 45, "중경상"),
                (0.94, 46, 130, "중상"), (1.01, 160, 330, "시즌아웃")]

# 영구 손상 대상 (중상 이상). 능력별 손상 배율.
DAMAGE_BAT = {"speed": 1.00, "fielding": 0.60, "contact": 0.28,
              "gap_power": 0.22, "hr_power": 0.18, "avoid_k": 0.15}
DAMAGE_PIT = {"stuff": 1.00, "stamina": 0.80, "movement": 0.35, "command": 0.30}


def _age_factor(age):
    """25세까지는 오히려 덜 다치고, 28세부터 가파르게 오른다."""
    if age <= 25:
        return 0.80
    return 1.0 + 0.052 * max(0, age - 27)


def risk(p, rng, fatigue=0.0, workload=1.0):
    kind = "BAT" if isinstance(p, Batter) else ("SP" if p.role == "SP" else "RP")
    prone = p.hidden["injury_prone"]
    f = BASE[kind]
    f *= 0.55 + 0.90 * (prone / 50.0)          # 0.55 ~ 2.0
    f *= _age_factor(p.age)
    f *= 1.0 + 0.85 * max(0.0, fatigue)        # 지친 투수가 다친다
    f *= workload
    return min(0.25, f)


def roll(p, rng, fatigue=0.0, workload=1.0):
    """다치면 (일수, 등급명), 아니면 None."""
    if p.injury_days > 0:
        return None
    if rng.random() >= risk(p, rng, fatigue, workload):
        return None
    table = SEVERITY_BAT if isinstance(p, Batter) else SEVERITY_PIT
    r = rng.random()
    for cut, lo, hi, label in table:
        if r < cut:
            return rng.randint(lo, hi), label
    return rng.randint(4, 15), "경상"


def apply(p, days, rng):
    """부상 적용. 중상(46일) 이상이면 영구 손상을 남긴다."""
    p.injury_days = days
    p.career_injury_days = getattr(p, "career_injury_days", 0) + days
    p.career_injuries = getattr(p, "career_injuries", 0) + 1
    if days < 46:
        return None

    scale = min(1.0, (days - 45) / 190.0)
    table = DAMAGE_BAT if isinstance(p, Batter) else DAMAGE_PIT
    lost = {}
    for attr, mult in table.items():
        d = 6.5 * scale * mult * rng.uniform(0.5, 1.5)
        cur = getattr(p, attr)
        setattr(p, attr, max(20.0, cur - d))
        p.pot[attr] = max(20.0, p.pot[attr] - d * 0.75)   # 잠재력도 깎인다
        if d >= 1.0:
            lost[attr] = d
    # 한 번 다친 몸은 또 다친다
    p.hidden["injury_prone"] = min(80.0, p.hidden["injury_prone"] + 5.0 * scale)
    return lost
