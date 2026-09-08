// Optional renderer. Simulation coordinates (x, depth, height) become (x, height, -depth).
// All animation follows LiveView's state; this module never advances the game.
import * as T from '../vendor/three/three.module.min.js';
import { fence } from './core/bip.js';
import { buildSurroundings } from './ballpark3d.js';
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const point = (x, y, z = 0) => new T.Vector3(x, z, -y);

export class Live3D {
  constructor(host, dims, opts, onLost) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'lv-three';
    this.canvas.setAttribute('aria-label', '3D 야구 경기 중계');
    this.onLost = e => { e.preventDefault(); onLost(); };
    this.canvas.addEventListener('webglcontextlost', this.onLost);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
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
    this.players = new Map(); this.materials = new Map(); this.textures = [];
    this.box = new T.BoxGeometry(1, 1, 1);
    this.sphere = new T.SphereGeometry(1, 10, 8);
    this.cylinder = new T.CylinderGeometry(1, 1, 1, 10);
    this.ambient = new T.HemisphereLight('#d6e9ff', '#586449', 2.1); this.scene.add(this.ambient);
    const sun = this.sun = new T.DirectionalLight('#ffe8c0', 3.1);
    sun.position.set(-42, 75, 25); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 200 });
    sun.target.position.set(0, 0, -28); this.scene.add(sun.target);
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -.0005; sun.shadow.normalBias = .025;
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
    const root=new T.Group();this.scene.add(root);
    const body=new T.Group();root.add(body);
    const shirt=this.mesh(this.cylinder,color,body,[.27,.65,.21],[0,1.05,0]);
    this.mesh(this.sphere,'#c99976',body,[.17,.21,.17],[0,1.61,0]);
    const cap=this.mesh(this.sphere,color,body,[.19,.105,.19],[0,1.77,0]);
    const brim=this.mesh(this.box,color,body,[.34,.04,.24],[0,1.73,.15]);
    this.mesh(this.box,'#25333b',body,[.48,.065,.37],[0,.76,0]);
    const limb=(x,y,length,col) => { const g=new T.Group();g.position.set(x,y,0);body.add(g);this.mesh(this.cylinder,col,g,[.085,length,.085],[0,-length/2,0]);return g; };
    const legs=[limb(-.13,.75,.62,'#e4e2d7'),limb(.13,.75,.62,'#e4e2d7')];
    for(const leg of legs) this.mesh(this.box,'#24303b',leg,[.18,.12,.30],[0,-.64,.065]);
    const arms=[limb(-.32,1.33,.5,color),limb(.32,1.33,.5,color)];
    const glove=this.mesh(this.sphere,'#97633b',arms[0],[.15,.19,.11],[0,-.51,.04]);
    const bat=this.mesh(this.cylinder,'#d4ad73',arms[1],[.04,1.05,.04],[0,-.9,0]);bat.visible=false;
    body.traverse(m=>{if(m.isMesh)m.castShadow=true;});
    root.scale.setScalar(1.35);
    const player={root,body,shirt,cap,brim,arms,legs,glove,bat,phase:0,last:null};this.players.set(key,player);return player;
  }
  updatePlayer(key, data, color, pose, S) {
    const p=this.player(key,color), {root,body,arms,legs}=p;
    root.visible=!data.wait && !data.gone && (data.alpha ?? 1)>.08;
    if(!root.visible)return;
    const x=data.x||0,y=data.y||0;
    const dx=p.last?x-p.last.x:0,dy=p.last?y-p.last.y:0,dist=Math.hypot(dx,dy);
    p.last={x,y};p.phase+=dist*2.9;
    const moving=dist>.0001;
    if(moving) root.rotation.y=Math.atan2(dx,-dy);
    else if(pose==='pitch'||pose==='field'||pose==='crouch')root.rotation.y=Math.atan2(-x,y);
    else if(pose==='bat')root.rotation.y=data.hand==='L'?-Math.PI/2:Math.PI/2;
    root.position.set(x,Math.max(0,data.jump||0),-y);
    p.shirt.material=p.cap.material=p.brim.material=this.material(color);
    const stride=moving?Math.sin(p.phase)*.65:0;
    legs[0].rotation.x=stride;legs[1].rotation.x=-stride;
    arms[0].rotation.set(-stride*.7,0,.12);arms[1].rotation.set(stride*.7,0,-.12);
    body.position.y=pose==='crouch'?-.42:0;body.rotation.set(0,0,0);
    p.bat.visible=pose==='bat';p.glove.visible=pose!=='bat';
    if(pose==='pitch') {arms[1].rotation.x=-S.pitcherWind*2.9;legs[0].rotation.x=-Math.sin(S.pitcherWind*Math.PI)*.9;}
    if(pose==='bat') {arms[0].rotation.x=-1.1;arms[1].rotation.x=-2.1+(S.swing||0)*2.8;body.rotation.y=(S.swing||0)*1.7;}
    if(pose==='crouch') {legs[0].rotation.x=-.7;legs[1].rotation.x=-.7;arms[0].rotation.x=-.7;}
    if(pose==='dive') {body.rotation.z=-1.15;body.position.y=-.3;arms[0].rotation.z=2;}
    if(pose==='jump')arms[0].rotation.z=2.7;
  }
  resize(w,h) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(700000 / Math.max(1,w*h))));
    this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }
  render(S,colors,line,time) {
    for(const p of this.players.values())p.root.visible=false;
    const defense=S.half==='top'?colors.home:colors.away,offense=S.half==='top'?colors.away:colors.home;
    for(const [pos,f] of Object.entries(S.fielders)) {
      if(pos==='C'&&!S.catcher)continue;
      this.updatePlayer('f'+pos,f,defense,f.pose||(pos==='P'?'pitch':pos==='C'?'crouch':'field'),S);
    }
    (S.exiting||[]).forEach((f,i)=>this.updatePlayer('exit'+i,f,f.color||defense,'run',S));
    S.runners.forEach((r,i)=>this.updatePlayer('r'+i,r,offense,'run',S));
    const firstPerson=this.opts.playerRole==='batter'&&!['field','base','beauty'].includes(S.broadcast?.kind);
    if(S.batter&&!firstPerson)this.updatePlayer('bat',{...S.batter,x:S.batter.hand==='L'?.85:-.85,y:.1},offense,'bat',S);
    this.updatePlayer('ump',{x:0,y:-3.2},'#27343f','crouch',S);
    const b=S.ball?.vis?S.ball:S.hold?{x:S.hold.x,y:S.hold.y,z:1.15}:null;
    this.ball.scale.setScalar(this.opts.playerRole==='batter'?.12:.20);this.ball.visible=!!b;if(b)this.ball.position.copy(point(b.x,b.y,b.z));
    const trail=S.trail.slice(-26),attr=this.trailGeo.attributes.position;
    trail.forEach(([x,y,z],i)=>attr.setXYZ(i,x,z,-y));attr.needsUpdate=true;this.trailGeo.setDrawRange(0,trail.length);this.trail.visible=trail.length>1;
    if (this.crowdClock) this.crowdClock.value = time;
    if(this.crowdEnergy){const r=S.crowdReaction,age=r?(performance.now()-r.at)/1000:99;this.crowdEnergy.value=r?.cue==='cheer'?r.strength*Math.min(1,age*3)*Math.max(0,1-age/7):r?.cue==='contact'?.15*Math.max(0,1-age/3):0;}
    this.direct(S,time);
    this.scoreboard(S,line);
    this.renderer.render(this.scene,this.camera);
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
    else if(kind==='field') {eye=point(0,-24,43);aim=point((ball?.x||0)*.55,26+(ball?.y||0)*.45,Math.max(1,(ball?.z||0)*.35));fov=56;}
    else if(kind==='base') {const [x,y]=shot.target;eye=point(x<0?-47:47,0,11);aim=point(x,y,1);fov=35;}
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
    const geometries=new Set(),materials=new Set();
    this.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    for(const g of [this.box,this.sphere,this.cylinder,...geometries])g.dispose();
    for(const m of new Set([...this.materials.values(),...materials]))m.dispose();
    for(const t of this.textures)t.dispose();
    this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();
  }
}
