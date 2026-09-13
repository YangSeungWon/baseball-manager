const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function pitchTarget(zone,intent){const edge=intent==='chase'?1.4:.8;return {x:zone==='in'?-edge:zone==='out'?edge:0,z:zone==='low'?-edge:zone==='high'?edge:0};}
export function pitchPressure(s){return clamp(.24+s.bases.filter(Boolean).length*.12+s.balls*.07+s.runs*.12-(s.outs-1)*.06,.15,.9);}
// The displayed marker is the actual release error; pressure never adds a hidden penalty.
// `mode`: true/'calm' 은 숨 고르기(흔들림 ¼), 'max' 는 전력 투구(흔들림 1.6배). 표시된 값이 곧 실제 오차다.
export function releaseMarker(progress,pressure,mode=false){const p=clamp(progress,0,1),wobble=mode===true||mode==='calm'?.035:mode==='max'?.22:.14;return clamp(p*2-1-Math.sin(p*Math.PI*6)*pressure*wobble,-1,1);}
export const EFFORT={calm:{speed:-1,contact:.02,fatigue:.6,label:'숨 고르기'},normal:{speed:0,contact:0,fatigue:1,label:''},max:{speed:4,contact:-.06,fatigue:2.2,label:'전력'}};
export function controlledPitch(zone,intent,release,noiseX=0,noiseZ=0){
  const target=pitchTarget(zone,intent);
  return {target,x:target.x+release*.7+noiseX*.03,z:target.z-release*.95+noiseZ*.03};
}
export function releaseLabel(value){return Math.abs(value)<=.12?'정확한 릴리스':value<0?'빠른 릴리스':'늦은 릴리스';}
