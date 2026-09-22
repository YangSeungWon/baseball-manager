import { BATTING_ZONE as ZONE } from './batting-space.js';
import { BATTING } from './batting-tuning.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Contact proxy shared with the visible aiming ring, in field coordinates.
// It determines the strike, never a random hit/out result.
export function battingContact({aim,pitch,timing,power=.5,batter={}}){
  const C=BATTING.manualContact,W=BATTING.swingWindow;
  const seconds=(timing-(W.from+W.to)/2)*BATTING.playerInput.timingTolerance*2/(W.to-W.from);
  const dx=aim.x-pitch.x,dz=aim.z-pitch.z;
  // A contact swing brings a larger barrel and forgives more time; a power swing narrows both.
  const drive=clamp(power,0,1),mix=(a,b)=>a+(b-a)*drive,barrel=mix(C.swing.contact.barrel,C.swing.power.barrel),window=mix(C.swing.contact.window,C.swing.power.window);
  const distance=Math.hypot(dx*ZONE.halfWidth,dz*ZONE.halfHeight),spatial=distance/((C.batRadius+C.ballRadius)*barrel),temporal=Math.abs(seconds)/(C.contactSeconds*window);
  const overlap=Math.hypot(spatial,temporal),quality=clamp(1-overlap*overlap,0,1);
  // 타구 방향은 우타 기준으로 세운 뒤 좌타에서 좌우를 뒤집는다(-x 가 좌익수 쪽 · 우타의 당기는 쪽).
  // 코스(pitch.x)와 조준(dx) 항은 좌우 대칭이라 그대로 두고, 타이밍 항만 타석 방향을 따른다.
  const hand=(batter.bats||batter.hand)==='L'?-1:1;
  const timingAngle=hand*seconds/C.contactSeconds*C.timingSpray;
  let angle=clamp(timingAngle+dx*C.aimSpray+pitch.x*C.pitchSpray,-100,100);
  let launch=clamp(C.launchBase+power*C.launchPower-dz*C.verticalLaunch-pitch.z*C.pitchLift,-12,65);
  // 타이밍은 맞았는데 배트 중심을 위아래로 벗어나 깎여맞은 공. 앞으로 뻗지 못한다.
  // 배트가 공 아래를 스치면 뒤(백네트)로 넘어가고, 위를 덮으면 땅에 꽂힌다.
  const vertical=Math.abs(dz*ZONE.halfHeight)/((C.batRadius+C.ballRadius)*barrel);
  const tipped=vertical>=C.tipFrom&&Math.abs(timingAngle)<=C.tipTiming,under=dz<0;
  if(tipped){
    if(under)angle=clamp(Math.sign(angle||pitch.x||1)*C.tipBackAngle,-180,180);
    launch=under?C.tipBackLaunch:C.tipDownLaunch;
  }
  const reach=1/(1+C.chaseReach*Math.hypot(Math.max(0,Math.abs(pitch.x)-1),Math.max(0,Math.abs(pitch.z)-1)));
  const strength=clamp(1+(batter.power||0)*C.powerAbility,.8,1.2)*reach;
  const speed=(C.speedBase+C.speedRange*quality)*(1-C.powerSwing+power*C.powerSwing)*strength;
  let kind,reason;
  if(overlap>=1){kind='miss';reason=temporal>=1?'timing':spatial>=1?'aim':'edge';}
  else if(tipped){kind='foul';reason='contact';}
  else if(Math.abs(angle)>=45){kind='foul';reason='timing';}
  else {kind=quality>=C.solidQuality?'solid':'weak';reason=kind==='solid'?'center':'edge';}
  const label=kind==='miss'?(reason==='timing'?(seconds<0?'배트가 먼저 지나감':'공이 먼저 지나감'):reason==='aim'?'배트가 코스를 벗어남':'배트 끝에 닿지 않음'):kind==='foul'?(tipped?'깎여 맞은 파울':'비껴 맞은 파울'):kind==='solid'?'정타':'빗맞음';
  // 파울 방향은 타자에게 주는 정보다. 타석 쪽으로 감기면 당겨 친 것(빠름), 반대쪽으로 흐르면 밀린 것(늦음).
  return {kind,reason,label,quality,distance,seconds,speed:tipped?speed*C.tipSpeed:speed,launch,angle,hand,timingAngle,tipped,pull:hand*angle<0};
}
