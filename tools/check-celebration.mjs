import test from 'node:test';
import assert from 'node:assert/strict';
import {flippedBat,celebrationPlayers,CELEBRATION_DURATION} from '../web/js/celebration.js';
test('tossed bat lands in foul ground and remains at rest',()=>{
 const origin={x:0,y:0},start=flippedBat(origin,0),end=flippedBat(origin,1.1);
 assert.equal(start.x,origin.x);assert.equal(start.y,origin.y);assert.ok(end.x<0&&end.y<0);assert.equal(end.z,.08);
 assert.deepEqual(flippedBat(origin,3),end);assert.ok(flippedBat(origin,.55).z>start.z);
});
test('teammates gather without teleporting or overlapping the scorer',()=>{
 let previous=celebrationPlayers(0,'김도윤');
 for(let t=1/30;t<=CELEBRATION_DURATION;t+=1/30){const now=celebrationPlayers(t,'김도윤');assert.equal(now.length,6);assert.equal(now[0].name,'김도윤');for(let i=1;i<6;i++){assert.ok(Math.hypot(now[i].x-previous[i].x,now[i].y-previous[i].y)<=6/30);assert.ok(Math.hypot(now[i].x,now[i].y)>1.5);}previous=now;}
 assert.ok(previous.every(p=>['celebrate','clap'].includes(p.pose)));
});
