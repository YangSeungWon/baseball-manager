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
  for(const [width,height] of [[320,568],[390,844],[844,390],[1440,1000]]) {
    const page=await browser.newPage({viewport:{width,height}});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.evaluate(()=>localStorage.setItem('dugout.sfx','0'));
    await page.locator('#btnBatting').click();await page.locator('.lv-three').waitFor({state:'visible'});await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
    await page.locator('.inning-batter-entry').waitFor({state:'visible'});
    assert.match(await page.locator('.inning-batter-entry').textContent(),/직구/);
    await page.waitForFunction(()=>document.querySelector('.inning-batter-entry').textContent.includes('선구')&&document.querySelector('.inning-batter-entry').textContent.includes('참기'));
    await page.locator('.inning-batter-entry').waitFor({state:'visible'});
    await page.screenshot({path:`/tmp/dugout-entry-${width}.png`});
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled);
    await page.locator('.pitcher-tag').waitFor({state:'visible'});
    const tag=await page.locator('.pitcher-tag').boundingBox();assert.ok(tag.height>=44&&tag.x>=0&&tag.x+tag.width<=width&&tag.y>=0);
    await page.locator('.pitcher-tag').click();
    assert.equal(await page.locator('.pitcher-details').isVisible(),true);
    assert.equal(await page.locator('.pitcher-repertoire>div').count(),3);
    assert.equal(await page.locator('.pitcher-repertoire strong').evaluateAll(ns=>ns.reduce((sum,n)=>sum+parseInt(n.textContent),0)),100);
    const details=await page.locator('.pitcher-details').boundingBox();assert.ok(details.x>=0&&details.x+details.width<=width&&details.y>=0&&details.y+details.height<=height);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.pitcher-details').isVisible(),false);assert.equal(await page.locator('.inning-mode').count(),1);
    await page.locator('.scout-toggle').click();
    assert.equal(await page.locator('.scout-field [data-position]').count(),9);
    assert.equal(await page.locator('.scout-runners>div').count(),3);
    const scout=await page.locator('.scout-panel').boundingBox();assert.ok(scout.x>=0&&scout.y>=0&&scout.x+scout.width<=width&&scout.y+scout.height<=height);
    await page.screenshot({path:`/tmp/dugout-scout-${width}.png`});
    await page.keyboard.press('Escape');assert.equal(await page.locator('.scout-panel').isVisible(),false);assert.equal(await page.locator('.inning-mode').count(),1);
    await page.locator('.inning-diamond').click();assert.equal(await page.locator('.scout-panel').isVisible(),true);
    await page.getByRole('button',{name:'선수 정보 닫기'}).click();
    const stage=await page.locator('.lv-three').boundingBox();assert.ok(Math.abs(stage.width-width)<2&&Math.abs(stage.height-height)<2);
    assert.equal(await page.locator('.inning-controls').isVisible(),true);
    assert.equal(await page.locator('.inning-feedback').textContent(),'');
    assert.equal(await page.locator('.inning-throw').textContent(),'준비 완료');
    assert.equal(await page.locator('.inning-controls .inning-opponent').count(),0);
    assert.equal(await page.locator('.inning-presentation>.inning-opponent').isVisible(),true);
    const panel=await page.locator('.inning-controls').boundingBox();
    for(const b of await page.locator('.inning-picks button').all()){
      const r=await b.boundingBox();assert.ok(r.height>=44&&r.y>=panel.y&&r.y+r.height<=panel.y+panel.height&&r.x>=0&&r.x+r.width<=width,'all choices visible and touch sized');
    }
    assert.equal(await page.locator('.inning-goal,.inning-rule,.inning-choice-note,.inning-zone-caption').count(),0);
    assert.equal(await page.locator('.inning-diamond .occupied').count(),2);
    assert.equal(await page.locator('.inning-counts i.out.lit').count(),1);
    for(const cls of ['.inning-sound','.inning-exit','.inning-look','.batting-swing','.batting-take','.inning-throw']){const b=await page.locator(cls).boundingBox();assert.ok(b.height>=44&&b.x>=0&&b.x+b.width<=width&&b.y+b.height<=height);}
    assert.equal(await page.evaluate(()=>document.querySelector('.inning-mode').scrollWidth>innerWidth),false);
    await page.screenshot({path:`/tmp/dugout-hud-${width}.png`});
    await page.locator('[data-group="target"] [data-value="FF"]').click();
    assert.equal(await page.locator('[data-group="target"] [data-value="FF"]').getAttribute('aria-pressed'),'true');
    await page.screenshot({path:`/tmp/dugout-plan-${width}.png`});
    await page.locator('.batting-take').click();
    await page.locator('.inning-throw').click();await page.locator('.is-deciding .batting-decision').waitFor();
    assert.equal(await page.locator('.pitcher-tag').isVisible(),false);assert.equal(await page.locator('.pitcher-details').isVisible(),false);
    const mobile=width<=900||height<=500;
    assert.equal(await page.locator('.inning-controls').isVisible(),!mobile);
    assert.equal(await page.locator('.inning-compact-plan').isVisible(),false);
    assert.equal(await page.locator('.inning-live-zone.is-reading-pitch').isVisible(),true);
    assert.equal(await page.locator('.inning-throw').isVisible(),!mobile);
    if(mobile)for(const name of ['swing','take']){const b=await page.locator('.batting-'+name).boundingBox();assert.ok(b.height>=48&&b.width>=80);}
    await page.screenshot({path:`/tmp/dugout-decision-${width}.png`});
    await page.locator('.batting-take').click();
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled||!document.querySelector('.inning-result').hidden,{},{timeout:30000});
    assert.ok((await page.locator('.lv-three').boundingBox()).height>=height-1);
    await page.locator('.inning-exit').click();await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: always-fullscreen ballpark, BSO and runners, minimal HUD, 44px controls, persistent choices and separate pitcher identity, pitch decision on mobile/landscape/desktop');
} finally {await browser.close();await new Promise(r=>server.close(r));}
