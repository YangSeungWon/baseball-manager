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
 const errors=[];
 for(const [width,height] of [[320,568],[844,390],[1440,1000]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.evaluate(async()=>{
   localStorage.setItem('dugout.sfx','0');const {InningGame}=await import('/js/inning-game.js');
   const pitch=InningGame.prototype.pitch;window.pitches=[];
   InningGame.prototype.pitch=function(c){this.random=()=>.99;const e=pitch.call(this,c);pitches.push(e);return e;};
  });
  await page.locator('#btnInning').click();await page.locator('.lv-three').waitFor();
  await page.locator('.pitch-breathe').click();assert.equal(await page.locator('.inning-throw').isDisabled(),true);
  await page.waitForFunction(()=>document.querySelector('.pitch-breathe').textContent==='호흡 안정');
  assert.equal(await page.locator('.pitch-breathe').isDisabled(),true);
  await page.locator('.inning-throw').click();await page.locator('.is-releasing').waitFor();
  assert.equal(await page.evaluate(()=>pitches.length),0,'no result before release');
  assert.match(await page.locator('.pitch-release').textContent(),/안정/);
  await page.evaluate(()=>{window.seenRelease=parseFloat(document.querySelector('.pitch-needle').style.left)/50-1;document.querySelector('.inning-throw').click();});
  await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
  assert.equal(await page.evaluate(()=>pitches.length),1,'single manual release');
  assert.ok(await page.evaluate(()=>pitches[0].control.release<0),'early click recorded');
  assert.ok(await page.evaluate(()=>Math.abs(pitches[0].control.release-seenRelease)<1e-10),'release matches the visible frame');
  assert.match(await page.locator('.inning-feedback').textContent(),/빠른 릴리스/);
  assert.equal(await page.locator('.inning-live-zone .zone-release-error').count(),1);
  assert.equal(await page.locator('.pitch-breathe').isDisabled(),false);
  await page.screenshot({path:`/tmp/dugout-release-result-${width}.png`});
  await page.locator('.inning-throw').click();await page.locator('.is-releasing').waitFor();
  for(const selector of ['.inning-throw','.pitch-breathe']){const b=await page.locator(selector).boundingBox();assert.ok(b.height>=44&&b.y+b.height<=height&&b.x>=0&&b.x+b.width<=width);}
  await page.screenshot({path:`/tmp/dugout-release-meter-${width}.png`});
  await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
  assert.equal(await page.evaluate(()=>pitches[1].control.release),1,'timeout is a visible late release');
  assert.equal(await page.evaluate(()=>pitches[1].call),'B');
  await page.locator('.inning-throw').click();await page.locator('.is-releasing').waitFor();await page.locator('.inning-exit').click();
  await page.waitForTimeout(2000);assert.equal(await page.evaluate(()=>pitches.length),2,'closing cancels pending release');
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: breath lock, manual release, late timeout, target error, close cancellation, mobile/landscape/desktop');
} finally {await browser.close();await new Promise(r=>server.close(r));}
