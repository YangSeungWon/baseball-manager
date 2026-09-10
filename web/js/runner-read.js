// Read only the observed flight and current fielders, never the eventual result.
export function commitOnFlight(frames,defense,defaultSpeed=7.2){
 for(let i=1;i<frames.length;i++){
  const b=frames[i],a=frames[i-1],dt=b.t-a.t;
  if(b.t<.45||dt<=0)continue;
  if(b.bounced||b.wall)return b.t+.18;
  let x=b.x,y=b.y,z=b.z,vx=(b.x-a.x)/dt,vy=(b.y-a.y)/dt,vz=(b.z-a.z)/dt;
  let reachable=false,remaining=0;
  // Forecast the remaining airborne path from its observed velocity.
  for(let t=.05;t<=7;t+=.05){
   const drag=Math.max(0,1-.003*Math.hypot(vx,vy,vz)*.05);vx*=drag;vy*=drag;vz-=9.81*.05;x+=vx*.05;y+=vy*.05;z+=vz*.05;remaining=t;
   if(z<=2.8&&b.fielders.some(f=>Math.hypot(x-f.x,y-f.y)<=(defense?.[f.pos]?.speed??defaultSpeed)*(t+.2)+1.5)){reachable=true;break;}
   if(z<=.12)break;
  }
  if(!reachable&&remaining>.2)return b.t+.18;
 }
 return null;
}
