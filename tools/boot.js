// tools/boot.js — headless boot smoke test: stubs DOM/canvas, imports the real
// src/main.js, runs the fixed-step loop through title → new game → gameplay.
let failures = 0;
const err = m => { failures++; console.error('✗', m); };
const ok = m => console.log('✓', m);

// ---- canvas 2d context stub (records nothing, returns safe values)
const gradient = { addColorStop() {} };
const ctx2d = () => new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => gradient;
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (k === 'canvas') return { width: 1280, height: 720 };
    if (typeof k === 'string') return t[k] !== undefined ? t[k] : () => {};
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});

function makeCanvas() {
  const el = {
    width: 1280, height: 720, style: {},
    getContext: () => ctx2d(),
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    focus() {}, requestPointerLock() {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, appendChild() {},
  };
  return el;
}

// ---- DOM stub
const elements = {};
const makeEl = (tag) => {
  const el = makeCanvas();
  el.tagName = (tag || 'div').toUpperCase();
  el.innerHTML = ''; el.textContent = '';
  el.style = {};
  el.appendChild = () => {}; el.removeChild = () => {};
  el.querySelector = () => makeEl('div'); el.querySelectorAll = () => [];
  el.addEventListener = () => {}; el.remove = () => {};
  return el;
};
const canvasEl = makeCanvas();
canvasEl.id = 'game';

globalThis.window = globalThis;
globalThis.requestAnimationFrame = fn => { globalThis.__rafQueue.push(fn); return globalThis.__rafQueue.length; };
globalThis.__rafQueue = [];
globalThis.performance = { now: () => globalThis.__now };
globalThis.__now = 0;
globalThis.localStorage = (() => {
  const store = {};
  return { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
})();
// capture event listeners so the harness can drive the Input class
globalThis.__listeners = {};
globalThis.addEventListener = (type, fn) => { (globalThis.__listeners[type] ||= []).push(fn); };
globalThis.removeEventListener = () => {};

globalThis.document = {
  getElementById: id => (id === 'game' ? canvasEl : (elements[id] ||= makeEl('div'))),
  createElement: tag => makeEl(tag),
  addEventListener() {}, removeEventListener() {},
  body: makeEl('body'), documentElement: makeEl('html'),
  hidden: false, visibilityState: 'visible',
};
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
const node = () => {
  const n = { connect: () => n, disconnect() {}, start() {}, stop() {}, onended: null };
  n.gain = param(); n.frequency = param(); n.detune = param(); n.Q = param(); n.delayTime = param(); n.threshold = param(); n.ratio = param(); n.playbackRate = param(); n.offset = param();
  n.type = '';
  return n;
};
globalThis.AudioContext = class {
  constructor() { this.destination = node(); this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; }
  resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); }
  createGain() { return node(); } createOscillator() { return node(); } createBufferSource() { return node(); }
  createBiquadFilter() { return node(); } createDynamicsCompressor() { return node(); } createDelay() { return node(); }
  createStereoPanner() { return node(); } createWaveShaper() { return node(); } createScriptProcessor() { return node(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len || 8), duration: 1 }; }
  decodeAudioData() { return Promise.resolve(this.createBuffer(1, 8)); }
};
globalThis.webkitAudioContext = globalThis.AudioContext;
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'sim', maxTouchPoints: 0, getGamepads: () => [] }, configurable: true }); } catch { /* node ≥21 has a real navigator */ }
globalThis.Image = class { constructor() { this.width = 0; this.height = 0; } set src(_) {} addEventListener() {} };

// ---- import the real bootstrap
try {
  await import('../src/main.js');
  ok('main.js module scope executed');
} catch (e) { err('boot: ' + e.stack); process.exit(1); }

