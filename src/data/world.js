// data/world.js — THE LONG QUIET world: regions, rooms, connections, gates.
// Rooms are authored with a tiny rect-DSL (build functions) that compiles to a tile grid.
// Tile ids: 0 air, 1 solid, 2 one-way platform, 3 spike, 4 breakable, 5 deep water
//           6 shallow water, 7 veil (needs Phase Step)
export const SOLID = 1, PLAT = 2, SPIKE = 3, BREAK = 4, WATERD = 5, WATERS = 6, VEIL = 7;

export const REGIONS = {
  gate: {
    key: 'region.gate',
    pal: { sky0: '#0b0f1a', sky1: '#151d2e', rock: '#2a3348', rockLit: '#3a4a68', rockDark: '#1a2233', accent: '#d8a85a', glow: '#ffd9a0', fog: 'rgba(130,150,190,0.10)' },
    parallax: 'gate', darkness: 0.22, amb: { wind: 1, drips: 1 },
    music: { root: 196, scale: [0, 3, 5, 7, 10], tempo: 56, chords: [0, 3, 4, 1], pad: true, bells: true, bass: true, choir: false, perc: false, density: .7 },
  },
  root: {
    key: 'region.root',
    pal: { sky0: '#08120c', sky1: '#0f2418', rock: '#23402d', rockLit: '#325a3d', rockDark: '#152a1c', accent: '#8fd47a', glow: '#d2f7a8', fog: 'rgba(120,220,150,0.07)' },
    parallax: 'root', darkness: 0.12, amb: { wind: 1, insects: 1 },
    music: { root: 220, scale: [0, 3, 5, 7, 10], tempo: 50, chords: [0, 2, 3, 1], pad: true, bells: true, bass: true, choir: true, perc: false, density: .6 },
  },
  bell: {
    key: 'region.bell',
    pal: { sky0: '#150d0b', sky1: '#231411', rock: '#3a2a24', rockLit: '#54402f', rockDark: '#241713', accent: '#e09a5a', glow: '#ffb877', fog: 'rgba(230,150,90,0.06)' },
    parallax: 'bell', darkness: 0.3, amb: { machine: 1, rumble: 1 },
    music: { root: 174.6, scale: [0, 1, 3, 7, 8], tempo: 63, chords: [0, 1, 3, 2], pad: true, bells: true, bass: true, choir: false, perc: true, density: .9 },
  },
  hush: {
    key: 'region.hush',
    pal: { sky0: '#04050c', sky1: '#090b16', rock: '#151a2c', rockLit: '#232c48', rockDark: '#0c101d', accent: '#aab4d4', glow: '#cdd8f8', fog: 'rgba(150,170,220,0.05)' },
    parallax: 'hush', darkness: 0.82, amb: { wind: 1 },
    music: { root: 146.8, scale: [0, 3, 5, 6, 10], tempo: 40, chords: [0, 2, 1, 3], pad: true, bells: true, bass: true, choir: false, perc: false, density: .35 },
  },
  scr: {
    key: 'region.scr',
    pal: { sky0: '#071016', sky1: '#0d1f26', rock: '#1e3a42', rockLit: '#2c525c', rockDark: '#122228', accent: '#d8c79a', glow: '#7ae0d0', fog: 'rgba(110,210,200,0.06)' },
    parallax: 'scr', darkness: 0.3, amb: { drips: 1, wind: 1 },
    music: { root: 164.8, scale: [0, 2, 3, 7, 8], tempo: 48, chords: [0, 3, 1, 4], pad: true, bells: true, bass: true, choir: true, perc: false, density: .55 },
  },
  heart: {
    key: 'region.heart',
    pal: { sky0: '#120e22', sky1: '#221a3e', rock: '#463d63', rockLit: '#6a5f92', rockDark: '#2c2545', accent: '#e8d8ff', glow: '#fff2ff', fog: 'rgba(220,200,255,0.09)' },
    parallax: 'heart', darkness: 0.08, amb: { wind: 1 },
    music: { root: 261.6, scale: [0, 2, 4, 7, 9, 11], tempo: 58, chords: [0, 2, 4, 1], pad: true, bells: true, bass: true, choir: true, perc: false, density: .8 },
  },
};

// ---------------------------------------------------------------- room builder
class RoomBuilder {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.g = new Uint8Array(w * h);
    this.props = [];
  }
  set(x, y, v) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y * this.w + x] = v; }
  rect(x, y, w, h, v = SOLID) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v); }
  clear(x, y, w, h) { this.rect(x, y, w, h, 0); }
  plat(x, y, w) { this.rect(x, y, w, 1, PLAT); }
  spike(x, y, w) { this.rect(x, y, w, 1, SPIKE); }
  water(x, y, w, h, deep = false) { this.rect(x, y, w, h, deep ? WATERD : WATERS); }
  veil(x, y, w, h) { this.rect(x, y, w, h, VEIL); }
  brk(x, y, w, h) { this.rect(x, y, w, h, BREAK); }
  prop(type, x, y, extra) { this.props.push({ type, x: x * 32 + 16, y: y * 32 + 32, ...extra }); }
  floor(x, y, w) { this.rect(x, y, w, Math.max(1, this.h - y)); }
  wall(x, y, h) { this.rect(x, y, 1, h); }
  border() { this.rect(0, 0, this.w, 1); this.rect(0, this.h - 1, this.w, 1); this.rect(0, 0, 1, this.h); this.rect(this.w - 1, 0, 1, this.h); }
}

