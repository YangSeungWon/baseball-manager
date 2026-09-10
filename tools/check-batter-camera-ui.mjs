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
  for(const [width,height] of [[390,844],[844,390],[1440,1000]]) {
    const page=await browser.newPage({viewport:{width,height},hasTouch:true});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);
    await page.evaluate(async()=>{
      localStorage.setItem('dugout.sfx','0');const {Live3D}=await import('/js/live3d.js');
      const direct=Live3D.prototype.direct;Live3D.prototype.direct=function(S,t){window.scene3d=this;return direct.call(this,S,t);};
    });
    await page.locator('#btnBatting').click();await page.waitForFunction(()=>window.scene3d?.cameraKind==='batting');
    const pose=()=>page.evaluate(()=>({eye:scene3d.camera.position.toArray(),look:{...scene3d.look},kind:scene3d.cameraKind}));
    await page.locator('.pitcher-tag').waitFor({state:'visible'});
    const anchored=await page.evaluate(()=>{const a=scene3d.pitcherAnchor(),r=document.querySelector('.pitcher-tag').getBoundingClientRect();return Math.abs(r.x+r.width/2-a.x*innerWidth)<3&&Math.abs(r.bottom-(a.y*innerHeight-8))<3;});assert.ok(anchored,'name tracks projected pitcher head');
    const initial=await pose();assert.deepEqual(initial.eye,[-.85,1.65,.25]);
    await page.screenshot({path:`/tmp/dugout-eyes-${width}.png`});
    await page.locator('.inning-look').click();await page.waitForFunction(()=>scene3d.look.pitch<-1);
    await page.screenshot({path:`/tmp/dugout-plate-${width}.png`});
    assert.equal(await page.locator('.pitcher-tag').isVisible(),false,'pitcher out of view hides label');
    assert.deepEqual((await pose()).eye,initial.eye,'looking rotates without moving out of batter box');
    await page.locator('.inning-look').click();assert.equal((await pose()).look.pitch,0);
    await page.mouse.move(width*.5,height*.45);await page.mouse.down();await page.mouse.move(width*.7,height*.65,{steps:8});await page.mouse.up();
    assert.ok((await pose()).look.pitch<-.1,'drag changes view');
    if(width===390){
      const input=await page.context().newCDPSession(page);
      const beforeTouch=(await pose()).look.yaw;
      await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:240}]});
      await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:220,y:300}]});
      await input.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      assert.notEqual((await pose()).look.yaw,beforeTouch,'native touch changes view');
      assert.equal(await page.evaluate(()=>scene3d.drag),null,'touch cancel releases drag');
      await input.detach();
    }
    await page.locator('.inning-throw').click();
    await page.waitForFunction(()=>scene3d.look.yaw===0&&scene3d.look.pitch===0);
    await page.locator('.is-deciding').waitFor();
    assert.equal((await pose()).kind,'batting');
    await page.locator('.batting-take').click();
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:30000});
    assert.equal((await pose()).kind,'batting','between pitches stays in the batter box');
    await page.locator('.inning-exit').click();assert.equal(await page.locator('.lv-three').count(),0);
    await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: batter eye position, plate glance, drag rotation, pitch reset, between-pitch POV, close; mobile/landscape/desktop');
} finally {await browser.close();await new Promise(r=>server.close(r));}
