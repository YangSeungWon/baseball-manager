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
 for(const [width,height] of [[320,568],[390,844],[844,390],[1440,1000]]){
  const page=await browser.newPage({viewport:{width,height}});await page.goto(url);
  const result=await page.evaluate(async()=>{
   const {positionPlayerTag}=await import('/js/pitcher-tag.js');
   const stage=document.createElement('section');stage.className='inning-mode has-batting-dock';
   stage.innerHTML='<div class="inning-presentation"><button class="inning-opponent pitcher-tag"><b>서도현</b><span>직구 46%</span></button><div class="inning-batter-entry"><b>박시우</b><span>선구형 · 주력 보통</span></div></div>';document.body.append(stage);
   const failures=[];
   for(const tag of stage.querySelectorAll('.pitcher-tag,.inning-batter-entry')){
    let first;
    for(const x of [.5,.8,.95,.99,.7,.1,.01,.5]){
     positionPlayerTag(tag,{x,y:.5});
     const r=tag.getBoundingClientRect(),children=[...tag.children].map(c=>{const b=c.getBoundingClientRect();return [b.x-r.x,b.y-r.y,b.width,b.height];});
     const shape=JSON.stringify([r.width,r.height,children]);first??=shape;
     if(shape!==first)failures.push('label resized or text moved at '+x);
     if(r.left<7||r.right>innerWidth-7)failures.push('label outside viewport');
    }
   }
   stage.remove();return failures;
  });
  assert.deepEqual(result,[],`${width}x${height}`);await page.close();
 }
 console.log('PASS: player labels keep their width, height and text layout across the viewport on mobile, landscape and desktop');
} finally {await browser.close();await new Promise(r=>server.close(r));}
