import {InningGame} from './inning-game.js';
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
 constructor(seed=1){super(seed,0);this.stage={...FULL_STAGE,park:{...FULL_STAGE.park}};this.inning=1;this.half='top';this.awayRuns=0;this.homeRuns=0;this.awayLine=[0];this.homeLine=[];this.orders={top:0,bottom:0};this.hits={top:0,bottom:0};this.histories={top:[],bottom:[]};this.resetHalf();this.count=0;this.tie=false;}
 resetHalf(){this.outs=0;this.balls=0;this.strikes=0;this.bases=[false,false,false];this.baseRunners=[null,null,null];this.runs=this.half==='top'?this.awayRuns:this.homeRuns;this.order=this.orders[this.half];this.history=this.histories[this.half];this.done=false;this.won=false;}
 get batter(){const b=LINEUP[this.order%9],names=['서준혁','강태민','오지환','문도현','장우진','신재호','유시온','백민재','조현우'];return {...b,name:this.half==='top'?names[this.order%9]:b.name,id:this.half+'-batter-'+this.order};}
 get pitcher(){return this.half==='top'?{name:'정우진',style:'균형형',fast:.5,speedOffset:0}:FULL_STAGE.pitcher;}
 snapshot(){const s=super.snapshot();return {...s,full:true,inning:this.inning,half:this.half,awayScore:this.awayRuns,homeScore:this.homeRuns,awayLine:[...this.awayLine],homeLine:[...this.homeLine],timeProgress:Math.min(1,((this.inning-1)+(this.half==='bottom'?.5:0)+this.outs/6)/9),tie:this.tie,lineup:LINEUP.map((b,i)=>this.half==='top'?['서준혁','강태민','오지환','문도현','장우진','신재호','유시온','백민재','조현우'][i]:b.name),battingOrder:this.order%9,hits:{...this.hits}};}
 completePitch(e){
  this.done=false;this.won=false;this.orders[this.half]=this.order;if(['1B','2B','3B','HR'].includes(e.result))this.hits[this.half]++;
  const line=this.half==='top'?this.awayLine:this.homeLine;line[this.inning-1]=(line[this.inning-1]||0)+e.scored;
  if(this.half==='top')this.awayRuns=this.runs;else this.homeRuns=this.runs;
  e.halfEnded=this.outs>=3;e.completedInning=this.inning;
  if(this.half==='bottom'&&this.inning>=9&&this.homeRuns>this.awayRuns){this.done=true;this.won=true;e.walkoff=true;}
  else if(e.halfEnded&&this.inning>=9){
   if(this.half==='top'&&this.homeRuns>this.awayRuns){this.done=true;this.won=true;e.clinched=true;}
   else if(this.half==='bottom'&&(this.homeRuns!==this.awayRuns||this.inning>=12)){this.done=true;this.won=this.homeRuns>this.awayRuns;this.tie=this.homeRuns===this.awayRuns;}
  }
  e.after=this.snapshot();return e;
 }
 advanceHalf(){if(this.done||this.outs<3)throw new Error('Half inning is not over');if(this.half==='top')this.half='bottom';else{this.half='top';this.inning++;}(this.half==='top'?this.awayLine:this.homeLine)[this.inning-1]=0;this.resetHalf();}
 resolvePitch(choice,roll){if(this.half!=='bottom')throw new Error('Pitching half');return this.completePitch(super.resolvePitch(choice,roll));}
 pitch(choice){if(this.half==='bottom')return super.pitch(choice);return this.completePitch(InningGame.prototype.pitch.call(this,choice));}
}
