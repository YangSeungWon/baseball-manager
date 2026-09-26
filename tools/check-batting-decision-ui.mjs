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
 for(const [width,height] of [[390,844],[1440,1000]]){
  const page=await browser.newPage({viewport:{width,height}});page.setDefaultTimeout(60000);
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.evaluate(async()=>{
   const {BattingGame}=await import('/js/batting-game.js'),decide=BattingGame.prototype.decidePitch;
   window.decisions=[];BattingGame.prototype.decidePitch=function(...args){decisions.push(args[0]);return decide.apply(this,args);};
  });
  await page.locator('#btnBatting').click();await page.locator('.match-enter:not([disabled])').waitFor();
  await page.evaluate(()=>{
   const root=document.querySelector('.inning-mode');let pausedOnce=false,played=false;
   window.inputCheck=null;
   const observer=new MutationObserver(()=>{
    const canvas=root.querySelector('canvas');
    if(!pausedOnce&&!root.classList.contains('is-intro')){
     pausedOnce=true;document.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true}));
     window.pauseCheck=root.classList.contains('is-timeout');
     // Synthetic DOM events have no browser-owned pointer to capture.
     const capture=canvas.setPointerCapture;canvas.setPointerCapture=()=>{};
     canvas.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,pointerType:'touch'}));
     canvas.setPointerCapture=capture;
     window.resumeCheck=!root.classList.contains('is-timeout');
    }
    if(played||!root.classList.contains('is-deciding'))return;
    played=true;observer.disconnect();
    inputCheck={noButtons:!root.querySelector('.batting-decision,.batting-hold,.inning-time'),noResult:decisions.length===0,noLanding:!root.querySelector('.zone-pitch')};
    // 터치는 아래 스윙 패드를 눌렀다 떼야 스윙이다. 화면 가운데를 짚는 것은 조준일 뿐이다.
    if(innerWidth<900){const r=canvas.getBoundingClientRect(),pad=r.bottom-30;
     const send=(type,y)=>canvas.dispatchEvent(new PointerEvent(type,{button:0,bubbles:true,pointerType:'touch',pointerId:9,clientX:r.left+r.width/2,clientY:y}));
     send('pointerdown',pad);send('pointerup',pad);}
   });observer.observe(root,{attributes:true,attributeFilter:['class']});
  });
  await page.locator('.match-enter:not([disabled])').click();
  await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
  await page.waitForFunction(()=>decisions.length>0);
  assert.deepEqual(await page.evaluate(()=>inputCheck),{noButtons:true,noResult:true,noLanding:true});
  assert.equal(await page.evaluate(()=>pauseCheck&&resumeCheck),true,'T pauses and touching the field resumes without a button');
  assert.deepEqual(await page.evaluate(()=>decisions),[width<900?'swing':'take']);
  await page.locator('.inning-exit').click();await page.close();console.log(`PASS: ${width}×${height} direct touch/take and pause/resume`);
 }
 assert.deepEqual(errors,[]);
} finally {await browser.close();await new Promise(r=>server.close(r));}
