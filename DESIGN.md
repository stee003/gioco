# THE LONG QUIET — Design & Architecture

An original, hand-drawn atmospheric 2D Metroidvania. You are a courier-bell —
a small bell with patient legs who carries the post between the last settlements
of a world gone quiet. Your weapon is the **Tine**, a tuning-fork blade. Every
sound you make has a cost, and the quiet listens.

> **Originality covenant:** every name, place, creature, line, drawing and note
> in this project is original. Nothing is derived from any existing game. When
> extending the game, invent new things; never import another game's identity.

---

## 1. Running it

```bash
npm run serve     # http://localhost:8080  (or the preview URL)
npm run check     # static validation: i18n parity, room graph, prop/spawn sanity
npm run sim       # headless simulation of every room, enemy, boss, system
node tools/boot.js  # headless boot: title → new game → traversal (stubbed DOM)
```

The game is plain ES modules on Canvas 2D — no build step, no dependencies.

---

## 2. Core fiction (canon — do not re-derive)

- **Protagonist:** a courier-bell, unknowingly carrying the spindle of Ede, the
  Last Cantor (a nine-year-old who sang the Last Verse). The spindle is why the
  quiet follows you — and why it cannot keep you.
- **Chimes = health.** You begin with 5. A **Chime Shard** (2 fragments → +1).
- **Aria** — breath-note resource (cap 99) gained by landing strikes; spent on
  the Sonde and on **Commune** (33 Aria → +1 chime at a lit chime).
- **Echoes** — currency. On death they fall where you died as a
  **Reverberation**; strike it to reclaim them. Die again before that and they
  are gone.
- **8 abilities:** Toll Step (dash), Reprise (air-jump), Chime Grasp
  (wall-cling), Echo Hook (grapple), Phase Step (through veils), Undertow (free
  deep-water swimming), Sonde (sound-pulse reveal), Commune (heal).
- **6 major bosses:** the Tollmaster, the Rootwife, Cantor-Marshal Verregan,
  the Warden of Hush, the Librarian, the Antiphon.
- **NPCs:** Wick (lamplighter), Murmur (relic trader), Sedge (seed-keeper), the
  Understudy (Cracked Aria mask), the Archivist (3 Codex Pages → Route Nine).
- **4 endings** chosen at the Conclave (heart_3):
  1. **The Severing** — always available.
  2. **The Last Verse** — ≥ 12 lore fragments.
  3. **The New Chord** — Sedge's seed + the Understudy's mask + ≥ 8 lore.
  4. **Walk the Quiet** — Route Nine + the Librarian spared + all four trams +
     all friends met. (None are moralized; each is a different way to hold a
     world that has stopped singing.)
- **44 achievements**, evaluated from save flags so they survive load/NG+.

---

## 3. Architecture

```
index.html            canvas #game 1280×720, loads src/style.css + src/main.js
src/main.js           bootstrap: settings → i18n/audio/input, ctx wiring,
                      fixed-step loop (1/60, ≤4 catch-up steps), resize letterbox
src/core/
  utils.js            TILE, math helpers, RNG, easing, tilesInRect
  input.js            action-mapped keyboard/gamepad, remapping, virtual actions
  save.js             3 slots (+.bak fallback, migration), settings, freshSave
  i18n.js             t(key, vars), ta(key) for arrays; EN fallback; singleton `it`
  audio.js            procedural WebAudio engine: region ambiences, boss layers,
                      ~22 SFX, setSettings (volumes), unlock on first gesture
  fx.js               pooled particles, floaters, shake, hitstop, flash
src/data/
  strings.en.js       ALL user-facing English text (canon)
  strings.it.js       complete Italian mirror
  world.js            REGIONS, ROOMS (24), RoomBuilder, compileRoom
  enemies.js          15 stat blocks (14 enemies + elite wardenEcho)
  relics.js           14 relics with trade-offs + shop order
  achievements.js     44 predicates f(flags, s) over a save-shaped adapter
src/game/
  player.js           movement, abilities, combat, water/veil/hook, render
  enemies.js          Enemy class, 15 behaviors, hand-drawn draw fns
  world.js            room lifecycle, tiles, combat surface, zones, death,
                      exits/transitions (incl. boss-sealed + breakable),
                      interactions, camera, achievements adapter
  bosses.js           6 boss pattern machines + draw fns
  npcs.js             5 NPC draw fns + talk() dialogue machines
  render.js           cached room-tile canvas, parallax, lighting, vignette
  ui.js               HUD, dialogue, and every overlay (title…ending)
tools/
  check.js            static validation (i18n parity, graph, refs)
  sim.js              headless full-system simulation
  boot.js             headless boot smoke test (stubbed DOM/canvas/audio)
```

**Data-driven rule:** content lives in `src/data/`, systems in `src/game/` +
`src/core/`. A room, enemy, relic, achievement, or string should never require
touching a system file beyond registration in its data table.

**The ctx contract.** One shared context object
`{ player, world, ui, i18n, audio, input, fx, saveSys, settings, startGame, toTitle }`
is passed to every system. `world.ctx` and `ui.ctx` are the same object.
`main.js` owns it; nothing imports `main.js`.

