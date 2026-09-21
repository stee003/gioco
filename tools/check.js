// tools/check.js — static validation: i18n parity, world integrity, data refs.
import { STRINGS_EN } from '../src/data/strings.en.js';
import { STRINGS_IT } from '../src/data/strings.it.js';
import { ROOMS, REGIONS, compileRoom, SOLID } from '../src/data/world.js';
import { ENEMIES } from '../src/data/enemies.js';
import { RELICS } from '../src/data/relics.js';
import { BOSS_DEFS } from '../src/game/bosses.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';

let errors = 0, warnings = 0;
const err = (...a) => { errors++; console.error('✗', ...a); };
const warn = (...a) => { warnings++; console.warn('⚠', ...a); };
const ok = (...a) => console.log('✓', ...a);

// ---------------------------------------------------------------- i18n parity
const enKeys = new Set(Object.keys(STRINGS_EN));
const itKeys = new Set(Object.keys(STRINGS_IT));
for (const k of enKeys) if (!itKeys.has(k)) err(`missing IT key: ${k}`);
for (const k of itKeys) if (!enKeys.has(k)) err(`extra IT key: ${k}`);
ok(`i18n: ${enKeys.size} keys, parity ${enKeys.size === itKeys.size ? 'OK' : 'FAILED'}`);

// ---------------------------------------------------------------- rooms
for (const [id, def] of Object.entries(ROOMS)) {
  if (!REGIONS[def.region]) err(`${id}: unknown region ${def.region}`);
  if (!def.mapPos) warn(`${id}: no mapPos`);
  const compiled = compileRoom(def);
  const { grid, w, h } = compiled;
  // spawns & props inside bounds & not in solid
  const solidAt = (tx, ty) => tx < 0 || ty < 0 || tx >= w || ty >= h || grid[ty * w + tx] === SOLID;
  const FLOATERS = new Set(['palewisplet', 'gloomwing', 'drownedquill', 'inkfang', 'echoshade']);
  for (const s of def.spawns || []) {
    if (s.t === 'enemy' || s.t === 'elite') {
      if (!ENEMIES[s.id]) err(`${id}: unknown enemy ${s.id}`);
    } else if (s.t === 'boss' && !BOSS_DEFS[s.id]) err(`${id}: unknown boss ${s.id}`);
    if (s.t !== 'boss' && s.t !== 'npc' && !FLOATERS.has(s.id) && !solidAt(s.x, s.y + 1))
      warn(`${id}: spawn ${s.id}@${s.x},${s.y} has no ground below`);
    if (s.x < 0 || s.x >= w || s.y < 0 || s.y >= h) err(`${id}: spawn out of bounds ${s.x},${s.y}`);
  }
  for (const p of compiled.props) {
    const tx = Math.floor(p.x / 32), feetTy = Math.floor((p.y - 1) / 32);
    if (p.type !== 'hook' && p.type !== 'memory' && p.type !== 'bossTrigger' && solidAt(tx, feetTy))
      warn(`${id}: prop ${p.type}@${tx},${feetTy} feet in solid`);
  }
  // exits
  for (const e of def.exits) {
    if (!ROOMS[e.to]) { err(`${id}: exit to missing room ${e.to}`); continue; }
    if (e.tx === undefined || e.ty === undefined) err(`${id}: exit to ${e.to} lacks spawn point`);
    else {
      const tx = e.tx, ty = e.ty;
      if (tx < 1 || tx >= ROOMS[e.to].w - 1 || ty < 0 || ty >= ROOMS[e.to].h) err(`${id}: exit spawn ${tx},${ty} out of bounds in ${e.to}`);
    }
    if (e.seal && !e.seal.startsWith('boss_') && !e.seal.startsWith('flag_')) warn(`${id}: odd seal ${e.seal}`);
  }
  // bidirectional check (warning only)
  for (const e of def.exits) {
    const back = (ROOMS[e.to]?.exits || []).find(x => x.to === id);
    if (!back) warn(`${id}: exit to ${e.to} has no return exit`);
  }
}
ok(`rooms: ${Object.keys(ROOMS).length} compiled`);

// reachability graph from gate_1 (respecting seals: ignore them = full game graph)
{
  const seen = new Set(['gate_1']);
  const queue = ['gate_1'];
  while (queue.length) {
    const cur = queue.pop();
    for (const e of ROOMS[cur].exits) if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
  }
  for (const id of Object.keys(ROOMS)) if (!seen.has(id)) err(`unreachable room: ${id}`);
  ok(`graph: ${seen.size} rooms reachable`);
}

// relics referenced
for (const [id, def] of Object.entries(ROOMS)) {
  const compiled = compileRoom(def);
  for (const p of compiled.props) {
    if (p.item === 'relic' && !RELICS[p.id]) err(`${id}: unknown relic ${p.id}`);
  }
}
ok('relic refs OK');

// achievement strings
for (const a of ACHIEVEMENTS) {
  if (!STRINGS_EN[`ach.${a.id}.n`]) err(`missing EN name for ach ${a.id}`);
  if (!STRINGS_EN[`ach.${a.id}.d`]) err(`missing EN desc for ach ${a.id}`);
}
ok('achievement strings OK');

// lore keys referenced by props exist
const loreKeys = new Set();
for (const def of Object.values(ROOMS)) {
  const compiled = compileRoom(def);
  for (const p of compiled.props) if (p.lore) loreKeys.add(p.lore);
}
for (const k of loreKeys) if (!STRINGS_EN[k]) err(`missing EN lore text: ${k}`);
ok(`lore: ${loreKeys.size} fragments referenced`);

console.log(errors ? `\n${errors} errors, ${warnings} warnings` : `\nAll checks passed (${warnings} warnings).`);
process.exit(errors ? 1 : 0);
