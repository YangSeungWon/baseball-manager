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
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
 await page.evaluate(async()=>{
  localStorage.setItem('dugout.sfx','0');window.hit=false;
  const {BattingGame}=await import('/js/batting-game.js');const resolve=BattingGame.prototype.resolvePitch;
  BattingGame.prototype.resolvePitch=function(c){return resolve.call(this,c,[0,.1,.1,.5,window.hit?.1:.99,.5,.5,.5,.99,.99]);};
  const {Live3D}=await import('/js/live3d.js');const direct=Live3D.prototype.direct;Live3D.prototype.direct=function(S,t){window.state3d=S;window.scene3d=this;return direct.call(this,S,t);};
 });
 await page.locator('#btnBatting').click();await page.locator('.is-intro').waitFor();
 assert.equal(await page.locator('.inning-throw').isDisabled(),true);
 await page.waitForFunction(()=>window.state3d?.broadcast.kind==='entry');
 assert.equal(await page.evaluate(()=>state3d.batter),null);
 await page.waitForFunction(()=>state3d.broadcast.kind==='change');
 assert.match(await page.locator('.inning-batter-entry').textContent(),/타석 입장/);
 await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled);
 const swing=async()=>{await page.locator('.inning-throw').click();await page.locator('.is-deciding').waitFor();await page.locator('.batting-swing').click();};
 await swing();await page.waitForFunction(()=>state3d.fieldPlay?.phase==='caught',{},{timeout:20000});
 assert.ok(await page.evaluate(()=>state3d.hold?.pos));
 await page.waitForFunction(()=>scene3d.cameraKind==='catch');
 await page.screenshot({path:'/tmp/dugout-field-catch.png'});
 await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
 await page.evaluate(()=>window.hit=true);await swing();
 await page.waitForFunction(()=>state3d.fieldPlay?.phase==='bounce',{},{timeout:20000});
 assert.equal(await page.evaluate(()=>state3d.hold),null);
 assert.ok(await page.evaluate(()=>state3d.ball?.vis));
 await page.screenshot({path:'/tmp/dugout-field-hit.png'});
 await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
 await page.locator('.inning-exit').click();await page.locator('#btnInning').click();await page.locator('.is-intro').waitFor();await page.locator('.inning-exit').click();
 assert.equal(await page.locator('.inning-mode').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: pitcher and batter intro, input lock, visible catch/hold, hit bounce/chase, close during intro');
} finally {await browser.close();await new Promise(r=>server.close(r));}
