"""
선수 / 팀 생성기.

원칙 1: 능력치를 완전히 상관시키지 말 것 (잠재 재능 + 능력별 독립 노이즈).
원칙 2: **베테랑을 난수로 찍지 말 것.** 18세 유망주를 만들고 성장 엔진을
        목표 나이까지 돌린다. 그래야 리그의 나이-능력 분포가 성장 모델과
        모순되지 않는다. 덤으로 '살아남은 30세'만 로스터에 남는 생존 편향도
        후보를 여러 명 만들어 최고를 뽑는 방식으로 자연스럽게 재현된다.
"""
import random
from pa_engine import Batter, Pitcher, Defense, Park
from game_engine import Team
import development as dev
import names

RHO = 0.55

# 능력별 '18세 시점의 미완성도' — 주력은 이미 거의 완성돼 있고,
# 파워와 제구는 한참 멀었다.
YOUTH_GAP = {
    "contact": 1.00, "avoid_k": 0.90, "discipline": 1.30, "gap_power": 1.20,
    "hr_power": 1.40, "speed": 0.35, "fielding": 0.80,
    "stuff": 1.00, "command": 1.30, "movement": 1.10, "stamina": 0.90,
}

POS = {   # (타격 보정, 수비 요구, 주력 보정)
    "C":  (-0.35, 0.55, -0.60), "1B": (0.45, -0.35, -0.45),
    "2B": (-0.15, 0.35, 0.25),  "3B": (0.15, 0.15, -0.10),
    "SS": (-0.25, 0.60, 0.30),  "LF": (0.25, -0.20, 0.05),
    "CF": (-0.10, 0.45, 0.60),  "RF": (0.20, -0.05, 0.10),
    "DH": (0.55, -1.00, -0.35),
}
LINEUP_POS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"]

# 노화를 거친 뒤의 리그 평균이 50(= 타석 엔진의 리그 평균)에 오도록 하는 보정.
# 잠재력 분포를 이만큼 올려두면 28세 주전들의 실제 능력이 50 근처에 모인다.
CALIB = {"contact": 1.7, "avoid_k": 2.7, "discipline": 2.8, "gap_power": 3.3,
         "hr_power": 0.6, "speed": 6.8, "fielding": 3.6,
         "stuff": 2.0, "command": 2.5, "movement": 3.7, "stamina": 7.9}

_next_pid = [1]


def new_pid():
    _next_pid[0] += 1
    return _next_pid[0]


def _attr(talent, rng, rho=RHO, shift=0.0):
    n = rng.gauss(0, 1)
    v = rho * talent + ((1 - rho ** 2) ** 0.5) * n + shift
    return max(20.0, min(80.0, 50 + 10 * v))


def _finish(p, pot, rng, year):
    p.pot = {a: min(80.0, v + CALIB[a]) for a, v in pot.items()}
    pot = p.pot
    p.hidden = dev.make_hidden(rng)
    p.age = 18
    p.debut_year = None
    p.injury_days = 0
    p.contract = None
    p.service = 0
    p.career_injuries = 0
    p.career_injury_days = 0
    p.draft_year = year
    gap = rng.uniform(7, 19)
    for a in dev.attrs_of(p):
        setattr(p, a, max(20.0, pot[a] - gap * YOUTH_GAP[a] * rng.uniform(0.7, 1.3)))
    return p


def make_prospect_batter(rng, pos, talent=None, year=0):
    t = rng.gauss(0, 1) if talent is None else talent
    hit, fld, spd = POS[pos]
    pot = {
        "contact":    _attr(t, rng, shift=hit * 0.5),
        "avoid_k":    _attr(t, rng, rho=0.35, shift=hit * 0.3),
        "discipline": _attr(t, rng, rho=0.40, shift=hit * 0.3),
        "gap_power":  _attr(t, rng, shift=hit * 0.6),
        "hr_power":   _attr(t, rng, shift=hit * 0.8),
        "speed":      _attr(t, rng, rho=0.20, shift=spd),
        "fielding":   _attr(t, rng, rho=0.15, shift=fld),
    }
    b = Batter(gb_tendency=_attr(0, rng, rho=0.0),
               bats="L" if rng.random() < 0.33 else "R",
               position=pos, pid=new_pid(), name=names.make_person_name(rng))
    return _finish(b, pot, rng, year)


