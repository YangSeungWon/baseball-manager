"""
Project Dugout - Game Engine (prototype)

pa_engine 의 타석 결과를 받아 이닝 / 경기로 조립한다.
UI 없이 완전히 독립적으로 돌아가야 한다는 원칙을 유지한다.
"""
import random
from pa_engine import (Batter, Pitcher, Defense, Park, Context, simulate_pa, z,
                       K, BB, HBP, OUT, S1B, D2B, T3B, HR)

# ---------------------------------------------------------------------------
# 진루 모델 파라미터 - 여기가 '주력이 의미를 갖는' 지점이다
# ---------------------------------------------------------------------------
ADV = {
    "1b_first_to_third": 0.300,   # 단타 때 1루주자가 3루까지
    "1b_second_scores":  0.665,   # 단타 때 2루주자 득점
    "2b_first_scores":   0.505,   # 2루타 때 1루주자 득점
    "speed_coeff":       0.090,   # 위 확률들에 주력 z 당 가산
    "of_arm_coeff":     -0.055,   # 외야 송구 z 당 감산
    "gidp_base":         0.400,   # 1루주자 있고 2아웃 미만 땅볼 시 병살
    "gidp_speed":       -0.055,
    "gidp_infield":      0.030,
    "sacfly_base":       0.550,   # 2아웃 미만 뜬공아웃 + 3루주자
    "gb_r3_scores":      0.320,   # 야수선택/일반 땅볼아웃 때 3루주자 득점
    "gb_r2_to_third":    0.450,
    "fb_r2_to_third":    0.130,
    # 도루
    "sb_attempt_base":   0.165,   # 1루주자 & 2루 비었을 때 시도 확률
    "sb_attempt_speed":  0.075,
    "sb_success_base":   0.720,
    "sb_success_speed":  0.055,
}


class Bases:
    """[1루, 2루, 3루]. 각 주자마다 '책임투수(PitLine)'를 함께 들고 다닌다.
    승계주자 실점을 주자를 내보낸 투수에게 귀속시키기 위해 반드시 필요하다."""
    __slots__ = ("r", "resp")

    def __init__(self):
        self.r = [None, None, None]
        self.resp = [None, None, None]

    def put(self, i, runner, resp):
        self.r[i] = runner
        self.resp[i] = resp

    def take(self, i):
        x = (self.r[i], self.resp[i])
        self.r[i] = None
        self.resp[i] = None
        return x

    def move(self, src, dst):
        self.r[dst], self.resp[dst] = self.r[src], self.resp[src]
        self.r[src] = self.resp[src] = None

    def occupied(self):
        return sum(1 for x in self.r if x)

    def __str__(self):
        n = ["1루", "2루", "3루"]
        on = [n[i] for i in range(3) if self.r[i]]
        return " ".join(on) if on else "주자없음"


class PitLine:
    def __init__(self, p):
        self.p = p; self.outs = 0; self.bf = 0; self.h = 0; self.hr = 0
        self.bb = 0; self.k = 0; self.r = 0; self.hbp = 0; self.fatigue = 0.0
        self.entered_inning = 0; self.entered_lead = 0
        self.w = self.l = self.sv = self.hld = False

    @property
    def ip(self):
        return f"{self.outs // 3}.{self.outs % 3}"


class BatLine:
    def __init__(self, b):
        self.b = b; self.pa = 0; self.ab = 0; self.h = 0; self.b2 = 0
        self.b3 = 0; self.hr = 0; self.bb = 0; self.k = 0; self.rbi = 0
        self.run = 0; self.sb = 0; self.cs = 0; self.hbp = 0


class Team:
    """1군 로스터 최소 형태. 이름은 표시용일 뿐 로직에 쓰이지 않는다."""

    def __init__(self, team_id, lineup, bench, rotation, bullpen,
                 defense=None, park=None, name=None):
        self.team_id = team_id
        self.name = name or f"Team {team_id:02d}"
        self.lineup = lineup          # 9명
        self.bench = bench
        self.rotation = rotation      # 5명
        self.bullpen = bullpen        # 6~7명, [0]이 마무리
        self.defense = defense or Defense()
        self.park = park or Park()
        self.rot_index = 0

    def next_starter(self):
        p = self.rotation[self.rot_index % len(self.rotation)]
        self.rot_index += 1
        return p


# ---------------------------------------------------------------------------
# 투수 운용
# ---------------------------------------------------------------------------
def starter_capacity(p):      # 피로가 시작되는 상대 타자 수
    return 9.0 + 0.15 * p.stamina


