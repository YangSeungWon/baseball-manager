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
 const page=await browser.newPage();await page.goto(url);
 const result=await page.evaluate(async()=>{
  const {Sfx}=await import('/js/sfx.js');const s=new Sfx();s.stadiumOnly=true;s.enable(true);await s.ctx.resume();s.crowd(.8);s.setChant('김도윤',1);
  const timer=s.stadiumTimer,chant=s.chant,chantTimer=chant.timer;s.stadium('pitch');const preserved=s.stadiumTimer===timer&&s.chant===chant&&chant.timer===chantTimer;
  const active=chant.nodes.size;await new Promise(r=>setTimeout(r,100));s.stadium('contact');const afterContact=chant.resumeAt>s.ctx.currentTime+2&&chant.step===0;
  s.setChant('박시우',2);const changed=s.chant.pattern.key==='박시우:2';s.mute(true);const muted=!s.chant.timer;s.mute(false);s.stadium('pitch');const resumed=!!s.chant.timer;
  s.enable(false);const stopped=!s.chant.timer&&!s.stadiumTimer;s.destroy();const cleaned=chant.nodes.size===0&&s.ctx===null;
  const {TerraceChant}=await import('/js/terrace-chant.js');const c=new OfflineAudioContext(2,48000*3,48000),noise=c.createBuffer(1,48000*2,48000);const d=noise.getChannelData(0);let n=0;for(let i=0;i<d.length;i++){n=n*.85+(Math.random()*2-1)*.15;d[i]=n;}
  const voice=new TerraceChant(c,c.destination,noise);voice.call(.05,'o',.3,false);voice.call(.55,'a',.35,true);voice.call(1.2,'a',.55,true);const rendered=await c.startRendering();let peak=0,energy=0,diff=0;for(let ch=0;ch<2;ch++){const a=rendered.getChannelData(ch);for(let i=0;i<a.length;i++){peak=Math.max(peak,Math.abs(a[i]));energy+=a[i]*a[i];if(i)diff+=(a[i]-a[i-1])**2;}}
  return {preserved,active,afterContact,changed,muted,resumed,stopped,cleaned,peak,rms:Math.sqrt(energy/(rendered.length*2)),roughness:diff/energy};
 });
 for(const key of ['preserved','afterContact','changed','muted','resumed','stopped','cleaned'])assert.equal(result[key],true,key);
 assert.ok(result.active>0&&result.active<40);assert.ok(result.peak<.9&&result.rms>.002);assert.ok(result.roughness<.1);console.log('PASS: chant continuity, contact cancellation, new batter, mute/resume/dispose, rendered level and high-frequency energy',result);
} finally {await browser.close();await new Promise(r=>server.close(r));}
