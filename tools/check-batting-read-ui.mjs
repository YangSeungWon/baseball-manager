// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/check-batting-read-ui.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve('web');
const server=createServer(async(req,res)=>{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}try{const b=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.evaluate(()=>localStorage.setItem('dugout.sfx','0'));
 await page.locator('#btnBatting').click();await page.locator('.is-intro').waitFor();await page.locator('.match-enter').click();await page.waitForFunction(()=>!document.querySelector('.inning-mode').classList.contains('is-intro'));
 await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
 await page.locator('.inning-throw').click();await page.locator('.flight-read').waitFor({state:'visible'});
 assert.equal(await page.locator('.inning-live-zone').isVisible(),false);
 assert.equal(await page.locator('.zone-read-estimate,.zone-read-kind').count(),0,'no landing point or pitch type hint');
 const before=await page.locator('.flight-read').boundingBox();
 await page.waitForTimeout(500);
 const after=await page.locator('.flight-read').boundingBox();assert.ok(after.width<before.width,'focus tightens around the observed ball');
 assert.ok(after.x>=0&&after.y>=0);
 await page.locator('.is-take-locked').waitFor();assert.equal(await page.locator('.batting-take').isDisabled(),true);assert.equal(await page.locator('.batting-swing').isEnabled(),true);
 await page.screenshot({path:'/tmp/dugout-batting-read.png'});await page.locator('.batting-swing').click();
 await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled||!document.querySelector('.inning-result').hidden,{},{timeout:30000});
 assert.deepEqual(errors,[]);console.log('PASS: first-person flight cue replaces ABS prediction and discipline visibly closes late take');
}finally{await browser.close();await new Promise(r=>server.close(r));}
