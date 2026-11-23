import {PerspectiveCamera, Vector3} from '../vendor/three/three.module.min.js';
import {FIELD_POSITIONS, simulateField, sampleField} from './field-sim.js';
import {fence, parkDims} from './core/bip.js';

export const FIELD_REPLAY_START_MS=90;

const bases=[[0,0],[19.4,19.4],[0,38.8],[-19.4,19.4],[0,0]];
const dims=parkDims();
const fielders=Object.values(FIELD_POSITIONS);
const wall=Array.from({length:33},(_,i)=>{
  const angle=i*90/32-45;
  const radians=angle*Math.PI/180;
  const distance=fence(angle,dims);
  return [Math.sin(radians)*distance,Math.cos(radians)*distance];
});

export function makeFieldReplay(result){
  if(!['hit','foul','out'].includes(result.kind))return null;
  const side=result.offset<0?-1:1;
  const homer=result.bases===4;
  const grounder=result.kind==='out'&&result.offset>=0;
  const play=simulateField({
    speed:homer?52:result.bases===2?42:grounder?27:34,
    launch:homer?30:grounder?-8:result.kind==='out'?43:result.kind==='foul'?23:14,
    angle:side*(result.kind==='foul'?57:result.bases===2?32:18),
    positions:result.kind==='out'?FIELD_POSITIONS:{},
  });
  if(result.kind==='out')return {play,end:play.duration};
  const end=play.events.find(event=>homer?event.type==='home-run':event.type==='bounce')?.t??play.duration;
  return {play,end:Math.min(play.duration,end+(homer?0:.45))};
}

export function drawFieldReplay(ctx,w,h,replay,runners,elapsed,reduced,launchPoint){
  const replayElapsed=Math.max(0,elapsed-FIELD_REPLAY_START_MS);
  const time=replay?replay.end*Math.min(1,replayElapsed/1050):0;
  const ball=replay&&!reduced?sampleField(replay.play,time):null;
  const follow=ball?Math.min(1,time/2):0;
  const camera=new PerspectiveCamera(42,w/h,.1,400);
  const distance=Math.max(160,137/(w/h));
  camera.position.set((ball?.x??0)*.18*follow,distance*.87,distance*.65);
  camera.lookAt((ball?.x??0)*.13*follow,0,-(53+(ball?.y??0)*.1*follow));
  camera.updateMatrixWorld();
  const point=new Vector3();
  function projectField(x,y,z=0){
    point.set(x,z,-y).project(camera);
    return [(point.x+1)*w/2,(1-point.y)*h/2+h*.08];
  }
  let offsetX=0,offsetY=0;
  if(launchPoint&&replayElapsed<420){
    // Start the wide shot at the outgoing ball, then ease out the framing shift.
    const launch=sampleField(replay.play,0);
    const [x,y]=projectField(launch.x,launch.y,launch.z);
    const progress=replayElapsed/420;
    const weight=1-progress*progress*(3-2*progress);
    offsetX=(launchPoint[0]-x)*weight;
    offsetY=(launchPoint[1]-y)*weight;
  }
  function project(x,y,z=0){
    const [sx,sy]=projectField(x,y,z);
    return [sx+offsetX,sy+offsetY];
  }
  function shape(vertices,color){
    ctx.beginPath();
    vertices.forEach((v,i)=>{
      const [x,y]=project(...v);
      if(i)ctx.lineTo(x,y);
      else ctx.moveTo(x,y);
    });
    ctx.closePath();
    ctx.fillStyle=color;
    ctx.fill();
  }
  function dot(x,y,r,color){
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle=color;
    ctx.fill();
  }
  ctx.fillStyle='#203a4c';
  ctx.fillRect(0,0,w,h);
  shape([[-110,-90],[110,-90],[110,120],[-110,120]],'#294d3a');
  shape([[0,0],...wall],'#3b6e50');
  for(let i=1;i<wall.length;i++){
    const a=wall[i-1],b=wall[i];
    shape([a,b,[...b,3],[...a,3]],i%2?'#335264':'#3b5969');
  }
  shape([[0,-4],[24,19.4],[0,43],[-24,19.4]],'#a27a53');
  shape([[0,5],[14,19.4],[0,33],[-14,19.4]],'#3b6e50');
  for(const edge of [wall[0],wall.at(-1)]){
    ctx.beginPath();
    ctx.moveTo(...project(0,0));
    ctx.lineTo(...project(...edge));
    ctx.strokeStyle='#e8dfbe';
    ctx.lineWidth=1.4;
    ctx.stroke();
  }
  for(const [x,y] of bases.slice(0,4)){
    shape([[x-1.4,y],[x,y+1.4],[x+1.4,y],[x,y-1.4]],'#fff0d5');
  }
  const defenders=ball?.fielders.length?ball.fielders.map(({x,y})=>[x,y]):fielders;
  for(const [x,y] of defenders){
    const [sx,sy]=project(x,y);
    dot(sx,sy,4,'#203a4c');
    dot(sx,sy,2.5,'#c2d8e4');
  }
  for(const runner of runners){
    if(runner.scored)continue;
    const index=Math.min(3,Math.floor(runner.base));
    const t=runner.base-index;
    const [x,y]=bases[index].map((v,i)=>v+(bases[index+1][i]-v)*t);
    const [sx,sy]=project(x,y);
    dot(sx,sy,6,'#16392f');
    dot(sx,sy,4.5,'#f2d18b');
  }
  if(ball){
    const [x,y]=project(ball.x,ball.y,ball.z);
    dot(...project(ball.x,ball.y),3,'#1a342b');
    dot(x,y,6,'#1a342b');
    dot(x,y,4.2,'#fff9e9');
  }
}
