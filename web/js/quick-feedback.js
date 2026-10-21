// Visual time only: contact holds never change input timing, counts or scoring.
export function contactMotion(result, milliseconds, reduced=false) {
  const contact=['hit','foul','out'].includes(result?.kind);
  if(!contact||reduced)return {contact,x:0,y:0,scale:1,alpha:1,impact:0};
  const hold=result.kind==='hit'?48:result.kind==='foul'?18:24;
  const t=Math.min(1,Math.max(0,milliseconds-hold)/720);
  const side=result.offset<0?-1:1;
  let x,y;
  if(result.kind==='foul'){x=side*1.1*t;y=-.25*t+.2*t*t;}
  else if(result.kind==='out'){
    x=side*.25*t;
    y=result.offset<0?-.55*t+.3*t*t:-.12*t-.055*Math.abs(Math.sin(t*Math.PI*3));
  }else{
    x=side*.3*t;
    y=-(result.bases===4?1:result.bases===2?.7:.45)*t+.13*t*t;
  }
  return {contact,x,y,scale:1-.75*t,alpha:1-t**3,
    impact:Math.max(0,1-Math.max(0,milliseconds)/180)*(result.kind==='hit'?1:.45)};
}

// Bases: 0 = batter's box/home, 1/2/3 = occupied bases, 4 = scored.
export function runnerPaths(before, result) {
  if(!['hit','walk'].includes(result.kind))return [];
  const paths=[];
  before.forEach((occupied,i)=>{
    if(!occupied)return;
    const from=i+1;
    const forced=before.slice(0,i+1).every(Boolean);
    paths.push({from,to:result.kind==='hit'?Math.min(4,from+result.bases):forced?from+1:from});
  });
  paths.push({from:0,to:result.kind==='hit'?result.bases:1});
  return paths;
}
const DIAMOND=[[50,84],[82,52],[50,20],[18,52],[50,84]];
export function runnerFrame(path, elapsed, reduced=false){
  const travel=reduced?path.to-path.from:Math.max(0,(elapsed-350)/260);
  const base=Math.min(path.to,path.from+travel),index=Math.min(3,Math.floor(base));
  const amount=base-index,a=DIAMOND[index],b=DIAMOND[index+1];
  return {x:a[0]+(b[0]-a[0])*amount,y:a[1]+(b[1]-a[1])*amount,scored:base>=4};
}
export const feedbackDuration=result=>result?.ended?1900:1250;
