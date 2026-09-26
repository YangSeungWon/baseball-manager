import { BATTING_ZONE as ZONE } from './batting-space.js';
import { BATTING } from './batting-tuning.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Contact proxy shared with the visible aiming ring, in field coordinates.
// It determines the strike, never a random hit/out result.
// `cut` 은 걷어내는 스윙, `guess` 는 노린 구종의 적중 여부('hit'·'miss'·null)다.
export function battingContact({aim,pitch,timing,power=.5,batter={},cut=false,guess=null}){
  const C=BATTING.manualContact,W=BATTING.swingWindow;
  const seconds=(timing-(W.from+W.to)/2)*BATTING.playerInput.timingTolerance*2/(W.to-W.from);
  const dx=aim.x-pitch.x,dz=aim.z-pitch.z;
  // A contact swing brings a larger barrel and forgives more time; a power swing narrows both.
  const drive=clamp(power,0,1),mix=(a,b)=>a+(b-a)*drive;
  const barrel=cut?C.swing.cut.barrel:mix(C.swing.contact.barrel,C.swing.power.barrel);
  // 노린 구종이 오면 공이 느리게 느껴진다 — 타이밍 허용 폭이 넓어진다.
  const window=(cut?C.swing.cut.window:mix(C.swing.contact.window,C.swing.power.window))
    *(guess==='hit'?C.guessWindow:guess==='miss'?C.guessMissWindow:1);
  // 배트는 수평 막대다. 위아래로는 배트 굵기+공 만큼만 허용하고, 길이 방향으로는 막대 전체가 닿는다.
  const dxm=dx*ZONE.halfWidth,dzm=dz*ZONE.halfHeight;
  const thickness=(C.batRadius+C.ballRadius)*barrel,span=C.batSpan*barrel,sweet=C.sweetSpan*barrel;
  const distance=Math.hypot(dxm,dzm),temporal=Math.abs(seconds)/(C.contactSeconds*window);
  const spatial=Math.hypot(dxm/span,dzm/thickness);
  // 타구의 질은 배트 중심에서 얼마나 벗어났느냐로 본다. 끝이나 손잡이 쪽은 닿아도 힘이 실리지 않는다.
  const offCenter=Math.hypot(dxm/sweet,dzm/thickness);
  const overlap=Math.hypot(spatial,temporal),quality=clamp(1-offCenter*offCenter-temporal*temporal,0,1);
  // 타구 방향은 우타 기준으로 세운 뒤 좌타에서 좌우를 뒤집는다(-x 가 좌익수 쪽 · 우타의 당기는 쪽).
  // 코스(pitch.x)와 조준(dx) 항은 좌우 대칭이라 그대로 두고, 타이밍 항만 타석 방향을 따른다.
  const hand=(batter.bats||batter.hand)==='L'?-1:1;
  const timingAngle=hand*seconds/C.contactSeconds*C.timingSpray;
  let angle=clamp(timingAngle+dx*C.aimSpray+pitch.x*C.pitchSpray,-100,100);
  let launch=clamp(C.launchBase+power*C.launchPower-dz*C.verticalLaunch-pitch.z*C.pitchLift,-12,65);
  // 타이밍은 맞았는데 배트 중심을 위아래로 벗어나 깎여맞은 공. 앞으로 뻗지 못한다.
  // 배트가 공 아래를 스치면 뒤(백네트)로 넘어가고, 위를 덮으면 땅에 꽂힌다.
  const vertical=Math.abs(dzm)/thickness;
  const tipped=vertical>=C.tipFrom&&Math.abs(timingAngle)<=C.tipTiming,under=dz<0;
  if(tipped){
    if(under)angle=clamp(Math.sign(angle||pitch.x||1)*C.tipBackAngle,-180,180);
    launch=under?C.tipBackLaunch:C.tipDownLaunch;
  }
  // 배트 중심 바깥, 즉 끝이나 손잡이에 맞은 공. 끝이면 반대쪽으로 흘리고 손잡이면 타석 쪽으로 감긴다.
  const offBarrel=!tipped&&Math.abs(dxm)>sweet;
  if(offBarrel)angle=clamp(angle+Math.sign(dxm)*C.barrelFoul,-180,180);
  const reach=1/(1+C.chaseReach*Math.hypot(Math.max(0,Math.abs(pitch.x)-1),Math.max(0,Math.abs(pitch.z)-1)));
  const strength=clamp(1+(batter.power||0)*C.powerAbility,.8,1.2)*reach;
  const speed=(C.speedBase+C.speedRange*quality)*(1-C.powerSwing+power*C.powerSwing)*strength;
  let kind,reason;
  if(overlap>=1){kind='miss';reason=temporal>=1?'timing':spatial>=1?'aim':'edge';}
  else if(tipped){kind='foul';reason='contact';}
  else if(offBarrel){kind='foul';reason='barrel';}
  else if(Math.abs(angle)>=45){kind='foul';reason='timing';}
  else if(cut){kind='foul';reason='cut';}
  else {kind=quality>=C.solidQuality?'solid':'weak';reason=kind==='solid'?'center':'edge';}
  const label=kind==='miss'?(reason==='timing'?(seconds<0?'배트가 먼저 지나감':'공이 먼저 지나감'):reason==='aim'?'배트가 코스를 벗어남':'배트 끝에 닿지 않음'):kind==='foul'?(reason==='cut'?'걷어낸 파울':tipped?'깎여 맞은 파울':reason==='barrel'?(Math.sign(dxm)===hand?'배트 끝에 맞은 파울':'손잡이 쪽에 맞은 파울'):'비껴 맞은 파울'):kind==='solid'?'정타':'빗맞음';
  // 파울 방향은 타자에게 주는 정보다. 타석 쪽으로 감기면 당겨 친 것(빠름), 반대쪽으로 흐르면 밀린 것(늦음).
  // gap 은 공을 기준으로 배트 중심이 어디에 있었는지(m). 화면이 컨택 포인트를 그릴 때 쓴다.
  return {kind,reason,label,quality,distance,seconds,speed:(tipped?C.tipSpeed:cut?C.cutSpeed:1)*speed,launch,angle,hand,timingAngle,tipped,cut,guess,
    gap:{x:dxm,z:dzm},bat:{span,sweet,thickness},pull:hand*angle<0};
}
