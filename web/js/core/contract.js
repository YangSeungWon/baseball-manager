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

export class Finance {
  constructor(rng) {
    this.market_size = Math.max(0.55, Math.min(1.5, rng.gauss(1.0, 0.24)));
    this.owner_spending = Math.max(0.6, Math.min(1.4, rng.gauss(1.0, 0.16)));
    // 구단주 인내심 — 큰 시장일수록 짧다. 성적이 곧 압박이 된다.
    this.patience = Math.max(15, Math.min(85,
      rng.gauss(52 - (this.market_size - 1) * 26, 13)));
    this.revenue = 100 * this.market_size;
    this.budget = 100 * this.market_size;
  }

  /** 구단주가 이번 시즌에 요구하는 것. 시장 규모와 인내심이 정한다. */
  get demand() {
    const p = this.market_size * 1.6 - this.patience / 55;
    if (p >= 1.35) return '우승';
    if (p >= 0.85) return '포스트시즌';
    if (p >= 0.35) return '5할 승률';
    return '재건 허용';
  }
  update(winPct, playoffs, title) {
    let base = 62 + 58*this.market_size;
    base *= 0.80 + 0.62*(winPct/0.5)*0.5;
    if (playoffs) base += 9*this.market_size;
    if (title) base += 7*this.market_size;
    this.revenue = base;
    this.budget = base * 0.86 * this.owner_spending;
  }
}
export const payroll = (t, year) =>
  [...t.batters, ...t.pitchers].reduce((s,p) => s + (p.contract ? p.contract.salaryIn(year) : 0), 0);
