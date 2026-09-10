import { HOME_TEAM, AWAY_TEAM } from './inning-teams.js';
const BASE='https://baseball.ysw.kr/';
export function challengeSeed(search) {
  const value=new URLSearchParams(search).get('challenge');
  const match=/^b5-(0|[1-9]\d{0,9})$/.exec(value||'');
  return match&&Number(match[1])<=0xffffffff?Number(match[1]):null;
}
export function battingResult(state,seed,events) {
  const title=state.won?'끝내기 성공!':state.runs===2?'동점까지, 한 점이 아쉽다':state.runs?'추격했지만, 뒤집지 못했다':'이번엔 막혔다';
  const url=BASE+'?challenge=b5-'+(seed>>>0);
  const hits=events.filter(e=>['1B','2B','3B','HR'].includes(e.result)).length;
  const summary=`${state.count}구 · ${state.runs}득점 · ${hits}안타`;
  const text=`DUGOUT · 2.5초 승부\n${title}\n${summary}\n9회 말 1사 1·2루, 두 점 차. 같은 상황, 너는 뒤집을 수 있어?`;
  return {title,summary,text,url,score:`${HOME_TEAM.short} ${state.runs} : 2 ${AWAY_TEAM.short}`,seed:seed>>>0,won:state.won};
}
export function resultCard(result) {
  const cv=document.createElement('canvas');cv.width=1080;cv.height=1080;
  const c=cv.getContext('2d'),font='"Noto Sans CJK KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  c.fillStyle='#10232c';c.fillRect(0,0,1080,1080);
  c.fillStyle='#76b899';c.fillRect(0,0,1080,14);
  const text=(s,x,y,size,color='#e5efea',weight=600)=>{c.font=`${weight} ${size}px ${font}`;c.fillStyle=color;c.fillText(s,x,y);};
  text('DUGOUT',72,110,34,'#9dcbb7');text('2.5초, 칠까 참을까?',72,202,58);
  text('9회 말 · 1사 1·2루 · 두 점 차에서 시작',72,266,30,'#b8cdd4');
  c.fillStyle='#1b3842';c.fillRect(72,320,936,360);
  text(result.title,108,408,44,result.won?'#f4d798':'#d7e4e7');
  text(result.score,108,528,76,'#fff0c9',800);text(result.summary,108,610,36,'#c6dadf');
  text('같은 상황, 너는 뒤집을 수 있어?',72,782,40);
  text('무료 · 설치·가입 없이 브라우저에서',72,842,29,'#b8cdd4');
  text('baseball.ysw.kr',72,958,36,'#98d0b4');text(result.url.replace('https://',''),72,1014,25,'#b8cdd4');
  return new Promise((resolve,reject)=>cv.toBlob(b=>b?resolve(b):reject(new Error('Image unavailable')),'image/png'));
}
export async function copyChallenge(text) {
  if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return true;}catch{}}
  const el=document.createElement('textarea');el.value=text;el.style.cssText='position:fixed;left:0;top:0;opacity:0';document.body.append(el);el.select();
  let copied=false;try{copied=document.execCommand('copy');}catch{}el.remove();return copied;
}
