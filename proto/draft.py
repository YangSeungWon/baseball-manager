"""
Project Dugout - Amateur Draft

매년 아마추어 선수 풀이 생성되고, 팀은 **자기 스카우트의 추정치**로 지명한다.
진실은 아무도 모른다. 그래서 전체 1순위가 망하고 4라운드에서 스타가 나온다.
"""
import random
import development as dev
import roster
from pa_engine import Batter

CLASS_SIZE = 60
ROUNDS = 4
HS_RATIO = 0.60          # 고졸 비율 (나머지는 대졸)


def make_class(rng, year):
    """올해의 아마추어 선수 풀."""
    pool = []
    for _ in range(CLASS_SIZE):
        talent = rng.gauss(-0.30, 1.05)
        if rng.random() < 0.52:
            p = roster.make_prospect_batter(rng, rng.choice(roster.LINEUP_POS),
                                            talent, year)
        else:
            p = roster.make_prospect_pitcher(rng, rng.choice(["SP", "SP", "RP"]),
                                             talent, year)
        if rng.random() < HS_RATIO:
            p.origin = "고졸"
            p.scout_difficulty = 1.20      # 어릴수록 예측이 어렵다 = 상한도 하한도 넓다
        else:
            # 대학에서 3년을 살아남은 선수들이라 하한이 높다.
            # 대신 이미 성장을 상당 부분 써버려 상한은 낮다.
            p.origin = "대졸"
            for a in dev.attrs_of(p):
                p.pot[a] = min(80.0, p.pot[a] + 1.4)
            roster.age_to(p, 21, rng, playing_time=0.90)
            p.scout_difficulty = 0.62
        pool.append(p)
    return pool


def scout_class(team, dept, pool, rng):
    """스카우팅 예산 배분. 싸게 한 번씩 훑고, 눈에 띄는 선수에 자원을 더 쓴다.
    스카우트가 나쁜 팀은 '어디에 자원을 쓸지'부터 틀린다."""
    for p in pool:
        dept.observe(p, rng, 1)
    rough = sorted(pool, key=lambda p: -dept.report(p, rng).pot)
    for i, p in enumerate(rough):
        if i < 12:
            dept.observe(p, rng, 3)
        elif i < 26:
            dept.observe(p, rng, 2)
        elif i < 42:
            dept.observe(p, rng, 1)


POS_PREMIUM = {"C": 2.2, "SS": 1.8, "CF": 1.0, "2B": 0.5, "3B": 0.3,
               "RF": -0.4, "LF": -0.8, "1B": -1.6, "DH": -2.6}


def pick_value(team, dept, p, rng):
    r = dept.report(p, rng)
    w = getattr(team, "upside_weight", 0.70)
    v = w * r.pot + (1 - w) * r.ovr
    if isinstance(p, Batter):
        v += POS_PREMIUM.get(p.position, 0.0) * 0.55
    else:
        v += 0.6 if p.role == "SP" else -0.6
    return v


class DraftSession:
    """지명을 하나씩 진행할 수 있는 드래프트. UI 는 자기 차례에서 멈춘다."""

    def __init__(self, teams, scouts, order, pool, rng):
        self.teams, self.scouts, self.rng = teams, scouts, rng
        self.order = order
        self.pool = pool
        self.available = list(pool)
        self.picks = []
        self.n = 0
        for t in teams:
            scout_class(t, scouts[t.team_id], pool, rng)

    @property
    def total_picks(self):
        return min(ROUNDS * len(self.order), len(self.pool))

    @property
    def done(self):
        return self.n >= self.total_picks or not self.available

    @property
    def on_clock(self):
        if self.done:
            return None
        return self.order[self.n % len(self.order)]

    @property
    def current_round(self):
        return self.n // len(self.order) + 1

    def ai_choice(self, t):
        dept = self.scouts[t.team_id]
        return max(self.available, key=lambda p: pick_value(t, dept, p, self.rng))

    def pick(self, player=None):
        """player 를 지정하지 않으면 AI 가 고른다."""
        t = self.on_clock
        if t is None:
            return None
        p = player if player is not None else self.ai_choice(t)
        if p not in self.available:
            p = self.ai_choice(t)
        self.available.remove(p)
        self.n += 1
        p.drafted_round = self.current_round if False else (self.n - 1) // len(self.order) + 1
        p.drafted_overall = self.n
        p.drafted_by = t.team_id
        t.farm.append(p)
        rec = (self.n, p.drafted_round, t, p, self.scouts[t.team_id].report(p, self.rng))
        self.picks.append(rec)
        return rec

    def run_until(self, team=None):
        """team 차례가 오거나 드래프트가 끝날 때까지 AI 지명을 진행한다."""
        while not self.done and self.on_clock is not team:
            self.pick()
        return self.picks


def run_draft(teams, scouts, standings_order, pool, rng, log=None):
    """standings_order: 성적 역순 팀 리스트. (지명기록) 반환."""
    for t in teams:
        scout_class(t, scouts[t.team_id], pool, rng)

    available = list(pool)
    picks = []
    n = 0
    for rd in range(1, ROUNDS + 1):
        for t in standings_order:
            if not available:
                break
            n += 1
            dept = scouts[t.team_id]
            best = max(available, key=lambda p: pick_value(t, dept, p, rng))
            available.remove(best)
            best.drafted_round = rd
            best.drafted_overall = n
            best.drafted_by = t.team_id
            t.farm.append(best)
            picks.append((n, rd, t, best, dept.report(best, rng)))
            if log and rd == 1:
                r = dept.report(best, rng)
                lo, hi = r.ovr_range("pot")
                slot = best.position if isinstance(best, Batter) else best.role
                log(f"{t.name} 전체 {n}순위 {best.name}"
                    f"({best.age}세 {best.origin} {slot}) "
                    f"잠재력 평가 {lo:.0f}~{hi:.0f}")
    return picks
