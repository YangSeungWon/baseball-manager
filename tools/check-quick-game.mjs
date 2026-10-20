import test from 'node:test';
import assert from 'node:assert/strict';
import {QuickGame, makePitches, judgePitch, PERFECT_MS, HIT_MS, pitchLocation, inQuickZone} from '../web/js/quick-game.js';

test('every replay preserves ten pitches, six pitch types and two introductory strikes', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const pitches = makePitches(seed);
    assert.deepEqual(pitches, makePitches(seed));
    assert.equal(pitches.length, 10);
    assert.equal(new Set(pitches.map(p => p.type)).size, 6);
    assert.ok(pitches.slice(0, 2).every(p => p.strike && p.flight === 1250));
  }
  assert.notDeepEqual(makePitches(0), makePitches(1));
});
test('timing has symmetric, inclusive boundaries and chasing a ball never scores', () => {
  const strike = {x: 0, z: 0}, ball = {x: 1.5, z: 0};
  for (const sign of [-1, 1]) {
    assert.equal(judgePitch(strike, sign * PERFECT_MS).kind, 'perfect');
    assert.equal(judgePitch(strike, sign * (PERFECT_MS + 1)).kind, 'hit');
    assert.equal(judgePitch(strike, sign * HIT_MS).kind, 'hit');
    assert.equal(judgePitch(strike, sign * (HIT_MS + 1)).base, 0);
    assert.equal(judgePitch(ball, sign * PERFECT_MS).kind, 'chase');
  }
  assert.equal(judgePitch(strike, null).base, 0);
  assert.equal(judgePitch(ball, null).base, 100);
  assert.throws(() => judgePitch(strike, NaN));
});
test('a perfect round scores every actual strike and ball, with capped combo bonus', () => {
  for (let seed = 0; seed < 100; seed++) {
    const game = new QuickGame(seed);
    while (!game.done) game.resolve(game.pitch.strike ? 0 : null);
    assert.equal(game.score, 1750 + game.pitches.filter(p => p.strike).length * 100);
    assert.equal(game.bestCombo, 10);
    assert.throws(() => game.resolve(0));
    assert.equal(game.results.length, 10);
  }
});
test('mistakes reset the bonus; replay resets all score and preserves the pitches', () => {
  const game = new QuickGame(17);
  game.resolve(0); game.resolve(0);
  assert.equal(game.score, 425);
  game.resolve(game.pitch.strike ? null : 0);
  assert.equal(game.combo, 0);
  const result = game.resolve(game.pitch.strike ? 0 : null);
  assert.equal(result.points, result.base);
  const replay = new QuickGame(game.seed);
  assert.deepEqual(replay.pitches, game.pitches);
  assert.equal(replay.score, 0);
  assert.equal(replay.results.length, 0);
});

test('the visible landing point determines the call, including each zone edge', () => {
  for (const axis of ['x', 'z']) for (const sign of [-1, 1]) {
    const edge = {x: 0, z: 0, [axis]: sign};
    assert.equal(judgePitch(edge, null).label, '스트라이크');
    assert.equal(judgePitch({...edge, [axis]: sign * 1.01}, null).kind, 'take');
  }
  const directions = new Set(), strikeCells = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const pitches = makePitches(seed);
    const roundEdges = new Set();
    for (const pitch of pitches) {
      const landing = pitchLocation(pitch, 1);
      assert.ok(Math.abs(landing.x - pitch.x) < 1e-10);
      assert.ok(Math.abs(landing.z - pitch.z) < 1e-10);
      assert.equal(inQuickZone(landing), pitch.strike);
      if (pitch.strike) strikeCells.add(`${Math.round(pitch.x)},${Math.round(pitch.z)}`);
      else {
        const edge = Math.abs(pitch.x) > 1 ? pitch.x > 0 ? 'right' : 'left' : pitch.z > 0 ? 'high' : 'low';
        directions.add(edge); roundEdges.add(edge);
        assert.ok(Math.max(Math.abs(pitch.x), Math.abs(pitch.z)) > 1);
        assert.ok(Math.max(Math.abs(pitch.x), Math.abs(pitch.z)) <= 1.9);
      }
    }
    assert.ok(pitches.every(p => Math.abs(p.x) <= 1.9 && Math.abs(p.z) <= 1.9));
  }
  assert.equal(directions.size, 4);
  assert.equal(strikeCells.size, 9, 'strikes cover the whole zone, not just the center');
});

test('perspective keeps early location differences small and preserves final calls', () => {
  const strike = {x: .7, z: .2, movement:{x:.4,z:-.1},movePower:2.3};
  const ball = {...strike, x: 1.35};
  assert.ok(pitchLocation(ball, .4).x - pitchLocation(strike, .4).x < .15);
  assert.ok(pitchLocation(ball, .75).x - pitchLocation(strike, .75).x > .3);
  assert.ok(inQuickZone(pitchLocation(strike, 1)));
  assert.equal(inQuickZone(pitchLocation(ball, 1)), false);
});
