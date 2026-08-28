"""
Project Dugout - Contract & Finance

단위는 '억'(원). KBO 감각에 맞췄다.
  최저연봉 0.3억 / 팀 연봉총액 80~160억 / 최상급 FA 연 20억대
"""
import development as dev
from pa_engine import Batter

MIN_SALARY = 0.30
WAR_PRICE = 4.2          # FA 시장에서 1 WAR 의 가격 (억)
FA_SERVICE = 7           # FA 자격 취득에 필요한 1군 등록 시즌
ARB_SERVICE = 3          # 연봉조정 자격


class Contract:
    def __init__(self, start_year, salaries, signed_by=None):
        self.start_year = start_year
        self.salaries = list(salaries)       # 연차별 연봉
        self.signed_by = signed_by

    @property
    def end_year(self):
        return self.start_year + len(self.salaries) - 1

    @property
    def years(self):
        return len(self.salaries)

    @property
    def total(self):
        return sum(self.salaries)

    @property
    def aav(self):
        return self.total / self.years

    def salary_in(self, year):
        i = year - self.start_year
        return self.salaries[i] if 0 <= i < len(self.salaries) else 0.0

    def remaining(self, year):
        i = max(0, year - self.start_year)
        return self.salaries[i:]

    def __str__(self):
        return f"{self.years}년 {self.total:.1f}억"


# ---------------------------------------------------------------------------
# 가치 평가
# ---------------------------------------------------------------------------
def proj_war(ovr, age, is_pitcher, seasons_ahead=0):
    """능력치 → 예상 시즌 WAR. 앞으로의 노화까지 반영한다."""
    a = age + seasons_ahead
    o = ovr
    if a < 27:
        o += min(2.5, 0.9 * (27 - age)) * (1 if seasons_ahead else 0)
    if a > 29:
        o -= 0.85 * (a - 29)
    k = 0.19 if is_pitcher else 0.22
    return max(-0.8, (o - 42.0) * k)


def market_value(ovr, age, is_pitcher):
    """FA 시장에서의 연평균 몸값."""
    w = proj_war(ovr, age, is_pitcher)
    return max(MIN_SALARY, w * WAR_PRICE)


def demand_years(age, ovr):
    """선수가 원하는 계약 기간."""
    if ovr < 46:
        return 1
    if age <= 27:
        return 5 if ovr >= 55 else 3
    if age <= 30:
        return 4 if ovr >= 58 else 3
    if age <= 33:
        return 3 if ovr >= 58 else 2
    return 2 if ovr >= 60 else 1


def control_horizon(p, ovr, year, is_pitcher, max_years=6):
    """팀이 이 선수를 보유하는 기간의 연도별 예상 연봉.

    계약 잔여 연수로만 계산하면 안 된다. 계약이 끝나도 FA 자격 전이면
    보류권이 남아 값싸게 계속 쓸 수 있다. 이 보유 기간이 곧 자산의 크기다.
    (이걸 빼먹으면 '1년 계약 24세'가 리빌딩 팀에게 무가치해진다.)
    """
    c = p.contract
    rem = list(c.remaining(year + 1)) if c else []
    sv = getattr(p, "service", 0) + len(rem)
    for i in range(max(0, min(max_years - len(rem), FA_SERVICE - sv))):
        age = p.age + len(rem) + 1
        frac = 0.32 + 0.16 * i
        rem.append(max(MIN_SALARY, market_value(ovr, age, is_pitcher) * min(0.9, frac)))
    return rem[:max_years]


def surplus_value(p, ovr, year, is_pitcher):
    """잉여 가치 = 앞으로의 생산 - 앞으로의 연봉. 트레이드 가치의 뼈대."""
    c = p.contract
    rem = c.remaining(year + 1) if c else []
    # 계약이 끝나면 그 뒤는 우리 것이 아니다. 단 FA 자격 전이면 보유권이 남는다
    if not rem:
        yrs_left = max(0, FA_SERVICE - getattr(p, "service", 0))
        rem = [market_value(ovr, p.age, is_pitcher) * 0.45] * min(3, yrs_left)
    s = 0.0
    for i, sal in enumerate(rem):
        w = proj_war(ovr, p.age, is_pitcher, seasons_ahead=i + 1)
        s += w * WAR_PRICE - sal
    return s


# ---------------------------------------------------------------------------
# 구단 재정
# ---------------------------------------------------------------------------
class Finance:
    def __init__(self, rng):
        self.market_size = max(0.55, min(1.5, rng.gauss(1.0, 0.24)))
        self.owner_spending = max(0.6, min(1.4, rng.gauss(1.0, 0.16)))
        self.revenue = 100.0 * self.market_size
        self.budget = 100.0 * self.market_size

    def update(self, win_pct, made_playoffs, won_title):
        base = 62.0 + 58.0 * self.market_size
        base *= 0.80 + 0.62 * (win_pct / 0.5) * 0.5      # 성적이 수입을 좌우
        if made_playoffs:
            base += 9.0 * self.market_size
        if won_title:
            base += 7.0 * self.market_size
        self.revenue = base
        self.budget = base * 0.86 * self.owner_spending


def payroll(t, year):
    return sum(p.contract.salary_in(year) for p in t.batters + t.pitchers
               if p.contract)


# ---------------------------------------------------------------------------
# 계약 갱신 (FA 자격 전)
# ---------------------------------------------------------------------------
def renewal_salary(p, ovr, is_pitcher):
    """FA 자격 전 선수의 연봉. 서비스 타임에 따라 시장가의 일부만 받는다."""
    sv = getattr(p, "service", 0)
    mv = market_value(ovr, p.age, is_pitcher)
    if sv < ARB_SERVICE:
        frac = 0.04 + 0.045 * sv
    else:
        frac = 0.32 + 0.16 * (sv - ARB_SERVICE)
    return max(MIN_SALARY, round(mv * min(0.92, frac), 2))


def is_free_agent(p, year):
    """계약이 끝났고 FA 자격을 채웠으면 FA."""
    if getattr(p, "service", 0) < FA_SERVICE:
        return False
    return (p.contract is None) or (p.contract.end_year <= year)
