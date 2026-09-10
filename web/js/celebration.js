const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const CELEBRATION_DURATION=4.2;
// Presentation only: runners retain the authoritative field-play positions/times.
export function flippedBat(origin,time){
 const u=clamp(time/1.1,0,1);
 return {x:origin.x-2.8*u,y:origin.y-1.8*u,z:.08+1.25*(1-u)+2.2*4*u*(1-u),spin:u*Math.PI*4+Math.PI/2};
}
export function celebrationPlayers(time,hero){
 const players=[{name:hero,x:0,y:0,pose:'celebrate',phase:time,hero:true}];
 for(let i=0;i<5;i++){
  const angle=-Math.PI*.85+(i/4)*Math.PI*.7,target={x:Math.sin(angle)*2.1,y:Math.cos(angle)*2.1};
  const start={x:-8-i*.6,y:-4+i*.8},u=clamp((time-i*.12)/2.5,0,1);
  players.push({x:start.x+(target.x-start.x)*u,y:start.y+(target.y-start.y)*u,pose:u<1?'runCelebrate':i%2?'clap':'celebrate',phase:Math.max(0,time-2.5-i*.12),watch:{x:0,y:0,z:1.5}});
 }
 return players;
}
