"""
Project Dugout - Free Agency & Trade

두 시장 모두 **팀의 스카우팅 추정치**로 돌아간다. 진실이 아니라 믿음으로 거래한다.
"""
import contract as C
import development as dev
from pa_engine import Batter

CONTENDER, NEUTRAL, REBUILD = "우승도전", "중립", "리빌딩"


def is_pitcher(p):
    return not isinstance(p, Batter)


# ---------------------------------------------------------------------------
# 구단 방향성
# ---------------------------------------------------------------------------
def team_mode(t, rec, league):
    """지난 시즌 성적과 로스터 나이로 팀의 방향을 정한다."""
    pct = rec.pct if rec else 0.5
    ages = [p.age for p in t.lineup + t.rotation]
    avg_age = sum(ages) / len(ages) if ages else 28
    score = (pct - 0.5) * 4.0 + (28.5 - avg_age) * 0.10
    if pct >= 0.545 or (pct >= 0.50 and avg_age >= 28.5):
        return CONTENDER
    if pct <= 0.455 and avg_age <= 28.5:
        return REBUILD
    return NEUTRAL


# 연도 오프셋별 가중치. 우승도전 팀은 올해를, 리빌딩 팀은 3년 뒤를 중시한다.
MODE_W = {
    CONTENDER: [1.45, 1.18, 0.92, 0.72, 0.58, 0.48],
    NEUTRAL:   [1.04, 1.02, 1.00, 0.96, 0.92, 0.88],
    REBUILD:   [0.55, 0.82, 1.12, 1.28, 1.30, 1.24],
}


def _w(mode, i):
    tab = MODE_W[mode]
    return tab[min(i, len(tab) - 1)]


# ---------------------------------------------------------------------------
# 트레이드 가치 — 그 팀의 눈으로 본 잉여 가치
# ---------------------------------------------------------------------------
def trade_value(league, t, p, year, mode, in_farm=False):
    ip = is_pitcher(p)
    if in_farm:
        r = league.see(t, p)
        pot = r.pot
        reach = max(0.04, min(0.88, (pot - 43.0) / 21.0))
        eta = max(1, min(5, 23 - p.age))          # 1군 도달까지 남은 햇수
        val = 0.0
        for i in range(6):
            val += (C.proj_war(pot, 26, ip) * C.WAR_PRICE * 0.55
                    * reach * _w(mode, eta + i))
        return val

    r = league.see(t, p)
    ovr = r.ovr
    rem = C.control_horizon(p, ovr, year, ip)
    if not rem:
        return 0.0
    v = 0.0
    for i, sal in enumerate(rem):
        w = C.proj_war(ovr, p.age, ip, seasons_ahead=i + 1)
        v += (w * C.WAR_PRICE * _w(mode, i)) - sal
    return v


# ---------------------------------------------------------------------------
# FA 시장
# ---------------------------------------------------------------------------
def fa_utility(p, offer, best_total, team, cur_team, win_pct, play_chance):
    h = p.hidden
    wm, ww, wp, wl = (h.get("w_money", 1.0), h.get("w_winning", 0.55),
                      h.get("w_playtime", 0.45), h.get("w_loyalty", 0.30))
    s = wm + ww + wp + wl
    money = offer.total / best_total if best_total > 0 else 0.0
    return ((wm * money + ww * min(1.5, win_pct / 0.5 - 0.4)
             + wp * play_chance + wl * (1.0 if team is cur_team else 0.0)) / s)


