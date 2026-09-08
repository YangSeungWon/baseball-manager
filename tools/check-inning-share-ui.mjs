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
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/?challenge=b2-42');
  await page.locator('#challengeInvite').waitFor({state:'visible'});
  assert.equal(await page.locator('.manager-entry').getAttribute('open'),null);
  assert.match(await page.title(),/2.5초/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/dugout-pivot-home.png'});
  await page.evaluate(async()=>{
    localStorage.setItem('dugout.sfx','0');
    const {BattingGame}=await import('/js/batting-game.js');let i=0;
    BattingGame.prototype.random=()=>[0,0,0,.9,0,.5,.5,.5,.5,.5][i++%10];
    const prepare=BattingGame.prototype.preparePitch;
    BattingGame.prototype.preparePitch=function(c){window.playedSeed=this.seed;return prepare.call(this,c);};
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shared=data;}});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copied=value;}}});
  });
  await page.locator('#btnBatting').click();
  assert.equal(await page.locator('.batting-swing').getAttribute('aria-pressed'),'true');
  await page.locator('.inning-throw').click();
  await page.waitForFunction(()=>!document.querySelector('.inning-result').hidden,{},{timeout:30000});
  assert.equal(await page.evaluate(()=>playedSeed),42);
  assert.match(await page.locator('.inning-result').textContent(),/끝내기 승리/);
  assert.match(await page.locator('.inning-feedback').textContent(),/홈런/);
  await page.locator('[data-share]').click();
  assert.match(await page.evaluate(()=>shared.url),/challenge=b2-42$/);
  assert.match(await page.evaluate(()=>shared.text),/1구 · 3득점 · 1안타/);
  await page.locator('[data-copy]').click();assert.match(await page.evaluate(()=>copied),/challenge=b2-42$/);
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{value:undefined}));
  await page.locator('[data-share]').click();assert.match(await page.evaluate(()=>copied),/끝내기 성공/);
  const download=page.waitForEvent('download');await page.locator('[data-card]').click();
  await (await download).saveAs('/tmp/dugout-result-card.png');
  await page.locator('[data-share]').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/dugout-result-sharing.png'});
  await page.locator('[data-retry]').click();assert.match(await page.locator('.inning-score').textContent(),/0\/30구/);
  await page.locator('.inning-exit').click();await page.locator('.manager-entry>summary').click();await page.locator('#btnNew').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);console.log('PASS: batting landing, shared challenge seed, default swing, result totals, native share, copy fallback, PNG card, retry, manager entry');
} finally {await browser.close();await new Promise(r=>server.close(r));}
