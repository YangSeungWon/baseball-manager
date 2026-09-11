import {resolveRunning} from './base-running.js';
import {fence,parkDims} from './core/bip.js';
import {BATTING} from './batting-tuning.js';
export const FIELD_POSITIONS={P:[0,18.44],C:[0,-1.6],'1B':[24,25],'2B':[13,38],SS:[-13,38],'3B':[-24,25],LF:[-45,75],CF:[0,95],RF:[45,75]};
const dt=1/30,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// One deterministic trace is used both for adjudication and replay. No outcome input.
export function simulateField({speed=40,launch=25,angle=0,positions=FIELD_POSITIONS,runSpeed=7.2,reaction=.35,park=null,bases,batter,outs,defense}={}){
 const dims=parkDims(park),wallHeight=dims.real?.fH||3,rad=Math.PI/180,a=angle*rad,l=launch*rad;
 let x=0,y=0,z=1,vx=Math.sin(a)*Math.cos(l)*speed,vy=Math.cos(a)*Math.cos(l)*speed,vz=Math.sin(l)*speed,bounced=false,wall=false;
 const path=[{t:0,x,y,z,bounced,wall}],events=[];
 for(let i=1;i<=420;i++){
  const t=i*dt,v=Math.hypot(vx,vy,vz);vx*=1-.003*v*dt;vy*=1-.003*v*dt;vz-=9.81*dt;
  x+=vx*dt;y+=vy*dt;z+=vz*dt;
  const r=Math.hypot(x,y),boundary=fence(Math.atan2(x,y)/rad,dims);
  if(r>=boundary){
   if(z>wallHeight){path.push({t,x,y,z,bounced,wall});events.push({type:bounced?'ground-rule-double':'home-run',t,x,y,z});break;}
   const nx=x/r,ny=y/r,dot=vx*nx+vy*ny;x=nx*(boundary-.12);y=ny*(boundary-.12);vx-=1.5*dot*nx;vy-=1.5*dot*ny;
   if(!wall)events.push({type:'wall',t,x,y,z});wall=true;
  }
  if(z<=.12){z=.12;if(!bounced)events.push({type:'bounce',t,x,y,z});bounced=true;vz=Math.abs(vz)>.8?-vz*.3:0;const h=Math.hypot(vx,vy),k=Math.max(0,1-3.5*dt/Math.max(.1,h));vx*=k;vy*=k;}
  path.push({t,x,y,z,bounced,wall});
 }
 const defenders=Object.entries(positions).filter(()=>true).map(([pos,p])=>{
  const velocity=defense?.[pos]?.speed??runSpeed*(pos==='P'?.8:1),delay=defense?.[pos]?.reaction??reaction+(pos==='P'?.2:0);
  const target={...(path.find(b=>b.t>=delay&&b.z<=2.5&&Math.hypot(b.x-p[0],b.y-p[1])<=velocity*(b.t-delay)+.45)||path.at(-1))};
  const radius=Math.hypot(target.x,target.y),limit=fence(Math.atan2(target.x,target.y)/rad,dims)-.3;if(radius>limit){target.x*=limit/radius;target.y*=limit/radius;}
  return {pos,x:p[0],y:p[1],velocity,delay,target};
 });
 const primary=[...defenders].sort((a,b)=>a.target.t-b.target.t)[0];
 for(const f of defenders)if(f!==primary)f.target={x:f.x,y:f.y};
 const frames=[];let outcome=null,handler=null,endTime=path.at(-1).t;
 for(const b of path){
  for(const f of defenders){if(b.t<f.delay)continue;const dx=f.target.x-f.x,dy=f.target.y-f.y,d=Math.hypot(dx,dy),step=Math.min(d,f.velocity*Math.min(dt,b.t-f.delay));if(d){f.x+=dx/d*step;f.y+=dy/d*step;}}
  const frame={...b,fielders:defenders.map(f=>({pos:f.pos,x:f.x,y:f.y}))};frames.push(frame);
  const over=events.find(e=>['home-run','ground-rule-double'].includes(e.type)&&e.t===b.t);if(over){outcome=over.type==='home-run'?'HR':'2B';break;}
  const reachable=defenders.filter(f=>b.t>=f.delay&&b.z<=2.5&&Math.hypot(f.x-b.x,f.y-b.y)<=.6).sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y))[0];
  if(reachable){
   handler=reachable.pos;endTime=b.t;
   if(!b.bounced&&!b.wall){outcome='OUT';events.push({type:'catch',t:b.t,x:b.x,y:b.y,z:b.z,fielder:handler});}
   else{
    outcome='LIVE';events.push({type:'pickup',t:b.t,x:b.x,y:b.y,z:b.z,fielder:handler});
   }
   break;
  }
 }
 if(!outcome)outcome='LIVE';
 const end=frames.at(-1);events.splice(0,events.length,...events.filter(e=>e.t<=end.t));
 return resolveRunning({result:outcome,speed,launch,angle,frames,events,handler,duration:end.t},{bases,batter,outs,defenseSpeed:runSpeed,defense});
}
export function contactFlight(roll,{power=false,bonus=0,qualityScale=1,angleShift=0,park=null,bases,batter,outs,defense}={}){
 const F=BATTING.bip.flight,quality=clamp((1-roll[4])*F.qualityRoll+bonus+(power?F.powerQuality:0),0,1)*clamp(qualityScale,0,1);
 return simulateField({speed:F.speedBase+quality*F.speedRange,launch:F.launchBase+roll[5]*F.launchRange+(power?F.launchPower:0),angle:clamp((roll[7]-.5)*F.angleRange+angleShift,-F.angleClamp,F.angleClamp),park,bases,batter,outs,defense});
}
export function sampleField(play,t){
 const frames=play.frames;let lo=0,hi=frames.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(frames[mid].t<=t)lo=mid;else hi=mid-1;}
 const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],u=clamp((t-a.t)/Math.max(1e-9,b.t-a.t),0,1);
 return {...a,x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u,runners:a.runners?.map((r,j)=>({...r,x:r.x+((b.runners?.[j]?.x??r.x)-r.x)*u,y:r.y+((b.runners?.[j]?.y??r.y)-r.y)*u})),fielders:a.fielders.map((f,j)=>({...f,x:f.x+(b.fielders[j].x-f.x)*u,y:f.y+(b.fielders[j].y-f.y)*u}))};
}