def make_prospect_pitcher(rng, role="SP", talent=None, year=0):
    t = rng.gauss(0, 1) if talent is None else talent
    if role == "SP":
        stam_shift = 0.60
    else:
        stam_shift, t = -1.10, t + 0.15
    pot = {
        "stuff":    _attr(t, rng, shift=0.20 if role != "SP" else 0.0),
        "command":  _attr(t, rng, rho=0.45),
        "movement": _attr(t, rng, rho=0.45),
        "stamina":  _attr(t, rng, rho=0.20, shift=stam_shift),
    }
    p = Pitcher(gb_tendency=_attr(0, rng, rho=0.0),
                throws="L" if rng.random() < 0.28 else "R",
                role=role, pid=new_pid(), name=names.make_person_name(rng))
    return _finish(p, pot, rng, year)


def age_to(p, target_age, rng, playing_time=1.0):
    while p.age < target_age:
        dev.develop(p, rng, playing_time=playing_time)
    return p


def make_aged(rng, kind, target_age, year, best_of=3, **kw):
    """후보를 여러 명 만들어 가장 좋은 선수를 남긴다 = 생존 편향."""
    maker = make_prospect_batter if kind == "B" else make_prospect_pitcher
    cands = []
    for _ in range(best_of):
        p = maker(rng, year=year, **kw)
        age_to(p, target_age, rng)
        cands.append(p)
    best = max(cands, key=dev.overall)
    best.debut_year = year - max(0, target_age - 21)
    return best


AGE_REG = [24, 25, 25, 26, 26, 27, 27, 28, 28, 29, 30, 30, 31, 32, 33, 34]
AGE_SUB = [23, 24, 25, 26, 27, 28, 29, 30, 31, 33]


FIELD_POS = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"]


def rebuild_roster(t, healthy_only=False):
    """batters / pitchers 풀에서 라인업·벤치·로테이션·불펜을 다시 짠다.
    포지션별로 가장 좋은 선수를 세우고 남는 자리를 DH 로 채운다.
    healthy_only=True 면 부상자를 제외하고 그날의 출전 명단을 만든다."""
    import development as dev
    bats = [b for b in t.batters if b.injury_days <= 0] if healthy_only else t.batters
    pits = [p for p in t.pitchers if p.injury_days <= 0] if healthy_only else t.pitchers
    pool = sorted(bats, key=lambda b: -dev.overall(b))
    used, lineup = set(), []
    for pos in FIELD_POS:
        cand = [b for b in pool if b.position == pos and id(b) not in used]
        if not cand:                                  # 그 포지션 선수가 없으면 아무나 세운다
            cand = [b for b in pool if id(b) not in used]
        if not cand:                                  # 인원 자체가 모자라면 중단
            break
        pick = cand[0]
        used.add(id(pick))
        lineup.append(pick)
    rest = [b for b in pool if id(b) not in used]
    if rest:
        lineup.append(rest[0])                        # DH
        rest = rest[1:]
    t.lineup, t.bench = lineup, rest

    sp = sorted([p for p in pits if p.role == "SP"],
                key=lambda p: -(p.stuff + p.command * .7 + p.movement * .5 + p.stamina * .4))
    rp = sorted([p for p in pits if p.role == "RP"],
                key=lambda p: -(p.stuff + p.command * .6))
    while len(sp) < 5 and rp:
        sp.append(rp.pop(0))
    if sp:
        t.rotation, t.bullpen = sp[:5], (rp + sp[5:])[:8]
    elif rp:
        t.rotation, t.bullpen = rp[:5], rp[5:] or rp[:1]
    return refresh_team(t)


