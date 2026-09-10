import {HOME_TEAM,AWAY_TEAM} from './inning-teams.js';
export const STAGES=[
 {id:0,title:'항구의 마지막 공격',situation:'1사 1·2루 · 두 점 차',home:HOME_TEAM,away:AWAY_TEAM,homeScore:0,awayScore:2,outs:1,balls:0,strikes:0,bases:[true,true,false],park:{name:'항구 파크',capacity:18000,weather:'clear'},colors:{home:'#cf7756',away:'#427c83'}},
 {id:1,title:'산성의 한 점 승부',outfieldArm:32,situation:'동점 · 1사 3루',home:AWAY_TEAM,away:{name:'숲길 디어스',short:'숲길'},homeScore:2,awayScore:2,outs:1,balls:0,strikes:0,bases:[false,false,true],park:{name:'산성 필드',capacity:22000,weather:'evening',fL:103,fC:127,fR:103,fH:3.5},colors:{home:'#427c83',away:'#a58a50'},pitcher:{name:'정하린',style:'변화구파',fast:.35,speedOffset:0}},
 {id:2,title:'돔의 마지막 타자',situation:'동점 · 2사 만루 · 풀카운트',home:{name:'도심 스파크',short:'도심'},away:HOME_TEAM,homeScore:4,awayScore:4,outs:2,balls:3,strikes:2,bases:[true,true,true],park:{name:'센트럴 돔',capacity:30000,dome:true,fL:100,fC:123,fR:100,fH:3},colors:{home:'#7561a6',away:'#cf7756'},pitcher:{name:'차민혁',style:'강속구파',fast:.55,speedOffset:5}},
];
export function getStage(id=0){if(!Number.isInteger(id)||!STAGES[id])throw new Error('Invalid stage');return STAGES[id];}
export function clearedStages(){try{return JSON.parse(localStorage.getItem('dugout.stages.v1')||'[]').filter(id=>Number.isInteger(id)&&STAGES[id]);}catch{return [];}}
export function clearStage(id){getStage(id);try{localStorage.setItem('dugout.stages.v1',JSON.stringify([...new Set([...clearedStages(),id])]));}catch{}if(typeof document!=='undefined')document.dispatchEvent(new Event('dugout-stage-clear'));}
