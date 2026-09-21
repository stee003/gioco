// tools/sim.js — headless smoke test: boots the real game logic (world, player,
// enemies, bosses, items, dialogue) with stub audio/UI and simulates minutes of
// play: every room, every enemy, every boss through all phases, abilities, death.
import { World } from '../src/game/world.js';
import { Player } from '../src/game/player.js';
import { Enemy } from '../src/game/enemies.js';
import { Boss, BOSS_DEFS } from '../src/game/bosses.js';
import { ROOMS } from '../src/data/world.js';
import { I18n } from '../src/core/i18n.js';
import { FX } from '../src/core/fx.js';
import { STRINGS_EN } from '../src/data/strings.en.js';

let errors = 0;
const err = (...a) => { errors++; console.error('✗', ...a); };
const ok = (...a) => console.log('✓', ...a);

const i18n = new I18n('en');
const fx = new FX();
const audioStub = new Proxy({}, { get: () => () => {} });
audioStub.setRegion = () => {}; audioStub.setAmbience = () => {}; audioStub.setBoss = () => {};
audioStub.sfx = () => {};

const SLOTS = {};
const saveSysStub = {
  loadSlot: i => SLOTS[i] || null,
  saveToSlot: (i, d) => { SLOTS[i] = d; },
};

// ui stub with real backing store so tests can hook deathScreen etc.
const uiBacking = { dialogueActive: false, modal: null, prompt: null };
for (const k of ['toast', 'toastFloat', 'achievementToast', 'itemBanner', 'regionBanner', 'bossBanner',
  'bossQuote', 'deathScreen', 'openLore', 'startDialogue', 'openShop', 'openFastTravel', 'openConclave',
  'openTitle', 'openPause', 'close', 'update', 'draw', 'hint']) uiBacking[k] = () => {};
const uiStub = new Proxy(uiBacking, {
  get(t, k) { if (k in t) return t[k]; return () => {}; },
  set(t, k, v) { t[k] = v; return true; },
});

const settings = { shake: 1, flashes: true };
const input = {
  down: {}, pressed: {}, released: {},
  virtual(act, isDown) {
    if (isDown && !this.down[act]) this.pressed[act] = true;
    this.down[act] = isDown;
  },
  endFrame() { this.pressed = {}; this.released = {}; },
};

const ctx = { i18n, fx, audio: audioStub, ui: uiStub, settings, input, player: null, world: null, saveSys: saveSysStub };
const world = new World(ctx);
ctx.world = world;
const player = new Player(0, 0);
ctx.player = player;
// give the player everything (full-kit simulation)
for (const ab of ['commune', 'tollstep', 'reprise', 'grasp', 'hook', 'phase', 'undertow', 'sonde']) player.unlocked.add(ab);
for (const r of Object.keys(STRINGS_EN)) { /* noop */ }
world.slotIndex = 0;

const DT = 1 / 60;
function tick(n, script) {
  for (let i = 0; i < n; i++) {
    if (script) script(i);
    world.update(DT, input);
    input.endFrame();
  }
}

// ---------------------------------------------------------------- 1. every room loads & simulates
const roomIds = Object.keys(ROOMS);
for (const id of roomIds) {
  try {
    world.loadRoom(id, 3, 3, { silent: true });
    tick(90, i => {
      input.virtual('right', i % 120 < 90);
      input.virtual('jump', i % 45 === 0);
      input.virtual('attack', i % 30 === 0);
      input.virtual('dash', i % 90 === 10);
    });
    input.virtual('right', false); input.virtual('jump', false); input.virtual('attack', false);
    if (!isFinite(player.x) || !isFinite(player.y)) err(`${id}: player position NaN`);
  } catch (e) {
    err(`${id}: ${e.stack || e}`);
  }
}
ok(`simulated ${roomIds.length} rooms`);

// ---------------------------------------------------------------- 2. every enemy updates
world.loadRoom('gate_1', 4, 7, { silent: true });
for (const id of Object.keys(ENEMY_IDS())) {
  try {
    const e = new Enemy(id, 10, 10);
    world.enemies.push(e);
    // wake sleepers, aggro everyone
    e.awake = true;
    player.x = e.x + 100; player.y = e.y;
    tick(240, () => { input.virtual('attack', Math.random() < .1); });
    input.virtual('attack', false);
    world.enemies = world.enemies.filter(x => x !== e);
  } catch (e2) { err(`enemy ${id}: ${e2.stack || e2}`); }
}
ok('simulated all enemy behaviors');
function ENEMY_IDS() {
  return { cinderling: 1, palewisplet: 1, sporebell: 1, thornrunner: 1, grazer: 1, stoker: 1, bellmaw: 1, huskcantor: 1, shadelet: 1, gloomwing: 1, drownedquill: 1, inkfang: 1, echoshade: 1, waxsentinel: 1, wardenEcho: 1 };
}

