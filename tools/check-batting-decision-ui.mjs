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
  for(const [width,height] of [[320,568],[390,844],[844,390],[1440,1000]]) {
    const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);
    await page.evaluate(async()=>{localStorage.setItem('dugout.sfx','0');const {BattingGame}=await import('/js/batting-game.js');const resolve=BattingGame.prototype.decidePitch;window.decisions=[];BattingGame.prototype.decidePitch=function(action){decisions.push(action);return resolve.call(this,action);};});
    await page.locator('#btnBatting').click();
    if(width===1440)await page.locator('.batting-take').click();
    const before=await page.locator('.batting-swing').boundingBox();
    await page.locator('.inning-throw').click();
    await page.locator('.is-deciding .batting-decision').waitFor({state:'visible'});
    if(width<=900){const after=await page.locator('.batting-swing').boundingBox();assert.ok(Math.abs(before.y-after.y)<2&&Math.abs(before.x-after.x)<2,'mobile action buttons stay put');}
    assert.match(await page.locator('.inning-score').textContent(),/0구/);
    assert.equal(await page.locator('.zone-pitch').count(),0,'no landing point before decision');
    assert.deepEqual(await page.evaluate(()=>decisions),[],'no result resolved yet');
    assert.equal(await page.evaluate(()=>document.querySelector('.inning-mode').scrollWidth>innerWidth),false);
    for(const selector of ['.batting-swing','.batting-take']){const b=await page.locator(selector).boundingBox();assert.ok(b.height>=44&&b.x>=0&&b.x+b.width<=width&&b.y+b.height<=height);}
    if(width===320){await page.locator('.batting-swing').click();}
    else if(width===390){await page.locator('.batting-take').click();}
    else if(width===844){await page.locator('.inning-exit').click();await page.waitForTimeout(2700);assert.deepEqual(await page.evaluate(()=>decisions),[]);await page.close();continue;}
    // Desktop exercises timeout: a decision must still be made without input.
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled||!document.querySelector('.inning-result').hidden,{},{timeout:30000});
    assert.deepEqual(await page.evaluate(()=>decisions),[width===320?'swing':'take']);

    assert.equal(await page.locator('.inning-mode').evaluate(e=>e.classList.contains('is-deciding')),false);
    await page.locator('.inning-exit').click();await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: timed swing/take, timeout, no result or location leak, close cancels decision, mobile/landscape/desktop');
} finally {await browser.close();await new Promise(r=>server.close(r));}
