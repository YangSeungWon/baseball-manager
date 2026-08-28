"""
Project Dugout - Development / Aging Engine

설계 핵심
  1. **능력마다 노화 곡선이 다르다.** 주력은 23세 정점 후 급락, 선구안·제구는
     28세 정점 후 완만한 하락. 이게 '수비형 유격수가 30세에 무너지고
     선구안 좋은 1루수는 35세까지 버티는' 야구다운 커리어를 만든다.
  2. **잠재력은 고정값이 아니다.** 매년 흔들린다. 그래야 늦게 터지는 선수와
     끝내 터지지 않는 유망주가 동시에 존재한다.
  3. **베테랑도 처음엔 18세였다.** 초기 리그의 30세 선수는 난수로 찍어내지 않고
     18세 유망주를 만든 뒤 성장 엔진을 12번 돌려서 만든다. 그래야 리그의
     나이-능력 분포가 성장 모델과 자동으로 일치한다.
"""
import math
import random
from pa_engine import Batter, Pitcher

BAT_ATTRS = ["contact", "avoid_k", "discipline", "gap_power", "hr_power",
             "speed", "fielding"]
PIT_ATTRS = ["stuff", "command", "movement", "stamina"]

# 능력별 (정점나이, 성장계수, 하락계수)
AGING = {
    "contact":    (26.0, 1.00, 1.00),
    "avoid_k":    (27.0, 0.85, 0.80),
    "discipline": (28.5, 0.80, 0.50),
    "gap_power":  (27.0, 1.00, 0.85),
    "hr_power":   (28.0, 1.05, 0.75),
    "speed":      (23.0, 0.70, 1.95),
    "fielding":   (25.0, 0.75, 1.25),
    "stuff":      (25.0, 1.00, 1.30),
    "command":    (28.5, 0.90, 0.55),
    "movement":   (27.0, 0.90, 0.75),
    "stamina":    (26.0, 0.80, 0.95),
}

# 노화 유형: (정점나이 보정, 하락계수 보정, 성장계수 보정)
AGING_PROFILES = {
    "EarlyPeak":    (-2.0, 1.15, 1.20),
    "Normal":       (0.0, 1.00, 1.00),
    "LateBloomer":  (+2.5, 0.95, 0.80),
    "SlowDecline":  (+1.0, 0.70, 0.95),
    "RapidDecline": (-1.0, 1.45, 1.05),
}
PROFILE_WEIGHTS = [0.16, 0.42, 0.16, 0.14, 0.12]

GROWTH_RATE = 0.165      # 잠재력까지 남은 격차를 매년 이만큼 좁힌다 (최대치)
DECLINE_BASE = 0.34      # 정점 이후 연간 기본 하락폭
YOUTH_FLOOR = 17.0       # 성장 곡선의 시작 나이


def _clamp(v, lo=20.0, hi=80.0):
    return max(lo, min(hi, v))


def make_hidden(rng):
    prof = rng.choices(list(AGING_PROFILES), weights=PROFILE_WEIGHTS)[0]
    return {
        "work_ethic":      _clamp(rng.gauss(50, 14)),
        "professionalism": _clamp(rng.gauss(50, 14)),
        "consistency":     _clamp(rng.gauss(50, 13)),
        "injury_prone":    _clamp(rng.gauss(50, 15)),
        "ambition":        _clamp(rng.gauss(50, 15)),
        "aging_profile":   prof,
        "decline_rate":    max(0.45, rng.gauss(1.0, 0.22)),
        "dev_rate":        max(0.40, rng.gauss(1.0, 0.26)),
        # 계약 협상에서 무엇을 중시하는가 (합이 1이 되도록 정규화해서 쓴다)
        "w_money":         max(0.15, rng.gauss(1.00, 0.35)),
        "w_winning":       max(0.05, rng.gauss(0.55, 0.30)),
        "w_playtime":      max(0.05, rng.gauss(0.45, 0.25)),
        "w_loyalty":       max(0.00, rng.gauss(0.18, 0.20)),
    }


def peak_age_for(p, attr):
    off = AGING_PROFILES[p.hidden["aging_profile"]][0]
    return AGING[attr][0] + off + p.hidden.get("peak_shift", 0.0)


def attrs_of(p):
    return BAT_ATTRS if isinstance(p, Batter) else PIT_ATTRS


