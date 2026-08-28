"""
Project Dugout - Serialization

자동저장 단일 슬롯 설계. 되돌리기는 지원하지 않는다 — 이 장르에서 세이브
스커밍은 스카우팅 불확실성을 통째로 무의미하게 만든다. 다만 브라우저 저장소는
날아갈 수 있으므로 **파일 내보내기/가져오기**는 남긴다 (백업이지 되돌리기가 아니다).

설계 원칙
  1. 선수 객체는 pid 로만 참조한다. 객체 그래프를 pid 테이블로 평탄화한다.
  2. **스카우팅 기억은 현역 선수 것만 남긴다.** 은퇴한 선수의 오차 시드를
     들고 있어봐야 쓸 데가 없는데, 이게 세이브의 최대 지분이었다.
  3. RNG 상태를 함께 저장한다. 그래야 이어서 하는 시뮬레이션이 재현 가능하다.
"""
import random
import development as dev
import contract as C
import scouting
import roster as roster_mod
from pa_engine import Batter, Pitcher, Defense, Park
from career import League, Career
from game_engine import Team

VERSION = 1

BAT_FIELDS = ["contact", "avoid_k", "discipline", "gap_power", "hr_power",
              "speed", "fielding", "gb_tendency"]
PIT_FIELDS = ["stuff", "command", "movement", "stamina", "gb_tendency"]
META = ["pid", "name", "age", "service", "injury_days", "career_injuries",
        "career_injury_days", "debut_year", "draft_year", "unsigned_years"]


def _f(v):
    return round(v, 3)


# ---------------------------------------------------------------------------
# 선수
# ---------------------------------------------------------------------------
def dump_player(p):
    ip = not isinstance(p, Batter)
    d = {"k": "P" if ip else "B"}
    for m in META:
        v = getattr(p, m, None)
        if v is not None:
            d[m] = v
    for f in (PIT_FIELDS if ip else BAT_FIELDS):
        d[f] = _f(getattr(p, f))
    d["pot"] = {a: _f(v) for a, v in p.pot.items()}
    d["hid"] = {a: (v if isinstance(v, str) else _f(v))
                for a, v in p.hidden.items()}
    if ip:
        d["throws"], d["role"] = p.throws, p.role
    else:
        d["bats"], d["position"] = p.bats, p.position
    if p.contract:
        d["ct"] = [p.contract.start_year, [_f(x) for x in p.contract.salaries]]
    for opt in ("origin", "scout_difficulty", "drafted_round",
                "drafted_overall", "drafted_by"):
        if hasattr(p, opt):
            d[opt] = getattr(p, opt)
    if hasattr(p, "scout_consensus"):
        d["sc"] = [[_f(p.scout_consensus[a]) for a in dev.attrs_of(p)],
                   [_f(p.scout_consensus_pot[a]) for a in dev.attrs_of(p)]]
    return d


def load_player(d):
    ip = d["k"] == "P"
    p = (Pitcher(throws=d["throws"], role=d["role"])
         if ip else Batter(bats=d["bats"], position=d["position"]))
    for m in META:
        if m in d:
            setattr(p, m, d[m])
    for f in (PIT_FIELDS if ip else BAT_FIELDS):
        setattr(p, f, d[f])
    p.pot = dict(d["pot"])
    p.hidden = dict(d["hid"])
    p.contract = C.Contract(d["ct"][0], d["ct"][1]) if "ct" in d else None
    for opt in ("origin", "scout_difficulty", "drafted_round",
                "drafted_overall", "drafted_by"):
        if opt in d:
            setattr(p, opt, d[opt])
    if "sc" in d:
        attrs = dev.attrs_of(p)
        p.scout_consensus = {a: v for a, v in zip(attrs, d["sc"][0])}
        p.scout_consensus_pot = {a: v for a, v in zip(attrs, d["sc"][1])}
    p.injury_days = d.get("injury_days", 0)
    p.service = d.get("service", 0)
    return p


# ---------------------------------------------------------------------------
# 커리어 (시즌 기록은 숫자 배열로 눕힌다)
# ---------------------------------------------------------------------------
BAT_LINE = ["g", "pa", "ab", "h", "b2", "b3", "hr", "bb", "k", "rbi", "r",
            "sb", "cs", "hbp"]
PIT_LINE = ["g", "gs", "outs", "bf", "h", "hr", "bb", "k", "r", "w", "l",
            "sv", "hld", "hbp"]


