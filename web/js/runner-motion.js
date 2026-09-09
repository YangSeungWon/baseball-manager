export const RUN_BASES=[[0,0],[19.4,19.4],[0,38.8],[-19.4,19.4],[0,0]];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const RUN_ACCELERATION=5;
export function runningTime(distance,speed=8.2,acceleration=RUN_ACCELERATION){
 const ramp=speed/acceleration,first=.5*acceleration*ramp*ramp;
 return distance<=first?Math.sqrt(Math.max(0,2*distance/acceleration)):ramp+(distance-first)/speed;
}
const norm=([x,y])=>{const d=Math.hypot(x,y);return [x/d,y/d];};
const tangent=b=>b===0?norm(RUN_BASES[1]):b===4?norm([19.4,-19.4]):norm([RUN_BASES[b+1][0]-RUN_BASES[b-1][0],RUN_BASES[b+1][1]-RUN_BASES[b-1][1]]);
const routes=new Map();
export function runningRoute(from){
 if(routes.has(from))return routes.get(from);
 const points=[{d:0,x:RUN_BASES[from][0],y:RUN_BASES[from][1]}],bags={[from]:0};let distance=0;
 for(let b=from;b<4;b++){
  const a=RUN_BASES[b],z=RUN_BASES[b+1],ta=tangent(b),tz=tangent(b+1),c=[a[0]+ta[0]*4,a[1]+ta[1]*4],e=[z[0]-tz[0]*4,z[1]-tz[1]*4];
  for(let j=1;j<=40;j++){const t=j/40,u=1-t,x=u*u*u*a[0]+3*u*u*t*c[0]+3*u*t*t*e[0]+t*t*t*z[0],y=u*u*u*a[1]+3*u*u*t*c[1]+3*u*t*t*e[1]+t*t*t*z[1],last=points.at(-1);distance+=Math.hypot(x-last.x,y-last.y);points.push({d:distance,x,y});}
  bags[b+1]=distance;
 }
 const route={points,bags,distance};routes.set(from,route);return route;
}
export function routePoint(route,d){
 const points=route.points;d=clamp(d,0,route.distance);let lo=0,hi=points.length-1;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(points[mid].d<d)lo=mid;else hi=mid;}
 const a=points[lo],b=points[hi],u=(d-a.d)/Math.max(1e-9,b.d-a.d);return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u};
}
export function leadDistance(base,runner={}){return base>0&&base<4?clamp(runner.lead??[0,3.4,3.6,2.7][base],0,5):0;}
export function leadPosition(base,runner){return routePoint(runningRoute(base),leadDistance(base,runner));}
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
// Spread the turn cost over six metres; no stop or sharp pivot at the bag.
export function elapsedAt(r,d){
 const offset=r.returnAt!=null?0:r.lead;
 return runningTime(Math.max(0,d-offset),r.speed)+Object.entries(r.route.bags).reduce((sum,[b,at])=>sum+(+b>r.from&&+b<4?.2*smooth((d-at+3)/6):0),0);
}
export function runnerArrival(r,to){return to===r.from?r.returnEnd??r.start:r.start+elapsedAt(r,r.route.bags[to]);}
export function runnerPosition(r,t){
 let distance=r.lead;
 if(r.returnAt!=null){const time=clamp(t-r.returnAt,0,r.returnEnd-r.returnAt),ramp=r.speed/RUN_ACCELERATION,travel=time<ramp?.5*RUN_ACCELERATION*time*time:r.speed*(time-ramp/2);distance=Math.max(0,r.lead-travel);}
 if(t>=r.start&&r.to>r.from){const elapsed=Math.max(0,Math.min(t,r.outAt??Infinity)-r.start);let lo=r.returnAt!=null?0:r.lead,hi=r.route.bags[r.to];for(let n=0;n<20;n++){const mid=(lo+hi)/2;if(elapsedAt(r,mid)<elapsed)lo=mid;else hi=mid;}distance=(lo+hi)/2;}
 return {id:r.id,name:r.name,...routePoint(r.route,distance),base:r.from,vis:!(r.outAt!=null&&t>r.outAt+.5)&&!(r.to===4&&t>r.arrival+.2)};
}