export const ROOMS = {

  // ================================================================ THE SUNKEN GATE
  gate_1: {
    region: 'gate', key: 'room.gate_1', w: 52, h: 36,
    build(b) {
      b.border();
      // start terrace top-left (surface light shaft)
      b.rect(1, 8, 10, 2);
      b.rect(1, 0, 3, 8);
      // descending stair platforms
      b.plat(13, 10, 4); b.plat(18, 13, 4); b.plat(23, 16, 4); b.plat(28, 19, 4);
      // ground mass + raised main floor
      b.rect(2, 24, 49, 11);
      b.rect(14, 21, 38, 3);
      b.clear(50, 16, 2, 5); // exit opening right
      // under-gallery hollow (memory of the first toll)
      b.clear(3, 25, 9, 6);
      b.plat(4, 27, 2); // climb-out step
      b.clear(8, 24, 2, 1); // drop-in hole from the main floor
      // wall-climb shaft up to root_5 (walk beneath it to reach the exit)
      b.rect(44, 12, 1, 5);
      b.clear(45, 12, 2, 12);
      // secret high alcove (Bellheart relic; needs Reprise)
      b.plat(2, 3, 5);
      // props
      b.prop('stele', 18, 20, { lore: 'lore.gate.1', speaker: 'world.stele' });
      b.prop('stele', 33, 20, { lore: 'lore.gate.4', speaker: 'world.mural' });
      b.prop('memory', 7, 30, { lore: 'lore.echo.1' });
      b.prop('echoes', 4, 30, { amount: 14 });
      b.prop('echoes', 24, 20, { amount: 10 });
      b.prop('lantern', 16, 20, {}); b.prop('lantern', 30, 20, {});
      b.prop('chalk', 22, 20, {}); b.prop('chalk', 36, 20, {});
    },
    spawns: [
      { t: 'enemy', id: 'cinderling', x: 27, y: 20 },
      { t: 'enemy', id: 'palewisplet', x: 36, y: 15 },
      { t: 'enemy', id: 'cinderling', x: 5, y: 30 },
    ],
    exits: [
      { x: 50, y: 16, w: 2, h: 5, to: 'gate_2', tx: 3, ty: 17 },
      { x: 45, y: 10, w: 2, h: 2, to: 'root_5', tx: 12, ty: 5, gate: 'climb' },
    ],
    start: { x: 4, y: 7 },
    mapPos: [1, 3],
  },
  gate_2: {
    region: 'gate', key: 'room.gate_2', w: 40, h: 24,
    build(b) {
      b.border();
      b.floor(1, 20, 38);
      b.clear(0, 15, 1, 5); b.clear(39, 15, 1, 5);
      // broken gatehouse canopy (walk under freely)
      b.plat(8, 16, 11); b.plat(24, 17, 8);
      b.prop('chime', 10, 19, {});
      b.prop('lantern', 13, 19, {}); b.prop('lantern', 22, 19, {}); b.prop('lantern', 33, 19, {});
      b.prop('tram', 26, 19, {});
      b.prop('echoes', 6, 19, { amount: 8 });
    },
    spawns: [{ t: 'npc', id: 'wick', x: 15, y: 19 }, { t: 'npc', id: 'murmur', x: 21, y: 19 }],
    exits: [
      { x: 0, y: 15, w: 1, h: 5, to: 'gate_1', tx: 46, ty: 19 },
      { x: 39, y: 15, w: 1, h: 5, to: 'gate_3', tx: 3, ty: 16 },
    ],
    mapPos: [3, 3],
  },

  gate_3: {
    region: 'gate', key: 'room.gate_3', w: 76, h: 22,
    build(b) {
      b.border();
      b.floor(1, 14, 17);          // deck x1..17
      b.floor(22, 14, 12);         // deck x22..33  (gap x18..21)
      b.floor(40, 14, 10);         // deck x40..49  (gap x34..39, 6 wide)
      b.floor(54, 14, 21);         // deck x54..74  (gap x50..53)
      b.clear(0, 10, 1, 4); b.clear(75, 10, 1, 4);
      // lower pit with recovery path
      b.floor(1, 19, 74);
      b.clear(19, 14, 2, 5); b.clear(34, 14, 6, 5); b.clear(50, 14, 4, 5);
      b.spike(20, 18, 1); b.spike(35, 18, 5); b.spike(51, 18, 2);
      // climb-out platforms from the pit
      b.plat(23, 17, 3); b.plat(44, 17, 3);
      // secret under the deck
      b.brk(30, 14, 2, 1);
      b.rect(28, 15, 8, 4, 0);
      b.prop('chest', 31, 18, { item: 'relic', id: 'brittle' });
      b.prop('echoes', 29, 18, { amount: 16 });
      // props
      b.prop('stele', 8, 13, { lore: 'lore.gate.3', speaker: 'world.mural' });
      b.prop('stele', 60, 13, { lore: 'lore.gate.2', speaker: 'world.stele' });
      b.prop('lantern', 44, 13, {});
      b.prop('echoes', 24, 13, { amount: 9 });
    },
    spawns: [
      { t: 'enemy', id: 'cinderling', x: 45, y: 13 },
      { t: 'enemy', id: 'palewisplet', x: 20, y: 10 },
      { t: 'enemy', id: 'palewisplet', x: 41, y: 9 },
      { t: 'enemy', id: 'cinderling', x: 12, y: 18 },
      { t: 'enemy', id: 'palewisplet', x: 30, y: 18 },
    ],
    exits: [
      { x: 0, y: 10, w: 1, h: 4, to: 'gate_2', tx: 36, ty: 17 },
      { x: 75, y: 10, w: 1, h: 4, to: 'gate_4', tx: 3, ty: 15 },
    ],
    mapPos: [5, 3],
  },

  gate_4: {
    region: 'gate', key: 'room.gate_4', w: 64, h: 22,
    build(b) {
      b.border();
      b.floor(1, 17, 62);
      b.plat(8, 13, 4); b.plat(52, 13, 4);
      b.clear(0, 12, 1, 5); b.clear(63, 12, 1, 5);
      // the great gate (visual mass, opens when Tollmaster falls)
      b.rect(58, 6, 5, 11);
      b.clear(58, 12, 5, 5);
      b.prop('gateDoor', 60, 16, { seal: 'boss_tollmaster' });
      b.prop('lantern', 10, 16, {}); b.prop('lantern', 46, 16, {});
    },
    spawns: [{ t: 'boss', id: 'tollmaster', x: 44, y: 16, trigger: 30 }],
    exits: [
      { x: 0, y: 12, w: 1, h: 5, to: 'gate_3', tx: 72, ty: 13 },
      { x: 63, y: 12, w: 1, h: 5, to: 'root_1', tx: 3, ty: 17, seal: 'boss_tollmaster' },
    ],
    mapPos: [7, 3],
  },

  // ================================================================ THE ROOTWAKE
  root_1: {
    region: 'root', key: 'room.root_1', w: 64, h: 30,
    build(b) {
      b.border();
      b.floor(1, 20, 16); // entry floor mass x1..16 y20..29
      b.clear(1, 21, 7, 8); // hidden pocket hollow beneath (break in from above)
      b.plat(2, 25, 2); b.plat(5, 22, 2); // climb back out
      b.set(6, 20, BREAK); b.set(7, 20, BREAK); // breakable entrance to the pocket
      b.clear(0, 15, 1, 5);
      // dash gap x17..24 (8 wide, Toll Step)
      b.floor(25, 20, 16); // x25..40
      b.rect(17, 21, 8, 9); // wall under the gap so you cannot walk under
      b.plat(20, 16, 3); // hop platform above gap
      // descend right
      b.plat(42, 23, 4); b.floor(44, 26, 19);
      b.spike(50, 25, 3); b.plat(50, 22, 3);
      b.clear(63, 21, 1, 5);
      // props
      b.prop('stele', 28, 19, { lore: 'lore.root.1', speaker: 'world.stele' });
      b.prop('echoes', 33, 19, { amount: 12 });
      b.prop('echoes', 2, 28, { amount: 18 });
      b.prop('echoes', 60, 25, { amount: 14 });
      b.prop('lantern', 12, 19, {}); b.prop('lantern', 47, 25, {});
      b.prop('rootsDecor', 32, 2, {});
    },
    spawns: [
      { t: 'enemy', id: 'thornrunner', x: 11, y: 19 },
      { t: 'enemy', id: 'sporebell', x: 34, y: 19 },
      { t: 'enemy', id: 'thornrunner', x: 55, y: 25 },
      { t: 'enemy', id: 'sporebell', x: 56, y: 25 },
      { t: 'enemy', id: 'grazer', x: 30, y: 19 },
    ],
    exits: [
      { x: 0, y: 15, w: 1, h: 5, to: 'gate_4', tx: 59, ty: 14 },
      { x: 63, y: 21, w: 1, h: 5, to: 'root_2', tx: 3, ty: 40 },
      { x: 6, y: 20, w: 2, h: 2, to: 'root_3', tx: 4, ty: 3, kind: 'breakable' },
    ],
    mapPos: [9, 3],
  },

  root_2: {
    region: 'root', key: 'room.root_2', w: 48, h: 46,
    build(b) {
      b.border();
      b.floor(1, 42, 40);
      b.clear(0, 39, 1, 3);
      // winding ledges up
      b.plat(10, 38, 4); b.plat(16, 34, 4); b.plat(8, 30, 4); b.plat(14, 26, 4);
      b.plat(7, 22, 6); b.plat(12, 18, 4); b.plat(18, 14, 4); b.plat(24, 12, 3);
      b.plat(30, 10, 4); b.plat(36, 6, 4);
      b.clear(45, 2, 3, 4);
      b.plat(41, 5, 6);
      // Reprise alcove
      b.plat(2, 12, 4);
      // chime-shard side pocket (dash in)
      b.rect(2, 24, 3, 3, 0); b.plat(5, 26, 2);
      // props
      b.prop('shrine', 4, 11, { ability: 'reprise' });
      b.prop('npc', 30, 41, { npc: 'sedge' });
      b.prop('chest', 3, 25, { item: 'chimeshard' });
      b.prop('chest', 43, 4, { item: 'relic', id: 'feather' });
      b.prop('stele', 37, 5, { lore: 'lore.root.2', speaker: 'world.stele' });
      b.prop('lantern', 18, 41, {}); b.prop('lantern', 22, 13, {});
      b.prop('echoes', 34, 41, { amount: 10 });
      b.prop('echoes', 15, 25, { amount: 8 });
    },
    spawns: [
      { t: 'enemy', id: 'grazer', x: 22, y: 41 },
      { t: 'enemy', id: 'grazer', x: 36, y: 41 },
      { t: 'enemy', id: 'sporebell', x: 17, y: 33 },
      { t: 'enemy', id: 'thornrunner', x: 7, y: 21 },
      { t: 'enemy', id: 'thornrunner', x: 31, y: 9 },
      { t: 'enemy', id: 'sporebell', x: 13, y: 17 },
    ],
    exits: [
      { x: 0, y: 39, w: 1, h: 3, to: 'root_1', tx: 60, ty: 24 },
      { x: 45, y: 2, w: 3, h: 4, to: 'root_4', tx: 4, ty: 20 },
    ],
    mapPos: [11, 3],
  },

  root_3: {
    region: 'root', key: 'room.root_3', w: 44, h: 20,
    build(b) {
      b.border();
      b.floor(1, 16, 42);
      b.clear(3, 1, 3, 2); // shaft back up to root_1
      b.plat(3, 4, 3); b.plat(3, 8, 3); b.plat(3, 12, 3);
      b.rect(6, 1, 1, 15, 1);
      b.rect(2, 13, 1, 3, 1);
      // glow grove decor
      b.prop('shroom', 14, 15, {}); b.prop('shroom', 24, 15, {}); b.prop('shroom', 30, 15, {}); b.prop('shroom', 18, 15, {});
      b.prop('memory', 8, 15, { lore: 'lore.echo.4' });
      b.prop('pickup', 34, 15, { item: 'seed' });
      b.prop('chest', 40, 15, { item: 'relic', id: 'lure' });
      b.prop('echoes', 20, 15, { amount: 12 });
    },
    spawns: [
      { t: 'enemy', id: 'sporebell', x: 20, y: 15 },
      { t: 'enemy', id: 'thornrunner', x: 27, y: 15 },
      { t: 'enemy', id: 'grazer', x: 16, y: 15 },
    ],
    exits: [{ x: 3, y: 1, w: 3, h: 2, to: 'root_1', tx: 7, ty: 26, kind: 'climb' }],
    mapPos: [9, 5],
  },

  root_4: {
    region: 'root', key: 'room.root_4', w: 70, h: 30,
    build(b) {
      b.border();
      b.floor(1, 24, 68);
      b.plat(6, 20, 5); b.plat(59, 20, 5);
      b.clear(0, 19, 1, 5); b.clear(69, 19, 1, 5);
      b.prop('lantern', 8, 23, {}); b.prop('lantern', 61, 23, {});
      b.prop('rootsDecor', 35, 2, {});
    },
    spawns: [{ t: 'boss', id: 'rootwife', x: 35, y: 23, trigger: 26 }],
    exits: [
      { x: 0, y: 19, w: 1, h: 5, to: 'root_2', tx: 41, ty: 4 },
      { x: 69, y: 19, w: 1, h: 5, to: 'root_5', tx: 6, ty: 33, seal: 'boss_rootwife' },
    ],
    mapPos: [13, 3],
  },

  root_5: {
    region: 'root', key: 'room.root_5', w: 44, h: 40,
    build(b) {
      b.border();
      b.floor(2, 37, 20); // bottom floor
      b.clear(2, 33, 5, 4); // opening down-left to root_4
      b.clear(0, 33, 1, 5);
      // main shaft x8..16 up to gate_1
      b.rect(16, 2, 6, 33); // right mass
      b.rect(7, 2, 1, 31); // left wall
      b.clear(8, 2, 8, 30); // shaft interior
      b.clear(10, 0, 6, 2); // top opening
      b.floor(1, 34, 7); // small ledge feeding shaft
      // right exit to bell_1 (low right)
      b.clear(43, 30, 1, 4);
      b.floor(22, 34, 21);
      b.rect(17, 30, 5, 4, 1); // step up
      // silk relic pocket (right of shaft, mid-height)
      b.rect(28, 18, 5, 4, 0);
      b.clear(16, 20, 12, 1); b.plat(28, 20, 4);
      // props
      b.prop('tram', 14, 36, {});
      b.prop('chest', 30, 19, { item: 'relic', id: 'silk' });
      b.prop('lantern', 5, 33, {}); b.prop('lantern', 24, 33, {});
      b.prop('echoes', 26, 33, { amount: 12 });
      b.prop('rootsDecor', 12, 12, {});
    },
    spawns: [
      { t: 'npc', id: 'wick2', x: 5, y: 33 },
      { t: 'enemy', id: 'grazer', x: 30, y: 33 },
      { t: 'enemy', id: 'sporebell', x: 38, y: 33 },
    ],
    exits: [
      { x: 10, y: 0, w: 6, h: 2, to: 'gate_1', tx: 45, ty: 4 },
      { x: 0, y: 33, w: 1, h: 5, to: 'root_4', tx: 66, ty: 21 },
      { x: 43, y: 30, w: 1, h: 4, to: 'bell_1', tx: 3, ty: 22 },
    ],
    mapPos: [13, 1],
  },

  // ================================================================ THE BELLFOUNDRY
  bell_1: {
    region: 'bell', key: 'room.bell_1', w: 76, h: 36,
    build(b) {
      b.border();
      b.floor(1, 24, 14); // entry catwalk mass
      b.rect(1, 25, 14, 6, 0); // hollow it out: the wax vat below
      b.clear(0, 20, 1, 4);
      b.clear(15, 24, 6, 1); // dash gap x15..20
      b.spike(16, 30, 4); // vat below
      b.floor(1, 31, 20); // vat floor
      b.rect(21, 24, 1, 8, 1); // vat right wall
      b.floor(21, 24, 28); // mid catwalk x21..48
      b.plat(24, 20, 4); b.plat(34, 17, 4);
      // raised right dock
      b.rect(49, 18, 27, 6, 0);
      b.floor(49, 18, 27);
      b.rect(48, 18, 1, 7, 1);
      b.plat(45, 21, 3);
      b.clear(75, 13, 1, 5);
      b.prop('stele', 26, 23, { lore: 'lore.bell.1', speaker: 'world.stele' });
      b.prop('lantern', 14, 23, {}); b.prop('lantern', 40, 23, {}); b.prop('lantern', 58, 17, {});
      b.prop('echoes', 12, 30, { amount: 12 });
      b.prop('echoes', 60, 17, { amount: 10 });
      b.prop('gearsDecor', 38, 4, {});
    },
    spawns: [
      { t: 'enemy', id: 'stoker', x: 36, y: 23 },
      { t: 'enemy', id: 'bellmaw', x: 44, y: 23 },
      { t: 'enemy', id: 'huskcantor', x: 58, y: 17 },
      { t: 'enemy', id: 'stoker', x: 68, y: 17 },
      { t: 'enemy', id: 'cinderling', x: 8, y: 30 },
    ],
    exits: [
      { x: 0, y: 20, w: 1, h: 4, to: 'root_5', tx: 41, ty: 31 },
      { x: 75, y: 13, w: 1, h: 5, to: 'bell_2', tx: 4, ty: 42 },
    ],
    mapPos: [15, 1],
  },

  bell_2: {
    region: 'bell', key: 'room.bell_2', w: 50, h: 50,
    build(b) {
      b.border();
      // lower hall (arrival, tram, Understudy's stage)
      b.rect(1, 45, 48, 4);
      b.clear(0, 40, 1, 5);
      b.rect(24, 42, 10, 1, 2); b.rect(24, 43, 10, 1, 1); // stage slab
      // bell tower climb: three towers + zigzag rest platforms
      b.rect(1, 8, 8, 27); b.rect(16, 8, 6, 27); b.rect(24, 8, 7, 27);
      b.clear(29, 2, 1, 6); // top exit notch
      b.plat(10, 42, 2); b.plat(13, 38, 2); b.plat(10, 34, 2); b.plat(13, 30, 2);
      b.plat(10, 26, 2); b.plat(13, 22, 2); b.plat(10, 18, 2); b.plat(13, 14, 2);
      b.plat(10, 10, 2);
      // secret breakable pocket to bell_5 (bottom right)
      b.brk(29, 41, 1, 4);
      b.rect(40, 38, 1, 7, 1);
      // props
      b.prop('tram', 8, 44, {});
      b.prop('npc', 28, 41, { npc: 'understudy' });
      b.prop('stele', 31, 44, { lore: 'lore.bell.3', speaker: 'world.mural' });
      b.prop('chest', 3, 5, { item: 'chimeshard' });
      b.prop('lantern', 12, 44, {}); b.prop('lantern', 26, 41, {});
      b.prop('echoes', 36, 44, { amount: 14 });
      b.prop('gearsDecor', 19, 7, {});
    },
    spawns: [
      { t: 'enemy', id: 'huskcantor', x: 11, y: 8 },
      { t: 'enemy', id: 'stoker', x: 13, y: 30 },
      { t: 'enemy', id: 'bellmaw', x: 34, y: 44 },
    ],
    exits: [
      { x: 0, y: 40, w: 1, h: 5, to: 'bell_1', tx: 72, ty: 15 },
      { x: 29, y: 2, w: 1, h: 4, to: 'bell_3', tx: 3, ty: 17 },
      { x: 30, y: 41, w: 1, h: 4, to: 'bell_5', tx: 36, ty: 13, secret: true },
    ],
    mapPos: [17, 2],
  },
  bell_3: {
    region: 'bell', key: 'room.bell_3', w: 60, h: 24,
    build(b) {
      b.border();
      b.floor(1, 20, 58);
      b.clear(0, 16, 1, 4); b.clear(59, 16, 1, 4);
      b.plat(26, 16, 4); b.plat(44, 16, 4);
      b.prop('chest', 52, 19, { item: 'relic', id: 'plate' });
      b.prop('stele', 46, 19, { lore: 'lore.bell.4', speaker: 'world.mural' });
      b.prop('pickup', 56, 19, { item: 'forkpiece' });
      b.prop('lantern', 8, 19, {}); b.prop('lantern', 40, 15, {});
      b.prop('echoes', 30, 19, { amount: 16 });
      b.prop('gearsDecor', 30, 4, {});
    },
    spawns: [
      { t: 'enemy', id: 'huskcantor', x: 10, y: 19 },
      { t: 'elite', id: 'wardenEcho', x: 34, y: 19 },
    ],
    exits: [
      { x: 0, y: 16, w: 1, h: 4, to: 'bell_2', tx: 27, ty: 4 },
      { x: 59, y: 16, w: 1, h: 4, to: 'bell_4', tx: 3, ty: 21 },
    ],
    mapPos: [17, 0],
  },

  bell_4: {
    region: 'bell', key: 'room.bell_4', w: 78, h: 30,
    build(b) {
      b.border();
      b.floor(1, 24, 76);
      b.plat(10, 20, 4); b.plat(34, 20, 4); b.plat(62, 20, 4);
      b.clear(0, 19, 1, 5); b.clear(77, 19, 1, 5);
      b.prop('lantern', 8, 23, {}); b.prop('lantern', 40, 23, {}); b.prop('lantern', 70, 23, {});
      b.prop('gearsDecor', 39, 6, {});
    },
    spawns: [{ t: 'boss', id: 'choirmarshal', x: 56, y: 23, trigger: 26 }],
    exits: [
      { x: 0, y: 19, w: 1, h: 5, to: 'bell_3', tx: 56, ty: 18 },
      { x: 77, y: 19, w: 1, h: 5, to: 'hush_1', tx: 3, ty: 19, seal: 'boss_choirmarshal' },
    ],
    mapPos: [19, 0],
  },

  bell_5: {
    region: 'bell', key: 'room.bell_5', w: 40, h: 20,
    build(b) {
      b.border();
      b.floor(1, 16, 38);
      b.clear(39, 12, 1, 4);
      b.prop('pickup', 8, 15, { item: 'ariamask' });
      b.prop('chest', 12, 15, { item: 'relic', id: 'tempered' });
      b.prop('memory', 20, 15, { lore: 'lore.echo.2' });
      b.prop('lantern', 16, 15, {});
      b.prop('echoes', 32, 15, { amount: 20 });
      b.prop('gearsDecor', 20, 4, {});
    },
    spawns: [{ t: 'enemy', id: 'stoker', x: 30, y: 15 }],
    exits: [{ x: 39, y: 12, w: 1, h: 4, to: 'bell_2', tx: 26, ty: 43 }],
    mapPos: [17, 4],
  },

  // ================================================================ THE HUSH
  hush_1: {
    region: 'hush', key: 'room.hush_1', w: 72, h: 24,
    build(b) {
      b.border();
      b.floor(1, 22, 29); // left floor x1..29
      b.clear(0, 18, 1, 4);
      b.floor(1, 23, 71); // trench floor
      b.rect(46, 18, 26, 5, 0);
      b.floor(46, 18, 26); // raised right floor x46..71
      b.clear(71, 14, 1, 4);
      b.spike(30, 22, 12); // spikes across the trench
      b.rect(29, 4, 1, 18, 1); // climb-out wall left of chasm
      b.prop('hook', 33, 19, {}); b.prop('hook', 41, 18, {}); // hook chain across the spike trench
      b.prop('stele', 6, 21, { lore: 'lore.hush.1', speaker: 'world.stele' });
      b.prop('chest', 67, 17, { item: 'relic', id: 'lamp' });
      b.prop('lantern', 12, 21, {}); b.prop('lantern', 52, 17, {});
      b.prop('echoes', 42, 22, { amount: 14 });
      b.prop('echoes', 55, 17, { amount: 10 });
    },
    spawns: [
      { t: 'enemy', id: 'shadelet', x: 14, y: 21 },
      { t: 'enemy', id: 'gloomwing', x: 24, y: 14 },
      { t: 'enemy', id: 'shadelet', x: 56, y: 17 },
      { t: 'enemy', id: 'gloomwing', x: 62, y: 12 },
    ],
    exits: [
      { x: 0, y: 18, w: 1, h: 4, to: 'bell_4', tx: 74, ty: 21 },
      { x: 71, y: 14, w: 1, h: 4, to: 'hush_2', tx: 3, ty: 15 },
    ],
    mapPos: [21, 0],
  },

  hush_2: {
    region: 'hush', key: 'room.hush_2', w: 60, h: 34,
    build(b) {
      b.border();
      b.floor(1, 18, 20); // entry ledge x1..20
      b.clear(0, 14, 1, 4);
      b.clear(17, 18, 4, 2); // drop into arena
      b.floor(1, 30, 58); // arena floor
      b.plat(14, 26, 4); b.plat(40, 26, 4);
      // right shaft up to hush_3
      b.rect(52, 8, 1, 22, 1);
      b.clear(53, 8, 2, 22);
      b.plat(53, 26, 2); b.plat(53, 22, 2); b.plat(53, 18, 2); b.plat(53, 14, 2); b.plat(53, 10, 2);
      b.rect(55, 8, 5, 4, 1); b.clear(55, 8, 1, 4);
      b.prop('stele', 6, 17, { lore: 'lore.hush.2', speaker: 'world.stele' });
      b.prop('shrine', 48, 29, { ability: 'phase' });
      b.prop('chest', 10, 17, { item: 'relic', id: 'deepcommune' });
      b.prop('lantern', 12, 17, {}); b.prop('lantern', 50, 29, {});
      b.prop('echoes', 44, 29, { amount: 16 });
    },
    spawns: [{ t: 'boss', id: 'warden', x: 30, y: 29, trigger: 18 }],
    exits: [
      { x: 0, y: 14, w: 1, h: 4, to: 'hush_1', tx: 68, ty: 16 },
      { x: 55, y: 8, w: 1, h: 4, to: 'hush_3', tx: 3, ty: 9, seal: 'boss_warden' },
    ],
    mapPos: [23, 1],
  },

  hush_3: {
    region: 'hush', key: 'room.hush_3', w: 60, h: 30,
    build(b) {
      b.border();
      b.floor(1, 12, 30); // main ledge x1..30
      b.clear(0, 8, 1, 4);
      b.veil(26, 6, 1, 6); // veil wall to vault
      b.floor(27, 12, 14); // vault floor x27..40
      b.rect(41, 9, 1, 3, 1); // low lip to hop over
      b.rect(42, 12, 18, 2, 1); // right ledge slab x42..59
      b.clear(50, 12, 4, 2); // drop hole to scr_1
      b.rect(54, 14, 1, 14, 1); // climb-back wall beside the hole
      b.floor(40, 28, 19); // bottom floor
      b.clear(45, 29, 3, 1);
      // great seal right -> heart
      b.clear(59, 8, 1, 4);
      b.rect(50, 2, 5, 7, 1); b.clear(50, 8, 5, 4);
      b.prop('gateDoor', 52, 11, { seal: 'flag_seal_heart' });
      b.prop('tram', 12, 11, {});
      b.prop('stele', 18, 11, { lore: 'lore.hush.3', speaker: 'world.stele' });
      b.prop('chest', 34, 11, { item: 'relic', id: 'veil' });
      b.prop('lantern', 8, 11, {}); b.prop('lantern', 30, 11, {});
      b.prop('echoes', 36, 11, { amount: 12 });
      b.prop('echoes', 50, 27, { amount: 14 });
    },
    spawns: [],
    exits: [
      { x: 0, y: 8, w: 1, h: 4, to: 'hush_2', tx: 53, ty: 11 },
      { x: 59, y: 8, w: 1, h: 4, to: 'heart_1', tx: 3, ty: 31, seal: 'flag_seal_heart' },
      { x: 45, y: 29, w: 3, h: 1, to: 'scr_1', tx: 44, ty: 6, kind: 'hole' },
    ],
    mapPos: [23, 3],
  },

  // ================================================================ THE SCRIPTORIUM
  scr_1: {
    region: 'scr', key: 'room.scr_1', w: 60, h: 28,
    build(b) {
      b.border();
      b.floor(40, 8, 19); // landing top-right x40..58
      b.clear(58, 4, 2, 4);
      b.rect(58, 0, 2, 4, 1);
      b.prop('shrine', 45, 7, { ability: 'undertow' });
      // shelves descending left over shallow water
      b.water(16, 14, 24, 1); // shallow strip
      b.floor(16, 15, 24); // mid shelf
      b.plat(36, 11, 4); b.plat(28, 12, 4); b.plat(20, 13, 4);
      b.floor(1, 20, 26); // lower left floor
      b.clear(0, 16, 1, 4);
      // deep pool with hidden chest
      b.clear(8, 20, 8, 8);
      b.water(8, 20, 8, 8, true);
      b.floor(8, 28, 8);
      b.prop('stele', 24, 14, { lore: 'lore.scr.1', speaker: 'world.stele' });
      b.prop('chest', 12, 27, { item: 'forkpiece' });
      b.prop('lantern', 30, 14, {}); b.prop('lantern', 44, 7, {});
      b.prop('lantern', 20, 14, {});
      b.prop('echoes', 6, 19, { amount: 12 });
      b.prop('echoes', 52, 7, { amount: 8 });
    },
    spawns: [
      { t: 'enemy', id: 'drownedquill', x: 26, y: 13 },
      { t: 'enemy', id: 'drownedquill', x: 36, y: 13 },
      { t: 'enemy', id: 'gloomwing', x: 48, y: 6 },
    ],
    exits: [
      { x: 58, y: 4, w: 2, h: 4, to: 'hush_3', tx: 45, ty: 26 },
      { x: 0, y: 16, w: 1, h: 4, to: 'scr_2', tx: 71, ty: 17 },
    ],
    mapPos: [23, 5],
  },

  scr_2: {
    region: 'scr', key: 'room.scr_2', w: 76, h: 34,
    build(b) {
      b.border();
      b.floor(58, 20, 17); // entry right x58..74
      b.clear(75, 15, 1, 5);
      // canal crossing over deep water
      b.clear(50, 20, 8, 6);
      b.water(50, 20, 8, 6, true);
      b.floor(50, 26, 8);
      b.plat(53, 17, 2); b.plat(57, 15, 2);
      b.floor(10, 20, 40); // main flooded floor x10..49
      b.water(10, 19, 40, 1);
      // stacks shelves
      b.plat(16, 15, 6); b.plat(28, 11, 6); b.plat(40, 15, 6); b.plat(28, 16, 4);
      b.plat(46, 18, 4);
      // codex pages
      b.prop('pickup', 18, 14, { item: 'codex' });
      b.prop('pickup', 31, 10, { item: 'codex' });
      b.prop('pickup', 42, 14, { item: 'codex' });
      // archivist balcony
      b.rect(60, 12, 8, 1, 2); b.rect(60, 13, 8, 1, 1);
      b.plat(56, 16, 3);
      // deep dive shaft to scr_4
      b.clear(12, 20, 5, 1);
      b.water(12, 21, 5, 12, true);
      b.floor(12, 33, 5);
      b.clear(12, 33, 5, 1);
      b.clear(10, 33, 9, 1);
      b.floor(1, 33, 20);
      b.rect(21, 21, 1, 12, 1);
      // veil to scr_3 on the left wall (stand on the raised stack)
      b.rect(1, 14, 10, 6, 1);
      b.clear(2, 8, 9, 6);
      b.veil(1, 8, 1, 6);
      // hidden Long Toll nook below balcony
      b.rect(64, 21, 8, 6, 0);
      b.floor(64, 27, 8);
      b.clear(64, 21, 1, 6);
      b.clear(66, 20, 2, 1); // drop-in hole from the entry floor
      b.prop('npc', 63, 11, { npc: 'archivist' });
      b.prop('chest', 68, 26, { item: 'relic', id: 'longtoll' });
      b.prop('lantern', 20, 19, {}); b.prop('lantern', 34, 19, {}); b.prop('lantern', 62, 11, {});
      b.prop('echoes', 24, 19, { amount: 12 });
      b.prop('echoes', 44, 19, { amount: 12 });
    },
    spawns: [
      { t: 'enemy', id: 'inkfang', x: 34, y: 19 },
      { t: 'enemy', id: 'drownedquill', x: 22, y: 19 },
      { t: 'enemy', id: 'drownedquill', x: 46, y: 19 },
      { t: 'enemy', id: 'gloomwing', x: 60, y: 8 },
    ],
    exits: [
      { x: 75, y: 15, w: 1, h: 5, to: 'scr_1', tx: 3, ty: 18 },
      { x: 13, y: 33, w: 3, h: 1, to: 'scr_4', tx: 12, ty: 3, kind: 'hole', gate: 'water' },
      { x: 0, y: 8, w: 1, h: 6, to: 'scr_3', tx: 51, ty: 17, secret: true },
    ],
    mapPos: [21, 6],
  },

  scr_3: {
    region: 'scr', key: 'room.scr_3', w: 56, h: 26,
    build(b) {
      b.border();
      b.floor(1, 20, 54);
      b.clear(55, 16, 1, 4);
      b.water(18, 19, 14, 1);
      b.plat(24, 15, 4); b.plat(34, 15, 4);
      b.prop('chest', 8, 19, { item: 'relic', id: 'stillaria' });
      b.prop('stele', 13, 19, { lore: 'lore.scr.2', speaker: 'world.stele' });
      b.prop('stele', 44, 19, { lore: 'lore.scr.3', speaker: 'world.stele' });
      b.prop('lantern', 10, 19, {}); b.prop('lantern', 48, 19, {});
      b.prop('echoes', 40, 19, { amount: 20 });
      b.prop('gearsDecor', 28, 4, {});
    },
    spawns: [{ t: 'boss', id: 'librarian', x: 28, y: 19, trigger: 16 }],
    exits: [{ x: 55, y: 16, w: 1, h: 4, to: 'scr_2', tx: 4, ty: 10 }],
    mapPos: [19, 6],
  },

  scr_4: {
    region: 'scr', key: 'room.scr_4', w: 50, h: 26,
    build(b) {
      b.border();
      b.floor(8, 4, 12); // entry platform mass
      b.clear(12, 4, 5, 1); // swim-up opening
      b.clear(12, 0, 5, 1);
      b.water(2, 5, 46, 20, true);
      b.floor(2, 24, 46);
      b.rect(1, 5, 1, 19, 1); b.rect(48, 5, 1, 19, 1);
      b.prop('shrine', 16, 23, { ability: 'sonde' });
      b.prop('chest', 8, 23, { item: 'chimeshard' });
      b.prop('chest', 44, 23, { item: 'relic', id: 'edge' });
      b.prop('memory', 30, 23, { lore: 'lore.echo.3' });
      b.prop('lantern', 22, 23, {}); b.prop('lantern', 38, 23, {});
      b.prop('echoes', 26, 23, { amount: 16 });
    },
    spawns: [
      { t: 'enemy', id: 'drownedquill', x: 24, y: 10 },
      { t: 'enemy', id: 'inkfang', x: 36, y: 18 },
    ],
    exits: [{ x: 12, y: 0, w: 5, h: 1, to: 'scr_2', tx: 14, ty: 30, kind: 'hole', gate: 'water' }],
    mapPos: [21, 8],
  },

  // ================================================================ THE RESONANT HEART
  heart_1: {
    region: 'heart', key: 'room.heart_1', w: 64, h: 40,
    build(b) {
      b.border();
      b.floor(1, 34, 14); // entry floor
      b.clear(0, 30, 1, 4);
      b.set(4, 34, BREAK); b.set(5, 34, BREAK); // breakable drop to the hidden pocket
      b.prop('stele', 8, 33, { lore: 'lore.heart.1', speaker: 'world.stele' });
      // floating white stair
      b.plat(18, 30, 4); b.plat(26, 26, 4); b.plat(34, 22, 4); b.plat(42, 18, 4); b.plat(50, 14, 4);
      b.clear(60, 8, 4, 4);
      b.rect(58, 4, 6, 4, 0);
      b.floor(58, 8, 6);
      b.clear(63, 8, 1, 4);
      b.prop('hook', 30, 22, {});
      b.prop('chest', 52, 13, { item: 'forkpiece' });
      b.prop('chest', 44, 17, { item: 'chimeshard' });
      // lorekeeper secret pocket (veil under entry)
      b.rect(2, 36, 8, 3, 0);
      b.floor(2, 39, 8);
      b.veil(6, 36, 1, 3);
      b.prop('chest', 4, 38, { item: 'relic', id: 'seal' });
      b.prop('lantern', 12, 33, {}); b.prop('lantern', 46, 17, {});
      b.prop('echoes', 28, 25, { amount: 16 });
      b.prop('echoes', 52, 13, { amount: 16 });
    },
    spawns: [
      { t: 'enemy', id: 'echoshade', x: 35, y: 21 },
      { t: 'enemy', id: 'waxsentinel', x: 43, y: 17 },
      { t: 'enemy', id: 'echoshade', x: 20, y: 29 },
    ],
    exits: [
      { x: 0, y: 30, w: 1, h: 4, to: 'hush_3', tx: 56, ty: 10 },
      { x: 63, y: 8, w: 1, h: 4, to: 'heart_2', tx: 3, ty: 23 },
    ],
    mapPos: [25, 4],
  },

  heart_2: {
    region: 'heart', key: 'room.heart_2', w: 80, h: 34,
    build(b) {
      b.border();
      b.floor(1, 26, 78);
      b.plat(12, 22, 4); b.plat(66, 22, 4); b.plat(38, 20, 4);
      b.clear(0, 21, 1, 5); b.clear(79, 21, 1, 5);
      b.prop('lantern', 10, 25, {}); b.prop('lantern', 70, 25, {});
    },
    spawns: [{ t: 'boss', id: 'antiphon', x: 40, y: 24, trigger: 22 }],
    exits: [
      { x: 0, y: 21, w: 1, h: 5, to: 'heart_1', tx: 59, ty: 10 },
      { x: 79, y: 21, w: 1, h: 5, to: 'heart_3', tx: 3, ty: 17, seal: 'boss_antiphon' },
    ],
    mapPos: [27, 4],
  },

  heart_3: {
    region: 'heart', key: 'room.heart_3', w: 56, h: 26,
    build(b) {
      b.border();
      b.floor(1, 20, 54);
      b.clear(0, 16, 1, 4);
      b.prop('stele', 8, 19, { lore: 'lore.heart.2', speaker: 'world.stele' });
      b.prop('npc', 20, 19, { npc: 'understudy2' });
      b.prop('station', 26, 19, { idx: 0 });
      b.prop('station', 33, 19, { idx: 1 });
      b.prop('station', 40, 19, { idx: 2 });
      b.prop('station', 47, 19, { idx: 3 });
      b.prop('lantern', 12, 19, {}); b.prop('lantern', 52, 19, {});
    },
    spawns: [],
    exits: [{ x: 0, y: 16, w: 1, h: 4, to: 'heart_2', tx: 76, ty: 23 }],
    mapPos: [29, 4],
  },
};

// Compile a room definition into {grid, w, h}
// Exit kinds: 'breakable' tiles stay BREAK (player breaks through);
// anything else is carved open.
export function compileRoom(def) {
  const b = new RoomBuilder(def.w, def.h);
  def.build(b);
  for (const e of def.exits) {
    if (e.kind === 'breakable') continue;
    b.clear(e.x, e.y, e.w, e.h);
  }
  return { grid: b.g, w: def.w, h: def.h, props: b.props };
}