class Line:
    """저장된 기록을 되살린 읽기 전용 스탯 라인."""
    def __init__(self, kind, vals):
        fields = BAT_LINE if kind == "B" else PIT_LINE
        for f, v in zip(fields, vals):
            setattr(self, f, v)
        self.kind = kind

    b1 = property(lambda s: s.h - s.b2 - s.b3 - s.hr)
    avg = property(lambda s: s.h / s.ab if s.ab else 0.0)
    obp = property(lambda s: (s.h + s.bb + s.hbp) / s.pa if s.pa else 0.0)
    tb = property(lambda s: s.b1 + 2 * s.b2 + 3 * s.b3 + 4 * s.hr)
    slg = property(lambda s: s.tb / s.ab if s.ab else 0.0)
    ops = property(lambda s: s.obp + s.slg)
    ip = property(lambda s: s.outs / 3)
    era = property(lambda s: s.r * 9 / s.ip if s.outs else 0.0)
    whip = property(lambda s: (s.h + s.bb) / s.ip if s.outs else 0.0)
    k9 = property(lambda s: s.k * 9 / s.ip if s.outs else 0.0)
    ip_str = property(lambda s: f"{s.outs // 3}.{s.outs % 3}")


def dump_career(c):
    fields = BAT_LINE if c.kind == "B" else PIT_LINE
    return {
        "pid": c.p.pid, "k": c.kind,
        "s": [[yr, tm, [getattr(l, f, 0) for f in fields], _f(war), age]
              for (yr, tm, l, war, age) in c.seasons],
        "e": [[y, t] for y, t in c.events],
        "a": dict(c.awards),
        "r": c.retired_year,
    }


def load_career(d, player):
    c = Career(player, d["k"])
    for (yr, tm, vals, war, age) in d["s"]:
        c.seasons.append((yr, tm, Line(d["k"], vals), war, age))
    c.events = [(y, t) for y, t in d["e"]]
    for k, v in d["a"].items():
        c.awards[k] = v
    c.retired_year = d["r"]
    return c


# ---------------------------------------------------------------------------
# 진행 중인 시즌
# 자동저장이라면 플레이어는 시즌 한복판에서 창을 닫는다. 그 상태가 저장되지
# 않으면 자동저장이라 부를 수 없다.
# ---------------------------------------------------------------------------
def dump_season(S):
    if S is None:
        return None
    return {
        "year": S.year, "games": S.games, "day": S.cur_day,
        "rng": list(S.rng.getstate()[1]),
        "sched": [[d, h, a] for d, h, a in S.schedule],
        "rec": {str(k): [r.w, r.l, r.rs, r.ra] for k, r in S.rec.items()},
        "bat": {str(pid): [b.team.team_id,
                           [getattr(b, f) for f in BAT_LINE]]
                for pid, b in S.bat.items()},
        "pit": {str(pid): [q.team.team_id,
                           [getattr(q, f) for f in PIT_LINE]]
                for pid, q in S.pit.items()},
        "res": [[d, h, a, hr, ar] for (d, h, a, hr, ar) in S.results],
        "avail": {str(k): v for k, v in S.avail_day.items()},
        "last": {str(k): v for k, v in S.last_used.items()},
        "consec": {str(k): v for k, v in S.consec.items()},
    }


def load_season(d, teams, players):
    if d is None:
        return None
    from season import Season, SeasonBat, SeasonPit
    S = object.__new__(Season)
    S.teams, S.year, S.games = teams, d["year"], d["games"]
    S.rng = random.Random()
    S.rng.setstate((3, tuple(d["rng"]), None))
    S.schedule = [(x[0], x[1], x[2]) for x in d["sched"]]
    S.by_day = {}
    for day, h, a in S.schedule:
        S.by_day.setdefault(day, []).append((h, a))
    S.cur_day = d["day"]
    by_id = {t.team_id: t for t in teams}

    from season import TeamRecord
    S.rec = {}
    for tid, (w, l, rs, ra) in d["rec"].items():
        r = TeamRecord(by_id[int(tid)])
        r.w, r.l, r.rs, r.ra = w, l, rs, ra
        S.rec[int(tid)] = r

    S.bat, S.pit = {}, {}
    for pid, (tid, vals) in d["bat"].items():
        pid = int(pid)
        if pid not in players:
            continue
        b = SeasonBat(players[pid], by_id[tid])
        for f, v in zip(BAT_LINE, vals):
            setattr(b, f, v)
        S.bat[pid] = b
    for pid, (tid, vals) in d["pit"].items():
        pid = int(pid)
        if pid not in players:
            continue
        q = SeasonPit(players[pid], by_id[tid])
        for f, v in zip(PIT_LINE, vals):
            setattr(q, f, v)
        S.pit[pid] = q

    S.results = [tuple(x) for x in d["res"]]
    S.injuries = []
    S.avail_day = {int(k): v for k, v in d["avail"].items()}
    S.last_used = {int(k): v for k, v in d["last"].items()}
    S.consec = {int(k): v for k, v in d["consec"].items()}
    return S


