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
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];await page.addInitScript(()=>{try{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');}catch{}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await page.evaluate(async()=>{
    localStorage.setItem('dugout.sfx','0');
    const {InningGame}=await import('/js/inning-game.js');InningGame.prototype.random=()=>.99;
  });
  for(const entry of ['#btnInning','#btnBatting']) {
    await page.locator(entry).click();if(entry==='#btnInning'){await page.locator('.is-intro').waitFor();await page.waitForFunction(()=>!document.querySelector('.inning-mode').classList.contains('is-intro'));await page.locator('.inning-plan-toggle').evaluate(e=>e.click());await page.waitForFunction(()=>document.querySelector('.inning-mode').classList.contains('is-planning'));}
    if(entry==='#btnInning'){await page.locator('[data-value="chase"]').click();assert.equal(await page.locator('.inning-zone-slot .zone-command.is-chase').count(),1);}
    else {
      // 코스는 예측하지 않고 조준한다: 선택판이 없고, 존 그림에는 조준점 요소만 준비된다.
      assert.equal(await page.locator('[data-group="location"]').count(),0);
      assert.equal(await page.locator('.inning-zone-map .zone-aim').count(),1);
    }
    await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
    const play=async()=>{if(entry==='#btnBatting')await page.locator('.is-deciding').waitFor({timeout:60000});else {await page.locator('.inning-throw').dispatchEvent('pointerdown',{button:0,pointerId:1});await page.locator('.is-releasing').waitFor();await page.waitForTimeout(900);await page.dispatchEvent('body','pointerup',{pointerId:1});}};
    for(let n=1;n<=3;n++) {
      await play();
      await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
      assert.deepEqual(await page.locator('.inning-zone-map .zone-pitch').evaluateAll(es=>es.map(e=>e.dataset.pitch)),Array.from({length:n},(_,i)=>String(i+1)));
      assert.equal(await page.locator('.inning-live-zone .zone-pitch').count(),n);
    }
    if(entry==='#btnInning'){await page.locator('.inning-plan-toggle').click();await page.locator('.inning-zone-slot').scrollIntoViewIfNeeded();}
    await page.screenshot({path:`/tmp/dugout-zone-${entry.slice(1)}.png`});
    await play();
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
    assert.equal(await page.locator('.inning-zone-map .zone-pitch').count(),0,'walk changes batter and clears previous pitches');
    assert.equal(await page.locator('.inning-live-zone .zone-pitch').count(),0);
    await play();
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
    assert.deepEqual(await page.locator('.inning-zone-map .zone-pitch').evaluateAll(es=>es.map(e=>e.dataset.pitch)),['1']);
    assert.match(await page.locator('.inning-pitch-chip').textContent(),/1구/);
    assert.match(await page.locator('.inning-score').textContent(),/5구/);
    await page.locator('.inning-exit').click();
  }
  assert.deepEqual(errors,[]);console.log('PASS: both roles accumulate pitches, overlapping labels, new batter resets number, total count preserved, batter location selection');
} finally {await browser.close();await new Promise(r=>server.close(r));}
