// 타자 편 · 투수 편 밸런스 시트. 미니게임의 모든 조정값은 여기서만 읽는다.
// 컨택은 로그오즈 가산 모델이다(core/pa.js 와 같은 규약, proto/DESIGN_BATTING.md 참조).
// 설계 원칙: 실행(존 판단·타이밍)은 준비(구종·코스 예측)를 구할 수 있지만, 준비는 실행을 대신할 수 없다.
import {logit,invLogit} from './core/pa.js';

export const BATTING={
  // 평균 타자(컨택 .72)가 존 안 공을 자동 스윙으로 칠 때 배트에 맞을 확률(파울 포함)의 기준선.
  baseline:{contactLogit:logit(.78),floor:.10,ceil:.98},
  // 타자 컨택 .05 차이 = 로그오즈 .30.
  ability:{contactPerPoint:6.0,referenceContact:.72},
  // 준비 층. 숨은 가산은 작게 두고, 예측 성공의 진짜 보상은 read.reward(읽기 창)로 준다. 실패 벌점은 타이밍 적중보다 작다.
  preparation:{typeHit:.40,typeMiss:-.35,locationHit:.45,locationMiss:-.45,powerSwing:-.80},
  // 조준. 당긴 채 드래그한 배트 높이·안팎과 실제 공의 거리(존 단위)로 컨택과 타구 질이 정해진다. 예측 대신 실행이다.
  aim:{radius:1.4,contactHit:.9,contactMiss:-2.6,quality:.10,qualityMiss:.70,spray:14},   // 반지름 밖(한 존 반)이면 배트가 공을 못 만난다
  // 실행 층. 존 밖 스윙(chase)은 가장 큰 벌점으로 남긴다.
  execution:{
    chase:-1.60,
    timing:{auto:-.20,sweet:.95,earlyMax:-.90,lateMax:-1.00,whiffBeyond:.6},   // 적중 구간에서 이만큼 벗어나면 배트가 공을 지나친다: 헛스윙 확정
    // 스윙 버튼을 누른 길이(ms)가 힘이다. contactMs 까지는 컨택, powerMs 부터 장타. 사이는 연속.
    hold:{contactMs:110,powerMs:420},
    foul:{contactApproach:.32,powerApproach:.20,sweet:-.05,earlyMax:.16,lateMax:.16},
    quality:{sweet:.08,earlyMax:-.18,lateMax:-.22},
    angle:{earlyMax:-28,lateMax:24},
  },
  // 2.5초 읽기 창에서 스윙을 누른 비율(0..1)이 이 구간이면 타이밍 적중.
  swingWindow:{from:.55,to:.85},
  // 타구(ball in play). 확률이 아니라 타구 질 배율과 가산치. base 는 타자 편 전용 타구 질 오프셋(투수 편과 분리).
  bip:{
    qualityScale:{contactApproach:.92,locationMiss:.78,typeMiss:.90,outOfZone:.72},
    bonus:{base:-.12,locationRead:.06,typeMatch:.05,outOfZone:-.12},
    flight:{qualityRoll:.85,powerQuality:.15,speedBase:26,speedRange:28,launchBase:6,launchRange:43,launchPower:7,angleRange:80,angleClamp:45},
  },
  // 상대 투수의 투구 생성. 플레이어의 선택은 절대 읽지 않는다.
  delivery:{breakingSplit:.58,zoneBase:.64,zoneThreeBalls:.17,zoneTwoStrikes:-.20,zoneClamp:[.2,.88],xInZone:.6,xOutZone:1.6,zThirds:[-.7,0,.65],zOutZone:-1.5,speedJitter:4},
  // 읽기 창. 시력이 창을 일찍 열고 늦게 닫으며, 선구안이 체크스윙 한계를 늦춘다.
  read:{visionClamp:[.4,.92],disciplineClamp:[.35,.85],fromBase:.34,fromVision:-.17,toBase:.48,toVision:.24,takeBase:.48,takeDiscipline:.42,onsetBase:.43,onsetVision:-.26,windowMs:2500,
    // 예측 적중 보상(창 비율). 구종 적중은 창을 일찍 열고 선명하게, 코스 적중은 창을 늘리고 적중 구간을 넓힌다.
    reward:{typeFrom:-.06,typeOnset:-.10,typeSweetFrom:-.05,locationFrom:-.04,locationTo:.04,locationSweetTo:.05}},
  // 9이닝 상대 투수의 문법. 규칙 수, 불펜 교체 이닝, 규칙을 바꾸게 만드는 피안타 수.
  grammar:{rulesPerArm:4,bullpenInning:7,hitsToAdjust:2},
  // 반사실 비교의 가치 함수(타자 관점).
  worth:{run:3,onBase:2,out:-3,ball:.5,strike:-.5,verdictGap:.25},
};

// 투수 편(플레이어가 던지고 AI 타자가 치는 쪽). 값은 확률 가산 그대로, 동작 불변.
export const PITCHING={
  strikeAttack:.80,strikeChase:.20,offSpeedZone:-.06,lowZone:-.04,fatiguePerPitch:.009,fatigueFrom:15,strikeClamp:[.07,.9],
  swingInZone:.73,swingPerStrike:.05,chaseTwoStrikes:.13,chaseThreeBalls:-.10,
  fooledChangeAfterFast:.13,fooledSliderAway:.08,
  contactInZone:.03,contactOutZone:-.19,contactRepeat:.09,contactClamp:[.22,.94],
  foul:.30,bonusRepeat:.06,bonusFooled:-.25,bonusOutZone:-.1,
};

export const contactProbability=terms=>{
  const x=terms.reduce((a,b)=>a+(b||0),0);
  return Math.max(BATTING.baseline.floor,Math.min(BATTING.baseline.ceil,invLogit(x)));
};
