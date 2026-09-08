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
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await page.evaluate(async()=>{
    localStorage.setItem('dugout.sfx','0');
    const {InningGame}=await import('/js/inning-game.js');InningGame.prototype.random=()=>.99;
  });
  for(const entry of ['#btnInning','#btnBatting']) {
    await page.locator(entry).click();
    if(entry==='#btnInning')await page.locator('[data-value="chase"]').click();
    else {
      await page.locator('[data-group="location"] [data-value="low"]').click();
      assert.equal(await page.locator('.inning-zone-map .zone-prediction').count(),1);
      assert.match(await page.locator('.inning-choice-note').textContent(),/낮은 공 예상/);
    }
    await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
    const action=entry==='#btnBatting'?'.inning-take':'.inning-throw';
    for(let n=1;n<=3;n++) {
      await page.locator(action).click();
      await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
      assert.deepEqual(await page.locator('.inning-zone-map .zone-pitch').evaluateAll(es=>es.map(e=>e.dataset.pitch)),Array.from({length:n},(_,i)=>String(i+1)));
      assert.equal(await page.locator('.inning-live-zone .zone-pitch').count(),n);
    }
    await page.locator('.inning-zone-slot').scrollIntoViewIfNeeded();
    await page.screenshot({path:`/tmp/dugout-zone-${entry.slice(1)}.png`});
    await page.locator(action).click();
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
    assert.equal(await page.locator('.inning-zone-map .zone-pitch').count(),0,'walk changes batter and clears previous pitches');
    assert.match(await page.locator('.inning-zone-caption').textContent(),/1구부터/);
    await page.locator(action).click();
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
    assert.deepEqual(await page.locator('.inning-zone-map .zone-pitch').evaluateAll(es=>es.map(e=>e.dataset.pitch)),['1']);
    assert.match(await page.locator('.inning-pitch-chip').textContent(),/1구/);
    assert.match(await page.locator('.inning-score').textContent(),/5\/30구/);
    await page.locator('.inning-exit').click();
  }
  assert.deepEqual(errors,[]);console.log('PASS: both roles accumulate pitches, overlapping labels, new batter resets number, total count preserved, batter location selection');
} finally {await browser.close();await new Promise(r=>server.close(r));}
