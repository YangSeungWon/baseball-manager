import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load, dump } from '../web/js/save.js';
import { simulate } from '../web/js/simulation.js';
import { writeSave, readSlot, checkpoint, KEY, BACKUP } from '../web/js/storage.js';
import { experience, watchPlayer, updateChallenge } from '../web/js/experience.js';
const fresh = () => load(JSON.parse(readFileSync(new URL('../web/data/league.json', import.meta.url))));
const roundtrip = g => load(JSON.parse(JSON.stringify(dump(g))));
test('midseason resume preserves rain queue and attendance and can finish the season', () => {
  const g = fresh(); g.startSeason(); g.advance(7);
  const r = roundtrip(g);
  assert.deepEqual(r.season.postponed, g.season.postponed);
  assert.deepEqual(r.season.rained, g.season.rained);
  assert.deepEqual([...r.season.att], [...g.season.att]);
  const attendance = [...r.season.att.values()].reduce((n, a) => n + a.total, 0);
  assert.doesNotThrow(() => r.advance(7));
  assert.ok([...r.season.att.values()].reduce((n, a) => n + a.total, 0) > attendance);
  r.simToEnd(); assert.equal(r.state().phase, 'postseason');
  assert.doesNotThrow(() => roundtrip(r).runPostseason());
});
test('legacy saves recover missing postponed fixtures without RNG draws', () => {
  const g = fresh(); g.startSeason(); g.advance(7); const d = JSON.parse(JSON.stringify(dump(g)));
  delete d.season.postponed; delete d.season.rained; delete d.season.att;
  const r = load(d);
  assert.deepEqual(r.season.postponed, g.season.postponed);
  assert.deepEqual(r.season.rng.state, d.season.rng);
  assert.doesNotThrow(() => r.advance(1));
});
test('simulation stops at the completed day containing a matching event', async () => {
  const g = fresh(); g.startSeason();
  const r = await simulate(g, 7, { yieldDay:async () => {}, shouldStop:m => m.kind === 'contract' && m.pri >= 1,
    onDay:n => { if (n === 2) g.L.mail.push({ kind:'contract', pri:1, title:'계약 확인' }); } });
  assert.equal(r.completed, 2); assert.equal(g.state().day, 2); assert.equal(r.reason, 'event');
  assert.doesNotThrow(() => roundtrip(g).advance(1));
});
test('simulation cancellation never leaves a partial day', async () => {
  const g = fresh(); g.startSeason(); let stop = false;
  const r = await simulate(g, 20, { yieldDay:async () => {}, cancelled:() => stop, onDay:n => { if(n === 3) stop = true; } });
  assert.equal(r.completed, 3); assert.equal(r.reason, 'cancelled'); assert.equal(g.state().day, 3);
});
test('disabling event stops completes the requested interval', async () => {
  const g = fresh(); g.startSeason();
  const r = await simulate(g, 7, { yieldDay:async () => {}, onDay:() => g.L.mail.push({ kind:'injury', pri:1 }) });
  assert.equal(r.completed, 7); assert.equal(r.reason, '');
});
function memoryStorage() { const m = new Map(); return { getItem:k => m.get(k) || null, setItem:(k,v) => m.set(k,v) }; }
test('replacing a club preserves the previous save, routine saves keep recovery', () => {
  const s = memoryStorage(); writeSave(s, 'club one'); writeSave(s, 'club two', { replace:true });
  assert.equal(readSlot(s, BACKUP), 'club one'); writeSave(s, 'club two day two');
  assert.equal(readSlot(s, BACKUP), 'club one'); checkpoint(s);
  assert.equal(readSlot(s, BACKUP), 'club two day two');
});
test('failed backup leaves the current club untouched', () => {
  const s = memoryStorage(); writeSave(s, 'original');
  const denied = { ...s, setItem:() => { throw new Error('quota'); } };
  assert.throws(() => writeSave(denied, 'new', { replace:true })); assert.equal(s.getItem(KEY), 'original');
});
test('watch history, guide and challenge survive save/load', () => {
  const g = fresh(), p = g.player(g.roster().lineup[0].pid);
  watchPlayer(g,p); experience(g).guide.active = true; experience(g).challenge = { start:g.state().year };
  const r = roundtrip(g); assert.deepEqual(experience(r), experience(g));
  assert.equal('hidden' in experience(r).watched[0], false);
  assert.equal(watchPlayer(r,p), false); assert.equal(experience(r).watched.length, 0);
});
test('challenge succeeds only at season end and never on preseason rankings', () => {
  const g = { experience:{ challenge:{ start:2027 } }, state:() => ({ year:2027, phase:'regular' }), standings:() => ({ rows:[{ is_user:true, playoff:true }] }) };
  assert.equal(updateChallenge(g).result, undefined);
  g.state = () => ({ year:2027, phase:'postseason' }); assert.equal(updateChallenge(g).result, 'success');
});
test('reading a filtered inbox preserves other unread messages', () => {
  const g = fresh(); g.L.mail.push({ kind:'injury' }); g.L.mail.push({ kind:'draft' });
  const ids = g.mail().rows.filter(m => m.kind === 'injury').map(m => m.id); g.markMailRead(ids);
  assert.equal(g.mail().rows.find(m => m.kind === 'draft').read, false);
});

test('save/load preserves the next game, Gaussian spare and shared league RNG', () => {
  const g = fresh(); g.startSeason(); g.advance(7); const r = roundtrip(g);
  assert.equal(r.L.rng, r.season.rng); assert.equal(r.L.rng._spare, g.L.rng._spare);
  assert.deepEqual(g.advance(1).games, r.advance(1).games);
  assert.deepEqual(g.L.rng.state, r.L.rng.state);
});
test('challenge ends after three unsuccessful completed seasons', () => {
  const g = { experience:{ challenge:{ start:2027 } }, state:() => ({ year:2029, phase:'postseason' }), standings:() => ({ rows:[{ is_user:true, playoff:false }] }) };
  assert.equal(updateChallenge(g).result, 'ended');
});