**Update loop.** `main.js` runs a fixed 60 Hz step. Each frame:
`ui.modal ? ui.update + fx : player alive ? world.update + fx + ui : ui + fx`,
then `renderer.draw` + `ui.draw`. Global keys (map / journal / pause) are
handled in `main.js` so overlays stay consistent.

---

## 4. How to extend

### 4.1 Regions & rooms (`src/data/world.js`)

A room is a plain object:

```js
my_crypt: {
  region: 'gate', key: 'room.my_crypt',   // i18n key for the map label
  w: 60, h: 30,                            // in tiles (TILE = 32)
  build(b) { /* geometry + props, see below */ },
  spawns: [ { t: 'enemy', id: 'cinderling', x: 20, y: 13 } ],
  exits: [ { x: 59, y: 14, w: 1, h: 4, to: 'gate_2', tx: 2, ty: 17 } ],
  start: { x: 4, y: 7 },                   // only on the game's first room
  mapPos: [3, 4],                          // grid cell on the pause map
}
```

`build(b)` receives a `RoomBuilder`:

| call | meaning |
|---|---|
| `rect(x,y,w,h,v=1)` | fill tiles (1 SOLID) — **v = 0 carves** |
| `floor(x,y,w)` | solid **from y to the room bottom** (ground mass) |
| `wall(x,y,h)` | 1-wide vertical run |
| `plat(x,y,w)` | one-way platform (2) |
| `spike(x,y,w)` | spikes (3) |
| `brk(x,y,w,h)` | breakable tiles (4) |
| `water(x,y,w,h,deep)` | water (6) / deep water (5) |
| `veil(x,y,w,h)` | phase-veil tiles (7) |
| `prop(type,tx,ty,extra)` | place an interactive/decor object |

**`floor` fills downward** — it is ground mass, not a slab. Use `rect` with an
explicit height when you want a floating slab, and remember a later `clear`
carves through earlier fills.

Props: `stele`/`memory` (lore), `shrine` (ability), `chest`
(`{item:'relic'|'chimeshard'|'forkpiece', id?}`), `pickup`
(`{item:'seed'|'ariamask'|'codex'}`), `echoes` (`{amount}`), `lantern`,
`tram`, `station` (`{idx 0-3}` Conclave), `gateDoor` (`{seal}`), `hook`,
`chalk`, `shroom`, `rootsDecor`, `gearsDecor`, `npc` (`{npc:'wick'}`).

Exits: `{x,y,w,h,to,tx,ty}` plus optional:
- `seal:'boss_<id>'` or `'flag_<name>'` — locked until the flag exists;
- `gate:'climb'|'water'` — requires wall-climb reach / Undertow (deep water
  blocks sinking without it);
- `kind:'hole'` — not carved open (a fall/swim-through opening);
- `kind:'breakable'` — tiles stay `BREAK`; the player strikes through them;
- `secret:true` — hidden from the map until visited.

**Rule: exits are cleared open by `compileRoom` unless `kind` says otherwise.**
New regions: add a palette entry to `REGIONS` (`pal`, `parallax`, `darkness`,
`amb`, `music`) and paint its parallax in `render.js drawParallax`.

After editing rooms run `npm run check` — it compiles every room, verifies
bounds, ground under spawns, bidirectional exits, and full-graph reachability.

### 4.2 Enemies (`src/data/enemies.js` + `src/game/enemies.js`)

Add a stat block to `data/enemies.js`:

```js
emberkid: { hp: 14, dmg: 1, echoes: 9, behavior: 'hopper', w: 26, h: 22,
            nameKey: 'enemy.emberkid' },
```

Then in `game/enemies.js`: a `BEHAVIORS.emberkid(e, dt, ctx)` function
(movement/AI; `e` is the Enemy instance) and a `DRAW.emberkid(c, e, t)` function
(hand-drawn vector render). Behaviors available to reuse: `walker`, `hopper`,
`turret`, `floater`, `diver`, `charger`, `aquatic`, plus elite `wardenEcho`.
Aquatic enemies should spawn near their water: the constructor stores
`_waterY` from their spawn position.

Wire the enemy into rooms via `spawns`. `npm run sim` exercises every behavior
for 4 in-game minutes — run it.

### 4.3 Bosses (`src/game/bosses.js`)

Add to `BOSS_DEFS`:

```js
myboss: { hp: 300, w: 90, h: 90, nameKey: 'boss.myboss', subKey: 'boss.myboss.sub',
          phases: [.6, .25], ability: 'tollstep', quote: 'boss.myboss.dead' },
```

Implement `UPDATES.myboss(b, dt, ctx, world)` — a small state machine over
`b.state` (e.g. `idle → swing → recover`), and `DRAWB.myboss(c, b, t)`.
Rules the base class gives you:
- `b.hit(dmg, info, ctx)` — vulnerability gating goes in `_isBlocked(info)`
  (e.g. the Rootwife is pods-only until stunned; the Antiphon only after a toll).
