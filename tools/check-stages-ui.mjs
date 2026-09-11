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
 await page.goto(url+'/?challenge=b7-0-42');
 await page.evaluate(async()=>{
  localStorage.setItem('dugout.sfx','0');
  crypto.getRandomValues=a=>a.fill(42);
  const {BattingGame}=await import('/js/batting-game.js');
  const rolls=[[0,.1,0,.9,0,.5,.5,.5,.5,.5],[0,.1,0,.9,.42,.55,.5,.5,.5,.5],[0,.99,0,.9,0,.5,.5,.5,.5,.5]];
  BattingGame.prototype.random=function(){this.testIndex=(this.testIndex??-1)+1;return rolls[this.stage.id][this.testIndex%10];};
  const resolve=BattingGame.prototype.resolvePitch;BattingGame.prototype.resolvePitch=function(c,r){window.stageEvent=resolve.call(this,c,r);return window.stageEvent;};
  const {Live3D}=await import('/js/live3d.js'),direct=Live3D.prototype.direct;
  Live3D.prototype.direct=function(S,t){window.scene3d=this;window.state3d=S;return direct.call(this,S,t);};
  Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shared=data;}});
 });
 assert.equal(await page.locator('.stage-select button').count(),3);
 await page.locator('#btnBatting').click();
 for(let id=0;id<3;id++){
  await page.waitForFunction(()=>document.querySelector('.inning-picks')?.disabled===false);
  const state=await page.evaluate(()=>({b:state3d.b,s:state3d.s,o:state3d.outs,runners:state3d.runners.length,mode:scene3d.atmosphere,park:scene3d.opts.park.name}));
  assert.deepEqual([state.b,state.s,state.o,state.runners],[[0,0,1,2],[0,0,1,1],[3,2,2,3]][id]);
  assert.equal(state.mode,['clear','evening','indoor'][id]);assert.equal(state.park,['항구 파크','산성 필드','센트럴 돔'][id]);
  assert.equal(await page.locator('.inning-frame small').textContent(),(id+1)+'/3');
  await page.screenshot({path:`/tmp/dugout-stage-${id+1}.png`});
  await page.locator('[data-group="target"] [data-value="FF"]').click();
  await page.locator('.inning-throw').click();await page.locator('.is-deciding').waitFor();if(id!==2){const hold=page.locator('.batting-hold');await hold.dispatchEvent('pointerdown',{button:0,pointerId:1});await page.waitForTimeout(150);await page.dispatchEvent('body','pointerup',{pointerId:1});}
  await page.locator('.is-celebrating').waitFor();
  if(id===0){await page.waitForFunction(()=>state3d.celebrationTime>3);await page.screenshot({path:'/tmp/dugout-celebration-gathered.png'});}
  assert.equal(await page.locator('.inning-result').isVisible(),false);
  await page.waitForFunction(()=>!document.querySelector('.inning-result').hidden,{},{timeout:90000});
  const e=await page.evaluate(()=>({result:window.stageEvent.result,scored:window.stageEvent.scored,won:window.stageEvent.after.won}));
  assert.deepEqual(e,{result:['HR','OUT','BB'][id],scored:[3,1,1][id],won:true});
  await page.locator('[data-share]').click();assert.match(await page.evaluate(()=>shared.url),new RegExp('b7-'+id+'-42$'));
  if(id<2)await page.locator('[data-next]').click();else {assert.equal(await page.locator('[data-next]').count(),0);assert.match(await page.locator('.inning-result h2').textContent(),/세 경기 클리어/);}
 }
 await page.locator('.inning-exit').click();assert.equal(await page.locator('.stage-select button b').evaluateAll(ns=>ns.filter(n=>n.textContent.startsWith('✓')).length),3);
 await page.goto(url+'/?challenge=b7-2-42');await page.locator('.stage-select [data-stage="2"][aria-pressed="true"]').waitFor();
 await page.locator('#btnBatting').click();await page.waitForFunction(()=>document.querySelector('.inning-picks')?.disabled===false);
 assert.equal(await page.locator('.inning-counts .strike.lit').count(),2);assert.equal(await page.locator('.inning-counts .ball.lit').count(),3);
 await page.locator('.inning-exit').click();assert.deepEqual(errors,[]);
 console.log('PASS: three playable stages, HR/tag-up/walk wins, distinct environments and opponents, next stage, saved clears and deep-linked full count');
} finally {await browser.close();await new Promise(r=>server.close(r));}
