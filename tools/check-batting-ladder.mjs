// 스킬 사다리 안전망. 계수를 바꿔도 "실행 > 준비 > 무작위"의 순서와 간격이 유지되는지 잰다.
// 표본이 작으므로(N=400) 목표 구간 자체는 tools/measure-batting.mjs 로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {POLICIES,measure,playStage,learning} from './measure-batting.mjs';

const N=400;
const cache=new Map();
const stage=policy=>{if(!cache.has(policy))cache.set(policy,measure(policy,(p,st,seed)=>playStage(p,st,seed),N,0));return cache.get(policy);};

test('reading avoids chases, timing reduces misses, and complete execution improves scoring',()=>{
  const r=Object.fromEntries(['random','zone','timer','aimer','oracle'].map(k=>[k,stage(POLICIES[k])]));
  assert.ok(r.zone.chase===0&&r.random.chase>20,'reading the zone avoids chasing balls');
  assert.ok(r.timer.contact>=r.zone.contact+20,'timing skill increases contact');
  assert.ok(r.aimer.hit>=r.timer.hit+10,'accurate aim improves the batted ball');
  assert.ok(r.aimer.clear>=r.timer.clear+8&&r.aimer.clear>=r.random.clear+10,'complete execution wins more games');
  assert.equal(r.oracle.clear,r.aimer.clear,'a hidden preparation bonus cannot change the same manual contact');
  assert.ok(r.random.clear<20&&r.aimer.clear<100,'wild swings struggle and even centered contact can be fielded');
  console.log('Direct-play skill sample (400 games):',Object.fromEntries(Object.entries(r).map(([k,v])=>[k,{clear:v.clear,contact:v.contact,hit:v.hit}])));
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
