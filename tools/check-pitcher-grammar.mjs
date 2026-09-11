import test from 'node:test';
import assert from 'node:assert/strict';
import {RULE_POOL,grammarFor,applyGrammar,adjustGrammar,observedChart,tellLabel} from '../web/js/pitcher-grammar.js';
import {FullGame,RELIEVER} from '../web/js/full-game.js';
import {deliverPitch,inStrikeZone} from '../web/js/batting-game.js';
import {BATTING} from '../web/js/batting-tuning.js';
const pitcher={name:'x',style:'y',fast:.4,speedOffset:0};
const ctx=(o={})=>({balls:0,strikes:0,bases:[false,false,false],inning:1,outs:0,last:null,history:[],...o});
const rollWith=(o={})=>{const r=Array(10).fill(.5);for(const k in o)r[k]=o[k];return r;};
const choice={target:'any',approach:'contact',action:'swing',location:'any'};

test('a seed always yields the same grammar; different seeds and arms differ; each arm has selection rules plus one tell',()=>{
  assert.deepEqual(grammarFor(42,0),grammarFor(42,0));assert.notDeepEqual(grammarFor(42,0).rules,grammarFor(43,0).rules);assert.notDeepEqual(grammarFor(42,0).rules,grammarFor(42,1).rules);
  const g=grammarFor(7,0);assert.equal(g.rules.length,BATTING.grammar.rulesPerArm);assert.ok(RULE_POOL.find(r=>r.id===g.tell).kind==='tell');
  assert.ok(g.spare.length>0&&!g.spare.some(id=>g.rules.includes(id)));
});
test('rules fire at their consistency, only when their condition holds, and leave the seeded pitch untouched otherwise',()=>{
  const g={rules:['two-strike-away'],spare:[],tell:null,adjusted:[]};
  const base=deliverPitch(pitcher,{},rollWith({0:.1,1:.1,7:.2}));
  const idle=applyGrammar(g,pitcher,ctx({strikes:1}),rollWith({0:.1,1:.1,7:.2,8:.1}),base);assert.equal(idle.ruleId,null);assert.deepEqual(idle.pitch,base);
  let fired=0;const N=2000;
  for(let i=0;i<N;i++){const r=applyGrammar(g,pitcher,ctx({strikes:2}),rollWith({0:.1,1:.1,7:.2,8:(i+.5)/N}),base);if(r.ruleId){fired++;assert.ok(['SL','CH'].includes(r.pitch.t));assert.ok(!inStrikeZone(r.pitch.x,r.pitch.z)&&r.pitch.x>0);}}
  assert.ok(Math.abs(fired/N-.85)<.02,'fires at consistency');
});
test('glove tell is honest at its reliability and never changes the pitch',()=>{
  const g={rules:[],spare:[],tell:'glove-tell',adjusted:[]};let honest=0;const N=1000;
  for(let i=0;i<N;i++){const base=deliverPitch(pitcher,{},rollWith({7:.8}));const r=applyGrammar(g,pitcher,ctx(),rollWith({7:.8,9:(i+.5)/N}),base);assert.deepEqual(r.pitch,base);if(Math.sign(r.tell.x)===Math.sign(base.x))honest++;}
  assert.ok(Math.abs(honest/N-.8)<.02);assert.match(tellLabel({kind:'glove',x:.6,z:-.7}),/바깥쪽 낮게/);assert.match(tellLabel({kind:'tempo',slow:true}),/느림/);
});
test('the full game replays identically per seed, changes pitchers in the bullpen inning, and swaps a rule after two hits off it',()=>{
  const play=(seed,log)=>{const g=new FullGame(seed);while(!g.done){if(g.half==='top')g.pitch({type:'FF',zone:'out',intent:'attack',release:0});else{const e=g.pitch({...choice,action:g.count%3?'swing':'take'});log?.push([e.pitch.t,e.pitch.x,e.pitch.z,e.ruleId,e.result]);}if(!g.done&&g.outs>=3)g.advanceHalf();}return g;};
  const a=[],b=[];const ga=play(11,a),gb=play(11,b);assert.deepEqual(a,b);assert.ok(a.length>30);
  assert.ok(a.some(x=>x[3]),'some pitches come from a rule');
  assert.equal(ga.arms[1].name,RELIEVER.name);
  const inn=new FullGame(3);for(let i=0;i<12;i++){inn.outs=3;inn.advanceHalf();}assert.equal(inn.inning,7);assert.equal(inn.half,'top');assert.equal(inn.armIndex,0);inn.outs=3;inn.advanceHalf();assert.equal(inn.armIndex,1);assert.equal(inn.pitcher.name,RELIEVER.name);assert.equal(inn.snapshot().pitcherChanged,true);
  const g=new FullGame(5);g.outs=3;g.advanceHalf();const rule=g.pitcher.grammar.rules[0];
  let adjusted=null,tries=0;while(!adjusted&&tries++<400){const e=g.pitch(choice);if(e.adjusted)adjusted=e;if(g.outs>=3){g.outs=0;}if(g.done)break;}
  assert.ok(adjusted,'a rule gets swapped eventually');assert.ok(adjusted.adjusted.dropped&&adjusted.adjusted.added);assert.equal(g.pitcher.grammar.adjusted.length,1);
  assert.equal(g.pitcher.grammar.rules.length,BATTING.grammar.rulesPerArm);
});
test('delivery ignores the batter choice and the observation chart counts only what was seen',()=>{
  const a=new FullGame(9),b=new FullGame(9);a.outs=3;a.advanceHalf();b.outs=3;b.advanceHalf();
  for(let i=0;i<20;i++){const pa=a.preparePitch({target:'any',approach:'contact',location:'any'}),pb=b.preparePitch({target:'CH',approach:'power',location:'low'});assert.deepEqual(pa,pb);a.decidePitch('take');b.decidePitch('take');if(a.outs>=3){a.outs=b.outs=0;}}
  const c=observedChart(a.histories.bottom);assert.equal(c.pitches,a.histories.bottom.length);assert.equal(Object.values(c.byType).reduce((x,y)=>x+y,0),c.pitches);
  assert.equal(observedChart([{type:'FF'}]).pitches,0,'top-half entries without counts are ignored');
  const h=a.histories.bottom.at(-1);assert.ok('ruleId' in h&&'tell' in h);
});
