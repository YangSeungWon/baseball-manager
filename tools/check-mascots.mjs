import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FRANCHISES} from '../web/js/core/names.js';
import {mascotIdentity} from '../web/js/mascot3d.js';
test('every franchise has a distinct 3D mascot identity',()=>{
 const identities=FRANCHISES.map(f=>mascotIdentity(`${f.city} ${f.nick}`));
 assert.equal(identities.length,14);assert.ok(identities.every(Boolean));
 assert.equal(new Set(identities.map(x=>x.code)).size,14);
 assert.equal(new Set(identities.map(x=>x.form)).size,14);
 assert.equal(mascotIdentity('항구 웨일즈'),null,'challenge-only clubs do not borrow another mascot');
});
test('all ten clubs in the shipped league resolve to their franchise mascot',async()=>{
 const data=JSON.parse(await readFile(new URL('../web/data/league.json',import.meta.url)));
 assert.equal(data.teams.length,10);
 for(const team of data.teams){const id=mascotIdentity(team.name);assert.ok(id,team.name);assert.ok(id.mascot);assert.ok(id.color);}
});
