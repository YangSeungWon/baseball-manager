"""
Project Dugout - Multi-Season / Career Engine

시즌을 이어붙이고 선수의 커리어를 만든다.
  시즌 → 성장/노화 → 은퇴 → 팜 승격 → 신인 유입 → 다음 시즌
"""
import random
from collections import defaultdict

import development as dev
import roster
from roster import (make_prospect_batter, make_prospect_pitcher, age_to,
                    rebuild_roster, LINEUP_POS, FIELD_POS)
from pa_engine import Batter
from season import Season, postseason
import scouting
import draft as draft_mod
import contract as C
import market


class Career:
    """한 선수의 통산 기록 + 연도별 기록 + 이력."""

    def __init__(self, p, kind):
        self.p, self.kind = p, kind
        self.seasons = []          # (year, team_name, SeasonBat/SeasonPit, WAR)
        self.events = []           # (year, text)
        self.awards = defaultdict(int)
        self.retired_year = None

    def add(self, year, team, line, war, age):
        self.seasons.append((year, team, line, war, age))

    def tot(self, field):
        return sum(getattr(l, field) for _, _, l, _, _ in self.seasons)

    @property
    def war(self):
        return sum(w for _, _, _, w, _ in self.seasons)

    @property
    def years(self):
        return len(self.seasons)

    @property
    def peak_war(self):
        return max((w for _, _, _, w, _ in self.seasons), default=0.0)


