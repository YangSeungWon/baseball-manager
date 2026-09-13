import { BATTING } from './batting-tuning.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Contact proxy shared with the visible aiming ring, in field coordinates.
// It determines the strike, never a random hit/out result.
export function battingContact({aim,pitch,timing,power=.5,batter={}}){
  const C=BATTING.manualContact,W=BATTING.swingWindow;
  const seconds=(timing-(W.from+W.to)/2)*BATTING.playerInput.timingTolerance*2/(W.to-W.from);
  const dx=aim.x-pitch.x,dz=aim.z-pitch.z;
  const distance=Math.hypot(dx*.216,dz*.26),spatial=distance/(C.batRadius+C.ballRadius),temporal=Math.abs(seconds)/C.contactSeconds;
  const overlap=Math.hypot(spatial,temporal),quality=clamp(1-overlap*overlap,0,1);
  const angle=clamp(seconds/C.contactSeconds*C.timingSpray+dx*C.aimSpray+pitch.x*C.pitchSpray,-100,100);
  const launch=clamp(C.launchBase+power*C.launchPower-dz*C.verticalLaunch-pitch.z*C.pitchLift,-12,65);
  const reach=1/(1+C.chaseReach*Math.hypot(Math.max(0,Math.abs(pitch.x)-1),Math.max(0,Math.abs(pitch.z)-1)));
  const strength=clamp(1+(batter.power||0)*C.powerAbility,.8,1.2)*reach;
  const speed=(C.speedBase+C.speedRange*quality)*(1-C.powerSwing+power*C.powerSwing)*strength;
  let kind,reason;
  if(overlap>=1){kind='miss';reason=temporal>=1?'timing':spatial>=1?'aim':'edge';}
  else if(Math.abs(angle)>=45){kind='foul';reason='timing';}
  else {kind=quality>=C.solidQuality?'solid':'weak';reason=kind==='solid'?'center':'edge';}
  const label=kind==='miss'?(reason==='timing'?(seconds<0?'배트가 먼저 지나감':'공이 먼저 지나감'):reason==='aim'?'배트가 코스를 벗어남':'배트 끝에 닿지 않음'):kind==='foul'?'비껴 맞은 파울':kind==='solid'?'정타':'빗맞음';
  return {kind,reason,label,quality,distance,seconds,speed,launch,angle};
}
