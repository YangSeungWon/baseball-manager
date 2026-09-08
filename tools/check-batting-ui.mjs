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
  for(const [width,height] of [[390,844],[320,568],[1440,1000]]) {
    const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.locator('#btnBatting').click();await page.locator('.inning-throw').waitFor();
    await page.evaluate(()=>localStorage.setItem('dugout.save.v1','existing-save'));
    await page.locator('.lv-three').waitFor({state:'visible',timeout:20000});
    assert.equal(await page.locator('.batting-swing').isVisible(),true);
    assert.match(await page.locator('.inning-score').textContent(),/0 : 2/);
    assert.equal(await page.locator('[data-group="zone"]').count(),0);
    for(const b of await page.locator('.inning-picks button').all())assert.ok((await b.boundingBox()).height>=44);
    assert.equal(await page.evaluate(()=>document.querySelector('.inning-mode').scrollWidth>innerWidth),false);
    await page.screenshot({path:`/tmp/dugout-batting-${width}.png`});
    await page.locator('.inning-throw').click();await page.locator('.batting-take').click();assert.equal(await page.locator('.inning-throw').isDisabled(),true);
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
    assert.match(await page.locator('.inning-feedback').textContent(),/km\/h/);
    assert.match(await page.locator('.inning-score').textContent(),/1\/30구/);
    await page.locator('[data-value="FF"]').click();await page.locator('[data-value="power"]').click();
    await page.locator('.inning-throw').click();await page.locator('.inning-exit').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('dugout.save.v1')),'existing-save');
    await page.locator('#btnInning').click();await page.locator('.inning-plan-toggle').click();await page.locator('[data-group="zone"]').waitFor();
    assert.equal(await page.locator('.pitching-action').isVisible(),true);
    await page.keyboard.press('Escape');await page.close();
  }
  const p=await browser.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{crypto.getRandomValues=a=>{a.fill(7);return a;};});
  await p.goto(url);await p.locator('#btnBatting').click();await p.locator('.inning-throw').waitFor();
  const run=async()=>{
    await p.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
    for(let i=0;i<30;i++){
      if(await p.locator('.inning-result').isVisible())break;
      await p.locator('.inning-throw').click();await p.locator('.batting-take').click();await p.waitForFunction(()=>!document.querySelector('.inning-picks').disabled||!document.querySelector('.inning-result').hidden,{},{timeout:30000});
    }
    return p.locator('.inning-result').textContent();
  };
  const first=await run();assert.match(first,/재도전/);
  await p.locator('[data-retry]').click();assert.equal(await run(),first);
  await p.locator('[data-new]').click();assert.match(await p.locator('.inning-score').textContent(),/0\/30구/);
  await p.locator('.inning-exit').click();await p.close();
  assert.deepEqual(errors,[]);console.log('PASS: batting mobile/desktop, take and swing, pitch reveal, completion/retry, save isolation, return to pitcher mode');
} finally {await browser.close();await new Promise(r=>server.close(r));}