# ---------------------------------------------------------------------------
# 전체 세이브
# ---------------------------------------------------------------------------
def dump(game):
    L = game.L
    live = {}          # pid -> player dict
    for t in L.teams:
        for p in t.batters + t.pitchers + t.farm:
            live[p.pid] = dump_player(p)
    for p in L.unsigned:
        live[p.pid] = dump_player(p)
    if game.draft_session:
        for p in game.draft_session.available:
            live[p.pid] = dump_player(p)

    # 은퇴/이탈 선수는 커리어에만 남기고 능력치는 버린다.
    # 통산 기록·명예의전당에 필요한 것은 기록이지 능력치가 아니다.
    ghosts = {}
    for pid, c in L.careers.items():
        if pid not in live and c.seasons:
            ghosts[pid] = {"name": c.p.name, "k": c.kind,
                           "pos": (c.p.position if c.kind == "B" else c.p.role),
                           "debut": c.p.debut_year, "age": c.p.age}

    def scout_dump(s):
        # 현역 선수 기억만 남긴다. 이게 세이브 크기의 최대 지분이었다.
        mem = {}
        for pid, m in s.memory.items():
            if pid in live:
                mem[str(pid)] = [[_f(v) for k, v in m.items() if k != "_pot"],
                                 [_f(v) for v in m["_pot"].values()],
                                 [k for k in m if k != "_pot"]]
        return {"ec": _f(s.eval_current), "ep": _f(s.eval_potential),
                "h": _f(s.hitting), "p": _f(s.pitching),
                "bias": {k: _f(v) for k, v in s.bias.items()},
                "mem": mem,
                "looks": {str(k): v for k, v in s.looks.items() if k in live}}

    teams = []
    for t in L.teams:
        teams.append({
            "id": t.team_id, "name": t.name,
            "b": [p.pid for p in t.batters],
            "p": [p.pid for p in t.pitchers],
            "f": [p.pid for p in t.farm],
            "rot": t.rot_index,
            "park": [_f(t.park.hr_factor), _f(t.park.hit_factor)],
            "fin": [_f(t.finance.market_size), _f(t.finance.owner_spending),
                    _f(t.finance.revenue), _f(t.finance.budget)],
            "up": _f(getattr(t, "upside_weight", 0.7)),
            "talent": _f(getattr(t, "talent", 0.0)),
        })

    return {
        "v": VERSION,
        "year": L.year, "games": L.games,
        "user": game.user_id, "phase": game.phase,
        "rng": list(L.rng.getstate()[1]),
        "teams": teams,
        "players": live,
        "ghosts": ghosts,
        "careers": [dump_career(c) for c in L.careers.values()
                    if c.seasons or c.p.pid in live],
        "unsigned": [p.pid for p in L.unsigned],
        "scouts": {str(tid): scout_dump(s) for tid, s in L.scouts.items()},
        "modes": {str(k): v for k, v in L.modes.items()},
        "rec_pct": {str(k): _f(v) for k, v in L.rec_pct.items()},
        "history": [[y, t] for y, t in L.history[-400:]],
        "champions": [[y, t] for y, t in L.champions],
        "next_pid": roster_mod._next_pid[0],
        "season": dump_season(game.season),
        "fa_offers": {str(k): list(v) for k, v in game.fa_offers.items()},
        "champion": game.champion,
        "draft": (None if not game.draft_session else {
            "order": [t.team_id for t in game.draft_session.order],
            "pool": [p.pid for p in game.draft_session.pool],
            "avail": [p.pid for p in game.draft_session.available],
            "n": game.draft_session.n,
            "picks": [[n, rd, t.team_id, p.pid]
                      for (n, rd, t, p, _) in game.draft_session.picks],
        }),
    }


