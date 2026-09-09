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
 for(const [speed,expected,width,height] of [[5.5,'1B',390,844],[9,'2B',844,390]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.evaluate(async speed=>{
   localStorage.setItem('dugout.sfx','0');const {BattingGame}=await import('/js/batting-game.js');const resolve=BattingGame.prototype.resolvePitch;const {defenseRoster}=await import('/js/player-traits.js');Object.defineProperty(BattingGame.prototype,'defense',{configurable:true,get:()=>defenseRoster(0)});
   BattingGame.prototype.resolvePitch=function(c){
    this.bases=[false,false,false];this.baseRunners=[null,null,null];Object.defineProperty(this,'batter',{configurable:true,get:()=>({id:'test-runner',name:'테스트 타자',speed,contact:.72,power:0,style:'공격형'})});
    const e=resolve.call(this,c,[0,.1,.1,.9,1-((38-26)/28)/.85,6/43,.5,.6875,.5,.5]);window.result=e;return e;
   };
   window.sampleTrace=(await import('/js/field-sim.js')).sampleField;
   const {Live3D}=await import('/js/live3d.js');const direct=Live3D.prototype.direct;Live3D.prototype.direct=function(S,t){window.state3d=S;return direct.call(this,S,t);};
  },speed);
  await page.locator('#btnBatting').click();await page.locator('.inning-throw').waitFor();await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled);
  assert.ok(await page.evaluate(async()=>{const {leadPosition}=await import('/js/runner-motion.js');return state3d.runners.every(r=>{const p=leadPosition(r.base);return Math.hypot(r.x-p.x,r.y-p.y)<1e-7;});}),'visible runners take the same lead as the model');
  await page.locator('.inning-throw').click();await page.locator('.is-deciding').waitFor();await page.locator('.batting-swing').click();
  await page.waitForFunction(()=>window.state3d?.fieldPlay?.time>2,{},{timeout:20000});
  assert.ok(await page.evaluate(()=>{const frame=sampleTrace(result.fieldPlay,state3d.fieldPlay.time);return frame.runners.filter(r=>r.vis).every(r=>{const shown=state3d.runners.find(p=>p.id===r.id);return shown&&Math.hypot(shown.x-r.x,shown.y-r.y)<1e-7;});}),'runner rendering follows the adjudicated trace');
  await page.waitForFunction(()=>state3d.fieldPlay?.phase==='safe',{},{timeout:30000});
  assert.equal(await page.evaluate(()=>result.result),expected);
  assert.equal(await page.evaluate(()=>result.fieldPlay.running.contest.base),speed===9?2:1);
  await page.screenshot({path:`/tmp/dugout-running-${width}.png`});
  await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
  const bases=await page.evaluate(()=>result.after.baseRunners);assert.equal(bases[speed===9?1:0].speed,speed);
  await page.locator('.inning-exit').click();await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: mobile single vs double by running speed, throw target, safe call, runner trace equality, identity retained');
} finally {await browser.close();await new Promise(r=>server.close(r));}
