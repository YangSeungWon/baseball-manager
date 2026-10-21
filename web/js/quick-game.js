import {seededRandom, makeQuickPitcher, deliverQuickPitch, pitchFamily} from './quick-pitches.js';
export {pitchLocation} from './quick-pitches.js';
export const WINDUP_MS = 650;
export const FEEDBACK_MS = 1250;
export const HIT_MS = 165;
export const APPROACHES = Object.freeze({
  fast: {label:'빠른 공', hint:'빠른 공을 노려 장타'},
  slow: {label:'느린 공', hint:'변화구를 기다려 장타'},
  contact: {label:'맞히기', hint:'넓게 대응 · 장타는 어려움'},
});
export const inQuickZone = ({x,z}) => Math.abs(x)<=1 && Math.abs(z)<=1;

// The report shows a long-run mix, not the exact contents of a pitch bag.
// Count changes tendencies; it never guarantees the next pitch.
export function makePitch(seed, index, pitcher, balls=0, strikes=0) {
  const random=seededRandom((seed ^ Math.imul(index+1,0x9e3779b9))>>>0);
  const weights=pitcher.arsenal.map(({type,usage})=>({type,weight:usage *
    (strikes===2 && pitchFamily(type)==='slow' ? 1.45 : balls>=3 && pitchFamily(type)==='fast' ? 1.4 : 1)}));
  let roll=random()*weights.reduce((sum,p)=>sum+p.weight,0);
  const type=(weights.find(p=>(roll-=p.weight)<0)||weights.at(-1)).type;
  const chase=random()<(strikes===2 ? .48 : balls>=3 ? .18 : .29);
  const target={x:(random()*2-1)*.86,z:(random()*2-1)*.86};
  if(chase){
    const edge=Math.floor(random()*4),outside=1.05+random()*.38;
    if(edge<2)target.x=(edge===0?-1:1)*outside;
    else target.z=(edge===2?-1:1)*outside;
  }
  return deliverQuickPitch(type,pitcher,target,Array.from({length:8},()=>random()*2-1));
}

// Aiming is abstracted: the player prepares for a speed family and decides
// when to swing. There is no random hit roll after input.
export function judgePitch(pitch,offset,approach='contact') {
  if(!APPROACHES[approach])throw new Error('Unknown approach');
  const strike=inQuickZone(pitch);
  if(offset===null)return {kind:strike?'strike':'ball',label:strike?'스트라이크':'볼',offset};
  if(!Number.isFinite(offset))throw new Error('Invalid swing timing');
  const matched=approach===pitchFamily(pitch.type),contact=approach==='contact',timing=Math.abs(offset);
  const window=contact?165:matched?145:95;
  if(!strike||timing>window)return {kind:'whiff',label:'헛스윙',offset,matched};
  if(timing>(contact?115:matched?100:65))return {kind:'foul',label:'파울',offset,matched};
  const edge=Math.max(Math.abs(pitch.x),Math.abs(pitch.z));
  if(timing>(contact?85:matched?75:40))return {kind:'out',label:offset<0?'뜬공 아웃':'땅볼 아웃',offset,matched};
  const bases=matched&&timing<=30&&edge<.5?4:matched&&timing<=60&&edge<.88?2:1;
  return {kind:'hit',label:bases===4?'홈런!':bases===2?'2루타!':'안타!',bases,offset,matched};
}

export class QuickGame {
  constructor(seed) {
    this.seed=seed>>>0;this.pitcher=makeQuickPitcher(this.seed);
    this.balls=0;this.strikes=0;this.outs=0;this.runs=0;this.hits=0;this.walks=0;
    this.bases=[false,false,false];this.results=[];this.plateAppearances=0;
    this.approach='contact';this.current=null;
  }
  get done(){return this.outs>=3;}
  get pitch(){
    if(this.done)return null;
    return this.current??=makePitch(this.seed,this.results.length,this.pitcher,this.balls,this.strikes);
  }
  setApproach(value){if(!APPROACHES[value])throw new Error('Unknown approach');this.approach=value;}
  advanceHit(distance){
    const next=[false,false,false];let runs=distance===4?1:0;
    if(distance<4)next[distance-1]=true;
    this.bases.forEach((occupied,i)=>{if(occupied){if(i+distance>=3)runs++;else next[i+distance]=true;}});
    this.bases=next;return runs;
  }
  advanceWalk(){
    const [first,second,third]=this.bases;
    this.bases=[true,second||first,third||(first&&second)];
    return Number(first&&second&&third);
  }
  resolve(offset){
    if(this.done)throw new Error('Inning already finished');
    const before={bases:[...this.bases],runs:this.runs};
    const pitch=this.pitch, result=judgePitch(pitch,offset,this.approach);
    let ended=false,runs=0;
    if(result.kind==='ball'){
      this.balls++;
      if(this.balls===4){result.kind='walk';result.label='볼넷';this.walks++;runs=this.advanceWalk();ended=true;}
    }else if(result.kind==='strike'||result.kind==='whiff'){
      this.strikes++;
      if(this.strikes===3){result.kind='strikeout';result.label='삼진';this.outs++;ended=true;}
    }else if(result.kind==='foul')this.strikes=Math.min(2,this.strikes+1);
    else if(result.kind==='out'){this.outs++;ended=true;}
    else if(result.kind==='hit'){this.hits++;runs=this.advanceHit(result.bases);ended=true;}
    const count={balls:this.balls,strikes:this.strikes};
    if(ended){this.plateAppearances++;this.balls=0;this.strikes=0;}
    this.runs+=runs;
    const scored={...result,pitch,approach:this.approach,count,runs,ended,before};
    this.results.push(scored);this.current=null;return scored;
  }
}
