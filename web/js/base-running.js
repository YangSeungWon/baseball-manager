export const RUN_BASES=[[0,0],[19.4,19.4],[0,38.8],[-19.4,19.4],[0,0]];
const LEG=Math.hypot(19.4,19.4),STEP=1/30;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function runningTime(distance,speed=7,acceleration=4){const ramp=speed/acceleration,first=.5*acceleration*ramp*ramp;return distance<=first?Math.sqrt(2*distance/acceleration):ramp+(distance-first)/speed;}
const runnerAt=(r,t)=>{
 const count=r.to-r.from,elapsed=Math.max(0,Math.min(t,r.outAt??Infinity)-r.start);let distance=0;
 for(let i=0;i<count;i++){const enter=runningTime(i*LEG,r.speed)+i*.18,leave=runningTime((i+1)*LEG,r.speed)+i*.18;if(elapsed>=leave)distance=(i+1)*LEG;else if(elapsed>enter){let lo=i*LEG,hi=(i+1)*LEG;for(let n=0;n<18;n++){const mid=(lo+hi)/2;if(runningTime(mid,r.speed)+i*.18<elapsed)lo=mid;else hi=mid;}distance=(lo+hi)/2;break;}else break;}
 const step=Math.min(count-1,Math.floor(distance/LEG)),u=count?clamp((distance-step*LEG)/LEG,0,1):0,a=RUN_BASES[r.from+Math.max(0,step)],b=RUN_BASES[Math.min(4,r.from+Math.max(0,step)+1)];
 return {id:r.id,name:r.name,x:count?a[0]+(b[0]-a[0])*u:a[0],y:count?a[1]+(b[1]-a[1])*u:a[1],base:r.from,vis:!(r.outAt!=null&&t>r.outAt+.5)&&!(r.to===4&&t>r.arrival+.2)};
};
// Adjudicates one defensive throw. Running and throwing use the same replay trace.
export function resolveRunning(play,{bases=[null,null,null],batter={id:'batter',name:'타자',speed:7},outs=1,defenseSpeed=7.2,armSpeed=30}={}){
 const raw=play.frames,last=raw.at(-1),caught=play.events.find(e=>e.type==='catch'),award=play.events.find(e=>e.type==='home-run'||e.type==='ground-rule-double'),pickup=play.events.find(e=>e.type==='pickup');
 const runners=[{...batter,from:0},...bases.flatMap((r,i)=>r?[{...r,from:i+1}]:[])].map((r,i)=>({...r,id:r.id||'runner-'+i,speed:clamp(r.speed||7,4,10),ownSpeed:clamp(r.speed||7,4,10),start:r.from===0?.22:.3,to:r.from}));
 const arrival=(r,to)=>r.start+runningTime((to-r.from)*LEG,r.speed)+Math.max(0,to-r.from-1)*.18;
 const live=last.fielders.map(f=>({...f}));
 const receiverFor=base=>{const pos=['','1B','SS','3B','C'][base===4?4:base],target=RUN_BASES[base];return live.filter(f=>f.pos!==play.handler).sort((a,b)=>(a.pos===pos?-1000:Math.hypot(a.x-target[0],a.y-target[1]))-(b.pos===pos?-1000:Math.hypot(b.x-target[0],b.y-target[1])))[0];};
 const cover=base=>[RUN_BASES[base][0]+.65,RUN_BASES[base][1]+.25];
 const defensePlan=(base,estimate=false)=>{
  if(!pickup&&!caught)return {time:Infinity,receiver:null,carry:false};
  const receiver=receiverFor(base),carrier=live.find(f=>f.pos===play.handler),target=RUN_BASES[base];
  const flight=Math.hypot(last.x-target[0],last.y-target[1])/(estimate?armSpeed*.85:armSpeed);
  const thrown=receiver?Math.max(last.t+(estimate?.6:.35)+flight,last.t+Math.hypot(receiver.x-cover(base)[0],receiver.y-cover(base)[1])/defenseSpeed):Infinity;
  const carried=carrier?last.t+.2+Math.hypot(carrier.x-target[0],carrier.y-target[1])/defenseSpeed:Infinity;
  return carried<thrown?{time:carried,receiver:carrier,carry:true}:{time:thrown,receiver,carry:false};
 };
 const throwETA=(base,estimate=false)=>defensePlan(base,estimate).time;
 let forcedChain=true;const forced=new Set([0]);for(let from=1;from<=3;from++){if(!bases[from-1])forcedChain=false;if(forcedChain)forced.add(from);}
 const airHold=play.launch>18&&outs<2;
 for(const r of runners){if(r.from>0&&(airHold||caught&&outs<2))r.start=(caught?.t||play.events.find(e=>e.type==='bounce')?.t||last.t)+.25;}
 // A following runner cannot pass a slower runner or reach an occupied bag first.
 for(const r of [...runners].reverse()){
  const ahead=runners.filter(x=>x.from>r.from).sort((a,b)=>a.from-b.from)[0];if(!ahead||caught&&r.from===0)continue;
  r.speed=Math.min(r.speed,ahead.speed);
  const gap=ahead.from-r.from;
  r.start=Math.max(r.start,ahead.start+ahead.speed/4+.25-runningTime(gap*LEG,r.speed)-Math.max(0,gap-1)*.18);
 }
 if(caught){const b=runners[0];b.to=1;b.outAt=caught.t;b.arrival=caught.t;}
 if(award){for(const r of runners)r.to=award.type==='home-run'?4:Math.min(4,r.from+2);}
 else for(const r of [...runners].reverse()){
  if(r.outAt!=null)continue;
  let minimum=caught?r.from:forced.has(r.from)?r.from+1:r.from;
  const ahead=runners.filter(x=>x.from>r.from).sort((a,b)=>a.from-b.from)[0];let limit=ahead&&ahead.to<4?ahead.to-1:4;
  r.to=Math.min(limit,minimum);
  for(let next=r.to+1;next<=limit;next++)if(arrival(r,next)+.15<throwETA(next,true))r.to=next;else break;
 }
 for(const r of runners)r.arrival=r.outAt??arrival(r,r.to);
 let contest=null;
 if(!award&&(pickup||caught)&&!(caught&&outs===2)){
  const choices=runners.filter(r=>r.outAt==null&&r.to>r.from).map(r=>{const ball=throwETA(r.to),force=!caught&&forced.has(r.from)&&r.to===r.from+1;return {r,ball,force,out:ball+(force?0:.18)<r.arrival};}).filter(c=>Number.isFinite(c.ball));
  choices.sort((a,b)=>Number(b.out)-Number(a.out)||b.r.to-a.r.to||a.ball-b.ball);contest=choices[0]||null;
  if(contest){const {r,ball,force,out}=contest;if(out)r.outAt=force?ball:r.arrival;Object.assign(contest,defensePlan(r.to));contest.end=Math.max(ball,out&&!force?r.arrival:ball);}
 }
 const outEvents=runners.filter(r=>r.outAt!=null).sort((a,b)=>a.outAt-b.outAt),third=outEvents[2-outs],thirdTime=third?.outAt??Infinity,forceThird=third&&(third.from===0&&third.to===1||contest?.r===third&&contest.force);
 const scoring=runners.filter(r=>r.to===4&&r.outAt==null&&r.arrival<thirdTime&&!forceThird);
 const end=Math.min(Math.max(last.t,...runners.map(r=>r.outAt??r.arrival),contest?.end||0),thirdTime);
 const frames=raw.filter(f=>f.t<=end).map(f=>({...f,runners:runners.map(r=>runnerAt(r,f.t))}));
 const receiver=contest?.receiver,target=contest?RUN_BASES[contest.r.to]:null,throwStart=last.t+(contest?.carry?.2:.35),ballEnd=contest?.ball||last.t;
 for(let t=last.t+STEP;t<=end+STEP;t+=STEP){
  const time=Math.min(t,end),u=contest?clamp((time-throwStart)/Math.max(.01,ballEnd-throwStart),0,1):0;
  frames.push({t:time,x:contest?last.x+(target[0]-last.x)*u:last.x,y:contest?last.y+(target[1]-last.y)*u:last.y,z:contest?1.5+(contest.carry?0:Math.sin(u*Math.PI)*1.4):last.z,bounced:last.bounced,wall:last.wall,fielders:live.map(f=>{if(f.pos!==receiver?.pos)return {...f};const spot=contest.carry?target:cover(contest.r.to),d=Math.hypot(spot[0]-f.x,spot[1]-f.y),k=Math.min(1,defenseSpeed*Math.max(0,time-(contest.carry?throwStart:last.t))/Math.max(.001,d));return {...f,x:f.x+(spot[0]-f.x)*k,y:f.y+(spot[1]-f.y)*k};}),runners:runners.map(r=>runnerAt(r,time))});if(time===end)break;
 }
 const events=play.events.filter(e=>e.t<=end);
 if(contest){events.push({type:contest.carry?'carry':'throw',t:throwStart,x:last.x,y:last.y,z:1.5,fielder:play.handler,base:contest.r.to});events.push({type:contest.out?(contest.force?'force-out':'tag-out'):'safe',t:contest.end,x:target[0],y:target[1],z:1.5,fielder:receiver.pos,base:contest.r.to,runner:contest.r.id,runnerArrival:contest.r.arrival,ballArrival:contest.ball});}
 const finalBases=[null,null,null];for(const r of runners)if(r.outAt==null&&r.to>0&&r.to<4)finalBases[r.to-1]={id:r.id,name:r.name,speed:r.ownSpeed};
 const b=runners[0],otherOut=outEvents.some(r=>r.from>0),hitBases=b.outAt==null?b.to:Math.max(0,b.to-1);
 let result=award?.type==='home-run'?'HR':award?'2B':caught||b.outAt!=null&&b.to<=1?'OUT':contest?.out&&contest.force&&contest.r.from>0?'FC':hitBases>=4?'HR':hitBases>=3?'3B':hitBases===2?'2B':'1B';
 return {...play,result,duration:frames.at(-1).t,frames,events:events.filter(e=>e.t<=end).sort((a,b)=>a.t-b.t),running:{bases:finalBases,outs:Math.min(3-outs,outEvents.length),scored:scoring.length,movements:runners.filter(r=>r.to!==r.from||r.outAt!=null).map(r=>({from:r.from,to:r.to,id:r.id,name:r.name,out:r.outAt!=null,start:r.start,arrival:r.arrival})),runners,contest:contest?{base:contest.r.to,runner:contest.r.id,ballArrival:contest.ball,runnerArrival:contest.r.arrival,out:contest.out,force:contest.force}:null}};
}
