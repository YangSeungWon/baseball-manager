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
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.evaluate(async()=>{
    localStorage.setItem('dugout.sfx','0');
    const {BattingGame}=await import('/js/batting-game.js');
    const prepare=BattingGame.prototype.preparePitch;
    BattingGame.prototype.preparePitch=function(c){this.strikes=2;this.random=()=>.2;return prepare.call(this,c);};
    const {Live3D}=await import('/js/live3d.js');const direct=Live3D.prototype.direct;
    Live3D.prototype.direct=function(S,t){window.scene3d=this;window.state3d=S;return direct.call(this,S,t);};
  });
  await page.locator('#btnBatting').click();await page.locator('.lv-three').waitFor();await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled);
  const old=await page.evaluate(()=>state3d.batter.name);
  const strikeout=async()=>{await page.locator('.inning-throw').click();await page.locator('.is-deciding').waitFor();await page.locator('.batting-take').click();await page.locator('.is-changing').waitFor();};
  await strikeout();
  assert.equal(await page.evaluate(()=>state3d.changePlayers[0].pose),'dejected');
  await page.waitForFunction(()=>scene3d.cameraKind==='change');
  assert.equal(await page.locator('.inning-throw').isDisabled(),true);
  await page.locator('.inning-batter-entry').waitFor({state:'visible'});
  assert.ok(!(await page.locator('.inning-batter-entry').textContent()).includes(old));
  assert.match(await page.locator('.inning-batter-entry').textContent(),/주력/);
  assert.equal(await page.locator('.inning-live-zone .zone-pitch').count(),0);
  await page.screenshot({path:'/tmp/dugout-batter-entry.png'});
  await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
  await page.waitForFunction(()=>scene3d.cameraKind==='batting');
  assert.notEqual(await page.evaluate(()=>state3d.batter.name),old);
  await strikeout();
  assert.equal(await page.locator('.inning-batter-entry').isVisible(),false,'no next batter after third out');
  await page.locator('.inning-result').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>state3d.changePlayers.length),0);
  await page.locator('[data-retry]').click();await strikeout();await page.locator('.inning-exit').click();
  assert.equal(await page.locator('.inning-mode').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: strikeout walk-off, next batter entry/name, pitch reset, third-out finish, close during transition');
} finally {await browser.close();await new Promise(r=>server.close(r));}
