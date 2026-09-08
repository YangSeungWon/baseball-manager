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
  const page = await browser.newPage({ viewport:{ width:1440, height:1000 } });
  const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error(e.stack); });
  page.setDefaultTimeout(10000);
  await page.goto(url); await page.locator('.manager-entry>summary').click(); await page.locator('#btnNew').waitFor();
  await page.screenshot({ path:'/tmp/dugout-boot.png', fullPage:true });
  await page.locator('#btnNew').click(); await page.locator('#guidePlayer').click();
  await page.locator('#watchPlayer').click();
  assert.equal(await page.locator('#modalBody').getAttribute('role'), 'dialog');
  await page.keyboard.press('Escape');
  await page.locator('#guideLineup').click();
  await page.locator('#tabs button').filter({ hasText:/^홈$/ }).click();
  await page.screenshot({ path:'/tmp/dugout-home.png', fullPage:true });
  await page.locator('#tbActions button').filter({ hasText:'시즌 시작' }).click();
  await page.locator('#tbActions button').filter({ hasText:'이번 주' }).click();
  await page.locator('#wkOk').waitFor(); await page.locator('#wkOk').click();
  await page.reload(); await page.locator('#resumeMain').click();
  await page.locator('#tbActions button').filter({ hasText:'이번 주' }).click();
  await page.locator('#wkOk').waitFor(); await page.locator('#wkOk').click();
  await page.locator('#tbActions button').filter({ hasText:'시즌 끝까지' }).click();
  await page.locator('#simCancel').click();
  await page.waitForFunction(() => document.querySelector('#simCancel') === null || document.querySelector('#modal').hidden);
  if (await page.locator('#wkOk').isVisible()) await page.locator('#wkOk').click();
  // 모든 탭과 모바일 가로 넘침을 확인한다.
  for (const label of ['팀', '리그', '프런트', '역사', '홈']) {
    await page.locator('#tabs button').filter({ hasText:new RegExp(`^${label}$`) }).click();
  }
  await page.setViewportSize({ width:390, height:844 });
  await page.screenshot({ path:'/tmp/dugout-mobile.png', fullPage:true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, 'mobile home overflow');
  const mobile = await browser.newPage({ viewport:{ width:390, height:844 } });
  await mobile.goto(url); await mobile.locator('.manager-entry>summary').click(); await mobile.locator('#btnNew').waitFor();
  await mobile.screenshot({ path:'/tmp/dugout-mobile-boot.png', fullPage:true });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile boot overflow');
  await page.addInitScript(() => { const fixture = sessionStorage.getItem('test-fixture'); if (fixture !== null) { localStorage.setItem('dugout.save.v1', fixture); sessionStorage.removeItem('test-fixture'); } });
  // 오프시즌 드래프트까지 실제 엔진으로 진행한 저장본에서 상세/비교/지명을 확인한다.
  await page.evaluate(async () => {
    const { load, dump } = await import('/js/save.js');
    const g = load(await (await fetch('/data/league.json')).json());
    g.startSeason(); g.simToEnd(); g.runPostseason();
    for (let i = 0; i < 12 && g.state().phase !== 'off_draft'; i++) {
      const action = { off_rollover:'offseasonRollover', off_foreign:'finishForeign', off_post:'finishPosting', off_comp:'finishComps', off_fa:'resolveFA', off_trade:'resolveTrades' }[g.state().phase];
      if (!action) throw Error(g.state().phase); g[action]();
    }
    if (g.state().phase !== 'off_draft') throw Error('draft not reached');
    sessionStorage.setItem('test-fixture', JSON.stringify(dump(g)));
  });
  await page.reload(); await page.locator('#resumeMain').click();
  for (let i=0; i<2; i++) {
    await page.locator('#view table tbody tr').nth(i).click();
    await page.locator('#watchPlayer').click(); await page.keyboard.press('Escape');
  }
  await page.locator('[data-compare]').nth(0).check(); await page.locator('[data-compare]').nth(1).check();
  await page.locator('#compareWatch').click(); assert.equal(await page.locator('.compare-grid section').count(), 2);
  await page.keyboard.press('Escape');
  const beforeDraft = await page.evaluate(() => JSON.parse(localStorage.getItem('dugout.save.v1')).draft.n);
  await page.locator('#view table tbody tr').first().click(); await page.locator('#draftPlayer').click();
  await page.locator('#confirmDraft').click();
  await page.waitForFunction(before => JSON.parse(localStorage.getItem('dugout.save.v1')).draft.n > before, beforeDraft);
  assert.equal(await page.locator('#modal').isVisible(), false);
  // 잘못된 저장본을 열어도 원본을 삭제하지 않는다.
  await page.evaluate(() => sessionStorage.setItem('test-fixture', '{broken'));
  await page.reload(); await page.locator('#resumeMain').click(); await page.locator('#rawSave').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('dugout.save.v1')), '{broken');
  await page.keyboard.press('Escape');
  await page.locator('.manager-entry>summary').click(); await page.locator('#btnNew').click(); await page.locator('#confirmNew').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('dugout.save.recovery')), '{broken');
  assert.deepEqual(errors, [], 'browser errors');
  console.log('PASS: boot, guide, watch, modal, weekly sim, reload/resume, cancel, all tabs, mobile, draft comparison/pick, corrupt-save preservation');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
