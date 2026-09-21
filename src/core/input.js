// core/input.js — unified keyboard / gamepad input with remapping.
// Actions are abstract; `keys` maps action -> array of key names.
// Keyboard state and gamepad state are tracked separately and OR-ed.
export const ACTIONS = [
  'left', 'right', 'up', 'down',
  'jump', 'attack', 'dash', 'sonde', 'hook', 'heal', 'interact', 'map', 'journal', 'pause'
];

export const DEFAULT_KEYS = {
  left: ['ArrowLeft', 'a'], right: ['ArrowRight', 'd'],
  up: ['ArrowUp', 'w'], down: ['ArrowDown', 's'],
  jump: [' ', 'z'], attack: ['x', 'j'], dash: ['c', 'Shift'],
  sonde: ['v', 'k'], hook: ['c', 'l'], heal: ['f', 'i'], interact: ['e', 'Enter'],
  map: ['m', 'Tab'], journal: ['g', 'n'], pause: ['Escape', 'p']
};

export const PAD_MAP = {
  left: { axis: 0, dir: -1, btn: 14 }, right: { axis: 0, dir: 1, btn: 15 },
  up: { axis: 1, dir: -1, btn: 12 }, down: { axis: 1, dir: 1, btn: 13 },
  jump: { btn: 0 }, attack: { btn: 2 }, dash: { btn: 1 },
  sonde: { btn: 3 }, hook: { btn: 2 }, heal: { btn: 6 }, interact: { btn: 0 },
  map: { btn: 9 }, journal: { btn: 8 }, pause: { btn: 9 }
};
const AXIS_THRESH = 0.45;

export class Input {
  constructor() {
    this.keys = { ...DEFAULT_KEYS };
    this.down = {};        // action -> bool (combined)
    this.pressed = {};     // action -> went down this frame
    this.released = {};    // action -> went up this frame
    this.usingPad = false;
    this.captureCallback = null;   // set by settings UI while remapping
    this._kheld = new Set();
    this._pheld = new Set();

    window.addEventListener('keydown', e => this._onKey(e, true));
    window.addEventListener('keyup', e => this._onKey(e, false));
    window.addEventListener('blur', () => { this._kheld.clear(); this._pheld.clear(); this._recompute(); });
    window.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
    });
  }

  _onKey(e, isDown) {
    if (this.captureCallback) {
      this.captureCallback(e); this.captureCallback = null; e.preventDefault(); return;
    }
    if (e.repeat) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let hit = false;
    for (const act of ACTIONS) if (this.keys[act] && this.keys[act].includes(k)) {
      if (isDown) this._kheld.add(act); else this._kheld.delete(act);
      hit = true;
    }
    if (hit) this._recompute();
  }

  _pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    this._pheld.clear();
    this.usingPad = !!pad;
    if (!pad) return;
    const btn = i => pad.buttons[i] && pad.buttons[i].pressed;
    for (const act of ACTIONS) {
      const m = PAD_MAP[act];
      let v = false;
      if (m.btn !== undefined && btn(m.btn)) v = true;
      if (m.axis !== undefined && pad.axes[m.axis] !== undefined &&
          (m.dir < 0 ? pad.axes[m.axis] < -AXIS_THRESH : pad.axes[m.axis] > AXIS_THRESH)) v = true;
      if (v) this._pheld.add(act);
    }
  }

  _recompute() {
    for (const act of ACTIONS) {
      const was = this.down[act];
      const now = this._kheld.has(act) || this._pheld.has(act);
      this.down[act] = now;
      if (now && !was) this.pressed[act] = true;
      if (!now && was) this.released[act] = true;
    }
  }

  // call at the START of each frame (after events have queued)
  poll() { this._pollPad(); this._recompute(); }
  endFrame() { this.pressed = {}; this.released = {}; }

  // virtual presses for UI/sim (e.g. scripted tutorials, headless tests)
  virtual(act, isDown) {
    if (isDown && !this.down[act]) this.pressed[act] = true;
    if (!isDown && this.down[act]) this.released[act] = true;
    this.down[act] = isDown;
  }
}
