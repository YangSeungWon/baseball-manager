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
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/?challenge=b7-2-42');
 await page.evaluate(async()=>{
  localStorage.setItem('dugout.sfx','1');
  const {BattingGame}=await import('/js/batting-game.js');let i=0;BattingGame.prototype.random=()=>[0,.99,0,.9,0,.5,.5,.5,.5,.5][i++%10];
  const {Live3D}=await import('/js/live3d.js'),render=Live3D.prototype.render;
  Live3D.prototype.render=function(S,...rest){window.scene3d=this;window.state3d=S;return render.call(this,S,...rest);};
  const {Sfx}=await import('/js/sfx.js'),stadium=Sfx.prototype.stadium;
  Sfx.prototype.stadium=function(...args){window.audioInstance=this;return stadium.apply(this,args);};
 });
 await page.locator('#btnBatting').click();await page.waitForFunction(()=>document.querySelector('.inning-picks')?.disabled===false);
 await page.locator('.is-deciding').waitFor({timeout:60000});
 await page.locator('.is-celebrating').waitFor();
 await page.waitForFunction(()=>state3d.celebrants?.[0]?.phase>2.7);
 assert.equal(await page.locator('.inning-result').isVisible(),false);
 assert.ok(await page.evaluate(()=>scene3d.reducedMotion&&scene3d.players.get('celebrant0').body.position.y===0));
 assert.equal(await page.evaluate(()=>audioInstance.stadiumCue),'cheer');
 await page.screenshot({path:'/tmp/dugout-celebration-reduced.png'});
 await page.locator('.inning-exit').click();
 assert.equal(await page.locator('.inning-mode').count(),0);assert.equal(await page.locator('.lv-three').count(),0);
 assert.ok(await page.evaluate(()=>audioInstance.ctx===null&&audioInstance.chant===null&&audioInstance.stadiumTimer===null));
 assert.deepEqual(errors,[]);console.log('PASS: walk-off walk celebration, reduced motion, cheer channel, exit during celebration cleans scene and audio');
} finally {await browser.close();await new Promise(r=>server.close(r));}
