// 타자 편 · 투수 편 밸런스 시트. 미니게임의 모든 조정값은 여기서만 읽는다.
// 컨택은 로그오즈 가산 모델이다(core/pa.js 와 같은 규약, proto/DESIGN_BATTING.md 참조).
// 설계 원칙: 실행(존 판단·타이밍)은 준비(구종·코스 예측)를 구할 수 있지만, 준비는 실행을 대신할 수 없다.
import {logit,invLogit} from './core/pa.js';

export const BATTING={
  // 배트는 점이 아니라 수평 막대다. 위아래(batRadius+ballRadius)로 벗어나면 헛스윙이지만,
  // 길이 방향으로는 batSpan 안이면 배트 어디엔가 닿는다. sweetSpan 안이 정타가 나오는 구간이고
  // 그 바깥은 배트 끝이나 손잡이에 맞은 파울이다(barrelFoul 도 만큼 그쪽으로 감기거나 밀린다).
  manualContact:{batRadius:.125,ballRadius:.12,batSpan:.36,sweetSpan:.16,barrelFoul:38,contactSeconds:.10,solidQuality:.72,
    // 공 정중앙을 때리면 낮은 라인드라이브다. 띄우려면 공 밑을 노려야 하고, 그만큼 배트 중심에서 벗어나 품질을 내준다.
    // launchBase 가 높으면 정확한 조준 하나로 최적 발사각이 공짜로 나와 모든 정타가 안타가 된다.
    timingSpray:68,aimSpray:14,pitchSpray:30,launchBase:7,launchPower:6,verticalLaunch:30,pitchLift:6,
    // 깎여맞음: 배트 굵기의 tipFrom 넘게 위아래로 벗어나 스치듯 맞았는데 타이밍 각도는 tipTiming 도 안쪽일 때.
    // 이 값이 낮으면 배트 높이를 맞추지 않은 공이 전부 파울이 된다 — 존 안 높은 공·낮은 공은 빗맞은 타구여야 한다.
    // 배트가 공 아래면 백네트로 넘어가고(tipBackAngle · tipBackLaunch), 위면 땅에 꽂힌다(tipDownLaunch). 타구는 힘을 거의 잃는다.
    tipFrom:.85,tipTiming:26,tipBackAngle:150,tipBackLaunch:62,tipDownLaunch:-18,tipSpeed:.45,
    speedBase:18,speedRange:30,powerSwing:.12,powerAbility:.55,chaseReach:.4,
    // 스윙 종류별 배트 중심 크기와 시간 허용 폭 배율. 힘 .5(자동·이전 입력)는 둘 다 1이다.
    swing:{contact:{barrel:1.15,window:1.2},power:{barrel:.85,window:.8}}},
  playerInput:{contactSeconds:.14,timingTolerance:.055,
    // 투수 릴리스 전에 준비(누르기)를 시작하면 장타 스윙, 릴리스 후면 컨택 스윙. seconds 는 떼고 나서 배트가 접촉 지점에 닿는 시간.
    swings:{contact:{seconds:.11,power:0},power:{seconds:.17,power:1}},
    // 준비 중 참기: 도착 span 초 전부터 배트가 나오기 시작한다. 나온 정도가 callFrom 을 넘으면 스윙 판정 확률이 1까지 오른다. peak 는 반쯤 나온 배트의 최대 스윙 단계.
    check:{span:.2,callFrom:.35,peak:.3}},
  // 평균 타자(컨택 .72)가 존 안 공을 자동 스윙으로 칠 때 배트에 맞을 확률(파울 포함)의 기준선.
  baseline:{contactLogit:logit(.78),floor:.10,ceil:.98},
  // 타자 컨택 .05 차이 = 로그오즈 .30.
  ability:{contactPerPoint:6.0,referenceContact:.72},
  // 준비 층. 숨은 가산은 작게 두고, 예측 성공의 진짜 보상은 read.reward(읽기 창)로 준다. 실패 벌점은 타이밍 적중보다 작다.
  preparation:{typeHit:.40,typeMiss:-.35,locationHit:.45,locationMiss:-.45,powerSwing:-1.2},   // 장타 스윙(힘 1)은 컨택 로그오즈 −1.2: 홈런과 헛스윙을 함께 산다
  // 조준. 홈 앞에서 고른 배트 높이·안팎과 실제 공의 거리(존 단위)로 컨택과 타구 질이 정해진다. 예측 대신 실행이다.
  aim:{radius:1.4,contactHit:.9,contactMiss:-2.6,quality:.10,qualityMiss:.70,spray:14},   // 반지름 밖(한 존 반)이면 배트가 공을 못 만난다
  // 실행 층. 존 밖 스윙(chase)은 가장 큰 벌점으로 남긴다.
  execution:{
    chase:-1.60,
    timing:{auto:-.20,sweet:.95,earlyMax:-.90,lateMax:-1.00,whiffBeyond:.6},   // 적중 구간에서 이만큼 벗어나면 배트가 공을 지나친다: 헛스윙 확정
    // 스윙 버튼을 누른 길이(ms)가 힘이다. contactMs 까지는 컨택, powerMs 부터 장타. 사이는 연속.
    hold:{contactMs:110,powerMs:420},
    foul:{contactApproach:.26,powerApproach:.36,sweet:-.05,earlyMax:.16,lateMax:.16},   // 큰 스윙은 파울도 많다
    quality:{sweet:.08,earlyMax:-.18,lateMax:-.22},
    angle:{earlyMax:-28,lateMax:24},
  },
  // 정규화된 타이밍 판정 구간. 직접 타격은 실제 배트·공 도착 시차를 이 값으로 변환한다.
  swingWindow:{from:.55,to:.85},
  // 타구(ball in play). 확률이 아니라 타구 질 배율과 가산치. base 는 타자 편 전용 타구 질 오프셋(투수 편과 분리).
  bip:{
    qualityScale:{contactApproach:.92,locationMiss:.78,typeMiss:.90,outOfZone:.72},
    // 구종 적중 보상. 타구 질을 전체적으로 내리면 예측이 벌어준 컨택이 약한 타구로 흡수되어
    // "기억이 이득"이 뒤집힌다. 타구 질을 내릴 때는 이 값을 함께 올려야 한다.
    bonus:{base:-.12,locationRead:.06,typeMatch:.09,outOfZone:-.12},
    flight:{qualityRoll:.85,powerQuality:.15,speedBase:26,speedRange:28,launchBase:6,launchRange:43,launchPower:7,angleRange:80,angleClamp:45},
  },
  // 상대 투수의 투구 생성. 플레이어의 선택은 절대 읽지 않는다.
  delivery:{breakingSplit:.58,zoneBase:.64,zoneThreeBalls:.17,zoneTwoStrikes:-.20,zoneClamp:[.2,.88],xInZone:.6,xOutZone:1.6,zThirds:[-.7,0,.65],zOutZone:-1.5,speedJitter:4},
  // 읽기 창. 시력이 창을 일찍 열고 늦게 닫으며, 선구안이 체크스윙 한계를 늦춘다.
  read:{visionClamp:[.4,.92],disciplineClamp:[.35,.85],fromBase:.34,fromVision:-.17,toBase:.48,toVision:.24,takeBase:.48,takeDiscipline:.42,onsetBase:.43,onsetVision:-.26,windowMs:2500,
    // 예측 적중 보상(창 비율). 구종 적중은 창을 일찍 열고 선명하게, 코스 적중은 창을 늘리고 적중 구간을 넓힌다.
    reward:{typeFrom:-.06,typeOnset:-.10,typeSweetFrom:-.05,locationFrom:-.04,locationTo:.04,locationSweetTo:.05}},
  // 9이닝 전용 난이도. 단판 스테이지의 값은 한 타석짜리 클리어율에 맞춘 것이라 27아웃 경기에서는 너무 후하다.
  // 타자(나): 컨택 로그오즈와 타구 질을 내린다. 투수(나): 피로가 55 부터 완만하게 쌓이고, AI 타자는 조금 덜 맞힌다.
  // 주루·송구가 실제 시간으로 바뀌면서(중계 송구, 추월 규칙) 인플레이 타구가 더 살아남는다.
  // 양 팀 득점이 함께 올라 타구 질을 양쪽 모두 내렸다. 이 구간은 가파르다 — .03 이 득점 1점이다.
  fullGame:{contactLogit:-.85,bipBase:-.22,fatigueFrom:55,fatiguePerPitch:.004,aiContact:-.19,aiQuality:-.29},
  // 9이닝 상대 투수의 문법. 규칙 수, 불펜 교체 이닝, 규칙을 바꾸게 만드는 피안타 수.
  grammar:{rulesPerArm:4,bullpenInning:7,hitsToAdjust:2},
  // 반사실 비교의 가치 함수(타자 관점).
  worth:{run:3,onBase:2,out:-3,ball:.5,strike:-.5,verdictGap:.25},
};

// 투수 편(플레이어가 던지고 AI 타자가 치는 쪽). 값은 확률 가산 그대로, 동작 불변.
export const PITCHING={
  strikeAttack:.80,strikeChase:.20,offSpeedZone:-.06,lowZone:-.04,fatiguePerPitch:.009,fatigueFrom:15,strikeClamp:[.07,.9],
  swingInZone:.73,swingPerStrike:.05,chaseTwoStrikes:.13,chaseThreeBalls:-.10,chaseFalloff:1.0,chaseFloor:.08,
  fooledChangeAfterFast:.13,fooledSliderAway:.08,
  contactInZone:.03,contactOutZone:-.19,contactRepeat:.09,contactClamp:[.22,.94],
  foul:.30,bonusRepeat:.06,bonusFooled:-.25,bonusOutZone:-.1,meatContact:.12,meatQuality:.22,
};

export const contactProbability=terms=>{
  const x=terms.reduce((a,b)=>a+(b||0),0);
  return Math.max(BATTING.baseline.floor,Math.min(BATTING.baseline.ceil,invLogit(x)));
};
