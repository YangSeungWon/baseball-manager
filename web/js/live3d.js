import {createPlayerFactory,reachPlayerHand,reachPlayerGlove,posePlayerFace} from './player-model.js';
import {PITCH,SWING,sample,applyPose} from './motion-clips.js';
export {loadPlayerModel} from './player-model.js';
import { renderPixelRatio } from './render-quality.js';
// Optional renderer. Simulation coordinates (x, depth, height) become (x, height, -depth).
// All animation follows LiveView's state; this module never advances the game.
import * as T from '../vendor/three/three.module.min.js';
import { fence } from './core/bip.js';
import { buildSurroundings, canvasTexture, paddingTexture, numberTexture } from './ballpark3d.js';
import { createTeamMascot, updateTeamMascot } from './mascot3d.js';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const point = (x, y, z = 0) => new T.Vector3(x, z, -y);
const LOOK_YAW=Math.PI/3,LOOK_PITCH=Math.PI/6;   // 좌우 60°, 상하 30°: 둘러보기가 아니라 곁눈질
const HARD_CUTS=new Set(['field','catch','base']);   // 살아 있는 타구로 가는 컷은 암전 없이 즉시
// 야구공: 흰 가죽에 붉은 실밥 두 줄(등장방형 투영). 회전하면 구종에 따라 실밥이 다르게 흐른다.
const seamTexture=()=>canvasTexture(256,128,(g,w,h)=>{
  g.fillStyle='#f7f2e4';g.fillRect(0,0,w,h);
  g.strokeStyle='#b3382d';g.lineWidth=3.2;g.lineCap='round';
  for(const phase of [0,Math.PI]){g.beginPath();for(let i=0;i<=96;i++){const u=i/96,x=u*w,y=h/2+Math.sin(u*Math.PI*2+phase)*h*.30;i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
    for(let i=0;i<48;i++){const u=(i+.5)/48,x=u*w,y=h/2+Math.sin(u*Math.PI*2+phase)*h*.30,dy=Math.cos(u*Math.PI*2+phase);g.beginPath();g.moveTo(x-2.2,y-3.5*dy-1.5);g.lineTo(x+2.2,y+3.5*dy+1.5);g.stroke();}}
});
// 부드러운 원형 그림자(접지 그림자). 섀도맵이 없는 기기에서도 높이 정보를 준다.
const blobTexture=()=>canvasTexture(128,128,(g,w,h)=>{const r=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);r.addColorStop(0,'rgba(0,0,0,1)');r.addColorStop(.55,'rgba(0,0,0,.55)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,w,h);},{srgb:false});
// 잔디·흙의 결. 색은 재질 color 가 곱해지므로 밝기 편차만 담는다.
const grainTexture=(variation,seed)=>canvasTexture(128,128,(g,w,h)=>{
  const img=g.createImageData(w,h),d=img.data;let x=seed>>>0;const rnd=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
  for(let i=0;i<d.length;i+=4){const v=Math.round(255*(1-variation*.5+variation*rnd()));d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}
  g.putImageData(img,0,0);
},{repeat:1.4});
const GRASS=new Set(['#39744d','#417d52','#3b784e']),DIRT=new Set(['#a58662','#af8056','#b48a63','#bd946a']);
// 구종별 회전. 실제 회전수(rpm)에 슬로모션에서 실밥이 보이도록 감속 계수를 곱한다.
const SPIN={FF:{axis:[1,0,.15],rpm:2200},SL:{axis:[.45,.75,.5],rpm:2400},CH:{axis:[1,0,.35],rpm:1600}};

export class Live3D {
  constructor(host, dims, opts, onLost) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'lv-three';
    this.canvas.setAttribute('aria-label', '3D 야구 경기 중계');
    this.onLost = e => { e.preventDefault(); onLost(); };
    this.canvas.addEventListener('webglcontextlost', this.onLost);
    this.renderer.setPixelRatio(renderPixelRatio(innerWidth,innerHeight,devicePixelRatio));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene = new T.Scene();
    this.scene.background = new T.Color('#172f49');
    this.scene.fog = new T.Fog('#253c50', 180, 350);
    this.camera = new T.PerspectiveCamera(48, 1.6, .15, 500);
    this.camera.position.set(9, 9, 22);
    this.aim = point(0, 9, 1);
    this.camera.lookAt(this.aim);
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.createPlayer=createPlayerFactory();
    this.players = new Map(); this.materials = new Map(); this.textures = [];
    this.box = new T.BoxGeometry(1, 1, 1);
    this.sphere = new T.SphereGeometry(1, 10, 8);
    this.cylinder = new T.CylinderGeometry(1, 1, 1, 10);
    this.ambient = new T.HemisphereLight('#d6e9ff', '#586449', 1.9); this.scene.add(this.ambient);
    const sun = this.sun = new T.DirectionalLight('#ffe8c0', 3.1);
    sun.position.set(-42, 75, 25); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 200 });
    sun.target.position.set(0, 0, -28); this.scene.add(sun.target);
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0005; sun.shadow.normalBias = .025;
    this.scene.add(sun);
    // 반대편의 차가운 보조광. 그늘진 면이 평면으로 죽지 않게 한다. 그림자는 만들지 않는다.
    this.fill=new T.DirectionalLight('#9fb6d8',.55);this.fill.position.set(48,28,-40);this.scene.add(this.fill);
    this.stadium(dims, opts);
    this.fenceAt = a => fence(a, dims);
    buildSurroundings(this, opts);
    this.mascot=createTeamMascot(this,opts.home);
    this.batchStadium();
    // Scenery transforms never change; crowd motion happens in the shader.
    this.scene.updateMatrixWorld(true);
    this.scene.traverse(o=>{
      if(!(o.isMesh||o.isLine)||o.userData.noBatch)return;
      o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;
    });
    this.ball = new T.Mesh(new T.SphereGeometry(1,24,18), new T.MeshStandardMaterial({map:seamTexture(),emissive:'#fff1c9',emissiveIntensity:.10,roughness:.48}));
    this.textures.push(this.ball.material.map);this.ball.castShadow=true;this.ball.userData.noBatch=true;this.scene.add(this.ball);
    this.spin=0;
    // Ground contact shadows: one for the ball, one per player. Cheap, and they survive devices without shadow maps.
    this.blobTex=blobTexture();this.textures.push(this.blobTex);
    this.blob=()=>{const m=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:this.blobTex,transparent:true,opacity:.4,depthWrite:false,color:'#000',polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-6}));m.rotation.x=-Math.PI/2;m.renderOrder=1;m.userData.noBatch=true;m.visible=false;this.scene.add(m);return m;};
    this.ballShadow=this.blob();
    // Motion ribbon: a camera-facing strip that tapers and fades toward the tail.
    const N=this.trailN=26;
    this.trailGeo = new T.BufferGeometry();
    this.trailGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(N*2*3), 3));
    this.trailGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(N*2*3), 3));
    const idx=[];for(let i=0;i<N-1;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}this.trailGeo.setIndex(idx);
    this.trail = new T.Mesh(this.trailGeo, new T.MeshBasicMaterial({ vertexColors:true, transparent:true, blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide }));
    this.trail.frustumCulled = false; this.trail.userData.noBatch=true; this.scene.add(this.trail);
    host.prepend(this.canvas);
    // 컷 사이의 짧은 암전. 라이브 타구로 가는 컷은 즉시, 나머지는 0.09초 어둡게 → 전환 → 0.16초 밝게.
    this.fade=document.createElement('div');this.fade.className='lv-fade';this.fade.hidden=true;this.canvas.after(this.fade);this.cut=null;
    this.look={yaw:0,pitch:0};
    if(opts.playerRole==='batter') {
      // First-person bat and hands, parented to the camera. Load pulls it back, release sweeps it across the view.
      this.scene.add(this.camera);
      const fp=this.fpBat=new T.Group();fp.visible=false;this.camera.add(fp);
      const pivot=this.fpPivot=new T.Group();fp.add(pivot);
      const bat=new T.Mesh(new T.CylinderGeometry(.034,.024,.86,14),new T.MeshStandardMaterial({color:'#d4ad73',roughness:.55}));bat.position.y=.43+.09;pivot.add(bat);
      const grip=new T.Mesh(new T.CylinderGeometry(.026,.03,.22,12),new T.MeshStandardMaterial({color:'#2a2a2a',roughness:.8}));grip.position.y=.0;pivot.add(grip);
      const knob=new T.Mesh(new T.CylinderGeometry(.036,.036,.02,12),grip.material);knob.position.y=-.11;pivot.add(knob);
      const skin=new T.MeshStandardMaterial({color:'#c98b62',roughness:.6});
      for(const [y,r] of [[.03,.058],[.13,.056]]){const hand=new T.Mesh(new T.SphereGeometry(r,12,10),skin);hand.position.y=y;hand.scale.set(1,1.15,.85);pivot.add(hand);}
      for(const m of [bat,grip,knob])m.userData.noBatch=true;
      fp.traverse(o=>{o.userData.noBatch=true;o.frustumCulled=false;});
      this.canvas.setAttribute('aria-label','타자 시점 구장');
      this.canvas.style.touchAction='none';
      this.lookInput=new AbortController();
      const listen=(name,fn)=>this.canvas.addEventListener(name,fn,{signal:this.lookInput.signal});
      // A glance, not a free look: a narrow range that eases back to the pitcher once the finger lifts.
      listen('pointerdown',e=>{
        if(e.button!==0||!this.opts.canLook?.()||this.drag)return;
        if(this.look.pinned)this.resetLook();
        this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};this.canvas.setPointerCapture(e.pointerId);
      });
      listen('pointermove',e=>{
        if(this.drag?.id!==e.pointerId)return;
        if(!this.opts.canLook?.()){this.resetLook();return;}
        if(!this.drag.moved&&Math.hypot(e.clientX-this.drag.x,e.clientY-this.drag.y)<4)return;
        this.drag.moved=true;
        // "Grab the world": dragging right turns the view left, dragging down tilts the view up.
        this.look.yaw=clamp(this.look.yaw-(e.clientX-this.drag.x)*.005,-LOOK_YAW,LOOK_YAW);
        this.look.pitch=clamp(this.look.pitch+(e.clientY-this.drag.y)*.005,-LOOK_PITCH,LOOK_PITCH);
        this.drag.x=e.clientX;this.drag.y=e.clientY;
      });
      const end=e=>{if(this.drag?.id===e.pointerId)this.drag=null;};
      listen('pointerup',end);listen('pointercancel',end);listen('lostpointercapture',end);
    }
  }
  resetLook() {
    if(this.drag&&this.canvas.hasPointerCapture(this.drag.id))this.canvas.releasePointerCapture(this.drag.id);
    this.drag=null;this.look.yaw=0;this.look.pitch=0;this.look.pinned=false;
  }
  // The plate glance is a toggle and stays put; a dragged glance eases home on its own.
  lookAtPlate() {
    if(!this.opts.canLook?.())return;
    const centered=Math.abs(this.look.yaw)<.01&&Math.abs(this.look.pitch)<.01;
    this.resetLook();
    if(centered){this.look.yaw=this.batterHand==='L'?-1.22:1.22;this.look.pitch=-1.05;this.look.pinned=true;}
  }
  settleLook(dt) {
    if(this.drag||this.look.pinned)return;
    const k=Math.exp(-dt*7);this.look.yaw*=k;this.look.pitch*=k;
    if(Math.abs(this.look.yaw)<.002)this.look.yaw=0;if(Math.abs(this.look.pitch)<.002)this.look.pitch=0;
  }
  material(color) {
    if (!this.materials.has(color)) {
      const m=new T.MeshStandardMaterial({ color, roughness: .86 });
      if(GRASS.has(color)){this.grassGrain??=grainTexture(.14,7);this.textures.push(this.grassGrain);m.map=this.grassGrain;m.roughness=.92;}
      else if(DIRT.has(color)){this.dirtGrain??=grainTexture(.16,11);this.textures.push(this.dirtGrain);m.map=this.dirtGrain;m.roughness=.98;}
      this.materials.set(color, m);
    }
    return this.materials.get(color);
  }
  mesh(geometry, color, parent, scale = [1, 1, 1], pos = [0, 0, 0]) {
    const m = new T.Mesh(geometry, this.material(color)); m.scale.set(...scale); m.position.set(...pos);
    m.receiveShadow = true; parent.add(m); return m;
  }
  slab(points, color, height = .01) {
    const shape = new T.Shape(); points.forEach(([x,y], i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y)); shape.closePath();
    const geo = new T.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2);
    const m = this.mesh(geo, color, this.scene); m.position.y = height; return m;
  }
  line(points, color, width = .12) {
    for (let i = 1; i < points.length; i++) {
      const a = point(...points[i-1]), b = point(...points[i]); const d = b.clone().sub(a);
      const m = this.mesh(this.box, color, this.scene, [width, .025, d.length()]);
      m.position.copy(a.add(b).multiplyScalar(.5)); m.position.y += .045; m.rotation.y = Math.atan2(d.x, d.z);
    }
  }
  stadium(dims, opts) {
    const arc = (extra, start = -45, end = 45) => {
      const p = []; for (let a = start; a <= end; a += 2) { const r = fence(clamp(a,-45,45), dims) + extra, t = a*Math.PI/180; p.push([Math.sin(t)*r, Math.cos(t)*r]); } return p;
    };
    this.mesh(this.box, '#273e35', this.scene, [350, 1, 350], [0,-.55,-50]);
    this.slab([[0,-14], ...arc(4,-51,51)], '#39744d');
    // Alternating mowing bands, clipped to the fair-territory sector.
    for (let r = 8; r < 140; r += 12) {
      const ring = []; for (let a=-45; a<=45; a+=2) { const t=a*Math.PI/180, d=Math.min(r+6,fence(a,dims)); ring.push([Math.sin(t)*d,Math.cos(t)*d]); }
      for(let a=45; a>=-45; a-=2) { const t=a*Math.PI/180,d=Math.min(r,fence(a,dims)); ring.push([Math.sin(t)*d,Math.cos(t)*d]); }
      this.slab(ring, '#417d52', .015);
    }
    this.slab([...arc(3), ...arc(-3).reverse()], '#a58662', .025);
    this.slab([[0,-3], [23,19], [0,46], [-23,19]], '#af8056', .03);
    this.slab([[0,5], [15.8,21], [0,37], [-15.8,21]], '#3b784e', .04);
    const circle = (x,y,r,color) => { const m = this.mesh(new T.CircleGeometry(r,48),color,this.scene); m.rotation.x=-Math.PI/2;m.position.copy(point(x,y,.055)); };
    circle(0,0,4.5,'#b48a63'); circle(0,18.44,2.75,'#bd946a');
    this.line([[-.3,18.44],[.3,18.44]], '#fff3d4', .16);
    for (const [x,y] of [[19.4,19.4],[0,38.8],[-19.4,19.4]]) {
      const b = this.mesh(this.box,'#fff5dc',this.scene,[.65,.12,.65],[x,.12,-y]); b.rotation.y=Math.PI/4;
    }
    this.slab([[-.3,.3],[.3,.3],[.3,0],[0,-.3],[-.3,0]],'#fff5dc',.07);
    for(const side of [-1,1]) {
      const r=fence(side*45,dims), d=r/Math.sqrt(2);
      this.line([[0,0],[side*d,d]],'#eee9ce',.14);
      this.mesh(this.cylinder,'#f2c74f',this.scene,[.12,17,.12],[side*d,8.5,-d]);
      this.line([[side*.65,-.5],[side*1.7,-.5],[side*1.7,1.6],[side*.65,1.6],[side*.65,-.5]],'#f2e7cb',.07);
    }
    // Outfield wall: one padded ribbon. Panel seams every 2.4 m, a yellow home-run line along the top,
    // and the distance to each part of the fence painted on it.
    const wall=arc(0,-46,46); this.wallHeight=dims.real?.fH || 3;
    {
      const H=this.wallHeight,pos=[],uv=[],idx=[];let run=0;
      for(let i=0;i<wall.length;i++){
        const [x,y]=wall[i];if(i)run+=Math.hypot(x-wall[i-1][0],y-wall[i-1][1]);
        const inner=point(x*(1-.0),y*(1-.0)),u=run/2.4;
        pos.push(inner.x,0,inner.z,inner.x,H,inner.z);uv.push(u,0,u,1);
        if(i){const k=(i-1)*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
      const tex=paddingTexture();this.textures.push(tex);
      const ribbon=new T.Mesh(geo,new T.MeshStandardMaterial({map:tex,roughness:.9,side:T.DoubleSide}));ribbon.receiveShadow=true;ribbon.userData.noBatch=true;this.scene.add(ribbon);
      // A thin cap so the wall has thickness when seen from the seats.
      for(let i=1;i<wall.length;i++){const a=point(...wall[i-1]),b=point(...wall[i]),d=b.clone().sub(a);const m=this.mesh(this.box,'#18332f',this.scene,[.5,.18,d.length()+.1]);m.position.copy(a.add(b).multiplyScalar(.5));m.position.y=H-.09;m.rotation.y=Math.atan2(d.x,d.z);m.position.add(new T.Vector3(-a.x,0,-a.z).normalize().multiplyScalar(-.2));}
      const real=dims.real||{};
      for(const [angle,metres] of [[-38,real.fL],[0,real.fC],[38,real.fR]]){
        if(!metres)continue;const r=fence(angle,dims)-.3,t=angle*Math.PI/180,x=Math.sin(t)*r,y=Math.cos(t)*r;
        const sign=new T.Mesh(new T.PlaneGeometry(2.6,1.1),new T.MeshBasicMaterial({map:numberTexture(String(Math.round(metres))),transparent:true}));
        sign.position.copy(point(x,y,H*.5));sign.rotation.y=Math.PI+t;sign.userData.noBatch=true;this.textures.push(sign.material.map);this.scene.add(sign);
      }
    }
    // Concrete terraces under the seats, with a continuous front fascia.
    for (let row=0;row<7;row++) {
      const inner=arc(5+row*2.3,-63,63), outer=arc(7.3+row*2.3,-63,63);
      const h=1.85+row*1.15;
      this.slab([...outer,...inner.reverse()],row%2?'#51646b':'#596d73',h);
      const edge=arc(5+row*2.3,-63,63);
      for(let i=1;i<edge.length;i++) {
        const a=point(...edge[i-1]),b=point(...edge[i]),d=b.clone().sub(a);
        const m=this.mesh(this.box,'#3e535b',this.scene,[.16,1.15,d.length()+.05]);
        m.position.copy(a.add(b).multiplyScalar(.5));m.position.y=h-.575;m.rotation.y=Math.atan2(d.x,d.z);
      }
    }
    // Instanced seats keep mobile draw calls low.
    const rows=7, cols=100;
    const seats=new T.InstancedMesh(this.box,this.material('#52748b'),rows*cols);
    const dummy=new T.Object3D(), color=new T.Color();
    for(let row=0;row<rows;row++) for(let j=0;j<cols;j++) {
      const a=(-62+j*124/(cols-1))*Math.PI/180, radius=fence(clamp(a*180/Math.PI,-45,45),dims)+7+row*2.3;
      dummy.position.set(Math.sin(a)*radius,2.5+row*1.15,-Math.cos(a)*radius); dummy.scale.set(1.55,.85,1.15); dummy.rotation.y=-a;dummy.updateMatrix();
      const k=row*cols+j; seats.setMatrixAt(k,dummy.matrix);
      color.set(['#43596a','#7292a0','#b4ad94','#667782','#284c61'][(j*7+row*3)%5]);seats.setColorAt(k,color);
    }
    this.scene.add(seats);
    for(const a of [-53,-27,27,53]) {
      const r=fence(clamp(a,-45,45),dims)+24, t=a*Math.PI/180, x=Math.sin(t)*r,y=Math.cos(t)*r;
      this.mesh(this.cylinder,'#7d939e',this.scene,[.32,31,.32],[x,15.5,-y]);
      const rack=this.mesh(this.box,'#293d4a',this.scene,[8,3,.6],[x,31,-y]);rack.rotation.y=-t;
      for(let i=0;i<6;i++) {
        const lamp=this.mesh(this.box,'#fff2ce',rack,[.10,.24,1.2],[-.38+(i%3)*.38,-.2+Math.floor(i/3)*.4,.5]);
        lamp.material=this.material('#fff2ce');this.floodMaterial=lamp.material;lamp.material.emissive.set('#ffe9bc');lamp.material.emissiveIntensity=1.2;
      }
      // Night-time glare around each rack: an additive sprite the sky painter fades in after dusk.
      this.haloTex??=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,244,214,1)');r.addColorStop(.25,'rgba(255,240,200,.5)');r.addColorStop(1,'rgba(255,240,200,0)');g.fillStyle=r;g.fillRect(0,0,128,128);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;this.textures.push(t);return t;})();
      const halo=new T.Sprite(new T.SpriteMaterial({map:this.haloTex,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,fog:false}));
      halo.position.set(x,31,-y);halo.scale.set(16,10,1);halo.userData.noBatch=true;this.scene.add(halo);(this.floodHalos??=[]).push(halo);
    }
    const cf=fence(0,dims);
    this.boardCanvas=document.createElement('canvas');this.boardCanvas.width=1024;this.boardCanvas.height=512;
    this.boardTexture=new T.CanvasTexture(this.boardCanvas);this.boardTexture.colorSpace=T.SRGBColorSpace;this.textures.push(this.boardTexture);
    const board=new T.Mesh(new T.PlaneGeometry(34,13),new T.MeshBasicMaterial({map:this.boardTexture}));board.position.set(0,17,-cf-12);this.boardPosition=board.position.clone();this.scene.add(board);
    this.mesh(this.box,'#14272e',this.scene,[35,14,1],[0,17,-cf-12.6]);
    this.opts=opts;
  }
  batchStadium() {
    // Bake the static field/architecture into one draw per material.
    // Animated players, seats and the score texture stay independent.
    this.scene.updateMatrixWorld(true);
    const groups=new Map(), originals=[];
    this.scene.traverse(m=>{
      if(!m.isMesh || m.isInstancedMesh || !m.material.isMeshStandardMaterial || m.userData.noBatch)return;
      let geo=m.geometry.clone();
      if(geo.index){const indexed=geo;geo=geo.toNonIndexed();indexed.dispose();}
      geo.applyMatrix4(m.matrixWorld);
      if(!groups.has(m.material))groups.set(m.material,[]);
      groups.get(m.material).push(geo);originals.push(m);
    });
    for(const [material,geos] of groups) {
      const merged=new T.BufferGeometry();
      for(const key of ['position','normal','uv']) {
        const size=key==='uv'?2:3;
        const data=new Float32Array(geos.reduce((sum,g)=>sum+g.attributes[key].array.length,0));
        let offset=0;for(const g of geos){data.set(g.attributes[key].array,offset);offset+=g.attributes[key].array.length;}
        merged.setAttribute(key,new T.BufferAttribute(data,size));
      }
      for(const g of geos)g.dispose();
      const mesh=new T.Mesh(merged,material);mesh.receiveShadow=true;this.scene.add(mesh);
    }
    const oldGeos=new Set();for(const m of originals){m.removeFromParent();oldGeos.add(m.geometry);}
    for(const g of oldGeos)if(![this.box,this.sphere,this.cylinder].includes(g))g.dispose();
  }
  player(key, color) {
    if(this.players.has(key)) return this.players.get(key);
    const player=this.createPlayer(key,color);this.scene.add(player.root);player.shadow=this.blob();this.players.set(key,player);return player;
  }
  updatePlayer(key, data, color, pose, S) {
    const p=this.player(key,color), {root,body,arms,legs}=p;
    root.visible=!data.wait && !data.gone && (data.alpha ?? 1)>.08;
    if(!root.visible)return;
    const x=data.x||0,y=data.y||0;
    const dx=p.last?x-p.last.x:0,dy=p.last?y-p.last.y:0,dist=Math.hypot(dx,dy);
    const walking=['walk','dejected'].includes(pose);
    p.last={x,y};p.phase+=dist*(walking?4.8:2.9);
    const moving=dist>.0001;
    if(moving) root.rotation.y=Math.atan2(dx,-dy);
    else if(pose==='pitch'||pose==='field'||pose==='crouch')root.rotation.y=Math.atan2(-x,y);
    else if(['watch','admire','batFlip','celebrate','clap'].includes(pose)&&data.watch)root.rotation.y=Math.atan2(data.watch.x-x,y-data.watch.y);
    else if(pose==='bat')root.rotation.y=data.hand==='L'?-Math.PI/2:Math.PI/2;
    root.position.set(x,Math.max(0,data.jump||0),-y);
    if(p.shadow){p.shadow.visible=true;p.shadow.position.set(x,.09,-y);p.shadow.scale.setScalar(1.25);p.shadow.material.opacity=.32*(data.alpha??1);}
    p.setColor(color);
    const running=moving&&!['walk','dejected'].includes(pose);
    const stride=moving?Math.sin(p.phase)*(running?.72:.36):0;
    legs[0].rotation.set(stride,0,0);legs[1].rotation.set(-stride,0,0);
    arms[0].rotation.set(-stride*.7,0,.12);arms[1].rotation.set(stride*.7,0,-.12);
    body.position.set(0,pose==='crouch'?-.20:0,0);body.rotation.set(0,0,0);p.head.rotation.set(0,0,0);
    p.glove.position.copy(p.gloveRest);p.hips.rotation.set(0,0,0);p.spine.rotation.set(0,0,0);
    for(const hand of p.hands)hand.rotation.set(0,0,0);
    if(moving){body.rotation.x=running?.16:.04;body.position.y-=Math.abs(Math.sin(p.phase))*(running?.025:.012);body.rotation.y=Math.sin(p.phase)*.06;}
    for(let i=0;i<2;i++){
      p.elbows[i].rotation.set(moving?(running?-1.25:-.45):-.12,0,0);
      p.knees[i].rotation.set(moving?Math.max(0,Math.sin(p.phase+(i?0:Math.PI)))*(walking?.38:1.0):0,0,0);
      p.feet[i].rotation.set(walking?-(legs[i].rotation.x+p.knees[i].rotation.x):-p.knees[i].rotation.x*.25,0,0);
    }
    p.bat.visible=p.helmet.visible&&['bat','walk','dejected','admire'].includes(pose);p.glove.visible=key!=='ump'&&!p.helmet.visible&&!p.bat.visible&&!['batFlip','celebrate','clap','runCelebrate'].includes(pose);
    if(pose==='admire'){body.rotation.x=-.12;arms[1].rotation.x=-1.7;arms[0].rotation.x=-.8;}
    if(pose==='batFlip'){arms[1].rotation.z=-1.4*Math.max(0,1-(data.phase-.32)/.8);body.rotation.x=-.06;}
    if(pose==='celebrate'){
      const wave=this.reducedMotion?0:Math.sin((data.phase||0)*8+p.idleSeed);
      arms[0].rotation.z=-2.5-wave*.12;arms[1].rotation.z=2.5+wave*.12;
      if(!this.reducedMotion)body.position.y+=Math.max(0,Math.sin((data.phase||0)*7))* .16;
    }
    if(pose==='clap'){
      const clap=this.reducedMotion?0:Math.sin((data.phase||0)*12)*.22;
      arms[0].rotation.set(-1.3,0,.5+clap);arms[1].rotation.set(-1.3,0,-.5-clap);
    }
    if(pose==='watch'){body.rotation.x=-.08;arms[0].rotation.x=-.15;}
    if(pose==='dejected'){body.rotation.x=.24;body.position.y=-.08;arms[0].rotation.x=.18;arms[1].rotation.x=.12;}
    if(pose==='pitch') {
      // Keyframed delivery: the wind-up progress drives the first two thirds of the clip, the release the rest.
      const w=clamp(S.pitcherWind||0,0,1),releasing=!!S.ball?.vis,style=S.pitchStyle||{},type=style.type||'FF';
      const t=releasing?.68+(1-w)*.32:w*.68;
      const q=sample(PITCH,t);applyPose(p,q,1);
      // Pitch-type overlay: the slider drops the arm slot toward sidearm, the change-up drives with less body.
      const slot=type==='SL'?.35:type==='CH'?.1:0,ease=Math.sin(Math.min(1,t/.85)*Math.PI);
      p.arms[1].rotation.z+=slot*ease;p.arms[1].rotation.x*=type==='CH'?.9:1;p.body.rotation.z+=slot*.25*ease;
      for(let i=0;i<2;i++)p.feet[i].rotation.x=-(legs[i].rotation.x+p.knees[i].rotation.x+body.rotation.x);
    }
    if(pose==='bat') {
      // Keyframed swing. The rear (top) hand is posed by the clip; the lead hand reaches the bat grip by IK.
      const swing=clamp(S.swing||0,0,1),style=S.batStyle||{},power=style.approach==='power',handed=data.hand==='L'?-1:1;
      const liveAim=S.aim&&!swing?S.aim:null;
      const planeY=clamp(liveAim?liveAim.z:(style.pitchZ||0),-1.5,1.5)*.075,planeX=clamp(liveAim?liveAim.x:(style.pitchX||0),-1.5,1.5)*.035;
      const load=S.batLoadAt!=null&&!swing?Math.min(1,Math.max(0,(this.animationTime-S.batLoadAt)/.45)):0;
      const t=swing?swing*(power?1:.92):.25*load;
      const q=sample(SWING,t);
      if(handed<0){const swap=(a,b)=>{const x=q[a];q[a]=q[b];q[b]=x;};swap('legL','legR');swap('kneeL','kneeR');swap('footL','footR');swap('armL','armR');swap('elbowL','elbowR');}
      applyPose(p,q,handed);
      const rear=handed===1?1:0,front=1-rear;
      p.head.rotation.y=-p.spine.rotation.y*.65;
      // Bat: absolute angle in root space, driven by the clip and nudged by where the pitch is.
      // The bat hangs along the hand's −y axis at rest; aim that axis along the clip's bat direction (mirrored for lefties).
      const bat=q.bat||[.35,.9,-.3];
      const dir=new T.Vector3(bat[0]*handed,bat[1]+planeY*.6,bat[2]).normalize();
      const batAngle=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,-1,0),dir);
      root.updateMatrixWorld(true);
      const chainRear=p.arms[rear].quaternion.clone().multiply(p.elbows[rear].quaternion);
      p.hands[rear].quaternion.copy(chainRear.invert().multiply(batAngle));
      root.updateMatrixWorld(true);
      // Lead hand: grip a little further down the bat than the rear hand, in root space.
      const gripWorld=p.hands[rear].getWorldPosition(new T.Vector3()),down=new T.Vector3(0,-.075,0).applyQuaternion(batAngle);
      const grip=p.root.worldToLocal(gripWorld).add(down);grip.x+=planeX;
      reachPlayerHand(p,front,grip,new T.Vector3(front===0?-.55:.55,.03,.02));
      const chainFront=p.arms[front].quaternion.clone().multiply(p.elbows[front].quaternion);
      p.hands[front].quaternion.copy(chainFront.invert().multiply(batAngle));
    }
    if(pose==='crouch') {legs[0].rotation.x=-.95;legs[1].rotation.x=-.95;p.knees[0].rotation.x=p.knees[1].rotation.x=1.7;arms[0].rotation.x=-.7;}
    if(pose==='dive') {body.rotation.z=-1.15;body.position.y=-.3;arms[0].rotation.z=2;}
    if(pose==='jump')arms[0].rotation.z=2.7;
    if(pose==='catch'||pose==='caught'){arms[0].rotation.z=2.7;arms[0].rotation.x=-.3;arms[1].rotation.x=-.4;}
    if((moving&&walking)||pose==='pitch'||pose==='bat'){
      // Plant the lower foot rather than bobbing both soles above the turf.
      root.updateMatrixWorld(true);
      const sole=Math.min(...p.feet.map(foot=>foot.getWorldPosition(new T.Vector3()).y));
      body.position.y+=(root.position.y+.116*root.scale.y-sole)/root.scale.y;
    }
    // Secondary motion is visual only: never changes the player's field coordinates.
    const calm=!moving&&['field','pitch','crouch','bat','run','watch'].includes(pose)&&!(pose==='pitch'&&S.pitcherWind>0)&&!(pose==='bat'&&S.swing>0);
    if(calm&&!this.reducedMotion){
      const t=(this.animationTime||0),phase=p.idleSeed*.13,breathe=Math.sin(t*(1.8+p.idleSeed%5*.09)+phase),weight=Math.sin(t*.65+phase);
      body.position.y+=breathe*.009;body.position.x=weight*.012;body.rotation.z+=weight*.016;
      arms[0].rotation.x+=breathe*.025;arms[1].rotation.x-=breathe*.02;
      if(!S.ball?.vis&&pose!=='watch')p.head.rotation.y=Math.sin(t*.43+phase)*.12;
    }
    const look=['watch','admire','batFlip'].includes(pose)?data.watch:key.startsWith('f')&&S.ball?.vis?S.ball:null;
    if(look){
      const yaw=Math.atan2(look.x-x,y-look.y)-root.rotation.y;
      p.head.rotation.y=clamp(Math.atan2(Math.sin(yaw),Math.cos(yaw)),-.65,.65);
      p.head.rotation.x=clamp(-Math.atan2((look.z||0)-2.1,Math.max(1,Math.hypot(look.x-x,look.y-y))),-.45,.25);
    }
    const expression=['celebrate','clap','admire','batFlip'].includes(pose)?'joy':pose==='dejected'?'sad':['pitch','bat','crouch','catch','caught','dive'].includes(pose)?'focus':'neutral';
    posePlayerFace(p,expression,this.animationTime||data.phase||0,-p.head.rotation.y,-p.head.rotation.x);
    const catchBall=data.catchTarget||(S.ball?.vis&&S.fieldPlay?.fielder&&key==='f'+S.fieldPlay.fielder&&Math.hypot(S.ball.x-x,S.ball.y-y)<2.8?S.ball:null);
    if(catchBall&&p.glove.visible&&!['pitch','watch'].includes(pose))reachPlayerGlove(p,point(catchBall.x,catchBall.y,catchBall.z));

  }
  setGameTime(progress=0){
    const state=this.skyState;if(!state||state.mode==='indoor')return;
    const k=clamp(progress,0,1);if(this.gameTime===k)return;
    const phase=k<.58?k/.58:(k-.58)/.42;
    const mix=(a,b,t)=>new T.Color(a).lerp(new T.Color(b),t);
    const top=k<.58?mix('#73acd2','#334d78',phase):mix('#334d78','#071426',phase);
    const bottom=k<.58?mix('#d9e4d8','#eea16f',phase):mix('#eea16f','#26364e',phase);
    this.scene.fog.color.copy(bottom);this.scene.background.copy(top);
    // 낮: 태양이 낮아지며 붉어진다. 밤: 태양이 아니라 조명탑이 키 라이트다. 하늘은 어두워도 그라운드는 밝다.
    if(k<.58){this.sun.intensity=3.1+(1.35-3.1)*phase;this.sun.color.copy(mix('#fff0d8','#ffad72',phase));this.sun.position.set(-42+70*k,75-58*k,25-10*k);}
    else{const f=Math.min(1,phase*1.6);this.sun.intensity=1.35+(2.7-1.35)*f;this.sun.color.copy(mix('#ffad72','#eef3ff',f));this.sun.position.set(-1.4+13.4*f,41.4+46*f,19.2-25*f);}
    this.ambient.intensity=k<.58?1.9-.6*phase:1.3+.1*phase;this.ambient.color.copy(k<.58?mix('#d6e9ff','#b7a6c8',phase):mix('#b7a6c8','#4d6a99',phase));
    this.ambient.groundColor.copy(k<.58?mix('#586449','#4e4a3e',phase):mix('#4e4a3e','#1f2a20',phase));
    this.ball.material.emissiveIntensity=.10+.22*Math.max(0,(k-.58)/.42);
    state.paint(k);   // sun has moved: repaint the sky (glow, haze, stars) around the new direction
    const halo=Math.max(0,(k-.45)/.55);for(const h of this.floodHalos||[])h.material.opacity=.85*halo;
    for(const m of this.windowMaterials||[])m.emissiveIntensity=.9*Math.max(0,(k-.5)/.5);
    for(const c of this.clouds||[]){c.material.color.copy(k<.58?mix('#f4efe4','#f0b48a',phase):mix('#f0b48a','#2e3a55',phase));}
    this.fill.intensity=k<.58?.55:.55-.2*phase;this.fill.color.copy(k<.58?mix('#9fb6d8','#c7a4a0',phase):mix('#c7a4a0','#6d84b6',phase));
    if(this.floodMaterial)this.floodMaterial.emissiveIntensity=.25+2.75*Math.max(0,(k-.38)/.62);
    this.renderer.toneMappingExposure=1.15+.18*Math.max(0,(k-.55)/.45);this.gameTime=k;
  }
  resize(w,h) {
    const ratio=renderPixelRatio(w,h,devicePixelRatio);
    if(this.renderWidth===w&&this.renderHeight===h&&this.renderRatio===ratio)return;
    this.renderWidth=w;this.renderHeight=h;this.renderRatio=ratio;
    if(this.renderer.getPixelRatio()!==ratio)this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }
  render(S,colors,line,time) {
    this.animationTime=time;
    for(const p of this.players.values()){p.root.visible=false;if(p.shadow)p.shadow.visible=false;}
    const defense=S.half==='top'?colors.home:colors.away,offense=S.half==='top'?colors.away:colors.home;
    for(const [pos,f] of Object.entries(S.fielders)) {
      if(pos==='C'&&!S.catcher)continue;
      this.updatePlayer('f'+pos,f,defense,f.pose||(pos==='P'?'pitch':pos==='C'?'crouch':'field'),S);
    }
    (S.exiting||[]).forEach((f,i)=>this.updatePlayer('exit'+i,f,f.color||defense,'run',S));
    S.runners.forEach((r,i)=>this.updatePlayer('r'+i,r,offense,r.pose||'run',S));
    (S.celebrants||[]).forEach((p,i)=>this.updatePlayer('celebrant'+i,p,offense,p.pose,S));
    if(S.looseBat){
      this.looseBat??=this.mesh(this.cylinder,'#d4ad73',this.scene,[.054,1.42,.054]);
      this.looseBat.visible=true;this.looseBat.position.copy(point(S.looseBat.x,S.looseBat.y,S.looseBat.z));
      this.looseBat.rotation.set(this.reducedMotion?Math.PI/2:S.looseBat.spin,0,-.3);
    }else if(this.looseBat)this.looseBat.visible=false;
    (S.changePlayers||[]).forEach((p,i)=>this.updatePlayer('change'+i,p,offense,p.pose,S));
    if(S.batter)this.updatePlayer('bat',{...S.batter,x:S.batter.hand==='L'?.85:-.85,y:.1},offense,'bat',S);
    const clearing=S.celebrants?.length?Math.min(1,(S.celebrationTime||0)/2):0;
    // The shoulder camera stands where the umpire would: leave him out of the batter's own view.
    const shoulderView=this.opts.playerRole==='batter'&&!['field','base','beauty'].includes(S.broadcast?.kind);
    if(!shoulderView)this.updatePlayer('ump',{x:clearing*4,y:-3.2-clearing*1.8},'#27343f',clearing?'walkField':'crouch',S);
    else{const u=this.players.get('ump');if(u){u.root.visible=false;if(u.shadow)u.shadow.visible=false;}}
    const b=S.ball?.vis?S.ball:S.hold?{x:S.hold.x,y:S.hold.y,z:1.15}:null;
    if(b&&!S.fieldPlay?.physical&&S.fieldPlay?.phase==='flight'&&S.fieldPlay.progress>.8&&S.fielders[S.fieldPlay.fielder]?.pose==='catch'){
      const f=this.players.get('f'+S.fieldPlay.fielder);if(f){f.root.updateMatrixWorld(true);const hand=new T.Vector3();f.glove.getWorldPosition(hand);const k=(S.fieldPlay.progress-.8)/.2;b.x+=(hand.x-b.x)*k;b.y+=(-hand.z-b.y)*k;b.z+=(hand.y-b.z)*k;}
    }
    if(S.hold&&!S.fieldPlay?.physical&&S.fieldPlay?.phase==='caught'){const f=this.players.get('f'+S.hold.pos);if(f){f.root.updateMatrixWorld(true);const hand=new T.Vector3();f.glove.getWorldPosition(hand);b.x=hand.x;b.y=-hand.z;b.z=hand.y;}}
    if(b&&S.fieldPlay?.physical&&['catch','force-out','tag-out','safe'].includes(S.fieldPlay.phase)){
      const f=this.players.get('f'+S.fieldPlay.fielder);if(f)reachPlayerGlove(f,point(b.x,b.y,b.z));
    }
    const radius=this.opts.playerRole==='batter'?.12:.20;
    this.ball.scale.setScalar(radius);this.ball.visible=!!b;
    if(b){
      this.ball.position.copy(point(b.x,b.y,b.z));
      const spin=SPIN[S.pitchStyle?.type]||SPIN.FF,dt=this.lastRender==null?0:clamp(time-this.lastRender,0,.1);
      this.spin+=spin.rpm/60*Math.PI*2*.12*dt;this.ball.rotation.set(0,0,0);this.ball.rotateOnAxis(new T.Vector3(...spin.axis).normalize(),this.spin);
      this.ballShadow.visible=b.z<12;this.ballShadow.position.set(b.x,.09,-b.y);const h=Math.max(0,b.z);
      this.ballShadow.scale.setScalar(radius*3.2+h*.14);this.ballShadow.material.opacity=clamp(.38-h*.03,.08,.38);
    } else {this.ballShadow.visible=false;this.spin=0;}
    this.lastRender=time;
    const trail=S.trail.slice(-this.trailN),pos=this.trailGeo.attributes.position,col=this.trailGeo.attributes.color,n=trail.length;
    if(n>1){
      // Strip width runs along the camera's right axis so the ribbon never collapses when the pitch comes straight at the viewer.
      const right=new T.Vector3(1,0,0).applyQuaternion(this.camera.quaternion),tint=new T.Color('#ffe9a8'),width=radius*.45;
      for(let i=0;i<n;i++){
        const p=point(...trail[i]);
        const side=right.clone().multiplyScalar(width*(.1+.9*i/(n-1)));
        const fade=Math.pow(i/(n-1),2.4)*.32;
        pos.setXYZ(i*2,p.x-side.x,p.y-side.y,p.z-side.z);pos.setXYZ(i*2+1,p.x+side.x,p.y+side.y,p.z+side.z);
        col.setXYZ(i*2,tint.r*fade,tint.g*fade,tint.b*fade);col.setXYZ(i*2+1,tint.r*fade,tint.g*fade,tint.b*fade);
      }
      pos.needsUpdate=true;col.needsUpdate=true;this.trailGeo.setDrawRange(0,(n-1)*6);this.trail.visible=true;
    } else this.trail.visible=false;
    if (this.crowdClock) this.crowdClock.value = time;
    if(this.crowdEnergy){const r=S.crowdReaction,age=r?(performance.now()-r.at)/1000:99;this.crowdEnergy.value=r?.cue==='cheer'?r.strength*Math.min(1,age*3)*Math.max(0,1-age/7):r?.cue==='contact'?.15*Math.max(0,1-age/3):0;}
    updateTeamMascot(this.mascot,time,this.crowdEnergy?.value||0);
    this.direct(S,time);
    this.scoreboard(S,line);
    this.poseFirstPersonBat(S,time);
    this.renderer.render(this.scene,this.camera);
    if(this.opts.onFlightRead){
      let read=null;
      if(S.pitchRead&&S.battingDecision&&this.cameraKind==='batting'&&S.ball?.vis){
        const p=this.ball.position.clone().project(this.camera);
        if(p.z>=-1&&p.z<=1&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1)read={x:(p.x+1)/2,y:(1-p.y)/2,clarity:S.pitchRead.clarity};
      }
      this.opts.onFlightRead(read);
    }
    this.opts.onPitcherAnchor?.(this.pitcherAnchor());
    this.opts.onEntryAnchor?.(this.playerAnchor(this.opts.entryPlayerKey?.()));
  }
  // 1인칭 배트. 대기: 오른 어깨 위. 로드: 뒤로 더 당김. 스윙: 0.34초에 화면을 가로질러 왼쪽으로 빠져나감.
  poseFirstPersonBat(S,time){
    const fp=this.fpBat;if(!fp)return;
    const show=this.opts.eyeLevelBat===true&&this.cameraKind==='batting'&&!!S.batter&&!(S.broadcast&&['field','base','beauty'].includes(S.broadcast.kind));
    fp.visible=show;if(!show)return;
    const m=this.batterHand==='L'?-1:1,lerp=(a,b,t)=>a+(b-a)*t,ease=t=>t*t*(3-2*t);
    const load=S.batLoadAt!=null?ease(Math.min(1,Math.max(0,(time-S.batLoadAt)/.45))):0;
    const swing=S.fpSwingAt!=null?Math.max(0,(time-S.fpSwingAt)/.34):null;
    let px=.34,py=-.30,pz=-.72,rx=.55,ry=-.35,rz=-.62;                           // rest: bat up over the rear shoulder
    px=lerp(px,.40,load);py=lerp(py,-.26,load);rx=lerp(rx,.72,load);ry=lerp(ry,-.55,load);rz=lerp(rz,-.85,load);   // load: further back and up
    if(swing!==null){
      const k=Math.min(1.35,swing),s=ease(Math.min(1,k));
      px=lerp(px,-.55,s);py=lerp(py,-.22,s);pz=lerp(pz,-.62,s);
      rx=lerp(rx,1.78,s);ry=lerp(ry,.55,s);rz=lerp(rz,1.95,s);                        // sweep level across the view and out to the left
      if(k>=1.35)fp.visible=false;
    }
    fp.position.set(px*m,py,pz);fp.rotation.set(rx,ry*m,rz*m);
    this.fpPivot.rotation.y=Math.sin(time*1.3)*.03;                                      // idle waggle
  }
  pitcherAnchor(){
    return this.playerAnchor('fP');
  }
  playerAnchor(key){
    const pitcher=this.players.get(key);if(!pitcher?.root.visible)return null;
    const world=pitcher.head.localToWorld(new T.Vector3(0,pitcher.labelHeight??.36,0));
    if(world.clone().applyMatrix4(this.camera.matrixWorldInverse).z>=0)return null;
    const p=world.project(this.camera);if(p.z< -1||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1)return null;
    return {x:(p.x+1)/2,y:(1-p.y)/2};
  }
  direct(S,time) {
    const shot=S.broadcast || {kind:S.trail.length>1?'field':S.batter?'pitch':'beauty'};
    let kind=shot.kind;
    if(this.opts.playerRole==='batter'&&['pitch','between','batter','pitcher'].includes(kind))kind='batting';
    else if(this.opts.playerRole==='pitcher'&&['pitch','between','batter','pitcher'].includes(kind))kind='mound';
    else if(kind==='between')kind=(S.s+S.b)%2?'batter':'pitcher';
    const ball=S.ball?.vis?S.ball:null;
    let eye,aim,fov;
    if(kind==='batting') {
      // Over the shoulder: a step behind the batter and above the helmet, offset toward the plate so
      // the mound sits centre-right (or centre-left for a lefty) and the batter's own bat stays in frame.
      this.batterHand=S.batter?.hand||'R';const m=this.batterHand==='L'?-1:1;
      const portrait=this.camera.aspect<1,side=portrait?1.05:1.55;   // portrait keeps more of the batter in frame
      eye=point(-.85*m+side*m,-3.6,3.15);
      if(!this.opts.canLook?.())this.resetLook();else this.settleLook(this.lastTime==null?0:clamp(time-this.lastTime,0,.1));
      const yaw=(-.045*m)+this.look.yaw,pitch=-.14+this.look.pitch;
      aim=eye.clone().add(new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(20));
      fov=46;
    }
    else if(kind==='mound') {
      // The pitcher's own view: over the throwing shoulder, looking down at the catcher's mitt.
      const portrait=this.camera.aspect<1;eye=point(portrait?-.9:-1.35,18.44+(portrait?3.1:2.7),portrait?3.0:2.75);aim=point(0,-.6,.9);fov=portrait?44:38;
    }
    else if(kind==='pitch') {eye=this.opts.playerRole?point(-5,76,10):point(-7,76,7);aim=point(0,6,1);fov=this.opts.playerRole?13:16;}
    else if(kind==='bat-flip'){eye=point(-4,-6,3);aim=point(0,1,1.3);fov=48;}
    else if(kind==='celebration'){eye=point(-8,-12,5);aim=point(-1,0,1.2);fov=55;}
    else if(kind==='mound-celebration'){eye=point(-11,6,5.5);aim=point(0,18.2,1.2);fov=48;}
    else if(kind==='entry'){eye=point(-7,7,4);aim=point(2,17,1.1);fov=55;}
    else if(kind==='catch'){const [x,y]=shot.target;eye=point(x+10,y-16,8);aim=point(x,y+2,1.5);fov=48;}
    else if(kind==='change') {eye=point(-3,-12,6);aim=point(-3,-1,1);fov=60;}
    else if(kind==='field') {eye=point(0,-24,43);aim=point((ball?.x||0)*.55,26+(ball?.y||0)*.45,Math.max(1,(ball?.z||0)*.35));fov=56;}
    else if(kind==='base') {const [x,y]=shot.target;eye=this.opts.playerRole?point(x+(x<0?-9:9),y-13,5):point(x<0?-47:47,0,11);aim=point(x,y,1);fov=this.opts.playerRole?44:35;}
    else if(kind==='batter') {eye=point(S.batter?.hand==='L'?-34:34,-2,4);aim=point(0,0,1.1);fov=18;}
    else if(kind==='pitcher') {eye=point(-38,5,6);aim=point(0,18.44,1.2);fov=17;}
    else if(kind==='scoreboard'&&this.boardPosition) {fov=55;const distance=Math.max(34,18/(Math.tan(fov*Math.PI/360)*this.camera.aspect));eye=this.boardPosition.clone().add(new T.Vector3(0,0,distance));aim=this.boardPosition;}
    else {kind='beauty';eye=point(65,-65,72);aim=point(0,42,2);fov=62;}
    const dt=this.lastTime==null?.016:clamp(time-this.lastTime,0,.1);this.lastTime=time;
    // Switch between fixed camera positions by cut; pan only within a shot.
    const changed=kind!==this.cameraKind;
    const OUT=.09,IN=.16,hard=HARD_CUTS.has(kind)||this.reducedMotion||this.cameraKind==null;
    if(changed&&!hard&&!this.cut){this.cut={at:time,from:{eye:this.camera.position.clone(),aim:this.aim.clone(),fov:this.camera.fov},kind};}
    if(this.cut){
      const age=time-this.cut.at;
      if(age<OUT){eye=this.cut.from.eye;aim=this.cut.from.aim;fov=this.cut.from.fov;kind=this.cameraKind;this.fadeTo(age/OUT);}
      else{this.fadeTo(Math.max(0,1-(age-OUT)/IN));if(age>=OUT+IN)this.cut=null;}
    }else this.fadeTo(0);
    const switching=kind!==this.cameraKind;
    this.camera.position.copy(eye);
    if(switching||kind==='batting'||kind==='mound')this.aim.copy(aim);else this.aim.lerp(aim,1-Math.exp(-dt*5));
    this.camera.fov=fov;this.camera.updateProjectionMatrix();this.camera.lookAt(this.aim);
    this.cameraKind=kind;this.fieldShot=kind==='field';
  }
  fadeTo(opacity){
    const o=Math.max(0,Math.min(1,opacity));if(o===this.fadeOpacity)return;this.fadeOpacity=o;
    this.fade.hidden=o<=0||this.canvas.hidden;this.fade.style.opacity=o.toFixed(3);
  }
  showBoardReplay(play,label='REPLAY') {
    if(!play?.frames?.length)return;
    const every=Math.max(1,Math.ceil(play.frames.length/42));
    this.boardReplay={at:performance.now(),duration:2800,label,frames:play.frames.filter((_,i)=>i%every===0||i===play.frames.length-1).map(f=>({x:f.x,y:f.y,z:f.z||0}))};
    this.boardLabel='';
  }
  scoreboard(S,line) {
    const replay=this.boardReplay,age=replay?(performance.now()-replay.at):Infinity,playing=age<replay?.duration;
    if(replay&&!playing)this.boardReplay=null;
    const replayStep=playing?Math.floor(age/70):-1;
    const snapshot={inning:S.inning,half:S.half,b:S.b,s:S.s,outs:S.outs,batter:S.batter?.name||'',pitcher:S.fielders.P?.name||'',top:line.top,bottom:line.bottom,hits:line.hits,err:line.err,lineup:S.lineup||[],battingOrder:S.battingOrder??0,replayStep};
    const label=JSON.stringify(snapshot);if(label===this.boardLabel)return;
    this.boardLabel=label;this.boardSnapshot=JSON.parse(label);
    const c=this.boardCanvas.getContext('2d'),w=1024;c.fillStyle='#071a20';c.fillRect(0,0,w,512);
    c.textAlign='left';c.fillStyle='#b7c5b5';c.font='bold 26px sans-serif';c.fillText(this.opts.park?.name||'PROJECT DUGOUT',30,40);
    c.textAlign='right';c.fillStyle='#75d8aa';c.font='22px sans-serif';c.fillText('LIVE   '+(S.inning||1)+'회 '+(S.half==='bottom'?'말':'초'),990,40);
    const n=Math.max(9,line.top.length,line.bottom.length),start=Math.max(0,n-12),count=n-start,step=690/(count+3),x=i=>250+i*step;
    c.textAlign='center';c.font='22px monospace';c.fillStyle='#889d98';
    for(let i=start;i<n;i++)c.fillText(i+1,x(i-start),92);
    ['R','H','E'].forEach((t,i)=>c.fillText(t,x(count+i),92));
    for(const [row,half,name] of [[0,'top',this.opts.away],[1,'bottom',this.opts.home]]) {
      const y=153+row*65,arr=line[half];c.textAlign='left';c.fillStyle=S.half===half?'#f5d782':'#dae2d7';c.font='bold 29px sans-serif';c.fillText(name.split(' ')[0],30,y);
      c.textAlign='center';c.font='bold 31px monospace';
      for(let i=start;i<n;i++)c.fillText(arr[i]??'–',x(i-start),y);
      [arr.reduce((a,b)=>a+b,0),line.hits[half],line.err[half]].forEach((v,i)=>c.fillText(v,x(count+i),y));
    }
    c.fillStyle='#304a4e';c.fillRect(28,248,968,2);
    if(playing){
      const progress=Math.min(1,age/replay.duration),visible=Math.max(2,Math.ceil(replay.frames.length*progress));
      c.fillStyle='#ee5f4b';c.fillRect(30,273,126,38);c.fillStyle='#fff';c.textAlign='center';c.font='bold 21px sans-serif';c.fillText('REPLAY',93,300);
      c.textAlign='left';c.fillStyle='#f3d681';c.font='bold 30px sans-serif';c.fillText(replay.label,180,302);
      c.strokeStyle='#638e78';c.lineWidth=3;c.beginPath();c.moveTo(510,480);c.lineTo(340,318);c.lineTo(510,270);c.lineTo(680,318);c.closePath();c.stroke();
      const px=q=>510+q.x*3.15,py=q=>470-Math.min(125,Math.max(0,q.y))*1.48;
      c.strokeStyle='#f5da79';c.lineWidth=5;c.lineCap='round';c.beginPath();
      replay.frames.slice(0,visible).forEach((q,i)=>i?c.lineTo(px(q),py(q)):c.moveTo(px(q),py(q)));c.stroke();
      const q=replay.frames[Math.min(visible-1,replay.frames.length-1)];c.fillStyle='#fff';c.beginPath();c.arc(px(q),py(q),7,0,Math.PI*2);c.fill();
      c.fillStyle='#76968e';c.font='18px sans-serif';c.fillText('실제 타구 궤적',716,468);
    }else{
      let dx=40;c.textAlign='left';c.font='bold 24px monospace';
      for(const [title,value,max,color] of [['B',S.b,3,'#68d79b'],['S',S.s,2,'#f1cf62'],['O',S.outs,2,'#ec8175']]) {
        c.fillStyle='#cad6cf';c.fillText(title,dx,294);dx+=39;
        for(let i=0;i<max;i++){c.beginPath();c.arc(dx,286,8,0,Math.PI*2);c.fillStyle=i<value?color:'#294349';c.fill();dx+=27;}dx+=35;
      }
      const lineup=S.lineup||[];c.textAlign='left';c.fillStyle='#83a79f';c.font='19px sans-serif';c.fillText(lineup.length?'NEXT BATTERS':'타자',32,347);c.fillText('ON THE MOUND',620,347);
      if(lineup.length){for(let j=0;j<3;j++){const i=(snapshot.battingOrder+j)%lineup.length,y=389+j*43;c.fillStyle=j===0?'#f4d67f':'#dbe4dc';c.font=(j===0?'bold 27px':'24px')+' sans-serif';c.fillText((i+1)+'  '+lineup[i],32,y);if(j===0){c.fillStyle='#ee6652';c.fillRect(0,y-25,8,31);}}}
      else{c.fillStyle='#edf0df';c.font='bold 31px sans-serif';c.fillText(S.batter?.name||'선수 교대',32,402);}
      c.fillStyle='#edf0df';c.font='bold 33px sans-serif';c.fillText(S.fielders.P?.name||'준비 중',620,402);
      c.fillStyle='#76968e';c.font='20px sans-serif';c.fillText('PITCHER',620,443);c.fillText(this.opts.crowd!=null?'관중 '+this.opts.crowd.toLocaleString()+'명':'PROJECT DUGOUT',620,480);
    }
    this.boardTexture.needsUpdate=true;
  }
  dispose() {
    this.lookInput?.abort();
    this.canvas.removeEventListener('webglcontextlost',this.onLost);
    const geometries=new Set(),materials=new Set(),skeletons=new Set();
    this.scene.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    for(const skeleton of skeletons)skeleton.dispose();
    for(const g of new Set([this.box,this.sphere,this.cylinder,...geometries]))g.dispose();
    for(const m of new Set([...this.materials.values(),...materials]))m.dispose();
    for(const t of this.textures)t.dispose();
    this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();this.fade?.remove();
  }
}
