"""
Project Dugout - Plate Appearance Engine (prototype)

설계 원칙
  1. 모든 능력치는 표시용 20-80 스케일. z = (rating - 50) / 10  (즉 1 z = 10점 = 1 표준편차)
  2. 모든 확률은 logit(로그 오즈) 공간에서 '가산'으로 합성한다.
        logit(p) = logit(league_base) + sum(coeff_i * z_i) + situational
     - 확률이 0/1을 넘지 않는다
     - 능력 효과가 리그 평균 근처에서 가장 크고 극단에서 포화된다 (야구적으로 옳다)
     - 계수 하나만 바꿔서 밸런싱할 수 있다
  3. 타석은 단계적 결정 트리다. 각 단계가 독립적으로 튜닝 가능해야 한다.

C# 포팅 주의: 여기 dict/랜덤은 프로토타입용. 실제 코어는 struct + Xoshiro RNG 권장.
"""

import math
import random

# ---------------------------------------------------------------------------
# 리그 기준선 (League Baselines) - 밸런싱의 단일 진입점
# ---------------------------------------------------------------------------
LG = {
    "bb":  0.0850,   # BB / PA
    "k":   0.2000,   # K  / PA
    "hbp": 0.0100,   # HBP / PA
    # 타구 분포 (BIP 기준)
    "gb":  0.4400,
    "ld":  0.2100,
    "fb":  0.2800,
    "pu":  0.0700,
    "hr_per_fb": 0.1210,   # 뜬공 중 홈런 비율
    # 타구 종류별 BABIP
    "babip_gb": 0.2450,
    "babip_ld": 0.7150,
    "babip_fb": 0.1420,    # 홈런 제외 뜬공
    "babip_pu": 0.0150,
}

# ---------------------------------------------------------------------------
# 계수 (Coefficients) - "능력 1 표준편차가 로그오즈를 얼마나 움직이는가"
# 이 표가 사실상 게임의 밸런스 시트다.
# ---------------------------------------------------------------------------
C = {
    # 삼진
    "k_stuff":       0.225,   # 투수 구위
    "k_contact":    -0.150,   # 타자 컨택
    "k_avoidk":     -0.150,   # 타자 삼진회피
    "k_command":     0.05,   # 제구 좋으면 삼진도 약간 늘어남
    # 볼넷
    "bb_discipline": 0.275,   # 타자 선구안
    "bb_command":   -0.205,   # 투수 제구
    "bb_power":      0.06,   # 거포는 피해간다 (약한 효과)
    # 홈런 (뜬공 기준)
    "hr_power":      0.360,
    "hr_movement":  -0.185,
    # 타구 유형 (GB vs FB 로그오즈)
    "gb_bat":        0.30,   # 타자 땅볼 성향
    "gb_pit":        0.34,   # 투수 땅볼 성향
    "ld_contact":    0.08,   # 컨택 좋으면 라인드라이브 소폭 증가
    # BABIP
    "babip_speed_gb":  0.145,  # 발 빠른 타자의 내야안타
    "babip_power_ld":  0.05,
    "babip_inf_def":  -0.072,  # 내야 수비
    "babip_of_def":   -0.078,  # 외야 수비
    "babip_pit_soft": -0.06,  # 투수 무브먼트 = 약한 타구 유도
    # 상황 보정
    "platoon_k":       0.10,  # 같은 손 상대 시 삼진 증가
    "platoon_bb":     -0.06,
    "platoon_hr":     -0.12,
    "fatigue_stuff":  -0.90,  # 피로 1.0 = 구위 0.9 z 하락
    "fatigue_command":-0.70,
    "tto":             0.045, # 순번 1회 추가당 타자에게 유리 (로그오즈)
}


def z(rating: float) -> float:
    return (rating - 50.0) / 10.0


def logit(p: float) -> float:
    return math.log(p / (1.0 - p))


