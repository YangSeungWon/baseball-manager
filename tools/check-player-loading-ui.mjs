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
 for(const mode of ['retry','close']){
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(90000);let requests=0,release,seen;const requested=new Promise(r=>seen=r),gate=new Promise(r=>release=r);
  await page.route('**/models/athlete.glb',async route=>{requests++;seen();if(mode==='retry'&&requests===1)await route.fulfill({status:503,body:'test failure'});else if(mode==='close'){await gate;await route.continue();}else await route.continue();});
  await page.goto(url);await page.evaluate(()=>localStorage.setItem('dugout.sfx','0'));await page.locator('#btnBatting').click();await requested;
  assert.equal(await page.locator('.inning-throw').isDisabled(),true);
  if(mode==='retry'){
   await page.getByRole('button',{name:'다시 불러오기'}).click();await page.waitForFunction(()=>document.querySelector('.inning-picks')?.disabled===false);assert.equal(requests,2);assert.equal(await page.locator('.lv-three').count(),1);await page.locator('.inning-exit').click();
  }else{
   await page.locator('.inning-exit').click();release();await page.evaluate(async()=>{await (await import('/js/player-model.js')).loadPlayerModel();});assert.equal(await page.locator('.inning-mode,.lv-three').count(),0);
  }
  await page.close();
 }
 console.log('PASS: GLB failure retries, controls wait for the model, close during download never creates a stale scene');
} finally {await browser.close();await new Promise(r=>server.close(r));}
