import test from 'node:test';
import assert from 'node:assert/strict';
import {contactMotion} from '../web/js/quick-feedback.js';

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
