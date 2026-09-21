// core/save.js — save slots, settings, corruption-safe persistence (localStorage).
const SAVE_PREFIX = 'tlq.save.';
const SET_KEY = 'tlq.settings';
const BACKUP_SUFFIX = '.bak';
const VERSION = 1;

export const DEFAULT_SETTINGS = {
  language: 'en',
  master: 0.8, music: 0.7, sfx: 0.9,
  shake: 1.0,            // 0..1 screen-shake intensity
  flashes: true,         // allow bright flashes
  textSize: 'md',        // sm | md | lg
  subtitles: true,
  reduceDarkness: false, // accessibility: lift The Hush's darkness
  colorblind: false,     // telegraphs use blue/orange scheme + patterns
  uiScale: 1.0,
  controls: null,        // remapped keybinds {action: [keys]} — null = defaults
};

export function freshSave(slotMeta = '') {
  return {
    version: VERSION,
    created: Date.now(),
    modified: Date.now(),
    meta: slotMeta,             // label shown in slot list
    room: 'gate_1', spawn: { x: 4, y: 7 }, respawn: null, // reverberation (death echo) location
    flags: [],                  // world flags (quests, bosses, doors...)
    abilities: [],
    relics: [],                 // owned relic ids
    equipped: [null, null, null, null],
    maxChimes: 5, chimeShards: 0, forkPieces: 0,
    chimes: 5, aria: 0, maxAria: 99,
    echoes: 0, totalEchoes: 0,
    lore: [],                   // collected lore fragment ids
    rooms: [],                  // discovered room ids
    chimesLit: [],              // rest-chime checkpoints activated (room:id)
    trams: [],                  // activated tram anchors
    deaths: 0, playtime: 0, kills: 0,
    achievements: [],
    ending: null,               // set after finishing the game
    newGamePlus: false,
  };
}

export class SaveSystem {
  constructor() { this.current = null; this.slotIndex = null; }

  listSlots() {
    const out = [];
    for (let i = 0; i < 3; i++) {
      try {
        const raw = localStorage.getItem(SAVE_PREFIX + i);
        out.push(raw ? JSON.parse(raw) : null);
      } catch { out.push(null); }
    }
    return out;
  }

  saveToSlot(i, data) {
    data.modified = Date.now();
    const key = SAVE_PREFIX + i;
    try {
      const raw = localStorage.getItem(key);
      if (raw) localStorage.setItem(key + BACKUP_SUFFIX, raw);   // keep one backup
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) { console.warn('save failed', e); }
  }

  loadSlot(i) {
    try {
      const raw = localStorage.getItem(SAVE_PREFIX + i);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // corruption guard: fall back to backup
      if (!data || data.version === undefined) throw new Error('bad save');
      return this._migrate(data);
    } catch (e) {
      try {
        const raw = localStorage.getItem(SAVE_PREFIX + i + BACKUP_SUFFIX);
        if (raw) return this._migrate(JSON.parse(raw));
      } catch {}
      return null;
    }
  }

  _migrate(d) { // forward-compatible: fill missing fields from fresh template
    const base = freshSave();
    const out = { ...base, ...d };
    out.version = VERSION;
    return out;
  }

  deleteSlot(i) { try { localStorage.removeItem(SAVE_PREFIX + i); localStorage.removeItem(SAVE_PREFIX + i + BACKUP_SUFFIX); } catch {} }

  // settings are global (not per save slot)
  loadSettings() {
    try { const raw = localStorage.getItem(SET_KEY); return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }; }
    catch { return { ...DEFAULT_SETTINGS }; }
  }
  saveSettings(s) { try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch {} }
}
