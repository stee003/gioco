// game/world.js — the living world: room loading, collision queries, props &
// interactions, projectiles/beams/shockwaves, echo pickups, the death echo
// (Reverberation), NPC runtime, flags, room transitions, camera.
import { TILE, clamp, aabb, makeRng } from '../core/utils.js';
import { ROOMS, REGIONS, compileRoom, SOLID, PLAT, SPIKE, BREAK, WATERD, WATERS, VEIL } from '../data/world.js';
import { Enemy } from './enemies.js';
import { Boss } from './bosses.js';

export class World {
  constructor(ctx) {
    this.ctx = ctx; // {player, fx, audio, ui, i18n, saveSys, settings}
    this.roomId = null; this.room = null; this.def = null;
    this.enemies = [];
    this.projectiles = [];
    this.beams = [];
    this.shocks = [];
    this.zones = [];
    this.echoPickups = [];
    this.props = [];
    this.boss = null;
    this.flags = new Set();
    this.cam = { x: 0, y: 0 };
    this.transition = null;   // {t, phase, to, tx, ty}
    this.reverberation = null; // {room,x,y,amount}
    this.hintT = 0; this.lastHint = '';
    this.stats = { kills: 0, deaths: 0, maxPogo: 0, secretsFound: 0 };
    this.playtime = 0;
    this.bossNoHit = true;
  }

  has(f) { return this.flags.has(f); }
  addFlag(f) {
    if (this.flags.has(f)) return;
    this.flags.add(f);
    this.checkAchievements();
  }

  checkAchievements() {
    const p = this.ctx.player;
    const flags = this.flags;
    // save-shaped adapter: predicates in data/achievements.js expect arrays + has()
    const fromFlags = (pre) => [...flags].filter(f => f.startsWith(pre)).map(f => f.slice(pre.length));
    const fl = {
      rooms: flags.rooms || [],
      has: f => flags.has(f),
      abilities: p ? [...p.unlocked] : [],
      relics: p ? [...(p.relicsOwned || p.relics)] : [],
      lore: fromFlags('lore_'),
      chimesLit: fromFlags('lit_'),
      trams: fromFlags('tram_'),
      ending: [...flags].reduce((n, f) => (f.startsWith('ending_') && f !== 'ending_chosen_' + f.slice(7) ? Math.max(n, Number(f.slice(7)) || 0) : n), 0),
      newGamePlus: flags.has('ngp'),
    };
    const s = { ...this.stats, echoes: p ? p.echoes : 0 };
    import('../data/achievements.js').then(({ ACHIEVEMENTS }) => {
      for (const a of ACHIEVEMENTS) {
        if (!flags.has('ach_' + a.id) && a.f(fl, s)) {
          flags.add('ach_' + a.id);
          this.ctx.ui.achievementToast(a.id);
          this.ctx.audio.sfx('secret', { vol: .5 });
        }
      }
    });
  }

  // ------------------------------------------------------------ room lifecycle
  loadRoom(id, tx, ty, opts = {}) {
    const def = ROOMS[id];
    if (!def) { console.error('missing room', id); return; }
    this.roomId = id; this.def = def;
    const compiled = compileRoom(def);
    this.room = compiled;
    this.grid = compiled.grid;
    this.rng = makeRng(id.length * 7919 + def.w * 31 + def.h);
    this.enemies = [];
    this.projectiles = []; this.beams = []; this.shocks = []; this.zones = [];
    this.boss = null; this.bossNoHit = true;
    this.echoPickups = [];
    // props (fresh instances; persistent state in flags)
    this.props = compiled.props.map(p => ({ ...p, used: false }));
    // enemies
    let ei = 0;
    for (const s of def.spawns || []) {
      if (s.t === 'enemy' || s.t === 'elite') {
        const killKey = s.t === 'elite' ? `kill_${id}_${ei}` : null;
        if (killKey && this.flags.has(killKey)) { ei++; continue; }
        this.enemies.push(new Enemy(s.id, s.x, s.y, s.t === 'elite'));
      } else if (s.t === 'npc') {
        // NPCs live as props
        this.props.push({ type: 'npc', npc: s.id, x: s.x * TILE + 16, y: s.y * TILE + TILE, used: false });
      } else if (s.t === 'boss') {
        const bossFlag = 'boss_' + s.id;
        if (!this.flags.has(bossFlag)) {
          this.props.push({ type: 'bossTrigger', boss: s.id, x: s.trigger * TILE + 16, y: s.y * TILE + TILE, bx: s.x * TILE + 16, by: s.y * TILE + TILE, used: false });
        }
      }
      ei++;
    }
    // discovered
    if (!this.flags.rooms) this.flags.rooms = [];
    if (!this.flags.rooms.includes(id)) this.flags.rooms.push(id);
    // place player
    const p = this.ctx.player;
    p.x = tx * TILE + TILE / 2; p.y = ty * TILE + TILE;
    p.vx = 0; p.vy = 0; p.state = 'normal'; p.hookT = null;
    p.scarf.forEach(s => { s.x = p.x; s.y = p.y; });
    // camera snap
    this.cam.x = clamp(p.x - 640, 0, this.roomW() - 1280);
    this.cam.y = clamp(p.y - 400, 0, this.roomH() - 720);
    // audio: region music + ambience
    const region = REGIONS[def.region];
    this.ctx.audio.setRegion(def.region, region.music);
    this.ctx.audio.setAmbience(region.amb);
    this.ctx.audio.setBoss(false);
    if (!opts.silent) this.ctx.ui.regionBanner(def.region, def.key);
    this.checkAchievements();
  }

