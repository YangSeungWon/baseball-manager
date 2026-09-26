import { BATTING_AIM_LIMIT } from './batting-space.js';
import { battingContact } from './batting-contact.js';
import { getStage } from './inning-stages.js';
import { contactFlight, simulateField } from './field-sim.js';
import { InningGame, PITCHES } from './inning-game.js';
import { BATTING as T, contactProbability } from './batting-tuning.js';
const ARMS=[
  {name:'강태오',style:'직구파',fast:.64,hint:'직구 비중이 높습니다. 빠른 공을 노려보세요.'},
  {name:'윤지호',style:'변화구파',fast:.28,hint:'슬라이더와 체인지업을 자주 섞습니다.'},
  {name:'서도현',style:'승부형',fast:.46,hint:'볼이 많아지면 존 안으로 승부하는 편입니다.'},
];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const battingReadProfile=b=>{
  const R=T.read,vision=clamp(b.vision??b.contact??.65,...R.visionClamp),discipline=clamp(1-(b.chase??.45),...R.disciplineClamp);
  return {vision,discipline,from:R.fromBase+vision*R.fromVision,to:R.toBase+vision*R.toVision,takeUntil:R.takeBase+discipline*R.takeDiscipline,onset:R.onsetBase+vision*R.onsetVision};
};
export const inStrikeZone=(x,z)=>Math.abs(x)<=1&&Math.abs(z)<=1;
// 체크 스윙이 스윙으로 판정될 확률. 배트가 나온 정도(0..1)가 callFrom 을 넘으면 1까지 오른다.
export const checkSwingChance=depth=>{const C=T.playerInput.check;return clamp((depth-C.callFrom)/(1-C.callFrom),0,1);};
// 예측이 맞으면 보상은 정보다: 읽기 창이 일찍 열리고 선명해지며 타이밍 적중 구간이 넓어진다.
// 투구 자체와 지켜보기 판정은 바뀌지 않는다. 순수 함수.
export function readWindowFor(batter,choice={},pitch=null){
  const base=battingReadProfile(batter),W=T.read.reward,S=T.swingWindow;
  const typeHit=!!pitch&&choice.target&&choice.target!=='any'&&choice.target===pitch.t;
  const locationHit=!!pitch&&choice.location&&choice.location!=='any'&&locationMatches(choice.location,pitch.x,pitch.z);
  return {...base,typeHit,locationHit,
    from:clamp(base.from+(typeHit?W.typeFrom:0)+(locationHit?W.locationFrom:0),.05,1),
    to:clamp(base.to+(locationHit?W.locationTo:0),0,1),
    onset:clamp(base.onset+(typeHit?W.typeOnset:0),0,1),
    sweet:{from:S.from+(typeHit?W.typeSweetFrom:0),to:S.to+(locationHit?W.locationSweetTo:0)}};
}
export const locationMatches=(location,x,z)=>location==='high'?z>.4:location==='low'?z<-.4:location==='in'?x<0:location==='out'?x>0:false;
// 상대 투수의 한 구. 플레이어 선택은 읽지 않으며, 같은 롤이면 같은 공이다.
export function deliverPitch(pitcher,{balls=0,strikes=0}={},roll){
  const D=T.delivery,fast=pitcher.fast;
  const type=roll[0]<fast?'FF':roll[0]<fast+(1-fast)*D.breakingSplit?'SL':'CH';
  const inZone=roll[1]<clamp(D.zoneBase+(pitcher.zoneShift||0)+(balls===3?D.zoneThreeBalls:0)+(strikes===2?D.zoneTwoStrikes:0),...D.zoneClamp);
  return composePitch(pitcher,type,inZone,roll);
}
// 구종과 존 안/밖이 정해진 뒤의 코스·구속. 문법이 구종이나 존을 바꿔도 같은 롤이면 같은 자리로 간다.
// 투수 성향: lowBias 는 존 안에서 낮은 공의 비중(기본 ⅓), edgeX 는 존 안 좌우 폭(기본 .6). 같은 롤이면 같은 자리.
export function composePitch(pitcher,type,inZone,roll,{xSign=0,speedOffset=0}={}){
  const D=T.delivery,sign=xSign||(roll[7]<.5?-1:1),low=pitcher.lowBias??1/3,edge=pitcher.edgeX??D.xInZone;
  const z=inZone?(roll[6]<low?D.zThirds[0]:roll[6]>low+(1-low)/2?D.zThirds[2]:D.zThirds[1]):D.zOutZone;
  return {t:type,v:PITCHES[type].speed+(pitcher.speedOffset||0)+speedOffset+Math.round(roll[6]*D.speedJitter-D.speedJitter/2),x:sign*(inZone?edge:D.xOutZone),z};
}
const outcomeOf=e=>({action:e.choice.action,call:e.call,result:e.result,label:e.label,scored:e.scored,outs:e.after.outs-e.before.outs});
// Higher is better for the batting side: runs and base hits count, outs and strikes cost.
const worth=o=>{const W=T.worth;return o.scored*W.run+(['1B','2B','3B','HR','BB'].includes(o.result)?W.onBase:0)+o.outs*W.out+(o.result==='B'?W.ball:['S','W','K'].includes(o.result)?W.strike:0);};
export const compareOutcomes=(alt,actual)=>{const d=worth(alt)-worth(actual),g=T.worth.verdictGap;return d>g?'better':d<-g?'worse':'same';};
// Swing timing from the read window. `p` is how far through the window the swing was pressed (0..1);
// null means the planned swing ran on its own. Early swings pull the ball, late swings push it, both weaken contact.
// `contact` is in log-odds; quality/foul/angleShift are ball-in-play terms.
export const SWING_WINDOW=T.swingWindow;
export function swingTiming(p,window=T.swingWindow){
  const E=T.execution;
  if(p===null||p===undefined||!Number.isFinite(p))return {kind:'auto',severity:0,label:'자동 스윙',contact:E.timing.auto,quality:0,foul:0,angleShift:0};
  const q=clamp(p,0,1);
  if(q<window.from){const severity=(window.from-q)/window.from;return {kind:'early',severity,whiff:severity>=E.timing.whiffBeyond,label:severity>=E.timing.whiffBeyond?'너무 빠름':'타이밍 빠름',contact:E.timing.earlyMax*severity,quality:E.quality.earlyMax*severity,foul:E.foul.earlyMax*severity,angleShift:E.angle.earlyMax*severity};}
  if(q>window.to){const severity=(q-window.to)/(1-window.to);return {kind:'late',severity,whiff:severity>=E.timing.whiffBeyond,label:severity>=E.timing.whiffBeyond?'너무 늦음':'타이밍 늦음',contact:E.timing.lateMax*severity,quality:E.quality.lateMax*severity,foul:E.foul.lateMax*severity,angleShift:E.angle.lateMax*severity};}
  return {kind:'sweet',severity:0,label:'타이밍 적중',contact:E.timing.sweet,quality:E.quality.sweet,foul:E.foul.sweet,angleShift:0};
}
// 파울 방향으로 타이밍을 읽는다. 타석 쪽으로 감기면 앞에서 당겨 친 것(빠름), 반대쪽으로 흐르면 뒤에서 밀린 것(늦음).
// 앞으로 뻗지 못하고 뒤로 넘어가거나 땅에 꽂히면 타이밍이 아니라 컨택 포인트가 위아래로 어긋난 것이다.
export function foulReading(impact){
  if(impact.tipped)return impact.launch<0
    ?'타이밍은 맞았지만 배트 윗면으로 덮어 공이 땅에 꽂혔습니다. 컨택 포인트가 높았습니다.'
    :'타이밍은 맞았지만 배트 아랫면에 스쳐 공이 뒤로 넘어갔습니다. 컨택 포인트가 낮았습니다.';
  if(Math.abs(impact.timingAngle)<=T.manualContact.tipTiming)return '타이밍은 나쁘지 않았지만 공의 코스에 밀려 파울이 됐습니다.';
  return impact.pull
    ?'타석 쪽으로 감긴 파울입니다. 공 앞에서 당겨 쳤으니 타이밍이 빨랐습니다.'
    :'타석 반대쪽으로 흘러 나간 파울입니다. 공 뒤에서 밀려 맞았으니 타이밍이 늦었습니다.';
}
export class BattingGame extends InningGame {
  constructor(seed=1,stageId=0){
    super(seed);this.stage=getStage(stageId);const s=this.stage;
    this.outs=s.outs;this.balls=s.balls;this.strikes=s.strikes;this.bases=[...s.bases];
    this.baseRunners=s.bases.map((yes,i)=>yes?{id:'initial-'+(i+1),name:(i+1)+'루 주자',speed:(s.runnerSpeed?.[i])||[8.7,7.8,8.7][i]}:null);
  }
  get defense(){const roster=super.defense;if(this.stage?.outfieldArm)for(const pos of ['LF','CF','RF'])roster[pos].arm=this.stage.outfieldArm;return roster;}
  get pitcher(){return this.stage.pitcher||ARMS[this.seed%ARMS.length];}
  snapshot(){return {...super.snapshot(),pitcher:{...this.pitcher},stageId:this.stage.id};}
  preparePitch({target,approach,location='any'}) {
    if(this.done||this.pending)throw new Error('Pitch unavailable');
    if(!['any','in','out','low','high'].includes(location)||!['any','FF','SL','CH'].includes(target)||!['contact','power'].includes(approach))throw new Error('Invalid batting selection');
    const roll=Array.from({length:10},()=>this.random());
    this.pending={choice:{target,approach,location},roll};
    return this.delivery(roll);
  }
  sweetWindow(batter,choice,pitch){return readWindowFor(batter,choice,pitch).sweet;}
  delivery(roll){return deliverPitch(this.pitcher,{balls:this.balls,strikes:this.strikes},roll);}
  // `timing` is where in the read window the swing started (0..1), `power` how hard it was driven (0..1, from hold length).
  // `aim` is where the bat was brought to, in zone units ({x,z}); with it the location guess is ignored.
  // `check` is a held-up swing ({depth} 0..1); only a take can carry one, and the umpire rules on it.
  // `cut` 은 2스트라이크에서 걷어내는 스윙이다. 맞으면 파울이고, 삼진을 미루는 대신 안타를 포기한다.
  decidePitch(action,timing=null,power=null,aim=null,check=null,cut=false) {
    if(!this.pending||!['swing','take'].includes(action))throw new Error('Invalid batting decision');
    if(timing!==null&&(!Number.isFinite(timing)||timing<0||timing>1))throw new Error('Invalid swing timing');
    if(power!==null&&(!Number.isFinite(power)||power<0||power>1))throw new Error('Invalid swing power');
    if(check!==null&&(action!=='take'||typeof check!=='object'||!Number.isFinite(check.depth)||check.depth<0||check.depth>1))throw new Error('Invalid check swing');
    if(aim!==null&&(typeof aim!=='object'||!Number.isFinite(aim.x)||!Number.isFinite(aim.z)||Math.abs(aim.x)>BATTING_AIM_LIMIT||Math.abs(aim.z)>BATTING_AIM_LIMIT))throw new Error('Invalid swing aim');
    const {choice,roll}=this.pending;
    const alternative=this.alternativeOf({...choice,action},roll);
    const event=this.resolvePitch({...choice,action,timing:action==='swing'?timing:null,power:action==='swing'?power:null,aim:action==='swing'&&aim?{x:aim.x,z:aim.z}:null,check,cut:action==='swing'&&!!cut},roll);this.pending=null;
    event.alternative={...alternative,verdict:compareOutcomes(alternative,outcomeOf(event))};return event;
  }
  // Same delivery, same dice, the other decision. Runs on a throwaway copy so nothing here touches the real state.
  alternativeOf(choice,roll) {
    const ghost=Object.create(Object.getPrototypeOf(this));
    for(const [k,v] of Object.entries(this))ghost[k]=Array.isArray(v)?[...v]:v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([a,b])=>[a,Array.isArray(b)?[...b]:b])):v;
    const action=choice.action==='swing'?'take':'swing';
    return outcomeOf(ghost.resolvePitch({...choice,action,timing:null},roll));
  }
  pitch(choice) {
    if(!['swing','take'].includes(choice.action))throw new Error('Invalid batting decision');
    this.preparePitch(choice);return this.decidePitch(choice.action);
  }
  resolvePitch({target,approach,action,location='any',timing=null,power=null,aim=null,check=null,cut=false},roll) {
    if(this.done)throw new Error('Challenge already finished');
    if(!['any','in','out','low','high'].includes(location)||!['any','FF','SL','CH'].includes(target)||!['contact','power'].includes(approach)||!['swing','take'].includes(action))throw new Error('Invalid batting selection');
    const before=this.snapshot();
    const {t:type,x,z}=this.delivery(roll),inZone=inStrikeZone(x,z);
    const P=T.preparation,E=T.execution,B=T.bip;
    const locationMatched=locationMatches(location,x,z),matched=target===type;
    // 조준이 있으면 코스 예측 대신 배트와 공의 거리로 판정한다. 가까울수록 1.
    const A=T.aim,aimGap=aim?Math.hypot(aim.x-x,aim.z-z):null,aimClose=aim?clamp(1-aimGap/A.radius,0,1):null;
    // 힘은 선수/타격 성향으로 정한다. 직접 입력의 스윙 시간과 컨택 판정은 일정하다.
    const drive=clamp(power??(approach==='power'?1:0),0,1),powerful=drive>=.5;
    const swing=action==='swing'?swingTiming(timing,this.sweetWindow(before.batter,{target,location},{t:type,x,z})):null;
    // 노림은 준비 층의 가산이 아니라 손이 쓸 수 있는 보상으로 간다 — 적중하면 타이밍 여유가 넓어진다.
    const guess=target==='any'?null:matched?'hit':'miss';
    const impact=action==='swing'&&aim&&timing!==null?battingContact({aim,pitch:{x,z},timing,power:drive,batter:before.batter,cut,guess}):null;
    const fullGame=this.stage?.id==='full'?T.fullGame:null;
    const contact=contactProbability([T.baseline.contactLogit,fullGame?fullGame.contactLogit:0,(before.batter.contact-T.ability.referenceContact)*T.ability.contactPerPoint,
      target==='any'?0:matched?P.typeHit:P.typeMiss, aim?A.contactMiss+(A.contactHit-A.contactMiss)*aimClose:location==='any'?0:locationMatched?P.locationHit:P.locationMiss,
      swing?.contact||0, P.powerSwing*drive, inZone?0:E.chase]);
    let result,fieldPlay=null;
    // 체크 스윙 판정은 스윙에서만 쓰는 roll[2]를 읽으므로 같은 시드의 이후 투구가 바뀌지 않는다.
    const checkChance=action==='take'&&check?checkSwingChance(check.depth):null,checkCalled=checkChance!==null&&roll[2]<checkChance;
    if(action==='take')result=checkCalled?'W':inZone?'S':'B';
    else if(impact){
      if(impact.kind==='miss')result='W';
      else if(impact.kind==='foul')result='F';
      else {fieldPlay=simulateField({...impact,park:this.stage.park,bases:before.baseRunners,batter:before.batter,outs:before.outs,defense:before.defense});result=fieldPlay.result;}
    }
    else if(swing.whiff||roll[2]>contact)result='W';
    else if(roll[3]<E.foul.contactApproach+(E.foul.powerApproach-E.foul.contactApproach)*drive+swing.foul)result='F';
    else {
      const qualityScale=(B.qualityScale.contactApproach+(1-B.qualityScale.contactApproach)*drive)*(aim?A.qualityMiss+(1-A.qualityMiss)*aimClose:location!=='any'&&!locationMatched?B.qualityScale.locationMiss:1)*(target!=='any'&&!matched?B.qualityScale.typeMiss:1)*(inZone?1:B.qualityScale.outOfZone);
      const locationReadBonus=aim?A.quality*(aimClose*2-1):location==='any'?0:locationMatched?B.bonus.locationRead:-B.bonus.locationRead;
      // 안팎 조준이 공보다 바깥이면 밀어 치고, 안쪽이면 당겨 친다.
      const aimSpray=aim?clamp(aim.x-x,-1,1)*A.spray:0;
      // 타이밍이 만드는 스프레이만 타석 방향을 따른다. 코스·조준 항은 좌우 대칭이라 그대로 둔다.
      const hand=(before.batter.bats||before.batter.hand)==='L'?-1:1;
      fieldPlay=contactFlight(roll,{power:drive,qualityScale,angleShift:hand*swing.angleShift+aimSpray,park:this.stage.park,bonus:(B.bonus.base||0)+(fullGame?fullGame.bipBase:0)+(before.batter.power||0)+locationReadBonus*.5+(matched?B.bonus.typeMatch:0)+swing.quality+(inZone?0:B.bonus.outOfZone),bases:before.baseRunners,batter:before.batter,outs:before.outs,defense:before.defense});result=fieldPlay.result;
    }
    const call=result;let terminal=['OUT','HR','3B','2B','1B','FC'].includes(result);this.count++;
    if(result==='B'&&++this.balls===4){result='BB';terminal=true;}
    if((result==='S'||result==='W')&&++this.strikes===3){result='K';terminal=true;}
    if(result==='F'&&this.strikes<2)this.strikes++;
    const movements=[];let scored=0;
    const move=(from,to)=>{movements.push({from,to});if(to===4)scored++;};
    if(result==='BB') {
      if(this.bases[0]){if(this.bases[1]){if(this.bases[2])move(3,4);this.bases[2]=true;move(2,3);}this.bases[1]=true;move(1,2);}
      this.bases[0]=true;move(0,1);
    } else if(fieldPlay){
      scored=fieldPlay.running.scored;movements.push(...fieldPlay.running.movements);this.outs+=fieldPlay.running.outs;
      this.baseRunners=fieldPlay.running.bases;this.bases=this.baseRunners.map(Boolean);
    } else if(result==='K')this.outs++;
    if(result==='BB'){
      const next=before.baseRunners.map(r=>r?{...r}:null);
      for(const m of movements)if(m.from>0)next[m.from-1]=null;
      for(const m of movements)if(m.to<4)next[m.to-1]=m.from===0?{id:before.batter.id,name:before.batter.name,speed:before.batter.speed}:before.baseRunners[m.from-1];
      this.baseRunners=next;
    }
    this.runs+=scored;
    this.history.push({type,x,z,inZone,balls:before.balls,strikes:before.strikes,action,target,approach,location});
    if(terminal){this.balls=0;this.strikes=0;this.order++;}
    this.won=this.stage.homeScore+this.runs>this.stage.awayScore;this.done=this.won||this.outs>=3;
    const names={S:'스트라이크',W:'헛스윙',B:'볼',F:'파울',K:'삼진',BB:'볼넷!',OUT:'아웃', '1B':'안타!','2B':'2루타!','3B':'3루타!',FC:'야수 선택',HR:'홈런!'};
    let explanation=action==='take'&&check?`배트가 ${Math.round(check.depth*100)}% 나왔습니다. `+(checkCalled?'심판이 스윙으로 판정했습니다.':inZone?'스윙은 아니지만 존 안에 들어왔습니다.':'끝까지 참아 스윙으로 보지 않았습니다.'):action==='take'?(inZone?'지켜본 공이 존 안에 들어왔습니다.':'존 밖의 공을 잘 참았습니다.'):
      swing.whiff?(swing.kind==='early'?'배트가 공보다 먼저 지나갔습니다.':'공이 지나간 뒤에 배트가 나왔습니다.'):
      !inZone?'존 밖으로 빠지는 공에 배트가 나갔습니다.':matched?'노렸던 구종입니다. 준비한 스윙으로 승부했습니다.':target!=='any'?'예상과 다른 구종에 대응해야 했습니다.':powerful?'크게 돌렸습니다. 장타와 헛스윙의 위험을 함께 감수합니다.':'짧은 스윙으로 공을 맞히는 데 집중했습니다.';
    if(action==='swing'&&aim&&!swing.whiff)explanation+=aimClose>.7?' 배트를 공의 코스에 정확히 댔습니다.':aimClose>.35?' 조준이 조금 빗나갔습니다.':(aim.z-z>0?' 배트가 공 위로 지나갔습니다.':' 배트가 공 아래로 지나갔습니다.');
    else if(action==='swing'&&location!=='any')explanation+=(locationMatched?' 예상한 코스로 왔습니다.':' 예상한 코스와 달라 대응이 늦었습니다.');
    if(swing&&!swing.whiff){if(swing.kind==='early')explanation+=' 배트가 일찍 나가 당겨 쳤습니다.';else if(swing.kind==='late')explanation+=' 배트가 늦게 나가 밀렸습니다.';else if(swing.kind==='sweet')explanation+=' 타이밍이 정확했습니다.';}
    if(impact){
      explanation=impact.kind==='miss'?(impact.reason==='timing'?(impact.seconds<0?'배트가 공보다 먼저 지나갔습니다.':'공이 지나간 뒤에 배트가 나왔습니다.'):impact.reason==='aim'?'배트가 공의 코스를 벗어났습니다.':'타이밍과 조준이 함께 빗나가 배트 끝에 닿지 않았습니다.'):impact.kind==='solid'?'배트 중심에 정확히 맞았습니다.':impact.kind==='foul'?foulReading(impact):'배트 중심을 벗어나 타구의 힘이 줄었습니다.';
      if(impact.kind!=='miss')explanation+=` 타구 속도 ${Math.round(impact.speed*3.6)} km/h.`;
    }
    return {before,after:this.snapshot(),fieldPlay,impact,call,result,cut:!!cut,guess,label:(result==='OUT'&&scored>0&&fieldPlay?.events.some(e=>e.type==='catch')?'희생플라이!':names[result])+(fieldPlay?.running.outs&&['1B','2B','3B'].includes(result)?' · 주루 아웃':'')+(checkChance===null?'':checkCalled?' · 체크 스윙 → 스윙':' · 노 스윙'),check:checkChance===null?null:{depth:check.depth,chance:checkChance,called:checkCalled},explanation,terminal,movements,scored,choice:{target,approach:powerful?'power':'contact',action,location},aim:aim?{x:aim.x,z:aim.z,gap:aimGap,close:aimClose}:null,timing:swing?{...swing,...(impact?{whiff:impact.kind==='miss'}:{}),p:timing,power:drive,window:this.sweetWindow(before.batter,{target,location},{t:type,x,z})}:null,pitch:{t:type,v:PITCHES[type].speed+(this.pitcher.speedOffset||0)+Math.round(roll[6]*4-2),x,z},angle:(roll[7]-.5)*75};
  }
}
