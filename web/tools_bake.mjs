// 프롤로그를 한 번만 돌려 고정 리그 상태를 굽는다.
// 매 접속마다 시즌을 다시 돌리지 않으므로 세계가 완전히 고정되고 로딩도 사라진다.
import { Game } from './js/core/api.js';
import * as save from './js/save.js';
import fs from 'fs';

const t0 = Date.now();
const g = new Game({ userTeamId: 1, nTeams: 10, games: 144, startYear: 2026, seed: 94 });
g.prologue();
const blob = save.dump(g);
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/league.json', JSON.stringify(blob));
const kb = (JSON.stringify(blob).length / 1024).toFixed(0);
console.log(`구움: ${Date.now() - t0}ms | data/league.json ${kb}KB`);
console.log(`${g.state().year} 시즌 시작 대기 · 지난 시즌 우승 ${g.lastTable.find(r => r.champion).team}`);