class League:
    def __init__(self, n_teams=8, start_year=2030, games=84, seed=1):
        self.rng = random.Random(seed)
        self.year = start_year
        self.games = games
        self.teams = roster.make_league(n_teams, seed=seed, year=start_year)
        self.careers = {}
        self.history = []          # (year, text)
        self.champions = []
        self.free_agents = []      # 방출됐지만 아직 은퇴 안 한 선수
        self.scouts = {t.team_id: scouting.ScoutingDept(self.rng) for t in self.teams}
        for t in self.teams:                       # 구단별 드래프트 성향
            t.upside_weight = self.rng.uniform(0.55, 0.85)
        self.draft_log = []
        self.unsigned = []
        self.rec_pct = {t.team_id: 0.5 for t in self.teams}
        self.modes = {t.team_id: market.NEUTRAL for t in self.teams}
        for t in self.teams:
            t.finance = C.Finance(self.rng)
            for p in t.batters + t.pitchers:
                p.service = max(0, min(12, p.age - 21))
                ovr = dev.overall(p)
                if p.service >= C.FA_SERVICE:
                    aav = C.market_value(ovr, p.age, not isinstance(p, Batter))
                    yrs = self.rng.randint(1, C.demand_years(p.age, ovr))
                else:
                    aav = C.renewal_salary(p, ovr, not isinstance(p, Batter))
                    yrs = self.rng.randint(1, 2)
                p.contract = C.Contract(start_year - self.rng.randint(0, yrs - 1)
                                        if yrs > 1 else start_year,
                                        [round(aav, 2)] * yrs, t.team_id)
        for t in self.teams:
            for p in t.batters + t.pitchers:
                self._career(p)

    # -- 유틸 ------------------------------------------------------------
    def _career(self, p):
        if p.pid not in self.careers:
            kind = "B" if isinstance(p, Batter) else "P"
            self.careers[p.pid] = Career(p, kind)
        return self.careers[p.pid]

    FARM_CAP = 18

    def see(self, t, p):
        """그 팀의 눈에 비친 선수. 진실이 아니다."""
        c = self.careers.get(p.pid)
        is_pro = bool(c and c.seasons)
        r = self.scouts[t.team_id].report(p, self.rng, is_pro=is_pro)
        return r

    def _farm_value(self, t, p):
        r = self.see(t, p)
        return 0.65 * r.pot + 0.35 * r.ovr

    def log(self, text):
        self.history.append((self.year, text))

    # -- 시즌 ------------------------------------------------------------
    def play_season(self):
        S = Season(self.teams, year=self.year, games=self.games,
                   seed=self.rng.randrange(1 << 30)).run()
        bw, pw = S.wars()
        for b in S.bat.values():
            c = self._career(b.p)
            if not c.seasons:
                b.p.debut_year = self.year        # 1군에서 처음 기록을 남긴 해
            c.add(self.year, b.team.name, b, bw[b.p.pid], b.p.age)
        for p in S.pit.values():
            c = self._career(p.p)
            if not c.seasons:
                p.p.debut_year = self.year
            c.add(self.year, p.team.name, p, pw[p.p.pid], p.p.age)

        # 시상
        cands = ([(bw[b.p.pid], b.p) for b in S.bat.values() if b.pa >= 200]
                 + [(pw[p.p.pid], p.p) for p in S.pit.values() if p.ip >= 50])
        mvp = max(cands, key=lambda x: x[0])[1]
        cy = max(((pw[p.p.pid], p.p) for p in S.pit.values() if p.ip >= 50),
                 key=lambda x: x[0])[1]
        roy_c = [(bw.get(pid, 0) + pw.get(pid, 0), c.p)
                 for pid, c in self.careers.items()
                 if len(c.seasons) == 1 and c.seasons[0][0] == self.year]
        self.careers[mvp.pid].awards["MVP"] += 1
        self.careers[cy.pid].awards["최고투수"] += 1
        self.log(f"MVP {mvp.name} / 최고투수 {cy.name}")
        if roy_c:
            roy = max(roy_c, key=lambda x: x[0])[1]
            self.careers[roy.pid].awards["신인왕"] += 1
            self.log(f"신인왕 {roy.name}")

        for (day, t, p, days, label, lost) in S.injuries:
            if days >= 46:
                c = self._career(p)
                c.events.append((self.year, f"{label} ({days}일)"))
                c.injuries = getattr(c, "injuries", 0) + 1
                if c.years >= 3 and days >= 120:
                    self.log(f"{p.name} {label} — {days}일 결장")

        for t in self.teams:
            for p in t.batters + t.pitchers:
                p.service = getattr(p, "service", 0) + 1
        for r in S.standings():
            self.rec_pct[r.team.team_id] = r.pct

        champ, plog = postseason(S, self.rng)
        self.champions.append((self.year, champ.name))
        self.log(f"★ 챔피언 {champ.name}")
        self.season = S
        return S, champ

    # -- 오프시즌 --------------------------------------------------------
    def _playing_time(self, p, S):
        if isinstance(p, Batter):
            b = S.bat.get(p.pid)
            if b and b.pa:
                return min(1.3, b.pa / 380)
        else:
            q = S.pit.get(p.pid)
            if q and q.outs:
                return min(1.3, (q.ip / 90) if q.gs else (q.g / 40))
        # 1군에서 안 뛰었으면 2군 출전으로 간주 (어릴수록 많이 뛴다)
        return 0.85 if p.age <= 23 else 0.45

    def off_rollover(self):
        """① 회복 · 성장/노화 · 은퇴 · 재정/방향 결정. 요약을 반환한다."""
        S = self.season
        rng = self.rng
        self.rookies_this_year = []
        summary = {"retired": [], "breakout": [], "decline": []}

        for t in self.teams:
            for p in t.batters + t.pitchers + t.farm:
                p.injury_days = max(0, p.injury_days - 120)
            self._trim(t)

        before = {}
        for t in self.teams:
            for p in t.batters + t.pitchers:
                before[p.pid] = dev.overall(p)
        for t in self.teams:
            for p in t.batters + t.pitchers:
                dev.develop(p, rng, playing_time=self._playing_time(p, S))
            for p in t.farm:
                dev.develop(p, rng, playing_time=0.85 if p.age <= 22 else 0.6)
        for p in self.unsigned:
            dev.develop(rng=rng, p=p, playing_time=0.30)

        for t in self.teams:
            for group in ("batters", "pitchers"):
                keep = []
                for p in getattr(t, group):
                    if rng.random() < dev.retire_prob(p, self._playing_time(p, S)):
                        self._retire(p, t)
                        summary["retired"].append((p, t))
                    else:
                        keep.append(p)
                        d = dev.overall(p) - before.get(p.pid, dev.overall(p))
                        if d >= 3.0:
                            summary["breakout"].append((p, t, d))
                        elif d <= -3.0:
                            summary["decline"].append((p, t, d))
                setattr(t, group, keep)
            cut = [p for p in t.farm if p.age > 24]
            t.farm = [p for p in t.farm if p.age <= 24]
            for p in cut:
                c = self.careers.get(p.pid)
                if c is not None and c.seasons:
                    c.retired_year = self.year

        for t in self.teams:
            self._fill_roster(t)
            rebuild_roster(t)

        st = {r.team.team_id: r for r in S.standings()}
        champ = self.champions[-1][1] if self.champions else None
        top4 = [x.team.team_id for x in S.standings()[:4]]
        for t in self.teams:
            r = st.get(t.team_id)
            t.finance.update(r.pct if r else 0.5, t.team_id in top4, t.name == champ)
            self.modes[t.team_id] = market.team_mode(t, r, self)
        return summary

    def off_fa(self, user_offers=None, user_team=None):
        """② FA 시장. user_offers 가 있으면 그 팀은 AI 대신 사용자의 오퍼를 쓴다."""
        self.fa_log = market.run_free_agency(
            self, self.year, extra=self.unsigned, log=self.log,
            user_offers=user_offers, user_team=user_team)
        return self.fa_log

    def off_trades(self):
        """③ AI 간 트레이드."""
        return market.run_trades(self, self.year, self.modes, log=self.log)

    def off_cleanup(self):
        """④ 예산 정리 · 로스터 정원 복귀 · 미계약자 처리 · 팜 정리."""
        rng = self.rng
        for t in self.teams:
            self._shed_salary(t)
            self._trim(t)
            self._fill_roster(t)
            self._compete(t)
            rebuild_roster(t)
        still = []
        for p in self.unsigned:
            p.unsigned_years = getattr(p, "unsigned_years", 0) + 1
            if p.unsigned_years >= 2 or p.age >= 36:
                c = self.careers.get(p.pid)
                if c is not None and c.seasons and not c.retired_year:
                    c.retired_year = self.year
                    if c.years >= 5:
                        self.log(f"{p.name} 미계약 은퇴 "
                                 f"({c.years}시즌, WAR {c.war:.1f})")
            else:
                still.append(p)
        self.unsigned = still
        for t in self.teams:
            dept = self.scouts[t.team_id]
            for p in t.farm:
                dept.observe(p, rng, 1)
            while len(t.farm) > self.FARM_CAP:
                worst = min(t.farm, key=lambda x: self._farm_value(t, x))
                t.farm.remove(worst)
                c = self.careers.get(worst.pid)
                if c is not None and c.seasons:
                    c.retired_year = self.year

    def new_draft_session(self):
        """⑤ 드래프트 세션 생성 (성적 역순)."""
        order = [r.team for r in reversed(self.season.standings())]
        pool = draft_mod.make_class(self.rng, self.year + 1)
        return draft_mod.DraftSession(self.teams, self.scouts, order, pool, self.rng)

    def finish_draft(self, session):
        picks = session.picks
        self.draft_log.append((self.year + 1, picks))
        for (n, rd, t, p, rep) in picks:
            c = self._career(p)
            c.events.append((self.year + 1, f"전체 {n}순위 지명 ({t.name})"))
            c.draft_pick, c.draft_round = n, rd
            c.scouted_pot = rep.pot
            c.retired_year = None
            c.seasons = []
        self.year += 1

    def offseason(self):
        """전 단계를 순서대로 실행 (headless 검증용)."""
        self.off_rollover()
        self.off_fa()
        self.off_trades()
        self.off_cleanup()
        s = self.new_draft_session()
        s.run_until()
        self.finish_draft(s)

    def _new_prospect(self, t, rng):
        talent = rng.gauss(getattr(t, "talent", 0.0) * 0.3, 0.95)
        if rng.random() < 0.5:
            p = make_prospect_batter(rng, rng.choice(LINEUP_POS), talent, self.year)
        else:
            p = make_prospect_pitcher(rng, rng.choice(["SP", "SP", "RP"]),
                                      talent, self.year)
        return p

    def _retire(self, p, t):
        c = self._career(p)
        c.retired_year = self.year
        if c.years >= 3:
            self.log(f"{p.name} 은퇴 ({c.years}시즌, 통산 WAR {c.war:.1f})")

    def _promote(self, t, want_pitcher, pos=None):
        """팜 또는 미계약 시장에서 조건에 맞는 최고 선수를 1군으로 올린다."""
        cand = [p for p in t.farm
                if (not isinstance(p, Batter)) == want_pitcher
                and (pos is None or getattr(p, "position", None) == pos)]
        free = [p for p in self.unsigned
                if (not isinstance(p, Batter)) == want_pitcher
                and (pos is None or getattr(p, "position", None) == pos)]
        if free:
            bf = max(free, key=lambda x: self.see(t, x).ovr)
            if not cand or self.see(t, bf).ovr > self.see(t, max(
                    cand, key=lambda x: self.see(t, x).ovr)).ovr:
                self.unsigned.remove(bf)
                bf.contract = C.Contract(self.year + 1, [C.MIN_SALARY * 2], t.team_id)
                return bf
        if not cand:
            return None
        best = max(cand, key=lambda x: self.see(t, x).ovr)
        t.farm.remove(best)
        c = self._career(best)
        if not c.seasons:
            best.debut_year = self.year + 1
            self.rookies_this_year.append(best)
            self.log(f"{t.name} {best.name}({best.age}세) 1군 데뷔")
        return best

    def _fill_roster(self, t):
        rng = self.rng
        # 포지션 공백 메우기
        for pos in FIELD_POS:
            if not any(b.position == pos for b in t.batters):
                p = self._promote(t, False, pos)
                if p is None:
                    p = make_prospect_batter(rng, pos, rng.gauss(0, 0.8), self.year)
                    age_to(p, 22, rng, 0.85)
                    self.rookies_this_year.append(p)
                    p.debut_year = self.year + 1
                t.batters.append(p)
        while len(t.batters) < 13:
            p = self._promote(t, False)
            if p is None:
                p = make_prospect_batter(rng, rng.choice(LINEUP_POS),
                                         rng.gauss(-0.4, 0.8), self.year)
                age_to(p, 22, rng, 0.85)
                self.rookies_this_year.append(p)
                p.debut_year = self.year + 1
            t.batters.append(p)
        need_sp = 5 - sum(1 for p in t.pitchers if p.role == "SP")
        while len(t.pitchers) < 12 or need_sp > 0:
            role = "SP" if need_sp > 0 else "RP"
            cand = [p for p in t.farm if not isinstance(p, Batter) and p.role == role]
            if cand:
                best = max(cand, key=lambda x: self.see(t, x).ovr)
                t.farm.remove(best)
                if not self._career(best).seasons:
                    best.debut_year = self.year + 1
                    self.rookies_this_year.append(best)
                p = best
            else:
                p = make_prospect_pitcher(rng, role, rng.gauss(-0.3, 0.8), self.year)
                age_to(p, 22, rng, 0.85)
                self.rookies_this_year.append(p)
                p.debut_year = self.year + 1
            t.pitchers.append(p)
            if role == "SP":
                need_sp -= 1
            if len(t.pitchers) >= 12 and need_sp <= 0:
                break

    def _trim(self, t):
        """시즌 중 부상 콜업으로 불어난 로스터를 정원(타자13/투수12)으로 되돌린다."""
        for group, cap, want_p in (("batters", 13, False), ("pitchers", 12, True)):
            pool = getattr(t, group)
            while len(pool) > cap:
                prot = set()
                if want_p:
                    prot = {id(x) for x in sorted(
                        [p for p in pool if p.role == "SP"],
                        key=dev.overall, reverse=True)[:5]}
                else:
                    for pos in FIELD_POS:
                        same = [b for b in pool if b.position == pos]
                        if len(same) == 1:
                            prot.add(id(same[0]))
                cands = [p for p in pool if id(p) not in prot] or pool
                worst = min(cands, key=dev.overall)
                pool.remove(worst)
                self._release(worst, t)

    def _compete(self, t):
        """팜의 최고 유망주가 1군 최약체보다 확실히 낫다면 자리를 빼앗는다.
        이 한 단계가 없으면 한 번 1군에 오른 선수가 노쇠할 때까지 자리를 지켜
        커리어 길이가 비현실적으로 늘어난다."""
        MARGIN = 0.8
        for _ in range(4):
            for want_p in (False, True):
                pool = t.pitchers if want_p else t.batters
                cand = [p for p in t.farm if (not isinstance(p, Batter)) == want_p]
                if not cand or len(pool) <= (12 if want_p else 13) - 1:
                    continue
                best = max(cand, key=lambda x: self.see(t, x).ovr)
                # 포지션 공백을 만들지 않는 선에서 최약체를 고른다
                if want_p:
                    prot = {id(x) for x in sorted(
                        [p for p in pool if p.role == "SP"],
                        key=dev.overall, reverse=True)[:5]}
                    if best.role == "SP":
                        prot = set()
                else:
                    # 그 포지션의 유일한 선수는 보호한다.
                    # 단 대체 수준(43) 아래로 떨어졌다면 보호하지 않고,
                    # 올라오는 유망주가 포지션을 전향해서 메운다.
                    prot = set()
                    for pos in FIELD_POS:
                        same = [b for b in pool if b.position == pos]
                        if (len(same) == 1 and same[0].position != best.position
                                and dev.overall(same[0]) >= 43):
                            prot.add(id(same[0]))
                drop_c = [p for p in pool if id(p) not in prot]
                if not drop_c:
                    continue
                worst = min(drop_c, key=dev.overall)
                if self.see(t, best).ovr <= self.see(t, worst).ovr + MARGIN:
                    continue
                pool.remove(worst)
                t.farm.remove(best)
                if (not want_p and best.position != worst.position
                        and not any(b.position == worst.position for b in pool)):
                    old = best.position
                    best.position = worst.position          # 포지션 전향
                    self.log(f"{best.name} {old} → {worst.position} 전향")
                pool.append(best)
                c = self._career(best)
                if not c.seasons:
                    best.debut_year = self.year + 1
                    self.rookies_this_year.append(best)
                self._release(worst, t)

    def _release(self, p, t):
        """1군에서 밀려난 선수. 어리면 2군으로, 아니면 미계약 신분이 되어
        다른 팀의 부름을 기다린다."""
        p.contract = None
        if p.age <= 24:
            t.farm.append(p)
            return
        self.unsigned.append(p)

    def _shed_salary(self, t):
        """예산을 넘겼으면 연봉 대비 가치가 낮은 선수부터 방출한다."""
        y = self.year + 1
        guard = 0
        while C.payroll(t, y) > t.finance.budget and guard < 12:
            guard += 1
            cands = [p for p in t.batters + t.pitchers
                     if p.contract and p.contract.salary_in(y) > 1.0]
            if not cands:
                break
            worst = min(cands, key=lambda p: market.trade_value(
                self, t, p, self.year, self.modes[t.team_id]))
            if market.trade_value(self, t, worst, self.year,
                                  self.modes[t.team_id]) > 3.0:
                break
            (t.batters if isinstance(worst, Batter) else t.pitchers).remove(worst)
            self._release(worst, t)

    # -- 실행 ------------------------------------------------------------
    def run(self, seasons, progress=False):
        self.rookies_this_year = []
        for i in range(seasons):
            S, champ = self.play_season()
            if progress:
                st = S.standings()[0]
                print(f"  {self.year}  우승 {champ.name:<12} "
                      f"정규1위 {st.team.name}({st.w}승 {st.l}패)")
            self.offseason()
        return self
