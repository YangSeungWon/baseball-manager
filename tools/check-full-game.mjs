import assert from 'node:assert/strict';
import {FullGame} from '../web/js/full-game.js';
const g=new FullGame(123),out=[0,.1,0,.9,.42,.55,.5,.5,.5,.5],swing={target:'any',approach:'contact',location:'any',action:'swing'};
assert.equal(g.half,'top');assert.equal(g.awayRuns,0);
g.strikes=2;g.outs=2;g.random=()=>.99;
let e=g.pitch({type:'FF',zone:'out',intent:'attack',release:0});
assert.equal(e.result,'K');assert.equal(e.halfEnded,true);assert.equal(g.done,false);assert.equal(g.half,'top');
g.advanceHalf();assert.equal(g.half,'bottom');assert.equal(g.outs,0);assert.equal(g.order,0);assert.equal(g.inning,1);
g.outs=2;e=g.resolvePitch(swing,out);assert.equal(e.halfEnded,true);g.advanceHalf();assert.equal(g.inning,2);assert.equal(g.half,'top');assert.equal(g.order,1);
// No short-challenge two-run cutoff while pitching.
g.runs=3;g.awayRuns=3;g.strikes=2;e=g.pitch({type:'FF',zone:'out',intent:'attack',release:0});assert.equal(g.done,false);
// Home team wins after top nine without batting again.
g.inning=9;g.homeRuns=5;g.awayRuns=3;g.runs=3;g.outs=2;g.strikes=2;e=g.pitch({type:'FF',zone:'out',intent:'attack',release:0});assert.equal(g.done,true);assert.equal(g.won,true);assert.equal(e.clinched,true);
console.log('PASS: manual top/bottom play, independent orders, no short-game cutoff, top-nine clinch');
