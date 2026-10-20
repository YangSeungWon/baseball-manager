// Arcade profiles inspired by MLB pitch definitions, not measured player data.
// x: batter-view right; z: up. Movement below is for a right-handed pitcher.
export const QUICK_PITCH_TYPES = Object.freeze({
  FF: {name:'포심', speed:148, rpm:2350, movement:{x:-.08,z:.28}, axis:[-1,-.08,.08], grip:0, power:2, hint:'빠르게, 덜 떨어지는 공'},
  FT: {name:'투심', speed:144, rpm:2050, movement:{x:-.65,z:-.32}, axis:[-.85,-.55,.12], grip:Math.PI/2, power:2.1, hint:'팔 쪽으로 흐르며 가라앉는 공'},
  SL: {name:'슬라이더', speed:132, rpm:2450, movement:{x:.95,z:-.55}, axis:[-.25,.8,.85], grip:.35, power:2.5, hint:'글러브 쪽으로 크게 휘는 공'},
  FO: {name:'포크', speed:130, rpm:950, movement:{x:-.08,z:-1.3}, axis:[-.85,-.08,.25], grip:Math.PI/2, power:3, hint:'회전이 적고 아래로 크게 떨어지는 공'},
  CU: {name:'커브', speed:120, rpm:2600, movement:{x:.35,z:-1.5}, axis:[1,.25,.1], grip:0, power:2, hint:'느리게, 크게 휘어 떨어지는 공'},
  FC: {name:'커터', speed:141, rpm:2400, movement:{x:.38,z:-.12}, axis:[-.85,.3,.35], grip:.15, power:2.35, hint:'빠르게 오다가 짧게 꺾이는 공'},
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const unit=v=>{const length=Math.hypot(...v);return v.map(n=>n/length);};
export function seededRandom(seed) {
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6d2b79f5)>>>0;
    let n=Math.imul(state^state>>>15,1|state);
    n^=n+Math.imul(n^n>>>7,61|n);
    return ((n^n>>>14)>>>0)/4294967296;
  };
}
export function makeQuickPitcher(seed) {
  const random=seededRandom((seed^0x917c21)>>>0);
  return {hand:random()<.25?'L':'R',stuff:.4+random()*.5,command:.35+random()*.55};
}

// Command only changes target error. Stuff changes velocity, movement and spin.
// Noise is supplied by the seeded generator so a retry reproduces every pitch.
export function deliverQuickPitch(type,pitcher,target,noise,{intro=false}={}) {
  const spec=QUICK_PITCH_TYPES[type];
  if(!spec)throw new Error('Unknown pitch type');
  const stuff=clamp(pitcher.stuff,0,1),command=clamp(pitcher.command,0,1),hand=pitcher.hand==='L'?-1:1;
  const spread=.07+(1-command)*.65;
  const error={x:noise[0]*spread,z:noise[1]*spread};
  const speed=Math.round(spec.speed+(stuff-.5)*10+noise[2]*2);
  const strength=(.7+stuff*.6)*(1+noise[3]*.08);
  const movement={x:spec.movement.x*strength*hand,z:spec.movement.z*strength};
  // A sharper fork suppresses spin; more rpm is not universally better.
  const rpm=Math.round(spec.rpm*(type==='FO'?1.15-stuff*.4:.88+stuff*.24)*(1+noise[4]*.035));
  const axis=unit([spec.axis[0]+noise[5]*.045,(spec.axis[1]+noise[6]*.045)*hand,spec.axis[2]*hand]);
  const x=clamp(target.x+error.x,-1.9,1.9),z=clamp(target.z+error.z,-1.9,1.9);
  return {type,name:spec.name,target:{...target},error,x,z,strike:Math.abs(x)<=1&&Math.abs(z)<=1,
    speed,flight:intro?1250:Math.round(1050*145/speed),movement,movePower:spec.power,
    spin:{rpm,axis,grip:spec.grip*hand,phase:noise[7]*Math.PI},hand:pitcher.hand,intro};
}

// Perspective compresses early separation. Aiming compensates for the type's
// movement; at the plate the path lands exactly at the commanded location + error.
export function pitchLocation(pitch,progress) {
  const p=clamp(progress,0,1),u=p/(3-2*p),curve=u**pitch.movePower;
  return {x:pitch.x*u+pitch.movement.x*(curve-u),z:pitch.z*u+pitch.movement.z*(curve-u),depth:u};
}

// A single continuous, stylized baseball seam on a sphere. Every pitch uses the
// same surface; grip and spin axis determine what reaches the camera-facing side.
const SEAM=Array.from({length:129},(_,i)=>{
  const t=i/128*Math.PI*2,latitude=.7*Math.sin(2*t);
  return [Math.cos(t)*Math.cos(latitude),Math.sin(t)*Math.cos(latitude),Math.sin(latitude)];
});
const rotate=(point,axis,angle)=>{
  const [x,y,z]=point,[a,b,c]=axis,co=Math.cos(angle),si=Math.sin(angle),dot=a*x+b*y+c*z;
  return [x*co+(b*z-c*y)*si+a*dot*(1-co),y*co+(c*x-a*z)*si+b*dot*(1-co),z*co+(a*y-b*x)*si+c*dot*(1-co)];
};
export const VISUAL_SPIN_SCALE=.075;
export function seamPoints(spin,seconds) {
  const angle=spin.phase+seconds*(spin.rpm/60)*Math.PI*2*VISUAL_SPIN_SCALE;
  return SEAM.map(point=>rotate(rotate(point,[0,1,0],spin.grip),spin.axis,angle));
}
export function drawSpinningBall(ctx,x,y,radius,spin,seconds) {
  ctx.save();ctx.translate(x,y);
  const shade=ctx.createRadialGradient(-radius*.3,-radius*.35,radius*.05,0,0,radius);
  shade.addColorStop(0,'#fffdf1');shade.addColorStop(1,'#dbd4b5');
  ctx.fillStyle=shade;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();ctx.clip();
  const points=seamPoints(spin,seconds);
  ctx.strokeStyle='#b33d35';ctx.lineWidth=Math.max(1,radius*.12);ctx.lineCap='round';
  ctx.beginPath();let visible=false;
  for(const [a,b,c] of points){
    if(c<0){visible=false;continue;}
    if(visible)ctx.lineTo(a*radius,-b*radius);else ctx.moveTo(a*radius,-b*radius);
    visible=true;
  }
  ctx.stroke();ctx.lineWidth=Math.max(.7,radius*.07);
  for(let i=2;i<points.length-1;i+=4){
    const [a,b,c]=points[i];if(c<.12)continue;
    const before=points[i-1],after=points[i+1],dx=after[0]-before[0],dy=after[1]-before[1],len=Math.hypot(dx,dy)||1;
    const nx=-dy/len*radius*.12,ny=dx/len*radius*.12;
    ctx.beginPath();ctx.moveTo(a*radius-nx,-b*radius+ny);ctx.lineTo(a*radius+nx,-b*radius-ny);ctx.stroke();
  }
  ctx.restore();
}
