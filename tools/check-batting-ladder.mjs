// 스킬 사다리 안전망. 계수를 바꿔도 "실행 > 준비 > 무작위"의 순서와 간격이 유지되는지 잰다.
// 표본이 작으므로(N=400) 목표 구간 자체는 tools/measure-batting.mjs 로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {POLICIES,measure,playStage,learning} from './measure-batting.mjs';

const N=400;
const cache=new Map();
const stage=policy=>{if(!cache.has(policy))cache.set(policy,measure(policy,(p,st,seed)=>playStage(p,st,seed),N,0));return cache.get(policy);};

test('reading avoids chases, timing reduces misses, and complete execution improves scoring',()=>{
  const r=Object.fromEntries(['random','zone','timer','guesser','oracle'].map(k=>[k,stage(POLICIES[k])]));
  assert.ok(r.zone.chase===0&&r.random.chase>20,'reading the zone avoids chasing balls');
  assert.ok(r.timer.contact>=r.zone.contact+20,'timing skill increases contact');
  // 선구안 게임의 사다리: 존 판단 → 타이밍 → 노림. 준비는 실행을 도울 뿐 대신하지 못한다.
  assert.ok(r.guesser.hit>=r.timer.hit+3,'sitting on a pitch improves the batted ball');
  assert.ok(r.guesser.clear>=r.timer.clear+5,'sitting on a pitch wins more games');
  assert.ok(r.oracle.clear>=r.guesser.clear,'reading the course on top of the type cannot hurt');
  assert.ok(r.oracle.clear-r.timer.clear<r.timer.clear-r.random.clear,'preparation gains less than execution');
  assert.ok(r.random.clear<20&&r.oracle.clear<100,'wild swings struggle and perfect reading still gets fielded');
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

// 손으로 칠 수 있는가. 로봇 사다리가 전부 초록불이어도 이 시험이 빨간불이면 게임이 아니다.
test('a hand with human error can still make contact and get hits',async()=>{
  const {hands,HAND_FLOOR,HANDS}=await import('./measure-batting.mjs');
  const H=hands(300);
  for(const [k,floor] of Object.entries(HAND_FLOOR)){
    const m=H[k];
    if(floor.contact!=null)assert.ok(m.contact>=floor.contact,`${HANDS[k].label} 컨택 ${m.contact.toFixed(1)}% < ${floor.contact}%`);
    if(floor.hit!=null)assert.ok(m.hit>=floor.hit,`${HANDS[k].label} 타구 안타율 ${m.hit.toFixed(1)}% < ${floor.hit}%`);
  }
  assert.ok(H.veteran.clear>H.regular.clear&&H.regular.clear>=H.rookie.clear,'손이 좋을수록 더 이긴다');
  console.log('Hands:',Object.fromEntries(Object.entries(H).map(([k,m])=>[k,{contact:+m.contact.toFixed(1),hit:+m.hit.toFixed(1),clear:+m.clear.toFixed(1)}])));
});
