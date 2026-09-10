// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/check-mascots-ui.mjs
import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),root=resolve('web');
const server=createServer(async(req,res)=>{const path=resolve(root,'.'+new URL(req.url,'http://x').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/'))return res.writeHead(403).end();try{const b=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.evaluate(async()=>{localStorage.setItem('dugout.sfx','0');const {FullGame}=await import('/js/full-game.js');const pitch=FullGame.prototype.pitch;FullGame.prototype.pitch=function(c){this.strikes=2;this.outs=2;this.random=()=>.99;return pitch.call(this,c);};const {Live3D}=await import('/js/live3d.js');const render=Live3D.prototype.render;Live3D.prototype.render=function(...a){window.view=this;return render.apply(this,a)};});
 await page.locator('#btnFullGame').click();await page.locator('.match-enter').click();await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled);
 assert.equal(await page.locator('.pitch-breathe').count(),1);assert.equal(await page.locator('.batting-swing').count(),0);assert.equal(await page.evaluate(()=>view.opts.playerRole),'pitcher');
 await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
 await page.locator('.inning-throw').click();await page.locator('.is-releasing').waitFor();await page.locator('.inning-throw').click();
 await page.locator('.batting-swing').waitFor({state:'visible',timeout:30000});await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled);
 assert.equal(await page.locator('.match-intro').count(),0);assert.match(await page.locator('.inning-frame').textContent(),/1.*▾/);assert.equal(await page.evaluate(()=>view.opts.playerRole),'batter');await page.waitForFunction(()=>view.cameraKind==='batting');
 await page.evaluate(async()=>{const {FullGame}=await import('/js/full-game.js');FullGame.prototype.preparePitch=function(choice){this.outs=2;const roll=[0,.1,0,.9,.42,.55,.5,.5,.5,.5];this.pending={choice,roll};return this.delivery(roll)};});
 await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});await page.locator('.inning-throw').click();await page.locator('.is-deciding').waitFor();await page.locator('.batting-swing').click();
 await page.locator('.pitch-breathe').waitFor({state:'visible',timeout:30000});await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled);assert.match(await page.locator('.inning-frame').textContent(),/2.*▴/);assert.equal(await page.evaluate(()=>view.opts.playerRole),'pitcher');
 await page.locator('.inning-exit').click();assert.deepEqual(errors,[]);console.log('PASS: pitching first, third out switches to batting controls and first-person camera without another entry button');
}finally{await browser.close();await new Promise(r=>server.close(r));}
