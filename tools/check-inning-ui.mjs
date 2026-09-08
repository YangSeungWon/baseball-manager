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
    const page=await browser.newPage({viewport:{width,height}});
    await page.addInitScript(()=>{crypto.getRandomValues=a=>{a.fill(4);return a;};});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&/Shader Error|TypeError|ReferenceError/.test(m.text()))errors.push(m.text());});
    await page.goto(url);await page.locator('#btnInning').click();
    await page.locator('.inning-throw').waitFor();
    await page.evaluate(()=>{localStorage.setItem('dugout.save.v1','existing-gm-save');localStorage.setItem('dugout.save.recovery','existing-backup');});
    const save=await page.evaluate(()=>localStorage.getItem('dugout.save.v1'));
    await page.locator('.inning-live .lv-three').waitFor({state:'visible',timeout:20000});
    assert.equal(await page.evaluate(()=>document.querySelector('.inning-mode').scrollWidth>innerWidth),false,'no horizontal overflow');
    for(const button of await page.locator('.inning-picks button').all())assert.ok((await button.boundingBox()).height>=44);
    await page.screenshot({path:`/tmp/dugout-inning-${width}.png`});
    await page.locator('[data-value="SL"]').click();
    await page.locator('[data-value="chase"]').click();
    assert.equal(await page.locator('[data-value="SL"]').getAttribute('aria-pressed'),'true');
    await page.locator('.inning-throw').click();
    assert.equal(await page.locator('.inning-throw').isDisabled(),true);
    const stage=await page.locator('.inning-live .lv-three').boundingBox();
    assert.ok(Math.abs(stage.width-width)<2 && Math.abs(stage.height-height)<2,'3D fills viewport');
    await page.screenshot({path:`/tmp/dugout-immersive-${width}.png`});
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled || !document.querySelector('.inning-result').hidden,{},{timeout:30000});
    assert.match(await page.locator('.inning-score').textContent(),/1\/30구/);
    assert.match(await page.locator('.inning-zone-caption').textContent(),/1구 존 (안|밖)/);
    assert.equal(await page.locator('.inning-zone-map .zone-markers text').textContent(),'1');
    assert.equal(await page.locator('.inning-pitch-chip').count(),1);
    assert.ok((await page.locator('.inning-live .lv-three').boundingBox()).height<height,'returns to selection');
    assert.doesNotMatch(await page.locator('.inning-feedback').textContent(),/준비합니다/);
    await page.locator('.inning-throw').click();
    await page.locator('.inning-exit').click();
    assert.equal(await page.locator('.inning-mode').count(),0);
    assert.equal(await page.locator('#boot').evaluate(e=>e.inert),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('dugout.save.v1')),save);
    await page.locator('#btnInning').click();await page.locator('.inning-throw').waitFor();
    assert.match(await page.locator('.inning-score').textContent(),/0\/30구/);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.inning-mode').count(),0);
    await page.close();
  }
  const replay=await browser.newPage({viewport:{width:390,height:844}});replay.on('pageerror',e=>errors.push(e.message));
  await replay.addInitScript(()=>{crypto.getRandomValues=a=>{a.fill(4);return a;};});
  await replay.goto(url);await replay.locator('#btnInning').click();await replay.locator('.inning-throw').waitFor();
  const run=async()=>{
    await replay.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
    for(let i=0;i<30;i++){
      if(await replay.locator('.inning-result').isVisible())break;
      await replay.locator('.inning-throw').click();
      await replay.waitForFunction(()=>!document.querySelector('.inning-picks').disabled || !document.querySelector('.inning-result').hidden,{},{timeout:30000});
    }
    return replay.locator('.inning-result').textContent();
  };
  const first=await run();assert.match(first,/재도전/);assert.doesNotMatch(first,/다시 시작/);
  await replay.locator('[data-retry]').click();assert.match(await replay.locator('.inning-score').textContent(),/0\/30구/);
  assert.equal(await run(),first,'same seed and choices reproduce outcome');
  await replay.locator('[data-new]').click();assert.match(await replay.locator('.inning-score').textContent(),/0\/30구/);
  await replay.locator('.inning-exit').click();await replay.close();
  assert.deepEqual(errors,[]);console.log('PASS: inning entry, 320/390/desktop, touch targets, one pitch, duplicate lock, close during pitch, reopen, save isolation');
} finally {await browser.close();await new Promise(r=>server.close(r));}
