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
 for(const [width,height] of [[390,844],[1440,1000]]){const page=await browser.newPage({viewport:{width,height}});page.setDefaultTimeout(60000);
 await page.addInitScript(()=>localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}'));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await page.evaluate(async()=>{const {LiveView}=await import('/js/live.js');const pitch=LiveView.prototype._pitch;LiveView.prototype._pitch=function(...args){window.lv=this;if(args[1].flightSeconds!=null&&args[1].r==='B')this.paused=true;return pitch.apply(this,args);};});
 let releaseEntry;const entryGate=new Promise(resolve=>releaseEntry=resolve);
 await page.route('**/js/inning-mode.js',async route=>{await entryGate;await route.continue();});
 await page.locator('#btnBatting').click();
 assert.equal(await page.locator('#btnBatting').getAttribute('aria-busy'),'true','entry reacts while module is still loading');
 assert.equal(await page.locator('#btnBatting').isDisabled(),true,'duplicate entry blocked');
 releaseEntry();await page.locator('.match-enter:not([disabled])').click();
 assert.equal(await page.locator('.inning-mode.is-intro').count(),0,'batting starts without the entry cinematic');
 assert.equal(await page.locator('.inning-look').count(),0,'no plate-look button');
 await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
 await page.locator('.is-reading').waitFor();await page.evaluate(()=>{lv.paused=true;});
 await page.waitForTimeout(100);await page.screenshot({path:`/tmp/batting-read-ball-${width}.png`});
 const view=await page.evaluate(async()=>{
 const T=await import('/vendor/three/three.module.min.js');const {BATTING_ZONE:ZONE}=await import('/js/batting-space.js');
 const view=lv.three,camera=view.camera,model=view.players.get('bat'),rect=view.canvas.getBoundingClientRect();
 const midpoint=()=>{const out=new T.Vector3();for(const eye of model.faceNodes.eyes){eye.geometry.computeBoundingBox();const center=eye.geometry.boundingBox.getCenter(new T.Vector3()),rest=eye.userData.rest;out.add(eye.parent.localToWorld(center.multiply(rest.scale).applyEuler(rest.rotation).add(rest.position)));}return out.multiplyScalar(.5);};
 let eyeError=camera.position.distanceTo(midpoint()),error=0;
 if(eyeError>1e-8)throw Error('camera is not at the actual prepared eye midpoint');
 const centerAim=view.battingAimAt(rect.left+rect.width/2,rect.top+rect.height/2);
 if(centerAim.x!==0||centerAim.z!==0)throw Error('forward view cannot aim at center');
 const outsideAim=view.battingAimAt(rect.left+rect.width*.95,rect.top+rect.height*.05);
 if(outsideAim.x<1.7||outsideAim.z<1.7)throw Error('forward view cannot aim outside zone');
 const originalHand=lv.S.batter.hand,heldAim=lv.S.aim;
 for(const hand of ['R','L']){
  lv.S.batter.hand=hand;lv.S.swing=0;view.render(lv.S,lv.o.colors,lv.line,performance.now()/1000);
  eyeError=Math.max(eyeError,camera.position.distanceTo(midpoint()));
  const eye=camera.position.clone(),rotation=camera.quaternion.clone(),zone=Array.from(view.battingZone.geometry.attributes.position.array);
  for(const swing of [.25,.62,1]){
   lv.S.aim=null;lv.S.swing=swing;view.render(lv.S,lv.o.colors,lv.line,performance.now()/1000);
   if(camera.position.distanceTo(eye)>1e-8||camera.quaternion.angleTo(rotation)>1e-7)throw Error('swing moved the camera');
   if(!view.battingZone.visible||JSON.stringify(zone)!==JSON.stringify(Array.from(view.battingZone.geometry.attributes.position.array)))throw Error('swing moved or hid the zone');
  }
  lv.S.swing=0;view.render(lv.S,lv.o.colors,lv.line,performance.now()/1000);
  const release=new T.Vector3(-.55,1.85,-16.8).project(camera);
  if(Math.abs(release.x)>.9||Math.abs(release.y)>.9)throw Error('pitch release leaves the frame');
  // Home need not fit in the forward eye view. The explicit glance must look at it.
  const canLook=view.opts.canLook;view.opts.canLook=()=>true;view.lookAtPlate();view.direct(lv.S,performance.now()/1000);camera.updateMatrixWorld(true);
  const home=new T.Vector3(0,ZONE.center,0).project(camera);
  if(Math.abs(home.x)>1e-6||Math.abs(home.y)>1e-6)throw Error('home glance does not face home');
  if(camera.position.distanceTo(eye)>1e-8)throw Error('home glance translated the eye');
  for(const x of [-1.8,-1,0,1,1.8])for(const z of [-1.8,-1,0,1,1.8]){
   const p=new T.Vector3(x*ZONE.halfWidth,ZONE.center+z*ZONE.halfHeight,0).project(camera);
   const a=view.battingAimAt(rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2);
   if(!a)throw Error('home glance cannot aim');error=Math.max(error,Math.abs(x-a.x),Math.abs(z-a.z));
  }
  view.lookAtPlate();view.opts.canLook=canLook;view.direct(lv.S,performance.now()/1000);camera.updateMatrixWorld(true);
 }
 lv.S.batter.hand=originalHand;lv.S.aim=heldAim;lv.S.swing=0;view.render(lv.S,lv.o.colors,lv.line,performance.now()/1000);
 let projections=0;const project=camera.updateProjectionMatrix;camera.updateProjectionMatrix=function(){projections++;return project.call(this);};
 for(let i=0;i<120;i++)view.direct(lv.S,performance.now()/1000);
 camera.updateProjectionMatrix=project;if(projections!==0)throw Error('fixed camera recalculated projection');
 return {eye:camera.position.toArray(),eyeError,error,aimVisible:view.battingAim.visible,catcherVisible:!!view.players.get('fC')?.root.visible,umpireVisible:!!view.players.get('ump')?.root.visible};
 });assert.ok(view.eyeError<1e-8,'camera matches actual eyes for both handed stances');assert.ok(view.error<1e-6,'home glance aim matches pitch coordinates');assert.equal(view.aimVisible,true);assert.equal(view.catcherVisible,true);assert.equal(view.umpireVisible,true);
 assert.equal(await page.locator('.inning-picks').isVisible(),false,'preparation panel does not cover the pitch');
 assert.deepEqual(errors,[]);console.log('PASS:',width,height,view);await page.close();}

} finally {await browser.close();await new Promise(r=>server.close(r));}
