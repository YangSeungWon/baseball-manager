// 부상 엔진. 발생과 심각도를 분리하고, 중상은 영구 손상을 남긴다.
const BASE = { BAT: 0.0063, SP: 0.0170, RP: 0.0078 };
const SEV_BAT = [[0.56,4,15,"경상"],[0.86,16,45,"중경상"],[0.97,46,120,"중상"],[1.01,150,260,"시즌아웃"]];
const SEV_PIT = [[0.48,4,15,"경상"],[0.80,16,45,"중경상"],[0.94,46,130,"중상"],[1.01,160,330,"시즌아웃"]];
const DMG_BAT = { speed:1.00, fielding:0.60, contact:0.28, gap_power:0.22, hr_power:0.18, avoid_k:0.15 };
const DMG_PIT = { stuff:1.00, stamina:0.80, movement:0.35, command:0.30 };

const ageFactor = (age) => age <= 25 ? 0.80 : 1.0 + 0.052 * Math.max(0, age - 27);

export function risk(p, fatigue = 0, workload = 1) {
  const kind = p.kind === 'B' ? 'BAT' : (p.role === 'SP' ? 'SP' : 'RP');
  let f = BASE[kind];
  f *= 0.55 + 0.90 * (p.hidden.injury_prone / 50);
  f *= ageFactor(p.age);
  f *= 1.0 + 0.85 * Math.max(0, fatigue);
  f *= workload;
  return Math.min(0.25, f);
}

export function roll(p, rng, fatigue = 0, workload = 1) {
  if (p.injury_days > 0) return null;
  if (rng.random() >= risk(p, fatigue, workload)) return null;
  const table = p.kind === 'B' ? SEV_BAT : SEV_PIT;
  const r = rng.random();
  for (const [cut, lo, hi, label] of table) if (r < cut) return [rng.randint(lo, hi), label];
  return [rng.randint(4, 15), "경상"];
}

export function apply(p, days, rng) {
  p.injury_days = days;
  p.career_injury_days = (p.career_injury_days || 0) + days;
  p.career_injuries = (p.career_injuries || 0) + 1;
  if (days < 46) return null;
  const scale = Math.min(1, (days - 45) / 190);
  const table = p.kind === 'B' ? DMG_BAT : DMG_PIT;
  const lost = {};
  for (const [attr, mult] of Object.entries(table)) {
    const d = 6.5 * scale * mult * rng.uniform(0.5, 1.5);
    p[attr] = Math.max(20, p[attr] - d);
    p.pot[attr] = Math.max(20, p.pot[attr] - d * 0.75);
    if (d >= 1) lost[attr] = d;
  }
  p.hidden.injury_prone = Math.min(80, p.hidden.injury_prone + 5 * scale);
  return lost;
}
