// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/check-ui-layout.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve('web');
const server=createServer(async(req,res)=>{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}try{const b=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try {
 const errors=[];
 for(const [width,height,touch] of [[320,568,true],[390,844,true],[844,390,true],[1440,1000,false]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
  page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');localStorage.setItem('dugout.sfx','0');});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('.legacy-games > summary').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'lobby must fit');
  await page.screenshot({path:`/tmp/dugout-redesign-home-${width}.png`,fullPage:true});
  const activate=async selector=>{const el=page.locator(selector);await el.scrollIntoViewIfNeeded();if(touch)await el.tap();else await el.click();};
  await activate('#btnBatting');
  await page.locator('.match-enter:not([disabled])').waitFor();
  assert.equal(await page.locator('.inning-controls').isVisible(),false,'no dock over introduction');
  await page.screenshot({path:`/tmp/dugout-redesign-intro-${width}.png`});
  // Pause as soon as entry ends, before the automatic next-pitch clock starts.
  await page.evaluate(()=>{const root=document.querySelector('.inning-mode');const obs=new MutationObserver(()=>{if(root.classList.contains('is-intro'))return;obs.disconnect();root.querySelector('.inning-pause').click();});obs.observe(root,{attributes:true,attributeFilter:['class']});});
  await activate('.match-enter');await page.locator('.is-timeout').waitFor();
  assert.equal(await page.locator('.inning-pause').getAttribute('aria-pressed'),'true');
  const fits=async selector=>{
   const checks=await page.locator(selector).evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:e.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height,inside:r.x>=0&&r.y>=0&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5,reachable:!!hit&&(e===hit||e.contains(hit))};}));
   for(const c of checks){assert.ok(c.inside,`${width} clipped: ${JSON.stringify(c)}`);assert.ok(c.h>=44&&c.w>=44,`${width} small target: ${JSON.stringify(c)}`);assert.ok(c.reachable,`${width} covered: ${JSON.stringify(c)}`);}
  };
  await fits('.inning-picks button:not([hidden]),.inning-head button');
  for(const value of ['FF','SL','CH','any']){
   await activate(`[data-group=target] [data-value=${value}]`);
   assert.equal(await page.locator(`[data-group=target] [data-value=${value}]`).getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('[data-group=target] [aria-pressed=true]').count(),1);
  }
  for(const value of ['in','out','high','low']){
   await activate(`[data-group=location] [data-value=${value}]`);
   assert.equal(await page.locator(`[data-group=location] [data-value=${value}]`).getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('.plan-location .zone-read-risk').count(),6,'off-target cells show the tradeoff');
   await activate(`[data-group=location] [data-value=${value}]`);
   assert.equal(await page.locator('[data-group=location] [aria-pressed=true]').count(),0,'tapping again clears the target');
  }
  await activate('[data-group=approach] [data-value=power]');
  assert.equal(await page.locator('.plan-location .zone-coverage').getAttribute('data-approach'),'power');
  await activate('[data-group=approach] [data-value=contact]');
  assert.equal(await page.locator('.plan-location .zone-coverage').getAttribute('data-approach'),'contact');
  assert.deepEqual(await page.locator('[data-group=approach] button[data-value]').evaluateAll(es=>es.map(e=>({pressed:e.getAttribute('aria-pressed'),background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}))),[{pressed:'true',background:'rgb(244, 198, 158)',color:'rgb(23, 46, 55)'},{pressed:'false',background:'rgb(33, 59, 71)',color:'rgb(237, 244, 237)'}],'selection colors update immediately');
  assert.equal(await page.locator('.plan-cut').isDisabled(),true,'cut stays unavailable before two strikes');
  await page.screenshot({path:`/tmp/dugout-redesign-plan-${width}.png`});
  // The full dock must disappear when play resumes, including its background.
  await activate('.inning-pause');await page.locator('.is-playing').waitFor();
  assert.equal(await page.locator('.inning-controls').isVisible(),false,'no empty panel during a pitch');
  await activate('.inning-exit');
  await activate('#btnInning');await page.locator('.match-enter:not([disabled])').waitFor();await activate('.match-enter');
  await page.locator('.inning-throw:not(:disabled)').waitFor();await activate('.inning-plan-toggle');
  for(const value of ['FF','SL','CH']){await activate(`[data-group=type] [data-value=${value}]`);assert.equal(await page.locator(`[data-group=type] [data-value=${value}]`).getAttribute('aria-pressed'),'true');}
  for(const value of ['in','out','high','low']){await activate(`[data-group=zone] [data-value=${value}]`);assert.equal(await page.locator(`[data-group=zone] [data-value=${value}]`).getAttribute('aria-pressed'),'true');}
  await activate('[data-group=intent] [data-value=chase]');assert.equal(await page.locator('[data-group=intent] [data-value=chase]').getAttribute('aria-pressed'),'true');
  await fits('.inning-picks button:not([hidden])');
  await page.screenshot({path:`/tmp/dugout-redesign-pitcher-${width}.png`});
  await activate('.inning-plan-toggle');await fits('.pitching-action button,.inning-plan-toggle');
  await activate('.inning-exit');await page.close();console.log(`PASS: ${width}×${height} ${touch?'touch':'mouse'} lobby, batting choices, coverage, pitch choices and clear playing field`);
 }
 assert.deepEqual(errors,[],'browser errors');
} finally {await browser.close();await new Promise(r=>server.close(r));}
