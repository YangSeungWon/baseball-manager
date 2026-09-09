import test from 'node:test';import assert from 'node:assert/strict';
import {chantPattern} from '../web/js/terrace-chant.js';
test('original chant patterns are stable per batter and bounded for short scheduling',()=>{
 const a=chantPattern('김도윤',1);assert.deepEqual(a,chantPattern('김도윤',1));assert.notEqual(a.key,chantPattern('박시우',2).key);
 assert.ok(a.bpm>=108&&a.bpm<=120);assert.ok(a.voice.some(e=>e.response)&&a.voice.some(e=>!e.response));assert.ok(a.voice.every(e=>e.step<16&&e.duration<=.4));
});