def make_team(rng, team_id, name, year=2030, team_talent=0.0):
    lineup = [make_aged(rng, "B", rng.choice(AGE_REG), year, 3,
                        pos=pos, talent=rng.gauss(team_talent, 0.85))
              for pos in LINEUP_POS]
    order = lineup
    bench = [make_aged(rng, "B", rng.choice(AGE_SUB), year, 2,
                       pos=rng.choice(LINEUP_POS),
                       talent=rng.gauss(team_talent - 0.8, 0.7)) for _ in range(4)]
    rotation = [make_aged(rng, "P", rng.choice(AGE_REG), year, 3,
                          role="SP", talent=rng.gauss(team_talent, 0.85))
                for _ in range(5)]
    bullpen = [make_aged(rng, "P", rng.choice(AGE_SUB), year, 2,
                         role="RP", talent=rng.gauss(team_talent - 0.15, 0.8))
               for _ in range(7)]
    t = Team(team_id, order, bench, rotation, bullpen, None, None, name)
    t.park = Park(hr_factor=max(-0.21, min(0.21, rng.gauss(0, 0.095))),
                hit_factor=rng.gauss(0, 0.045))
    t.talent = team_talent
    t.batters = lineup + bench
    t.pitchers = rotation + bullpen
    # 팜(2군): 18~21세 유망주. 드래프트가 붙기 전까지는 자동 생성된다.
    t.farm = []
    for _ in range(6):
        b = make_prospect_batter(rng, rng.choice(LINEUP_POS), rng.gauss(team_talent, 0.9), year)
        age_to(b, rng.choice([18, 19, 20, 21]), rng, playing_time=0.8)
        t.farm.append(b)
    for _ in range(6):
        p = make_prospect_pitcher(rng, rng.choice(["SP", "SP", "RP"]),
                                  rng.gauss(team_talent, 0.9), year)
        age_to(p, rng.choice([18, 19, 20, 21]), rng, playing_time=0.8)
        t.farm.append(p)
    rebuild_roster(t)
    return t


def refresh_team(t):
    """라인업 타순 / 로테이션 순번 / 팀 수비를 현재 능력치 기준으로 다시 계산."""
    t.rotation.sort(key=lambda p: -(p.stuff + p.command * 0.7 + p.movement * 0.5
                                    + p.stamina * 0.4))
    t.bullpen.sort(key=lambda p: -(p.stuff + p.command * 0.6))
    t.lineup.sort(key=lambda b: -(b.discipline * 1.2 + b.contact + b.hr_power * 0.6))
    t.lineup[0], t.lineup[1] = t.lineup[1], t.lineup[0]
    if not t.lineup:
        return t
    inf = [b.fielding for b in t.lineup if b.position in ("C", "1B", "2B", "3B", "SS")]
    of = [b.fielding for b in t.lineup if b.position in ("LF", "CF", "RF")]
    c = [b.fielding for b in t.lineup if b.position == "C"]
    t.defense = Defense(infield=sum(inf) / len(inf) if inf else 50,
                        outfield=sum(of) / len(of) if of else 50,
                        catcher_framing=c[0] if c else 50)
    return t


def call_up(t, want_pitcher, rng, year, role=None):
    """부상으로 인원이 모자라면 팜에서 올린다. 팜도 비었으면 급조한다.
    role 을 지정하면 그 보직(SP/RP)의 투수만 올린다."""
    import development as dev
    cand = [p for p in t.farm
            if (not isinstance(p, Batter)) == want_pitcher and p.injury_days <= 0
            and (role is None or p.role == role)]
    if cand:
        best = max(cand, key=dev.overall)
        t.farm.remove(best)
    elif want_pitcher:
        best = make_prospect_pitcher(rng, role or "RP", rng.gauss(-0.9, 0.6), year)
        age_to(best, 22, rng, 0.85)
    else:
        best = make_prospect_batter(rng, rng.choice(LINEUP_POS),
                                    rng.gauss(-0.9, 0.6), year)
        age_to(best, 22, rng, 0.85)
    (t.pitchers if want_pitcher else t.batters).append(best)
    return best


def set_active(t, rng, year):
    """그날의 출전 가능 명단을 구성한다. 인원이 모자라면 콜업한다."""
    ups = []
    while sum(1 for b in t.batters if b.injury_days <= 0) < 10:
        ups.append(call_up(t, False, rng, year))
    while sum(1 for p in t.pitchers if p.injury_days <= 0) < 9:
        ups.append(call_up(t, True, rng, year))
    while sum(1 for p in t.pitchers
              if p.injury_days <= 0 and p.role == "SP") < 4:
        ups.append(call_up(t, True, rng, year, role="SP"))
    rebuild_roster(t, healthy_only=True)
    return ups


def make_league(n_teams=8, seed=1, year=2030):
    rng = random.Random(seed)
    _next_pid[0] = 1
    tn = names.make_team_names(n_teams, rng)
    return [make_team(rng, i + 1, full, year, rng.gauss(0, 0.22))
            for i, (_, full) in enumerate(tn)]
