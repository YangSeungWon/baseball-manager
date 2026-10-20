import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve('web');
const server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const [width,height,touch] of [[320,568,true],[390,844,true],[844,390,true],[1440,1000,false]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'));
  await page.screenshot({path:`/tmp/dugout-inning-home-${width}.png`,fullPage:true});
  await page.evaluate(async()=>{
   const {QuickGame}=await import('/js/quick-game.js');const {deliverQuickPitch}=await import('/js/quick-pitches.js');

   Object.defineProperty(QuickGame.prototype,'pitch',{get(){
    window.testGame=this;if(this.done)return null;
    // Four balls, a center fastball, two strikes, a foul, then three strikeouts.
    const i=this.results.length;
    const type=i===0?'CU':i===1?'CH':'FF';
    return this.current??=deliverQuickPitch(type,this.pitcher,{x:i<4?1.5:0,z:0},Array(8).fill(0));
   }});
  });
  const activate=async selector=>touch?page.locator(selector).tap():page.locator(selector).click();
  await activate('#btnQuick');await page.locator('.quick-start').waitFor();
  const fits=async()=>{
   const boxes=await page.locator('.quick-mode button').evaluateAll(es=>es.filter(e=>e.getClientRects().length&&!e.closest('[inert]')).map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{text:e.textContent||e.getAttribute('aria-label'),fit:r.left>=0&&r.top>=0&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5,reachable:e.disabled||hit===e||e.contains(hit),h:r.height};}));
   for(const b of boxes){assert.ok(b.fit,JSON.stringify(b));assert.ok(b.reachable,JSON.stringify(b));assert.ok(b.h>=44,JSON.stringify(b));}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  };
  await fits();await page.screenshot({path:`/tmp/dugout-inning-report-${width}.png`});
  await activate('.quick-start');await fits();
  await activate('[data-approach="fast"]');assert.equal(await page.locator('[data-approach="fast"]').getAttribute('aria-pressed'),'true');
  await activate('.quick-report');await fits();await activate('.quick-resume');
  await activate('.quick-help');await fits();await activate('.quick-resume');
  async function begin(){
   assert.equal(await page.locator('.quick-mode').getAttribute('data-phase'),'plan');
   await activate('.quick-swing');await page.clock.runFor(672);
   assert.equal(await page.locator('.quick-mode').getAttribute('data-phase'),'flight');
  }
  async function finishPitch(offset=null){
   const flight=await page.evaluate(()=>testGame.pitch.flight);
   if(offset===null)await page.clock.runFor(flight+190);
   else{await page.clock.runFor(flight+offset-16);if(touch)await activate('.quick-swing');else await page.keyboard.press('Space');}
   assert.equal(await page.locator('.quick-mode').getAttribute('data-phase'),'feedback');
   await page.clock.runFor(1280);
  }
  await begin();await activate('.quick-pause');await page.clock.runFor(5000);
  assert.equal(await page.evaluate(()=>testGame.results.length),0);
  await activate('.quick-resume');await page.clock.runFor(672);await finishPitch();
  assert.equal(await page.evaluate(()=>testGame.balls),1);
  for(let i=0;i<3;i++){await begin();await finishPitch();}
  assert.deepEqual(await page.evaluate(()=>testGame.bases),[true,false,false]);
  await begin();await page.screenshot({path:`/tmp/dugout-inning-play-${width}.png`});await finishPitch(0);
  assert.equal(await page.evaluate(()=>testGame.runs),2,'prepared center fastball is a two-run homer');
  for(let i=0;i<2;i++){await begin();await finishPitch();}
  await begin();await finishPitch(125);assert.equal(await page.evaluate(()=>testGame.strikes),2);assert.equal(await page.evaluate(()=>testGame.outs),0);
  for(let i=0;i<7;i++){await begin();await finishPitch();}
  await page.locator('.quick-retry').waitFor();await fits();
  assert.equal(await page.evaluate(()=>testGame.outs),3);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dugout.inning.v1')).best),2);
  await page.screenshot({path:`/tmp/dugout-inning-result-${width}.png`});
  const seed=await page.evaluate(()=>testGame.seed);await activate('.quick-retry');assert.equal(await page.evaluate(()=>testGame.seed),seed);
  await activate('.quick-start');assert.equal(await page.evaluate(()=>testGame.runs),0);
  await activate('.quick-exit');assert.equal(await page.locator('.quick-mode').count(),0);assert.equal(await page.locator('#boot').evaluate(el=>el.inert),false);
  assert.deepEqual(errors,[]);console.log(`PASS ${width}×${height}: layout, report, approaches, pause, counts, walk, homer, foul, 3 outs, replay, storage`);await page.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
