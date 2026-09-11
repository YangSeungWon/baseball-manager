// 9이닝 상대 투수의 문법. 시드로 정해진 숨은 규칙 몇 개가 투구 선택을 기울인다.
// 플레이어가 배울 수 있도록 규칙은 일관되고(consistency), 관찰 차트로 되짚을 수 있다.
// 난수는 기존 10롤 벡터의 roll[8](규칙 발동)과 roll[9](단서 신뢰)만 쓴다. game.rng 는 건드리지 않는다.
import {composePitch,inStrikeZone} from './batting-game.js';
import {BATTING} from './batting-tuning.js';

const TYPES=['FF','SL','CH'];
export const RULE_POOL=[
  {id:'first-pitch-fast',kind:'count',label:'초구는 직구',when:c=>c.balls===0&&c.strikes===0,bias:{types:['FF']},consistency:.85},
  {id:'two-strike-away',kind:'count',label:'2스트라이크면 바깥쪽 변화구',when:c=>c.strikes===2,bias:{types:['SL','CH'],inZone:false,xSign:1},consistency:.85},
  {id:'three-ball-heat',kind:'count',label:'3볼이면 직구를 존 안에',when:c=>c.balls===3,bias:{types:['FF'],inZone:true},consistency:.88},
  {id:'after-fast-in-break-away',kind:'sequence',label:'몸쪽 직구 다음은 바깥쪽 변화구',when:c=>c.last?.t==='FF'&&c.last.x<0,bias:{types:['SL','CH'],xSign:1},consistency:.82},
  {id:'no-triple',kind:'sequence',label:'같은 구종을 세 번 연속 던지지 않는다',when:c=>c.history.length>=2&&c.history.at(-1).type===c.history.at(-2).type,bias:{avoidLast:true},consistency:.9},
  {id:'risp-break',kind:'situation',label:'득점권이면 변화구',when:c=>!!(c.bases[1]||c.bases[2]),bias:{types:['SL','CH']},consistency:.8},
  {id:'ahead-chase',kind:'situation',label:'유리한 카운트면 존 밖 유인구',when:c=>c.strikes>c.balls&&c.strikes<2,bias:{inZone:false},consistency:.75},
  {id:'even-count-fast',kind:'count',label:'1-1 카운트는 직구 승부',when:c=>c.balls===1&&c.strikes===1,bias:{types:['FF'],inZone:true},consistency:.8},
  {id:'late-fade',kind:'passive',label:'7회부터 직구 구속이 떨어진다',when:c=>c.inning>=7,bias:{speedOffset:-4},consistency:1},
  {id:'glove-tell',kind:'tell',label:'포수 미트가 코스를 알려준다',tell:'glove',reliability:.8},
  {id:'tempo-tell',kind:'tell',label:'변화구 앞에서는 템포가 느려진다',tell:'tempo',reliability:.75},
];
const byId=id=>RULE_POOL.find(r=>r.id===id);
const lcg=seed=>{let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};

// 시드마다 선택 규칙 3개 + 단서 1개. 남은 선택 규칙은 조정(교체)용 예비 목록이다.
export function grammarFor(seed,armIndex=0){
  const G=BATTING.grammar,rnd=lcg((seed>>>0)^Math.imul(armIndex+1,0x9e3779b9));
  const pool=RULE_POOL.filter(r=>r.kind!=='tell').map(r=>r.id),tells=RULE_POOL.filter(r=>r.kind==='tell').map(r=>r.id);
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const rules=pool.slice(0,G.rulesPerArm),spare=pool.slice(G.rulesPerArm),tell=tells[Math.floor(rnd()*tells.length)];
  // 결정구. 변화구를 고르는 규칙은 이 투수의 결정구 하나로 수렴한다. "이 투수는 2S에서 슬라이더"가 배울 수 있는 문장이 된다.
  const putaway=rnd()<.5?'SL':'CH';
  return {rules,spare,tell,putaway,adjusted:[]};
}
export const grammarRules=g=>g.rules.map(byId);
export const grammarLabels=g=>[...grammarRules(g),byId(g.tell)].map(r=>r.label);

