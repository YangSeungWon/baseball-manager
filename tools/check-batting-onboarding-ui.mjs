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
  const page=await browser.newPage({viewport:{width,height}});page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url+'/?coach');
  await page.evaluate(async()=>{
   const {BattingGame}=await import('/js/batting-game.js');const decide=BattingGame.prototype.decidePitch;
   window.decisions=[];BattingGame.prototype.decidePitch=function(...args){decisions.push(args[0]);return decide.apply(this,args);};
  });
  await page.locator('#btnBatting').click();
  await page.locator('.match-enter:not([disabled])').waitFor();
  assert.match(await page.locator('.match-batting-help').textContent(),/조준.*스윙.*취소 영역/s);
  assert.equal(await page.locator('[data-group="target"],.inning-compact-plan,.inning-plan-toggle,.batting-decision,.batting-hold,.inning-time').count(),0);
  await page.locator('.match-enter').scrollIntoViewIfNeeded();
  const bounds=await page.locator('.match-enter').boundingBox();
  assert.ok(bounds.height>=44&&bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=height);
  await page.screenshot({path:`/tmp/batting-onboarding-${width}.png`});
  await page.evaluate(()=>{
   const root=document.querySelector('.inning-mode');window.firstPitch=null;
   const observer=new MutationObserver(()=>{
    if(!root.classList.contains('is-deciding'))return;
    observer.disconnect();
    firstPitch={coachVisible:!!root.querySelector('.coach-tip:not([hidden])'),helpVisible:!!root.querySelector('.match-batting-help')};
    // React within the real pitch window, without test-driver network round trips.
    const canvas=root.querySelector('canvas'),r=canvas.getBoundingClientRect(),e={button:0,bubbles:true,pointerId:1,pointerType:innerWidth<900?'touch':'mouse',clientX:r.left+r.width/2,clientY:r.top+r.height/2};
    document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));if(decisions.length)throw Error('Space must not swing');
    canvas.dispatchEvent(new PointerEvent('pointerdown',e));
    if(e.pointerType==='touch'&&decisions.length)throw Error('touchdown must not swing');
    canvas.dispatchEvent(new PointerEvent('pointerup',e));
   });observer.observe(root,{attributes:true,attributeFilter:['class']});
  });
  await page.locator('.match-enter').click();
  await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
  await page.waitForFunction(()=>decisions.length>0);
  assert.deepEqual(await page.evaluate(()=>firstPitch),{coachVisible:false,helpVisible:false});
  assert.equal(await page.evaluate(()=>decisions[0]),'swing');
  assert.equal(await page.locator('.coach-tip:not([hidden])').count(),0);
  await page.locator('.inning-exit').click();await page.close();console.log(`PASS: ${width}×${height} pregame controls and uninterrupted first swing`);
 }
 assert.deepEqual(errors,[]);
} finally {await browser.close();await new Promise(r=>server.close(r));}