# ---------------------------------------------------------------------------
# 한 살 먹기
# ---------------------------------------------------------------------------
def develop(p, rng, playing_time=1.0, coaching=1.0):
    """선수를 1년 성장/노화시킨다. playing_time 은 0.0~1.3 (출전 기회)."""
    h = p.hidden
    prof = AGING_PROFILES[h["aging_profile"]]
    ethic = 0.65 + 0.7 * (h["work_ethic"] / 50.0)          # 0.65 ~ 1.75
    pt = 0.55 + 0.45 * min(playing_time, 1.3) / 1.0

    # 잠재력은 매년 흔들린다 (어릴수록 크게)
    drift_sd = 2.4 if p.age <= 22 else (1.4 if p.age <= 26 else 0.7)
    for a in attrs_of(p):
        p.pot[a] = _clamp(p.pot[a] + rng.gauss(0.15 * (ethic - 1.0), drift_sd))

    # 브레이크아웃 / 정체 — 이 두 줄이 유망주 서사를 만든다
    year_mult = 1.0
    roll = rng.random()
    if roll < 0.06 and p.age <= 25:
        year_mult = 2.3                                     # 각성 시즌
    elif roll < 0.14:
        year_mult = 0.15                                    # 정체 시즌

    for a in attrs_of(p):
        peak = peak_age_for(p, a)
        gm, dm = AGING[a][1], AGING[a][2]
        cur = getattr(p, a)

        if p.age < peak:
            youth = max(0.0, min(1.0, (peak - p.age) / max(1.0, peak - YOUTH_FLOOR)))
            gap = p.pot[a] - cur
            rate = (GROWTH_RATE * youth * gm * prof[2] * ethic * pt
                    * h["dev_rate"] * year_mult * rng.uniform(0.6, 1.4))
            cur += gap * min(rate, 0.75)
            if gap < 0:                                     # 잠재력 아래로 떨어졌으면 소폭 하락
                cur += gap * 0.05
        else:
            yrs = p.age - peak
            d = (DECLINE_BASE * dm * prof[1] * h["decline_rate"]
                 * (1.0 + 0.17 * yrs) * rng.uniform(0.45, 1.55))
            # 성실한 선수는 노쇠가 조금 느리다
            d *= (1.25 - 0.25 * (h["professionalism"] / 50.0))
            cur -= d

        setattr(p, a, _clamp(cur))

    p.age += 1


# ---------------------------------------------------------------------------
# 전체 능력치 (로스터 판단 / 은퇴 판정용)
# ---------------------------------------------------------------------------
def overall(p):
    zz = lambda v: (v - 50.0) / 10.0
    if isinstance(p, Batter):
        s = (0.30 * zz(p.contact) + 0.30 * zz(p.hr_power) + 0.22 * zz(p.discipline)
             + 0.10 * zz(p.gap_power) + 0.10 * zz(p.avoid_k) + 0.09 * zz(p.speed)
             + 0.16 * zz(p.fielding))
        s /= 1.10
    else:
        s = (0.46 * zz(p.stuff) + 0.30 * zz(p.command) + 0.24 * zz(p.movement)
             + 0.12 * zz(p.stamina))
        s /= 1.06
    return _clamp(50 + 10 * s)


def potential_overall(p):
    """현재 능력을 잠재력으로 치환했을 때의 전체 능력치."""
    saved = {a: getattr(p, a) for a in attrs_of(p)}
    for a in attrs_of(p):
        setattr(p, a, max(getattr(p, a), p.pot[a]))
    v = overall(p)
    for a, x in saved.items():
        setattr(p, a, x)
    return v


# ---------------------------------------------------------------------------
# 은퇴
# ---------------------------------------------------------------------------
AGE_RETIRE = {23: .000, 24: .000, 25: .001, 26: .002, 27: .004, 28: .006,
              29: .010, 30: .016, 31: .026, 32: .042, 33: .070, 34: .110,
              35: .165, 36: .230, 37: .310, 38: .400, 39: .500, 40: .600,
              41: .700, 42: .800, 43: .900}


def retire_prob(p, playing_time=1.0):
    if p.age < 23:
        return 0.0
    if p.age >= 44:
        return 1.0
    base = AGE_RETIRE.get(p.age, 0.9)
    ovr = overall(p)
    # 대체 수준(약 41) 아래로 떨어지면 나이와 무관하게 밀려난다
    if ovr < 41 and p.age >= 26:
        base += 0.30 + 0.06 * (41 - ovr)
    elif ovr < 45 and p.age >= 30:
        base += 0.14
    if playing_time < 0.25 and p.age >= 31:
        base += 0.12
    if ovr >= 60:                       # 아직 잘하는 선수는 잘 안 그만둔다
        base *= 0.45
    amb = p.hidden.get("ambition", 50)
    base *= (1.15 - 0.30 * (amb / 100.0))
    return max(0.0, min(1.0, base))