// 문법을 한 구에 적용한다. 규칙 미발동이면 base 투구가 그대로 나가므로 시드의 투구는 보존된다.
export function applyGrammar(grammar,pitcher,ctx,roll,base){
  if(!grammar)return {pitch:base,ruleId:null,tell:null};
  const rules=grammarRules(grammar);
  let type=base.t,inZone=inStrikeZone(base.x,base.z),xSign=0,speedOffset=0,ruleId=null;
  for(const r of rules.filter(r=>r.kind==='passive'))if(r.when(ctx))speedOffset+=r.bias.speedOffset||0;
  for(const r of rules){
    if(r.kind==='passive'||!r.when(ctx)||roll[8]>=r.consistency)continue;
    const b=r.bias;
    const types=b.types&&b.types.length>1&&grammar.putaway?[grammar.putaway]:b.types;
    if(types)type=types[Math.floor(roll[0]*types.length)%types.length];
    if(b.avoidLast){const last=ctx.history.at(-1).type;if(type===last)type=TYPES[(TYPES.indexOf(last)+1+Math.floor(roll[0]*2))%3];}
    if(b.inZone!==undefined)inZone=b.inZone;
    if(b.xSign)xSign=b.xSign;
    ruleId=r.id;break;
  }
  const pitch=(ruleId||speedOffset)?composePitch(pitcher,type,inZone,roll,{xSign,speedOffset}):base;
  return {pitch,ruleId,tell:tellFor(grammar,pitch,roll)};
}
// 단서. 신뢰도만큼은 진실을, 나머지는 거짓을 보여준다. 어느 쪽인지는 던져봐야 안다.
function tellFor(grammar,pitch,roll){
  const rule=byId(grammar.tell);if(!rule)return null;
  const honest=roll[9]<rule.reliability;
  if(rule.tell==='glove')return {kind:'glove',x:honest?pitch.x:-pitch.x,z:pitch.z};
  const slow=pitch.t!=='FF';return {kind:'tempo',slow:honest?slow:!slow};
}
export const tellLabel=t=>!t?'':t.kind==='glove'?`미트 ${t.x<0?'몸쪽':'바깥쪽'} ${t.z>.4?'높게':t.z<-.4?'낮게':'가운데 높이'}`:t.slow?'템포 느림':'템포 빠름';

// 안타를 두 번 허용한 규칙은 예비 규칙과 바꾼다. 한 번의 예고된 조정이지 매 구 심리전이 아니다.
export function adjustGrammar(grammar,ruleId){
  const i=grammar.rules.indexOf(ruleId);if(i<0||!grammar.spare.length)return null;
  const added=grammar.spare.shift();grammar.rules[i]=added;grammar.adjusted.push({dropped:ruleId,added});
  return {dropped:byId(ruleId).label,added:byId(added).label};
}

// 관찰 차트. 이 경기에서 본 것만 센다. 진짜 확률이 아니라 횟수다.
export function observedChart(history=[]){
  const chart={pitches:0,byType:{FF:0,SL:0,CH:0},byCount:{},afterType:{FF:{FF:0,SL:0,CH:0},SL:{FF:0,SL:0,CH:0},CH:{FF:0,SL:0,CH:0}},tells:{glove:{seen:0,matched:0},tempo:{seen:0,matched:0}}};
  let prev=null;
  for(const h of history){
    if(!h||!h.type||h.balls===undefined)continue;
    chart.pitches++;chart.byType[h.type]++;
    const k=h.balls+'-'+h.strikes,c=chart.byCount[k]??={FF:0,SL:0,CH:0,zoneIn:0,zoneOut:0};
    c[h.type]++;if(h.inZone)c.zoneIn++;else c.zoneOut++;
    if(prev)chart.afterType[prev][h.type]++;prev=h.type;
    if(h.tell?.kind==='glove'){chart.tells.glove.seen++;if(Math.sign(h.tell.x)===Math.sign(h.x))chart.tells.glove.matched++;}
    if(h.tell?.kind==='tempo'){chart.tells.tempo.seen++;if(h.tell.slow===(h.type!=='FF'))chart.tells.tempo.matched++;}
  }
  return chart;
}
