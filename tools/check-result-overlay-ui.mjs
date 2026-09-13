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
 const page=await browser.newPage();await page.addInitScript(()=>{try{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');}catch{}});await page.goto(url);
 await page.evaluate(async()=>{const {LiveView}=await import('/js/live.js');window.LiveView=LiveView;document.querySelector('#boot').hidden=true;const host=document.createElement('div');host.className='inning-mode';host.innerHTML='<div class="inning-live"></div>';document.body.append(host);window.lv=new LiveView(host.firstChild,{home:'홈',away:'원정',colors:{home:'#cc7755',away:'#448899'},immersive:()=>true,stageHeight:()=>innerHeight});await lv.ready;});
 for(const width of [390,1440])for(const reducedMotion of ['reduce','no-preference']){
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion});
  for(const [label,cls] of [['아웃','out'],['삼진','k'],['홈런','hr']]){
   const info=await page.evaluate(([label,cls])=>{lv._flash(label,cls);const el=lv.el.flash;for(const a of el.getAnimations()){a.pause();a.currentTime=500;}const s=getComputedStyle(el),r=el.getBoundingClientRect();return {text:el.textContent,opacity:+s.opacity,x:r.x+r.width/2,y:r.y+r.height/2,z:+s.zIndex,motion:matchMedia('(prefers-reduced-motion: reduce)').matches};},[label,cls]);
   assert.equal(info.text,label);assert.equal(info.opacity,1,`${width} ${reducedMotion} ${label}`);assert.ok(Math.abs(info.x-width/2)<2&&Math.abs(info.y-450)<2);assert.ok(info.z>0);assert.equal(info.motion,reducedMotion==='reduce');
  }
  await page.screenshot({path:`/tmp/dugout-result-${width}-${reducedMotion}.png`});
  await page.evaluate(()=>lv._flash(null));assert.equal(await page.locator('.lv-flash').evaluate(e=>getComputedStyle(e).opacity),'0');
 }
 await page.evaluate(()=>lv.destroy());console.log('PASS: centered out/strikeout/home run on mobile and desktop, visible with reduced motion, cleared correctly');
} finally {await browser.close();await new Promise(r=>server.close(r));}