class Ghost:
    """은퇴해 리그를 떠난 선수. 통산 기록 표시에만 쓰이는 껍데기."""
    def __init__(self, pid, d):
        self.pid = pid
        self.name = d["name"]
        self.age = d["age"]
        self.debut_year = d["debut"]
        if d["k"] == "B":
            self.position = d["pos"]
        else:
            self.role = d["pos"]
        self.hidden = {}
        self.pot = {}


def load(data, api_module=None):
    """세이브를 되살려 api.Game 을 반환한다."""
    import api as _api
    api_module = api_module or _api
    if data.get("v") != VERSION:
        raise ValueError(f"세이브 버전 불일치: {data.get('v')} != {VERSION}")

    players = {int(pid): load_player(d) for pid, d in data["players"].items()}
    for pid, p in players.items():
        p.pid = pid
    ghosts = {int(pid): Ghost(int(pid), d) for pid, d in data["ghosts"].items()}

    L = object.__new__(League)
    L.rng = random.Random()
    L.rng.setstate((3, tuple(data["rng"]), None))
    L.year = data["year"]
    L.games = data["games"]
    L.history = [(y, t) for y, t in data["history"]]
    L.champions = [(y, t) for y, t in data["champions"]]
    L.unsigned = [players[pid] for pid in data["unsigned"] if pid in players]
    L.modes = {int(k): v for k, v in data["modes"].items()}
    L.rec_pct = {int(k): v for k, v in data["rec_pct"].items()}
    L.draft_log = []
    L.season = None
    L.fa_log = []
    L.rookies_this_year = []

    teams = []
    for td in data["teams"]:
        t = object.__new__(Team)
        t.team_id, t.name = td["id"], td["name"]
        t.batters = [players[i] for i in td["b"] if i in players]
        t.pitchers = [players[i] for i in td["p"] if i in players]
        t.farm = [players[i] for i in td["f"] if i in players]
        t.rot_index = td["rot"]
        t.park = Park(td["park"][0], td["park"][1])
        f = object.__new__(C.Finance)
        f.market_size, f.owner_spending, f.revenue, f.budget = td["fin"]
        t.finance = f
        t.upside_weight, t.talent = td["up"], td["talent"]
        t.bench, t.lineup, t.rotation, t.bullpen = [], [], [], []
        t.defense = Defense()
        t.unavailable = set()
        teams.append(t)
    L.teams = teams
    for t in teams:
        roster_mod.rebuild_roster(t)

    L.careers = {}
    for cd in data["careers"]:
        pid = cd["pid"]
        p = players.get(pid) or ghosts.get(pid)
        if p is None:
            continue
        L.careers[pid] = load_career(cd, p)

    L.scouts = {}
    for tid, sd in data["scouts"].items():
        s = object.__new__(scouting.ScoutingDept)
        s.eval_current, s.eval_potential = sd["ec"], sd["ep"]
        s.hitting, s.pitching = sd["h"], sd["p"]
        s.bias = dict(sd["bias"])
        s.memory = {}
        for pid, (cur, pot, keys) in sd["mem"].items():
            m = {k: v for k, v in zip(keys, cur)}
            m["_pot"] = {k: v for k, v in zip(keys, pot)}
            s.memory[int(pid)] = m
        s.looks = {int(k): v for k, v in sd["looks"].items()}
        L.scouts[int(tid)] = s

    roster_mod._next_pid[0] = data["next_pid"]

    g = object.__new__(api_module.Game)
    g.L = L
    g.user_id = data["user"]
    g.phase = data["phase"]
    g.season = None
    g.champion = None
    g.playoff_log = []
    g.fa_offers = {}
    g.notices = []
    g.season = load_season(data.get("season"), teams, players)
    L.season = g.season
    g.fa_offers = {int(k): tuple(v) for k, v in data.get("fa_offers", {}).items()}
    g.champion = data.get("champion")

    g.draft_session = None
    dd = data.get("draft")
    if dd:
        import draft as draft_mod
        by_id = {t.team_id: t for t in teams}
        D = object.__new__(draft_mod.DraftSession)
        D.teams, D.scouts, D.rng = teams, L.scouts, L.rng
        D.order = [by_id[i] for i in dd["order"]]
        D.pool = [players[i] for i in dd["pool"] if i in players]
        D.available = [players[i] for i in dd["avail"] if i in players]
        D.n = dd["n"]
        D.picks = [(n, rd, by_id[tid], players[pid],
                    L.scouts[tid].report(players[pid], L.rng))
                   for n, rd, tid, pid in dd["picks"] if pid in players]
        g.draft_session = D
    return g
