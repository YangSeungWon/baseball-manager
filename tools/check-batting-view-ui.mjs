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
 await page.locator('#btnBatting').click();await page.locator('.match-enter:not([disabled])').click();
 await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
 await page.locator('.is-reading').waitFor();await page.evaluate(()=>{lv.paused=true;});
 await page.waitForTimeout(100);await page.screenshot({path:`/tmp/batting-read-ball-${width}.png`});
 const view=await page.evaluate(async()=>{
 const T=await import('/vendor/three/three.module.min.js');const {BATTING_ZONE:ZONE}=await import('/js/batting-space.js');const camera=lv.three.camera,rect=lv.three.canvas.getBoundingClientRect();let error=0;
 for(const x of [-1.8,-1,0,1,1.8])for(const z of [-1.8,-1,0,1,1.8]){
 const p=new T.Vector3(x*ZONE.halfWidth,ZONE.center+z*ZONE.halfHeight,0).project(camera);
 const a=lv.three.battingAimAt(rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2);
 if(!a)throw Error('visible plate cannot be aimed');error=Math.max(error,Math.abs(x-a.x),Math.abs(z-a.z));
 }
 const heldAim=lv.S.aim,heldSwing=lv.S.swing;
 for(const swing of [0,.62,1]){lv.S.aim=null;lv.S.swing=swing;lv.three.render(lv.S,lv.o.colors,lv.line,performance.now()/1000);if(!lv.three.battingZone.visible)throw Error('strike zone disappeared without aim or during swing');}
 lv.S.aim=heldAim;lv.S.swing=heldSwing;lv.three.render(lv.S,lv.o.colors,lv.line,performance.now()/1000);
 let projections=0;const project=camera.updateProjectionMatrix;camera.updateProjectionMatrix=function(){projections++;return project.call(this);};
 for(let i=0;i<120;i++)lv.three.direct(lv.S,performance.now()/1000);
 camera.updateProjectionMatrix=project;if(projections!==0)throw Error('fixed camera recalculated projection');
 const model=lv.three.players.get('bat'),eye=camera.position.clone(),rotation=camera.quaternion.clone();
 const zone=Array.from(lv.three.battingZone.geometry.attributes.position.array);
 const originalSwing=lv.S.swing;model.head.rotation.y+=1;lv.S.swing=.62;lv.three.direct(lv.S,performance.now()/1000);camera.updateMatrixWorld(true);
 if(camera.position.distanceTo(eye)>1e-10||camera.quaternion.angleTo(rotation)>1e-7)throw Error('head or swing moved the camera');
 if(JSON.stringify(zone)!==JSON.stringify(Array.from(lv.three.battingZone.geometry.attributes.position.array)))throw Error('swing moved the zone');
 lv.S.swing=originalSwing;
 if(model.head.visible)throw Error('own head blocks first-person view');
 if(!model.bat.visible)throw Error('real bat must remain visible');
 const release=new T.Vector3(-.55,1.85,-16.8).project(camera);
 if(Math.abs(release.x)>.9||Math.abs(release.y)>.9)throw Error('pitch release leaves the frame');
 lv.S.batter.hand='L';lv.three.direct(lv.S,performance.now()/1000);camera.updateMatrixWorld(true);
 const left=new T.Vector3(0,ZONE.center,0).project(camera);
 if(Math.abs(left.x)>.8||Math.abs(left.y)>.8)throw Error('left-handed plate leaves the frame');
 lv.S.batter.hand='R';lv.three.direct(lv.S,performance.now()/1000);camera.updateMatrixWorld(true);
 const p=new T.Vector3(0,ZONE.center,0).project(camera);
 return {plate:{x:(p.x+1)/2,y:(1-p.y)/2},error,aimVisible:lv.three.battingAim.visible,catcherVisible:!!lv.three.players.get('fC')?.root.visible};
 });assert.ok(view.plate.x>.1&&view.plate.x<.9&&view.plate.y>.15&&view.plate.y<.8,'plate stays inside the playable view');assert.ok(view.error<1e-6,'screen aim matches pitch coordinates');assert.equal(view.aimVisible,true);assert.equal(view.catcherVisible,false);
 assert.equal(await page.locator('.inning-picks').isVisible(),false,'preparation panel does not cover the pitch');
 assert.deepEqual(errors,[]);console.log('PASS:',width,height,view);await page.close();}

} finally {await browser.close();await new Promise(r=>server.close(r));}
