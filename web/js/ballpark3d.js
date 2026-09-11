// Scenic assets are deterministic and independent of the simulation RNG.
import * as T from '../vendor/three/three.module.min.js';
const p=(x,y,z=0)=>new T.Vector3(x,z,-y);
const hash=s=>[...String(s)].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261);
export function buildSurroundings(v, opts) {
  let seed=hash(`${opts.home}/${opts.day ?? opts.crowd ?? 0}`);
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const mode=opts.park?.dome?'indoor':['clear','overcast','evening'].includes(opts.park?.weather)?opts.park.weather:['clear','overcast','evening'][seed%3];
  v.atmosphere=mode;
  const skyCanvas=document.createElement('canvas');skyCanvas.width=1024;skyCanvas.height=512;
  const sc=skyCanvas.getContext('2d');
  const skyTex=new T.CanvasTexture(skyCanvas);skyTex.colorSpace=T.SRGBColorSpace;v.textures.push(skyTex);
  const sky=new T.Mesh(new T.SphereGeometry(390,48,24),new T.MeshBasicMaterial({map:skyTex,side:T.BackSide,depthWrite:false,fog:false}));sky.position.y=30;v.scene.add(sky);
  const stars=[];let starSeed=hash(opts.home+'stars');const srand=()=>{starSeed=(Math.imul(starSeed,1664525)+1013904223)>>>0;return starSeed/4294967296;};
  for(let i=0;i<220;i++)stars.push([srand(),srand()*.40,.3+srand()*.7]);
  const paint=(k=0)=>paintSky(sc,skyCanvas.width,skyCanvas.height,mode,k,v.sun.position,sky.position.y,stars);
  paint(mode==='evening'?.5:0);
  v.skyState={canvas:skyCanvas,ctx:sc,texture:skyTex,mesh:sky,mode,paint:k=>{paint(k);skyTex.needsUpdate=true;}};
  const horizon={clear:'#d9e4d8',overcast:'#c1cbc6',evening:'#e7ae82',indoor:'#5d7074'}[mode];
  v.scene.fog=new T.Fog(horizon,180,360);
  v.sun.intensity=mode==='overcast'?1.1:mode==='evening'?1.8:mode==='indoor'?1.6:3.1;
  v.sun.color.set(mode==='evening'?'#ffc18a':'#fff0d8');
  v.ambient.intensity=mode==='evening'?1.6:2.1;
  if(mode!=='indoor') {
    // Soft cloud sprites instead of squashed spheres. Two puff shapes, tinted by weather.
    const puffs=[cloudTexture(hash(opts.home+'c1')),cloudTexture(hash(opts.home+'c2'))];v.textures.push(...puffs);
    v.clouds=[];
    for(let i=0;i<(mode==='overcast'?22:11);i++) {
      const m=new T.SpriteMaterial({map:puffs[i%2],transparent:true,opacity:mode==='overcast'?.7:.62,depthWrite:false,fog:false,color:mode==='overcast'?'#c6ced0':'#f4efe4'});
      const cloud=new T.Sprite(m);const a=(rand()-.5)*Math.PI*1.4,dist=230+rand()*90;
      cloud.position.set(Math.sin(a)*dist,70+rand()*45,-Math.cos(a)*dist);const w=70+rand()*90;cloud.scale.set(w,w*(.32+rand()*.16),1);cloud.userData.noBatch=true;v.scene.add(cloud);v.clouds.push(cloud);
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
  // Fans cluster: friends sit together, and some sections are half empty. A low-frequency
  // value per section scales the fill so occupancy is patchy rather than white noise.
  const sectionSeed=hash(opts.home+'sections'),sectionOf=q=>Math.floor((Math.atan2(q.x,q.y)+Math.PI)/(Math.PI/14))*8+Math.floor(q.z/2.6)+(q.outfield?200:0);
  const sectionFill=new Map();
  const occupied=places.filter(q=>{const sct=sectionOf(q);if(!sectionFill.has(sct)){let h=hash(sectionSeed+':'+sct);sectionFill.set(sct,.55+.9*((h%1000)/1000));}return rand()<fill*sectionFill.get(sct);});
  const torsoGeo=new T.SphereGeometry(1,10,8),headGeo=new T.SphereGeometry(1,8,7),capGeo=new T.SphereGeometry(1,8,5,0,Math.PI*2,0,Math.PI*.55);
  const shirts=new T.InstancedMesh(torsoGeo,v.material('#ffffff'),occupied.length);
  const heads=new T.InstancedMesh(headGeo,v.material('#ffffff'),occupied.length);
  const caps=new T.InstancedMesh(capGeo,v.material('#ffffff'),occupied.length);
  const home=new T.Color(opts.colors.home),away=new T.Color(opts.colors.away);
  const shirtPalette=[home,home,home,away,new T.Color('#d8dcd3'),new T.Color('#c9b48a'),new T.Color('#42586a'),new T.Color('#8c7a6b'),new T.Color('#2f3a44')];
  const capPalette=[home,home,new T.Color('#1f2a33'),new T.Color('#3b2f2a'),new T.Color('#e8e2d0'),away];
  const skins=['#cda37e','#b98764','#e2bd9a','#8f6446'].map(c=>new T.Color(c));
  const tint=new T.Color();
  occupied.forEach((q,i)=>{
    const row=Math.max(0,(q.z-(q.outfield?2.7:1.6))/(q.outfield?1.15:.85)),shade=1-Math.min(.28,row*.028);   // deeper rows sit under the overhang
    const size=.9+rand()*.22,lean=(rand()-.5)*.16;
    d.position.copy(p(q.x,q.y,q.z+.42*size));d.rotation.set(lean*.4,q.angle,lean);d.scale.set(.30*size,.34*size,.21*size);d.updateMatrix();shirts.setMatrixAt(i,d.matrix);
    tint.copy(shirtPalette[Math.floor(rand()*shirtPalette.length)]).multiplyScalar(shade*(.9+rand()*.2));shirts.setColorAt(i,tint);
    d.position.y+=.46*size;d.scale.set(.155*size,.17*size,.155*size);d.updateMatrix();heads.setMatrixAt(i,d.matrix);
    tint.copy(skins[Math.floor(rand()*skins.length)]).multiplyScalar(shade);heads.setColorAt(i,tint);
    const capped=rand()<.7;d.position.y+=.045*size;d.scale.set(.165*size,.15*size,.165*size);if(!capped)d.scale.setScalar(0);d.updateMatrix();caps.setMatrixAt(i,d.matrix);
    tint.copy(capPalette[Math.floor(rand()*capPalette.length)]).multiplyScalar(shade);caps.setColorAt(i,tint);
  });
  v.crowdClock={value:0};v.crowdEnergy={value:0};
  for(const mesh of [shirts,heads,caps]) {
    mesh.material=mesh.material.clone();
    mesh.material.onBeforeCompile=shader=>{
      shader.uniforms.crowdClock=v.crowdClock;shader.uniforms.crowdEnergy=v.crowdEnergy;
      shader.vertexShader='uniform float crowdClock; uniform float crowdEnergy;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += (crowdEnergy * (.35 + .22 * sin(crowdClock * 7.0 + instanceMatrix[3].x)) + .035 * sin(crowdClock * 1.7 + instanceMatrix[3].x * .8 + instanceMatrix[3].z)) / max(.01, length(instanceMatrix[1].xyz));');
    };
  }
  v.scene.add(shirts,heads,caps);v.crowdCount=occupied.length;v.seatCount=places.length;
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

// 하늘. 시간(k 0..1)에 따라 천정·지평선 색, 태양 광휘, 지평선 안개, 별과 달을 캔버스에 그린다.
// 구는 u 가 방위(+x 서쪽에서 시작), v 가 고도다. 캔버스 위가 천정.
const lerpColor=(a,b,t)=>'#'+new T.Color(a).lerp(new T.Color(b),Math.max(0,Math.min(1,t))).getHexString();
export function paintSky(g,w,h,mode,k,sunPos,center=30,stars=[]){
  const night=mode==='indoor'?0:Math.max(0,Math.min(1,(k-.62)/.26)),dusk=mode==='indoor'?0:Math.max(0,Math.min(1,(k-.3)/.32)),evening=mode==='evening'?1:0;
  const pal=mode==='overcast'?{zen:'#6f8797',mid:'#8fa3ad',hor:'#c1cbc6'}:mode==='indoor'?{zen:'#283744',mid:'#3d4f5c',hor:'#5d7074'}:{zen:'#3d7fbc',mid:'#7ab3dc',hor:'#d6e3e6'};
  const zen=lerpColor(lerpColor(pal.zen,'#2b3d6a',Math.max(dusk,evening)),'#050b18',night),mid=lerpColor(lerpColor(pal.mid,'#7d6f9a',Math.max(dusk,evening)*.9),'#0c1a30',night),hor=lerpColor(lerpColor(pal.hor,'#f0a468',Math.max(dusk,evening)),'#22304a',night);
  const grad=g.createLinearGradient(0,0,0,h);grad.addColorStop(0,zen);grad.addColorStop(.24,mid);grad.addColorStop(.47,hor);grad.addColorStop(.62,lerpColor(hor,'#8a9a95',.5));grad.addColorStop(1,'#3a4a48');
  g.fillStyle=grad;g.fillRect(0,0,w,h);
  if(mode==='overcast'){for(let i=0;i<7;i++){g.fillStyle=`rgba(255,255,255,${.06+.04*(i%2)})`;g.fillRect(0,h*(.06+i*.06),w,h*.03);}}
  if(mode!=='indoor'&&sunPos){
    const dir=sunPos.clone().sub(new T.Vector3(0,center,0)).normalize();
    const u=((Math.atan2(dir.z,-dir.x)/(Math.PI*2))%1+1)%1,vv=Math.acos(Math.max(-1,Math.min(1,dir.y)))/Math.PI;
    const sx=u*w,sy=vv*h,low=Math.max(0,1-dir.y*2.2);
    for(const off of [-w,0,w]){
      const glow=g.createRadialGradient(sx+off,sy,0,sx+off,sy,w*(.10+.08*low));
      const c=lerpColor(lerpColor('#fff4d6','#ffb070',low),'#dfe8ff',night);
      glow.addColorStop(0,c);glow.addColorStop(.18,c+'aa');glow.addColorStop(1,c+'00');g.fillStyle=glow;g.globalAlpha=(1-night*.85)*(mode==='overcast'?.35:1);g.fillRect(0,0,w,h);g.globalAlpha=1;
    }
    if(night>0){
      g.fillStyle='#ffffff';for(const [x,y,b] of stars){g.globalAlpha=night*b*.8;g.fillRect(x*w,y*h,1,1);}g.globalAlpha=1;
      const mx=((u+.45)%1)*w,my=h*.2,moon=g.createRadialGradient(mx,my,0,mx,my,w*.05);moon.addColorStop(0,`rgba(236,240,255,${.95*night})`);moon.addColorStop(.35,`rgba(236,240,255,${.9*night})`);moon.addColorStop(.4,`rgba(200,214,240,${.25*night})`);moon.addColorStop(1,'rgba(200,214,240,0)');g.fillStyle=moon;g.fillRect(0,0,w,h);
    }
  }
  // 지평선 안개: 낮에는 흰빛, 저녁에는 붉은 띠, 밤에는 도시 불빛의 옅은 주황.
  const haze=g.createLinearGradient(0,h*.38,0,h*.52);const hz=lerpColor(lerpColor('#ffffff','#ff9a5a',Math.max(dusk,evening)),'#ffb877',night);
  haze.addColorStop(0,hz+'00');haze.addColorStop(.8,hz+(night>.3?'1a':dusk>.3?'55':'3a'));haze.addColorStop(1,hz+'00');g.fillStyle=haze;g.fillRect(0,0,w,h);
}
// 구름 스프라이트 텍스처: 부드러운 원을 여러 개 겹친 덩어리.
function cloudTexture(seed){
  const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');let s=seed>>>0;const r=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  for(let i=0;i<14;i++){const x=40+r()*176,y=52+r()*36,rad=22+r()*30;const grad=g.createRadialGradient(x,y,0,x,y,rad);grad.addColorStop(0,'rgba(255,255,255,.55)');grad.addColorStop(.6,'rgba(255,255,255,.22)');grad.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=grad;g.fillRect(0,0,256,128);}
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