def reliever_capacity(p):
    return 3.0 + 0.045 * p.stamina


def fatigue_of(line, is_starter):
    cap = starter_capacity(line.p) if is_starter else reliever_capacity(line.p)
    span = 10.0 if is_starter else 4.0
    return max(0.0, min(1.5, (line.bf - cap) / span))


class TeamGameState:
    def __init__(self, team, rng):
        self.team = team
        self.order = list(team.lineup)
        self.spot = 0
        self.bat = {id(b): BatLine(b) for b in team.lineup}
        self.starter = team.next_starter()
        self.pitchers = [PitLine(self.starter)]
        unavail = getattr(team, "unavailable", set())
        avail = [p for p in team.bullpen if p.pid not in unavail]
        if len(avail) < 3:                       # 불펜이 고갈되면 강제로 채운다
            rest = [p for p in team.bullpen if p.pid in unavail]
            avail += rest[:3 - len(avail)]
        self.bullpen_left = avail
        self.runs = 0
        self.hits = 0
        self.lob = 0
        self.line = []          # 이닝별 득점
        self.por = None         # pitcher of record
        self.lp = None          # 역전을 허용한 투수

    @property
    def cur(self):
        return self.pitchers[-1]

    def batter_up(self):
        b = self.order[self.spot]
        self.spot = (self.spot + 1) % 9
        return b

    def line_for(self, b):
        if id(b) not in self.bat:
            self.bat[id(b)] = BatLine(b)
        return self.bat[id(b)]


def maybe_change_pitcher(defn, inning, lead, rng, log):
    """규칙 기반 감독 AI. v0.1은 이 정도면 충분하다."""
    cur = defn.cur
    is_starter = (len(defn.pitchers) == 1)
    f = fatigue_of(cur, is_starter)
    cur.fatigue = f
    if not defn.bullpen_left:
        return

    pull = False
    if is_starter:
        if f >= 1.0:
            pull = True
        elif f >= 0.55 and inning >= 5:
            pull = True
        elif cur.r >= 6:
            pull = True
    else:
        if f >= 0.85:
            pull = True
        elif inning > cur.entered_inning and cur.bf >= 4 and len(defn.bullpen_left) >= 3:
            pull = True

    # 9회 세이브 상황이면 마무리 투입
    if (inning >= 9 and 0 < lead <= 3 and defn.bullpen_left
            and cur.p is not defn.bullpen_left[0] and (is_starter or f > 0.2)):
        pull = True

    if not pull:
        return

    if inning >= 9 and 0 < lead <= 3:
        nxt = defn.bullpen_left.pop(0)              # 마무리
    else:
        nxt = defn.bullpen_left.pop(len(defn.bullpen_left) // 2
                                    if len(defn.bullpen_left) > 1 else 0)
    nl = PitLine(nxt)
    nl.entered_inning = inning
    nl.entered_lead = lead
    defn.pitchers.append(nl)
    log(f"  투수 교체 — {defn.team.name}: {nxt.name} 등판")


# ---------------------------------------------------------------------------
# 진루 처리
# ---------------------------------------------------------------------------
def force_advance(bases, batter, resp):
    """볼넷 / 사구 - 밀어내기만 처리. 밀려나 득점한 (주자, 책임투수)를 반환."""
    scored = None
    if bases.r[0]:
        if bases.r[1]:
            if bases.r[2]:
                scored = (bases.r[2], bases.resp[2])
            bases.move(1, 2)
        bases.move(0, 1)
    bases.put(0, batter, resp)
    return scored


