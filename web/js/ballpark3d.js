// Scenic assets are deterministic and independent of the simulation RNG.
import * as T from '../vendor/three/three.module.min.js';
const p=(x,y,z=0)=>new T.Vector3(x,z,-y);
const hash=s=>[...String(s)].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261);
export function buildSurroundings(v, opts) {
  let seed=hash(`${opts.home}/${opts.day ?? opts.crowd ?? 0}`);
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const mode=opts.park?.dome?'indoor':['clear','overcast','evening'].includes(opts.park?.weather)?opts.park.weather:['clear','overcast','evening'][seed%3];
  v.atmosphere=mode;
  const palettes={clear:['#73acd2','#d9e4d8'],overcast:['#748d9d','#c1cbc6'],evening:['#233b68','#e7ae82'],indoor:['#283744','#5d7074']};
  const [top,bottom]=palettes[mode];
  const skyCanvas=document.createElement('canvas');skyCanvas.width=16;skyCanvas.height=256;
  const sc=skyCanvas.getContext('2d'),grad=sc.createLinearGradient(0,0,0,256);grad.addColorStop(0,top);grad.addColorStop(1,bottom);sc.fillStyle=grad;sc.fillRect(0,0,16,256);
  const skyTex=new T.CanvasTexture(skyCanvas);skyTex.colorSpace=T.SRGBColorSpace;v.textures.push(skyTex);
  const sky=new T.Mesh(new T.SphereGeometry(390,32,16),new T.MeshBasicMaterial({map:skyTex,side:T.BackSide,depthWrite:false,fog:false}));sky.position.y=30;v.scene.add(sky);
  v.skyState={canvas:skyCanvas,ctx:sc,texture:skyTex,mesh:sky,mode};
  v.scene.fog=new T.Fog(bottom,180,360);
  v.sun.intensity=mode==='overcast'?1.1:mode==='evening'?1.8:mode==='indoor'?1.6:3.1;
  v.sun.color.set(mode==='evening'?'#ffc18a':'#fff0d8');
  v.ambient.intensity=mode==='evening'?1.6:2.1;
  if(mode!=='indoor') {
    const cloudMat=new T.MeshBasicMaterial({color:mode==='overcast'?'#b9c5c7':'#e2dfcf',transparent:true,opacity:.52,depthWrite:false,fog:false});
    for(let i=0;i<(mode==='overcast'?18:9);i++) {
      const cloud=new T.Mesh(v.sphere,cloudMat);cloud.position.set((rand()-.5)*480,85+rand()*35,-100-rand()*140);cloud.scale.set(25+rand()*35,2+rand()*4,9+rand()*12);v.scene.add(cloud);
    }
  }
  // Continuous foul ground and infield bowl. The playing-field dimensions stay unchanged.
  v.slab([[-86,67],[-95,15],[-63,-45],[0,-60],[63,-45],[95,15],[86,67],[0,-8]],'#39744d',.006);
  const bowl=(r)=>{const a=[];for(let angle=65;angle<=295;angle+=2){const t=angle*Math.PI/180;a.push([Math.sin(t)*(69+r),25+Math.cos(t)*(54+r)]);}return a;};
  const places=[];
  for(let row=0;row<10;row++) {
    v.slab([...bowl(row*1.5+1.6),...bowl(row*1.5).reverse()],row%2?'#51646b':'#596d73',1.2+row*.85);
    const edge=bowl(row*1.5);
    for(let j=1;j<edge.length;j++) {
      const a=p(...edge[j-1]),b=p(...edge[j]),delta=b.clone().sub(a);
      const fascia=v.mesh(v.box,'#3e535b',v.scene,[.14,.85,delta.length()+.05]);
      fascia.position.copy(a.add(b).multiplyScalar(.5));fascia.position.y=.775+row*.85;fascia.rotation.y=Math.atan2(delta.x,delta.z);
    }
    for(let j=0;j<140;j++) {
      if(j%20===0 || j%20===1)continue;
      const a=(66+j*228/139)*Math.PI/180,r=row*1.5+.7;
      places.push({x:Math.sin(a)*(69+r),y:25+Math.cos(a)*(54+r),z:1.6+row*.85,angle:-a});
    }
  }
  // Existing outfield terraces receive fans as well.
  for(let row=0;row<7;row++)for(let j=0;j<100;j++){
    const a=(-62+j*124/99)*Math.PI/180;
    const r=v.fenceAt(Math.max(-45,Math.min(45,a*180/Math.PI)))+7+row*2.3;
    places.push({x:Math.sin(a)*r,y:Math.cos(a)*r,z:2.7+row*1.15,angle:-a,outfield:true});
  }
  const chairPlaces=places.filter(q=>!q.outfield),chair=new T.InstancedMesh(v.box,v.material('#466778'),chairPlaces.length);
  const d=new T.Object3D();
  chairPlaces.forEach((q,i)=>{d.position.copy(p(q.x,q.y,q.z));d.rotation.set(0,q.angle,0);d.scale.set(.9,.65,.85);d.updateMatrix();chair.setMatrixAt(i,d.matrix);});v.scene.add(chair);
  const fill=opts.crowd!=null && opts.cap>0?Math.max(0,Math.min(1,opts.crowd/opts.cap)):.62;
  const occupied=places.filter(()=>rand()<fill);
  const shirts=new T.InstancedMesh(v.box,v.material('#ffffff'),occupied.length);
  const heads=new T.InstancedMesh(v.sphere,v.material('#cda37e'),occupied.length);
  const palette=[opts.colors.home,opts.colors.away,'#c8d4d0','#d3ba87','#36515e','#967768'];
  occupied.forEach((q,i)=>{d.position.copy(p(q.x,q.y,q.z+.5));d.rotation.set(0,q.angle,0);d.scale.set(.6,.7,.4);d.updateMatrix();shirts.setMatrixAt(i,d.matrix);shirts.setColorAt(i,new T.Color(palette[Math.floor(rand()*palette.length)]));d.position.y+=.54;d.scale.set(.20,.23,.20);d.updateMatrix();heads.setMatrixAt(i,d.matrix);});
  v.crowdClock={value:0};v.crowdEnergy={value:0};
  for(const mesh of [shirts,heads]) {
    mesh.material=mesh.material.clone();
    mesh.material.onBeforeCompile=shader=>{
      shader.uniforms.crowdClock=v.crowdClock;shader.uniforms.crowdEnergy=v.crowdEnergy;
      shader.vertexShader='uniform float crowdClock; uniform float crowdEnergy;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += (crowdEnergy * (.35 + .22 * sin(crowdClock * 7.0 + instanceMatrix[3].x)) + .035 * sin(crowdClock * 1.7 + instanceMatrix[3].x * .8 + instanceMatrix[3].z)) / max(.01, length(instanceMatrix[1].xyz));');
    };
  }
  v.scene.add(shirts,heads);v.crowdCount=occupied.length;v.seatCount=places.length;
  // Home-plate concourse and press box visible behind pitcher-to-batter shots.
  v.mesh(v.box,'#394e59',v.scene,[80,5,10],[0,12,41]);
  for(let x=-36;x<=36;x+=6)v.mesh(v.box,'#93b6bc',v.scene,[4.7,2.2,.15],[x,12,35.9]);
  v.mesh(v.box,'#263d47',v.scene,[85,.5,15],[0,15,39]);
  for(const side of [-1,1]) {
    const g=new T.Group();g.position.copy(p(side*32,7));g.rotation.y=side*Math.PI/4;v.scene.add(g);
    v.mesh(v.box,'#9b927c',g,[16,.15,5],[0,.08,0]);
    v.mesh(v.box,'#344a50',g,[16,2.7,.2],[0,1.4,-2.5]);
    v.mesh(v.box,side===1?opts.colors.home:opts.colors.away,g,[16,.3,5.8],[0,3.0,0]);
    for(const x of [-7.6,7.6])v.mesh(v.box,'#627777',g,[.2,2.8,5],[x,1.4,0]);
    v.mesh(v.box,'#a9865d',g,[13,.2,.7],[0,.6,-1.6]);
    for(let i=0;i<8;i++) {
      v.mesh(v.cylinder,side===1?opts.colors.home:opts.colors.away,g,[.26,.65,.23],[-5.5+i*1.5,1.1,-1.6]);
      v.mesh(v.sphere,'#c99f7b',g,[.19,.22,.19],[-5.5+i*1.5,1.65,-1.6]);
    }
    // On-deck circles and bullpen pitching lanes.
    const disc=v.mesh(new T.CircleGeometry(1.8,32),'#b18b66',v.scene);disc.rotation.x=-Math.PI/2;disc.position.copy(p(side*10,-3,.06));
    v.mesh(v.box,'#ad8760',v.scene,[4,.06,23],[side*77,.04,-44]);
    for(const y of [34,53])v.mesh(v.box,'#f2e8d0',v.scene,[.6,.1,.2],[side*77,.13,-y]);
  }
  // Fine protective netting with open sightlines for the field cameras.
  const net=[];for(let x=-20;x<=20;x+=1.5)net.push(x,0,13,x,10,13);for(let h=1;h<=10;h++)net.push(-20,h,13,20,h,13);
  const ng=new T.BufferGeometry();ng.setAttribute('position',new T.Float32BufferAttribute(net,3));v.scene.add(new T.LineSegments(ng,new T.LineBasicMaterial({color:'#435961',transparent:true,opacity:.22})));
  for(const x of [-20,0,20])v.mesh(v.cylinder,'#586e73',v.scene,[.07,11,.07],[x,5.5,13]);
  // Local-looking skyline, trees and hills, all outside the playable area.
  for(let i=0;i<22;i++) {
    const x=(i-10.5)*19,depth=190+rand()*40,h=10+rand()*35;
    v.mesh(v.box,['#647c86','#71878b','#536d79'][i%3],v.scene,[10+rand()*8,h,9],[x,h/2,-depth]);
    if(i%3===0)v.mesh(v.box,'#a7b9ad',v.scene,[6,1,10],[x,h*.7,-depth+.2]);
  }
  for(let i=0;i<45;i++) {
    const a=rand()*Math.PI*2,r=165+rand()*35,x=Math.sin(a)*r,y=30+Math.cos(a)*r;
    v.mesh(v.cylinder,'#72604b',v.scene,[.35,4,.35],[x,2,-y]);v.mesh(v.sphere,'#3f6557',v.scene,[3,5,3],[x,7,-y]);
  }
  for(let i=0;i<9;i++)v.mesh(v.sphere,'#617b78',v.scene,[45,18+rand()*28,30],[(i-4)*65,0,-280]);
  if(mode==='indoor') {
    const roof=new T.Mesh(new T.SphereGeometry(165,32,12,0,Math.PI*2,0,Math.PI/2),new T.MeshStandardMaterial({color:'#7e9097',side:T.BackSide,roughness:1}));roof.position.set(0,0,-30);roof.scale.y=.65;roof.userData.noBatch=true;v.scene.add(roof);
    for(let i=0;i<9;i++) {const a=i*Math.PI/8,curve=[];for(let j=0;j<=24;j++){const t=j*Math.PI/24;curve.push(new T.Vector3(Math.cos(a)*Math.cos(t)*164,Math.sin(t)*106,-30+Math.sin(a)*Math.cos(t)*164));}const g=new T.BufferGeometry().setFromPoints(curve);v.scene.add(new T.Line(g,new T.LineBasicMaterial({color:'#b7c3bf'})));}
  }
  return {mode};
}
