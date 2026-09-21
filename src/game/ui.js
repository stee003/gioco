// game/ui.js — all interface: HUD, dialogue, banners, toasts, title screen,
// pause, settings (with remapping), map, journal, relics, achievements, shop,
// fast travel, death, and the Conclave (endings). Canvas-drawn, localized.
import { clamp, lerp } from '../core/utils.js';
import { ROOMS, REGIONS } from '../data/world.js';
import { RELICS, RELIC_SHOP_ORDER } from '../data/relics.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { talk } from './npcs.js';
import { ACTIONS, DEFAULT_KEYS } from '../core/input.js';

const FONT = 'Georgia, serif';

export class UI {
  constructor(ctx) {
    this.ctx = ctx; // {player, world, i18n, audio, saveSys, settings, input}
    this.prompt = null; this.promptProp = null;
    this.dialogue = null;      // {steps, i, chars, speaker}
    this.overlay = null;       // 'lore'|'banner'|'map'|'journal'|'relics'|'ach'|'settings'|'shop'|'travel'|'conclave'|'ending'|'title'|'slots'|'pause'|'death'
    this.modal = false;
    this.toasts = [];
    this.banner = null;        // {title, desc, ability}
    this.regionBannerData = null;
    this.bossBannerData = null;
    this.quote = null;
    this.loreData = null;
    this.deathCb = null;
    this.menuIndex = 0;
    this.subIndex = 0;
    this.confirmErase = -1;
    this.endingText = null;    // {lines, i}
    this.t = 0;
    this._shopStock = null;
  }

  get t_() { return k => this.ctx.i18n.t(k); }

  // ---------------------------------------------------------------- helpers
  toast(key) { this.toasts.push({ text: this.ctx.i18n.t(key), t: 0 }); if (this.toasts.length > 3) this.toasts.shift(); }
  toastFloat(text) { this.toasts.push({ text, t: 0 }); }
  achievementToast(id) {
    this.toasts.push({ text: '★ ' + this.ctx.i18n.t(`ach.${id}.n`), t: 0, gold: true });
  }
  itemBanner(title, desc, ability = false) { this.banner = { title, desc, ability, t: 0 }; this.modal = true; }
  regionBanner(regionId, roomKey) { this.regionBannerData = { name: this.ctx.i18n.t(REGIONS[regionId].key), room: this.ctx.i18n.t(roomKey), t: 0 }; }
  bossBanner(nameKey, subKey) { this.bossBannerData = { name: this.ctx.i18n.t(nameKey), sub: this.ctx.i18n.t(subKey), t: 0 }; }
  bossQuote(key) { this.quote = { text: this.ctx.i18n.t(key), t: 0 }; }
  get dialogueActive() { return !!this.dialogue; }

  // ---------------------------------------------------------------- dialogue
  startDialogue(npcId, prop) {
    const steps = talk(npcId, this.ctx.world);
    if (!steps.length) return;
    const i18n = this.ctx.i18n;
    this.dialogue = { steps, i: 0, chars: 0, speaker: i18n.t('npc.' + (npcId.replace('2', '')) || npcId), npcId, prop };
  }

  _applyStepFx(step) {
    const w = this.ctx.world;
    if (step.set) w.addFlag(step.set);
    if (step.clearItem) w.flags.delete(step.clearItem);
    if (step.reward) { this.ctx.player.echoes += step.reward; this.toastFloat('+' + step.reward + ' ' + this.ctx.i18n.t('item.echo')); }
    if (step.bloom) { w.addFlag('garden_bloom'); this.ctx.audio.sfx('secret'); }
  }

  _advanceDialogue() {
    const d = this.dialogue;
    const step = d.steps[d.i];
    const full = this.ctx.i18n.ta(step.d);
    if (d.chars < full.join(' ').length * 0 + this._lineText(step).length) {
      d.chars = 99999; // skip typewriter
      return;
    }
    this._applyStepFx(step);
    d.i++;
    d.chars = 0;
    if (d.i >= d.steps.length) {
      this.dialogue = null;
      if (d.steps.some(s => s.shop)) this.openShop();
      return;
    }
    this.ctx.audio.sfx('blip', { freq: 520 });
  }

  _lineText(step) {
    const arr = this.ctx.i18n.ta(step.d);
    return Array.isArray(arr) ? arr.join('\n') : String(arr);
  }

  // ---------------------------------------------------------------- overlays
  openLore(id, isNew) {
    this.overlay = 'lore';
    this.modal = true;
    this.loreData = { id, paras: this.ctx.i18n.ta(id), isNew };
    this.ctx.audio.sfx('ui');
  }

  openShop() {
    this.overlay = 'shop'; this.modal = true; this.menuIndex = 0;
    this._shopStock = RELIC_SHOP_ORDER.filter(id => !this.ctx.player.relicsOwned.has(id));
  }

  openFastTravel() {
    const w = this.ctx.world;
    const trams = [...w.flags].filter(f => f.startsWith('tram_')).map(f => f.slice(5));
    if (trams.length < 2) { this.toast('world.tram.need'); return; }
    this.overlay = 'travel'; this.modal = true; this.menuIndex = 0;
    this._trams = trams;
  }

  openConclave(stationIdx) {
    // gather eligibility
    const w = this.ctx.world, fl = w.flags;
    const lore = [...fl].filter(f => f.startsWith('lore_')).length;
    const trams = [...fl].filter(f => f.startsWith('tram_')).length;
    const elig = [
      true,
      lore >= 12,
      fl.has('quest_sedge_done') && fl.has('quest_understudy_done') && lore >= 8,
      fl.has('quest_archivist_done') && fl.has('boss_librarian') && trams >= 4 &&
        fl.has('quest_sedge_done') && fl.has('quest_understudy_done'),
    ];
    this.overlay = 'conclave'; this.modal = true;
    this.menuIndex = stationIdx;
    this._elig = elig;
    this.ctx.audio.sfx('ui');
  }

  deathScreen(cb) { this.overlay = 'death'; this.modal = true; this.deathCb = cb; this.subIndex = 0; }
  openTitle() { this.overlay = 'title'; this.modal = true; this.menuIndex = 0; this.page = 'main'; }
  openPause() { this.overlay = 'pause'; this.modal = true; this.menuIndex = 0; this.page = 'main'; }

  close() { this.overlay = null; this.modal = false; this.confirmErase = -1; }

