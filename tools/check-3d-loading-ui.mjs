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
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});await page.addInitScript(()=>{try{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');}catch{}});
 await page.goto(url);await page.evaluate(()=>{localStorage.setItem('dugout.view','top');localStorage.setItem('dugout.sfx','0');});
 let release;const gate=new Promise(r=>release=r);await page.route('**/js/live3d.js',async route=>{await gate;await route.continue();});
 await page.locator('#btnBatting').click();
 await page.locator('.lv-stage[aria-busy=true]').waitFor();
 assert.equal(await page.locator('.inning-throw').isDisabled(),true);
 assert.equal(await page.locator('.lv-c').isVisible(),false);
 assert.equal(await page.locator('[data-v]').count(),0);
 assert.equal(await page.locator('.inning-batter-entry').isVisible(),false);
 release();await page.locator('.lv-three').waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled);
 const pixels=await page.locator('.lv-three').evaluate(c=>({w:c.width,h:c.height}));assert.deepEqual(pixels,{w:780,h:1688});
 await page.screenshot({path:'/tmp/dugout-sharp-390.png'});
 await page.locator('.inning-exit').click();
 await page.unroute('**/js/live3d.js');
 await page.evaluate(async()=>{const {LiveView}=await import('/js/live.js');const host=document.createElement('div');document.body.append(host);window.testView=new LiveView(host,{view:'persp',home:'홈',away:'원정',colors:{home:'#cc7755',away:'#448899'}});await testView.ready;});
 assert.equal(await page.evaluate(()=>testView.view),'three');
 await page.evaluate(()=>testView.setView('top'));assert.equal(await page.evaluate(()=>testView.view),'three');
 const motion=await page.evaluate(()=>{
  const v=testView.three,S=testView.S;S.half='bottom';S.fielders={CF:{x:0,y:95},SS:{x:-13,y:38}};
  const state=JSON.stringify(S.fielders),read=()=>['fCF','fSS'].map(k=>{const p=v.players.get(k);return {body:p.body.position.toArray(),head:p.head.rotation.y,root:p.root.position.toArray()};});
  v.render(S,testView.o.colors,testView.line,1);const a=read();v.render(S,testView.o.colors,testView.line,2);const b=read();
  return {a,b,unchanged:state===JSON.stringify(S.fielders)};
 });
 assert.ok(motion.unchanged);assert.notDeepEqual(motion.a[0].body,motion.b[0].body);assert.notEqual(motion.b[0].head,motion.b[1].head);assert.deepEqual(motion.a[0].root,motion.b[0].root);
 await page.evaluate(()=>testView.destroy());
 console.log('PASS: 3D only, loading blocks entry, old preferences ignored, DPR 2 resolution, independent idle motion without coordinate changes, cleanup');
} finally {await browser.close();await new Promise(r=>server.close(r));}
