import {Live3D, loadPlayerModel} from './live3d.js';
import {parkDims} from './core/bip.js';
import {FIELD_POSITIONS, sampleField} from './field-sim.js';
import {BATTING_ZONE} from './batting-space.js';
import {WINDUP_MS} from './quick-game.js';

export const prepareQuickThree=loadPlayerModel;

const colors={home:'#34646f',away:'#ddb26b'};
const park={name:'PROJECT DUGOUT',weather:'clear'};
const bases=[[0,0],[19.4,19.4],[0,38.8],[-19.4,19.4],[0,0]];
const stationary=Object.entries(FIELD_POSITIONS).map(([pos,[x,y]])=>({pos,x,y}));

export function openQuickThree(host,onLost){
  const view=new Live3D(host,parkDims(park),{
    home:'DUGOUT',away:'VISITORS',colors,park,crowd:20,cap:100,playerRole:'batter',
  },onLost);
  view.renderer.shadowMap.enabled=false;
  view.canvas.classList.add('quick-three');
  view.canvas.tabIndex=-1;
  view.canvas.setAttribute('aria-hidden','true');
  view.fade.style.display='none';
  return {
    dispose:()=>view.dispose(),
    draw({width,height,elapsed,phase,game,pitch,runners,replay,projectCourse,swingAt,reduced}){
      view.resize(width,height);
      const field=phase==='feedback'&&(replay||runners.length)&&(reduced||elapsed>=90);
      const replayTime=replay?replay.end*Math.min(1,Math.max(0,elapsed-90)/1050):0;
      let ball=null,fielders=stationary;
      if(field&&replay){
        const sample=sampleField(replay.play,reduced?replay.end:replayTime);
        ball={...sample,vis:true};
        if(sample.fielders.length)fielders=sample.fielders;
      }else if(phase==='flight'||phase==='feedback'&&!field){
        const progress=phase==='flight'?elapsed/pitch.flight:(swingAt??pitch.flight)/pitch.flight;
        const course=projectCourse(pitch,progress);
        const t=Math.max(0,Math.min(1,progress));
        ball={x:course.x*BATTING_ZONE.halfWidth,y:18.44*(1-progress),
          z:1.72+(BATTING_ZONE.center-1.72)*t+course.z*BATTING_ZONE.halfHeight,vis:true};
      }
      const onBase=field?runners:game.bases.flatMap((occupied,i)=>occupied?[{base:i+1}]:[]);
      const runnerModels=onBase.filter(r=>!r.scored).map(({base})=>{
        const i=Math.min(3,Math.floor(base)),fraction=base-i;
        return {x:bases[i][0]+(bases[i+1][0]-bases[i][0])*fraction,
          y:bases[i][1]+(bases[i+1][1]-bases[i][1])*fraction};
      });
      view.render({
        inning:1,half:'bottom',b:game.balls,s:game.strikes,outs:game.outs,
        fielders:Object.fromEntries(fielders.map(f=>[f.pos,{...f,hand:game.pitcher.hand,
          ...(f.pos==='P'?{name:game.pitcher.name,pose:field?'field':'pitch'}:{})}])),
        catcher:true,runners:runnerModels,batter:field?null:{name:'타자',hand:'R'},
        ball,trail:[],broadcast:{kind:field?'field':'pitch'},
        pitcherWind:phase==='windup'?elapsed/WINDUP_MS:phase==='flight'?1:0,
        pitchStyle:{type:pitch?.type},swing:swingAt!==null&&phase==='feedback'&&!field ? .7 : 0,
      },colors,{top:[0],bottom:[game.runs],hits:{top:0,bottom:game.hits},err:{top:0,bottom:0}},performance.now()/1000);
    },
  };
}
