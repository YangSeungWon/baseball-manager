"""
Project Dugout - JSON API Layer

웹 UI 가 소비하는 유일한 경계면. 규칙은 두 가지다.

  1. **모든 반환값은 JSON 직렬화 가능한 순수 자료구조**여야 한다.
     엔진 객체를 절대 밖으로 내보내지 않는다.
  2. **UI 가 보는 모든 선수 데이터는 내 팀 스카우트의 눈을 통과한다.**
     진짜 능력치는 이 레이어 밖으로 나가지 않는다. 이게 게임의 핵심이므로
     API 경계에서 강제한다.

코어가 나중에 TypeScript 로 포팅되더라도 이 계약은 그대로 유지된다.
"""
import development as dev
import contract as C
import market
import roster as roster_mod
import draft as draft_mod
from career import League
from season import Season, postseason
from pa_engine import Batter

# 게임 단계
PRESEASON = "preseason"
REGULAR = "regular"
POSTSEASON = "postseason"
OFF_ROLLOVER = "off_rollover"
OFF_FA = "off_fa"
OFF_TRADE = "off_trade"
OFF_DRAFT = "off_draft"

PHASE_LABEL = {
    PRESEASON: "스프링캠프", REGULAR: "정규시즌", POSTSEASON: "포스트시즌",
    OFF_ROLLOVER: "시즌 정리", OFF_FA: "FA 시장",
    OFF_TRADE: "트레이드", OFF_DRAFT: "신인 드래프트",
}


def _r(v, n=0):
    return round(v, n) if n else int(round(v))


