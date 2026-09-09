import { contactFlight } from './field-sim.js';
import { controlledPitch, releaseLabel } from './pitch-control.js';
// A small, independent pitching challenge. Never reads/writes the GM save or RNG.
export const PITCHES={FF:{name:'직구',speed:147},SL:{name:'슬라이더',speed:133},CH:{name:'체인지업',speed:128}};
const BATTERS=[{name:'김도윤',style:'공격형',chase:.52,contact:.72,hint:'초구부터 적극적입니다. 바깥으로 유인해 보세요.'},{name:'박시우',style:'선구형',chase:.25,contact:.77,hint:'유인구를 잘 참습니다. 스트라이크를 먼저 잡으세요.'},{name:'이준서',style:'장타형',chase:.42,contact:.67,hint:'맞으면 멀리 갑니다. 같은 구종 반복을 조심하세요.'}];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export class InningGame {
  constructor(seed=1){this.seed=seed>>>0;this.rng=this.seed;this.outs=1;this.runs=0;this.balls=0;this.strikes=0;this.bases=[true,true,false];this.baseRunners=[{id:'initial-1',name:'1루 주자',speed:7.4},{id:'initial-2',name:'2루 주자',speed:6.8},null];this.count=0;this.order=0;this.history=[];this.done=false;this.won=false;}
  random(){this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;}
  get batter(){const i=(this.seed+this.order)%BATTERS.length;return {...BATTERS[i],id:'batter-'+this.order,speed:[7.5,7,6.4][i]};}
  snapshot(){return {outs:this.outs,runs:this.runs,balls:this.balls,strikes:this.strikes,bases:[...this.bases],baseRunners:this.bases.map((v,i)=>v?{...(this.baseRunners[i]||{id:'base-'+i,name:'주자',speed:7})}:null),count:this.count,batter:{...this.batter},done:this.done,won:this.won};}
  pitch({type,zone,intent,release}) {
    if(this.done)throw new Error('Challenge already finished');
    if(!PITCHES[type]||!['in','out','low','high'].includes(zone)||!['attack','chase'].includes(intent))throw new Error('Invalid pitch selection');
    if(release!==undefined&&(!Number.isFinite(release)||Math.abs(release)>1))throw new Error('Invalid release');
    const before=this.snapshot(),roll=Array.from({length:10},()=>this.random());
    const repeated=this.history.slice(-2).filter(p=>p.type===type).length;
    const fatigue=Math.max(0,this.count-15)*.009;
    const strikeChance=clamp((intent==='attack'?.80:.20)-(type==='FF'?0:.06)-(zone==='low'?.04:0)-fatigue,.07,.9);
    const control=release===undefined?null:controlledPitch(zone,intent,release,roll[0]*2-1,roll[6]*2-1);
    const inZone=control?Math.abs(control.x)<=1&&Math.abs(control.z)<=1:roll[0]<strikeChance;
    const swing=roll[1]<(inZone?.73+this.strikes*.05:this.batter.chase+(this.strikes===2?.13:0)-(this.balls===3?.1:0));
    const fooled=(type==='CH'&&this.history.at(-1)?.type==='FF'?.13:0)+(type==='SL'&&zone==='out'?.08:0);
    const contact=clamp(this.batter.contact+(inZone?.03:-.19)+repeated*.09-fooled,.22,.94);
    let result,terminal=false,fieldPlay=null;
    if(!swing) result=inZone?'S':'B';
    else if(roll[2]>contact) result='W';
    else if(roll[3]<.30) result='F';
    else {fieldPlay=contactFlight(roll,{power:this.batter.style==='장타형',bonus:repeated*.06-fooled*.25-(inZone?0:.1),bases:before.baseRunners,batter:before.batter,outs:before.outs});result=fieldPlay.result;terminal=true;}
    const call=result;
    this.count++;
    if(result==='B'){this.balls++;if(this.balls===4){result='BB';terminal=true;}}
    if(result==='S'||result==='W'){this.strikes++;if(this.strikes===3){result='K';terminal=true;}}
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
    const names={S:'스트라이크',W:'헛스윙',B:'볼',F:'파울',K:'삼진!',BB:'볼넷',OUT:'아웃!', '1B':'안타','2B':'2루타','3B':'3루타',FC:'야수 선택',HR:'홈런'};
    const explanation=result==='B'?(intent==='chase'?'타자가 유인구를 참았습니다.':'노린 코스에서 벗어났습니다.'):
      result==='W'||result==='K'?(fooled>0?'구속과 궤적 변화가 타이밍을 흔들었습니다.':'타자와의 승부에서 아웃카운트에 가까워졌습니다.'):
      ['1B','2B','HR'].includes(result)?(repeated===2?'반복한 구종에 타자가 대응했습니다.':'타자가 공을 제대로 맞혔습니다.'):
      result==='S'?'타자가 지켜본 공이 스트라이크 존에 들어왔습니다.':result==='BB'?'네 번째 볼. 주자를 내보냈습니다.':result==='OUT'?'수비가 타구를 처리했습니다.':'타자가 커트했습니다. 다시 승부하세요.';
    const q={type,zone,intent};this.history.push(q);
    if(terminal){this.balls=0;this.strikes=0;this.order++;}
    this.won=this.outs>=3 && this.runs<2;
    this.done=this.won||this.runs>=2||this.count>=30;
    const x=(zone==='in'?-.8:zone==='out'?.8:0)*(inZone?.8:1.65),z=zone==='low'?(inZone?-.75:-1.5):zone==='high'?(inZone?.75:1.5):(inZone?0:1.5);
    return {before,after:this.snapshot(),fieldPlay,call,result,label:names[result]+(fieldPlay?.running.outs&&['1B','2B','3B'].includes(result)?' · 주루 아웃':''),explanation,terminal,movements,scored,choice:q,control:control?{target:control.target,release,label:releaseLabel(release)}:null,pitch:{x:control?.x??x,z:control?.z??z,t:type,v:PITCHES[type].speed+Math.round(roll[6]*4-2)},angle:(roll[7]-.5)*75};
  }
}
