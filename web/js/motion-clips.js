// 손으로 짠 키프레임 동작. 절차적 사인 함수 대신 시간축 위의 자세 키를 보간한다.
// 축은 live3d.updatePlayer 가 쓰는 뼈 회전과 같다:
//   leg.x < 0 다리를 앞으로 든다 · knee.x > 0 무릎을 굽힌다 · arm.x < 0 팔을 앞/위로 · arm.z 는 옆으로(왼팔 −, 오른팔 +)
//   elbow.x < 0 팔꿈치를 굽힌다 · hips.y / spine.y 회전(우투·우타 기준) · body.x > 0 앞으로 숙임 · bat 은 루트 공간의 배트 방향 벡터
const TRACKS=['legL','legR','kneeL','kneeR','footL','footR','armL','armR','elbowL','elbowR','handL','handR','hips','spine','head','bodyRot','bodyPos','bat'];
const smooth=u=>u*u*(3-2*u);
const key=(t,pose)=>({t,pose});

// 우투수. 0 세트 → .2 다리 최고점 → .42 스트라이드·코킹 → .58 팔 최고점 → .68 릴리스 → .85 팔로스루 → 1 회복.
export const PITCH={keys:[
  key(0,  {legL:[0,0,0],legR:[0,0,0],kneeL:[.18,0,0],kneeR:[.18,0,0],armL:[-.65,0,-.15],elbowL:[-1.35,0,0],armR:[-.55,0,.15],elbowR:[-1.25,0,0],hips:[0,0,0],spine:[0,0,0],bodyRot:[.02,0,0],bodyPos:[0,0,0]}),
  key(.2, {legL:[-1.35,0,.05],kneeL:[1.95,0,0],legR:[.05,0,0],kneeR:[.28,0,0],armL:[-.95,0,-.2],elbowL:[-1.45,0,0],armR:[-.85,0,.2],elbowR:[-1.4,0,0],hips:[0,.12,0],spine:[0,.22,0],bodyRot:[-.10,0,-.04],bodyPos:[0,-.03,-.03]}),
  key(.42,{legL:[-.9,0,.1],kneeL:[.45,0,0],legR:[.3,0,0],kneeR:[.42,0,0],armL:[-1.45,0,-.3],elbowL:[-.25,0,0],armR:[.55,0,1.05],elbowR:[-1.75,0,0],hips:[0,.28,0],spine:[0,.55,0],bodyRot:[.04,0,.02],bodyPos:[0,-.06,.10]}),
  key(.58,{legL:[-.6,0,.1],kneeL:[.55,0,0],legR:[.5,0,0],kneeR:[.5,0,0],armL:[-.7,0,-.25],elbowL:[-1.2,0,0],armR:[-.9,0,1.35],elbowR:[-1.15,0,0],hips:[0,.05,0],spine:[0,.15,0],bodyRot:[.16,0,.06],bodyPos:[0,-.07,.18]}),
  key(.68,{legL:[-.5,0,.08],kneeL:[.75,0,0],legR:[.6,0,0],kneeR:[.55,0,0],armL:[-.35,0,-.15],elbowL:[-1.5,0,0],armR:[-1.7,0,.45],elbowR:[-.15,0,0],hips:[0,-.25,0],spine:[0,-.35,0],bodyRot:[.38,0,.10],bodyPos:[0,-.10,.24]}),
  key(.85,{legL:[-.4,0,.06],kneeL:[.6,0,0],legR:[-.55,0,0],kneeR:[1.05,0,0],armL:[-.2,0,-.1],elbowL:[-1.3,0,0],armR:[-.5,0,-.35],elbowR:[-.55,0,0],hips:[0,-.4,0],spine:[0,-.55,0],bodyRot:[.52,0,.08],bodyPos:[0,-.12,.28]}),
  key(1,  {legL:[-.15,0,.04],kneeL:[.3,0,0],legR:[-.25,0,0],kneeR:[.5,0,0],armL:[-.35,0,-.15],elbowL:[-1.1,0,0],armR:[-.25,0,-.1],elbowR:[-.8,0,0],hips:[0,-.2,0],spine:[0,-.25,0],bodyRot:[.22,0,.03],bodyPos:[0,-.06,.24]}),
]};