def resolve(res, bbt, batter, bases, outs, off, defn, rng, log):
    """한 타석 결과를 베이스 상태에 반영. (추가아웃, 득점수, 설명) 반환."""
    bl = off.line_for(batter)
    zs = z(batter.speed)
    zarm = z(defn.team.defense.outfield)
    me = defn.cur                       # 지금 던지는 투수 = 이 타자의 책임투수
    scored = []                          # [(주자, 책임투수)]
    added_outs = 0
    desc = ""

    if res == K:
        added_outs = 1; desc = "삼진"

    elif res in (BB, HBP):
        s = force_advance(bases, batter, me)
        if s: scored.append(s)
        desc = "볼넷" if res == BB else "몸에 맞는 공"

    elif res == OUT:
        added_outs = 1
        if bbt == "GB" and bases.r[0] and outs < 2:
            p_dp = (ADV["gidp_base"] + ADV["gidp_speed"] * zs
                    + ADV["gidp_infield"] * z(defn.team.defense.infield))
            if rng.random() < p_dp:
                added_outs = 2
                bases.take(0)
                if outs == 0 and bases.r[2]:
                    scored.append(bases.take(2))
                if bases.r[1] and bases.r[2] is None:
                    bases.move(1, 2)
                desc = "병살타"
            else:
                bases.take(0)                       # 1루주자 포스아웃
                if bases.r[2] and rng.random() < ADV["gb_r3_scores"] + 0.25:
                    scored.append(bases.take(2))
                if bases.r[1] and bases.r[2] is None and rng.random() < 0.35:
                    bases.move(1, 2)
                bases.put(0, batter, me)
                desc = "야수선택"
        elif bbt == "GB":
            if outs < 2:
                if bases.r[2] and rng.random() < ADV["gb_r3_scores"]:
                    scored.append(bases.take(2))
                if bases.r[1] and bases.r[2] is None and rng.random() < ADV["gb_r2_to_third"]:
                    bases.move(1, 2)
            desc = "땅볼 아웃"
        else:
            if bbt == "FB" and outs < 2:
                if bases.r[2] and rng.random() < ADV["sacfly_base"] + ADV["of_arm_coeff"] * zarm:
                    scored.append(bases.take(2))
                    desc = "희생플라이"
                elif bases.r[1] and bases.r[2] is None and rng.random() < ADV["fb_r2_to_third"]:
                    bases.move(1, 2)
            if not desc:
                desc = {"FB": "뜬공 아웃", "LD": "직선타 아웃", "PU": "내야 뜬공"}[bbt]

    else:
        me.h += 1
        off.hits += 1
        if res == HR:
            me.hr += 1
            for i in (2, 1, 0):
                if bases.r[i]:
                    scored.append(bases.take(i))
            scored.append((batter, me))
            desc = "홈런"
        elif res == T3B:
            for i in (2, 1, 0):
                if bases.r[i]:
                    scored.append(bases.take(i))
            bases.put(2, batter, me)
            desc = "3루타"
        elif res == D2B:
            if bases.r[2]: scored.append(bases.take(2))
            if bases.r[1]: scored.append(bases.take(1))
            if bases.r[0]:
                r1, rp1 = bases.take(0)
                p = (ADV["2b_first_scores"] + ADV["speed_coeff"] * z(r1.speed)
                     + ADV["of_arm_coeff"] * zarm)
                if rng.random() < p: scored.append((r1, rp1))
                else: bases.put(2, r1, rp1)
            bases.put(1, batter, me)
            desc = "2루타"
        else:
            if bases.r[2]: scored.append(bases.take(2))
            r2, rp2 = bases.take(1)
            r1, rp1 = bases.take(0)
            if r2:
                p = (ADV["1b_second_scores"] + ADV["speed_coeff"] * z(r2.speed)
                     + ADV["of_arm_coeff"] * zarm)
                if rng.random() < p: scored.append((r2, rp2))
                else: bases.put(2, r2, rp2)
            if r1:
                p = (ADV["1b_first_to_third"] + ADV["speed_coeff"] * z(r1.speed)
                     + ADV["of_arm_coeff"] * zarm)
                if bases.r[2] is None and rng.random() < p: bases.put(2, r1, rp1)
                else: bases.put(1, r1, rp1)
            bases.put(0, batter, me)
            desc = "안타"

    # 득점 반영 - 실점은 '책임투수'에게 기록한다
    for runner, resp in scored:
        off.runs += 1
        off.line_for(runner).run += 1
        (resp or me).r += 1

    bl.rbi += len(scored)
    return added_outs, len(scored), desc


def try_steal(bases, outs, off, defn, rng, log):
    """1루주자 + 2루 비었을 때만. v0.1 최소 구현."""
    r1 = bases.r[0]
    if not r1 or bases.r[1] or outs >= 2:
        return 0
    zs = z(r1.speed)
    if rng.random() >= ADV["sb_attempt_base"] + ADV["sb_attempt_speed"] * zs:
        return 0
    if rng.random() < ADV["sb_success_base"] + ADV["sb_success_speed"] * zs:
        bases.move(0, 1)
        off.line_for(r1).sb += 1
        log(f"  {r1.name} 2루 도루 성공")
        return 0
    bases.take(0)
    off.line_for(r1).cs += 1
    log(f"  {r1.name} 2루 도루 실패")
    return 1


