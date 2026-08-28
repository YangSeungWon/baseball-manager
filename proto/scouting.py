"""
Project Dugout - Scouting Engine

이 모듈의 목적은 **플레이어와 AI에게 틀린 정보를 주는 것**이다.

원칙
  1. 팀은 진실이 아니라 자기 스카우트의 추정치로 판단한다.
  2. 오차는 (팀, 선수) 쌍마다 **고정**된다. 같은 선수를 다시 봐도 추정이
     흔들리지 않는다. 관찰을 늘리면 오차의 '크기'만 줄고 방향은 유지된다.
     → 한 팀이 특정 선수를 계속 과대평가하는 일이 자연스럽게 생긴다.
  3. 잠재력 오차가 현재 능력 오차보다 훨씬 크다. 이게 드래프트의 재미다.
  4. **오차의 일부는 리그 전체가 공유한다.** 팀마다 독립적으로만 틀리면
     드래프트 순위가 개별 스카우트보다 훨씬 정확해져 버린다 (오차가 평균되므로).
     실제 드래프트에서는 모든 구단이 같은 정보를 보고 같은 방향으로 틀린다.
     그래서 전체 1순위가 통째로 망하는 일이 벌어진다.
"""
import math
import development as dev
from pa_engine import Batter

# 기본 오차 (20-80 스케일, 1 표준편차)
SIGMA_CUR_AMATEUR = 6.5
SIGMA_POT_AMATEUR = 16.0
SIGMA_CUR_PRO = 2.2          # 1군 기록이 쌓인 선수는 현재 능력을 거의 안 틀린다
SIGMA_POT_PRO = 7.0

# 오차 중 리그 전체가 공유하는 비율 (분산 기준)
CONSENSUS_SHARE = 0.72


class ScoutingDept:
    """팀의 스카우트 조직. 개별 스카우트 대신 부서 단위로 추상화했다."""

    def __init__(self, rng):
        self.eval_current = max(20.0, min(80.0, rng.gauss(50, 11)))
        self.eval_potential = max(20.0, min(80.0, rng.gauss(50, 12)))
        self.hitting = max(20.0, min(80.0, rng.gauss(50, 10)))
        self.pitching = max(20.0, min(80.0, rng.gauss(50, 10)))
        # 구단 성향 편향: 이 팀이 과대평가하는 툴 (스카우트의 취향)
        self.bias = {
            "speed": rng.gauss(0, 2.6), "hr_power": rng.gauss(0, 2.6),
            "stuff": rng.gauss(0, 2.6), "contact": rng.gauss(0, 1.8),
            "command": rng.gauss(0, 1.8), "discipline": rng.gauss(0, 2.2),
        }
        self.memory = {}     # pid -> {attr: 표준정규 오차 시드}
        self.looks = {}      # pid -> 관찰 횟수

    def _seed(self, p, rng):
        if not hasattr(p, "scout_consensus"):      # 리그 공통 오차 (선수당 한 번)
            p.scout_consensus = {a: rng.gauss(0, 1) for a in dev.attrs_of(p)}
            p.scout_consensus_pot = {a: rng.gauss(0, 1) for a in dev.attrs_of(p)}
        if p.pid not in self.memory:
            self.memory[p.pid] = {a: rng.gauss(0, 1) for a in dev.attrs_of(p)}
            self.memory[p.pid]["_pot"] = {a: rng.gauss(0, 1) for a in dev.attrs_of(p)}
        return self.memory[p.pid]

    def _quality(self, p, which):
        """스카우트 능력 → 오차 배율. 좋은 스카우트일수록 작다."""
        base = self.eval_current if which == "cur" else self.eval_potential
        know = self.hitting if isinstance(p, Batter) else self.pitching
        z = ((base - 50) / 10) * 0.75 + ((know - 50) / 10) * 0.25
        return max(0.45, 1.30 - 0.32 * z)

    def observe(self, p, rng, n=1):
        self._seed(p, rng)
        self.looks[p.pid] = self.looks.get(p.pid, 0) + n

    def report(self, p, rng, is_pro=False):
        """스카우팅 리포트. (능력별 추정 구간, 추정 OVR 구간, 추정 잠재력 구간)"""
        seed = self._seed(p, rng)
        looks = self.looks.get(p.pid, 0)
        shrink = 1.0 / math.sqrt(1.0 + 0.40 * looks)
        sc = (SIGMA_CUR_PRO if is_pro else SIGMA_CUR_AMATEUR) * shrink * self._quality(p, "cur")
        sp = ((SIGMA_POT_PRO if is_pro else SIGMA_POT_AMATEUR) * shrink
              * self._quality(p, "pot") * getattr(p, "scout_difficulty", 1.0))

        kc = CONSENSUS_SHARE ** 0.5            # 공유 오차 가중
        ki = (1.0 - CONSENSUS_SHARE) ** 0.5    # 팀 고유 오차 가중
        est_cur, est_pot = {}, {}
        for a in dev.attrs_of(p):
            b = self.bias.get(a, 0.0)
            ec = kc * p.scout_consensus[a] + ki * seed[a]
            ep = kc * p.scout_consensus_pot[a] + ki * seed["_pot"][a]
            est_cur[a] = _clamp(getattr(p, a) + ec * sc + b)
            # 잠재력 추정은 현재 능력 추정 아래로 내려가지 않는다
            v = p.pot[a] + ep * sp + b * 1.3
            est_pot[a] = _clamp(max(v, est_cur[a]))

        return Report(p, est_cur, est_pot, sc, sp, looks)


