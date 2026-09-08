// Keep the landing point exact; move only overlapping number labels.
export function layoutPitchMarkers(events) {
  const placed=[];
  return events.map(e=>{
    const x=100+e.pitch.x*38,y=96-e.pitch.z*40;
    let label=null;
    for(let radius=0;radius<=240&&!label;radius+=24) {
      const steps=radius?Math.ceil(2*Math.PI*radius/20):1;
      for(let i=0;i<steps;i++) {
        const angle=-Math.PI/2+i*2*Math.PI/steps;
        const cx=Math.max(14,Math.min(186,x+Math.cos(angle)*radius));
        const cy=Math.max(14,Math.min(168,y+Math.sin(angle)*radius));
        if(placed.every(p=>Math.hypot(p.x-cx,p.y-cy)>=24)){label={x:cx,y:cy};break;}
      }
    }
    label??={x,y};placed.push(label);
    return {event:e,x,y,labelX:label.x,labelY:label.y};
  });
}
