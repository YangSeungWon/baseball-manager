// 투수 편 안전망. 전력·숨 고르기의 손익이 뒤집히지 않는지 잰다. 표본이 작으니(N=500) 수치 자체는 measure-pitching.mjs 로.
import test from 'node:test';
import assert from 'node:assert/strict';
import {POLICIES,HANDS,measure} from './measure-pitching.mjs';
const N=900;
// 성공률은 표본 잡음(±1.5p)이 커서 방향만 본다. 기전(오차·볼넷·피안타)은 잡음이 작아 순서를 단언한다.
test('max effort trades control for whiffs and never becomes a free win',()=>{
  for(const [hand,sigma] of Object.entries(HANDS)){
    const normal=measure(POLICIES.normal,sigma,N),max=measure(POLICIES.max,sigma,N),calm=measure(POLICIES.calm,sigma,N);
    assert.ok(max.release>normal.release&&normal.release>calm.release,`${hand}: release error orders max > normal > calm`);
    assert.ok(max.bb>=normal.bb&&calm.bb<=normal.bb,`${hand}: walks follow the release error`);
    assert.ok(max.hit<normal.hit,`${hand}: max effort is harder to hit (${max.hit.toFixed(1)} vs ${normal.hit.toFixed(1)})`);
    assert.ok(max.win<=normal.win+3,`${hand}: spamming max is not a dominant strategy (${max.win.toFixed(1)} vs ${normal.win.toFixed(1)})`);
  }
});
test('a steadier hand walks fewer and succeeds at least as often',()=>{
  const novice=measure(POLICIES.normal,HANDS.novice,N),skilled=measure(POLICIES.normal,HANDS.skilled,N);
  assert.ok(skilled.bb<novice.bb&&skilled.release<novice.release);
  assert.ok(skilled.win>=novice.win-1,`skilled ${skilled.win.toFixed(1)} vs novice ${novice.win.toFixed(1)}`);
});