def run_free_agency(league, year, extra=None, log=None,
                    user_offers=None, user_team=None):
    """계약 만료 → FA 선언 → 입찰 → 계약. (계약 목록) 반환."""
    rng = league.rng
    signings = []

    # 1) 계약 만료 처리
    pool = []
    for t in league.teams:
        for group in ("batters", "pitchers"):
            keep = []
            for p in getattr(t, group):
                if p.contract and p.contract.end_year > year:
                    keep.append(p)
                    continue
                if C.is_free_agent(p, year):
                    p.former_team = t
                    pool.append(p)
                else:                                   # 보류권 - 자동 갱신
                    ovr = league.see(t, p).ovr
                    sal = C.renewal_salary(p, ovr, is_pitcher(p))
                    p.contract = C.Contract(year + 1, [sal], t.team_id)
                    keep.append(p)
            setattr(t, group, keep)

    for p in (extra or []):            # 지난해 미계약자도 다시 시장에 나온다
        pool.append(p)
    league.unsigned = []
    if not pool:
        return signings

    # 2) 팀별 예산 여력
    room = {}
    for t in league.teams:
        room[t.team_id] = max(0.0, t.finance.budget - C.payroll(t, year + 1))

    # 3) 가치 높은 선수부터 시장에 나온다
    def mv(p):
        best = max(league.see(t, p).ovr for t in league.teams)
        return C.market_value(best, p.age, is_pitcher(p))
    pool.sort(key=mv, reverse=True)

    for p in pool:
        ip = is_pitcher(p)
        offers = []
        if user_offers and p.pid in user_offers and user_team is not None:
            yrs, aav = user_offers[p.pid]
            offers.append((user_team, C.Contract(year + 1,
                                                 [round(aav, 2)] * yrs,
                                                 user_team.team_id)))
        for t in league.teams:
            if user_team is not None and t is user_team:
                continue        # 사용자 팀은 AI 가 대신 입찰하지 않는다
            r = league.see(t, p)
            ask_years = C.demand_years(p.age, r.ovr)
            aav = C.market_value(r.ovr, p.age, ip)
            need = _need_score(league, t, p, r.ovr)
            if need <= 0:
                continue
            aggression = (0.70 + 0.58 * need
                          + 0.32 * min(1.0, room[t.team_id] / 40.0))
            bid_aav = aav * aggression * rng.uniform(0.88, 1.16)
            # 예산 상한은 모든 팀에 똑같이 적용한다.
            # 원소속 팀에만 약간(10%)의 여유를 준다 - 재계약 프리미엄.
            cap = room[t.team_id]
            if t is getattr(p, "former_team", None):
                cap *= 1.10
            if bid_aav > cap:
                bid_aav = cap
            if bid_aav < C.MIN_SALARY:
                # 예산이 없어도 최저 계약은 언제나 가능하다 (뎁스 확보)
                if need < 0.42:
                    continue
                bid_aav = C.MIN_SALARY * 1.6
            yrs = max(1, min(ask_years, 5 if p.age <= 30 else 3))
            offers.append((t, C.Contract(year + 1,
                                         [round(bid_aav, 2)] * yrs, t.team_id)))
        if not offers:
            # 아무도 안 부르면 최저연봉 1년, 그마저 없으면 은퇴
            p.contract = None
            league.unsigned.append(p)
            continue

        best_total = max(o[1].total for o in offers)
        cur = getattr(p, "former_team", None)
        pick = max(offers, key=lambda o: fa_utility(
            p, o[1], best_total, o[0], cur,
            league.rec_pct.get(o[0].team_id, 0.5),
            _play_chance(league, o[0], p)))
        t, ct = pick
        p.contract = ct
        (t.pitchers if ip else t.batters).append(p)
        room[t.team_id] = max(0.0, room[t.team_id] - ct.aav)
        signings.append((p, t, ct, cur))
        if log and ct.total >= 25:
            tag = "잔류" if t is cur else "이적"
            log(f"[FA] {p.name}({p.age}세) {t.name} {ct.years}년 "
                f"{ct.total:.0f}억 ({tag})")
    return signings


