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
 const view=lv.three,camera=view.camera,rect=view.canvas.getBoundingClientRect();
 const screen=p=>{const q=p.clone().project(camera);return {x:(q.x+1)/2,y:(1-q.y)/2};};
 let error=0,squareError=0;
 const originalHand=lv.S.batter.hand,heldAim=lv.S.aim;
 for(const hand of ['R','L']){
  lv.S.batter.hand=hand;lv.S.swing=0;view.render(lv.S,lv.o.colors,lv.line,performance.now()/1000);camera.updateMatrixWorld(true);
  // 포수 뒤 고정 시점: 좌우타가 달라도 같은 자리에서 존을 정면으로 본다.
  if(camera.position.x!==0)throw Error('batting camera left the center line');
  view.battingZone.updateMatrixWorld(true);
  const eye=camera.position.clone(),rotation=camera.quaternion.clone(),zone=view.battingZone.matrixWorld.toArray().join();
  for(const swing of [.25,.62,1]){
   lv.S.aim=null;lv.S.swing=swing;view.render(lv.S,lv.o.colors,lv.line,performance.now()/1000);
   if(camera.position.distanceTo(eye)>1e-8||camera.quaternion.angleTo(rotation)>1e-7)throw Error('swing moved the camera');
   view.battingZone.updateMatrixWorld(true);
   if(!view.battingZone.visible||view.battingZone.matrixWorld.toArray().join()!==zone)throw Error('swing moved or hid the zone');
  }
  lv.S.swing=0;view.render(lv.S,lv.o.colors,lv.line,performance.now()/1000);camera.updateMatrixWorld(true);
  // 존과 투수 릴리스가 한 화면에 함께 들어온다. 존은 아래쪽, 릴리스는 위쪽이다.
  const corners=[[-1,ZONE.bottom],[1,ZONE.bottom],[1,ZONE.top],[-1,ZONE.top]].map(([sx,y])=>screen(new T.Vector3(sx*ZONE.halfWidth,y,0)));
  for(const c of corners)if(c.x<=0||c.x>=1||c.y<=0||c.y>=1)throw Error('the strike zone leaves the frame');
  const release=screen(new T.Vector3(-.55,1.85,-16.8));
  if(Math.abs(release.x-.5)>.45||release.y<=0||release.y>=1)throw Error('pitch release leaves the frame');
  if(release.y>=Math.min(...corners.map(c=>c.y)))throw Error('release is not above the zone');
  // 정면이라 가로 변은 화면과 수평하고 세로 변은 화면 중앙을 기준으로 대칭이다.
  // 시선이 살짝 아래를 보므로 윗변이 아랫변보다 좁은 원근만 남는다.
  squareError=Math.max(squareError,Math.abs(corners[0].y-corners[1].y),Math.abs(corners[2].y-corners[3].y),
   Math.abs((corners[0].x+corners[1].x)/2-.5),Math.abs((corners[2].x+corners[3].x)/2-.5));
  // 화면에서 본 자리가 그대로 조준점이다.
  for(const x of [-1.8,-1,0,1,1.8])for(const z of [-1.8,-1,0,1,1.8]){
   const p=screen(new T.Vector3(x*ZONE.halfWidth,ZONE.center+z*ZONE.halfHeight,0));
   const a=view.battingAimAt(rect.left+p.x*rect.width,rect.top+p.y*rect.height);
   if(!a)throw Error('cannot aim at the zone');error=Math.max(error,Math.abs(x-a.x),Math.abs(z-a.z));
  }
 }
 lv.S.batter.hand=originalHand;lv.S.aim=heldAim;lv.S.swing=0;view.render(lv.S,lv.o.colors,lv.line,performance.now()/1000);
 let projections=0;const project=camera.updateProjectionMatrix;camera.updateProjectionMatrix=function(){projections++;return project.call(this);};
 for(let i=0;i<120;i++)view.direct(lv.S,performance.now()/1000);
 camera.updateProjectionMatrix=project;if(projections!==0)throw Error('fixed camera recalculated projection');
 return {eye:camera.position.toArray(),error,squareError,aimVisible:view.battingAim.visible,
  zoneWhite:view.battingZoneBorder.color.getHexString(),
  // 테두리는 1px 선이 아니라 두께가 있는 면이라 배경이 바뀌어도 같은 굵기로 읽힌다.
  zoneBorderPx:(()=>{const bar=view.battingZone.children.find(o=>o.material===view.battingZoneBorder);
    const box=new T.Box3().setFromObject(bar);return +((box.max.y-box.min.y)*1000).toFixed(1);})(),
  catcherVisible:!!view.players.get('fC')?.root.visible,umpireVisible:!!view.players.get('ump')?.root.visible,
  batterVisible:!!view.players.get('bat')?.root.visible};
 });
 assert.ok(view.error<1e-6,'aim matches the pitch coordinates on screen');
 assert.ok(view.squareError<1e-6,'the zone is square to the screen');
 assert.equal(view.zoneWhite,'ffffff','the zone is the white broadcast box');
 assert.ok(view.zoneBorderPx>=10,`the border has real thickness (${view.zoneBorderPx} mm)`);
 assert.equal(view.aimVisible,true);
 assert.equal(view.catcherVisible,false,'the catcher does not stand in front of the zone');
 assert.equal(view.umpireVisible,false,'the umpire does not stand in front of the zone');
 assert.equal(view.batterVisible,true,'the hitter is a whole body again');
  assert.equal(await page.locator('.inning-picks').isVisible(),false,'preparation panel does not cover the pitch');
 assert.deepEqual(errors,[]);console.log('PASS:',width,height,view);await page.close();}

} finally {await browser.close();await new Promise(r=>server.close(r));}
