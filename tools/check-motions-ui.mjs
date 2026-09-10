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
 for(const [width,height] of [[390,844],[1200,900]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/motions.html');await page.locator('#play:not([disabled])').waitFor();
  const gait=await page.evaluate(async()=>{
   const T=await import('/vendor/three/three.module.min.js');const {createPlayerFactory}=await import('/js/player-model.js');const {Live3D}=await import('/js/live3d.js');
   const p=createPlayerFactory()('bat','#cf7756'),driver={player:()=>p,reducedMotion:true};let error=0,maxKnee=0;
   for(let i=0;i<24;i++){
    p.phase=i*Math.PI/12;p.last={x:2,y:3.01};
    Live3D.prototype.updatePlayer.call(driver,'bat',{x:2,y:3},'#cf7756','walk',{});p.root.updateMatrixWorld(true);
    const ankle=Math.min(...p.feet.map(f=>f.getWorldPosition(new T.Vector3()).y));
    error=Math.max(error,Math.abs(ankle-.116*p.root.scale.y));maxKnee=Math.max(maxKnee,...p.knees.map(k=>k.rotation.x));
   }
   return {error,maxKnee,x:p.root.position.x,z:p.root.position.z};
  });
  assert.ok(gait.error<.00001,'stance foot remains on the ground throughout the walking cycle');
  assert.ok(gait.maxKnee<=.38,'walking uses a smaller knee lift');assert.equal(gait.x,2);assert.equal(gait.z,-3);
  const variants=await page.evaluate(async()=>{
   const {createPlayerFactory}=await import('/js/player-model.js');const {Live3D}=await import('/js/live3d.js');
   const p=createPlayerFactory()('fP','#427c83'),driver={player:()=>p,reducedMotion:true};
   const pose=(kind,S,data={})=>{p.last=null;Live3D.prototype.updatePlayer.call(driver,'fP',{x:0,y:0,hand:'R',...data},'#427c83',kind,S);p.root.updateMatrixWorld(true);return {armX:p.arms[1].rotation.x,armZ:p.arms[1].rotation.z,hips:p.hips.rotation.y,handY:p.hands[1].getWorldPosition(new (p.root.position.constructor)()).y};};
   const ff=pose('pitch',{pitcherWind:.7,pitchStyle:{type:'FF'}}),sl=pose('pitch',{pitcherWind:.7,pitchStyle:{type:'SL'}}),ch=pose('pitch',{pitcherWind:.7,pitchStyle:{type:'CH'}});
   const contact=pose('bat',{swing:.8,batStyle:{approach:'contact',pitchZ:0,pitchX:0}}),power=pose('bat',{swing:.8,batStyle:{approach:'power',pitchZ:0,pitchX:0}}),low=pose('bat',{swing:.45,batStyle:{approach:'contact',pitchZ:-.9,pitchX:0}}),high=pose('bat',{swing:.45,batStyle:{approach:'contact',pitchZ:.9,pitchX:0}});
   return {ff,sl,ch,contact,power,low,high};
  });
  assert.ok(Math.abs(variants.ff.armZ-variants.sl.armZ)>.2,'slider uses a lower arm slot');
  assert.ok(Math.abs(variants.ff.armX-variants.ch.armX)>.2,'changeup uses a softer arm drive');
  assert.ok(Math.abs(variants.power.hips)>Math.abs(variants.contact.hips)+.1,'power swing turns the hips farther');
  assert.ok(variants.high.handY>variants.low.handY+.08,'swing plane follows pitch height');
  const joints=await page.evaluate(async()=>{
   const T=await import('/vendor/three/three.module.min.js');const {createPlayerFactory}=await import('/js/player-model.js');const {Live3D}=await import('/js/live3d.js');
   const p=createPlayerFactory()('fP','#427c83'),driver={player:()=>p,reducedMotion:true};
   const pose=(kind,S={},data={})=>{p.last=null;Live3D.prototype.updatePlayer.call(driver,'fP',{x:0,y:0,...data},'#427c83',kind,S);p.root.updateMatrixWorld(true);};
   pose('pitch',{pitcherWind:1});const before=p.hands[1].getWorldPosition(new T.Vector3());
   pose('pitch',{pitcherWind:.999,ball:{x:0,y:-10,z:1,vis:true}});const releaseGap=before.distanceTo(p.hands[1].getWorldPosition(new T.Vector3()));
   let attachment=0,lengthError=0,groundError=0;const knees=[];
   for(const z of [.95,1.75,2.65,5]){
    pose('catch',{}, {catchTarget:{x:-.35,y:-.35,z}});
    attachment=Math.max(attachment,p.glove.position.distanceTo(p.gloveRest));
    groundError=Math.max(groundError,Math.abs(Math.min(...p.feet.map(f=>f.getWorldPosition(new T.Vector3()).y))-.116*1.35));
    const a=p.arms[0].getWorldPosition(new T.Vector3()),b=p.elbows[0].getWorldPosition(new T.Vector3()),c=p.hands[0].getWorldPosition(new T.Vector3());
    lengthError=Math.max(lengthError,Math.abs(a.distanceTo(b)-p.elbows[0].position.length()*1.35),Math.abs(b.distanceTo(c)-p.hands[0].position.length()*1.35));knees.push(p.knees[0].rotation.x);
   }
   pose('catch',{}, {catchTarget:{x:-.35,y:-.35,z:1.75}});
   const grip=p.glove.localToWorld(new T.Vector3(0,-.055,.027));
   return {releaseGap,attachment,lengthError,groundError,knees,catchError:grip.distanceTo(new T.Vector3(-.35,1.75,.35))};
  });
  assert.ok(joints.releaseGap<.025,'throwing hand remains continuous across release');
  assert.ok(joints.groundError<.00001,'catching keeps the supporting foot grounded');
  assert.equal(joints.attachment,0,'glove remains attached even for unreachable targets');
  assert.ok(joints.lengthError<.00001,'catching does not stretch arm bones');
  assert.ok(joints.knees[0]>joints.knees[1],'low catches bend the knees');
  assert.ok(joints.catchError<.015,'reachable ball meets the glove palm');
  for(const motion of ['pitch','bat','field','catch','dive','crouch','walk','run']){
   await page.selectOption('#motion',motion);
   await page.locator('#scrub').fill('450');
   assert.equal(await page.locator('#play').textContent(),'재생');
   assert.equal(await page.locator('#progress').textContent(),'45%');
   await page.locator('[data-angle="1.570796"]').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(motion==='catch'){for(const height of ['0.95','1.75','2.65']){await page.selectOption('#height',height);await page.screenshot({path:`/tmp/dugout-catch-${height}-${width}.png`});}}
   if(['pitch','bat','walk','catch'].includes(motion))await page.screenshot({path:`/tmp/dugout-motion-${motion}-${width}.png`});
  }
  await page.selectOption('#motion','bat');await page.selectOption('#hand','L');await page.locator('#reset').click();assert.equal(await page.locator('#progress').textContent(),'0%');
  await page.locator('#play').click();await page.waitForTimeout(500);assert.notEqual(await page.locator('#progress').textContent(),'0%');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: mobile and desktop motion selection, scrubbing, camera presets, handedness, playback and layout');
} finally {await browser.close();await new Promise(r=>server.close(r));}
