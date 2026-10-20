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