class Game:
    """한 세이브 파일에 해당한다."""

    def __init__(self, user_team_id=1, n_teams=8, games=84, start_year=2030, seed=1):
        self.L = League(n_teams, start_year, games, seed)
        self.L.rookies_this_year = []
        self.user_id = user_team_id
        self.phase = PRESEASON
        self.season = None
        self.champion = None
        self.playoff_log = []
        self.fa_offers = {}        # pid -> (years, aav)
        self.draft_session = None
        self.notices = []

    # -- 내부 -----------------------------------------------------------
    @property
    def me(self):
        return self._team(self.user_id)

    def _team(self, tid):
        for t in self.L.teams:
            if t.team_id == tid:
                return t
        return None

    def _find(self, pid):
        for t in self.L.teams:
            for p in t.batters + t.pitchers + t.farm:
                if p.pid == pid:
                    return p, t
        for p in self.L.unsigned:
            if p.pid == pid:
                return p, None
        if self.draft_session:
            for p in self.draft_session.available:
                if p.pid == pid:
                    return p, None
        return None, None

    def notice(self, text, kind="info"):
        self.notices.append({"kind": kind, "text": text})

    # ===================================================================
    # 조회 — 선수
    # ===================================================================
    def _ratings(self, p, viewer=None):
        """스카우팅을 통과한 능력치. 진짜 값은 여기서 나가지 않는다."""
        viewer = viewer or self.me
        c = self.L.careers.get(p.pid)
        is_pro = bool(c and c.seasons)
        rep = self.L.scouts[viewer.team_id].report(p, self.L.rng, is_pro=is_pro)
        out = {}
        for a in dev.attrs_of(p):
            lo, hi = rep.range_of(a, "cur")
            plo, phi = rep.range_of(a, "pot")
            out[a] = {"lo": _r(lo), "hi": _r(hi), "mid": _r(rep.est_cur[a]),
                      "pot_lo": _r(plo), "pot_hi": _r(phi)}
        olo, ohi = rep.ovr_range("cur")
        plo, phi = rep.ovr_range("pot")
        return {
            "attrs": out,
            "ovr": {"lo": _r(olo), "hi": _r(ohi), "mid": _r(rep.ovr)},
            "pot": {"lo": _r(plo), "hi": _r(phi), "mid": _r(rep.pot)},
            "confidence": _r(rep.confidence),
            "comment": rep.text(),
        }

    def player_brief(self, p, team=None, viewer=None):
        """목록에 쓰는 짧은 형태."""
        rep = self._ratings(p, viewer)
        ip = not isinstance(p, Batter)
        return {
            "pid": p.pid, "name": p.name, "age": p.age,
            "slot": p.role if ip else p.position,
            "kind": "P" if ip else "B",
            "hand": p.throws if ip else p.bats,
            "ovr": rep["ovr"], "pot": rep["pot"],
            "team_id": team.team_id if team else None,
            "injury_days": p.injury_days,
            "contract": self._contract(p),
            "service": getattr(p, "service", 0),
        }

    def _contract(self, p):
        c = p.contract
        if not c:
            return None
        y = self.L.year
        return {"years": c.years, "total": _r(c.total, 1),
                "aav": _r(c.aav, 1), "salary": _r(c.salary_in(y), 1),
                "end_year": c.end_year, "text": str(c)}

    def player(self, pid):
        """선수 상세 화면."""
        p, t = self._find(pid)
        if p is None:
            return {"error": "not_found"}
        c = self.L.careers.get(pid)
        out = self.player_brief(p, t)
        out.update(self._ratings(p))
        out["origin"] = getattr(p, "origin", None)
        out["draft"] = ({"round": p.drafted_round, "overall": p.drafted_overall}
                        if hasattr(p, "drafted_overall") else None)
        out["debut_year"] = p.debut_year
        out["injuries"] = {"count": getattr(p, "career_injuries", 0),
                           "days": getattr(p, "career_injury_days", 0)}
        out["seasons"] = []
        if c:
            for (yr, tm, line, war, age) in c.seasons:
                if isinstance(p, Batter):
                    row = {"year": yr, "team": tm, "age": age, "g": line.g,
                           "pa": line.pa, "avg": f"{line.avg:.3f}",
                           "obp": f"{line.obp:.3f}", "slg": f"{line.slg:.3f}",
                           "hr": line.hr, "rbi": line.rbi, "sb": line.sb,
                           "war": _r(war, 1)}
                else:
                    row = {"year": yr, "team": tm, "age": age, "g": line.g,
                           "gs": line.gs, "ip": line.ip_str, "w": line.w,
                           "l": line.l, "sv": line.sv,
                           "era": f"{line.era:.2f}", "k": line.k,
                           "whip": f"{line.whip:.2f}", "war": _r(war, 1)}
                out["seasons"].append(row)
            out["career_war"] = _r(c.war, 1)
            out["awards"] = dict(c.awards)
            out["events"] = [{"year": y, "text": x} for y, x in c.events]
        return out

    # ===================================================================
    # 조회 — 팀 / 리그
    # ===================================================================
    def state(self):
        me = self.me
        s = self.season
        return {
            "year": self.L.year,
            "phase": self.phase,
            "phase_label": PHASE_LABEL[self.phase],
            "day": s.cur_day if s else 0,
            "total_days": s.total_days if s else 0,
            "user_team": {"id": me.team_id, "name": me.name},
            "mode": self.L.modes.get(me.team_id),
            "notices": self.notices,
        }

    def standings(self):
        s = self.season
        if not s:
            return {"rows": []}
        rows = []
        top = s.standings()[0]
        for i, r in enumerate(s.standings()):
            gb = ((top.w - r.w) + (r.l - top.l)) / 2
            rows.append({
                "rank": i + 1, "team_id": r.team.team_id, "team": r.team.name,
                "w": r.w, "l": r.l, "pct": f"{r.pct:.3f}",
                "gb": "-" if gb == 0 else f"{gb:.1f}",
                "rs": r.rs, "ra": r.ra, "pyth": f"{r.pyth:.3f}",
                "playoff": i < 4, "is_user": r.team.team_id == self.user_id,
            })
        return {"rows": rows}

    def roster(self, team_id=None):
        t = self._team(team_id or self.user_id)
        roster_mod.rebuild_roster(t, healthy_only=True)
        s = self.season

        def stat(p):
            if not s:
                return {}
            if isinstance(p, Batter):
                b = s.bat.get(p.pid)
                return ({"g": b.g, "pa": b.pa, "avg": f"{b.avg:.3f}",
                         "ops": f"{b.ops:.3f}", "hr": b.hr, "rbi": b.rbi,
                         "sb": b.sb} if b else {})
            q = s.pit.get(p.pid)
            return ({"g": q.g, "ip": q.ip_str, "w": q.w, "l": q.l, "sv": q.sv,
                     "era": f"{q.era:.2f}", "k": q.k} if q else {})

        def grp(players, tag):
            out = []
            for i, p in enumerate(players):
                d = self.player_brief(p, t)
                d["group"] = tag
                d["order"] = i + 1
                d["stat"] = stat(p)
                out.append(d)
            return out

        injured = [p for p in t.batters + t.pitchers if p.injury_days > 0]
        return {
            "team_id": t.team_id, "name": t.name,
            "lineup": grp(t.lineup, "lineup"),
            "bench": grp(t.bench, "bench"),
            "rotation": grp(t.rotation, "rotation"),
            "bullpen": grp(t.bullpen, "bullpen"),
            "injured": [dict(self.player_brief(p, t), group="injured") for p in injured],
            "payroll": _r(C.payroll(t, self.L.year), 1),
            "budget": _r(t.finance.budget, 1),
            "mode": self.L.modes.get(t.team_id),
        }

    def farm(self, team_id=None):
        t = self._team(team_id or self.user_id)
        rows = [self.player_brief(p, t) for p in
                sorted(t.farm, key=lambda x: -self.L.see(t, x).pot)]
        return {"team": t.name, "rows": rows}

    def leaders(self, n=5):
        s = self.season
        if not s:
            return {}
        bw, pw = s.wars()
        g = s.games_played
        qb, qp = s.qualified_batters(g), s.qualified_pitchers(g)
        if not qb:
            qb = sorted(s.bat.values(), key=lambda b: -b.pa)[:20]
        if not qp:
            qp = sorted(s.pit.values(), key=lambda p: -p.outs)[:20]

        def top(items, key, fmt, label):
            xs = sorted(items, key=key, reverse=True)[:n]
            return {"label": label, "rows": [
                {"pid": x.p.pid, "name": x.p.name, "team": x.team.name,
                 "value": fmt(x)} for x in xs]}

        return {"batting": [
            top(qb, lambda b: b.avg, lambda b: f"{b.avg:.3f}", "타율"),
            top(qb, lambda b: b.obp, lambda b: f"{b.obp:.3f}", "출루율"),
            top(qb, lambda b: b.ops, lambda b: f"{b.ops:.3f}", "OPS"),
            top(s.bat.values(), lambda b: b.hr, lambda b: str(b.hr), "홈런"),
            top(s.bat.values(), lambda b: b.rbi, lambda b: str(b.rbi), "타점"),
            top(s.bat.values(), lambda b: b.sb, lambda b: str(b.sb), "도루"),
            top(qb, lambda b: bw[b.p.pid], lambda b: f"{bw[b.p.pid]:.1f}", "WAR"),
        ], "pitching": [
            top(qp, lambda p: -p.era, lambda p: f"{p.era:.2f}", "ERA"),
            top(s.pit.values(), lambda p: p.k, lambda p: str(p.k), "탈삼진"),
            top(s.pit.values(), lambda p: p.w, lambda p: str(p.w), "다승"),
            top(s.pit.values(), lambda p: p.sv, lambda p: str(p.sv), "세이브"),
            top(qp, lambda p: pw[p.p.pid], lambda p: f"{pw[p.p.pid]:.1f}", "WAR"),
        ]}

    def schedule(self, days=7):
        s = self.season
        if not s:
            return {"rows": []}
        rows = []
        for d in range(s.cur_day, min(s.cur_day + days, s.total_days)):
            for hi, ai in s.by_day.get(d, []):
                H, A = s.teams[hi], s.teams[ai]
                if self.user_id in (H.team_id, A.team_id):
                    rows.append({"day": d + 1, "home": H.name, "away": A.name,
                                 "is_home": H.team_id == self.user_id})
        return {"rows": rows}

    def recent_results(self, n=8):
        s = self.season
        if not s:
            return {"rows": []}
        rows = []
        for (d, hi, ai, hr, ar) in s.results[-200:]:
            H, A = s.teams[hi], s.teams[ai]
            if self.user_id not in (H.team_id, A.team_id):
                continue
            mine, opp = (hr, ar) if H.team_id == self.user_id else (ar, hr)
            rows.append({"day": d + 1, "opponent": (A if H.team_id == self.user_id else H).name,
                         "home": H.team_id == self.user_id,
                         "score": f"{mine} : {opp}",
                         "result": "승" if mine > opp else ("패" if mine < opp else "무")})
        return {"rows": rows[-n:]}

    def finances(self):
        t = self.me
        f = t.finance
        y = self.L.year
        contracts = sorted(
            [p for p in t.batters + t.pitchers if p.contract],
            key=lambda p: -p.contract.salary_in(y))
        return {
            "market_size": _r(f.market_size, 2), "revenue": _r(f.revenue),
            "budget": _r(f.budget), "payroll": _r(C.payroll(t, y), 1),
            "room": _r(f.budget - C.payroll(t, y), 1),
            "contracts": [{"pid": p.pid, "name": p.name, "age": p.age,
                           "salary": _r(p.contract.salary_in(y), 1),
                           "text": str(p.contract),
                           "end_year": p.contract.end_year} for p in contracts],
        }

    def history(self, n=30):
        return {"rows": [{"year": y, "text": t} for y, t in self.L.history[-n:]],
                "champions": [{"year": y, "team": t} for y, t in self.L.champions]}

    def records(self, n=10):
        bats = [c for c in self.L.careers.values() if c.kind == "B" and c.years >= 2]
        alls = [c for c in self.L.careers.values() if c.years >= 2]
        def row(c, v):
            return {"pid": c.p.pid, "name": c.p.name, "value": v,
                    "years": c.years, "active": c.retired_year is None}
        return {
            "hr": [row(c, c.tot("hr")) for c in
                   sorted(bats, key=lambda c: -c.tot("hr"))[:n]],
            "war": [row(c, f"{c.war:.1f}") for c in
                    sorted(alls, key=lambda c: -c.war)[:n]],
        }

    # ===================================================================
    # 액션 — 시즌 진행
    # ===================================================================
    def start_season(self):
        if self.phase != PRESEASON:
            return {"error": "wrong_phase"}
        self.season = Season(self.L.teams, self.L.year, self.L.games,
                             seed=self.L.rng.randrange(1 << 30))
        self.L.season = self.season
        self.phase = REGULAR
        self.notices = []
        return self.state()

    def advance(self, days=1):
        """하루~여러 날 진행. UI 의 '다음 날' 버튼."""
        if self.phase != REGULAR:
            return {"error": "wrong_phase"}
        self.notices = []
        played = []
        for _ in range(days):
            if self.season.finished:
                break
            n_inj = len(self.season.injuries)
            res = self.season.play_day(keep_boxscore=self.user_id)
            for (hi, ai, hr, ar, box) in res:
                H, A = self.season.teams[hi], self.season.teams[ai]
                if self.user_id in (H.team_id, A.team_id):
                    mine = hr if H.team_id == self.user_id else ar
                    opp = ar if H.team_id == self.user_id else hr
                    played.append({
                        "day": self.season.cur_day,
                        "opponent": (A if H.team_id == self.user_id else H).name,
                        "score": f"{mine} : {opp}",
                        "result": "승" if mine > opp else ("패" if mine < opp else "무"),
                        "box": self._boxscore(box) if box else None})
            for (d, t, p, dd, label, lost) in self.season.injuries[n_inj:]:
                if t.team_id == self.user_id:
                    self.notice(f"{p.name} {label} — {dd}일 결장", "injury")
        if self.season.finished:
            self.phase = POSTSEASON
            self.notice("정규시즌 종료", "phase")
        return {"state": self.state(), "games": played}

    def sim_to_end(self):
        return self.advance(self.season.total_days - self.season.cur_day)

    def _boxscore(self, box):
        H, A = box
        def side(S):
            return {"team": S.team.name, "runs": S.runs, "hits": S.hits,
                    "line": S.line,
                    "pitchers": [{"name": pl.p.name, "ip": pl.ip, "h": pl.h,
                                  "r": pl.r, "k": pl.k, "bb": pl.bb,
                                  "dec": "승" if pl.w else "패" if pl.l else
                                         "세" if pl.sv else ""}
                                 for pl in S.pitchers],
                    "batters": [{"name": b.name, "slot": b.position,
                                 "ab": S.bat[id(b)].ab, "h": S.bat[id(b)].h,
                                 "hr": S.bat[id(b)].hr, "rbi": S.bat[id(b)].rbi,
                                 "bb": S.bat[id(b)].bb, "k": S.bat[id(b)].k}
                                for b in S.team.lineup if id(b) in S.bat]}
        return {"home": side(H), "away": side(A)}

    def run_postseason(self):
        if self.phase != POSTSEASON:
            return {"error": "wrong_phase"}
        champ, log = postseason(self.season, self.L.rng)
        self.champion = champ.name
        self.playoff_log = [{"round": r, "winner": w.name, "loser": l.name,
                             "score": f"{sc[0]}승 {sc[1]}패"} for r, w, l, sc in log]
        # 커리어/시상 반영은 League 가 담당한다
        self._absorb_season_into_league(champ, log)
        self.phase = OFF_ROLLOVER
        return {"champion": self.champion, "rounds": self.playoff_log}

    def _absorb_season_into_league(self, champ, log):
        L, S = self.L, self.season
        bw, pw = S.wars()
        for b in S.bat.values():
            c = L._career(b.p)
            if not c.seasons:
                b.p.debut_year = L.year
            c.add(L.year, b.team.name, b, bw[b.p.pid], b.p.age)
        for p in S.pit.values():
            c = L._career(p.p)
            if not c.seasons:
                p.p.debut_year = L.year
            c.add(L.year, p.team.name, p, pw[p.p.pid], p.p.age)
        cands = ([(bw[b.p.pid], b.p) for b in S.bat.values() if b.pa >= 200]
                 + [(pw[q.p.pid], q.p) for q in S.pit.values() if q.ip >= 50])
        if cands:
            mvp = max(cands, key=lambda x: x[0])[1]
            L.careers[mvp.pid].awards["MVP"] += 1
            L.log(f"MVP {mvp.name}")
        for t in L.teams:
            for p in t.batters + t.pitchers:
                p.service = getattr(p, "service", 0) + 1
        for r in S.standings():
            L.rec_pct[r.team.team_id] = r.pct
        L.champions.append((L.year, champ.name))
        L.log(f"★ 챔피언 {champ.name}")
        L.season = S

    # ===================================================================
    # 액션 — 오프시즌
    # ===================================================================
    def offseason_rollover(self):
        if self.phase != OFF_ROLLOVER:
            return {"error": "wrong_phase"}
        s = self.L.off_rollover()
        me = self.user_id
        out = {"retired": [{"name": p.name, "age": p.age, "team": t.name,
                            "mine": t.team_id == me}
                           for p, t in s["retired"]],
               "breakout": [{"name": p.name, "team": t.name, "delta": _r(d, 1),
                             "mine": t.team_id == me}
                            for p, t, d in s["breakout"] if t.team_id == me],
               "decline": [{"name": p.name, "team": t.name, "delta": _r(d, 1),
                            "mine": t.team_id == me}
                           for p, t, d in s["decline"] if t.team_id == me]}
        self.phase = OFF_FA
        self.fa_offers = {}
        return out

    def free_agents(self):
        """FA 시장에 나올 선수 목록 + 예상 요구 조건."""
        if self.phase != OFF_FA:
            return {"rows": []}
        me = self.me
        year = self.L.year
        rows = []
        for t in self.L.teams:
            for p in t.batters + t.pitchers:
                if p.contract and p.contract.end_year > year:
                    continue
                if C.is_free_agent(p, year):
                    rows.append((p, t))
        for p in self.L.unsigned:
            rows.append((p, None))
        out = []
        for p, t in rows:
            ip = not isinstance(p, Batter)
            r = self.L.see(me, p)
            ask_aav = C.market_value(r.ovr, p.age, ip)
            ask_yrs = C.demand_years(p.age, r.ovr)
            d = self.player_brief(p, t)
            d["former_team"] = t.name if t else "미계약"
            d["ask"] = {"years": ask_yrs, "aav": _r(ask_aav, 1),
                        "total": _r(ask_aav * ask_yrs, 1)}
            d["offer"] = self.fa_offers.get(p.pid)
            out.append(d)
        out.sort(key=lambda d: -d["ask"]["total"])
        f = me.finance
        return {"rows": out, "budget": _r(f.budget), "room":
                _r(f.budget - C.payroll(me, year + 1), 1)}

    def offer(self, pid, years, aav):
        if self.phase != OFF_FA:
            return {"error": "wrong_phase"}
        self.fa_offers[pid] = (int(years), float(aav))
        return {"ok": True, "offers": self.fa_offers}

    def cancel_offer(self, pid):
        self.fa_offers.pop(pid, None)
        return {"ok": True, "offers": self.fa_offers}

    def resolve_fa(self):
        if self.phase != OFF_FA:
            return {"error": "wrong_phase"}
        log = self.L.off_fa(user_offers=self.fa_offers, user_team=self.me)
        out = [{"name": p.name, "team": t.name, "text": str(c),
                "mine": t.team_id == self.user_id,
                "moved": t is not cur} for (p, t, c, cur) in log]
        self.phase = OFF_TRADE
        return {"signings": sorted(out, key=lambda x: not x["mine"])}

    def trade_evaluate(self, give_pids, get_pids, other_team_id):
        """제안을 상대 팀이 어떻게 볼지 알려준다. 정확한 수치는 숨긴다."""
        other = self._team(other_team_id)
        me = self.me
        yr, modes = self.L.year, self.L.modes
        def val(team, pids):
            s = 0.0
            for pid in pids:
                p, _ = self._find(pid)
                if p is None:
                    continue
                farm = any(x is p for x in me.farm + other.farm)
                s += market.trade_value(self.L, team, p, yr, modes[team.team_id], farm)
            return s
        their_gain = val(other, give_pids) - val(other, get_pids)
        my_gain = val(me, get_pids) - val(me, give_pids)
        if their_gain > 6.0:
            verdict, text = "accept", "받아들일 만한 제안입니다."
        elif their_gain > -2.0:
            verdict, text = "close", "조금 아쉽습니다. 뭔가 더 얹어 주시죠."
        else:
            verdict, text = "reject", "우리에게 손해입니다."
        return {"verdict": verdict, "text": text,
                "my_gain": _r(my_gain, 1), "mode": modes[other_team_id]}

    def propose_trade(self, give_pids, get_pids, other_team_id):
        r = self.trade_evaluate(give_pids, get_pids, other_team_id)
        if r["verdict"] != "accept":
            return dict(r, ok=False)
        me, other = self.me, self._team(other_team_id)
        for pid in give_pids:
            p, _ = self._find(pid)
            market._move(me, p, any(x is p for x in me.farm), other)
        for pid in get_pids:
            p, _ = self._find(pid)
            market._move(other, p, any(x is p for x in other.farm), me)
        self.L.log(f"[트레이드] {me.name} ↔ {other.name} "
                   f"({len(give_pids)}:{len(get_pids)})")
        return dict(r, ok=True)

    def resolve_trades(self):
        if self.phase != OFF_TRADE:
            return {"error": "wrong_phase"}
        n = self.L.off_trades()
        self.L.off_cleanup()
        self.draft_session = self.L.new_draft_session()
        self.draft_session.run_until(self.me)
        self.phase = OFF_DRAFT
        return {"ai_trades": n}

    def draft_board(self, n=30):
        d = self.draft_session
        if d is None:
            return {"rows": []}
        me = self.me
        rows = []
        for p in d.available:
            b = self.player_brief(p, None)
            b["origin"] = getattr(p, "origin", None)
            rows.append(b)
        rows.sort(key=lambda x: -(x["pot"]["mid"] * 0.7 + x["ovr"]["mid"] * 0.3))
        return {
            "on_clock": d.on_clock.name if d.on_clock else None,
            "my_turn": d.on_clock is me,
            "pick_no": d.n + 1, "round": d.current_round,
            "total": d.total_picks,
            "rows": rows[:n],
            "picks": [{"n": n_, "round": rd, "team": t.name, "name": p.name,
                       "age": p.age, "origin": getattr(p, "origin", ""),
                       "mine": t.team_id == self.user_id}
                      for (n_, rd, t, p, _) in d.picks],
        }

    def draft_pick(self, pid):
        d = self.draft_session
        if d is None or d.on_clock is not self.me:
            return {"error": "not_your_turn"}
        p, _ = self._find(pid)
        if p is None:
            return {"error": "not_found"}
        rec = d.pick(p)
        d.run_until(self.me)
        if d.done:
            return self.finish_offseason()
        return {"picked": rec[3].name, "board": self.draft_board()}

    def finish_offseason(self):
        d = self.draft_session
        if d is not None:
            d.run_until()
            self.L.finish_draft(d)
        self.draft_session = None
        self.phase = PRESEASON
        self.season = None
        self.champion = None
        return {"state": self.state()}
