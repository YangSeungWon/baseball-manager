"""
Project Dugout - Season Engine (prototype)

일정 생성 / 시즌 진행 / 순위 / 개인기록 집계 / 시상 / 포스트시즌.
UI 없이 독립적으로 한 시즌이 끝까지 돌아가는 것이 목표다.
"""
import random
from collections import defaultdict
from game_engine import play_game
import injury
import roster as roster_mod

# ---------------------------------------------------------------------------
# 일정 생성 (circle method 라운드로빈)
# ---------------------------------------------------------------------------
def make_schedule(n_teams, games_per_team, rng):
    """(경기일, 홈팀idx, 원정팀idx) 리스트를 반환."""
    assert n_teams % 2 == 0
    rounds_per_cycle = n_teams - 1
    games_per_cycle = rounds_per_cycle           # 팀당 1사이클에 치르는 경기 수
    cycles = games_per_team // games_per_cycle
    assert cycles * games_per_cycle == games_per_team, \
        f"{games_per_team}경기는 {n_teams}팀 라운드로빈으로 나누어떨어지지 않는다"

    idx = list(range(n_teams))
    sched = []
    day = 0
    for c in range(cycles):
        arr = idx[:]                              # 매 사이클 초기화
        for r in range(rounds_per_cycle):
            for i in range(n_teams // 2):
                a, b = arr[i], arr[n_teams - 1 - i]
                # 사이클 패리티로 홈/원정을 뒤집어 6홈 6원정을 맞춘다
                if (c + i) % 2 == 0:
                    sched.append((day, a, b))
                else:
                    sched.append((day, b, a))
            arr = [arr[0]] + [arr[-1]] + arr[1:-1]   # 0번 고정 회전
            day += 1
    rng.shuffle(sched)
    sched.sort(key=lambda x: x[0])
    return sched


# ---------------------------------------------------------------------------
# 누적 기록
# ---------------------------------------------------------------------------
class SeasonBat:
    def __init__(self, p, team):
        self.p, self.team = p, team
        self.g = self.pa = self.ab = self.h = self.b2 = self.b3 = self.hr = 0
        self.bb = self.k = self.rbi = self.r = self.sb = self.cs = self.hbp = 0

    def add(self, L):
        self.g += 1
        for f in ("pa", "ab", "h", "b2", "b3", "hr", "bb", "k", "rbi", "sb", "cs", "hbp"):
            setattr(self, f, getattr(self, f) + getattr(L, f))
        self.r += L.run          # BatLine 은 득점을 run 으로 들고 있다

    b1 = property(lambda s: s.h - s.b2 - s.b3 - s.hr)
    avg = property(lambda s: s.h / s.ab if s.ab else 0.0)
    obp = property(lambda s: (s.h + s.bb + s.hbp) / s.pa if s.pa else 0.0)
    tb = property(lambda s: s.b1 + 2 * s.b2 + 3 * s.b3 + 4 * s.hr)
    slg = property(lambda s: s.tb / s.ab if s.ab else 0.0)
    ops = property(lambda s: s.obp + s.slg)

    @property
    def woba(self):
        if not self.pa:
            return 0.0
        return (0.69 * self.bb + 0.72 * self.hbp + 0.89 * self.b1 + 1.27 * self.b2
                + 1.62 * self.b3 + 2.10 * self.hr) / self.pa


class SeasonPit:
    def __init__(self, p, team):
        self.p, self.team = p, team
        self.g = self.gs = self.outs = self.bf = self.h = self.hr = 0
        self.bb = self.k = self.r = self.w = self.l = self.sv = self.hld = self.hbp = 0

    def add(self, L, started):
        self.g += 1
        self.gs += 1 if started else 0
        for f in ("outs", "bf", "h", "hr", "bb", "k", "r", "hbp"):
            setattr(self, f, getattr(self, f) + getattr(L, f))
        self.w += 1 if L.w else 0
        self.l += 1 if L.l else 0
        self.sv += 1 if L.sv else 0
        self.hld += 1 if L.hld else 0

    ip = property(lambda s: s.outs / 3)
    era = property(lambda s: s.r * 9 / s.ip if s.outs else 0.0)
    whip = property(lambda s: (s.h + s.bb) / s.ip if s.outs else 0.0)
    k9 = property(lambda s: s.k * 9 / s.ip if s.outs else 0.0)
    ip_str = property(lambda s: f"{s.outs // 3}.{s.outs % 3}")

    @property
    def fip_raw(self):
        if not self.outs:
            return 0.0
        return (13 * self.hr + 3 * (self.bb + self.hbp) - 2 * self.k) / self.ip


class TeamRecord:
    def __init__(self, team):
        self.team = team
        self.w = self.l = self.rs = self.ra = 0

    pct = property(lambda s: s.w / (s.w + s.l) if s.w + s.l else 0.0)
    g = property(lambda s: s.w + s.l)

    @property
    def pyth(self):
        if not (self.rs or self.ra):
            return 0.0
        e = 1.83
        return self.rs ** e / (self.rs ** e + self.ra ** e)


# ---------------------------------------------------------------------------
# 가치 지표 (게임 내부용 WAR)
# 실제 fWAR/bWAR를 그대로 복제하지 않는다. 일관성이 정확성보다 중요하다.
# ---------------------------------------------------------------------------
POS_ADJ = {"C": 12.5, "SS": 7.0, "2B": 2.5, "3B": 2.5, "CF": 2.5,
           "LF": -7.0, "RF": -7.0, "1B": -12.5, "DH": -17.5}
RUNS_PER_WIN = 9.5


def batter_war(sb: SeasonBat, lg_woba, woba_scale=1.25):
    if not sb.pa:
        return 0.0
    wraa = (sb.woba - lg_woba) / woba_scale * sb.pa
    pos = POS_ADJ.get(sb.p.position, 0.0) * sb.pa / 600
    rep = 20.0 * sb.pa / 600
    return (wraa + pos + rep) / RUNS_PER_WIN


def pitcher_war(sp: SeasonPit, lg_ra9):
    if not sp.outs:
        return 0.0
    repl = lg_ra9 * (1.22 if sp.gs >= sp.g * 0.5 else 1.35)
    return (repl - sp.era) * sp.ip / 9 / RUNS_PER_WIN


# ---------------------------------------------------------------------------
# 시즌
# ---------------------------------------------------------------------------
class Season:
    def __init__(self, teams, year=2030, games=84, seed=1):
        self.teams = teams
        self.year = year
        self.games = games
        self.rng = random.Random(seed)
        self.schedule = make_schedule(len(teams), games, self.rng)
        self.rec = {t.team_id: TeamRecord(t) for t in teams}
        self.bat = {}
        self.pit = {}
        self.results = []
        self.by_day = {}
        for d, hi, ai in self.schedule:
            self.by_day.setdefault(d, []).append((hi, ai))
        self.cur_day = 0
        self.injuries = []        # (day, team, player, days, label, 영구손상)
        self.avail_day = {}       # pid -> 이 날짜부터 등판 가능
        self.last_used = {}
        self.consec = {}

    def _bat(self, p, t):
        if p.pid not in self.bat:
            self.bat[p.pid] = SeasonBat(p, t)
        return self.bat[p.pid]

    def _pit(self, p, t):
        if p.pid not in self.pit:
            self.pit[p.pid] = SeasonPit(p, t)
        return self.pit[p.pid]

    def _absorb(self, S, opp_runs):
        r = self.rec[S.team.team_id]
        r.rs += S.runs
        r.ra += opp_runs
        if S.runs > opp_runs: r.w += 1
        elif S.runs < opp_runs: r.l += 1
        for L in S.bat.values():
            if L.pa:
                self._bat(L.b, S.team).add(L)
        for i, pl in enumerate(S.pitchers):
            self._pit(pl.p, S.team).add(pl, started=(i == 0))

    def _new_day(self, day):
        """부상 회복 → 출전 명단 구성 → 불펜 등판 가능 여부."""
        for t in self.teams:
            for p in t.batters + t.pitchers + t.farm:
                if p.injury_days > 0:
                    p.injury_days -= 1
            roster_mod.set_active(t, self.rng, self.year)
        self._set_availability(day)

    def _injury_rolls(self, S, day):
        t = S.team
        for b in t.lineup:
            L = S.bat.get(id(b))
            if not L or not L.pa:
                continue
            r = injury.roll(b, self.rng)
            if r:
                self._hurt(b, t, day, *r)
        for pl in S.pitchers:
            if not pl.bf:
                continue
            r = injury.roll(pl.p, self.rng, fatigue=pl.fatigue,
                            workload=1.0 + 0.02 * max(0, pl.bf - 20))
            if r:
                self._hurt(pl.p, t, day, *r)

    def _hurt(self, p, t, day, days, label):
        lost = injury.apply(p, days, self.rng)
        self.injuries.append((day, t, p, days, label, lost))

    def _set_availability(self, day):
        for t in self.teams:
            t.unavailable = {p.pid for p in t.bullpen
                             if self.avail_day.get(p.pid, 0) > day}

    def _log_usage(self, S, day):
        """구원 등판 후 휴식일 계산. 연투는 최대 2일까지만 허용한다."""
        for pl in S.pitchers[1:]:
            pid = pl.p.pid
            rest = 0 if pl.bf <= 4 else (1 if pl.bf <= 8 else 2)
            if self.last_used.get(pid) == day - 1:
                self.consec[pid] = self.consec.get(pid, 0) + 1
            else:
                self.consec[pid] = 1
            if self.consec[pid] >= 3:      # 3연투까지 허용, 그 다음은 강제 휴식
                rest = max(rest, 1)
            if self.consec[pid] >= 4:
                rest = max(rest, 2)
            self.last_used[pid] = day
            self.avail_day[pid] = day + 1 + rest

    @property
    def total_days(self):
        return max(self.by_day) + 1 if self.by_day else 0

    @property
    def finished(self):
        return self.cur_day >= self.total_days

    def play_day(self, keep_boxscore=None):
        """하루치 경기를 치른다. UI 는 이 단위로 시간을 진행한다.
        keep_boxscore 에 team_id 를 주면 그 팀 경기의 박스스코어를 보관한다."""
        day = self.cur_day
        if day not in self.by_day:
            self.cur_day += 1
            return []
        self._new_day(day)
        out = []
        for hi, ai in self.by_day[day]:
            H, A = play_game(self.teams[hi], self.teams[ai], self.rng)
            self._absorb(H, A.runs)
            self._absorb(A, H.runs)
            self._log_usage(H, day)
            self._log_usage(A, day)
            self._injury_rolls(H, day)
            self._injury_rolls(A, day)
            self.results.append((day, hi, ai, H.runs, A.runs))
            box = None
            if keep_boxscore is not None and keep_boxscore in (
                    self.teams[hi].team_id, self.teams[ai].team_id):
                box = (H, A)
            out.append((hi, ai, H.runs, A.runs, box))
        self.cur_day += 1
        return out

    def run(self, progress=False):
        while not self.finished:
            if progress and self.cur_day % 20 == 0:
                print(f"  ... {self.cur_day}일차")
            self.play_day()
        return self

    # --- 리그 환경 -------------------------------------------------------
    @property
    def lg_woba(self):
        pa = sum(b.pa for b in self.bat.values())
        num = sum(b.woba * b.pa for b in self.bat.values())
        return num / pa if pa else 0.0

    @property
    def lg_ra9(self):
        outs = sum(p.outs for p in self.pit.values())
        r = sum(p.r for p in self.pit.values())
        return r * 27 / outs if outs else 0.0

    @property
    def fip_const(self):
        outs = sum(p.outs for p in self.pit.values())
        if not outs:
            return 0.0
        ip = outs / 3
        lg_era = sum(p.r for p in self.pit.values()) * 9 / ip
        raw = sum(13 * p.hr + 3 * (p.bb + p.hbp) - 2 * p.k for p in self.pit.values()) / ip
        return lg_era - raw

    def fip(self, p):
        return p.fip_raw + self.fip_const

    def standings(self):
        return sorted(self.rec.values(), key=lambda r: (-r.pct, -(r.rs - r.ra)))

    @property
    def games_played(self):
        """지금까지 치른 팀당 경기 수. 규정타석/규정이닝은 여기에 비례한다."""
        return max((r.g for r in self.rec.values()), default=0)

    def qualified_batters(self, g=None):
        need = 3.1 * (self.games if g is None else g)
        return [b for b in self.bat.values() if b.pa >= need]

    def qualified_pitchers(self, g=None):
        need = 1.0 * (self.games if g is None else g)
        return [p for p in self.pit.values() if p.ip >= need]

    def wars(self):
        lw, lr = self.lg_woba, self.lg_ra9
        bw = {b.p.pid: batter_war(b, lw) for b in self.bat.values()}
        pw = {p.p.pid: pitcher_war(p, lr) for p in self.pit.values()}
        return bw, pw


# ---------------------------------------------------------------------------
# 포스트시즌 (상위 4팀: 준PO 5전3선승, 한국시리즈 7전4선승)
# ---------------------------------------------------------------------------
def play_series(higher, lower, best_of, rng, home_pattern=None):
    """higher가 홈 어드밴티지를 갖는다. (승자, 패자, 시리즈 스코어) 반환."""
    need = best_of // 2 + 1
    w = {higher.team_id: 0, lower.team_id: 0}
    pat = home_pattern or ([True] * best_of)
    g = 0
    while max(w.values()) < need:
        home, away = (higher, lower) if pat[g % len(pat)] else (lower, higher)
        H, A = play_game(home, away, rng)
        while H.runs == A.runs:                       # 무승부는 재경기
            H, A = play_game(home, away, rng)
        win = home if H.runs > A.runs else away
        w[win.team_id] += 1
        g += 1
    if w[higher.team_id] > w[lower.team_id]:
        return higher, lower, (w[higher.team_id], w[lower.team_id])
    return lower, higher, (w[lower.team_id], w[higher.team_id])


def postseason(season, rng):
    st = season.standings()
    s = [r.team for r in st[:4]]
    log = []
    # 준플레이오프: 3위 vs 4위
    w1, l1, sc1 = play_series(s[2], s[3], 5, rng, [True, True, False, False, True])
    log.append(("준플레이오프", w1, l1, sc1))
    # 플레이오프: 2위 vs 준PO 승자
    w2, l2, sc2 = play_series(s[1], w1, 5, rng, [True, True, False, False, True])
    log.append(("플레이오프", w2, l2, sc2))
    # 한국시리즈: 1위 vs PO 승자
    w3, l3, sc3 = play_series(s[0], w2, 7, rng,
                              [True, True, False, False, False, True, True])
    log.append(("챔피언십 시리즈", w3, l3, sc3))
    return w3, log
