// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/check-ui.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('web');
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
  try { const b = await readFile(path); res.setHeader('Content-Type', ({ '.js':'text/javascript', '.html':'text/html', '.css':'text/css', '.json':'application/json', '.png':'image/png' })[extname(path)] || 'application/octet-stream'); res.end(b); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless:true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'], ...(process.env.CHROMIUM_PATH ? { executablePath:process.env.CHROMIUM_PATH } : {}) });
try {
 const page=await browser.newPage({viewport:{width:1000,height:900}});
 await page.goto(url+'/motions.html');await page.locator('#play:not([disabled])').waitFor();
 const result=await page.evaluate(async()=>{
 const T=await import('/vendor/three/three.module.min.js');const {createPlayerFactory}=await import('/js/player-model.js');const {Live3D}=await import('/js/live3d.js');const {sample,SWING}=await import('/js/motion-clips.js');
 const p=createPlayerFactory()('bat','#cf7756'),driver={player:()=>p,reducedMotion:true,animationTime:1};let maxGrip=0,maxDirection=0;let continuity=0;
 for(const hand of ['R','L'])for(const approach of ['contact','power'])for(const z of [-1.3,0,1.3])for(const x of [-1.3,0,1.3])for(let step=0;step<=40;step++){const t=.25+.75*step/40;
 p.last=null;Live3D.prototype.updatePlayer.call(driver,'bat',{hand},'#cf7756','bat',{swing:t,batSwingFrom:0,batStyle:{pitchZ:z,pitchX:x,approach}});p.root.updateMatrixWorld(true);
 const rear=hand==='R'?0:1,front=1-rear;
 const a=p.hands[rear].localToWorld(new T.Vector3(0,.075,0)),b=p.hands[front].getWorldPosition(new T.Vector3());
 const dir=p.bat.getWorldQuaternion(new T.Quaternion());const actual=new T.Vector3(0,-1,0).applyQuaternion(dir).applyQuaternion(p.root.getWorldQuaternion(new T.Quaternion()).invert());const q=sample(SWING,t).bat;const expected=new T.Vector3(q[0]*(hand==='R'?1:-1),q[1]+z*.075*.6,q[2]).normalize();
 maxGrip=Math.max(maxGrip,a.distanceTo(b));maxDirection=Math.max(maxDirection,actual.distanceTo(expected));
 }
 for(const hand of ['R','L']){
  let previous=null,turn=0;
  for(let step=0;step<=60;step++){
   const t=.25+.75*step/60;p.last=null;
   Live3D.prototype.updatePlayer.call(driver,'bat',{x:hand==='R'?-.85:.85,y:.1,hand},'#cf7756','bat',{swing:step?t:0,batSwingFrom:.25});p.root.updateMatrixWorld(true);
   const direction=new T.Vector3(0,-1,0).applyQuaternion(p.bat.getWorldQuaternion(new T.Quaternion()));
   const angle=Math.atan2(-direction.z,direction.x);
   if(previous!==null){const delta=Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));if(delta*(hand==='R'?1:-1)<-1e-7)throw Error('bat reversed its overhead sweep');turn+=delta;}
   previous=angle;
   if(step===0){
    const eye=p.battingEye,grip=p.bat.getWorldPosition(new T.Vector3()),tip=p.bat.localToWorld(new T.Vector3(0,-.775,0));
    const forward=new T.Vector3(0,eye.y,-16.8).sub(eye).normalize();
    if(grip.clone().sub(eye).dot(forward)>-.05||tip.clone().sub(eye).dot(forward)>-.2)throw Error('loaded bat is in front of the eyes');
   }
  }
  if(Math.abs(turn)<Math.PI)throw Error('follow-through did not complete the sweep');
 }
 for(const time of [0,1,10]){
 driver.animationTime=time;const state={aim:{x:.4,z:.6}};
 p.last=null;Live3D.prototype.updatePlayer.call(driver,'bat',{hand:'R'},'#cf7756','bat',state);p.root.updateMatrixWorld(true);
 const before=p.hands.map(h=>h.getWorldPosition(new T.Vector3()));
 p.last=null;Live3D.prototype.updatePlayer.call(driver,'bat',{hand:'R'},'#cf7756','bat',{swing:.25,batSwingFrom:.25,batStyle:{pitchX:.4,pitchZ:.6}});p.root.updateMatrixWorld(true);
 continuity=Math.max(continuity,...p.hands.map((h,i)=>h.getWorldPosition(new T.Vector3()).distanceTo(before[i])));
 }
 const {LiveView,Timeline}=await import('/js/live.js');
 for(const from of [.25]){
 const S={batSwingFrom:from},tl=new Timeline();
 const arrival=LiveView.prototype._pitch.call({S},tl,{t:'FF',v:140,x:0,z:0,r:'X',swingStart:1.8},0,.65,{},{last:true});
 tl.items=tl.items.filter(i=>i.dur>0);tl.step(1.8);if(Math.abs(S.swing-from)>1e-9)throw Error('ready pose skipped');
 tl.step(1.94);if(Math.abs(S.swing-.62)>1e-9)throw Error('contact out of sync');
 tl.step(1.94+.28);if(S.swing!==1)throw Error('follow-through skipped');
 tl.step(1.94+.54);if(S.swing!==0||S.batRecover!==0)throw Error('recovery did not complete');
 }
 return {maxGrip,maxDirection,continuity};
 });console.log(JSON.stringify(result));
 await page.selectOption('#motion','bat');for(const [label,t] of [['ready',250],['contact',497],['finish',1000]]){await page.locator('#scrub').fill(String(t));await page.screenshot({path:'/tmp/bat-'+label+'.png'});}
 assert.ok(result.maxDirection<1e-6,'bat follows root-space direction for either hand');assert.ok(result.maxGrip<.001,'both hands stay on grip');assert.ok(result.continuity<1e-6,'press preserves the ready pose and aim');console.log('PASS: both-handed grip, aim extremes, ready/press continuity, contact and recovery');
} finally {await browser.close();await new Promise(r=>server.close(r));}
