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
  if(!materials.has(key)){const m=source.clone();if(tint)m.color.set(tint);materials.set(key,m);}return materials.get(key);
 };
 return (key,color)=>{
  const model=clone(template),root=new T.Group(),body=new T.Group();root.add(body);
  const rig=model.getObjectByName('AthleteRig');body.add(rig);
  const bone=name=>rig.getObjectByName(name);
  const head=bone('Head'),arms=['L','R'].map(s=>bone('UpperArm'+s)),legs=['L','R'].map(s=>bone('Thigh'+s));
  const gear=(name,parent,offset=new T.Vector3())=>{const g=model.getObjectByName(name);parent.add(g);g.position.copy(offset);g.rotation.set(0,0,0);return g;};
  const cap=gear('Cap',head),helmet=gear('Helmet',head),glove=gear('Glove',bone('HandL'),new T.Vector3(0,-.06,.04)),bat=gear('Bat',bone('HandR'));
  const offense=key==='bat'||key.startsWith('r')||key.startsWith('change')||key.startsWith('celebrant');cap.visible=!offense;helmet.visible=offense;
  const idleSeed=[...key].reduce((n,c)=>n*31+c.charCodeAt(0),0)%997;
  const skin=['#c98b62','#d9a27b','#ac704d'][Math.abs(idleSeed)%3];
  const meshes=[];body.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;meshes.push({o,source:o.material});}});
  let currentColor;
  const setColor=c=>{if(c===currentColor)return;currentColor=c;for(const {o,source} of meshes)o.material=material(source,c,skin);};setColor(color);
  root.scale.setScalar(1.35);
  return {root,body,head,arms,legs,elbows:['L','R'].map(s=>bone('Forearm'+s)),knees:['L','R'].map(s=>bone('Shin'+s)),feet:['L','R'].map(s=>bone('Foot'+s)),cap,helmet,glove,gloveRest:glove.position.clone(),bat,setColor,idleSeed,labelHeight:.45,phase:0,last:null};
 };
}
