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
  const errors = [];
  for (const [width,height] of [[390,844],[1440,1000]]) {
    const page = await browser.newPage({viewport:{width,height}});await page.addInitScript(()=>{try{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');}catch{}});
    page.on('pageerror', e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error' && /Shader Error|VALIDATE_STATUS/.test(m.text()))errors.push(m.text());});
    await page.goto(url); await page.locator('.manager-entry>summary').click(); await page.locator('#btnNew').waitFor();
    assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('/vendor/three/'))),false,'Three is lazy');
    await page.evaluate(async()=>{
      const {LiveView}=await import('/js/live.js');
      document.querySelector('#boot').hidden=true;
      document.querySelector('#modal').hidden=false;document.querySelector('#modal').classList.add('full');
      document.querySelector('#modalBody').innerHTML='<div class="gs"><div class="gs-top">3D 경기</div><div class="gs-body" id="test3d"></div></div>';
      const lv=window.lv=new LiveView(document.querySelector('#test3d'),{home:'전주 재규어스',away:'대구 나이츠',colors:{home:'#427c33',away:'#cf3d46'},park:{},speed:1});
      lv.S.half='top';lv.S.inning=1;lv.S.batter={name:'김타자',hand:'R',alpha:1};
      const pos={P:[0,18.44],C:[0,-1.6],'1B':[24,25],'2B':[13,38],SS:[-13,38],'3B':[-24,25],LF:[-45,75],CF:[0,95],RF:[45,75]};
      for(const [p,[x,y]] of Object.entries(pos))lv.S.fielders[p]={pos:p,x,y,alpha:1};
      lv.setView('three');
    });
    await page.waitForFunction(()=>!!window.lv.three,{},{timeout:20000});
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.lv-three').isVisible(),true);
    assert.equal(await page.locator('.lv-c').isVisible(),false);
    const info=await page.evaluate(()=>({calls:lv.three.renderer.info.render.calls,triangles:lv.three.renderer.info.render.triangles}));
    assert.ok(info.triangles>1000, 'actual geometry rendered');
    console.log(width,info);
    const optim=await page.evaluate(()=>{
      const v=lv.three;let fixed=0;v.scene.traverse(o=>{if(o.isMesh&&!o.matrixAutoUpdate&&!o.matrixWorldAutoUpdate)fixed++;});
      v.setGameTime(.4);const version=v.skyState.texture.version;v.setGameTime(.4);
      const repeatedSkyUpload=v.skyState.texture.version!==version;
      let calls=0;const set=v.renderer.setSize.bind(v.renderer);v.renderer.setSize=(...args)=>{calls++;return set(...args)};v.resize(lv.cw,lv.ch);v.renderer.setSize=set;
      return {fixed,repeatedSkyUpload,resizeCalls:calls,animated:v.mascot.root.matrixAutoUpdate};
    });
    assert.ok(optim.fixed>20);assert.equal(optim.repeatedSkyUpload,false);assert.equal(optim.resizeCalls,0);assert.equal(optim.animated,true);

    await page.screenshot({path:`/tmp/dugout-three-${width}-pitch.png`});
    await page.evaluate(()=>{lv.S.ball={x:25,y:65,z:12,vis:true};lv.S.trail=[[0,0,1],[8,20,9],[18,40,15],[25,65,12]];});
    await page.waitForTimeout(1200);
    await page.screenshot({path:`/tmp/dugout-three-${width}-field.png`});
    assert.equal(await page.evaluate(()=>lv.three.fieldShot),true);
    const coverage=await page.evaluate(()=>{
      const r=lv.three,S=lv.S;const shots={};
      for(const kind of ['pitch','batter','pitcher','field','base','beauty']) {
        S.broadcast={kind,target:[19.4,19.4]};const t=10+Object.keys(shots).length*2;r.direct(S,t);r.direct(S,t+1);shots[kind]=r.cameraKind;   // soft cuts dip to black first, so step past the fade
      }
      S.b=2;S.s=1;S.outs=1;S.fielders.P.name='김선발';
      lv.line.top=[0,1,0,0,0,0,0,0,0,0,2,0,1];lv.line.hits.top=7;lv.line.err.bottom=1;
      r.scoreboard(S,lv.line);
      return {shots,board:r.boardSnapshot,crowd:r.crowdCount,seats:r.seatCount,mascot:r.mascot&&{code:r.mascot.id.code,form:r.mascot.id.form,parts:r.mascot.root.children.length}};
    });
    assert.deepEqual(Object.keys(coverage.shots),Object.values(coverage.shots));
    assert.equal(coverage.board.b,2);assert.equal(coverage.board.pitcher,'김선발');
    assert.equal(coverage.board.top.length,13);assert.equal(coverage.board.err.bottom,1);
    assert.ok(coverage.crowd>0 && coverage.crowd<coverage.seats);
    assert.deepEqual(coverage.mascot.code,'JJ');assert.equal(coverage.mascot.form,'jaguar');assert.ok(coverage.mascot.parts>=8);
    for(const view of ['top','persp','three']) {
      await page.evaluate(v=>lv.setView(v),view);
      assert.equal(await page.locator('.lv-three').isVisible(),true);
      assert.equal(await page.locator('.lv-c').isVisible(),false);
    }
    await page.setViewportSize({width:320,height:568});
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>document.querySelector('#modalBody').scrollWidth>innerWidth),false,'no overflow');
    await page.evaluate(()=>lv.three.renderer.forceContextLoss());
    await page.waitForFunction(()=>!lv.three);
    assert.equal(await page.locator('.lv-c').isVisible(),false,'no legacy fallback');
    await page.locator('.lv-3d-status button').click();
    await page.waitForFunction(()=>!!lv.three&&document.querySelector('.lv-3d-status').hidden);
    await page.evaluate(()=>lv.destroy());
    assert.equal(await page.locator('.lv-three').count(),0,'canvas disposed');
    await page.close();
  }
  const variant=await browser.newPage();await variant.addInitScript(()=>{try{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');}catch{}});variant.on('pageerror',e=>errors.push(e.message));
  await variant.goto(url); await variant.locator('.manager-entry>summary').click();await variant.locator('#btnNew').waitFor();
  const variants=await variant.evaluate(async()=>{
    const {Live3D,loadPlayerModel}=await import('/js/live3d.js');await loadPlayerModel();const {parkDims}=await import('/js/core/bip.js');
    const records=[];
    for(const dome of [false,true]) {
      const opts={home:'전주 재규어스',away:'대구 나이츠',park:{dome},colors:{home:'#427c33',away:'#cf3d46'},crowd:0,cap:14000,day:12};
      const v=new Live3D(document.body,parkDims(opts.park),opts,()=>{});v.resize(390,244);
      records.push({mode:v.atmosphere,crowd:v.crowdCount});v.dispose();
    }
    return records;
  });
  assert.equal(variants[0].crowd,0);assert.equal(variants[1].mode,'indoor');assert.equal(variants[1].crowd,0);
  await variant.close();
  // Exercise the real game flow with a persisted third-view preference.
  const game=await browser.newPage({viewport:{width:390,height:844}});await game.addInitScript(()=>{try{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');}catch{}});
  game.on('pageerror',e=>errors.push(e.message));
  await game.goto(url); await game.locator('.manager-entry>summary').click();await game.locator('#btnNew').waitFor();
  await game.evaluate(()=>localStorage.setItem('dugout.view','persp'));
  await game.reload();await game.locator('.manager-entry>summary').click();await game.locator('#btnNew').click();await game.locator('#guidePlay').click();
  await game.locator('.lv-three').waitFor({state:'visible',timeout:20000});
  await game.locator('.lv-pre-go').click();
  await game.waitForFunction(()=>document.querySelector('.lv-mgr').hidden===false);
  await game.waitForTimeout(1800);
  assert.equal(await game.locator('[data-v]').count(),0);
  await game.locator('.lv-end').click();await game.locator('#gsDone').waitFor({timeout:20000});
  await game.locator('#gsDone').click();
  assert.equal(await game.locator('.lv-three').count(),0);
  await game.close();
  // Closing during the async import must not create an orphan WebGL canvas.
  const closing=await browser.newPage();await closing.addInitScript(()=>{try{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');}catch{}});
  closing.on('pageerror',e=>errors.push(e.message));
  await closing.route('**/js/live3d.js',async route=>{await new Promise(r=>setTimeout(r,200));await route.continue();});
  await closing.goto(url); await closing.locator('.manager-entry>summary').click();await closing.locator('#btnNew').waitFor();
  await closing.evaluate(async()=>{
    const {LiveView}=await import('/js/live.js');
    const root=document.createElement('div');document.body.appendChild(root);
    const lv=new LiveView(root,{home:'홈',away:'원정',colors:{home:'#427c33',away:'#cf3d46'},park:{},view:'three'});
    lv.destroy();
  });
  await closing.waitForTimeout(500);assert.equal(await closing.locator('.lv-three').count(),0);
  await closing.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: lazy loading, WebGL geometry, both cameras, 3D-only mode, resize, context loss, disposal, ignored legacy preference, real game finish, close during load');
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
