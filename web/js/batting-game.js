import { contactFlight } from './field-sim.js';
import { InningGame, PITCHES } from './inning-game.js';
const ARMS=[
  {name:'강태오',style:'직구파',fast:.64,hint:'직구 비중이 높습니다. 빠른 공을 노려보세요.'},
  {name:'윤지호',style:'변화구파',fast:.28,hint:'슬라이더와 체인지업을 자주 섞습니다.'},
  {name:'서도현',style:'승부형',fast:.46,hint:'볼이 많아지면 존 안으로 승부하는 편입니다.'},
];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export class BattingGame extends InningGame {
  get pitcher(){return ARMS[this.seed%ARMS.length];}
  snapshot(){return {...super.snapshot(),pitcher:{...this.pitcher}};}
  preparePitch({target,approach,location='any'}) {
    if(this.done||this.pending)throw new Error('Pitch unavailable');
    if(!['any','in','out','low','high'].includes(location)||!['any','FF','SL','CH'].includes(target)||!['contact','power'].includes(approach))throw new Error('Invalid batting selection');
    const roll=Array.from({length:10},()=>this.random());
    this.pending={choice:{target,approach,location},roll};
    return this.delivery(roll);
  }
  delivery(roll) {
    const type=roll[0]<this.pitcher.fast?'FF':roll[0]<this.pitcher.fast+(1-this.pitcher.fast)*.58?'SL':'CH';
    const inZone=roll[1]<clamp(.64+(this.balls===3?.17:0)-(this.strikes===2?.20:0),.2,.88);
    return {t:type,v:PITCHES[type].speed+Math.round(roll[6]*4-2),x:(roll[7]<.5?-1:1)*(inZone?.6:1.6),z:inZone?(roll[6]<1/3?-.7:roll[6]>2/3?.65:0):-1.5};
  }
  decidePitch(action) {
    if(!this.pending||!['swing','take'].includes(action))throw new Error('Invalid batting decision');
    const {choice,roll}=this.pending;
    const event=this.resolvePitch({...choice,action},roll);this.pending=null;return event;
  }
  pitch(choice) {
    if(!['swing','take'].includes(choice.action))throw new Error('Invalid batting decision');
    this.preparePitch(choice);return this.decidePitch(choice.action);
  }
  resolvePitch({target,approach,action,location='any'},roll) {
    if(this.done)throw new Error('Challenge already finished');
    if(!['any','in','out','low','high'].includes(location)||!['any','FF','SL','CH'].includes(target)||!['contact','power'].includes(approach)||!['swing','take'].includes(action))throw new Error('Invalid batting selection');
    const before=this.snapshot();
    const {t:type,x,z}=this.delivery(roll),inZone=Math.abs(x)<=1&&Math.abs(z)<=1;
    const locationMatched=location==='high'?z>.4:location==='low'?z<-.4:location==='in'?x<0:location==='out'?x>0:false;
    const locationRead=location==='any'?0:locationMatched?.12:-.12;
    const matched=target===type,power=approach==='power';
    const read=target==='any'?0:matched?.15:-.17;
    const contact=clamp(.83+read+locationRead-(power?.17:0)-(inZone?0:.27),.15,.98);
    let result,fieldPlay=null;
    if(action==='take')result=inZone?'S':'B';
    else if(roll[2]>contact)result='W';
    else if(roll[3]<(power?.20:.32))result='F';
    else {
      fieldPlay=contactFlight(roll,{power,bonus:locationRead*.5+(matched?.1:0)-(inZone?0:.12),bases:before.baseRunners,batter:before.batter,outs:before.outs});result=fieldPlay.result;
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
    this.history.push({type,action,target,approach,location});
    if(terminal){this.balls=0;this.strikes=0;this.order++;}
    this.won=this.runs>=3;this.done=this.won||this.outs>=3||this.count>=30;
    const names={S:'스트라이크',W:'헛스윙',B:'볼',F:'파울',K:'삼진',BB:'볼넷!',OUT:'아웃', '1B':'안타!','2B':'2루타!','3B':'3루타!',FC:'야수 선택',HR:'홈런!'};
    let explanation=action==='take'?(inZone?'지켜본 공이 존 안에 들어왔습니다.':'존 밖의 공을 잘 참았습니다.'):
      !inZone?'존 밖으로 빠지는 공에 배트가 나갔습니다.':matched?'노렸던 구종입니다. 준비한 스윙으로 승부했습니다.':target!=='any'?'예상과 다른 구종에 대응해야 했습니다.':power?'크게 돌렸습니다. 장타와 헛스윙의 위험을 함께 감수합니다.':'짧은 스윙으로 공을 맞히는 데 집중했습니다.';
    if(action==='swing'&&location!=='any')explanation+=(locationMatched?' 예상한 코스로 왔습니다.':' 예상한 코스와 달라 대응이 늦었습니다.');
    return {before,after:this.snapshot(),fieldPlay,call,result,label:names[result]+(fieldPlay?.running.outs&&['1B','2B','3B'].includes(result)?' · 주루 아웃':''),explanation,terminal,movements,scored,choice:{target,approach,action,location},pitch:{t:type,v:PITCHES[type].speed+Math.round(roll[6]*4-2),x,z},angle:(roll[7]-.5)*75};
  }
}