# ---------------------------------------------------------------------------
# 이닝 / 경기
# ---------------------------------------------------------------------------
def play_half(off, defn, inning, park, rng, log, walkoff_target=None):
    bases = Bases()
    outs = 0
    start_runs = off.runs
    while outs < 3:
        lead = defn.runs - off.runs
        maybe_change_pitcher(defn, inning, lead, rng, log)
        outs += try_steal(bases, outs, off, defn, rng, log)
        if outs >= 3:
            break

        prev_diff = off.runs - defn.runs
        batter = off.batter_up()
        pl = defn.cur
        is_starter = (len(defn.pitchers) == 1)
        ctx = Context(fatigue=fatigue_of(pl, is_starter),
                      times_through=1 + pl.bf // 9)
        res, bbt = simulate_pa(batter, pl.p, defn.team.defense, park, ctx, rng)

        bl = off.line_for(batter)
        bl.pa += 1
        pl.bf += 1
        if res == BB: bl.bb += 1; pl.bb += 1
        elif res == HBP: bl.hbp += 1; pl.hbp += 1
        elif res == K: bl.ab += 1; bl.k += 1; pl.k += 1
        else:
            bl.ab += 1
            if res != OUT:
                bl.h += 1
                if res == D2B: bl.b2 += 1
                elif res == T3B: bl.b3 += 1
                elif res == HR: bl.hr += 1

        ao, runs, desc = resolve(res, bbt, batter, bases, outs, off, defn, rng, log)
        outs += ao
        pl.outs += ao
        if log.enabled:
            base_txt = str(bases)
            log(f"  {batter.name:<4} {desc}"
                + (f" ({runs}점)" if runs else "")
                + f"  [{outs}아웃 {base_txt}]  {off.team.name} {off.runs} : {defn.runs} {defn.team.name}")
        if off.runs > defn.runs and prev_diff <= 0:
            off.por = off.cur          # 리드를 잡은 시점의 자기 팀 투수
            defn.lp = defn.cur         # 역전을 허용한 투수
        if walkoff_target and off.runs > defn.runs:
            off.lob += bases.occupied()
            off.line.append(off.runs - start_runs)
            return True     # 끝내기
    off.lob += bases.occupied()
    off.line.append(off.runs - start_runs)
    return False


def play_game(home: Team, away: Team, rng=None, verbose=False, max_innings=15):
    rng = rng or random.Random()

    class Log:
        enabled = verbose
        def __call__(self, s):
            if self.enabled: print(s)
    log = Log()

    H = TeamGameState(home, rng)
    A = TeamGameState(away, rng)
    log(f"=== {away.name} @ {home.name} ===")
    log(f"선발: {away.name} {A.starter.name} / {home.name} {H.starter.name}")

    inning = 1
    while True:
        log(f"\n[{inning}회초] {away.name} 공격")
        play_half(A, H, inning, home.park, rng, log)
        if inning >= 9 and H.runs > A.runs:
            break                                    # 9회말 생략
        log(f"\n[{inning}회말] {home.name} 공격")
        walk = play_half(H, A, inning, home.park, rng, log,
                         walkoff_target=True if inning >= 9 else None)
        if walk:
            break
        if inning >= 9 and H.runs != A.runs:
            break
        if inning >= max_innings:
            break
        inning += 1

    assign_decisions(H, A)
    return H, A


def assign_decisions(H, A):
    if H.runs == A.runs:
        return
    win, lose = (H, A) if H.runs > A.runs else (A, H)

    # 승리투수 = 마지막으로 리드를 잡은 시점의 투수.
    # 단 선발이 5이닝을 못 채웠으면 가장 많이 던진 구원투수에게 넘긴다 (공식기록원 재량 근사).
    wp = win.por or win.pitchers[0]
    if wp is win.pitchers[0] and wp.outs < 15 and len(win.pitchers) > 1:
        wp = max(win.pitchers[1:], key=lambda p: p.outs)
    wp.w = True

    (lose.lp or lose.pitchers[0]).l = True

    # 세이브 / 홀드
    last = win.pitchers[-1]
    if len(win.pitchers) > 1 and last is not wp and win.runs - lose.runs <= 3:
        last.sv = True
    for pl in win.pitchers[1:]:
        if pl is not wp and pl is not last and pl.entered_lead < 0 and pl.r == 0:
            pl.hld = True
