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
 const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];await page.addInitScript(()=>{try{localStorage.setItem('dugout.coach.v1','{"batter":true,"pitcher":true}');}catch{}});page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);
 const model=await page.evaluate(async()=>{
  const T=await import('/vendor/three/three.module.min.js');const {loadPlayerModel,createPlayerFactory}=await import('/js/player-model.js');await loadPlayerModel();
  const make=createPlayerFactory(),scene=new T.Scene();scene.background=new T.Color('#18333e');
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1200,900);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.body.replaceChildren(renderer.domElement);
  scene.add(new T.HemisphereLight('#fff3dc','#52656d',2.5));const light=new T.DirectionalLight('#fff1d6',3);light.position.set(2,5,4);scene.add(light);
  const a=make('bat','#cf7756'),b=make('fP','#427c83');a.root.position.x=-.65;b.root.position.x=.65;b.root.rotation.y=Math.PI*.85;scene.add(a.root,b.root);a.bat.visible=true;a.glove.visible=false;b.bat.visible=false;
  const camera=new T.PerspectiveCamera(40,1200/900,.1,30);camera.position.set(2.7,2.2,5.5);camera.lookAt(0,1.3,0);
  renderer.render(scene,camera);window.preview={a,b,scene,renderer,camera};
  let skins=0,bones=0;a.root.traverse(o=>{if(o.isSkinnedMesh)skins++;if(o.isBone)bones++;});
  return {skins,bones,helmet:a.helmet.visible,cap:b.cap.visible,independent:a.arms[0]!==b.arms[0]};
 });
 assert.ok(model.skins>=1&&model.bones>=15&&model.helmet&&model.cap&&model.independent);
 const cache=await page.evaluate(async()=>{
  const {setPlayerFirstPerson}=await import('/js/player-model.js'),p=preview.a;
  setPlayerFirstPerson(p,false);if(p.firstPersonMeshes)throw Error('full-body view eagerly built first-person geometry');
  setPlayerFirstPerson(p,true);let sharedBytes=0;
  const geometries=p.firstPersonMeshes.map(o=>{
   const full=o.userData.fullBodyGeometry,first=o.geometry;
   if(first.index.count>=full.index.count)throw Error('first-person mesh includes full body');
   for(const [key,attribute] of Object.entries(full.attributes)){if(first.attributes[key]!==attribute)throw Error('vertex buffer was duplicated');sharedBytes+=attribute.array.byteLength;}
   return first;
  });
  let walks=0;const traverse=p.root.traverse;p.root.traverse=function(...args){walks++;return traverse.apply(this,args);};
  for(let i=0;i<600;i++)setPlayerFirstPerson(p,true);
  setPlayerFirstPerson(p,false);if(!p.head.visible||p.firstPersonMeshes.some(o=>o.geometry!==o.userData.fullBodyGeometry))throw Error('full-body restoration failed');
  setPlayerFirstPerson(p,true);if(p.firstPersonMeshes.some((o,i)=>o.geometry!==geometries[i]))throw Error('view switch rebuilt geometry');
  p.root.traverse=traverse;setPlayerFirstPerson(p,false);
  return {sharedBytes,repeatedHierarchyWalks:walks};
 });assert.equal(cache.repeatedHierarchyWalks,0);assert.ok(cache.sharedBytes>0);console.log('First-person cache:',cache);
 await page.screenshot({path:'/tmp/dugout-player-model.png'});
 const face=await page.evaluate(async()=>{
  const {posePlayerFace}=await import('/js/player-model.js');const {a,b,scene,renderer,camera}=preview;b.root.visible=false;a.root.position.set(0,0,0);a.root.rotation.set(0,0,0);
  const open=a.faceNodes.eyes[0].scale.y,blinkAt=(4.3-(a.idleSeed*.37)%4.3+.05)%4.3;posePlayerFace(a,'focus',blinkAt,.8,-.5);
  const closed=a.faceNodes.eyes[0].scale.y,moved=a.faceNodes.pupils[0].position.distanceTo(a.faceNodes.pupils[0].userData.rest.position);
  posePlayerFace(a,'focus',1,.4,-.2);camera.position.set(0,2.30,1.5);camera.lookAt(0,2.32,0);renderer.render(scene,camera);return {open,closed,moved,nodes:Object.values(a.faceNodes).flat().filter(Boolean).length};
 });
 assert.ok(face.nodes>=9&&face.closed<face.open*.15&&face.moved>.002,'facial rig blinks and tracks gaze');
 await page.screenshot({path:'/tmp/dugout-player-face-focus.png'});
 await page.evaluate(async()=>{const {posePlayerFace}=await import('/js/player-model.js');posePlayerFace(preview.a,'joy',1,0,0);preview.renderer.render(preview.scene,preview.camera);});
 await page.screenshot({path:'/tmp/dugout-player-face-joy.png'});
 await page.evaluate(()=>{const {a,scene,renderer,camera}=preview;a.arms[1].rotation.x=-1.3;a.elbows[1].rotation.x=-1;a.legs[0].rotation.x=-.6;a.knees[0].rotation.x=1.1;renderer.render(scene,camera);});
 await page.screenshot({path:'/tmp/dugout-player-joints.png'});
 const poses=await page.evaluate(async()=>{
  const T=await import('/vendor/three/three.module.min.js');const {Live3D}=await import('/js/live3d.js');
  const {a,b,scene,renderer,camera}=preview;
  const driver={player:key=>key==='bat'?a:b,reducedMotion:true,animationTime:0};
  const state={swing:0,pitcherWind:0,ball:null};let maxGripGap=0;
  for(const handed of ['R','L'])for(const swing of [0,.25,.5,.75,1]){
   state.swing=swing;Live3D.prototype.updatePlayer.call(driver,'bat',{x:-.65,y:0,hand:handed},'#cf7756','bat',state);
   a.root.updateMatrixWorld(true);
   const rear=handed==='R'?0:1,front=1-rear;
   maxGripGap=Math.max(maxGripGap,a.hands[rear].localToWorld(new T.Vector3(0,-.075,0)).distanceTo(a.hands[front].getWorldPosition(new T.Vector3())));
  }
  state.swing=0;Live3D.prototype.updatePlayer.call(driver,'bat',{x:-.65,y:0,hand:'R'},'#cf7756','bat',state);
  state.pitcherWind=.55;Live3D.prototype.updatePlayer.call(driver,'fP',{x:.65,y:0},'#427c83','pitch',state);
  a.root.rotation.y=.3;b.root.rotation.y=-.3;renderer.render(scene,camera);
  return {maxGripGap};
 });
 assert.ok(poses.maxGripGap<.01,'both hands stay together through right- and left-handed swings');
 await page.screenshot({path:'/tmp/dugout-player-poses.png'});
 const leather=await page.evaluate(()=>{
  const {a,b,scene,renderer,camera}=preview;a.root.visible=b.root.visible=false;
  const glove=b.glove.clone(true);glove.position.set(0,0,0);glove.rotation.set(0,0,0);scene.add(glove);
  camera.position.set(.22,.10,.72);camera.lookAt(0,-.06,0);renderer.render(scene,camera);
  let grain=false;glove.traverse(o=>{if(o.material?.name==='Leather')grain=!!o.material.map&&!!o.material.normalMap;});return grain;
 });
 assert.ok(leather,'leather grain and normal maps are embedded in the GLB');
 await page.screenshot({path:'/tmp/dugout-glove-detail.png'});
 await page.goto(url+'/?challenge=b6-0-42');await page.evaluate(()=>localStorage.setItem('dugout.sfx','0'));
 await page.locator('#btnBatting').click();await page.locator('.match-enter:not([disabled])').click();await page.locator('.lv-mobile-speed select').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('change'));});await page.waitForFunction(()=>document.querySelector('.inning-picks')?.disabled===false);
 await page.screenshot({path:'/tmp/dugout-player-game.png'});
 await page.locator('.pitcher-tag').click();assert.equal(await page.locator('.pitcher-details').isVisible(),true);await page.keyboard.press('Escape');
 await page.locator('.inning-exit').click();assert.equal(await page.locator('.lv-three').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: Blender skinned mesh, independent skeletons, equipment, joint poses, game loading, pitcher tag and cleanup');
} finally {await browser.close();await new Promise(r=>server.close(r));}
