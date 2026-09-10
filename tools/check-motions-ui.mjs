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
  for(const motion of ['pitch','bat','field','catch','dive','crouch','walk','run']){
   await page.selectOption('#motion',motion);
   await page.locator('#scrub').fill('450');
   assert.equal(await page.locator('#play').textContent(),'재생');
   assert.equal(await page.locator('#progress').textContent(),'45%');
   await page.locator('[data-angle="1.570796"]').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(['pitch','bat','walk','catch'].includes(motion))await page.screenshot({path:`/tmp/dugout-motion-${motion}-${width}.png`});
  }
  await page.selectOption('#motion','bat');await page.selectOption('#hand','L');await page.locator('#reset').click();assert.equal(await page.locator('#progress').textContent(),'0%');
  await page.locator('#play').click();await page.waitForTimeout(500);assert.notEqual(await page.locator('#progress').textContent(),'0%');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: mobile and desktop motion selection, scrubbing, camera presets, handedness, playback and layout');
} finally {await browser.close();await new Promise(r=>server.close(r));}