// 우타자. 0 준비 → .25 로드 → .48 스트라이드 → .62 컨택 → .82 팔로스루 → 1 마무리.
// armR 은 뒤쪽(위) 손, armL 은 앞쪽(아래) 손. 앞손은 IK 로 배트 그립을 잡는다.
export const SWING={keys:[
  // bat: 그립에서 배트 끝으로 가는 방향(루트 공간). 우타 기준 +x 가 뒤쪽(포수), −x 가 투수 쪽, +z 가 가슴 앞(홈플레이트), +y 위.
  key(0,  {legL:[-.15,0,0],legR:[-.15,0,0],kneeL:[.38,0,0],kneeR:[.42,0,0],armR:[-.55,0,.85],elbowR:[-2.0,0,0],armL:[-.7,0,-.5],elbowL:[-1.6,0,0],hips:[0,-.05,0],spine:[0,-.42,0],bodyRot:[.07,0,0],bodyPos:[0,-.045,0],bat:[.35,.9,-.3]}),
  key(.25,{legL:[-.05,0,0],legR:[-.2,0,0],kneeL:[.3,0,0],kneeR:[.5,0,0],armR:[-.4,0,1.0],elbowR:[-2.15,0,0],armL:[-.55,0,-.55],elbowL:[-1.7,0,0],hips:[0,-.15,0],spine:[0,-.55,0],bodyRot:[.09,0,-.02],bodyPos:[.02,-.05,0],bat:[.55,.8,-.35]}),
  key(.48,{legL:[-.38,0,.08],legR:[-.1,0,0],kneeL:[.32,0,0],kneeR:[.62,0,0],armR:[-.7,0,.7],elbowR:[-1.5,0,0],armL:[-.9,0,-.35],elbowL:[-1.1,0,0],hips:[0,.2,0],spine:[0,-.05,0],bodyRot:[.1,0,-.03],bodyPos:[-.02,-.05,0],bat:[.85,.3,.1]}),
  key(.62,{legL:[-.3,0,.1],legR:[0,0,0],kneeL:[.12,0,0],kneeR:[.7,0,0],armR:[-1.25,0,.1],elbowR:[-.35,0,0],armL:[-1.3,0,-.15],elbowL:[-.2,0,0],hips:[0,.5,0],spine:[0,.55,0],bodyRot:[.12,0,-.04],bodyPos:[-.05,-.055,0],bat:[-.6,0,.8]}),
  key(.82,{legL:[-.25,0,.1],legR:[.05,0,0],kneeL:[.1,0,0],kneeR:[.85,0,0],armR:[-1.0,0,-.6],elbowR:[-.9,0,0],armL:[-.95,0,-.55],elbowL:[-1.1,0,0],hips:[0,.65,0],spine:[0,.85,0],bodyRot:[.05,0,-.05],bodyPos:[-.06,-.05,0],bat:[-.9,.35,-.25]}),
  key(1,  {legL:[-.2,0,.1],legR:[.1,0,0],kneeL:[.12,0,0],kneeR:[.9,0,0],armR:[-.55,0,-.9],elbowR:[-1.4,0,0],armL:[-.55,0,-.8],elbowL:[-1.55,0,0],hips:[0,.7,0],spine:[0,.95,0],bodyRot:[0,0,-.06],bodyPos:[-.06,-.045,0],bat:[-.45,.75,-.5]}),
]};

// 클립을 시간 t(0..1)에서 샘플링. 키 사이는 smoothstep 으로 잇는다. 없는 트랙은 0.
export function sample(clip,t){
  const keys=clip.keys,out={};t=Math.max(0,Math.min(1,t));
  let i=0;while(i<keys.length-2&&t>keys[i+1].t)i++;
  const a=keys[i],b=keys[Math.min(keys.length-1,i+1)],u=a===b?0:smooth((t-a.t)/Math.max(1e-6,b.t-a.t));
  for(const name of TRACKS){
    const pa=a.pose[name]||[0,0,0],pb=b.pose[name]||[0,0,0];
    if(!(name in a.pose)&&!(name in b.pose))continue;
    out[name]=[pa[0]+(pb[0]-pa[0])*u,pa[1]+(pb[1]-pa[1])*u,pa[2]+(pb[2]-pa[2])*u];
  }
  return out;
}
// 샘플 결과를 선수 리그에 적용한다. 배트 각도는 호출자가 손 IK 뒤에 처리한다.
export function applyPose(p,pose,mirror=1){
  const set=(obj,v,mirrorY=false)=>{if(!obj||!v)return;obj.rotation.set(v[0],mirrorY?v[1]*mirror:v[1],mirrorY?v[2]*mirror:v[2]);};
  set(p.legs[0],pose.legL,true);set(p.legs[1],pose.legR,true);set(p.knees[0],pose.kneeL);set(p.knees[1],pose.kneeR);
  set(p.feet[0],pose.footL,true);set(p.feet[1],pose.footR,true);
  set(p.arms[0],pose.armL,true);set(p.arms[1],pose.armR,true);set(p.elbows[0],pose.elbowL);set(p.elbows[1],pose.elbowR);
  set(p.hips,pose.hips,true);set(p.spine,pose.spine,true);
  if(pose.bodyRot)p.body.rotation.set(pose.bodyRot[0],pose.bodyRot[1]*mirror,pose.bodyRot[2]*mirror);
  if(pose.bodyPos)p.body.position.set(pose.bodyPos[0]*mirror,pose.bodyPos[1],pose.bodyPos[2]);
}
