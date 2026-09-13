import { getStage } from './inning-stages.js';
import { contactFlight } from './field-sim.js';
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
  const inZone=roll[1]<clamp(D.zoneBase+(balls===3?D.zoneThreeBalls:0)+(strikes===2?D.zoneTwoStrikes:0),...D.zoneClamp);
  return composePitch(pitcher,type,inZone,roll);
}
// 구종과 존 안/밖이 정해진 뒤의 코스·구속. 문법이 구종이나 존을 바꿔도 같은 롤이면 같은 자리로 간다.
export function composePitch(pitcher,type,inZone,roll,{xSign=0,speedOffset=0}={}){
  const D=T.delivery,sign=xSign||(roll[7]<.5?-1:1);
  return {t:type,v:PITCHES[type].speed+(pitcher.speedOffset||0)+speedOffset+Math.round(roll[6]*D.speedJitter-D.speedJitter/2),x:sign*(inZone?D.xInZone:D.xOutZone),z:inZone?(roll[6]<1/3?D.zThirds[0]:roll[6]>2/3?D.zThirds[2]:D.zThirds[1]):D.zOutZone};
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
export class BattingGame extends InningGame {
  constructor(seed=1,stageId=0){
    super(seed);this.stage=getStage(stageId);const s=this.stage;
    this.outs=s.outs;this.balls=s.balls;this.strikes=s.strikes;this.bases=[...s.bases];
    this.baseRunners=s.bases.map((yes,i)=>yes?{id:'initial-'+(i+1),name:(i+1)+'루 주자',speed:[8.7,7.8,8.7][i]}:null);
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
  decidePitch(action,timing=null,power=null,aim=null) {
    if(!this.pending||!['swing','take'].includes(action))throw new Error('Invalid batting decision');
    if(timing!==null&&(!Number.isFinite(timing)||timing<0||timing>1))throw new Error('Invalid swing timing');
    if(power!==null&&(!Number.isFinite(power)||power<0||power>1))throw new Error('Invalid swing power');
    if(aim!==null&&(typeof aim!=='object'||!Number.isFinite(aim.x)||!Number.isFinite(aim.z)||Math.abs(aim.x)>2||Math.abs(aim.z)>2))throw new Error('Invalid swing aim');
    const {choice,roll}=this.pending;
    const alternative=this.alternativeOf({...choice,action},roll);
    const event=this.resolvePitch({...choice,action,timing:action==='swing'?timing:null,power:action==='swing'?power:null,aim:action==='swing'&&aim?{x:aim.x,z:aim.z}:null},roll);this.pending=null;
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
  resolvePitch({target,approach,action,location='any',timing=null,power=null,aim=null},roll) {
    if(this.done)throw new Error('Challenge already finished');
    if(!['any','in','out','low','high'].includes(location)||!['any','FF','SL','CH'].includes(target)||!['contact','power'].includes(approach)||!['swing','take'].includes(action))throw new Error('Invalid batting selection');
    const before=this.snapshot();
    const {t:type,x,z}=this.delivery(roll),inZone=inStrikeZone(x,z);
    const P=T.preparation,E=T.execution,B=T.bip;
    const locationMatched=locationMatches(location,x,z),matched=target===type;
    // 조준이 있으면 코스 예측 대신 배트와 공의 거리로 판정한다. 가까울수록 1.
    const A=T.aim,aimGap=aim?Math.hypot(aim.x-x,aim.z-z):null,aimClose=aim?clamp(1-aimGap/A.radius,0,1):null;
    // 힘은 연속값이다. 누른 길이로 정하며, 예전 선택판의 '장타'는 1, '컨택'은 0 에 해당한다.
    const drive=clamp(power??(approach==='power'?1:0),0,1),powerful=drive>=.5;
    const swing=action==='swing'?swingTiming(timing,this.sweetWindow(before.batter,{target,location},{t:type,x,z})):null;
    const fullGame=this.stage?.id==='full'?T.fullGame:null;
    const contact=contactProbability([T.baseline.contactLogit,fullGame?fullGame.contactLogit:0,(before.batter.contact-T.ability.referenceContact)*T.ability.contactPerPoint,
      target==='any'?0:matched?P.typeHit:P.typeMiss, aim?A.contactMiss+(A.contactHit-A.contactMiss)*aimClose:location==='any'?0:locationMatched?P.locationHit:P.locationMiss,
      swing?.contact||0, P.powerSwing*drive, inZone?0:E.chase]);
    let result,fieldPlay=null;
    if(action==='take')result=inZone?'S':'B';
    else if(swing.whiff||roll[2]>contact)result='W';
    else if(roll[3]<E.foul.contactApproach+(E.foul.powerApproach-E.foul.contactApproach)*drive+swing.foul)result='F';
    else {
      const qualityScale=(B.qualityScale.contactApproach+(1-B.qualityScale.contactApproach)*drive)*(aim?A.qualityMiss+(1-A.qualityMiss)*aimClose:location!=='any'&&!locationMatched?B.qualityScale.locationMiss:1)*(target!=='any'&&!matched?B.qualityScale.typeMiss:1)*(inZone?1:B.qualityScale.outOfZone);
      const locationReadBonus=aim?A.quality*(aimClose*2-1):location==='any'?0:locationMatched?B.bonus.locationRead:-B.bonus.locationRead;
      // 안팎 조준이 공보다 바깥이면 밀어 치고, 안쪽이면 당겨 친다.
      const aimSpray=aim?clamp(aim.x-x,-1,1)*A.spray:0;
      fieldPlay=contactFlight(roll,{power:drive,qualityScale,angleShift:swing.angleShift+aimSpray,park:this.stage.park,bonus:(B.bonus.base||0)+(fullGame?fullGame.bipBase:0)+(before.batter.power||0)+locationReadBonus*.5+(matched?B.bonus.typeMatch:0)+swing.quality+(inZone?0:B.bonus.outOfZone),bases:before.baseRunners,batter:before.batter,outs:before.outs,defense:before.defense});result=fieldPlay.result;
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
    let explanation=action==='take'?(inZone?'지켜본 공이 존 안에 들어왔습니다.':'존 밖의 공을 잘 참았습니다.'):
      swing.whiff?(swing.kind==='early'?'배트가 공보다 먼저 지나갔습니다.':'공이 지나간 뒤에 배트가 나왔습니다.'):
      !inZone?'존 밖으로 빠지는 공에 배트가 나갔습니다.':matched?'노렸던 구종입니다. 준비한 스윙으로 승부했습니다.':target!=='any'?'예상과 다른 구종에 대응해야 했습니다.':powerful?'크게 돌렸습니다. 장타와 헛스윙의 위험을 함께 감수합니다.':'짧은 스윙으로 공을 맞히는 데 집중했습니다.';
    if(action==='swing'&&aim&&!swing.whiff)explanation+=aimClose>.7?' 배트를 공의 코스에 정확히 댔습니다.':aimClose>.35?' 조준이 조금 빗나갔습니다.':(aim.z-z>0?' 배트가 공 위로 지나갔습니다.':' 배트가 공 아래로 지나갔습니다.');
    else if(action==='swing'&&location!=='any')explanation+=(locationMatched?' 예상한 코스로 왔습니다.':' 예상한 코스와 달라 대응이 늦었습니다.');
    if(swing&&!swing.whiff){if(swing.kind==='early')explanation+=' 배트가 일찍 나가 당겨 쳤습니다.';else if(swing.kind==='late')explanation+=' 배트가 늦게 나가 밀렸습니다.';else if(swing.kind==='sweet')explanation+=' 타이밍이 정확했습니다.';}
    return {before,after:this.snapshot(),fieldPlay,call,result,label:(result==='OUT'&&scored>0&&fieldPlay?.events.some(e=>e.type==='catch')?'희생플라이!':names[result])+(fieldPlay?.running.outs&&['1B','2B','3B'].includes(result)?' · 주루 아웃':''),explanation,terminal,movements,scored,choice:{target,approach:powerful?'power':'contact',action,location},aim:aim?{x:aim.x,z:aim.z,gap:aimGap,close:aimClose}:null,timing:swing?{...swing,p:timing,power:drive,window:this.sweetWindow(before.batter,{target,location},{t:type,x,z})}:null,pitch:{t:type,v:PITCHES[type].speed+(this.pitcher.speedOffset||0)+Math.round(roll[6]*4-2),x,z},angle:(roll[7]-.5)*75};
  }
}
