import * as T from '../vendor/three/three.module.min.js';
import {GLTFLoader} from '../vendor/three/loaders/GLTFLoader.js';
import {clone} from '../vendor/three/utils/SkeletonUtils.js';
let asset=null,pending=null;
export function loadPlayerModel(){
 if(asset)return Promise.resolve(asset);
 return pending??=new GLTFLoader().loadAsync(new URL('../models/athlete.glb',import.meta.url).href).then(g=>{asset=g.scene;return asset;}).catch(e=>{pending=null;throw e;});
}
export function createPlayerFactory(){
 if(!asset)throw new Error('Player model must load before the ballpark');
 // One geometry copy per ballpark, shared by its independently posed players.
 const template=clone(asset),geometries=new Map(),materials=new Map();
 template.traverse(o=>{if(o.isMesh){if(!geometries.has(o.geometry))geometries.set(o.geometry,o.geometry.clone());o.geometry=geometries.get(o.geometry);}});
 const material=(source,color,skin)=>{
  const tint=source.name==='Team'?color:source.name==='Skin'?skin:null,key=source.name+':'+(tint||'');
  if(!materials.has(key)){const m=source.clone();if(tint)m.color.set(tint);
   // 소재별 반사. 천은 거칠고 피부·헬멧·가죽은 빛을 조금 받아야 입체가 산다.
   const rough={Team:.80,Cream:.84,Skin:.52,Dark:.42,Leather:.88,Pocket:.95,Stitch:.7}[source.name];if(rough!==undefined&&'roughness' in m)m.roughness=rough;
   materials.set(key,m);}return materials.get(key);
 };
 return (key,color)=>{
  const model=clone(template),root=new T.Group(),body=new T.Group();root.add(body);
  const rig=model.getObjectByName('AthleteRig');body.add(rig);
  const bone=name=>rig.getObjectByName(name);
  const head=bone('Head'),arms=['L','R'].map(s=>bone('UpperArm'+s)),legs=['L','R'].map(s=>bone('Thigh'+s));
  const gear=(name,parent,offset=new T.Vector3())=>{const g=model.getObjectByName(name);parent.add(g);g.position.copy(offset);g.rotation.set(0,0,0);return g;};
  const face=gear('FaceFeatures',head),cap=gear('Cap',head),helmet=gear('Helmet',head),glove=gear('Glove',bone('HandL'),new T.Vector3(0,-.06,.04)),bat=gear('Bat',bone('HandR'));
  const offense=key==='bat'||key.startsWith('r')||key.startsWith('change')||key.startsWith('celebrant');cap.visible=!offense;helmet.visible=offense;
  const idleSeed=[...key].reduce((n,c)=>n*31+c.charCodeAt(0),0)%997;
  const skin=['#c98b62','#d9a27b','#ac704d'][Math.abs(idleSeed)%3];
  const meshes=[];body.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;meshes.push({o,source:o.material});}});
  let currentColor;
  const setColor=c=>{if(c===currentColor)return;currentColor=c;for(const {o,source} of meshes)o.material=material(source,c,skin);};setColor(color);
  root.scale.setScalar(1.35);
  const faceNodes={eyes:['L','R'].map(s=>face.getObjectByName('Eye'+s)),irises:['L','R'].map(s=>face.getObjectByName('Iris'+s)),pupils:['L','R'].map(s=>face.getObjectByName('Pupil'+s)),brows:['L','R'].map(s=>face.getObjectByName('Brow'+s)),mouths:['L','R'].map(s=>face.getObjectByName('Mouth'+s))};
  for(const o of [...faceNodes.eyes,...faceNodes.irises,...faceNodes.pupils,...faceNodes.brows,...faceNodes.mouths])o.userData.rest={position:o.position.clone(),scale:o.scale.clone(),rotation:o.rotation.clone()};
  return {root,body,head,face,faceNodes,hips:bone('Root'),spine:bone('Spine'),hands:['L','R'].map(s=>bone('Hand'+s)),arms,legs,elbows:['L','R'].map(s=>bone('Forearm'+s)),knees:['L','R'].map(s=>bone('Shin'+s)),feet:['L','R'].map(s=>bone('Foot'+s)),cap,helmet,glove,gloveRest:glove.position.clone(),bat,setColor,idleSeed,labelHeight:.45,phase:0,last:null};
 };
}

