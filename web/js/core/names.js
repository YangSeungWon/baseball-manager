// 데이터 레이어. 시뮬레이션 계산에 일절 관여하지 않는다.
const SUR = ["강","고","곽","권","김","나","남","노","도","류","문","민","박","배","백",
  "서","석","성","손","송","신","심","안","양","엄","오","유","윤","이","임",
  "장","전","정","조","주","진","차","채","최","하","한","허","홍","황"];
const G1 = ["민","현","준","지","서","도","시","예","하","우","성","재","태","동","건",
  "규","승","한","진","윤","기","상","영","경","주","용","광"];
const G2 = ["우","호","준","현","석","진","수","훈","빈","한","성","재","혁",
  "찬","영","기","환","용","교","건","민","섭","철","원","열"];
// 특별·광역시 7 + 도 대표 7. 17개 시도 중 14개를 덮는다.
// 수원(경기)은 고양으로, 춘천(강원)은 영동 거점 강릉으로 바꿨다.
// 연고지 · 구단명 · 마스코트 · 팀 컬러를 고정 매칭한다.
// 롯데가 항상 부산이듯, 연고와 이름은 무작위로 섞이면 안 된다.
// 색은 실제 프로야구가 쓰는 계열만 — 빨강 · 버건디 · 주황 · 파랑 · 남색 · 진초록 · 차콜 · 금.
export const FRANCHISES = [
  { city:"서울", nick:"타이탄스",  mascot:"고릴라",   color:"#c1121f", code:"SE" },
  { city:"부산", nick:"돌핀스",    mascot:"돌고래",   color:"#1668b8", code:"BS" },
  { city:"인천", nick:"썬더스",    mascot:"들소",     color:"#2a4bab", code:"IC" },
  { city:"대구", nick:"불스",      mascot:"황소",     color:"#7c1d32", code:"DG" },
  { city:"대전", nick:"드래곤스",  mascot:"용",       color:"#0b5138", code:"DJ" },
  { city:"광주", nick:"피닉스",    mascot:"불사조",   color:"#d1600f", code:"GJ" },
  { city:"울산", nick:"샤크스",    mascot:"상어",     color:"#123f6d", code:"US" },
  { city:"고양", nick:"헌터스",    mascot:"매",       color:"#a37012", code:"GY" },
  { city:"창원", nick:"코브라스",  mascot:"코브라",   color:"#14663c", code:"CW" },
  { city:"청주", nick:"스타즈",    mascot:"수리부엉이", color:"#b03410", code:"CJ" },
  { city:"천안", nick:"팬서스",    mascot:"표범",     color:"#202a3a", code:"CA" },
  { city:"전주", nick:"재규어스",  mascot:"재규어",   color:"#0d2b52", code:"JJ" },
  { city:"강릉", nick:"울브스",    mascot:"늑대",     color:"#4a5568", code:"GN" },
  { city:"제주", nick:"레이븐스",  mascot:"큰까마귀", color:"#1a2233", code:"JU" },
];
const BY_NAME = new Map(FRANCHISES.map(f => [`${f.city} ${f.nick}`, f]));
export const franchiseOf = (fullName) => BY_NAME.get(fullName) || FRANCHISES[0];

export const personName = (rng) => rng.choice(SUR) + rng.choice(G1) + rng.choice(G2);
export function teamNames(n, rng) {
  return rng.sample(FRANCHISES, n).map(f => `${f.city} ${f.nick}`);
}
