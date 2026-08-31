// 계약 / 연봉 / 서비스타임 / 보유권 / 구단 재정. 단위는 억(원).
export const MIN_SALARY = 0.30, WAR_PRICE = 4.2, FA_SERVICE = 7, ARB_SERVICE = 3;

export class Contract {
  constructor(startYear, salaries) { this.start_year = startYear; this.salaries = [...salaries]; }
  get end_year() { return this.start_year + this.salaries.length - 1; }
  get years() { return this.salaries.length; }
  get total() { return this.salaries.reduce((a,b)=>a+b, 0); }
  get aav() { return this.total / this.years; }
  salaryIn(y) { const i = y - this.start_year; return (i>=0 && i<this.salaries.length) ? this.salaries[i] : 0; }
  remaining(y) { return this.salaries.slice(Math.max(0, y - this.start_year)); }
  toString() { return `${this.years}년 ${this.total.toFixed(1)}억`; }
}

export function projWar(ovr, age, isPitcher, ahead = 0) {
  const a = age + ahead;
  let o = ovr;
  if (a < 27 && ahead) o += Math.min(2.5, 0.9*(27-age));
  if (a > 29) o -= 0.85*(a-29);
  return Math.max(-0.8, (o - 42) * (isPitcher ? 0.19 : 0.22));
}
export function marketValue(ovr, age, isPitcher) {
  return Math.max(MIN_SALARY, projWar(ovr, age, isPitcher) * WAR_PRICE);
}
export function demandYears(age, ovr) {
  if (ovr < 46) return 1;
  if (age <= 27) return ovr >= 55 ? 5 : 3;
  if (age <= 30) return ovr >= 58 ? 4 : 3;
  if (age <= 33) return ovr >= 58 ? 3 : 2;
  return ovr >= 60 ? 2 : 1;
}
/** 보유권까지 포함한 팀 통제 기간의 연도별 연봉. */
export function controlHorizon(p, ovr, year, isPitcher, maxYears = 6) {
  const rem = p.contract ? [...p.contract.remaining(year+1)] : [];
  const sv = (p.service ?? 0) + rem.length;
  const extra = Math.max(0, Math.min(maxYears - rem.length, FA_SERVICE - sv));
  for (let i = 0; i < extra; i++) {
    const age = p.age + rem.length + 1;
    rem.push(Math.max(MIN_SALARY, marketValue(ovr, age, isPitcher) * Math.min(0.9, 0.32 + 0.16*i)));
  }
  return rem.slice(0, maxYears);
}
export function renewalSalary(p, ovr, isPitcher) {
  const sv = p.service ?? 0;
  const mv = marketValue(ovr, p.age, isPitcher);
  const frac = sv < ARB_SERVICE ? 0.04 + 0.045*sv : 0.32 + 0.16*(sv - ARB_SERVICE);
  return Math.max(MIN_SALARY, Math.round(mv * Math.min(0.92, frac) * 100) / 100);
}
export function isFreeAgent(p, year) {
  if ((p.service ?? 0) < FA_SERVICE) return false;
  return !p.contract || p.contract.end_year <= year;
}

// 관중 · 수입 단가 (억 원)
export const TICKET = 0.00006;   // 1인당 입장 수입 ≈ 6,000원
export const CONCESSION = 0.00003; // 1인당 식음료·굿즈 ≈ 3,000원

/** 한 경기 관중 동원율. 성적과 시장 규모가 팬을 부른다. */
export function attendRate(f, winPct, playoffLast, titleLast, rng) {
  let r = 0.55
    + 0.22 * (f.market_size - 1)
    + 0.22 * (winPct - 0.5)
    + (playoffLast ? 0.10 : 0)
    + (titleLast ? 0.08 : 0)
    + (rng ? rng.gauss(0, 0.07) : 0);
  return Math.max(0.15, Math.min(1.0, r));
}

export class Finance {
  /** @param fr 연고 구단의 성격. 없으면 리그 평균으로 뽑는다.
   *  시장 규모를 매 판 난수로 뽑으면 부산이 어떤 게임에서는 작은 시장이 된다.
   *  구단에 이야기가 붙으려면 이 값이 구단을 따라다녀야 한다. */
  constructor(rng, fr = null) {
    this.market_size = Math.max(0.55, Math.min(1.5,
      rng.gauss(fr && fr.market ? fr.market : 1.0, fr ? 0.07 : 0.24)));
    this.owner_spending = Math.max(0.6, Math.min(1.4, rng.gauss(1.0, 0.16)));
    // 구단주 인내심 — 큰 시장일수록 짧다. 성적이 곧 압박이 된다.
    this.patience = Math.max(15, Math.min(85,
      rng.gauss(52 - (this.market_size - 1) * 26 + (fr ? fr.temper || 0 : 0), 11)));
    this.revenue = 100 * this.market_size;
    this.budget = 100 * this.market_size;
    this.attendance = 0;      // 지난 시즌 홈 총관중
    this.homeGames = 0;
    this.income = null;       // 수입 구성
  }

  /** 구단주가 이번 시즌에 요구하는 것. 시장 규모와 인내심이 정한다. */
  get demand() {
    const p = this.market_size * 1.6 - this.patience / 55;
    if (p >= 1.35) return '우승';
    if (p >= 0.85) return '포스트시즌';
    if (p >= 0.35) return '5할 승률';
    return '재건 허용';
  }
  /** 관중이 수입을 만들고, 수입이 다음 시즌 예산이 된다. */
  update(winPct, playoffs, title, attendance = 0, homeGames = 0, capacity = 18000) {
    if (!attendance) {                      // 기록이 없으면 추정치로 채운다
      homeGames = homeGames || 72;
      attendance = capacity * attendRate(this, winPct, playoffs, title) * homeGames;
    }
    this.attendance = Math.round(attendance);
    this.homeGames = homeGames;
    const ticket = attendance * TICKET;
    const conc = attendance * CONCESSION;
    // 중계권은 리그가 균등 배분한다. 이게 없으면 큰 시장이 눈덩이처럼 커진다.
    const media = 50 + 9 * this.market_size + (playoffs ? 6 : 0) + (title ? 4 : 0);
    this.income = { ticket: +ticket.toFixed(1), concession: +conc.toFixed(1),
                    media: +media.toFixed(1) };
    this.revenue = ticket + conc + media;
    // 예산은 관성이 있다. 한 시즌 성적으로 갑자기 두 배가 되지 않는다.
    const target = this.revenue * 0.80 * this.owner_spending;
    this.budget = this.budget ? this.budget * 0.55 + target * 0.45 : target;
  }
}
/** 경쟁균형세 — KBO 에도 있는 제동장치.
 *  성적→관중→수입→전력의 되먹임에 브레이크가 없으면 한 팀이 리그를 독식한다. */
export function balanceBudgets(teams) {
  const mean = teams.reduce((s, t) => s + t.finance.budget, 0) / teams.length;
  for (const t of teams) {
    const f = t.finance;
    if (f.budget > mean * 1.28) f.budget = mean * 1.28 + (f.budget - mean * 1.28) * 0.35;
    if (f.budget < mean * 0.74) f.budget = mean * 0.74 - (mean * 0.74 - f.budget) * 0.35;
  }
}

export const payroll = (t, year) =>
  [...t.batters, ...t.pitchers].reduce((s,p) => s + (p.contract ? p.contract.salaryIn(year) : 0), 0);
