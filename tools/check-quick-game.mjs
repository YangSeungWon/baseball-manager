import test from 'node:test';
import assert from 'node:assert/strict';
import {QuickGame, makePitches, judgePitch, PERFECT_MS, HIT_MS} from '../web/js/quick-game.js';

test('every replay has exactly seven strikes and three balls, with two introductory strikes', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const pitches = makePitches(seed);
    assert.deepEqual(pitches, makePitches(seed));
    assert.equal(pitches.length, 10);
    assert.equal(pitches.filter(p => p.strike).length, 7);
    assert.ok(pitches.slice(0, 2).every(p => p.strike && p.flight === 1250));
  }
  assert.notDeepEqual(makePitches(0), makePitches(1));
});
test('timing has symmetric, inclusive boundaries and chasing a ball never scores', () => {
  const strike = {strike: true}, ball = {strike: false};
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
test('a perfect round has the same maximum regardless of pitch order', () => {
  for (let seed = 0; seed < 100; seed++) {
    const game = new QuickGame(seed);
    while (!game.done) game.resolve(game.pitch.strike ? 0 : null);
    assert.equal(game.score, 2450);
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
