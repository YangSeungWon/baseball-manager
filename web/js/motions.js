import * as T from '../vendor/three/three.module.min.js';
import {loadPlayerModel,createPlayerFactory} from './player-model.js';
import {Live3D} from './live3d.js';
const $=s=>document.querySelector(s),stage=$('#stage');
try{
 await loadPlayerModel();
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;stage.prepend(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color('#12262b');
 scene.add(new T.HemisphereLight('#fff3dc','#52656d',2.5));const light=new T.DirectionalLight('#fff1d6',3);light.position.set(2,5,4);scene.add(light);
 const floor=new T.Mesh(new T.CircleGeometry(4,64),new T.MeshStandardMaterial({color:'#284347',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.02;scene.add(floor);
 const grid=new T.GridHelper(8,16,'#536c6c','#375253');scene.add(grid);
 const make=createPlayerFactory(),players={bat:make('bat','#cf7756'),fielder:make('fP','#427c83')};for(const p of Object.values(players))scene.add(p.root);
 const camera=new T.PerspectiveCamera(38,1,.1,30);let angle=.45,elevation=1.8,progress=0,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,last=performance.now(),kind='pitch';
 const driver={player:key=>key==='bat'?players.bat:players.fielder,reducedMotion:true,animationTime:0};
 const labels={field:'수비 준비 · 고정 자세',catch:'포구 · 고정 자세',dive:'다이빙 · 고정 자세',crouch:'포수 · 고정 자세',walk:'걷기 · 제자리',run:'달리기 · 제자리'};
 function draw(){
  const t=progress,bat=kind==='bat',p=bat?players.bat:players.fielder;
  players.bat.root.visible=bat;players.fielder.root.visible=!bat;
  const S={pitcherWind:0,swing:0,ball:null};let caption=labels[kind]||'';
  if(kind==='pitch'){
   // Same .9 s wind-up and decreasing release parameter as LiveView._pitch.
   const seconds=t*1.8;
   if(seconds<.9){S.pitcherWind=seconds/.9;caption=seconds<.35?'준비':'와인드업';}
   else{S.pitcherWind=Math.max(0,1-(seconds-.9)/.43);S.ball={x:0,y:-10,z:1,vis:true};caption=seconds<1.04?'릴리스':'팔로스루';}
  }
  if(bat){S.swing=t<.2?0:t<.75?(t-.2)/.55:1;caption=t<.2?'타격 준비':t<.46?'스윙':t<.75?'회전':'팔로스루';}
  const locomotion=['run','walk'].includes(kind);
  p.last=locomotion?{x:0,y:.01}:null;p.phase=t*Math.PI*4-(kind==='walk'?.048:.029);
  Live3D.prototype.updatePlayer.call(driver,bat?'bat':'fP',{x:0,y:0,hand:$('#hand').value},bat?'#cf7756':'#427c83',kind,S);
  // Neutral orientation makes front / side / back comparable across poses.
  p.root.rotation.y=0;
  camera.position.set(Math.sin(angle)*5.5,elevation,Math.cos(angle)*5.5);camera.lookAt(0,1.35,0);
  renderer.render(scene,camera);$('#caption').textContent=caption;$('#scrub').value=Math.round(t*1000);$('#progress').value=Math.round(t*100)+'%';
 }
 const resize=new ResizeObserver(()=>{const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();draw();});resize.observe(stage);
 function syncPlay(){$('#play').textContent=playing?'일시정지':'재생';}
 $('#motion').onchange=e=>{kind=e.target.value;progress=0;$('#handLabel').hidden=kind!=='bat';draw();};
 $('#hand').onchange=draw;$('#play').disabled=false;$('#play').onclick=()=>{playing=!playing;syncPlay();};
 $('#scrub').oninput=e=>{playing=false;syncPlay();progress=Number(e.target.value)/1000;draw();};
 $('#reset').onclick=()=>{progress=0;draw();};document.querySelectorAll('[data-angle]').forEach(b=>b.onclick=()=>{angle=Number(b.dataset.angle);draw();});
 let drag=null;stage.onpointerdown=e=>{if(e.target!==renderer.domElement)return;drag={x:e.clientX,y:e.clientY};stage.setPointerCapture(e.pointerId);};stage.onpointermove=e=>{if(!drag)return;angle-=(e.clientX-drag.x)*.012;elevation=T.MathUtils.clamp(elevation+(e.clientY-drag.y)*.012,.5,4);drag={x:e.clientX,y:e.clientY};draw();};stage.onpointerup=stage.onpointercancel=()=>{drag=null;};
 $('#loading').hidden=true;syncPlay();
 function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;if(playing&&!document.hidden){progress=(progress+dt*Number($('#speed').value)/1.8)%1;draw();}requestAnimationFrame(frame);}requestAnimationFrame(frame);draw();
}catch(e){console.error(e);$('#loading').textContent='선수를 불러오지 못했습니다. 새로고침해 주세요.';}
