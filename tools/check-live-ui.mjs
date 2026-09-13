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
const browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_PATH ? { executablePath:process.env.CHROMIUM_PATH } : {}) });
try {
  const errors = [];
  for (const [width,height] of [[390,844],[320,568],[844,390],[1440,1000]]) {
    const page = await browser.newPage({ viewport:{width,height} });await page.addInitScript(()=>{try{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');}catch{}});
    page.on('pageerror', e => {errors.push(e.message);console.error(e.stack)});
    await page.goto(url); await page.locator('.manager-entry>summary').click(); await page.locator('#btnNew').click(); await page.locator('#guidePlay').click();
    const start = page.locator('.lv-pre-go'); await start.waitFor();
    const pos = await start.boundingBox(); assert.ok(pos.y >= 0 && pos.y+pos.height <= height, 'playball visible '+width);
    if(width===390) await page.screenshot({path:'/tmp/dugout-live-pre.png'});
    await start.click();
    await page.waitForFunction(() => document.querySelector('.lv-mgr').hidden === false);
    await page.locator('.lv-pause').click();
    if(width<=900) {
      assert.equal(await page.locator('.lv-mgr').isVisible(),false,'manager collapsed');
      assert.equal(await page.locator('.lv-pl').isVisible(),false,'stats collapsed');
      assert.equal(await page.locator('.lv-tools').isVisible(),false,'settings collapsed');
      const bar = await page.locator('.lv-bar').boundingBox(); assert.ok(bar.y+bar.height<=height,'controls visible '+width);
      assert.equal(await page.evaluate(() => document.querySelector('#modalBody').scrollWidth > innerWidth),false,'horizontal overflow');
      if(width===390) await page.screenshot({path:'/tmp/dugout-live-mobile.png'});
      await page.locator('.lv-manager-details summary').click();
      assert.equal(await page.locator('.lv-mgr').isVisible(),true);
      await page.locator('.lv-record-details summary').click();
      await page.waitForFunction(() => !document.querySelector('.lv-manager-details').open);
      assert.equal(await page.locator('.lv-pl').isVisible(),true);
      await page.locator('.lv-record-details summary').click();
      await page.locator('.lv-mobile-speed select').selectOption('4');
      assert.equal(await page.evaluate(() => localStorage.getItem('dugout.speed')),'4');
    } else {
      assert.equal(await page.locator('.lv-pl').isVisible(),true);
      assert.equal(await page.locator('.lv-mobile-details').first().isVisible(),false);
    }
    // paused 상태에서 결과로 넘어가도 하루를 끝낼 수 있어야 한다.
    await page.locator('.lv-end').click();
    await page.locator('#gsDone').waitFor({timeout:15000});
    if(width<=900) assert.equal(await page.locator('.gs-box').isVisible(),false,'boxscore collapsed');
    await page.locator('#gsDone').click();
    await page.close();
  }
  const decision = await browser.newPage({viewport:{width:320,height:568}});await decision.addInitScript(()=>{try{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');}catch{}});
  decision.on('pageerror', e => errors.push(e.message));
  await decision.goto(url); await decision.locator('.manager-entry>summary').click(); await decision.locator('#btnNew').waitFor();
  await decision.evaluate(async () => {
    const { LiveView } = await import('/js/live.js');
    document.querySelector('#boot').hidden = true;
    document.querySelector('#modal').hidden = false; document.querySelector('#modal').classList.add('full');
    document.querySelector('#modalBody').innerHTML = '<div class="gs"><div class="gs-top"><button>구단으로</button></div><div class="gs-body" id="liveTest"></div></div>';
    const lv = window.liveTestView = new LiveView(document.querySelector('#liveTest'), {
      home:'전주 재규어스',away:'대구 나이츠',colors:{home:'#427c33',away:'#cf3d46'},park:{},speed:1,command:() => {},
    });
    lv.side = {mine:'def',cur:{name:'김선발',np:91,tired:62},pen:[{pid:1,name:'김구원',slot:'마무리'}],shift:0}; lv._mgr();
    lv.tl = {t:0,over:false,step(t){this.t=t},finish(){this.over=true}};
  });
  await decision.locator('.lv-manager-details summary').click();
  await decision.waitForFunction(() => window.liveTestView.panelPaused);
  const frozen = await decision.evaluate(() => window.liveTestView.tl.t);
  await decision.waitForTimeout(100);
  assert.equal(await decision.evaluate(() => window.liveTestView.tl.t),frozen,'expanded manager pauses playback');
  await decision.locator('.lv-manager-details summary').click();
  await decision.waitForFunction(t => window.liveTestView.tl.t > t, frozen);
  await decision.evaluate(() => {
    const lv = window.liveTestView;
    lv.ask('<div class="clutch"><div class="gs-q">투수를 바꿀까</div><p class="clutch-situation">8회 말 · 1아웃</p><p class="mq">김선발이 91구를 던졌습니다. 주자는 1·3루에 있습니다.</p><div class="mopts"><button>김구원 · 마무리</button><button>이구원 · 필승조</button><button>박구원 · 롱릴리프</button><button id="keepPitcher">계속 간다</button></div></div>');
    document.querySelector('#keepPitcher').onclick = () => lv.unask();
  });
  assert.equal(await decision.locator('.lv-main').evaluate(e => e.inert),true);
  for (const button of await decision.locator('.lv-ask button').all()) {
    const rect = await button.boundingBox(); assert.ok(rect.y >= 0 && rect.y+rect.height <= 568, 'decision button visible');
    assert.ok(rect.height>=44, 'decision touch target');
  }
  await decision.screenshot({path:'/tmp/dugout-live-decision.png'});
  await decision.setViewportSize({width:1440,height:1000});
  await decision.waitForFunction(() => !document.querySelector('.lv-main').inert);
  await decision.locator('#keepPitcher').click();
  assert.equal(await decision.locator('.lv-ask').isVisible(),false);
  await decision.evaluate(() => window.liveTestView.destroy()); await decision.close();
  assert.deepEqual(errors, []);
  console.log('PASS: 320/390 portrait, 844 landscape, desktop; playball, controls, disclosures, speed, finish, panel pause/resume, decision targets, resize');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