def _need_score(league, t, p, ovr):
    """이 팀이 이 선수를 얼마나 원하는가. 0 이면 관심 없음."""
    ip = is_pitcher(p)
    pool = t.pitchers if ip else t.batters
    if not pool:
        return 1.0
    vals = sorted((league.see(t, x).ovr for x in pool), reverse=True)
    cap = 12 if ip else 13
    if len(pool) >= cap + 2:
        bar = vals[cap - 1] if len(vals) >= cap else vals[-1]
    else:
        bar = vals[min(len(vals) - 1, cap - 3)]
    gain = ovr - bar
    if gain <= -3.0:
        return 0.0
    if not ip and isinstance(p, Batter):
        if not any(b.position == p.position for b in pool):
            gain += 4.0
    return max(0.0, min(1.0, 0.18 + gain / 12.0))


def _play_chance(league, t, p):
    ip = is_pitcher(p)
    pool = t.pitchers if ip else t.batters
    if not pool:
        return 1.0
    ovr = league.see(t, p).ovr
    better = sum(1 for x in pool if league.see(t, x).ovr > ovr)
    cap = 9 if not ip else 8
    return max(0.0, min(1.0, 1.0 - better / cap))


# ---------------------------------------------------------------------------
# 트레이드
# ---------------------------------------------------------------------------
def run_trades(league, year, modes, log=None, max_trades=6):
    rng = league.rng
    val = {}          # (team_id, pid) -> 가치

    def V(t, p, farm):
        k = (t.team_id, p.pid)
        if k not in val:
            val[k] = trade_value(league, t, p, year, modes[t.team_id], farm)
        return val[k]

    def assets(t):
        return ([(p, False) for p in t.batters + t.pitchers]
                + [(p, True) for p in t.farm if p.age >= 19])

    done = 0
    per_team = {t.team_id: 0 for t in league.teams}
    PER_TEAM_CAP = 2          # 한 오프시즌에 한 팀이 할 수 있는 거래 수
    pairs = [(a, b) for i, a in enumerate(league.teams) for b in league.teams[i + 1:]]
    rng.shuffle(pairs)
    for A, B in pairs:
        if done >= max_trades:
            break
        if per_team[A.team_id] >= PER_TEAM_CAP or per_team[B.team_id] >= PER_TEAM_CAP:
            continue
        best = None
        for pa, fa_ in assets(A):
            if _locked(A, pa, fa_):
                continue
            va_a, va_b = V(A, pa, fa_), V(B, pa, fa_)
            for pb, fb in assets(B):
                if _locked(B, pb, fb) or (fa_ != fb and abs(va_a) < 1):
                    continue
                vb_b, vb_a = V(B, pb, fb), V(A, pb, fb)
                gain_a = vb_a - va_a          # A가 보기에 이득
                gain_b = va_b - vb_b          # B가 보기에 이득
                if gain_a > 6.0 and gain_b > 6.0:
                    sc = min(gain_a, gain_b)
                    if best is None or sc > best[0]:
                        best = (sc, pa, fa_, pb, fb)
        if best:
            _, pa, fa_, pb, fb = best
            _move(A, pa, fa_, B)
            _move(B, pb, fb, A)
            done += 1
            per_team[A.team_id] += 1
            per_team[B.team_id] += 1
            if log:
                ta = "유망주" if fa_ else f"{pa.age}세"
                tb = "유망주" if fb else f"{pb.age}세"
                log(f"[트레이드] {A.name} {pa.name}({ta}) ↔ {B.name} {pb.name}({tb})")
    return done


def _locked(t, p, farm):
    """포지션이 하나뿐인 선수와 5선발 안쪽은 트레이드하지 않는다."""
    if farm:
        return False
    if isinstance(p, Batter):
        return sum(1 for b in t.batters if b.position == p.position) <= 1
    return len([x for x in t.pitchers if x.role == "SP"]) <= 5 and p.role == "SP"


def _move(src, p, farm, dst):
    if farm:
        src.farm.remove(p)
        dst.farm.append(p)
    elif isinstance(p, Batter):
        src.batters.remove(p)
        dst.batters.append(p)
    else:
        src.pitchers.remove(p)
        dst.pitchers.append(p)
