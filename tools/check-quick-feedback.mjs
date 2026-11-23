import test from 'node:test';
import assert from 'node:assert/strict';
import {contactMotion,runnerPaths,runnerFrame,feedbackDuration,pitcherPose} from '../web/js/quick-feedback.js';
import {WINDUP_MS} from '../web/js/quick-game.js';

test('pitcher releases continuously, mirrors throwing hands and respects reduced motion',()=>{
  const release=pitcherPose('windup',WINDUP_MS);
  assert.deepEqual(release,pitcherPose('flight',0));
  assert.notDeepEqual(pitcherPose('windup',WINDUP_MS*.55),release);
  assert.deepEqual(pitcherPose('flight',720),pitcherPose('plan',0));
  const right=pitcherPose('windup',300),left=pitcherPose('windup',300,'L');
  for(const key of Object.keys(right)){
    assert.equal(left[key][0],-right[key][0]);assert.equal(left[key][1],right[key][1]);
  }
  assert.deepEqual(pitcherPose('windup',300,'R',true),pitcherPose('flight',80,'R',true));
});

test('a clean hit holds visually then departs, while a miss never produces contact',()=>{
  const result={kind:'hit',bases:4,offset:-10};
  assert.ok(contactMotion(result,0).x===0);assert.ok(contactMotion(result,40).y===0);
  assert.ok(contactMotion(result,100).x<0);assert.ok(contactMotion(result,100).y<0);
  assert.equal(contactMotion({kind:'whiff'},100).contact,false);
  assert.equal(contactMotion({kind:'strikeout'},100).impact,0);
  assert.equal(contactMotion(result,900).alpha,0);
});
test('fouls leave sideways, long hits carry farther and grounders stay low',()=>{
  const result=(kind,bases=1,offset=10)=>contactMotion({kind,bases,offset},350);
  assert.ok(Math.abs(result('foul').x)>Math.abs(result('hit').x)*3);
  assert.ok(result('hit',4).y<result('hit',2).y&&result('hit',2).y<result('hit',1).y);
  assert.ok(Math.abs(result('out').y)<Math.abs(result('out',1,-10).y));
});
test('reduced motion keeps contact static and suppresses impact animation',()=>{
  const result={kind:'hit',bases:4,offset:0};
  assert.deepEqual(contactMotion(result,0,true),contactMotion(result,500,true));
  assert.deepEqual(contactMotion(result,500,true),{contact:true,x:0,y:0,scale:1,alpha:1,impact:0});
});

test('runner animation preserves forced walks and sequential homer scoring',()=>{
  const walk=runnerPaths([false,false,true],{kind:'walk'});
  assert.deepEqual(walk,[{from:3,to:3},{from:0,to:1}]);
  const homer=runnerPaths([true,true,true],{kind:'hit',bases:4});
  assert.equal(homer.filter(p=>runnerFrame(p,620).scored).length,1);
  assert.equal(homer.filter(p=>runnerFrame(p,1400).scored).length,4);
  assert.equal(runnerFrame({from:0,to:1},700).x,82);
  assert.equal(runnerFrame({from:0,to:4},0,true).scored,true);
  assert.ok(feedbackDuration({ended:true})>1400);
});

test('base indicators can distinguish runners travelling from runners arriving',()=>{
  const path={from:1,to:3};
  assert.equal(runnerFrame(path,0).base,1);
  assert.equal(runnerFrame(path,0).moving,false);
  assert.equal(runnerFrame(path,480).moving,true);
  assert.equal(runnerFrame(path,870).base,3);
  assert.equal(runnerFrame(path,870).moving,false);
  assert.equal(runnerFrame(path,0,true).base,3);
  assert.equal(runnerFrame(path,0,true).moving,false);
});
