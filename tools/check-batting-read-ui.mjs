// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tools/check-batting-read-ui.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve('web');
const server=createServer(async(req,res)=>{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}try{const b=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 for(const inputMode of ['touch','keyboard']){
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),errors=[];
 await page.addInitScript(()=>{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');localStorage.setItem('dugout.sfx','0');});
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.evaluate(async(inputMode)=>{
  const {Live3D}=await import('/js/live3d.js'),{BattingGame}=await import('/js/batting-game.js');
  const render=Live3D.prototype.render,decide=BattingGame.prototype.decidePitch;
  window.readFrames=[];window.decisions=[];window.readSwing=false;
  BattingGame.prototype.decidePitch=function(...args){decisions.push(args[0]);return decide.apply(this,args);};
  // Inspect consecutive rendered frames inside the browser. The entire flight lasts
  // about 400 ms, so a test-driver wait of 500 ms misses it even on a healthy UI.
  Live3D.prototype.render=function(...args){
   const result=render.apply(this,args),S=args[0],el=document.querySelector('.flight-read');
   if(el&&!el.hidden&&S.battingDecision&&!readSwing){
    const box=el.getBoundingClientRect();
    readFrames.push({width:box.width,clarity:S.pitchRead.clarity,x:box.x,y:box.y,dockHidden:getComputedStyle(document.querySelector('.inning-controls')).display==='none'});
    if(readFrames.length>=2&&readFrames.at(-1).width<readFrames[0].width){
     readSwing=true;const r=this.canvas.getBoundingClientRect(),init={bubbles:true,button:0,pointerId:7,pointerType:'touch',clientX:r.x+r.width/2,clientY:r.y+r.height/2};
     if(inputMode==='touch'){
      this.canvas.dispatchEvent(new PointerEvent('pointerdown',init));
      this.canvas.dispatchEvent(new PointerEvent('pointerup',init));
     }else{
      this.canvas.focus();
      this.canvas.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:' ',code:'Space'}));
      this.canvas.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:' ',code:'Space'}));
     }
    }
   }
   return result;
  };
  const {openInningMode}=await import('/js/inning-mode.js');openInningMode('batter',7);
 },inputMode);
 await page.locator('.match-enter:not([disabled])').waitFor({timeout:60000});await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'));
 await page.locator('.match-enter').dispatchEvent('click');
 await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});
 await page.clock.fastForward(1600);
 for(let i=0;i<80&&!(await page.evaluate(()=>decisions.length));i++)await page.clock.runFor(16);
 const frames=await page.evaluate(()=>readFrames);
 assert.ok(frames.length>=2,'observe multiple actual flight frames');
 assert.ok(frames.at(-1).width<frames[0].width,'focus tightens around the observed ball');
 assert.ok(frames.every(f=>f.dockHidden),'the plan panel never obscures the flight');
 assert.equal(await page.locator('.zone-read-estimate,.zone-read-kind,.batting-swing').count(),0,'no obsolete prediction or swing button');
 assert.deepEqual(await page.evaluate(()=>decisions),['swing'],'touch release swings during the actual pitch');
 assert.equal(await page.locator('.flight-read').isVisible(),false,'read cue ends with the decision');
 await page.locator('.inning-exit').dispatchEvent('click');assert.deepEqual(errors,[]);
 console.log(`PASS: ${inputMode} release swings once during real-time flight, cue clears`);
 await page.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
