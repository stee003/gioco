// main.js — bootstrap & game loop for THE LONG QUIET.
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { FX } from './core/fx.js';
import { SaveSystem } from './core/save.js';
import { it as i18n } from './core/i18n.js';
import { Player } from './game/player.js';
import { World } from './game/world.js';
import { UI } from './game/ui.js';
import { Renderer } from './game/render.js';
import { freshSave } from './core/save.js';

const canvas = document.getElementById('game');
const c2d = canvas.getContext('2d');

// ---------------------------------------------------------------- systems
const settings = new SaveSystem().loadSettings();
const saveSys = new SaveSystem();
i18n.setLanguage(settings.language || 'en');
const input = new Input();
if (settings.controls) for (const k of Object.keys(input.keys)) if (settings.controls[k]) input.keys[k] = settings.controls[k];
const audio = new AudioEngine();
audio.setSettings(settings);
const fx = new FX();
const renderer = new Renderer();

const ctx = {
  player: null, world: null, ui: null,
  i18n, audio, input, fx, saveSys, settings,
  startGame: null, toTitle: null,
};
const ui = new UI(ctx);
const world = new World(ctx);
ctx.world = world;
ctx.ui = ui;
ui.openTitle();

// unlock audio on first gesture
const unlock = () => { audio.unlock(); };
window.addEventListener('keydown', unlock, { once: false });
window.addEventListener('pointerdown', unlock);

// ---------------------------------------------------------------- save/slots
ctx.startGame = (slot, isNew, ngpSource) => {
  let data;
  if (isNew) {
    data = freshSave('Knell ' + (slot + 1));
    if (ngpSource) {
      data.newGamePlus = true;
      data.abilities = [...ngpSource.abilities || []];
      data.relics = [...ngpSource.relics || []];
      data.relicsOwned = [...(ngpSource.relicsOwned || ngpSource.relics || [])];
      data.flags = ['ngp'];
    }
  } else {
    data = saveSys.loadSlot(slot);
    if (!data) return;
  }
  ctx.player = new Player(0, 0);
  ctx.player.echoes = data.echoes || 0;
  ctx.player.unlocked = new Set(data.abilities && data.abilities.length ? data.abilities : ['commune']);
  const equipped = data.equipped && data.equipped.filter(Boolean).length ? data.equipped.filter(Boolean) : (data.relics || []).slice(0, 4);
  ctx.player.relics = new Set(equipped);
  ctx.player.relicsOwned = new Set([...(data.relicsOwned || []), ...equipped]);
  world.applySave(data, slot);
  ui.close();
  audio.unlock();
};

ctx.toTitle = () => {
  ctx.player = null;
  ui.openTitle();
};

// ---------------------------------------------------------------- scaling
function resize() {
  const ww = window.innerWidth, wh = window.innerHeight;
  const scale = Math.min(ww / 1280, wh / 720);
  canvas.style.width = Math.floor(1280 * scale) + 'px';
  canvas.style.height = Math.floor(720 * scale) + 'px';
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0;
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(.1, (now - last) / 1000);
  last = now;
  acc += dt;

  input.poll();

  // global keys
  if (!ui.overlay || ['pause', 'map', 'journal', 'relics', 'ach', 'settings'].includes(ui.overlay)) {
    if (input.pressed.map && ctx.player && !ui.dialogue && (!ui.overlay || ui.overlay === 'map')) {
      if (ui.overlay === 'map') { ui.close(); } else { ui._returnTo = 'pause'; ui.overlay = 'map'; ui.modal = true; }
      audio.sfx('ui');
    }
    if (input.pressed.journal && ctx.player && !ui.dialogue) {
      if (ui.overlay === 'journal') ui.close();
      else if (!ui.overlay) { ui._returnTo = 'pause'; ui.overlay = 'journal'; ui.modal = true; }
      audio.sfx('ui');
    }
    if (input.pressed.pause) {
      if (ui.overlay === 'pause') ui.close();
      else if (!ui.overlay && ctx.player) ui.openPause();
      else if (ui.overlay && ui.overlay !== 'title') { ui.close(); if (ctx.player === null) ui.openTitle(); }
    }
  }

  // fixed-step update
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    acc -= STEP; steps++;
    if (ui.modal) {
      ui.update(STEP, input);
      fx.update(STEP, settings.shake);
    } else if (ctx.player) {
      world.update(STEP, input);
      fx.update(STEP, settings.shake);
      ui.update(STEP, input);
    } else {
      ui.update(STEP, input);
      fx.update(STEP, settings.shake);
    }
  }

  // draw
  c2d.fillStyle = '#05060a';
  c2d.fillRect(0, 0, 1280, 720);
  if (ctx.player && world.room) {
    renderer.draw(c2d, world, now / 1000, settings);
  } else {
    drawTitleBackdrop(c2d, now / 1000);
  }
  ui.draw(c2d, 1280, 720);

  input.endFrame();
}
requestAnimationFrame(frame);

// debug handle (used by tools/boot.js and handy in devtools)
window.__TLQ = { ctx, world, ui, renderer, input, fx, audio, settings };
Object.defineProperty(window.__TLQ, 'player', { get: () => ctx.player });

function drawTitleBackdrop(c, time) {
  if (ui.overlay === 'title' || ui.overlay) return; // ui paints its own
  c.fillStyle = '#07080f';
  c.fillRect(0, 0, 1280, 720);
}
