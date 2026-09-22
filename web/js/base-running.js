import {commitOnFlight} from './runner-read.js';
import {RUN_BASES,RUN_ACCELERATION,runningTime,runningRoute,leadDistance,runnerArrival,runnerPosition} from './runner-motion.js';
export {RUN_BASES,runningTime} from './runner-motion.js';
const LEG=Math.hypot(19.4,19.4),STEP=1/30;
// 송구. 단장 모드 엔진(core/run.js)과 같은 모델을 쓴다 — 잡고 던지기까지의 시간(내야 .45s · 외야 .75s),
// 거리/어깨, 그리고 55m 를 넘는 외야 송구는 중계를 한 번 거친다(+.60s). 외야는 높게 던지느라 실효 속도가 낮다.
// 예전에는 잡자마자 .35초 뒤 직선 등속으로 날아가서, 우익수가 3루 주자를 말도 안 되게 잡았다.
const THROW={releaseIF:.45,releaseOF:.75,relay:.60,cutoff:55,arcOF:.85,receive:.1,sure:.15,close:.4};
const OUTFIELD=new Set(['LF','CF','RF']);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const runnerAt=runnerPosition;
// Adjudicates one defensive throw. Running and throwing use the same replay trace.
export function resolveRunning(play,{bases=[null,null,null],batter={id:'batter',name:'타자',speed:8.2},outs=1,defenseSpeed=7.2,armSpeed=38,defense}={}){
 const raw=play.frames,last=raw.at(-1),caught=play.events.find(e=>e.type==='catch'),award=play.events.find(e=>e.type==='home-run'||e.type==='ground-rule-double'),pickup=play.events.find(e=>e.type==='pickup');
 const runners=[{...batter,from:0},...bases.flatMap((r,i)=>r?[{...r,from:i+1}]:[])].map((r,i)=>({...r,id:r.id||'runner-'+i,speed:clamp(r.speed||8.2,4,10),ownSpeed:clamp(r.speed||8.2,4,10),customLead:r.lead!=null,lead:leadDistance(r.from,r),route:runningRoute(r.from),start:r.from===0?.18:.22,to:r.from}));
 const arrival=runnerArrival;
 const live=last.fielders.map(f=>({...f}));
 const receiverFor=base=>{const pos=['','1B','SS','3B','C'][base===4?4:base],target=RUN_BASES[base];return live.filter(f=>f.pos!==play.handler).sort((a,b)=>(a.pos===pos?-1000:Math.hypot(a.x-target[0],a.y-target[1]))-(b.pos===pos?-1000:Math.hypot(b.x-target[0],b.y-target[1])))[0];};
 const cover=base=>[RUN_BASES[base][0]+.65,RUN_BASES[base][1]+.25];
 const fSpeed=f=>defense?.[f?.pos]?.speed??defenseSpeed;
 const defensePlan=(base,estimate=false)=>{
  if(!pickup&&!caught)return {time:Infinity,receiver:null,carry:false};
  const receiver=receiverFor(base),carrier=live.find(f=>f.pos===play.handler),target=RUN_BASES[base];
  const distance=Math.hypot(last.x-target[0],last.y-target[1]),of=OUTFIELD.has(play.handler);
  const velocity=(defense?.[play.handler]?.arm??armSpeed)*(of?THROW.arcOF:1)*(estimate?.9:1);
  // 한 번에 닿지 않는 외야 송구는 중계를 거친다. 커트맨이 받고 다시 던지는 시간이 그대로 붙는다.
  const flight=distance/velocity+(of&&distance>THROW.cutoff?THROW.relay:0)+THROW.receive;
  const ready=receiver?last.t+Math.hypot(receiver.x-cover(base)[0],receiver.y-cover(base)[1])/fSpeed(receiver):Infinity;
  const settle=of?THROW.releaseOF:THROW.releaseIF;
  const release=Math.max(last.t+settle+(estimate?.15:0),ready-flight),thrown=release+flight;
  const carryRelease=last.t+.2,carried=carrier?carryRelease+Math.hypot(carrier.x-target[0],carrier.y-target[1])/fSpeed(carrier):Infinity;
  return carried<thrown?{time:carried,receiver:carrier,carry:true,release:carryRelease,velocity:fSpeed(carrier)}:{time:thrown,receiver,carry:false,release,velocity,receiverReady:ready};
 };
 const throwETA=(base,estimate=false)=>defensePlan(base,estimate).time;
 let forcedChain=true;const forced=new Set([0]);for(let from=1;from<=3;from++){if(!bases[from-1])forcedChain=false;if(forcedChain)forced.add(from);}
 const airHold=play.launch>18&&outs<2;
 const commit=airHold?commitOnFlight(raw,defense,defenseSpeed):null;
 for(const r of runners){if(r.from>0&&(airHold||caught&&outs<2)){
  if(!caught&&commit!=null){r.start=commit;}
  else{r.returnAt=.18;r.returnEnd=r.returnAt+runningTime(r.lead,r.speed);r.start=Math.max(r.returnEnd,(caught?.t||play.events.find(e=>e.type==='bounce')?.t||last.t)+.2);}
 }}
 // A following runner cannot pass a slower runner or reach an occupied bag first.
 for(const r of [...runners].reverse()){
  const ahead=runners.filter(x=>x.from>r.from).sort((a,b)=>a.from-b.from)[0];if(!ahead||caught&&r.from===0)continue;
  const gap=ahead.from-r.from;
  // 발이 묶이는 것은 바로 앞 베이스의 주자뿐이다. 두 베이스 앞의 느린 주자가 내 주루까지 늦추지는 않는다.
  if(gap===1)r.speed=Math.min(r.speed,ahead.speed);
  r.start=Math.max(r.start,ahead.start+ahead.speed/RUN_ACCELERATION+.25-runningTime(gap*LEG,r.speed)-Math.max(0,gap-1)*.18);
 }
 for(const r of runners)if(r.returnAt!=null){r.returnEnd=r.returnAt+runningTime(r.lead,r.speed);r.start=Math.max(r.start,r.returnEnd);}
 if(caught){const b=runners[0];b.to=1;b.outAt=caught.t;b.arrival=caught.t;}
 if(award){for(const r of runners)r.to=award.type==='home-run'?4:Math.min(4,r.from+2);}
 else for(const r of [...runners].reverse()){
  if(r.outAt!=null)continue;
  let minimum=caught?r.from:forced.has(r.from)?r.from+1:r.from;
  const ahead=runners.filter(x=>x.from>r.from).sort((a,b)=>a.from-b.from)[0];let limit=ahead&&ahead.to<4?ahead.to-1:4;
  r.to=Math.min(limit,minimum);
  for(let next=r.to+1;next<=limit;next++)if(arrival(r,next)+.15<throwETA(next,true))r.to=next;else break;
 }
 for(const r of runners){if(r.from>0&&r.to===r.from&&r.returnAt==null){r.returnAt=last.t+.15;r.returnEnd=r.returnAt+runningTime(r.lead,r.speed);}r.arrival=r.outAt??arrival(r,r.to);}
 let contest=null;
 if(!award&&(pickup||caught)&&!(caught&&outs===2)){
  const choices=runners.filter(r=>r.outAt==null&&r.to>r.from).map(r=>{const ball=throwETA(r.to),force=!caught&&forced.has(r.from)&&r.to===r.from+1;return {r,ball,force,out:ball+(force?0:.18)<r.arrival};}).filter(c=>Number.isFinite(c.ball));
  // 어디로 던지나. 아웃이 되는 쪽이 먼저고, 그중에서 2아웃이면 가장 확실한 아웃을 잡는다(아웃 하나면 이닝이 끝난다).
  // 여유가 있을 때만 선행 주자를 노리고, 아무 데서도 아웃이 안 되면 뒤 주자 쪽(보통 1루)으로 던져 진루를 묶는다.
  const margin=c=>c.r.arrival-(c.ball+(c.force?0:.18)),sure=c=>c.out&&margin(c)>=THROW.sure;
  const close=c=>margin(c)>-THROW.close;   // 아웃은 아니지만 승부가 되는 거리
  choices.sort((a,b)=>{
   if(a.out!==b.out)return Number(b.out)-Number(a.out);
   if(!a.out){
    if(close(a)!==close(b))return Number(close(b))-Number(close(a));
    return close(a)?b.r.to-a.r.to||margin(b)-margin(a):a.r.to-b.r.to||a.ball-b.ball;
   }
   if(outs===2||sure(a)!==sure(b))return margin(b)-margin(a);
   return b.r.to-a.r.to||margin(b)-margin(a);
  });contest=choices[0]||null;
  if(contest){const {r,ball,force,out}=contest;if(out)r.outAt=force?ball:r.arrival;Object.assign(contest,defensePlan(r.to));contest.end=Math.max(ball,out&&!force?r.arrival:ball);}
 }
 const outEvents=runners.filter(r=>r.outAt!=null).sort((a,b)=>a.outAt-b.outAt),third=outEvents[2-outs],thirdTime=third?.outAt??Infinity,forceThird=third&&(third.from===0&&third.to===1||contest?.r===third&&contest.force);
 const scoring=runners.filter(r=>r.to===4&&r.outAt==null&&r.arrival<thirdTime&&!forceThird);
 const end=Math.min(Math.max(last.t,...runners.map(r=>r.outAt??r.arrival),contest?.end||0),thirdTime);
 const frames=raw.filter(f=>f.t<=end).map(f=>({...f,runners:runners.map(r=>runnerAt(r,f.t))}));
 const receiver=contest?.receiver,target=contest?RUN_BASES[contest.r.to]:null,throwStart=contest?.release??last.t,ballEnd=contest?.ball||last.t;
 for(let t=last.t+STEP;t<=end+STEP;t+=STEP){
  const time=Math.min(t,end),u=contest?clamp((time-throwStart)/Math.max(.01,ballEnd-throwStart),0,1):0;
  frames.push({t:time,x:contest?last.x+(target[0]-last.x)*u:last.x,y:contest?last.y+(target[1]-last.y)*u:last.y,z:contest?(time<throwStart?last.z+(1.5-last.z)*clamp((time-last.t)/Math.max(.01,throwStart-last.t),0,1):1.5+(contest.carry?0:Math.sin(u*Math.PI)*1.4)):last.z,bounced:last.bounced,wall:last.wall,fielders:live.map(f=>{if(f.pos!==receiver?.pos)return {...f};const spot=contest.carry?target:cover(contest.r.to),d=Math.hypot(spot[0]-f.x,spot[1]-f.y),k=Math.min(1,fSpeed(f)*Math.max(0,time-(contest.carry?throwStart:last.t))/Math.max(.001,d));return {...f,x:f.x+(spot[0]-f.x)*k,y:f.y+(spot[1]-f.y)*k};}),runners:runners.map(r=>runnerAt(r,time))});if(time===end)break;
 }
 const events=play.events.filter(e=>e.t<=end);
 if(contest){events.push({type:contest.carry?'carry':'throw',t:throwStart,x:last.x,y:last.y,z:1.5,fielder:play.handler,base:contest.r.to,velocity:contest.velocity});events.push({type:contest.out?(contest.force?'force-out':'tag-out'):'safe',t:contest.end,x:target[0],y:target[1],z:1.5,fielder:receiver.pos,base:contest.r.to,runner:contest.r.id,runnerArrival:contest.r.arrival,ballArrival:contest.ball});}
 const finalBases=[null,null,null];for(const r of runners)if(r.outAt==null&&r.to>0&&r.to<4)finalBases[r.to-1]={id:r.id,name:r.name,speed:r.ownSpeed,...(r.customLead?{lead:r.lead}: {})};
 const b=runners[0],otherOut=outEvents.some(r=>r.from>0),hitBases=b.outAt==null?b.to:Math.max(0,b.to-1);
 let result=award?.type==='home-run'?'HR':award?'2B':caught||b.outAt!=null&&b.to<=1?'OUT':contest?.out&&contest.force&&contest.r.from>0?'FC':hitBases>=4?'HR':hitBases>=3?'3B':hitBases===2?'2B':'1B';
 return {...play,result,duration:frames.at(-1).t,frames,events:events.filter(e=>e.t<=end).sort((a,b)=>a.t-b.t),running:{bases:finalBases,outs:Math.min(3-outs,outEvents.length),scored:scoring.length,movements:runners.filter(r=>r.to!==r.from||r.outAt!=null).map(r=>({from:r.from,to:r.to,id:r.id,name:r.name,out:r.outAt!=null,start:r.start,arrival:r.arrival})),runners,contest:contest?{base:contest.r.to,runner:contest.r.id,ballArrival:contest.ball,release:contest.release,velocity:contest.velocity,receiverReady:contest.receiverReady,runnerArrival:contest.r.arrival,out:contest.out,force:contest.force}:null}};
}
