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
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/?challenge=b6-0-42');
 await page.evaluate(async()=>{
  localStorage.setItem('dugout.sfx','0');window.hrFlashes=[];
  const {BattingGame}=await import('/js/batting-game.js');const resolve=BattingGame.prototype.resolvePitch;
  BattingGame.prototype.resolvePitch=function(c){const e=resolve.call(this,c,[0,0,0,.9,0,.5,.5,.5,.5,.5]);window.result=e;return e;};
  const {LiveView}=await import('/js/live.js');const flash=LiveView.prototype._flash;
  LiveView.prototype._flash=function(text,...rest){if(text==='홈런')window.hrFlashes.push({time:this.S.fieldPlay?.time,runners:this.S.runners.length});return flash.call(this,text,...rest);};
  const {Live3D}=await import('/js/live3d.js');const render=Live3D.prototype.render;
  Live3D.prototype.render=function(S,...rest){window.state3d=S;const value=render.call(this,S,...rest);
   if(S.looseBat){window.batFlipSeen=true;window.batVisible=this.looseBat.visible;}
   if(S.broadcast?.kind==='bat-flip')window.batCameraSeen=true;
   if(S.celebrants?.length){window.celebrationSeen=true;window.celebrationPlayers=S.celebrants.length;window.earlyResult=!document.querySelector('.inning-result').hidden;}
   return value;};
 });
 await page.locator('#btnBatting').click();await page.locator('.inning-throw').click();
 await page.locator('.is-deciding').waitFor();assert.equal(await page.locator('.inning-controls').isVisible(),false);
 await page.locator('.batting-swing').click();
 await page.waitForFunction(()=>state3d.fieldPlay?.time>.3);
 assert.equal(await page.evaluate(()=>hrFlashes.length),0,'no premature home run announcement');
 await page.waitForFunction(()=>hrFlashes.length===1,{},{timeout:30000});
 const hr=await page.evaluate(()=>({flash:hrFlashes[0],event:result.fieldPlay.events.find(e=>e.type==='home-run'),duration:result.fieldPlay.duration,poses:Object.values(state3d.fielders).map(f=>f.pose),done:document.querySelector('.inning-result').hidden}));
 assert.ok(hr.flash.time>=hr.event.t&&hr.flash.time<hr.event.t+.3);
 assert.ok(hr.flash.time<hr.duration-1);assert.ok(hr.flash.runners>0);assert.ok(hr.done);assert.ok(hr.poses.every(p=>p==='watch'));
 assert.equal(await page.locator('.inning-feedback').textContent(),'홈런');
 await page.screenshot({path:'/tmp/dugout-home-run-crossing.png'});
 await page.locator('.is-celebrating').waitFor();
 await page.waitForFunction(()=>state3d.celebrants?.length===6);
 assert.equal(await page.locator('.inning-result').isVisible(),false);
 assert.equal(await page.locator('.inning-controls').isVisible(),false);
 await page.screenshot({path:'/tmp/dugout-celebration.png'});
 await page.waitForFunction(()=>!document.querySelector('.inning-result').hidden,{},{timeout:60000});
 assert.deepEqual(await page.evaluate(()=>[batFlipSeen,batVisible,batCameraSeen,celebrationSeen,celebrationPlayers,earlyResult]),[true,true,true,true,6,false]);
 assert.equal(await page.locator('.is-celebrating').count(),0);
 assert.equal(await page.evaluate(()=>hrFlashes.length),1,'do not announce home run again after the lap');
 assert.match(await page.locator('.inning-result').textContent(),/끝내기 승리/);assert.deepEqual(errors,[]);
 console.log('PASS: home run announced at fence crossing, runners continue, fielders watch, one announcement');
} finally {await browser.close();await new Promise(r=>server.close(r));}