- Phase transitions fire automatically at `phases[]` fractions → `_enterPhase`.
- On death the base class shows the quote, grants `def.ability`, sets
  `boss_<id>` and (for the Choirmarshal) unseals the heart vault.
- Spawn via room `spawns: [{ t:'boss', id:'myboss', x, y, trigger: <px> }]`
  — the player crosses the trigger line in-room and the fight begins; the room
  exit seals until it ends.

`npm run sim` kills every boss through its real death path.

### 4.4 Abilities (`src/game/player.js`)

Abilities are strings in `player.unlocked` (starts with `'commune'`). To add
one: an input branch in `Player.update`, an effect (and usually a
`ctx.audio.sfx` + `ctx.fx` call), a HUD icon in `ui.js`, an entry in the
shrine `prop('shrine', …, {ability:'id'})` chain, and strings
(`ability.<id>.name/.desc`). Keep the trade-off philosophy: every ability costs
Aria, slots, or exposure.

### 4.5 Relics (`src/data/relics.js`)

```js
whetstone: { nameKey: 'relic.whetstone.name', descKey: 'relic.whetstone.desc',
             cost: 180 },
```

`descKey` should state the **trade-off plainly** (e.g. *Brittle Bell: +2
chimes, but take 35% more damage and your bell cracks — max 4*). Effects are
applied in `Player.stats()` (read from the **equipped** set `p.relics`, max 4
cords; the full collection is `p.relicsOwned`). Distribution: Murmur's shop
(`RELIC_SHOP_ORDER` order) or `prop('chest', …, {item:'relic', id})`.

### 4.6 NPCs & dialogue (`src/game/npcs.js` + strings)

Add a draw function to `npcs.js` and a `talk()` branch:

```js
if (id === 'myfriend') {
  steps.push({ d: 'd.myfriend.1' });                    // line (array = paged)
  steps.push({ d: 'd.myfriend.2', reward: 60 });        // +60 echoes
  steps.push({ d: 'd.myfriend.3', set: 'quest_myfriend_done' });
  steps.push({ d: 'd.myfriend.4', shop: true });        // opens Murmur-style shop
}
```

Gate steps on flags (`met_*`, `quest_*_done`, `has_seed`, `codex` count) so
conversations evolve. Speaker names use `npc.<id>` string keys (a trailing `2`
in the room spawn id is stripped — `wick2` speaks as `npc.wick`). All line text
lives in the two strings files, never in code.

### 4.7 Localization (EN / IT)

**Every user-facing string** lives in `src/data/strings.en.js` (canon) and is
mirrored in `src/data/strings.it.js`. Access with `i18n.t('key', vars)` or
`i18n.ta('key')` for line arrays. There is **no** `language === 'it' ? … : …`
in game code — `npm run check` fails the build on missing/extra keys, so add
both keys at once. Language is chosen in Settings and persisted globally.

### 4.8 Endings & Conclave

Eligibility matrix is in `ui.js` (`_elig`): the Severing always; Last Verse at
≥ 12 lore; New Chord with seed + mask + ≥ 8 lore; Walk the Quiet with Route
Nine + Librarian + all 4 trams + all quests. Choosing sets `ending_<n>` flags
(persisted, drives achievements and NG+). Ending prose is `ending.<n>.text`
line arrays in both locales.

### 4.9 Achievements

Predicates in `data/achievements.js` receive a save-shaped adapter built by
`world.checkAchievements()`: `{ rooms[], has(f), abilities[], relics[],
lore[], chimesLit[], trams[], ending, newGamePlus }` plus stat counters.
Add the predicate **and** its `ach.<id>.n/.d` strings in both locales.

---

## 5. Balancing notes (current tuning)

- Player: run 300 px/s, jump −790 (≈ 125 px apex — **ledges ≤ 3 tiles**),
  coyote 0.1 s, buffer 0.12 s. Toll Step 560 px/s × 0.16 s, cd 0.45 s.
- Combat: combo 10/10/14, charged 26 (hold ≥ 0.45 s), pogo refreshes air
  options and chains (`maxPogo` feeds an achievement).
- Boss HP: 320 / 420 / 460 / 260 / 380 / 700 — tune up in NG+ (`flags.has('ngp')`
  multiplies enemy hp/dmg in `Enemy`/`Boss` construction).
- Economy: relics cost 150–420 echoes; enemy echoes 6–22; elite 60; boss 120.
- Feel levers: `fx.hitstop` on heavy hits, shake cap 14, flash respect
  `settings.flashes`; darkness respects `settings.reduceDarkness`.
- The Hush (silence region) punishes speed: noise > 260 px/s (dash, strike)
  raises the Warden's attention — this is the intended "slow down" lesson.

## 6. Validation workflow

1. `npm run check` — data integrity, i18n parity, graph reachability.
2. `npm run sim` — every room/enemy/boss/system headless.
3. `node tools/boot.js` — real `main.js` boot: title → new game → traversal.
4. Playtest in the browser (cross-room traversal, combat feel, audio).
