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
    const page=await browser.newPage({viewport:{width,height},hasTouch:true});await page.addInitScript(()=>{try{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');}catch{}});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);
    await page.evaluate(async()=>{
      localStorage.setItem('dugout.sfx','0');const {Live3D}=await import('/js/live3d.js');
      const direct=Live3D.prototype.direct;Live3D.prototype.direct=function(S,t){window.scene3d=this;return direct.call(this,S,t);};
    });
    await page.locator('#btnBatting').click();
    await page.locator('.match-enter:not([disabled])').click();
    await page.waitForFunction(()=>window.scene3d?.cameraKind==='batting');
    const pose=()=>page.evaluate(()=>({eye:scene3d.camera.position.toArray(),quaternion:scene3d.camera.quaternion.toArray(),kind:scene3d.cameraKind}));
    await page.locator('.pitcher-tag').waitFor({state:'visible'});
    const anchored=await page.evaluate(()=>{const a=scene3d.pitcherAnchor(),r=document.querySelector('.pitcher-tag').getBoundingClientRect();return Math.abs(r.x+r.width/2-a.x*innerWidth)<3&&Math.abs(r.bottom-(a.y*innerHeight-8))<3;});assert.ok(anchored,'name tracks projected pitcher head');
    // 포수 뒤 고정 시점. 홈 뒤 중앙에 서서 화면이 어떻게 바뀌든 자리를 지킨다.
    const initial=await pose();
    assert.equal(initial.eye[0],0,'the batting camera sits on the center line behind home');
    assert.ok(initial.eye[2]>0&&initial.eye[1]>0,'behind home plate and above the ground');
    await page.screenshot({path:`/tmp/dugout-eyes-${width}.png`});
    await page.mouse.move(width*.5,height*.45);await page.mouse.down();await page.mouse.move(width*.7,height*.65,{steps:8});await page.mouse.up();
    assert.deepEqual(await pose(),initial,'dragging aims the bat and never moves the camera');
    await page.locator('.is-deciding').waitFor({timeout:60000});
    assert.deepEqual((await pose()).eye,initial.eye,'the pitch does not move the camera');
    // 아무것도 누르지 않으면 지켜본 것이 된다. 판정이 끝나고 다음 선택이 열릴 때까지 기다린다.
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled,{},{timeout:60000});
    assert.equal((await pose()).kind,'batting','between pitches stays behind the plate');
    await page.locator('.inning-exit').click();assert.equal(await page.locator('.lv-three').count(),0);
    await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: fixed catcher-side camera, pitcher tag anchoring, aim drag, between-pitch POV, close; mobile/landscape/desktop');
} finally {await browser.close();await new Promise(r=>server.close(r));}
