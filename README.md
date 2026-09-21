# THE LONG QUIET

An original, hand-drawn atmospheric 2D Metroidvania. You are a courier-bell —
a small bell with patient legs who carries the post between the last
settlements of a world gone quiet. Strike your tuning-fork Tine, listen for
what answers, and decide what a world owes its silence.

*Every name, place, creature, drawing, line and note in this repository is
original.*

## Play

```bash
npm run serve        # → http://localhost:8080
npm run serve -- 3000  # different port
```

No build step, no dependencies — plain ES modules and Canvas 2D. The dev
server is `tools/serve.js`, a ~150-line static file server on Node's built-in
`http`, so it needs nothing but **Node ≥ 18** and works the same on Windows,
macOS and Linux (no Python, no `npx` download).

## Controls (default, remappable in Settings)

| action | keys |
|---|---|
| move | ← → / A D |
| jump | Space / Z |
| strike (Tine) | X / J |
| Toll Step (dash) | C / Shift |
| Sonde (sound pulse) | V / K |
| Echo Hook | L |
| Commune (heal at lit chimes) | F / I |
| interact | E / Enter |
| map / journal | M / G |
| pause | Esc |

Gamepad supported. Language: **English / Italiano** in Settings.

## What's inside

- 6 regions, 24 interconnected rooms, 6 major bosses, 15 enemies + an elite
- 8 abilities, 14 relics with real trade-offs, 4 ending paths, 44 achievements
- full English + Italian localization of every string
- accessibility: screen-shake and flash toggles, reduced darkness, colorblind
  telegraphs, text size, control remapping

## Development

```bash
npm run check        # static validation (i18n parity, room graph, refs)
npm run sim          # headless simulation: every room, enemy, boss, system
node tools/boot.js   # headless boot smoke test (title → new game → traversal)
```

Architecture, content canon, and step-by-step extension guides (rooms,
enemies, bosses, abilities, NPCs, dialogue, localization, endings, balancing)
live in [DESIGN.md](DESIGN.md).
