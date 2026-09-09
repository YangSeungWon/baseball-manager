// Stable scouting data; constructing a roster never consumes pitch randomness.
const NAMES=['정우진','한지훈','오민재','배준혁','최시온','임건우','문태준','차유찬','신도하'];
const POS=['P','C','1B','2B','SS','3B','LF','CF','RF'];
export function defenseRoster(seed=0){return Object.fromEntries(POS.map((pos,i)=>{
 const variant=((seed>>>0)+i*7)%3;
 return [pos,{name:NAMES[i],speed:[6.4,7.2,8][variant]*(pos==='P'?.8:1),reaction:[.45,.35,.25][variant],arm:(['LF','CF','RF'].includes(pos)?[36,43,40]:['SS','3B'].includes(pos)?[34,41,38]:[31,38,35])[variant]}];
}));}
export const paceLabel=(s,role='runner')=>s>=(role==='fielder'?7.4:8.8)?'주력 빠름':s<(role==='fielder'?6.9:7.8)?'주력 느림':'주력 보통';
export const armLabel=s=>s>=40?'강한 송구':s<35?'약한 송구':'송구 보통';
export const batLabel=b=>b.power>=.1?'장타 강점':b.contact>=.76?'컨택 강점':'주력 강점';
export const positionLabel={P:'투수',C:'포수','1B':'1루','2B':'2루',SS:'유격','3B':'3루',LF:'좌익',CF:'중견',RF:'우익'};