def inv_logit(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


# ---------------------------------------------------------------------------
# 엔티티 (프로토타입용 최소 형태)
# ---------------------------------------------------------------------------
class Batter:
    def __init__(self, contact=50, avoid_k=50, discipline=50, gap_power=50,
                 hr_power=50, speed=50, gb_tendency=50, bats="R",
                 fielding=50, position="DH", pid=0, name=""):
        self.contact = contact
        self.avoid_k = avoid_k
        self.discipline = discipline
        self.gap_power = gap_power
        self.hr_power = hr_power
        self.speed = speed
        self.gb_tendency = gb_tendency
        self.bats = bats
        self.fielding = fielding
        self.position = position
        self.pid = pid
        self.name = name or f"P{pid:04d}"


class Pitcher:
    def __init__(self, stuff=50, command=50, movement=50, gb_tendency=50,
                 throws="R", stamina=50, role="SP", pid=0, name=""):
        self.stuff = stuff
        self.command = command
        self.movement = movement
        self.gb_tendency = gb_tendency
        self.throws = throws
        self.stamina = stamina
        self.role = role
        self.pid = pid
        self.name = name or f"P{pid:04d}"


class Defense:
    def __init__(self, infield=50, outfield=50, catcher_framing=50):
        self.infield = infield
        self.outfield = outfield
        self.catcher_framing = catcher_framing


class Park:
    def __init__(self, hr_factor=0.0, hit_factor=0.0):
        # 로그오즈 가산값. +0.20 이면 상당한 타자구장.
        self.hr_factor = hr_factor
        self.hit_factor = hit_factor


class Context:
    def __init__(self, fatigue=0.0, times_through=1):
        self.fatigue = fatigue          # 0.0 ~ 1.5
        self.times_through = times_through


NEUTRAL_DEF = Defense()
NEUTRAL_PARK = Park()
NEUTRAL_CTX = Context()

# 결과 코드
K, BB, HBP, OUT, S1B, D2B, T3B, HR = "K", "BB", "HBP", "OUT", "1B", "2B", "3B", "HR"


def simulate_pa(bat: Batter, pit: Pitcher, dfn=NEUTRAL_DEF, park=NEUTRAL_PARK,
                ctx=NEUTRAL_CTX, rng=random):
    """한 타석을 시뮬레이션하고 (결과코드, 타구유형) 을 반환한다."""

    same_hand = (bat.bats == pit.throws)          # 스위치타자는 항상 유리하게 처리 가능
    tto = C["tto"] * (ctx.times_through - 1)

    # 피로 반영된 투수 유효 능력
    zs = z(pit.stuff)   + C["fatigue_stuff"]   * ctx.fatigue
    zc = z(pit.command) + C["fatigue_command"] * ctx.fatigue
    zm = z(pit.movement)

    # --- 1단계: 삼진 -------------------------------------------------------
    lk = (logit(LG["k"])
          + C["k_stuff"]   * zs
          + C["k_command"] * zc
          + C["k_contact"] * z(bat.contact)
          + C["k_avoidk"]  * z(bat.avoid_k)
          + (C["platoon_k"] if same_hand else -C["platoon_k"] * 0.5)
          - tto)
    p_k = inv_logit(lk)

    # --- 2단계: 볼넷 -------------------------------------------------------
    lbb = (logit(LG["bb"])
           + C["bb_discipline"] * z(bat.discipline)
           + C["bb_command"]    * zc
           + C["bb_power"]      * z(bat.hr_power)
           + (C["platoon_bb"] if same_hand else -C["platoon_bb"] * 0.5)
           + tto)
    p_bb = inv_logit(lbb)

    p_hbp = LG["hbp"]

    total = p_k + p_bb + p_hbp
    if total > 0.92:                      # 세 결과가 타석을 다 먹지 않도록 안전장치
        scale = 0.92 / total
        p_k, p_bb, p_hbp = p_k * scale, p_bb * scale, p_hbp * scale

    r = rng.random()
    if r < p_k:
        return K, None
    r -= p_k
    if r < p_bb:
        return BB, None
    r -= p_bb
    if r < p_hbp:
        return HBP, None

    # --- 3단계: 타구 유형 (인플레이) ---------------------------------------
    # GB / FB 축을 로그오즈로 밀고, LD/PU는 잔여를 비례 배분한다.
    gb_shift = C["gb_bat"] * z(bat.gb_tendency) + C["gb_pit"] * z(pit.gb_tendency)
    ld_shift = C["ld_contact"] * z(bat.contact)

    w_gb = LG["gb"] * math.exp(gb_shift)
    w_fb = LG["fb"] * math.exp(-gb_shift)
    w_pu = LG["pu"] * math.exp(-gb_shift * 0.5)
    w_ld = LG["ld"] * math.exp(ld_shift)
    tot = w_gb + w_fb + w_pu + w_ld

    r = rng.random() * tot
    if r < w_gb:
        bbt = "GB"
    elif r < w_gb + w_ld:
        bbt = "LD"
    elif r < w_gb + w_ld + w_fb:
        bbt = "FB"
    else:
        bbt = "PU"

    # --- 4단계: 홈런 (뜬공/라인드라이브만) ---------------------------------
    if bbt in ("FB", "LD"):
        base = LG["hr_per_fb"] if bbt == "FB" else LG["hr_per_fb"] * 0.35
        lhr = (logit(base)
               + C["hr_power"]    * z(bat.hr_power)
               + C["hr_movement"] * zm
               + park.hr_factor
               + (C["platoon_hr"] if same_hand else -C["platoon_hr"] * 0.5)
               + tto)
        if rng.random() < inv_logit(lhr):
            return HR, bbt

    # --- 5단계: BABIP (수비 판정) ------------------------------------------
    base_babip = {"GB": LG["babip_gb"], "LD": LG["babip_ld"],
                  "FB": LG["babip_fb"], "PU": LG["babip_pu"]}[bbt]

    lb = logit(base_babip) + park.hit_factor + C["babip_pit_soft"] * zm
    if bbt in ("GB", "PU"):
        lb += C["babip_inf_def"] * z(dfn.infield)
        if bbt == "GB":
            lb += C["babip_speed_gb"] * z(bat.speed)
    else:
        lb += C["babip_of_def"] * z(dfn.outfield)
        lb += C["babip_power_ld"] * z(bat.gap_power)

    if rng.random() >= inv_logit(lb):
        return OUT, bbt

    # --- 6단계: 안타 종류 --------------------------------------------------
    zsp, zgp = z(bat.speed), z(bat.gap_power)
    if bbt == "GB":
        p2 = 0.045 + 0.009 * zgp
        p3 = 0.002 + 0.002 * zsp
    elif bbt == "LD":
        p2 = 0.245 + 0.032 * zgp
        p3 = 0.030 + 0.012 * zsp
    elif bbt == "FB":
        p2 = 0.505 + 0.045 * zgp
        p3 = 0.080 + 0.025 * zsp
    else:
        p2, p3 = 0.010, 0.0

    r = rng.random()
    if r < p3:
        return T3B, bbt
    if r < p3 + p2:
        return D2B, bbt
    return S1B, bbt
