import {BattingGame} from './batting-game.js';
export const FULL_STAGE={id:'full',title:'고양의 아홉 이닝',situation:'1회부터 경기 종료까지',home:{name:'고양 헌터스',short:'고양'},away:{name:'부산 돌핀스',short:'부산'},homeScore:0,awayScore:0,outs:0,balls:0,strikes:0,bases:[false,false,false],park:{name:'일산야구장',capacity:19400,weather:'clear',fL:98,fC:119,fR:103,fH:2.6,turf:true},colors:{home:'#b8860b',away:'#0d7ac4'},pitcher:{name:'윤지호',style:'변화구파',fast:.36,speedOffset:0}};
const LINEUP=[
 {name:'김도윤',style:'공격형',chase:.52,contact:.72,vision:.62,speed:9,power:0},
 {name:'박시우',style:'선구형',chase:.25,contact:.77,vision:.86,speed:8.2,power:0},
 {name:'이준서',style:'장타형',chase:.42,contact:.67,vision:.55,speed:7.4,power:.12},
 {name:'최민호',style:'교타형',chase:.34,contact:.80,vision:.79,speed:8.4,power:.03},
 {name:'정우성',style:'장타형',chase:.47,contact:.65,vision:.57,speed:7.2,power:.15},
 {name:'한재윤',style:'선구형',chase:.22,contact:.75,vision:.88,speed:8.1,power:.02},
 {name:'오태민',style:'주력형',chase:.48,contact:.69,vision:.64,speed:9.2,power:0},
 {name:'임서진',style:'균형형',chase:.40,contact:.74,vision:.70,speed:8,power:.04},
 {name:'강현우',style:'장타형',chase:.50,contact:.68,vision:.58,speed:7.6,power:.12},
];
export const FULL_LINEUP=LINEUP;
export class FullGame extends BattingGame{
 constructor(seed=1){super(seed,0);this.stage={...FULL_STAGE,park:{...FULL_STAGE.park}};this.inning=1;this.awayRuns=0;this.awayLine=[];this.homeLine=[];this.inningHomeStart=0;this.outs=0;this.balls=0;this.strikes=0;this.bases=[false,false,false];this.baseRunners=[null,null,null];this.count=0;this.order=0;this.history=[];this.done=false;this.won=false;this.tie=false;this.simulateTop();}
 get batter(){const b=LINEUP[this.order%LINEUP.length];return {...b,id:'full-batter-'+this.order};}
 simulateTop(){let x=(this.seed+Math.imul(this.inning,2654435761))>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);x=(x^(x>>>16))>>>0;const u=x/4294967296,r=u<.65?0:u<.87?1:u<.96?2:u<.99?3:4;this.awayLine[this.inning-1]=r;this.awayRuns+=r;this.stage.awayScore=this.awayRuns;return r;}
 snapshot(){const s=super.snapshot(),home=[...this.homeLine];home[this.inning-1]=this.runs-this.inningHomeStart;return {...s,full:true,inning:this.inning,awayScore:this.awayRuns,homeScore:this.runs,awayLine:[...this.awayLine],homeLine:home,timeProgress:Math.min(1,((this.inning-1)+this.outs/3)/8),tie:this.tie,lineup:LINEUP.map(x=>x.name),battingOrder:this.order%LINEUP.length};}
 resolvePitch(choice,roll){const completed=this.inning,e=super.resolvePitch(choice,roll);this.done=false;this.won=false;this.tie=false;e.halfEnded=false;e.awayScored=0;
  if(this.inning>=9&&this.runs>this.awayRuns){this.done=true;this.won=true;e.walkoff=true;this.homeLine[this.inning-1]=this.runs-this.inningHomeStart;}
  else if(this.outs>=3){e.halfEnded=true;e.completedInning=completed;this.homeLine[completed-1]=this.runs-this.inningHomeStart;
   if(completed>=9&&this.runs!==this.awayRuns){this.done=true;this.won=this.runs>this.awayRuns;}
   else if(completed>=12){this.done=true;this.tie=true;}
   else{this.inning++;this.inningHomeStart=this.runs;e.awayScored=this.simulateTop();this.outs=0;this.balls=0;this.strikes=0;this.bases=[false,false,false];this.baseRunners=[null,null,null];if(this.inning>=9&&this.runs>this.awayRuns){this.done=true;this.won=true;e.clinched=true;}}
  }
  e.after=this.snapshot();return e;
 }
}
