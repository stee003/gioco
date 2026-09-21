// data/enemies.js — stat blocks for every enemy. Behavior implementations live in
// game/enemies.js (one behavior function per archetype), so new enemies are pure data.
// hp is measured in Tine hits (base damage 10). dmg is in Chimes (player max HP units).
export const ENEMIES = {
  cinderling: {
    name: 'Cinderling', behavior: 'walker',
    hp: 30, dmg: 1, echoes: 9, speed: 55, aggro: 240,
    w: 30, h: 22, palette: '#d88a4a', zone: 'gate',
    note: 'Larva of the lamp-moths. It eats warmth now; candles, lamps, travellers.',
  },
  palewisplet: {
    name: 'Pale Wisplet', behavior: 'flyer',
    hp: 16, dmg: 1, echoes: 7, speed: 70, aggro: 300,
    w: 24, h: 24, palette: '#cfd8ec', zone: 'gate',
    note: 'A stray scrap of recorded voice, still trying to finish its sentence.',
  },
  sporebell: {
    name: 'Sporebell', behavior: 'turret',
    hp: 24, dmg: 1, echoes: 12, speed: 0, aggro: 340, range: 300,
    w: 30, h: 30, palette: '#9fd47a', zone: 'root',
    note: 'Song-fed puffball. Rings softly before it spits — listen for it.',
  },
  thornrunner: {
    name: 'Thornrunner', behavior: 'charger',
    hp: 40, dmg: 1, echoes: 14, speed: 60, charge: 340, aggro: 300,
    w: 40, h: 26, palette: '#7aa84f', zone: 'root',
    note: 'Garden pruner gone feral. Charges anything that walks like a wheelbarrow.',
  },
  grazer: {
    name: 'Grazer', behavior: 'grazer',
    hp: 8, dmg: 0, echoes: 6, speed: 90, aggro: 260,
    w: 34, h: 24, palette: '#b0d8a0', zone: 'root',
    note: 'Moss-deer. Fears the thornrunners more than you. Mostly.',
  },
  stoker: {
    name: 'Stoker', behavior: 'hopper',
    hp: 45, dmg: 1, echoes: 18, speed: 70, aggro: 320,
    w: 34, h: 34, palette: '#c07840', zone: 'bell',
    note: 'Foundry stoker-frame. Still keeps the beat of a shift that ended centuries ago.',
  },
  bellmaw: {
    name: 'Bellmaw', behavior: 'armored',
    hp: 70, dmg: 1, echoes: 26, speed: 40, aggro: 280,
    w: 44, h: 40, palette: '#8a8a96', zone: 'bell',
    note: 'A cracked bell that learned to walk. Its face rings your strikes away.',
  },
  huskcantor: {
    name: 'Husk Cantor', behavior: 'beam turret',
    hp: 36, dmg: 1, echoes: 16, speed: 0, aggro: 420, range: 380,
    w: 28, h: 40, palette: '#b0a890', zone: 'bell',
    note: 'A choir robe with nobody in it. It hums the pitch; then it fires the pitch.',
  },
  shadelet: {
    name: 'Shadelet', behavior: 'sleeper',
    hp: 34, dmg: 1, echoes: 14, speed: 130, aggro: 230,
    w: 30, h: 34, palette: '#2a3050', zone: 'hush',
    note: 'Sleeps standing, like a horse of dark. Wakes for footsteps, not for lamplight.',
  },
  gloomwing: {
    name: 'Gloomwing', behavior: 'diver',
    hp: 28, dmg: 1, echoes: 12, speed: 90, aggro: 300,
    w: 34, h: 24, palette: '#3a4266', zone: 'hush',
    note: 'A bat that hung itself among the drowned lamps and forgot which way was up.',
  },
  drownedquill: {
    name: 'Drowned Quill', behavior: 'aquatic jumper',
    hp: 22, dmg: 1, echoes: 10, speed: 120, aggro: 280,
    w: 30, h: 26, palette: '#5ab0a8', zone: 'scr',
    note: 'Ink-fish that ate a library. Leaps at anything that turns a page.',
  },
  inkfang: {
    name: 'Inkfang', behavior: 'aquatic ambusher',
    hp: 55, dmg: 2, echoes: 22, speed: 200, aggro: 260,
    w: 46, h: 30, palette: '#28485a', zone: 'scr',
    note: 'The thing with teeth the Archivist warned about. It eats quills first, scholars second.',
  },
  echoshade: {
    name: 'Echo Shade', behavior: 'mirror',
    hp: 60, dmg: 1, echoes: 24, speed: 260, aggro: 380,
    w: 24, h: 40, palette: '#8a7ab8', zone: 'heart',
    note: 'A courier who never finished a delivery, still walking the route in the white air.',
  },
  waxsentinel: {
    name: 'Wax Sentinel', behavior: 'sentinel',
    hp: 80, dmg: 1, echoes: 30, speed: 60, aggro: 360, range: 340,
    w: 36, h: 44, palette: '#d8cfe8', zone: 'heart',
    note: 'Candle-wax over old armor. Guards the stair of the Heart from everything, including you.',
  },
  wardenEcho: {
    name: 'Warden Echo', behavior: 'elite',
    hp: 130, dmg: 1, echoes: 60, speed: 90, aggro: 420,
    w: 52, h: 52, palette: '#c9a86a', zone: 'bell', elite: true,
    note: 'An echo of the Tollmaster\u2019s oath, stamped into armor. Swings a duty that no longer exists.',
  },
};