  // ---------------------------------------------------------------- update
  update(dt, input) {
    this.t += dt;
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter(t => t.t < 3.2);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 3.6) { this.banner = null; this.modal = false; } }
    if (this.regionBannerData) { this.regionBannerData.t += dt; if (this.regionBannerData.t > 3) this.regionBannerData = null; }
    if (this.bossBannerData) { this.bossBannerData.t += dt; if (this.bossBannerData.t > 3.2) this.bossBannerData = null; }
    if (this.quote) { this.quote.t += dt; if (this.quote.t > 5) this.quote = null; }

    // dialogue typewriter
    if (this.dialogue) {
      const d = this.dialogue;
      const full = this._lineText(d.steps[d.i]);
      if (d.chars < full.length) {
        const sp = 46;
        const before = Math.floor(d.chars);
        d.chars = Math.min(full.length, d.chars + sp * dt);
        if (Math.floor(d.chars) > before && Math.floor(d.chars) % 3 === 0) this.ctx.audio.sfx('blip', { freq: 640, vol: .5 });
      }
      if (input.pressed.interact || input.pressed.jump || input.pressed.attack) this._advanceDialogue();
      return;
    }
    if (!this.overlay) return;

    const nav = (n) => { this.menuIndex = clamp(this.menuIndex + n, 0, (this._menuLen || 1) - 1); this.ctx.audio.sfx('blip', { freq: 440, vol: .6 }); };
    const conf = input.pressed.interact || input.pressed.jump;
    const back = input.pressed.dash || input.pressed.pause;

    switch (this.overlay) {
      case 'lore': if (conf || back) { this.overlay = null; this.modal = false; } break;
      case 'banner': break;
      case 'death': if (conf) { const cb = this.deathCb; this.close(); cb && cb(); } break;

      case 'title': this._titleMenu(input, nav, conf, back); break;
      case 'pause': this._pauseMenu(input, nav, conf, back); break;
      case 'settings': this._settingsMenu(input, nav, conf, back); break;
      case 'controls': this._controlsMenu(input, nav, conf, back); break;
      case 'shop': this._shopMenu(input, nav, conf, back); break;
      case 'travel': this._travelMenu(input, nav, conf, back); break;
      case 'conclave': this._conclaveMenu(input, nav, conf, back); break;
      case 'ending': this._endingUpdate(input, conf); break;
      case 'map': case 'journal': case 'relics': case 'ach':
        if (back || (this.overlay === 'map' && input.pressed.map)) {
          if (this._returnTo) { this.overlay = this._returnTo; this._returnTo = null; }
          else this.close();
          this.ctx.audio.sfx('ui');
        } else if (this.overlay === 'relics') this._relicsMenu(input, nav, conf, back);
        break;
    }
  }

  // ----- title
  _titleMenu(input, nav, conf, back) {
    const saveSys = this.ctx.saveSys;
    if (this.page === 'main') {
      const hasSaves = saveSys.listSlots().some(Boolean);
      const items = ['menu.new', ...(hasSaves ? ['menu.continue'] : []), 'menu.settings', 'menu.achievements'];
      this._menuLen = items.length;
      if (input.pressed.up || input.pressed.down) nav(input.pressed.down ? 1 : -1);
      if (conf) {
        const sel = items[this.menuIndex];
        this.ctx.audio.sfx('ui');
        if (sel === 'menu.new') { this.page = 'slots'; this.menuIndex = 0; this._slotMode = 'new'; }
        else if (sel === 'menu.continue') { this.page = 'slots'; this.menuIndex = 0; this._slotMode = 'continue'; }
        else if (sel === 'menu.settings') { this._returnTo = 'title'; this.overlay = 'settings'; this.menuIndex = 0; }
        else if (sel === 'menu.achievements') { this._returnTo = 'title'; this.overlay = 'ach'; }
      }
    } else if (this.page === 'slots') {
      this._menuLen = 4; // 3 slots + back
      if (input.pressed.up || input.pressed.down) nav(input.pressed.down ? 1 : -1);
      if (conf) {
        const i = this.menuIndex;
        this.ctx.audio.sfx('ui');
        if (i === 3) { this.page = 'main'; this.menuIndex = 0; return; }
        const slots = saveSys.listSlots();
        if (this._slotMode === 'continue') {
          if (slots[i]) { this.close(); this.ctx.startGame(i); }
        } else {
          if (slots[i]) { this.confirmErase = i; }
          else { this.close(); this.ctx.startGame(i, true); }
        }
      }
      if (this.confirmErase >= 0) {
        if (input.pressed.left) this.confirmErase = -1;
        if (input.pressed.interact || input.pressed.jump) { // confirm erase
          saveSys.deleteSlot(this.confirmErase);
          this.confirmErase = -1;
          this.ctx.audio.sfx('break', { vol: .5 });
        }
      }
    }
  }

  // ----- pause
  _pauseMenu(input, nav, conf, back) {
    if (this.page === 'main') {
      const items = ['menu.resume', 'map', 'journal', 'equip.cords', 'menu.achievements', 'menu.settings', 'menu.quit'];
      this._menuLen = items.length;
      if (input.pressed.up || input.pressed.down) nav(input.pressed.down ? 1 : -1);
      if (back) { this.close(); return; }
      if (conf) {
        const sel = items[this.menuIndex];
        this.ctx.audio.sfx('ui');
        if (sel === 'menu.resume') this.close();
        else if (sel === 'map') { this._returnTo = 'pause'; this.overlay = 'map'; }
        else if (sel === 'journal') { this._returnTo = 'pause'; this.overlay = 'journal'; }
        else if (sel === 'equip.cords') { this._returnTo = 'pause'; this.overlay = 'relics'; this.menuIndex = 0; }
        else if (sel === 'menu.achievements') { this._returnTo = 'pause'; this.overlay = 'ach'; }
        else if (sel === 'menu.settings') { this._returnTo = 'pause'; this.overlay = 'settings'; this.menuIndex = 0; }
        else if (sel === 'menu.quit') { this.ctx.world.saveToSlot(); this.close(); this.ctx.toTitle(); }
      }
    }
  }

  // ----- settings
  _settingsMenu(input, nav, conf, back) {
    const s = this.ctx.settings, saveSys = this.ctx.saveSys, i18n = this.ctx.i18n;
    const items = ['language', 'master', 'music', 'sfx', 'shake', 'flashes', 'reduce_dark', 'colorblind', 'text', 'subtitles', 'controls', 'back'];
    this._menuLen = items.length;
    if (input.pressed.up) nav(-1);
    if (input.pressed.down) nav(1);
    const key = items[this.menuIndex];
    const adj = (d) => {
      this.ctx.audio.sfx('blip', { freq: 500 });
      if (key === 'master') s.master = clamp(s.master + d * .1, 0, 1);
      if (key === 'music') s.music = clamp(s.music + d * .1, 0, 1);
      if (key === 'sfx') s.sfx = clamp(s.sfx + d * .1, 0, 1);
      if (key === 'shake') s.shake = clamp(+(s.shake + d * .25).toFixed(2), 0, 1);
      this.ctx.audio.setSettings(s);
      saveSys.saveSettings(s);
    };
    if (input.pressed.left) adj(-1);
    if (input.pressed.right) adj(1);
    if (conf) {
      this.ctx.audio.sfx('ui');
      if (key === 'language') {
        const langs = i18n.languages;
        const ni = (langs.indexOf(i18n.language) + 1) % langs.length;
        i18n.setLanguage(langs[ni]);
        s.language = langs[ni];
        saveSys.saveSettings(s);
      } else if (key === 'flashes') { s.flashes = !s.flashes; saveSys.saveSettings(s); }
      else if (key === 'reduce_dark') { s.reduceDarkness = !s.reduceDarkness; saveSys.saveSettings(s); }
      else if (key === 'colorblind') { s.colorblind = !s.colorblind; saveSys.saveSettings(s); }
      else if (key === 'subtitles') { s.subtitles = !s.subtitles; saveSys.saveSettings(s); }
      else if (key === 'text') {
        s.textSize = s.textSize === 'sm' ? 'md' : s.textSize === 'md' ? 'lg' : 'sm';
        saveSys.saveSettings(s);
      } else if (key === 'controls') { this.overlay = 'controls'; this.menuIndex = 0; }
      else if (key === 'back') { this.overlay = this._returnTo || 'title'; this.menuIndex = 0; }
    }
    if (back) { this.overlay = this._returnTo || 'title'; this.menuIndex = 0; }
  }

  _controlsMenu(input, nav, conf, back) {
    const acts = ACTIONS.filter(a => !['pause'].includes(a));
    this._menuLen = acts.length + 1;
    if (input.pressed.up) nav(-1);
    if (input.pressed.down) nav(1);
    if (conf) {
      const i = this.menuIndex;
      if (i === acts.length) { this.overlay = 'settings'; this.menuIndex = 10; return; }
      const act = acts[i];
      const input2 = this.ctx.input;
      this.ctx.audio.sfx('blip', { freq: 700 });
      input2.captureCallback = (e) => {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k !== 'Escape') {
          this.ctx.input.keys[act] = [k];
          this.ctx.settings.controls = JSON.parse(JSON.stringify(this.ctx.input.keys));
          this.ctx.saveSys.saveSettings(this.ctx.settings);
          this.ctx.audio.sfx('pickup');
        }
      };
    }
    if (back) { this.overlay = 'settings'; this.menuIndex = 10; }
  }

  // ----- shop (Murmur)
  _shopMenu(input, nav, conf, back) {
    const stock = this._shopStock;
    this._menuLen = stock.length + 1;
    if (input.pressed.up) nav(-1);
    if (input.pressed.down) nav(1);
    if (conf) {
      const i = this.menuIndex;
      if (i === stock.length) { this.close(); return; }
      const id = stock[i], r = RELICS[id], p = this.ctx.player;
      if (p.echoes >= r.cost) {
        p.echoes -= r.cost;
        p.relicsOwned.add(id);
        if (p.relics.size < 4) p.relics.add(id); // auto-equip into a free cord
        this.ctx.audio.sfx('pickup');
        this.itemBanner(this.ctx.i18n.t(`relic.${id}.name`), this.ctx.i18n.t(`relic.${id}.desc`));
        this.ctx.world.saveToSlot();
        this._shopStock = RELIC_SHOP_ORDER.filter(x => !p.relics.has(x));
        this.menuIndex = 0;
      } else this.ctx.audio.sfx('warn', { vol: .5 });
    }
    if (back) this.close();
  }

  // ----- fast travel
  _travelMenu(input, nav, conf, back) {
    this._menuLen = this._trams.length + 1;
    if (input.pressed.up) nav(-1);
    if (input.pressed.down) nav(1);
    if (conf) {
      if (this.menuIndex === this._trams.length) { this.close(); return; }
      const room = this._trams[this.menuIndex];
      this.ctx.audio.sfx('ability', { vol: .6 });
      this.close();
      this.ctx.world.loadRoom(room, this._tramSpawn(room).x, this._tramSpawn(room).y, { silent: false });
      this.ctx.world.saveToSlot();
    }
    if (back) this.close();
  }
  _tramSpawn(room) {
    const def = ROOMS[room];
    const compiled = this.ctx.world.room && this.ctx.world.roomId === room ? this.ctx.world.room : null;
    if (compiled) {
      const tr = compiled.props.find(p => p.type === 'tram');
      if (tr) return { x: Math.round(tr.x / 32) - 0, y: Math.round(tr.y / 32) - 1 };
    }
    // rebuild quickly
    const { compileRoom } = require0();
    const comp = compileRoom(def);
    const tr = comp.props.find(p => p.type === 'tram');
    return tr ? { x: Math.round(tr.x / 32), y: Math.round(tr.y / 32) - 1 } : { x: 3, y: 3 };
  }

  // ----- relics / cords
  _relicsMenu(input, nav, conf, back) {
    const p = this.ctx.player;
    const owned = [...p.relicsOwned];
    this._menuLen = owned.length + 5; // 4 cords + owned pool
    if (input.pressed.up) nav(-1);
    if (input.pressed.down) nav(1);
    if (conf) {
      const i = this.menuIndex;
      this.ctx.audio.sfx('ui');
      const equipped = [...p.relics];
      if (i < 4) {
        // toggle cord i: remove what is hung there, or hang the first idle relic
        if (equipped[i]) p.relics.delete(equipped[i]);
        else {
          const idle = owned.find(id => !p.relics.has(id));
          if (idle) p.relics.add(id); else this.ctx.audio.sfx('warn', { vol: .5 });
        }
      } else {
        const id = owned[i - 5];
        if (id) {
          if (p.relics.has(id)) p.relics.delete(id);       // unequip
          else if (equipped.length < 4) p.relics.add(id);  // hang on a free cord
          else this.ctx.audio.sfx('warn', { vol: .5 });    // all cords full
        }
      }
      this.ctx.world.saveToSlot();
    }
    if (back) { this.overlay = this._returnTo || null; this.modal = !!(this._returnTo); this._returnTo = null; }
  }

  // ----- conclave
  _conclaveMenu(input, nav, conf, back) {
    this._menuLen = 4;
    if (input.pressed.left) nav(-1);
    if (input.pressed.right) nav(1);
    if (input.pressed.up) nav(-1);
    if (input.pressed.down) nav(1);
    if (back) { this.close(); return; }
    if (conf) {
      if (!this._elig[this.menuIndex]) { this.ctx.audio.sfx('warn', { vol: .6 }); this.toast('ending.locked'); return; }
      const choice = this.menuIndex + 1;
      this.ctx.world.addFlag('ending_chosen_' + choice);
      this.ctx.world.addFlag('ending_' + choice); // persistent ending record (achievements, NG+)
      this.ctx.world.checkAchievements();
      this.ctx.world.saveToSlot();
      this.overlay = 'ending';
      this.endingText = { lines: this.ctx.i18n.ta('ending.' + choice + '.text'), i: 0, t: 0, choice };
      this.ctx.audio.sfx('toll');
      this.ctx.audio.setBoss(false);
    }
  }

  _endingUpdate(input, conf) {
    const e = this.endingText;
    e.t += 1 / 60;
    if (conf) {
      if (e.i < e.lines.length - 1) { e.i++; e.t = 0; this.ctx.audio.sfx('blip', { freq: 420 }); }
      else { this.close(); this.ctx.toTitle(); }
    }
  }

  // ---------------------------------------------------------------- draw
  draw(c, W, H) {
    const i18n = this.ctx.i18n;
    const ts = this.ctx.settings.textSize === 'sm' ? .85 : this.ctx.settings.textSize === 'lg' ? 1.2 : 1;
    const ui = this.ctx.settings.uiScale || 1;
    const F = (px) => `${Math.round(px * ts * ui)}px ${FONT}`;

    // ---------- HUD
    if (!this.overlay || this.overlay === 'death') {
      const p = this.ctx.player;
      if (p && p.state !== 'dead') {
        c.save();
        // chimes
        for (let i = 0; i < p.maxChimes; i++) {
          const x = 34 + i * 26, y = 34;
          const full = i < p.chimes;
          c.globalAlpha = full ? 1 : .25;
          this._bellGlyph(c, x, y, 9, full ? '#e8c878' : '#5a5344');
        }
        c.globalAlpha = 1;
        // aria vessel (fork)
        const ax = 36, ay = 74, ah = 84;
        c.strokeStyle = '#5a5344'; c.lineWidth = 3;
        c.strokeRect(ax, ay, 12, ah);
        const fill = clamp(p.aria / p.maxAria, 0, 1);
        c.fillStyle = '#bfe8ff';
        c.fillRect(ax + 2, ay + ah - fill * ah + 2, 8, fill * (ah - 4));
        // fork prongs
        c.strokeStyle = '#5a5344';
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax, ay - 8); c.moveTo(ax + 12, ay); c.lineTo(ax + 12, ay - 8); c.stroke();
        // echoes counter
        c.fillStyle = '#bfe8ff'; c.font = F(15); c.textAlign = 'left';
        c.shadowColor = '#0a0c14'; c.shadowBlur = 4;
        c.fillText('◆ ' + p.echoes, ax + 24, ay + ah);
        c.shadowBlur = 0;
        c.restore();
      }
      // boss bar
      const boss = this.ctx.world.boss;
      if (boss && !boss.dead && boss.state !== 'dying') {
        c.save();
        const bw = 560, bx = (1280 - bw) / 2, by = 660;
        c.fillStyle = 'rgba(8,8,14,.7)';
        c.fillRect(bx - 4, by - 4, bw + 8, 18);
        c.fillStyle = '#3a3040';
        c.fillRect(bx, by, bw, 10);
        const frac = clamp(boss.hp / boss.maxHp, 0, 1);
        c.fillStyle = '#c46a6a';
        c.fillRect(bx, by, bw * frac, 10);
        c.strokeStyle = 'rgba(232,216,255,.4)'; c.lineWidth = 1;
        c.strokeRect(bx, by, bw, 10);
        c.fillStyle = '#e8d8ff'; c.font = F(13); c.textAlign = 'center';
        c.fillText(this.ctx.i18n.t(boss.def.nameKey), 640, by - 10);
        c.restore();
      }
    }

    // ---------- toasts
    c.save(); c.textAlign = 'center';
    this.toasts.forEach((t, i) => {
      const a = t.t < .3 ? t.t / .3 : t.t > 2.6 ? (3.2 - t.t) / .6 : 1;
      c.globalAlpha = a;
      c.font = F(t.gold ? 16 : 15);
      c.fillStyle = t.gold ? '#ffd9a0' : '#cfc6b8';
      c.shadowColor = '#0a0c14'; c.shadowBlur = 6;
      c.fillText(t.text, 640, 92 + i * 26);
      c.shadowBlur = 0;
    });
    c.restore();

    // ---------- region banner
    if (this.regionBannerData) {
      const rb = this.regionBannerData;
      const a = rb.t < .5 ? rb.t / .5 : rb.t > 2.2 ? Math.max(0, (3 - rb.t) / .8) : 1;
      c.save(); c.globalAlpha = a; c.textAlign = 'center';
      c.fillStyle = '#e8dcc8'; c.font = F(34);
      c.shadowColor = '#000'; c.shadowBlur = 10;
      c.fillText(rb.name, 640, 150);
      c.fillStyle = '#9a90a8'; c.font = F(17);
      c.fillText(rb.room, 640, 182);
      c.restore();
    }

    // ---------- boss banner & quote
    if (this.bossBannerData) {
      const bb = this.bossBannerData;
      const a = bb.t < .4 ? bb.t / .4 : bb.t > 2.4 ? Math.max(0, (3.2 - bb.t) / .8) : 1;
      c.save(); c.globalAlpha = a; c.textAlign = 'center';
      c.fillStyle = '#e8d8ff'; c.font = `700 ${Math.round(42 * ts)}px ${FONT}`;
      c.shadowColor = '#000'; c.shadowBlur = 14;
      c.fillText(bb.name, 640, 300);
      c.fillStyle = '#a89ac8'; c.font = F(17);
      c.fillText(bb.sub, 640, 336);
      c.restore();
    }
    if (this.quote) {
      const q = this.quote;
      const a = q.t < .6 ? q.t / .6 : q.t > 4 ? Math.max(0, (5 - q.t)) : 1;
      c.save(); c.globalAlpha = a * .95; c.textAlign = 'center';
      c.fillStyle = '#e8dcc8'; c.font = F(19);
      const words = q.text.split(' ');
      const lines = []; let cur = '';
      for (const wd of words) {
        if ((cur + ' ' + wd).length > 52) { lines.push(cur); cur = wd; } else cur += (cur ? ' ' : '') + wd;
      }
      lines.push(cur);
      c.shadowColor = '#000'; c.shadowBlur = 8;
      lines.forEach((ln, i) => c.fillText(ln, 640, 190 + i * 26));
      c.restore();
    }

    // ---------- interaction prompt
    if (this.prompt && !this.modal) {
      c.save();
      c.textAlign = 'center';
      c.font = F(15);
      const txt = `[E] ${this.prompt}`;
      const w = c.measureText(txt).width + 26;
      c.fillStyle = 'rgba(10,12,20,.75)';
      c.beginPath(); c.roundRect(640 - w / 2, 560, w, 30, 8); c.fill();
      c.strokeStyle = 'rgba(216,168,90,.5)'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#e8dcc8';
      c.fillText(txt, 640, 580);
      c.restore();
    }

    // ---------- dialogue
    if (this.dialogue) {
      const d = this.dialogue;
      const full = this._lineText(d.steps[d.i]);
      const shown = full.slice(0, Math.floor(d.chars));
      c.save();
      const bh = 130, by = 720 - bh - 26;
      c.fillStyle = 'rgba(8,9,16,.88)';
      c.beginPath(); c.roundRect(120, by, 1040, bh, 14); c.fill();
      c.strokeStyle = 'rgba(216,168,90,.55)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#ffd9a0'; c.font = F(15); c.textAlign = 'left';
      c.fillText(d.speaker, 146, by + 30);
      c.fillStyle = '#e8dcc8'; c.font = F(17);
      shown.split('\n').forEach((ln, i) => c.fillText(ln, 146, by + 60 + i * 25));
      if (d.chars >= full.length) {
        c.fillStyle = `rgba(232,220,200,${.4 + Math.sin(this.t * 5) * .3})`;
        c.textAlign = 'right';
        c.fillText('▸', 1136, by + bh - 16);
      }
      c.restore();
    }

    // ---------- banner (item/ability)
    if (this.banner) {
      const b = this.banner;
      const a = b.t < .4 ? b.t / .4 : b.t > 3 ? Math.max(0, (3.6 - b.t) / .6) : 1;
      c.save(); c.globalAlpha = a; c.textAlign = 'center';
      c.fillStyle = 'rgba(8,9,16,.85)';
      c.beginPath(); c.roundRect(340, 240, 600, 150, 16); c.fill();
      c.strokeStyle = b.ability ? 'rgba(232,216,255,.7)' : 'rgba(216,168,90,.7)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = b.ability ? '#e8d8ff' : '#ffd9a0';
      c.font = F(15);
      c.fillText(b.ability ? i18n.t('ab.got') : i18n.t('ab.upgrade'), 640, 278);
      c.fillStyle = '#f2ead8'; c.font = `700 ${Math.round(26 * ts)}px ${FONT}`;
      c.fillText(b.title, 640, 318);
      c.fillStyle = '#b8b0a0'; c.font = F(14);
      this._wrap(c, b.desc, 640, 346, 540, 19, F(14));
      c.restore();
    }

    // ---------- overlay panels
    if (this.overlay) {
      c.fillStyle = 'rgba(3,4,8,.72)';
      c.fillRect(0, 0, 1280, 720);
      switch (this.overlay) {
        case 'title': this._drawTitle(c, F, ts); break;
        case 'pause': this._drawPause(c, F, ts); break;
        case 'settings': this._drawSettings(c, F, ts); break;
        case 'controls': this._drawControls(c, F, ts); break;
        case 'lore': this._drawLore(c, F, ts); break;
        case 'shop': this._drawShop(c, F, ts); break;
        case 'travel': this._drawTravel(c, F, ts); break;
        case 'relics': this._drawRelics(c, F, ts); break;
        case 'ach': this._drawAch(c, F, ts); break;
        case 'map': this._drawMap(c, F, ts); break;
        case 'journal': this._drawJournal(c, F, ts); break;
        case 'conclave': this._drawConclave(c, F, ts); break;
        case 'ending': this._drawEnding(c, F, ts); break;
        case 'death': this._drawDeath(c, F, ts); break;
      }
    }
  }

  // ---------- panel helpers
  _panel(c, x, y, w, h) {
    c.fillStyle = 'rgba(10,11,20,.92)';
    c.beginPath(); c.roundRect(x, y, w, h, 18); c.fill();
    c.strokeStyle = 'rgba(216,168,90,.5)'; c.lineWidth = 2; c.stroke();
  }
  _wrap(c, text, x, y, maxW, lh, font) {
    c.font = font;
    const words = text.split(' ');
    const lines = []; let cur = '';
    for (const wd of words) {
      if (c.measureText(cur + ' ' + wd).width > maxW && cur) { lines.push(cur); cur = wd; }
      else cur += (cur ? ' ' : '') + wd;
    }
    lines.push(cur);
    lines.forEach((ln, i) => c.fillText(ln, x, y + i * lh));
    return lines.length;
  }
  _bellGlyph(c, x, y, r, color) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x - 2, y - r); c.bezierCurveTo(x - r, y - r * .8, x - r * 1.1, y + r * .7, x - r * 1.1, y + r);
    c.lineTo(x + r * 1.1, y + r); c.bezierCurveTo(x + r * 1.1, y + r * .7, x + r, y - r * .8, x + 2, y - r);
    c.closePath(); c.fill();
    c.fillRect(x - r * 1.2, y + r, r * 2.4, 2.4);
  }
  _menu(c, items, x, y, lh, F, selected) {
    c.textAlign = 'center';
    items.forEach((it, i) => {
      const sel = i === selected;
      c.font = sel ? `700 ${F}` : F;
      c.fillStyle = sel ? '#ffd9a0' : '#b8b0a0';
      if (typeof it === 'string') c.fillText(it, x, y + i * lh);
      else { c.font = sel ? `700 ${it.size}` : it.size; c.fillStyle = sel ? '#ffd9a0' : it.color || '#b8b0a0'; c.fillText(it.label, x, y + i * lh); }
    });
  }

  // ---------- screens
  _drawTitle(c, F, ts) {
    const i18n = this.ctx.i18n;
    // backdrop: the long stair silhouette
    c.fillStyle = '#07080f'; c.fillRect(0, 0, 1280, 720);
    c.save();
    c.strokeStyle = 'rgba(120,110,150,.16)'; c.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const y = 720 - i * 26;
      c.beginPath(); c.moveTo(400 - i * 14, y); c.lineTo(880 + i * 14, y); c.stroke();
    }
    c.fillStyle = 'rgba(216,168,90,.9)';
    c.beginPath();
    c.moveTo(620, 300); c.bezierCurveTo(596, 320, 594, 352, 596, 366); c.lineTo(644, 366);
    c.bezierCurveTo(646, 352, 644, 320, 620, 300); c.closePath(); c.fill();
    c.fillRect(594, 364, 52, 6);
    c.restore();
    c.textAlign = 'center';
    c.fillStyle = '#e8dcc8';
    c.font = `700 ${Math.round(58 * ts)}px ${FONT}`;
    c.fillText(i18n.t('title.name'), 640, 200);
    c.fillStyle = '#8a8298'; c.font = F(19);
    c.fillText(i18n.t('title.sub'), 640, 236);

    if (this.page === 'main') {
      const items = [i18n.t('menu.new'), ...(this.ctx.saveSys.listSlots().some(Boolean) ? [i18n.t('menu.continue')] : []), i18n.t('menu.settings'), i18n.t('menu.achievements')];
      this._menu(c, items, 640, 460, 42, `${Math.round(21 * ts)}px ${FONT}`, this.menuIndex);
    } else if (this.page === 'slots') {
      const slots = this.ctx.saveSys.listSlots();
      c.fillStyle = '#b8b0a0'; c.font = F(18);
      c.fillText(i18n.t('menu.slots'), 640, 420);
      const items = slots.map((s, i) => s
        ? { label: `${i + 1}. ${s.meta || '—'} · ${Math.floor((s.playtime || 0) / 60)} min`, size: `${Math.round(19 * ts)}px ${FONT}` }
        : { label: `${i + 1}. ${i18n.t('menu.empty')}`, size: `${Math.round(19 * ts)}px ${FONT}`, color: '#6a6478' });
      items.push({ label: i18n.t('menu.back'), size: `${Math.round(17 * ts)}px ${FONT}`, color: '#8a8298' });
      this._menu(c, items, 640, 470, 40, '', this.menuIndex);
      if (this.confirmErase >= 0) {
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, 1280, 720);
        c.fillStyle = '#e8dcc8'; c.font = F(20);
        c.fillText(i18n.t('menu.confirm_erase'), 640, 340);
        c.fillStyle = '#ffd9a0'; c.font = F(16);
        c.fillText(`[E] ${i18n.t('menu.yes')}    [←] ${i18n.t('menu.no')}`, 640, 380);
      }
    }
    c.fillStyle = '#6a6478'; c.font = F(14);
    c.fillText(i18n.t('menu.start_hint'), 640, 700);
  }

  _drawPause(c, F, ts) {
    const i18n = this.ctx.i18n;
    this._panel(c, 440, 130, 400, 470);
    c.textAlign = 'center';
    c.fillStyle = '#e8dcc8'; c.font = `700 ${Math.round(24 * ts)}px ${FONT}`;
    c.fillText(i18n.t('menu.paused'), 640, 180);
    const w = this.ctx.world;
    const items = [i18n.t('menu.resume'), i18n.t('map'), i18n.t('journal'), i18n.t('equip.cords'), i18n.t('menu.achievements'), i18n.t('menu.settings'), i18n.t('menu.quit')];
    this._menu(c, items, 640, 250, 44, `${Math.round(20 * ts)}px ${FONT}`, this.menuIndex);
    c.fillStyle = '#6a6478'; c.font = F(14);
    const mins = Math.floor((w.playtime || 0) / 60);
    c.fillText(`${i18n.t('menu.playtime')}: ${Math.floor(mins / 60)}h ${mins % 60}m`, 640, 570);
  }

  _drawSettings(c, F, ts) {
    const i18n = this.ctx.i18n, s = this.ctx.settings;
    this._panel(c, 340, 80, 600, 560);
    c.textAlign = 'center';
    c.fillStyle = '#e8dcc8'; c.font = `700 ${Math.round(24 * ts)}px ${FONT}`;
    c.fillText(i18n.t('menu.settings'), 640, 120);
    const rows = [
      ['language', i18n.t('set.language'), i18n.language === 'en' ? i18n.t('set.english') : i18n.t('set.italian')],
      ['master', i18n.t('set.master'), this._bar(s.master)],
      ['music', i18n.t('set.music'), this._bar(s.music)],
      ['sfx', i18n.t('set.sfx'), this._bar(s.sfx)],
      ['shake', i18n.t('set.shake'), this._bar(s.shake)],
      ['flashes', i18n.t('set.flashes'), s.flashes ? '◉' : '○'],
      ['reduce_dark', i18n.t('set.reduce_dark'), s.reduceDarkness ? '◉' : '○'],
      ['colorblind', i18n.t('set.colorblind'), s.colorblind ? '◉' : '○'],
      ['text', i18n.t('set.text'), i18n.t('set.' + ({ sm: 'small', md: 'medium', lg: 'large' })[s.textSize])],
      ['subtitles', i18n.t('set.subtitles'), s.subtitles ? '◉' : '○'],
      ['controls', i18n.t('set.controls'), '›'],
      ['back', i18n.t('menu.back'), ''],
    ];
    c.font = F(17);
    rows.forEach(([k, label, val], i) => {
      const sel = i === this.menuIndex;
      const y = 170 + i * 36;
      c.fillStyle = sel ? '#ffd9a0' : '#b8b0a0';
      c.textAlign = 'left';
      c.fillText(label, 390, y);
      c.textAlign = 'right';
      c.fillStyle = sel ? '#f2ead8' : '#8a8298';
      c.fillText(String(val), 890, y);
      if (sel) { c.fillStyle = '#ffd9a0'; c.textAlign = 'left'; c.fillText('›', 370, y); }
    });
    c.textAlign = 'center'; c.fillStyle = '#6a6478'; c.font = F(13);
    c.fillText(i18n.t('set.pad'), 640, 620);
  }
  _bar(v) { const n = Math.round(v * 10); return '■'.repeat(n) + '·'.repeat(10 - n); }

  _drawControls(c, F, ts) {
    const i18n = this.ctx.i18n;
    this._panel(c, 390, 60, 500, 600);
    c.textAlign = 'center';
    c.fillStyle = '#e8dcc8'; c.font = `700 ${Math.round(22 * ts)}px ${FONT}`;
    c.fillText(i18n.t('set.controls'), 640, 96);
    const acts = Object.entries(this.ctx.input.keys).filter(([a]) => a !== 'pause');
    c.font = F(15);
    acts.forEach(([act, keys], i) => {
      const sel = i === this.menuIndex;
      const y = 136 + i * 30;
      c.textAlign = 'left';
      c.fillStyle = sel ? '#ffd9a0' : '#b8b0a0';
      c.fillText(i18n.t('act.' + act), 430, y);
      c.textAlign = 'right';
      c.fillStyle = '#8a8298';
      c.fillText(keys.join(' / '), 860, y);
      if (sel) { c.fillStyle = '#ffd9a0'; c.textAlign = 'left'; c.fillText('›', 414, y); }
    });
    c.textAlign = 'center'; c.fillStyle = '#6a6478'; c.font = F(13);
    c.fillText('[' + i18n.t('menu.back') + ': ESC]', 640, 636);
  }

  _drawLore(c, F, ts) {
    const l = this.loreData, i18n = this.ctx.i18n;
    this._panel(c, 260, 140, 760, 420);
    c.textAlign = 'center';
    c.fillStyle = '#ffd9a0'; c.font = F(15);
    c.fillText(i18n.t('world.stele'), 640, 182);
    c.fillStyle = '#e8dcc8'; c.font = F(19);
    c.textAlign = 'left';
    let y = 230;
    for (const p of l.paras) {
      const lines = this._wrapLines(c, p, 700, F(18));
      for (const ln of lines) { c.fillText(ln, 300, y); y += 28; }
      y += 10;
    }
    c.textAlign = 'center'; c.fillStyle = '#6a6478'; c.font = F(13);
    c.fillText('[E]', 640, 540);
  }
  _wrapLines(c, text, maxW, font) {
    c.font = font;
    const words = text.split(' '); const lines = []; let cur = '';
    for (const wd of words) {
      if (c.measureText(cur + ' ' + wd).width > maxW && cur) { lines.push(cur); cur = wd; }
      else cur += (cur ? ' ' : '') + wd;
    }
    lines.push(cur); return lines;
  }

  _drawShop(c, F, ts) {
    const i18n = this.ctx.i18n, p = this.ctx.player;
    this._panel(c, 320, 90, 640, 540);
    c.textAlign = 'center';
    c.fillStyle = '#e8d8ff'; c.font = `700 ${Math.round(24 * ts)}px ${FONT}`;
    c.fillText(i18n.t('npc.murmur'), 640, 134);
    c.fillStyle = '#bfe8ff'; c.font = F(16);
    c.fillText('◆ ' + p.echoes, 640, 164);
    c.font = F(16);
    this._shopStock.forEach((id, i) => {
      const sel = i === this.menuIndex;
      const afford = p.echoes >= RELICS[id].cost;
      const y = 216 + i * 30;
      c.textAlign = 'left';
      c.fillStyle = sel ? '#ffd9a0' : afford ? '#b8b0a0' : '#5a5464';
      c.fillText(RELICS[id] ? i18n.t(`relic.${id}.name`) : id, 360, y);
      c.textAlign = 'right';
      c.fillStyle = afford ? '#bfe8ff' : '#5a5464';
      c.fillText('◆ ' + RELICS[id].cost, 920, y);
      if (sel) { c.fillStyle = '#ffd9a0'; c.textAlign = 'left'; c.fillText('›', 344, y); }
    });
    c.textAlign = 'center';
    const by = 216 + this._shopStock.length * 30;
    const selB = this.menuIndex === this._shopStock.length;
    c.fillStyle = selB ? '#ffd9a0' : '#8a8298';
    c.fillText(i18n.t('menu.back'), 640, by + 10);
    // description of selected
    const selId = this._shopStock[this.menuIndex];
    if (selId) {
      c.fillStyle = '#8a8298'; c.font = F(14);
      this._wrap(c, i18n.t(`relic.${selId}.desc`), 640, 580, 560, 20, F(14));
    }
  }

  _drawTravel(c, F, ts) {
    const i18n = this.ctx.i18n;
    this._panel(c, 420, 200, 440, 320);
    c.textAlign = 'center';
    c.fillStyle = '#e8dcc8'; c.font = `700 ${Math.round(22 * ts)}px ${FONT}`;
    c.fillText(i18n.t('hud.travel'), 640, 244);
    c.font = F(17);
    this._trams.forEach((room, i) => {
      const sel = i === this.menuIndex;
      c.fillStyle = sel ? '#ffd9a0' : '#b8b0a0';
      c.fillText(i18n.t(ROOMS[room].key), 640, 296 + i * 38);
      if (sel) { c.fillStyle = '#ffd9a0'; c.fillText('›', 510, 296 + i * 38); }
    });
    const bi = this._trams.length;
    if (this.menuIndex === bi) { c.fillStyle = '#ffd9a0'; }
    else c.fillStyle = '#8a8298';
    c.fillText(i18n.t('menu.back'), 640, 296 + bi * 38);
  }

  _drawRelics(c, F, ts) {
    const i18n = this.ctx.i18n, p = this.ctx.player;
    this._panel(c, 260, 80, 760, 560);
    c.textAlign = 'center';
    c.fillStyle = '#e8dcc8'; c.font = `700 ${Math.round(24 * ts)}px ${FONT}`;
    c.fillText(i18n.t('equip.cords'), 640, 122);
    const equipped = [...p.relics];
    // 4 cords
    for (let i = 0; i < 4; i++) {
      const x = 420 + i * 120, y = 180;
      const sel = this.menuIndex === i;
      c.strokeStyle = sel ? '#ffd9a0' : 'rgba(216,168,90,.4)';
      c.lineWidth = sel ? 3 : 2;
      c.beginPath(); c.roundRect(x - 44, y - 44, 88, 88, 12); c.stroke();
      if (equipped[i]) {
        c.fillStyle = '#e8d8ff'; c.font = F(13); c.textAlign = 'center';
        c.fillText(i18n.t(`relic.${equipped[i]}.name`), x, y - 8);
        c.font = F(11); c.fillStyle = '#8a8298';
        this._wrap(c, i18n.t(`relic.${equipped[i]}.desc`), x, y + 12, 80, 13, F(10));
      }
    }
    c.fillStyle = '#6a6478'; c.font = F(14); c.textAlign = 'center';
    c.fillText(i18n.t('equip.owned') + ': ' + p.relicsOwned.size + ' / ' + Object.keys(RELICS).length, 640, 270);
    const owned = [...p.relicsOwned];
    owned.forEach((id, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 340 + col * 160, y = 320 + row * 64;
      const sel = this.menuIndex === i + 5;
      if (sel) { c.strokeStyle = '#ffd9a0'; c.lineWidth = 2; c.strokeRect(x - 6, y - 18, 150, 26); }
      c.fillStyle = sel ? '#ffd9a0' : '#b8b0a0';
      c.textAlign = 'left'; c.font = F(14);
      const label = i18n.t(`relic.${id}.name`);
      c.fillText(label.length > 20 ? label.slice(0, 19) + '…' : label, x, y);
    });
    c.textAlign = 'center'; c.fillStyle = '#6a6478'; c.font = F(13);
    c.fillText(i18n.t('equip.hint'), 640, 620);
  }

  _drawAch(c, F, ts) {
    const i18n = this.ctx.i18n, w = this.ctx.world;
    this._panel(c, 220, 60, 840, 610);
    c.textAlign = 'center';
    c.fillStyle = '#e8dcc8'; c.font = `700 ${Math.round(24 * ts)}px ${FONT}`;
    const unlocked = ACHIEVEMENTS.filter(a => w.flags.has('ach_' + a.id)).length;
    c.fillText(`★ ${unlocked} / ${ACHIEVEMENTS.length}`, 640, 100);
    c.font = F(15);
    ACHIEVEMENTS.forEach((a, i) => {
      const col = Math.floor(i / 15), row = i % 15;
      const x = 280 + col * 270, y = 140 + row * 34;
      const got = w.flags.has('ach_' + a.id);
      c.textAlign = 'left';
      c.fillStyle = got ? '#ffd9a0' : '#4e4a58';
      const name = i18n.t(`ach.${a.id}.n`);
      c.fillText((got ? '★ ' : '☆ ') + (name.length > 26 ? name.slice(0, 25) + '…' : name), x, y);
    });
  }

  _drawMap(c, F, ts) {
    const i18n = this.ctx.i18n, w = this.ctx.world;
    this._panel(c, 140, 50, 1000, 620);
    c.textAlign = 'center';
    c.fillStyle = '#e8dcc8'; c.font = `700 ${Math.round(24 * ts)}px ${FONT}`;
    c.fillText(i18n.t('map'), 640, 92);
    const gx = 240, gy = 130, cell = 34;
    // connections
    c.strokeStyle = 'rgba(216,168,90,.35)'; c.lineWidth = 2;
    for (const [id, def] of Object.entries(ROOMS)) {
      if (!w.flags.rooms.includes(id)) continue;
      for (const e of def.exits) {
        if (!ROOMS[e.to] || !w.flags.rooms.includes(e.to)) continue;
        const a = def.mapPos, b = ROOMS[e.to].mapPos;
        if (!a || !b) continue;
        c.beginPath();
        c.moveTo(gx + a[0] * cell + 15, gy + a[1] * cell + 12);
        c.lineTo(gx + b[0] * cell + 15, gy + b[1] * cell + 12);
        c.stroke();
      }
    }
    for (const [id, def] of Object.entries(ROOMS)) {
      if (!def.mapPos) continue;
      const known = w.flags.rooms.includes(id);
      const adj = def.exits.some(e => w.flags.rooms.includes(e.to)) || w.flags.rooms.includes(id);
      if (!known && !adj) continue;
      const x = gx + def.mapPos[0] * cell, y = gy + def.mapPos[1] * cell;
      if (known) {
        c.fillStyle = id === w.roomId ? 'rgba(255,217,160,.85)' : 'rgba(160,150,190,.55)';
        c.beginPath(); c.roundRect(x, y, 30, 24, 5); c.fill();
        c.strokeStyle = 'rgba(10,10,18,.6)'; c.lineWidth = 1; c.stroke();
        // icons
        if (w.flags.has(`lit_${id}`)) { c.fillStyle = '#5a4a2e'; c.beginPath(); c.arc(x + 15, y + 12, 3.4, 0, 7); c.fill(); c.fillStyle = '#ffd9a0'; c.beginPath(); c.arc(x + 15, y + 12, 2, 0, 7); c.fill(); }
        if (w.flags.has(`tram_${id}`)) { c.fillStyle = '#bfe8ff'; c.fillRect(x + 4, y + 9, 5, 5); }
        if (w.flags.has('boss_tollmaster') && id === 'gate_4' || w.flags.has('boss_rootwife') && id === 'root_4' || w.flags.has('boss_choirmarshal') && id === 'bell_4' || w.flags.has('boss_antiphon') && id === 'heart_2') {
          c.fillStyle = '#c46a6a'; c.fillRect(x + 21, y + 9, 5, 5);
        }
      } else {
        c.strokeStyle = 'rgba(160,150,190,.25)';
        c.setLineDash([3, 3]);
        c.strokeRect(x, y, 30, 24);
        c.setLineDash([]);
      }
      // stelae unread hint (Lorekeeper's Seal)
      if (known && w.ctx.player.stats().mapStelae) {
        const unread = (def.build && this._roomHasStele(id) && !this._roomSteleRead(id));
        if (unread) { c.fillStyle = 'rgba(122,224,208,.9)'; c.fillRect(x + 26, y + 2, 3, 3); }
      }
      if (id === w.roomId) {
        c.fillStyle = '#fff'; c.font = F(11); c.textAlign = 'center';
        c.fillText('●', x + 15, y + 40);
        c.fillStyle = '#e8dcc8'; c.font = F(13);
        c.fillText(i18n.t(def.key), 640, 640);
      }
    }
    // region labels
    c.font = F(12); c.textAlign = 'center';
    const labels = { gate: [4, 8], root: [11, 7], bell: [17, 6], hush: [22, 3], scr: [21, 10], heart: [27, 6] };
    for (const [r, [lx, ly]] of Object.entries(labels)) {
      c.fillStyle = 'rgba(200,190,220,.5)';
      c.fillText(i18n.t(REGIONS[r].key), gx + lx * cell + 10, gy + ly * cell);
    }
  }
  _roomHasStele(id) { return true; }
  _roomSteleRead(id) {
    const w = this.ctx.world;
    const map = { gate_1: 'lore.gate.1', gate_3: 'lore.gate.3', root_1: 'lore.root.1', root_2: 'lore.root.2', root_3: 'lore.root.3', bell_1: 'lore.bell.1', bell_2: 'lore.bell.3', bell_3: 'lore.bell.4', hush_1: 'lore.hush.1', hush_2: 'lore.hush.2', hush_3: 'lore.hush.3', scr_1: 'lore.scr.1', scr_3: 'lore.scr.2', heart_1: 'lore.heart.1', heart_3: 'lore.heart.2' };
    return !map[id] || w.flags.has('lore_' + map[id]);
  }

  _drawJournal(c, F, ts) {
    const i18n = this.ctx.i18n, w = this.ctx.world;
    this._panel(c, 220, 60, 840, 610);
    c.textAlign = 'center';
    c.fillStyle = '#e8dcc8'; c.font = `700 ${Math.round(24 * ts)}px ${FONT}`;
    c.fillText(i18n.t('journal'), 640, 100);
    c.textAlign = 'left'; c.font = F(15);
    // lore
    const lore = [...w.flags].filter(f => f.startsWith('lore_'));
    c.fillStyle = '#ffd9a0';
    c.fillText(`◆ ${i18n.language === 'it' ? 'Frammenti' : 'Fragments'}: ${lore.length} / 22`, 260, 140);
    c.fillStyle = '#b8b0a0';
    let y = 170;
    const names = { gate: i18n.t('region.gate'), root: i18n.t('region.root'), bell: i18n.t('region.bell'), hush: i18n.t('region.hush'), scr: i18n.t('region.scr'), heart: i18n.t('region.heart') };
    const byRegion = {};
    for (const l of lore) { const r = l.slice(5).split('.')[0]; byRegion[r] = (byRegion[r] || 0) + 1; }
    for (const [r, n] of Object.entries(byRegion)) { c.fillText(`${names[r]} — ${n}`, 280, y); y += 24; }
    // quests
    y += 10;
    c.fillStyle = '#ffd9a0';
    c.fillText('◆ ' + i18n.t('journal.stories'), 260, y); y += 28;
    c.fillStyle = '#b8b0a0';
    const quests = [
      ['quest_sedge_done', 'd.sedge.done', 'npc.sedge'],
      ['quest_understudy_done', 'd.understudy.done', 'npc.understudy'],
      ['quest_archivist_done', 'd.archivist.done', 'npc.archivist'],
      ['met_murmur', 'd.murmur.2', 'npc.murmur'],
      ['met_wick', 'd.wick.2', 'npc.wick'],
    ];
    for (const [flag, , nameKey] of quests) {
      const met = w.flags.has(flag) || (flag === 'met_murmur' && w.flags.has('met_murmur')) || (flag === 'met_wick' && w.flags.has('met_wick'));
      c.fillStyle = w.flags.has(flag) ? '#9fd47a' : w.flags.has(nameKey) ? '#b8b0a0' : '#4e4a58';
      c.fillText((w.flags.has(flag) ? '✓ ' : '· ') + i18n.t(nameKey), 280, y); y += 24;
    }
    // hint of the road
    y += 14;
    c.fillStyle = '#8a8298'; c.font = F(14);
    const hint = !w.flags.has('boss_tollmaster') ? i18n.t('journal.hint.0')
      : !w.flags.has('boss_rootwife') ? i18n.t('journal.hint.1')
      : !w.flags.has('boss_choirmarshal') ? i18n.t('journal.hint.2')
      : !w.flags.has('boss_antiphon') ? i18n.t('journal.hint.3')
      : i18n.t('journal.hint.4');
    this._wrap(c, hint, 280, y, 740, 20, F(15));
  }

  _drawConclave(c, F, ts) {
    const i18n = this.ctx.i18n;
    c.textAlign = 'center';
    c.fillStyle = '#e8d8ff'; c.font = `700 ${Math.round(30 * ts)}px ${FONT}`;
    c.fillText(i18n.t('ending.title'), 640, 110);
    c.fillStyle = '#b8b0a0'; c.font = F(16);
    this._wrap(c, i18n.t('ending.choose'), 640, 150, 700, 22, F(16));
    const names = [1, 2, 3, 4].map(i => i18n.t(`ending.${i}.name`));
    const reqs = [1, 2, 3, 4].map(i => i18n.t(`ending.${i}.req`));
    c.font = F(18);
    names.forEach((nm, i) => {
      const sel = i === this.menuIndex;
      const x = 240 + i * 210, y = 330;
      const elig = this._elig[i];
      c.strokeStyle = sel ? '#e8d8ff' : elig ? 'rgba(232,216,255,.4)' : 'rgba(120,110,140,.25)';
      c.lineWidth = sel ? 3 : 2;
      c.beginPath(); c.roundRect(x - 90, y - 60, 180, 200, 14); c.stroke();
      c.fillStyle = sel ? '#e8d8ff' : elig ? '#b8b0a0' : '#5a5464';
      c.font = `700 ${Math.round(19 * ts)}px ${FONT}`;
      c.fillText(nm, x, y - 20);
      c.font = F(12);
      this._wrap(c, reqs[i], x, y + 10, 160, 15, F(12));
      if (sel) { c.fillStyle = '#e8d8ff'; c.fillText('◆', x, y + 120); }
    });
    c.fillStyle = '#6a6478'; c.font = F(13);
    c.fillText('[E] ' + (i18n.language === 'it' ? 'scegli' : 'choose') + ' · [ESC] ' + i18n.t('menu.back'), 640, 560);
  }

  _drawEnding(c, F, ts) {
    const e = this.endingText, i18n = this.ctx.i18n;
    // fade to white as it concludes
    c.fillStyle = '#0a0a12'; c.fillRect(0, 0, 1280, 720);
    c.textAlign = 'center';
    c.fillStyle = '#e8dcc8'; c.font = F(19);
    const lines = this._wrapLines(c, e.lines[e.i], 760, F(19));
    const reveal = Math.min(1, e.t / 1.2);
    lines.forEach((ln, i) => {
      c.globalAlpha = clamp(reveal * lines.length - i, 0, 1);
      c.fillText(ln, 640, 280 + i * 30);
    });
    c.globalAlpha = 1;
    if (e.t > 1.6) {
      c.fillStyle = `rgba(160,150,170,${.5 + Math.sin(this.t * 3) * .25})`;
      c.font = F(14);
      c.fillText('[E]', 640, 620);
    }
    if (e.i === e.lines.length - 1) {
      c.fillStyle = '#8a8298'; c.font = F(15);
      c.fillText(i18n.t('ending.stat'), 640, 660);
    }
  }

  _drawDeath(c, F, ts) {
    const i18n = this.ctx.i18n;
    c.fillStyle = 'rgba(2,2,5,.88)'; c.fillRect(0, 0, 1280, 720);
    c.textAlign = 'center';
    c.fillStyle = '#c46a6a'; c.font = `700 ${Math.round(44 * ts)}px ${FONT}`;
    c.fillText(i18n.t('death.title'), 640, 320);
    c.fillStyle = '#8a8298'; c.font = F(17);
    c.fillText(i18n.t('death.sub'), 640, 366);
    c.fillStyle = '#5a5464'; c.font = F(14);
    c.fillText(i18n.t('death.hint'), 640, 396);
    c.fillStyle = `rgba(232,220,200,${.4 + Math.sin(this.t * 4) * .3})`;
    c.font = F(15);
    c.fillText('[E]', 640, 470);
  }
}
// tiny shim so UI can compile rooms for tram spawns without cycles
function require0() { return { compileRoom: _compile }; }
import { compileRoom as _compile } from '../data/world.js';
