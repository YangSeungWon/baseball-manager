const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function pitchTarget(zone,intent){const edge=intent==='chase'?1.4:.8;return {x:zone==='in'?-edge:zone==='out'?edge:0,z:zone==='low'?-edge:zone==='high'?edge:0};}
export function pitchPressure(s){return clamp(.24+s.bases.filter(Boolean).length*.12+s.balls*.07+s.runs*.12-(s.outs-1)*.06,.15,.9);}
// The displayed marker is the actual release error; pressure never adds a hidden penalty.
export function releaseMarker(progress,pressure,calm=false){const p=clamp(progress,0,1);return clamp(p*2-1-Math.sin(p*Math.PI*6)*pressure*(calm?.035:.14),-1,1);}
export function controlledPitch(zone,intent,release,noiseX=0,noiseZ=0){
  const target=pitchTarget(zone,intent);
  return {target,x:target.x+release*.7+noiseX*.03,z:target.z-release*.95+noiseZ*.03};
}
export function releaseLabel(value){return Math.abs(value)<=.12?'정확한 릴리스':value<0?'빠른 릴리스':'늦은 릴리스';}