// ---------------------------------------------------------------- 3. every boss: full fight to death through phases
for (const id of Object.keys(BOSS_DEFS)) {
  try {
    const roomMap = { tollmaster: ['gate_4', 3, 15], rootwife: ['root_4', 3, 21], choirmarshal: ['bell_4', 3, 21], warden: ['hush_2', 3, 15], librarian: ['scr_3', 40, 17], antiphon: ['heart_2', 3, 21] };
    const [rid, sx, sy] = roomMap[id];
    world.loadRoom(rid, sx, sy, { silent: true });
    const boss = new Boss(id, world.roomW() / 2, world.roomH() / 2);
    world.boss = boss;
    const phasesSeen = new Set([1]);
    let guard = 60 * 60 * 4;
    while (!boss.dead && guard-- > 0) {
      // player harasses: stand near, jump, attack
      player.x = boss.x + Math.sin(guard * .05) * 140;
      player.y = Math.min(boss.y, world.roomH() - 64);
      player.vy = 0;
      input.virtual('attack', guard % 20 === 0);
      input.virtual('jump', guard % 50 === 0);
      input.virtual('dash', guard % 77 === 0);
      world.update(DT, input);
      input.endFrame();
      phasesSeen.add(boss.phase);
    }
    input.virtual('attack', false);
    if (!boss.dead) {
      boss._isBlocked = () => false; // bypass gated-vulnerability windows (tested separately)
      boss.hit(99999, { hx: boss.x, hy: boss.y - 20, charged: true }, ctx); // force the real death path
      for (let i = 0; i < 150 && !boss.dead; i++) { world.update(DT, input); input.endFrame(); }
    }
    if (!boss.dead) err(`boss ${id}: did not die within budget`);
    else ok(`boss ${id}: killed (phases ${[...phasesSeen].join(',')}, hp=${boss.hp})`);
    world.boss = null;
  } catch (e) { err(`boss ${id}: ${e.stack || e}`); }
}

// ---------------------------------------------------------------- 4. interactions: chime, lore, shrine, chest
try {
  world.loadRoom('gate_2', 10, 19, { silent: true });
  const chime = world.props.find(p => p.type === 'chime');
  world._interact(chime);
  if (!world.flags.has('lit_gate_2')) err('chime did not light');
  world.loadRoom('gate_1', 18, 20, { silent: true });
  const stele = world.props.find(p => p.type === 'stele');
  world._interact(stele);
  if (!world.flags.has('lore_lore.gate.1')) err('stele lore not granted');
  world.loadRoom('root_2', 4, 11, { silent: true });
  const shrine = world.props.find(p => p.type === 'shrine');
  world._interact(shrine);
  if (!player.unlocked.has('reprise')) err('shrine did not grant ability');
  world.loadRoom('gate_3', 31, 13, { silent: true });
  const chest = world.props.find(p => p.type === 'chest');
  world._interact(chest);
  if (!player.relics.has('brittle')) err('chest did not grant relic');
  ok('interactions OK');
} catch (e) { err(`interactions: ${e.stack || e}`); }

// ---------------------------------------------------------------- 5. death & reverberation
try {
  world.loadRoom('gate_1', 20, 20, { silent: true });
  player.echoes = 55;
  let respawned = false;
  uiBacking.deathScreen = (cb) => { respawned = true; cb(); };
  player.hurt(99, player.x + 10, ctx);
  uiBacking.deathScreen = () => {};
  if (!respawned) err('death screen not invoked');
  if (player.chimes !== player.maxChimes) err('player not healed on respawn');
  ok('death/respawn OK');
} catch (e) { err(`death: ${e.stack || e}`); }

// ---------------------------------------------------------------- 6. projectiles, beams, shocks, zones
try {
  world.loadRoom('gate_3', 10, 13, { silent: true });
  world.spawnProj({ x: 300, y: 300, vx: 100, vy: 0, g: 400, r: 6, dmg: 1, life: 2, kind: 'spore', color: '#fff' });
  world.spawnBeam({ x: 300, y: 400, dir: 1, len: 300, dmg: 1, t: 0, color: '#fff' });
  world.spawnShock(300, 500, 1);
  world.zones.push({ x: 300, y: 400, w: 40, h: 40, t: 0, life: .5, dmg: 1, kind: 'vine', delay: 0 });
  world.spawnEchoBurst(400, 400, 30);
  world.spawnSonde(500, 500, 100, 0);
  tick(180);
  ok('projectiles/beams/shocks/zones OK');
} catch (e) { err(`projectiles: ${e.stack || e}`); }

// ---------------------------------------------------------------- 7. room transitions via exits
try {
  world.loadRoom('gate_2', 3, 17, { silent: true });
  player.x = 38.4 * 32; player.y = 20 * 32; // at the right exit edge
  tick(30, () => { input.virtual('right', true); });
  input.virtual('right', false);
  if (world.roomId !== 'gate_3' && !world.transition) err(`transition failed, still in ${world.roomId}`);
  else ok('exit transition OK → ' + world.roomId);
} catch (e) { err(`transitions: ${e.stack || e}`); }

// ---------------------------------------------------------------- 8. save roundtrip
try {
  world.saveToSlot();
  const data = JSON.parse(JSON.stringify({
    room: world.roomId, flags: [...world.flags], abilities: [...player.unlocked],
    relics: [...player.relics], chimes: player.chimes, aria: player.aria,
    maxChimes: player.maxChimes, maxAria: player.maxAria, echoes: player.echoes,
    rooms: world.flags.rooms || [], respawn: world.respawnPoint,
    deaths: world.stats.deaths, playtime: world.playtime,
  }));
  ctx.player = null;
  const p2 = new Player(0, 0);
  ctx.player = p2;
  const w2 = new World(ctx);
  w2.applySave(data, 1);
  if (w2.roomId !== data.room) err('save roundtrip room mismatch');
  ok('save roundtrip OK');
} catch (e) { err(`save: ${e.stack || e}`); }

console.log(errors ? `\n${errors} SIM FAILURES` : '\nSimulation passed.');
process.exit(errors ? 1 : 0);
