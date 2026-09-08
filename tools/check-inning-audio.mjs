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
  const page=await browser.newPage({viewport:{width:320,height:568}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await page.evaluate(async()=>{
    const {Sfx}=await import('/js/sfx.js');window.audioInstances=[];window.audioCues=[];
    const enable=Sfx.prototype.enable,stadium=Sfx.prototype.stadium;
    Sfx.prototype.enable=function(on){if(!audioInstances.includes(this))audioInstances.push(this);return enable.call(this,on);};
    Sfx.prototype.stadium=function(cue,k){audioCues.push(cue);return stadium.call(this,cue,k);};
  });
  for(const entry of ['#btnInning','#btnBatting']) {
    await page.locator(entry).click();
    assert.equal(await page.locator('.inning-sound').getAttribute('aria-pressed'),'true');
    await page.waitForFunction(()=>audioInstances.at(-1).ctx.state==='running');
    assert.equal(await page.evaluate(()=>audioInstances.at(-1).crowdVoices.length),0,'stadium bed has no sustained pitched oscillators');
    for(const cls of ['.inning-sound','.inning-exit']){const box=await page.locator(cls).boundingBox();assert.ok(box.height>=44&&box.x+box.width<=320);}
    await page.locator('.inning-throw').click();
    await page.waitForFunction(()=>audioCues.includes('pitch'));
    await page.locator('.inning-sound').click();
    await page.waitForFunction(()=>audioInstances.at(-1).master.gain.value<.01);
    assert.equal(await page.evaluate(()=>audioInstances.at(-1).on),false);
    await page.locator('.inning-sound').click();
    await page.waitForFunction(()=>!document.querySelector('.inning-picks').disabled||!document.querySelector('.inning-result').hidden,{},{timeout:30000});
    assert.ok(await page.evaluate(()=>audioCues.length>=4));
    await page.locator('.inning-sound').click();
    await page.locator('.inning-exit').click();
    assert.equal(await page.evaluate(()=>audioInstances.at(-1).ctx),null);
    assert.equal(await page.evaluate(()=>audioInstances.at(-1).stadiumTimer),null);
    await page.locator(entry).click();
    assert.equal(await page.locator('.inning-sound').getAttribute('aria-pressed'),'false');
    await page.locator('.inning-sound').click();
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>audioInstances.at(-1).master.gain.value<.01);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>audioInstances.at(-1).master.gain.value>.8);
    assert.ok(await page.evaluate(()=>audioInstances.at(-1).stadiumTimer));
    // Exercise every sound envelope against an actual AudioContext.
    await page.evaluate(()=>{const s=audioInstances.at(-1);for(const cue of ['contact','cheer','groan','foul','pitch','idle'])s.stadium(cue,1);});
    await page.locator('.inning-exit').click();
  }
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS: real AudioContext, pitch cues, fullscreen mute, all reaction envelopes, remembered sound, close/reopen cleanup, 320px header');
} finally {await browser.close();await new Promise(r=>server.close(r));}
