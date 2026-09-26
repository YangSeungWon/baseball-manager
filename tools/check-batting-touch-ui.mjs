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
 for(const [width,height] of [[390,844],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:true});page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.evaluate(async()=>{const {LiveView}=await import('/js/live.js'),pitch=LiveView.prototype._pitch;LiveView.prototype._pitch=function(...args){if(args[1].flightSeconds!=null&&args[1].r==='B')this.paused=true;return pitch.apply(this,args);};});
  await page.locator('#btnBatting').click();await page.locator('.match-enter:not([disabled])').waitFor();
  assert.equal(await page.locator('.batting-help-touch').isVisible(),true);assert.equal(await page.locator('.batting-help-mouse').isVisible(),false);
  await page.locator('.match-enter').click();await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});await page.locator('.is-reading').waitFor();
  await page.evaluate(()=>{const c=document.querySelector('.inning-live canvas'),r=c.getBoundingClientRect();
   window.touch=(type,y,id=7)=>c.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:'touch',button:0,clientX:r.left+r.width/2,clientY:y}));
   touch('pointerdown',innerHeight*.55);});
  // 스윙 패드는 손을 대기 전부터 보인다. 위쪽을 짚는 것은 조준일 뿐이다.
  assert.equal(await page.locator('.batting-pointer').isVisible(),true);assert.equal(await page.locator('.batting-cancel-area').isVisible(),true);
  const ring=await page.locator('.batting-pointer').boundingBox();assert.ok(Math.abs(ring.y+ring.height/2-(height*.55-64))<1);
  await page.screenshot({path:`/tmp/batting-touch-aim-${width}.png`});
  // 두 번째 손가락을 패드에 대면 준비, 패드 밖으로 밀어 올리면 참기 표시로 바뀐다.
  await page.evaluate(()=>touch('pointerdown',innerHeight-10,8));
  assert.equal(await page.locator('.batting-cancel-area').textContent(),'여기서 떼면 스윙');
  await page.evaluate(()=>touch('pointermove',innerHeight*.5,8));
  assert.equal(await page.locator('.batting-cancel-area').textContent(),'놓으면 참기');assert.equal(await page.locator('.batting-pointer.is-cancel').count(),1);
  await page.screenshot({path:`/tmp/batting-touch-cancel-${width}.png`});
  await page.evaluate(()=>{touch('pointerup',innerHeight*.5,8);touch('pointerup',innerHeight*.55);});
  assert.equal(await page.locator('.batting-pointer').isVisible(),false);
  await page.locator('.inning-exit').click();assert.deepEqual(errors,[]);await page.close();console.log(`PASS: ${width}×${height} touch aim and cancel UI`);
 }
} finally {await browser.close();await new Promise(r=>server.close(r));}
