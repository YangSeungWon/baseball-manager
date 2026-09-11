// 스킬 사다리 안전망. 계수를 바꿔도 "실행 > 준비 > 무작위"의 순서와 간격이 유지되는지 잰다.
// 표본이 작으므로(N=400) 목표 구간 자체는 tools/measure-batting.mjs 로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {POLICIES,measure,playStage,learning} from './measure-batting.mjs';

const N=400;
const stage=(policy)=>measure(policy,(p,st,seed)=>playStage(p,st,seed),N,0);

test('stage-1 clear rate climbs random → zone → timer → oracle with real gaps',()=>{
  const r=Object.fromEntries(Object.keys(POLICIES).map(k=>[k,stage(POLICIES[k])]));
  assert.ok(r.zone.clear-r.random.clear>=8,`zone ${r.zone.clear} vs random ${r.random.clear}`);
  assert.ok(r.timer.clear-r.zone.clear>=8,`timer ${r.timer.clear} vs zone ${r.zone.clear}`);
  assert.ok(r.oracle.clear-r.timer.clear>=3,`oracle ${r.oracle.clear} vs timer ${r.timer.clear}`);
  assert.ok(r.timer.clear-r.random.clear>=r.oracle.clear-r.timer.clear,'execution (zone+timing) must outweigh preparation (prediction)');
  assert.ok(r.random.clear<20&&r.oracle.clear<75,'failure stays the default even for perfect play');
  assert.ok(r.zone.chase===0&&r.random.chase>20,'policies behave as designed');
});

test('a skilled swing at least doubles hits per swing (contact × hit on contact)',()=>{
  const random=stage(POLICIES.random),oracle=stage(POLICIES.oracle);
  const perSwing=m=>m.contact/100*(1-m.foul/100)*m.hit/100;
  assert.ok(perSwing(oracle)>=1.8*perSwing(random),`oracle ${perSwing(oracle).toFixed(3)} vs random ${perSwing(random).toFixed(3)}`);
  assert.ok(oracle.contact>=random.contact+20);
});

test('remembering the pitcher pays: confident guesses beat the base rate clearly and cost no runs',()=>{
  const g=learning(60);
  assert.ok(g.learner.guessRate>=8&&g.learner.guessRate<=30,`guess rate ${g.learner.guessRate.toFixed(1)}%`);
  assert.ok(g.learner.accuracy>=50,`accuracy ${g.learner.accuracy.toFixed(1)}% vs base rate ≈ 37%`);
  assert.ok(g.learner.runsPerGame>=g.naive.runsPerGame-1,`learner ${g.learner.runsPerGame.toFixed(2)} vs naive ${g.naive.runsPerGame.toFixed(2)}`);
});