// Lightweight facial rig shared by gameplay and the motion inspector.
export function posePlayerFace(p,expression,time,gazeX=0,gazeY=0){
 const f=p.faceNodes;if(!f)return;
 const blinkPhase=((time+p.idleSeed*.37)%4.3),blink=blinkPhase>.10?1:Math.max(.06,Math.abs(blinkPhase-.05)/.05);
 for(const o of [...f.eyes,...f.irises,...f.pupils]){o.scale.copy(o.userData.rest.scale);o.scale.y*=blink;}
 for(let i=0;i<2;i++){
  const pupil=f.pupils[i],iris=f.irises[i];
  for(const o of [pupil,iris]){o.position.copy(o.userData.rest.position);o.position.x+=T.MathUtils.clamp(gazeX,-1,1)*.008;o.position.y+=T.MathUtils.clamp(gazeY,-1,1)*.006;}
  const brow=f.brows[i];brow.position.copy(brow.userData.rest.position);brow.rotation.copy(brow.userData.rest.rotation);
  brow.rotation.z=(i?1:-1)*(expression==='focus'?.16:expression==='sad'?- .18:expression==='joy'?0:0);
  brow.position.y+=expression==='focus'?-.008:expression==='joy'?.006:0;
 }
 for(let i=0;i<2;i++){
  const mouth=f.mouths[i];mouth.position.copy(mouth.userData.rest.position);mouth.scale.copy(mouth.userData.rest.scale);mouth.rotation.copy(mouth.userData.rest.rotation);
  if(expression==='joy'){mouth.rotation.z=i?.22:-.22;mouth.position.y+=.006;}
  else if(expression==='sad'){mouth.rotation.z=i?-.18:.18;mouth.position.y-=.004;}
  else if(expression==='focus'){mouth.scale.x=.72;mouth.position.x+=(i?-.006:.006);}
 }
}

// Two-bone arm posing keeps both hands on the same bat grip.
export function reachPlayerHand(p,index,target,pole){
 const upper=p.arms[index],lower=p.elbows[index],hand=p.hands[index];
 const origin=upper.position,delta=target.clone().sub(origin),a=lower.position.length(),b=hand.position.length();
 const distance=Math.min(a+b-.001,Math.max(.001,delta.length())),axis=delta.normalize();
 const bend=pole.clone().sub(origin);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
 const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
 const elbow=origin.clone().addScaledVector(axis,along).addScaledVector(bend,height);
 upper.quaternion.setFromUnitVectors(lower.position.clone().normalize(),elbow.clone().sub(origin).normalize());
 lower.quaternion.setFromUnitVectors(hand.position.clone().normalize(),origin.clone().addScaledVector(axis,distance).sub(elbow).applyQuaternion(upper.quaternion.clone().invert()).normalize());
}

// Reach with the body and a fixed-length arm; equipment stays attached to the hand.
export function reachPlayerGlove(p,worldTarget){
 p.root.updateMatrixWorld(true);
 const local=p.root.worldToLocal(worldTarget.clone()),low=T.MathUtils.clamp((1.35-local.y)/1.1,0,1);
 p.body.position.y=-low*.34;
 p.body.rotation.x=low*.24+T.MathUtils.clamp(local.z*.10,-.12,.18);
 p.body.rotation.z=-T.MathUtils.clamp(local.x*.22,-.25,.25);
 for(let i=0;i<2;i++){
  p.legs[i].rotation.x=-low*.62;p.knees[i].rotation.x=low*1.15;
  p.feet[i].rotation.x=-(p.legs[i].rotation.x+p.knees[i].rotation.x+p.body.rotation.x);
 }
 p.root.updateMatrixWorld(true);
 const ankle=Math.min(...p.feet.map(foot=>foot.getWorldPosition(new T.Vector3()).y));
 p.body.position.y+=(p.root.position.y+.116*p.root.scale.y-ankle)/p.root.scale.y;
 p.root.updateMatrixWorld(true);
 const target=p.spine.worldToLocal(worldTarget.clone());
 // Palm center in hand space. Keep the glove socket unchanged even when unreachable.
 const palm=p.gloveRest.clone().add(new T.Vector3(0,-.055,.027));
 reachPlayerHand(p,0,target.sub(palm),new T.Vector3(-.65,-.10,.10));
 p.hands[0].quaternion.copy(p.arms[0].quaternion.clone().multiply(p.elbows[0].quaternion).invert());
 p.glove.position.copy(p.gloveRest);
}
