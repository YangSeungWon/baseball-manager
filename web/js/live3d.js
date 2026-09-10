import {createPlayerFactory,reachPlayerHand,reachPlayerGlove,posePlayerFace} from './player-model.js';
export {loadPlayerModel} from './player-model.js';
import { renderPixelRatio } from './render-quality.js';
// Optional renderer. Simulation coordinates (x, depth, height) become (x, height, -depth).
// All animation follows LiveView's state; this module never advances the game.
import * as T from '../vendor/three/three.module.min.js';
import { fence } from './core/bip.js';
import { buildSurroundings } from './ballpark3d.js';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const point = (x, y, z = 0) => new T.Vector3(x, z, -y);

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
    this.ambient = new T.HemisphereLight('#d6e9ff', '#586449', 2.1); this.scene.add(this.ambient);
    const sun = this.sun = new T.DirectionalLight('#ffe8c0', 3.1);
    sun.position.set(-42, 75, 25); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 200 });
    sun.target.position.set(0, 0, -28); this.scene.add(sun.target);
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0005; sun.shadow.normalBias = .025;
    this.scene.add(sun);
    this.stadium(dims, opts);
    this.fenceAt = a => fence(a, dims);
    buildSurroundings(this, opts);
    this.batchStadium();
    this.ball = this.mesh(this.sphere, '#fff8df', this.scene, [.20, .20, .20]);
    this.ball.castShadow = true;
    // A restrained bright material keeps the small ball readable against seats and grass.
    this.ball.material = new T.MeshStandardMaterial({color:'#fff8df',emissive:'#fff1c9',emissiveIntensity:.35,roughness:.55});
    this.trailGeo = new T.BufferGeometry();
    this.trailGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(26 * 3), 3));
    this.trail = new T.Line(this.trailGeo, new T.LineBasicMaterial({ color: '#fff2bc', transparent: true, opacity: .35 }));
    this.trail.frustumCulled = false; this.scene.add(this.trail);
    host.prepend(this.canvas);
    this.look={yaw:0,pitch:0};
    if(opts.playerRole==='batter') {
      this.canvas.setAttribute('aria-label','타자 시점 구장');
      this.canvas.style.touchAction='none';
      this.lookInput=new AbortController();
      const listen=(name,fn)=>this.canvas.addEventListener(name,fn,{signal:this.lookInput.signal});
      listen('pointerdown',e=>{
        if(e.button!==0||!this.opts.canLook?.()||this.drag)return;
        this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);
      });
      listen('pointermove',e=>{
        if(this.drag?.id!==e.pointerId)return;
        if(!this.opts.canLook?.()){this.resetLook();return;}
        this.look.yaw=clamp(this.look.yaw-(e.clientX-this.drag.x)*.006,-Math.PI,Math.PI);
        this.look.pitch=clamp(this.look.pitch-(e.clientY-this.drag.y)*.006,-1.35,.85);
        this.drag.x=e.clientX;this.drag.y=e.clientY;
      });
      const end=e=>{if(this.drag?.id===e.pointerId)this.drag=null;};
      listen('pointerup',end);listen('pointercancel',end);listen('lostpointercapture',end);
    }
  }
  resetLook() {
    if(this.drag&&this.canvas.hasPointerCapture(this.drag.id))this.canvas.releasePointerCapture(this.drag.id);
    this.drag=null;this.look.yaw=0;this.look.pitch=0;
  }
  lookAtPlate() {
    if(!this.opts.canLook?.())return;
    const centered=Math.abs(this.look.yaw)<.01&&Math.abs(this.look.pitch)<.01;
    this.resetLook();
    if(centered){this.look.yaw=this.batterHand==='L'?-1.22:1.22;this.look.pitch=-1.05;}
  }
  material(color) {
    if (!this.materials.has(color)) this.materials.set(color, new T.MeshStandardMaterial({ color, roughness: .86 }));
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
    const wall=arc(0); this.wallHeight=dims.real?.fH || 3;
    for(let i=1;i<wall.length;i++) {
      const a=point(...wall[i-1]), b=point(...wall[i]), d=b.clone().sub(a);
      const m=this.mesh(this.box,i%5===0?'#254f50':'#214344',this.scene,[.55,this.wallHeight,d.length()+.1]);
      m.position.copy(a.add(b).multiplyScalar(.5));m.position.y=this.wallHeight/2;m.rotation.y=Math.atan2(d.x,d.z);
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
        lamp.material=this.material('#fff2ce'); lamp.material.emissive.set('#ffe9bc'); lamp.material.emissiveIntensity=1.2;
      }
    }
    const cf=fence(0,dims);
    this.boardCanvas=document.createElement('canvas');this.boardCanvas.width=1024;this.boardCanvas.height=512;
    this.boardTexture=new T.CanvasTexture(this.boardCanvas);this.boardTexture.colorSpace=T.SRGBColorSpace;this.textures.push(this.boardTexture);
    const board=new T.Mesh(new T.PlaneGeometry(34,13),new T.MeshBasicMaterial({map:this.boardTexture}));board.position.set(0,17,-cf-12);this.scene.add(board);
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
    const player=this.createPlayer(key,color);this.scene.add(player.root);this.players.set(key,player);return player;
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
      const w=clamp(S.pitcherWind||0,0,1),releasing=!!S.ball?.vis;
      const step=releasing?1:T.MathUtils.smoothstep(w,.45,1),follow=releasing?1-w:0;
      const lift=releasing?0:Math.sin(Math.min(1,w/.75)*Math.PI)*.95;
      legs[0].rotation.x=-lift-step*.56;p.knees[0].rotation.x=lift*1.5+step*.22;
      legs[1].rotation.x=follow*.62;p.knees[1].rotation.x=.12*step+follow*.7;
      arms[0].rotation.x=-.95+w*.45;p.elbows[0].rotation.x=-1.15;
      arms[1].rotation.x=releasing?-.3-w*2.5:-.7-w*2.1;
      arms[1].rotation.z=-.12-w*.35;
      p.elbows[1].rotation.x=-.12-(releasing?0:Math.sin(w*Math.PI)*.9);
      p.hips.rotation.y=-step*.16;
      p.spine.rotation.y=(releasing?0:Math.sin(w*Math.PI)*.32)-step*.12-follow*.15;
      body.position.z=step*.24;body.rotation.x=step*.10+follow*.32;
      for(let i=0;i<2;i++)p.feet[i].rotation.x=-(legs[i].rotation.x+p.knees[i].rotation.x+body.rotation.x);
    }
    if(pose==='bat') {
      const swing=clamp(S.swing||0,0,1),drive=Math.sin(swing*Math.PI/2),handed=data.hand==='L'?-1:1;
      body.position.y-=.035;body.rotation.x=.07;
      legs[0].rotation.x=-.13;legs[1].rotation.x=-.18;
      p.knees[0].rotation.x=.24;p.knees[1].rotation.x=.31;
      const rear=handed===1?1:0,front=1-rear;
      p.hips.rotation.y=handed*drive*.55;
      p.spine.rotation.y=handed*(-.18+drive*.95);
      p.knees[rear].rotation.x+=drive*.22;
      p.feet[rear].rotation.set(drive*.28,handed*drive*.3,0);
      p.feet[front].rotation.y=-handed*drive*.55;
      body.position.x=-handed*drive*.045;
      p.head.rotation.y=-p.spine.rotation.y*.65;
      const grip=new T.Vector3(handed*(.10-drive*.20),.27+drive*.07,.20+Math.sin(swing*Math.PI)*.09);
      for(let i=0;i<2;i++){
        const target=grip.clone();target.y+=(i===1?.025:-.025);
        reachPlayerHand(p,i,target,new T.Vector3(i===0?-.55:.55,.03,.02));
        const parent=p.arms[i].quaternion.clone().multiply(p.elbows[i].quaternion);
        const batAngle=new T.Quaternion().setFromEuler(new T.Euler(.10-drive*.8,0,Math.PI-handed*(.55+drive*1.2)));
        p.hands[i].quaternion.copy(parent.invert().multiply(batAngle));
      }
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
  resize(w,h) {
    this.renderer.setPixelRatio(renderPixelRatio(w,h,devicePixelRatio));
    this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }
  render(S,colors,line,time) {
    this.animationTime=time;
    for(const p of this.players.values())p.root.visible=false;
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
    const firstPerson=this.opts.playerRole==='batter'&&!['field','base','beauty'].includes(S.broadcast?.kind);
    if(S.batter&&!firstPerson)this.updatePlayer('bat',{...S.batter,x:S.batter.hand==='L'?.85:-.85,y:.1},offense,'bat',S);
    const clearing=S.celebrants?.length?Math.min(1,(S.celebrationTime||0)/2):0;
    this.updatePlayer('ump',{x:clearing*4,y:-3.2-clearing*1.8},'#27343f',clearing?'walkField':'crouch',S);
    const b=S.ball?.vis?S.ball:S.hold?{x:S.hold.x,y:S.hold.y,z:1.15}:null;
    if(b&&!S.fieldPlay?.physical&&S.fieldPlay?.phase==='flight'&&S.fieldPlay.progress>.8&&S.fielders[S.fieldPlay.fielder]?.pose==='catch'){
      const f=this.players.get('f'+S.fieldPlay.fielder);if(f){f.root.updateMatrixWorld(true);const hand=new T.Vector3();f.glove.getWorldPosition(hand);const k=(S.fieldPlay.progress-.8)/.2;b.x+=(hand.x-b.x)*k;b.y+=(-hand.z-b.y)*k;b.z+=(hand.y-b.z)*k;}
    }
    if(S.hold&&!S.fieldPlay?.physical&&S.fieldPlay?.phase==='caught'){const f=this.players.get('f'+S.hold.pos);if(f){f.root.updateMatrixWorld(true);const hand=new T.Vector3();f.glove.getWorldPosition(hand);b.x=hand.x;b.y=-hand.z;b.z=hand.y;}}
    if(b&&S.fieldPlay?.physical&&['catch','force-out','tag-out','safe'].includes(S.fieldPlay.phase)){
      const f=this.players.get('f'+S.fieldPlay.fielder);if(f)reachPlayerGlove(f,point(b.x,b.y,b.z));
    }
    this.ball.scale.setScalar(this.opts.playerRole==='batter'?.12:.20);this.ball.visible=!!b;if(b)this.ball.position.copy(point(b.x,b.y,b.z));
    const trail=S.trail.slice(-26),attr=this.trailGeo.attributes.position;
    trail.forEach(([x,y,z],i)=>attr.setXYZ(i,x,z,-y));attr.needsUpdate=true;this.trailGeo.setDrawRange(0,trail.length);this.trail.visible=trail.length>1;
    if (this.crowdClock) this.crowdClock.value = time;
    if(this.crowdEnergy){const r=S.crowdReaction,age=r?(performance.now()-r.at)/1000:99;this.crowdEnergy.value=r?.cue==='cheer'?r.strength*Math.min(1,age*3)*Math.max(0,1-age/7):r?.cue==='contact'?.15*Math.max(0,1-age/3):0;}
    this.direct(S,time);
    this.scoreboard(S,line);
    this.renderer.render(this.scene,this.camera);
    this.opts.onPitcherAnchor?.(this.pitcherAnchor());
    this.opts.onEntryAnchor?.(this.playerAnchor(this.opts.entryPlayerKey?.()));
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
    else if(kind==='between')kind=(S.s+S.b)%2?'batter':'pitcher';
    const ball=S.ball?.vis?S.ball:null;
    let eye,aim,fov;
    if(kind==='batting') {
      this.batterHand=S.batter?.hand||'R';
      eye=point(this.batterHand==='L'?.85:-.85,-.25,1.65);
      if(!this.opts.canLook?.())this.resetLook();
      const yaw=(this.batterHand==='L'?-.045:.045)+this.look.yaw,pitch=-.025+this.look.pitch;
      aim=eye.clone().add(new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(20));
      fov=65;
    }
    else if(kind==='pitch') {eye=this.opts.playerRole?point(-5,76,10):point(-7,76,7);aim=point(0,6,1);fov=this.opts.playerRole?13:16;}
    else if(kind==='bat-flip'){eye=point(-4,-6,3);aim=point(0,1,1.3);fov=48;}
    else if(kind==='celebration'){eye=point(-8,-12,5);aim=point(-1,0,1.2);fov=55;}
    else if(kind==='entry'){eye=point(-7,7,4);aim=point(2,17,1.1);fov=55;}
    else if(kind==='catch'){const [x,y]=shot.target;eye=point(x+10,y-16,8);aim=point(x,y+2,1.5);fov=48;}
    else if(kind==='change') {eye=point(-3,-12,6);aim=point(-3,-1,1);fov=60;}
    else if(kind==='field') {eye=point(0,-24,43);aim=point((ball?.x||0)*.55,26+(ball?.y||0)*.45,Math.max(1,(ball?.z||0)*.35));fov=56;}
    else if(kind==='base') {const [x,y]=shot.target;eye=this.opts.playerRole?point(x+(x<0?-9:9),y-13,5):point(x<0?-47:47,0,11);aim=point(x,y,1);fov=this.opts.playerRole?44:35;}
    else if(kind==='batter') {eye=point(S.batter?.hand==='L'?-34:34,-2,4);aim=point(0,0,1.1);fov=18;}
    else if(kind==='pitcher') {eye=point(-38,5,6);aim=point(0,18.44,1.2);fov=17;}
    else {kind='beauty';eye=point(65,-65,72);aim=point(0,42,2);fov=62;}
    const dt=this.lastTime==null?.016:clamp(time-this.lastTime,0,.1);this.lastTime=time;
    // Switch between fixed camera positions by cut; pan only within a shot.
    const changed=kind!==this.cameraKind;
    this.camera.position.copy(eye);
    if(changed||kind==='batting')this.aim.copy(aim);else this.aim.lerp(aim,1-Math.exp(-dt*5));
    this.camera.fov=fov;this.camera.updateProjectionMatrix();this.camera.lookAt(this.aim);
    this.cameraKind=kind;this.fieldShot=kind==='field';
  }
  scoreboard(S,line) {
    const snapshot={inning:S.inning,half:S.half,b:S.b,s:S.s,outs:S.outs,batter:S.batter?.name||'',pitcher:S.fielders.P?.name||'',top:line.top,bottom:line.bottom,hits:line.hits,err:line.err};
    const label=JSON.stringify(snapshot);if(label===this.boardLabel)return;
    this.boardLabel=label;this.boardSnapshot=JSON.parse(label);
    const c=this.boardCanvas.getContext('2d'),w=1024;c.fillStyle='#0a2026';c.fillRect(0,0,w,512);
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
    let dx=40;c.textAlign='left';c.font='bold 26px monospace';
    for(const [title,value,max,color] of [['B',S.b,3,'#68d79b'],['S',S.s,2,'#f1cf62'],['O',S.outs,2,'#ec8175']]) {
      c.fillStyle='#cad6cf';c.fillText(title,dx,299);dx+=42;
      for(let i=0;i<max;i++){c.beginPath();c.arc(dx,289,9,0,Math.PI*2);c.fillStyle=i<value?color:'#294349';c.fill();dx+=30;}dx+=45;
    }
    c.font='24px sans-serif';c.fillStyle='#91b3aa';c.fillText('타자',32,370);c.fillText('투수',540,370);
    c.font='bold 31px sans-serif';c.fillStyle='#edf0df';c.fillText(S.batter?.name||'선수 교대',32,416);c.fillText(S.fielders.P?.name||'준비 중',540,416);
    c.font='20px sans-serif';c.fillStyle='#7b9e98';c.fillText(this.opts.crowd!=null?'관중 '+this.opts.crowd.toLocaleString()+'명':'PROJECT DUGOUT',32,479);
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
    this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();
  }
}
