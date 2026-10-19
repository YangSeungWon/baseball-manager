import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('web');
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + '/')) {res.writeHead(403).end(); return;}
  try {res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[extname(path)] || 'application/octet-stream'); res.end(await readFile(path));}
  catch {res.writeHead(404).end();}
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  for (const [width,height,touch] of [[320,568,true],[390,844,true],[844,390,true],[1440,1000,false]]) {
    const page = await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'));
    const activate = async selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
    await activate('#btnQuick');
    await page.locator('.quick-start').waitFor();
    await page.evaluate(async () => {
      const {QuickGame} = await import('/js/quick-game.js');
      const resolve = QuickGame.prototype.resolve;
      window.quickResults = [];
      QuickGame.prototype.resolve = function (...args) {
        window.quickPitches = this.pitches;
        const result = resolve.apply(this, args); window.quickResults.push(result); return result;
      };
    });
    const fits = async () => {
      const bounds = await page.locator('.quick-mode button').evaluateAll(es => es.filter(e => e.getClientRects().length).map(e => {
        const r=e.getBoundingClientRect(), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return {text:e.textContent,fit:r.left>=0&&r.top>=0&&r.right<=innerWidth+.5&&r.bottom<=innerHeight+.5, reachable:e.disabled||hit===e||e.contains(hit),h:r.height};
      }));
      for (const b of bounds) {assert.ok(b.fit, JSON.stringify(b));assert.ok(b.reachable,JSON.stringify(b));assert.ok(b.h>=44,JSON.stringify(b));}
    };
    await fits();
    await activate('.quick-start');
    const advanceToPitch = async () => {
      for (let i=0;i<150;i++) {
        if(await page.locator('.quick-swing').isEnabled()) return;
        await page.clock.runFor(16);
      }
      throw new Error('Pitch did not start');
    };
    await advanceToPitch();
    await page.clock.runFor(1240);
    await page.screenshot({path:`/tmp/dugout-quick-play-${width}.png`});
    if(touch) await page.touchscreen.tap(width/2, height*.6); else await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>quickResults.length),1,'one action must resolve exactly one pitch');
    assert.equal(await page.evaluate(()=>quickResults[0].kind),'perfect','timing is judged at input time');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>quickResults.length),1,'feedback must ignore another swing');
    await advanceToPitch();
    if(touch) await activate('.quick-pause');
    else {await page.locator('.quick-pause').focus();await page.keyboard.press('Space');}
    assert.equal(await page.locator('.quick-resume').isVisible(),true,'Space activates a focused menu button instead of swinging');
    await page.clock.runFor(5000);
    assert.equal(await page.evaluate(()=>quickResults.length),1,'paused time cannot consume a pitch');
    await fits();
    await activate('.quick-resume');
    const pitches = await page.evaluate(()=>quickPitches);
    for(let i=1;i<10;i++) {
      await advanceToPitch();
      if(pitches[i].strike) {
        await page.clock.runFor(pitches[i].flight-10);
        if(touch) await activate('.quick-swing'); else await page.keyboard.press('Space');
      } else await page.clock.runFor(pitches[i].flight+170);
      assert.equal(await page.evaluate(()=>quickResults.length),i+1);
    }
    await page.clock.runFor(1100);
    await page.locator('.quick-retry').waitFor();
    assert.equal(await page.locator('.quick-points').textContent(),'2,450');
    await fits();
    await page.screenshot({path:`/tmp/dugout-quick-result-${width}.png`});
    await activate('.quick-retry');
    assert.equal(await page.locator('.quick-points').textContent(),'0');
    await advanceToPitch(); await page.clock.runFor(1240);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>quickResults.length),11,'replay retains only one input handler');
    await activate('.quick-exit');
    assert.equal(await page.locator('.quick-mode').count(),0);
    assert.equal(await page.locator('#boot').evaluate(e=>e.inert),false);
    await activate('#btnQuick');
    assert.equal(await page.locator('.quick-best').textContent(),'최고 2,450');
    await page.keyboard.press('Escape');
    await page.screenshot({path:`/tmp/dugout-quick-home-${width}.png`,fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}×${height}: touch/Space, complete round, pause, retry, persistence and layout`);
    await page.close();
  }
} finally {await browser?.close();await new Promise(r=>server.close(r));}