  roomW() { return this.room ? this.room.w * TILE : 1280; }
  roomH() { return this.room ? this.room.h * TILE : 720; }
  region() { return REGIONS[this.def.region]; }

  // ------------------------------------------------------------ tile queries
  tileAt(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= this.room.w || ty >= this.room.h) return SOLID;
    return this.grid[ty * this.room.w + tx];
  }

  solidRect(x, y, w, h) {
    const x0 = Math.floor(x / TILE), y0 = Math.floor(y / TILE);
    const x1 = Math.floor((x + w - .01) / TILE), y1 = Math.floor((y + h - .01) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= this.room.w || ty >= this.room.h) return true;
      const v = this.grid[ty * this.room.w + tx];
      if (v === SOLID || v === BREAK) return true;
    }
    return false;
  }

  platformAt(x, feetY, w, prevFeetY) {
    const ty = Math.floor(feetY / TILE), prevTy = Math.floor(prevFeetY / TILE);
    if (ty !== prevTy && this.vy >= 0) { /* crossing handled by caller */ }
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - .01) / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= this.room.w || ty >= this.room.h) continue;
      if (this.grid[ty * this.room.w + tx] === PLAT) {
        const top = ty * TILE;
        if (prevFeetY <= top + 2 && feetY >= top) return true;
      }
    }
    return false;
  }

  spikeAt(x, y, w, h) {
    const x0 = Math.floor(x / TILE), y0 = Math.floor(y / TILE);
    const x1 = Math.floor((x + w - .01) / TILE), y1 = Math.floor((y + h - .01) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= this.room.w || ty >= this.room.h) continue;
      if (this.grid[ty * this.room.w + tx] === SPIKE) return true;
    }
    return false;
  }

  waterAt(cx, cy) {
    const v = this.tileAt(cx, cy);
    if (v === WATERD) return 'deep';
    if (v === WATERS) return 'shallow';
    return null;
  }

  veilAt(cx, cy) {
    const v = this.tileAt(cx, cy);
    if (v !== VEIL) return null;
    // expand to the contiguous veil rect
    const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
    let x0 = tx, x1 = tx, y0 = ty, y1 = ty;
    while (x0 > 0 && this.grid[ty * this.room.w + x0 - 1] === VEIL) x0--;
    while (x1 < this.room.w - 1 && this.grid[ty * this.room.w + x1 + 1] === VEIL) x1++;
    while (y0 > 0 && this.grid[(y0 - 1) * this.room.w + tx] === VEIL) y0--;
    while (y1 < this.room.h - 1 && this.grid[(y1 + 1) * this.room.w + tx] === VEIL) y1++;
    return { x: x0 * TILE, y: y0 * TILE, w: (x1 - x0 + 1) * TILE, h: (y1 - y0 + 1) * TILE };
  }

  nearestHookRing(x, y, r) {
    let best = null, bd = r;
    for (const p of this.props) {
      if (p.type !== 'hook') continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  breakTiles(px, py) {
    // break a breakable tile at point (used by strikes/dash)
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= this.room.w || ty >= this.room.h) return false;
    if (this.grid[ty * this.room.w + tx] === BREAK) {
      this.grid[ty * this.room.w + tx] = 0;
      this.ctx.fx.burst(tx * TILE + 16, ty * TILE + 16, 14, { color: ['#8a94b0', '#5a6480'], speed: 160, life: .5, g: 500 });
      this.ctx.audio.sfx('break');
      this.ctx.fx.addShake(3);
      this.flags.add(`brk_${this.roomId}_${tx}_${ty}`);
      return true;
    }
    return false;
  }

  hint(key) {
    if (this.hintT > 0 && this.lastHint === key) return;
    this.hintT = 2.6; this.lastHint = key;
    this.ctx.ui.toast(key);
  }

  // ------------------------------------------------------------ combat surface
  playerStrike(hb, dmg, info) {
    const ctx = this.ctx, p = ctx.player;
    let hits = 0, pogoed = false;
    const hx = hb.x + hb.w / 2, hy = hb.y + hb.h / 2;
    const strikeOne = (obj, isBoss) => {
      const r = isBoss ? obj.hurtRect() : obj.rect();
      if (!aabb(hb.x, hb.y, hb.w, hb.h, r.x, r.y, r.w, r.h)) return false;
      const res = isBoss ? obj.hit(dmg, { ...info, fromX: p.x, hx, hy }, ctx)
        : obj.hit(dmg, { ...info, fromX: p.x, hx, hy }, ctx);
      hits++;
      p.aria = Math.min(p.maxAria, p.aria + 11 * p.stats().ariaMul);
      ctx.fx.addShake(isBoss ? 3 : 1.8);
      return res;
    };
    for (const e of this.enemies) {
      if (e.dead) continue;
      const res = strikeOne(e, false);
      if (res && res.died) { /* handled in onEnemyKilled */ }
      if (info.pogo && res && !res.blocked) pogoed = true;
    }
    if (this.boss && !this.boss.dead) {
      const res = strikeOne(this.boss, true);
      if (info.pogo && res && !res.blocked) pogoed = true;
    }
    // strike projectiles (pogo off them)
    for (const pr of this.projectiles) {
      if (!pr.hostile || pr.dead) continue;
      if (aabb(hb.x, hb.y, hb.w, hb.h, pr.x - pr.r, pr.y - pr.r, pr.r * 2, pr.r * 2)) {
        pr.dead = true;
        ctx.fx.burst(pr.x, pr.y, 6, { color: pr.color, speed: 120, life: .3 });
        if (info.pogo) pogoed = true;
        hits++;
        ctx.audio.sfx('clang', { vol: .4 });
      }
    }
    // breakable tiles
    const points = [hb.x + 4, hb.x + hb.w / 2, hb.x + hb.w - 4];
    for (const px of points) for (const py of [hb.y + 4, hb.y + hb.h / 2, hb.y + hb.h - 4]) {
      this.breakTiles(px, py);
    }
    // reverberation recovery
    if (this.reverberation && this.reverberation.room === this.roomId) {
      const r = this.reverberation;
      if (aabb(hb.x, hb.y, hb.w, hb.h, r.x - 18, r.y - 44, 36, 44)) {
        p.echoes += r.amount;
        ctx.ui.toastFloat(`+${r.amount} ${ctx.i18n.t('item.echo')}`);
        ctx.fx.burst(r.x, r.y - 20, 16, { color: '#bfe8ff', glow: true, speed: 140, life: .6 });
        ctx.audio.sfx('pickup');
        this.reverberation = null;
      }
    }
    return { hits, pogoed };
  }

  enemyMelee(owner, hb, dmg) {
    const p = this.ctx.player;
    const r = p.rect();
    if (aabb(hb.x, hb.y, hb.w, hb.h, r.x, r.y, r.w, r.h)) p.hurt(dmg, owner.x, this.ctx);
  }

  spawnProj(o) { this.projectiles.push({ dead: false, t: 0, ...o }); }

  spawnBeam(o) { this.beams.push({ t: 0, ...o }); }

  spawnShock(x, y, dmg, dir = 0) {
    // ground-traveling shockwave(s)
    const dirs = dir === 0 ? [-1, 1] : [dir];
    for (const d of dirs) {
      this.shocks.push({ x, y: y - 2, vx: d * 330, w: 26, h: 30, t: 0, life: 1.1, dmg, dead: false });
    }
    this.ctx.audio.sfx('clang', { vol: .5 });
  }

  spawnSonde(x, y, vx, vy) {
    this.projectiles.push({ x, y, vx, vy, g: 0, r: 7, dmg: 12, life: .8, kind: 'sonde', hostile: false, dead: false, t: 0, color: '#ffe9b8' });
  }

  spawnEchoBurst(x, y, amount) {
    const n = Math.min(8, 1 + Math.floor(amount / 8));
    for (let i = 0; i < n; i++) {
      this.echoPickups.push({
        x, y, vx: (Math.random() - .5) * 180, vy: -160 - Math.random() * 120,
        amount: Math.ceil(amount / n), t: 0, got: false,
      });
    }
  }

  onEnemyKilled(e, ctx) {
    ctx.fx.burst(e.x, e.y - e.h / 2, 16, { color: [e.def.palette, '#fff', '#ffd9a0'], speed: 200, life: .5 });
    ctx.fx.burst(e.x, e.y - e.h / 2, 6, { color: '#bfe8ff', glow: true, speed: 80, life: .8, g: -40 });
    ctx.audio.sfx('die', { pitch: 220 + Math.random() * 160 });
    this.stats.kills++;
    const amount = Math.round(e.def.echoes * (e.elite ? 1 : 1) * ctx.player.stats().echoMul);
    this.spawnEchoBurst(e.x, e.y - e.h / 2, amount);
  }

  // ------------------------------------------------------------ death & save
  onPlayerDeath() {
    const p = this.ctx.player;
    this.stats.deaths++;
    // drop echoes into a reverberation
    if (p.echoes > 0) {
      this.reverberation = { room: this.roomId, x: p.x, y: p.y, amount: p.echoes };
      p.echoes = 0;
    }
    this.ctx.ui.deathScreen(() => {
      // respawn at last rest chime
      const rp = this.respawnPoint || (this.def.start ? { room: this.roomId, x: this.def.start.x, y: this.def.start.y } : null);
      if (rp) {
        if (rp.room !== this.roomId) this.loadRoom(rp.room, rp.x, rp.y, { silent: true });
        else { const pl = this.ctx.player; pl.x = rp.x * TILE + TILE / 2; pl.y = rp.y * TILE + TILE; pl.state = 'normal'; }
      }
      p.chimes = p.maxChimes; p.aria = 0; p.state = 'normal'; p.vx = 0; p.vy = 0; p.invulnT = 1;
      this.saveToSlot();
    });
    this.checkAchievements();
  }

  setRespawn(room, x, y) { this.respawnPoint = { room, x, y }; }

  saveToSlot() {
    const sys = this.ctx.saveSys, p = this.ctx.player;
    if (this.slotIndex === null) return;
    const data = sys.loadSlot(this.slotIndex) || {};
    data.room = this.roomId;
    data.flags = [...this.flags];
    data.abilities = [...p.unlocked];
    data.relics = [...p.relics];
    data.relicsOwned = [...new Set([...p.relicsOwned, ...p.relics])];
    data.chimes = p.chimes; data.aria = Math.floor(p.aria);
    data.maxChimes = p.maxChimes; data.maxAria = p.maxAria;
    data.echoes = p.echoes;
    data.respawn = this.respawnPoint;
    data.rooms = this.flags.rooms || [];
    data.chimesLit = [...this.flags].filter(f => f.startsWith('lit_')).map(f => f.slice(4));
    data.trams = [...this.flags].filter(f => f.startsWith('tram_')).map(f => f.slice(5));
    data.lore = [...this.flags].filter(f => f.startsWith('lore_')).map(f => f.slice(5));
    data.deaths = this.stats.deaths;
    data.playtime = this.playtime;
    sys.saveToSlot(this.slotIndex, data);
  }

  applySave(data, slotIndex) {
    const p = this.ctx.player;
    this.slotIndex = slotIndex;
    this.flags = new Set(data.flags || []);
    // persistent breakables removed
    this.stats.deaths = data.deaths || 0;
    this.playtime = data.playtime || 0;
    p.unlocked = new Set(data.abilities || ['commune']);
    p.relics = new Set(data.relics || []);
    p.relicsOwned = new Set([...(data.relicsOwned || []), ...(data.relics || [])]);
    p.maxChimes = data.maxChimes || 5; p.chimes = Math.min(data.chimes ?? p.maxChimes, p.maxChimes);
    p.maxAria = data.maxAria || 99; p.aria = data.aria || 0;
    p.echoes = data.echoes || 0;
    this.flags.rooms = data.rooms || [];
    this.respawnPoint = data.respawn || null;
    const st = (ROOMS[data.room] || {}).start;
    this.loadRoom(data.room, data.spawn?.x ?? st?.x ?? 3, data.spawn?.y ?? st?.y ?? 3, { silent: true });
    if (this.respawnPoint && this.respawnPoint.room === data.room) {
      p.x = this.respawnPoint.x; p.y = this.respawnPoint.y; this.cam.x = clamp(p.x - 640, 0, this.roomW() - 1280); this.cam.y = clamp(p.y - 400, 0, this.roomH() - 720);
    }
  }

  // ------------------------------------------------------------ update
  update(dt, input) {
    const ctx = this.ctx, p = ctx.player;
    this.playtime += dt;
    this.hintT -= dt;

    if (this.transition) { this._updateTransition(dt); return; }

    p.update(dt, input, ctx);

    // spikes
    const pr = p.rect();
    if (this.spikeAt(pr.x + 4, pr.y + 8, pr.w - 8, pr.h - 10) && p.invulnT <= 0 && p.state !== 'dead') {
      // hazards: 1 damage + knock to last safe ground
      p.hurt(1, p.x + (p.vx >= 0 ? -40 : 40), ctx);
      if (p.state !== 'dead') { p.vy = -460; }
    }

    // enemies
    const camCx = this.cam.x + 640, camCy = this.cam.y + 360;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - camCx, e.y - camCy);
      if (d > 1500) continue; // sleep far away
      e.update(dt, ctx);
    }
    this.enemies = this.enemies.filter(e => !e.dead && !e.eaten);

    // boss trigger & boss
    for (const prop of this.props) {
      if (prop.type === 'bossTrigger' && !prop.used) {
        if (Math.abs(p.x - prop.x) < 40 && !this.boss) {
          prop.used = true;
          this.boss = new Boss(prop.boss, prop.bx, prop.by);
          this.bossNoHit = true;
          ctx.audio.setBoss(true, 0);
          ctx.audio.sfx('roar');
          ctx.ui.bossBanner(this.boss.nameKey, this.boss.subKey);
          ctx.fx.addShake(6);
        }
      }
    }
    if (this.boss && !this.boss.dead) {
      this.boss.update(dt, ctx, this);
      if (p.invulnT > 0.9) this.bossNoHit = false; // took a hit this frame-ish → no no-hit feat
      if (this.boss.dead) this._onBossDead(this.boss);
    }

    // projectiles
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      pr.t += dt;
      pr.vy += (pr.g || 0) * dt;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (pr.t > pr.life) { pr.dead = true; continue; }
      if (this.solidRect(pr.x - 2, pr.y - 2, 4, 4)) {
        pr.dead = true;
        ctx.fx.burst(pr.x, pr.y, 5, { color: pr.color, speed: 90, life: .3 });
        continue;
      }
      if (pr.kind === 'sonde') {
        // player projectile: hit enemies & boss
        for (const e of this.enemies) {
          if (!e.dead && aabb(pr.x - pr.r, pr.y - pr.r, pr.r * 2, pr.r * 2, e.x - e.w / 2, e.y - e.h, e.w, e.h)) {
            pr.dead = true;
            e.hit(pr.dmg, { fromX: pr.x - pr.vx, hx: pr.x, hy: pr.y }, ctx);
            ctx.fx.doHitstop(.03);
          }
        }
        if (this.boss && !this.boss.dead) {
          const r = this.boss.hurtRect();
          if (aabb(pr.x - pr.r, pr.y - pr.r, pr.r * 2, pr.r * 2, r.x, r.y, r.w, r.h)) {
            pr.dead = true;
            this.boss.hit(pr.dmg, { fromX: pr.x - pr.vx, hx: pr.x, hy: pr.y }, ctx);
          }
        }
      } else if (pr.hostile !== false) {
        const r = p.rect();
        if (p.invulnT <= 0 && p.state !== 'dead' && aabb(pr.x - pr.r, pr.y - pr.r, pr.r * 2, pr.r * 2, r.x, r.y, r.w, r.h)) {
          pr.dead = true;
          p.hurt(pr.dmg, pr.x - pr.vx * .1, ctx);
        }
      }
      if (pr.glow && Math.random() < .3) {
        ctx.fx.spawn({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: .3, size: pr.r * .5, color: pr.color, glow: true, layer: 1 });
      }
    }
    this.projectiles = this.projectiles.filter(pr => !pr.dead);

    // beams (telegraph -> active)
    for (const b of this.beams) {
      b.t += dt;
      const active = b.t > .65 && b.t < .95;
      if (active) {
        const r = p.rect();
        const bx = b.dir > 0 ? b.x : b.x - b.len;
        if (aabb(bx, b.y - 9, b.len, 18, r.x, r.y, r.w, r.h)) p.hurt(b.dmg, b.x, ctx);
      }
      if (b.t > 1) b.done = true;
    }
    this.beams = this.beams.filter(b => !b.done);

    // shockwaves
    for (const s of this.shocks) {
      s.t += dt; s.x += s.vx * dt;
      if (s.t > s.life || this.solidRect(s.x, s.y - 10, 4, 20)) { s.dead = true; continue; }
      const r = p.rect();
      if (p.invulnT <= 0 && p.state !== 'dead' && aabb(s.x - s.w / 2, s.y - s.h, s.w, s.h, r.x, r.y, r.w, r.h)) {
        p.hurt(s.dmg, s.x - Math.sign(s.vx) * 30, ctx);
      }
      if (Math.random() < .6) ctx.fx.spawn({ x: s.x, y: s.y - 4, vx: -s.vx * .1, vy: -60 - Math.random() * 80, life: .4, size: 3, color: '#c9b18a', layer: 1 });
    }
    this.shocks = this.shocks.filter(s => !s.dead);

    // hazard zones (vine slams, tentacles, hands of light, ink water, marks)
    for (const z of this.zones) {
      z.t += dt;
      const active = z.t > (z.delay || 0) && z.t < (z.delay || 0) + z.life;
      z.active = active;
      if (active && z.dmg > 0) {
        const r = p.rect();
        if (p.invulnT <= 0 && p.state !== 'dead' && aabb(z.x, z.y, z.w, z.h, r.x, r.y, r.w, r.h)) {
          p.hurt(z.dmg, z.x + z.w / 2, ctx);
        }
      }
      if (z.kind === 'vine' || z.kind === 'tentacle') {
        if (active && Math.random() < .5) ctx.fx.spawn({ x: z.x + Math.random() * z.w, y: z.y + z.h * Math.random(), vy: -80, life: .3, size: 3, color: z.kind === 'vine' ? '#9fd47a' : '#28485a', layer: 1 });
      }
    }
    this.zones = this.zones.filter(z => z.t < (z.delay || 0) + z.life + .3 && z.kind !== 'inkwater');

    // echo pickups
    for (const ep of this.echoPickups) {
      ep.t += dt;
      const d = Math.hypot(p.x - ep.x, (p.y - 20) - ep.y);
      if (ep.t > .35 && d < 140) {
        const pull = 900 * dt;
        ep.vx += (p.x - ep.x) / d * pull; ep.vy += ((p.y - 20) - ep.y) / d * pull;
      } else { ep.vy += 700 * dt; ep.vx *= .98; }
      ep.x += ep.vx * dt; ep.y += ep.vy * dt;
      if (this.solidRect(ep.x - 3, ep.y - 3, 6, 6)) { ep.vy = -Math.abs(ep.vy) * .4; ep.y -= 2; }
      if (d < 22 && ep.t > .3) {
        ep.got = true;
        p.echoes += ep.amount;
        ctx.audio.sfx('blip', { freq: 900 + Math.random() * 500, vol: .8 });
        ctx.fx.spawn({ x: ep.x, y: ep.y, life: .3, size: 5, color: '#bfe8ff', glow: true, layer: 1 });
      }
    }
    this.echoPickups = this.echoPickups.filter(e => !e.got);

    // exits
    this._checkExits();

    // interactions
    this._updateInteractions(input);

    // camera
    this._updateCamera(dt);

    // ambient particles per region (spawned by renderer)
  }

  _checkExits() {
    const p = this.ctx.player;
    if (p.state === 'dead') return;
    if (this.boss && !this.boss.dead) return; // sealed during the fight
    for (const e of this.def.exits) {
      const r = { x: e.x * TILE, y: e.y * TILE, w: e.w * TILE, h: e.h * TILE };
      if (aabb(p.x - 10, p.y - 36, 20, 36, r.x, r.y, r.w, r.h)) {
        if (e.seal && !this.flags.has(e.seal)) {
          // sealed: keep player out of the doorway
          if (this.hintT <= -1 || this.lastHint !== 'world.locked_boss_door') this.hint('world.locked_boss_door');
          p.x += (p.x < r.x + r.w / 2 ? -1 : 1) * 4;
          continue;
        }
        if (e.gate === 'water' && !p.has('undertow')) { this.hint('hud.notyet.water'); p.x -= 4; continue; }
        this.transition = { t: 0, phase: 'out', to: e.to, tx: e.tx, ty: e.ty, secret: e.secret };
        this.ctx.audio.sfx('ui', { vol: .5 });
        return;
      }
    }
  }

  _updateTransition(dt) {
    const tr = this.transition;
    tr.t += dt;
    if (tr.phase === 'out' && tr.t > .35) {
      this.loadRoom(tr.to, tr.tx, tr.ty, { silent: true });
      if (tr.secret) { this.stats.secretsFound++; this.addFlag(`secret_${tr.to}`); this.ctx.ui.toast('world.hidden'); this.ctx.audio.sfx('secret'); }
      tr.phase = 'in'; tr.t = 0;
    } else if (tr.phase === 'in' && tr.t > .4) {
      this.transition = null;
    }
  }

  _updateInteractions(input) {
    const ctx = this.ctx, p = ctx.player;
    if (ctx.ui.dialogueActive || ctx.ui.overlay) { ctx.ui.prompt = null; return; }
    let best = null, bd = 56;
    for (const prop of this.props) {
      const d = Math.hypot(prop.x - p.x, (prop.y - 20) - (p.y - 20));
      if (d < bd) {
        // interactive types
        const interactive = ['chime', 'tram', 'stele', 'memory', 'chest', 'shrine', 'pickup', 'npc', 'station'];
        if (interactive.includes(prop.type) && !prop.used) { best = prop; bd = d; }
        if (prop.type === 'npc') { best = prop; bd = d; } // npc always re-talkable
      }
    }
    ctx.ui.prompt = best ? this._promptFor(best) : null;
    ctx.ui.promptProp = best;
    if (best && input.pressed.interact && p.grounded) this._interact(best);
  }

  _promptFor(prop) {
    const t = this.ctx.i18n;
    switch (prop.type) {
      case 'chime': return this.flags.has(`lit_${this.roomId}`) ? t.t('hud.rest') : t.t('hud.listen');
      case 'tram': return this.flags.has(`tram_${this.roomId}`) ? t.t('hud.travel') : t.t('hud.strike');
      case 'stele': case 'memory': return t.t('hud.read');
      case 'chest': case 'pickup': case 'shrine': return t.t('hud.take');
      case 'npc': return t.t('hud.talk');
      case 'station': return t.t('hud.listen');
    }
    return null;
  }

  _interact(prop) {
    const ctx = this.ctx, p = ctx.player, t = ctx.i18n;
    switch (prop.type) {
      case 'chime': {
        const key = `lit_${this.roomId}`;
        if (!this.flags.has(key)) {
          this.flags.add(key);
          ctx.audio.sfx('checkpoint');
          ctx.fx.burst(prop.x, prop.y - 60, 18, { color: '#ffd9a0', glow: true, speed: 90, g: -30, life: 1 });
          ctx.ui.toast('hud.saved');
        } else ctx.audio.sfx('bell', { vol: .6 });
        p.chimes = p.maxChimes;
        this.setRespawn(this.roomId, Math.round((prop.x - 16) / TILE), Math.round(prop.y / TILE) - 1);
        this.saveToSlot();
        prop.used = false;
        break;
      }
      case 'tram': {
        const key = `tram_${this.roomId}`;
        if (!this.flags.has(key)) {
          if (!this.flags.has('boss_choirmarshal')) { ctx.ui.toast('world.tram.need'); ctx.audio.sfx('warn', { vol: .5 }); break; }
          this.flags.add(key);
          ctx.audio.sfx('ability', { vol: .7 });
          ctx.ui.toast('world.tram.on');
          this.saveToSlot();
        } else {
          ctx.ui.openFastTravel();
        }
        break;
      }
      case 'stele': {
        prop.used = true;
        this._grantLore(prop.lore);
        break;
      }
      case 'memory': {
        prop.used = true;
        this._grantLore(prop.lore);
        break;
      }
      case 'chest': {
        prop.used = true;
        ctx.audio.sfx('pickup');
        if (prop.item === 'relic') {
          this._grantRelic(prop.id);
        } else if (prop.item === 'chimeshard') {
          this._grantChimeShard();
        } else if (prop.item === 'forkpiece') {
          this._grantForkPiece();
        }
        break;
      }
      case 'pickup': {
        prop.used = true;
        ctx.audio.sfx('pickup');
        if (prop.item === 'seed') {
          this.flags.add('has_seed');
          ctx.ui.itemBanner('item.seed', 'item.seed.desc');
        } else if (prop.item === 'ariamask') {
          this.flags.add('has_ariamask');
          ctx.ui.itemBanner('item.aria_mask', 'item.aria_mask.desc');
        } else if (prop.item === 'codex') {
          this.flags.add('codex_' + prop.x);
          const n = [...this.flags].filter(f => f.startsWith('codex_')).length;
          ctx.ui.itemBanner('item.codex', 'item.codex.desc');
          ctx.ui.toastFloat(`${n} / 3`);
        }
        break;
      }
      case 'shrine': {
        prop.used = true;
        this._grantAbility(prop.ability);
        break;
      }
      case 'npc': {
        ctx.ui.startDialogue(prop.npc, prop);
        break;
      }
      case 'station': {
        ctx.ui.openConclave(prop.idx);
        break;
      }
    }
  }

  _grantLore(id) {
    const ctx = this.ctx;
    const key = 'lore_' + id;
    const isNew = !this.flags.has(key);
    this.flags.add(key);
    ctx.ui.openLore(id, isNew);
    if (isNew) { ctx.audio.sfx('pickup'); this.saveToSlot(); }
    this.checkAchievements();
  }

  _grantRelic(id) {
    const ctx = this.ctx, p = ctx.player;
    if (p.relicsOwned.has(id)) { p.echoes += 60; ctx.ui.toastFloat('+60 ' + ctx.i18n.t('item.echo')); return; }
    p.relicsOwned.add(id);
    if (p.relics.size < 4) p.relics.add(id);
    const st = p.stats();
    const newMax = Math.max(1, Math.round((5 + st.maxChimesAdd) * st.maxChimesMul));
    p.maxChimes = newMax; p.chimes = newMax;
    p.maxAria = 99 + st.maxAriaAdd;
    ctx.ui.itemBanner(ctx.i18n.t(`relic.${id}.name`), ctx.i18n.t(`relic.${id}.desc`));
    ctx.audio.sfx('ability', { vol: .8 });
    this.saveToSlot();
    this.checkAchievements();
  }

  _grantChimeShard() {
    const ctx = this.ctx;
    const n = ([...this.flags].filter(f => f.startsWith('shard_')).length) + 1;
    this.flags.add('shard_' + n);
    ctx.ui.itemBanner(ctx.i18n.t('item.chimeshard'), ctx.i18n.t('item.chimeshard.desc'));
    if (n % 2 === 0) {
      const p = ctx.player;
      const st = p.stats();
      p.maxChimes = Math.max(1, Math.round((5 + Math.floor(n / 2) + st.maxChimesAdd) * st.maxChimesMul));
      p.chimes = p.maxChimes;
      ctx.ui.toast('item.chimeup');
      ctx.audio.sfx('ability', { vol: .9 });
    }
    this.saveToSlot();
  }

  _grantForkPiece() {
    const ctx = this.ctx, p = ctx.player;
    const n = ([...this.flags].filter(f => f.startsWith('fork_')).length) + 1;
    this.flags.add('fork_' + n);
    ctx.ui.itemBanner(ctx.i18n.t('item.forkpiece'), ctx.i18n.t('item.forkpiece.desc'));
    if (n % 3 === 0) {
      const st = p.stats();
      p.maxAria = 99 + st.maxAriaAdd + 30;
      ctx.ui.toast('item.forkup');
      ctx.audio.sfx('ability', { vol: .9 });
    } else {
      p.maxAria += 10;
    }
    this.saveToSlot();
  }

  grantAbility(id) {
    // used by bosses and shrines
    const ctx = this.ctx, p = ctx.player;
    if (p.unlocked.has(id)) return;
    p.unlocked.add(id);
    ctx.ui.itemBanner(t => ctx.i18n.t(`ab.${id}.name`), ctx.i18n.t(`ab.${id}.desc`), true);
    ctx.audio.sfx('ability');
    ctx.fx.doFlash('#ffe9b8', .35);
    this.saveToSlot();
    this.checkAchievements();
  }
  _grantAbility(id) { this.grantAbility(id); }

  _onBossDead(boss) {
    const ctx = this.ctx;
    this.addFlag('boss_' + boss.id);
    if (boss.id === 'tollmaster' && this.bossNoHit) this.addFlag('feat_unrung');
    if (boss.id === 'choirmarshal') this.addFlag('flag_seal_heart'); // unseals the heart vault
    ctx.audio.setBoss(false);
    ctx.audio.sfx('toll');
    ctx.fx.addShake(8);
    this.spawnEchoBurst(boss.x, boss.y - 40, 120);
    this.saveToSlot();
  }

  _updateCamera(dt) {
    const p = this.ctx.player;
    let tx = p.x + p.facing * 60 - 640;
    let ty = p.y - 400;
    if (this.boss && !this.boss.dead) {
      tx = this.boss.arenaX - 640; ty = this.boss.arenaY - 390;
    }
    tx = clamp(tx, 0, Math.max(0, this.roomW() - 1280));
    ty = clamp(ty, 0, Math.max(0, this.roomH() - 720));
    const k = 1 - Math.pow(.0006, dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }
}
