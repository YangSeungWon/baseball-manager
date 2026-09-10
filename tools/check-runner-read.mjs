import assert from 'node:assert/strict';
import {simulateField} from '../web/js/field-sim.js';
const play=simulateField({speed:45,launch:24,angle:25,bases:[null,{id:'r',name:'주자',speed:8.2},null],outs:1});
const runner=play.running.runners[1],bounce=play.events.find(e=>e.type==='bounce');
assert.ok(bounce);assert.ok(runner.start<bounce.t-1,'commit before the ball lands');assert.equal(runner.returnAt,undefined,'keep the lead instead of returning on a clear hit');
assert.ok(play.frames.find(f=>f.t>1).runners[1].x<play.frames[0].runners[1].x,'movement is visible before the bounce');
console.log('PASS: runner commits to a gap hit before landing and retains the lead');