def _clamp(v):
    return max(20.0, min(80.0, v))


class Report:
    def __init__(self, p, est_cur, est_pot, sc, sp, looks):
        self.p, self.est_cur, self.est_pot = p, est_cur, est_pot
        self.sigma_cur, self.sigma_pot, self.looks = sc, sp, looks

    def _ovr(self, table):
        saved = {a: getattr(self.p, a) for a in table}
        for a, v in table.items():
            setattr(self.p, a, v)
        o = dev.overall(self.p)
        for a, v in saved.items():
            setattr(self.p, a, v)
        return o

    @property
    def ovr(self):
        return self._ovr(self.est_cur)

    @property
    def pot(self):
        return self._ovr(self.est_pot)

    @property
    def confidence(self):
        """0~100. 관찰량과 스카우트 능력이 만드는 확신도."""
        return max(5.0, min(99.0, 100.0 * (1.0 - self.sigma_pot / 18.0)))

    def range_of(self, attr, which="cur"):
        """플레이어에게 보여줄 구간. '컨택 53~63' 형태."""
        v = (self.est_cur if which == "cur" else self.est_pot)[attr]
        s = (self.sigma_cur if which == "cur" else self.sigma_pot) * 0.9
        return _clamp(v - s), _clamp(v + s)

    def ovr_range(self, which="cur"):
        v = self.ovr if which == "cur" else self.pot
        s = (self.sigma_cur if which == "cur" else self.sigma_pot) * 0.50
        return _clamp(v - s), _clamp(v + s)

    def text(self):
        """스카우팅 코멘트. 숨은 성향은 숫자가 아니라 문장으로만 노출한다."""
        h = self.p.hidden
        out = []
        we = h["work_ethic"]
        out.append("훈련 태도가 대단히 성실하다." if we >= 65 else
                   "성실한 선수로 평가된다." if we >= 52 else
                   "훈련 태도에 관한 우려가 있다." if we < 38 else
                   "훈련 태도는 평범하다.")
        pr = h["professionalism"]
        if pr >= 65: out.append("자기 관리가 뛰어나다.")
        elif pr < 35: out.append("프로 의식에 물음표가 붙는다.")
        ip = h["injury_prone"]
        if ip >= 63: out.append("부상 이력과 체질이 걱정스럽다.")
        elif ip <= 37: out.append("몸이 튼튼하다.")
        if self.looks <= 1:
            out.append("관찰 기회가 적어 평가의 불확실성이 크다.")
        elif self.looks >= 3:
            out.append("장기간 추적 관찰한 선수다.")
        return " ".join(out)