// ---- drive frames
const STEP_MS = 1000 / 60;
async function frames(n) {
  for (let i = 0; i < n; i++) {
    globalThis.__now += STEP_MS;
    const q = globalThis.__rafQueue.splice(0);
    for (const fn of q) fn(globalThis.__now);
    if (!globalThis.__rafQueue.length) throw new Error('loop stopped scheduling frames');
  }
}
function key(k, type = 'keydown') {
  const ev = { key: k, code: k, preventDefault() {}, repeat: false };
  for (const fn of (globalThis.__listeners[type] || [])) fn(ev);
}
// hold a key down across `frames` frames, then release
async function hold(k, n) { key(k, 'keydown'); await frames(n); key(k, 'keyup'); }

try {
  await frames(30);
  ok('title screen runs (30 frames)');
} catch (e) { err('title loop: ' + e.stack); process.exit(1); }

try {
  // drive the real UI: confirm on title → slots → confirm on slot 1 → gameplay
  key('Enter'); await frames(30);   // title → slots
  key('Enter'); await frames(30);   // confirm slot 1 → startGame
  await frames(60);                 // gameplay frames (blank room / gate_1)
  // move + jump + attack + map + journal + pause roundtrip
  await hold('ArrowRight', 60);
  await hold(' ', 10);
  await hold('x', 10);
  key('m'); await frames(20); key('m'); await frames(10);
  key('g'); await frames(20); key('g'); await frames(10);
  key('Escape'); await frames(20); key('Escape'); await frames(20);
  await frames(60);
  ok('title → new game → movement → map/journal/pause roundtrip');

  // traversal probe: walk/jump right out of gate_1 into gate_2, then keep going
  const G = globalThis.window.__TLQ;
  if (!G || !G.player) err('no __TLQ debug handle');
  else {
    console.log(`  spawn state: room=${G.world.roomId} p=(${Math.round(G.player.x)},${Math.round(G.player.y)}) respawn=${JSON.stringify(G.world.respawnPoint)}`);
    const startRoom = G.world.roomId;
    let maxRight = 0, gotHit = false, deaths = 0;
    for (let seg = 0; seg < 90 && G.world.roomId === 'gate_1'; seg++) {
      key('ArrowRight', 'keydown');
      if (seg % 3 === 2) key(' ', 'keydown'); else if (seg % 3 === 2) {}
      await frames(22);
      key(' ', 'keyup');
      if (seg % 5 === 4) { key('x', 'keydown'); await frames(6); key('x', 'keyup'); }
      if (seg % 7 === 6) { key('Shift', 'keydown'); await frames(8); key('Shift', 'keyup'); }
      key('ArrowRight', 'keyup');
      await frames(4);
      maxRight = Math.max(maxRight, G.player.x);
      if (!isFinite(G.player.x) || !isFinite(G.player.y)) { err('player NaN during traversal'); break; }
    }
    console.log(`  traversal: ${startRoom} → ${G.world.roomId} (maxX ${Math.round(maxRight)})`);
    if (G.world.roomId === 'gate_1') err(`stuck in gate_1 (maxX ${Math.round(maxRight)}, roomW ${G.world.roomW()})`);
    else ok('reached ' + G.world.roomId);

    // gate_2 → gate_3, fighting through
    const room2 = G.world.roomId;
    let killed0 = G.world.stats.kills;
    for (let seg = 0; seg < 90 && G.world.roomId === room2; seg++) {
      key('ArrowRight', 'keydown');
      if (seg % 3 === 2) key(' ', 'keydown');
      await frames(22);
      key(' ', 'keyup');
      key('x', 'keydown'); await frames(6); key('x', 'keyup'); // fight through
      key('ArrowRight', 'keyup');
      await frames(4);
      if (!isFinite(G.player.x) || !isFinite(G.player.y)) { err('player NaN in ' + room2); break; }
    }
    console.log(`  combat traversal: ${room2} → ${G.world.roomId} (kills ${G.world.stats.kills - killed0})`);
    if (room2 === 'gate_2' && G.world.roomId === 'gate_2') err('stuck in gate_2');
    else if (room2 === 'gate_2') ok('pushed through ' + room2 + ' → ' + G.world.roomId);
  }
} catch (e) { err('playthrough: ' + e.stack); process.exit(1); }

console.log(failures ? `\n${failures} BOOT FAILURES` : '\nBoot smoke passed.');
process.exit(failures ? 1 : 0);
