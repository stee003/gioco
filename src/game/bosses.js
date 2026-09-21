// game/bosses.js — six authored bosses. Shared machinery (phases, telegraphs,
// hp, contact damage, death) + per-boss pattern state machines and drawing.
// Each boss teaches something: Tollmaster = commit & jump; Rootwife = pogo &
// patience; Choirmarshal = rhythm & repositioning; Warden = sound discipline;
// Librarian = space control; Antiphon = everything, at once.
import { TILE, clamp, aabb, lerp } from '../core/utils.js';
import { Enemy } from './enemies.js';

export const BOSS_DEFS = {
  tollmaster:   { hp: 320, w: 110, h: 112, nameKey: 'boss.tollmaster', subKey: 'boss.tollmaster.sub', phases: [.6, .25], ability: 'tollstep', quote: 'boss.tollmaster.dead' },
  rootwife:     { hp: 420, w: 150, h: 210, nameKey: 'boss.rootwife', subKey: 'boss.rootwife.sub', phases: [.6, .3], ability: 'grasp', quote: 'boss.rootwife.dead' },
  choirmarshal: { hp: 460, w: 70, h: 92, nameKey: 'boss.choirmarshal', subKey: 'boss.choirmarshal.sub', phases: [.55, .25], ability: 'hook', quote: 'boss.choirmarshal.dead' },
  warden:       { hp: 260, w: 60, h: 54, nameKey: 'boss.warden', subKey: 'boss.warden.sub', phases: [.5], ability: 'phase', quote: 'boss.warden.dead' },
  librarian:    { hp: 380, w: 130, h: 110, nameKey: 'boss.librarian', subKey: 'boss.librarian.sub', phases: [.5], ability: null, quote: 'boss.librarian.dead' },
  antiphon:     { hp: 700, w: 240, h: 270, nameKey: 'boss.antiphon', subKey: 'boss.antiphon.sub', phases: [.6, .25], ability: null, quote: 'boss.antiphon.dead' },
};

export class Boss {
  constructor(id, x, y) {
    const def = BOSS_DEFS[id];
    this.id = id; this.def = def;
    this.x = x; this.y = y;            // center-x, feet-y
    this.sx = x; this.sy = y;
    this.w = def.w; this.h = def.h;
    this.hp = def.hp; this.maxHp = def.hp;
    this.phase = 1;
    this.state = 'idle'; this.t = 0; this.cd = 1.2;
    this.flash = 0; this.invulnT = 0;
    this.facing = -1;
    this.dead = false; this.deathT = 0;
    this.anim = Math.random() * 10;
    this.arenaX = x; this.arenaY = y;
    this.noise = 0;                    // warden mechanic
    this._sub = {};                    // per-boss scratch state
    this.minionBudget = 0;
  }

  update(dt, ctx, world) {
    this.anim += dt; this.t += dt;
    this.flash -= dt; this.invulnT -= dt; this.cd -= dt;
    // player noise tracking (Warden)
    const p = ctx.player;
    const speed = Math.hypot(p.vx, p.vy);
    this.noise = Math.max(this.noise - dt * .8, 0);
    if (speed > 260 || p.state === 'dash' || p.atkT > 0) this.noise = Math.min(2, this.noise + dt * 2.4);
    if (this.state !== 'dying' && this.state !== 'dead') UPDATES[this.id](this, dt, ctx, world);
    if (this.state === 'dying') {
      this.deathT += dt;
      if (Math.random() < .4) ctx.fx.burst(this.x + (Math.random() - .5) * this.w, this.y - Math.random() * this.h, 3, { color: ['#ffd9a0', '#fff', this.def && '#bfe8ff'], speed: 120, life: .6, glow: true });
      if (this.deathT > 1.8) {
        this.dead = true;
        ctx.ui.bossQuote(this.def.quote);
        if (this.def.ability) world.grantAbility(this.def.ability);
      }
      return;
    }
    // phase transitions
    const frac = this.hp / this.maxHp;
    const th = this.def.phases;
    if (this.phase === 1 && th[1] !== undefined && frac <= th[1]) this._enterPhase(3, ctx);
    else if (this.phase === 1 && th[0] !== undefined && frac <= th[0]) this._enterPhase(2, ctx);
    else if (this.phase === 2 && th[1] !== undefined && frac <= th[1]) this._enterPhase(3, ctx);
  }

  _enterPhase(ph, ctx) {
    this.phase = ph;
    this.state = 'roar'; this.t = 0; this.invulnT = 1.2;
    ctx.audio.setBoss(true, ph === 2 ? .4 : .85);
    ctx.audio.sfx('roar');
    ctx.fx.addShake(7);
    if (ctx.settings.flashes) ctx.fx.doFlash('#fff', .25);
    ctx.ui.toast(ph === 2 ? 'boss.phase2' : 'boss.phase3');
  }

  hit(dmg, info, ctx) {
    if (this.state === 'dying') return { blocked: true, died: false };
    if (this.invulnT > 0 || this._isBlocked(info)) {
      ctx.fx.burst(info.hx, info.hy, 5, { color: '#ffe9b8', speed: 120, life: .3, shape: 'spark' });
      ctx.audio.sfx('clang', { vol: .7 });
      return { blocked: true, died: false };
    }
    this.hp -= dmg; this.flash = .12;
    ctx.fx.burst(info.hx, info.hy, 9, { color: ['#ffd9a0', '#fff'], speed: 190, life: .35, shape: 'spark' });
    ctx.audio.sfx('hit', { vol: 1 });
    if (this.hp <= 0) {
      this.hp = 0; this.state = 'dying'; this.t = 0; this.invulnT = 99;
      ctx.fx.addShake(9);
      if (ctx.settings.flashes) ctx.fx.doFlash('#ffe9b8', .5);
      ctx.audio.sfx('toll');
    }
    return { blocked: false, died: this.hp <= 0 };
  }

  _isBlocked() {
    switch (this.id) {
      case 'rootwife': return this.state !== 'stunned' && this.state !== 'roar';
      case 'choirmarshal': return !['descend', 'slam', 'vulnerable', 'overture', 'stunned'].includes(this.state) && this.state !== 'roar';
      case 'warden': return false;
      case 'librarian': return this.state === 'blink';
      case 'antiphon': return !['low', 'vulnerable', 'final'].includes(this.state) && this.state !== 'roar';
      default: return false;
    }
  }

  hurtRect() {
    switch (this.id) {
      case 'rootwife': {
        if (this.state === 'stunned' || this.state === 'roar') return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
        // pods only
        return { x: this.x + (this.facing || 1) * 96 - 22, y: this.y - this.h * .72, w: 44, h: 44 };
      }
      case 'antiphon': {
        if (this.state === 'low' || this.state === 'vulnerable' || this.state === 'final') return { x: this.x - 60, y: this.y - 120, w: 120, h: 130 };
        return { x: this.x - 40, y: this.y - 100, w: 80, h: 90 };
      }
      default: return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }
  }

  contactRect() {
    switch (this.id) {
      case 'rootwife': return { x: this.x - this.w / 2 + 20, y: this.y - this.h + 30, w: this.w - 40, h: this.h - 40 };
      case 'antiphon': return { x: this.x - this.w / 2 + 30, y: this.y - this.h + 40, w: this.w - 60, h: this.h - 60 };
      default: return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }
  }

  _contact(ctx, dmg = 1) {
    const p = ctx.player, r = p.rect(), c = this.contactRect();
    if (p.invulnT <= 0 && p.state !== 'dead' && !['dying'].includes(this.state) && aabb(c.x, c.y, c.w, c.h, r.x, r.y, r.w, r.h)) {
      p.hurt(dmg, this.x, ctx);
    }
  }

  _spawnMinion(ctx, id, x, y) {
    if (this.minionBudget <= 0) return;
    this.minionBudget--;
    ctx.world.enemies.push(new Enemy(id, Math.floor(x / TILE), Math.floor(y / TILE)));
    ctx.fx.burst(x, y, 10, { color: '#bfe8ff', glow: true, speed: 120, life: .5 });
  }

  _groundedPhysics(dt, world, friction = 8) {
    this.vy = (this.vy || 0) + 2400 * dt;
    let ny = this.y + this.vy * dt;
    if (this.vy > 0 && world.solidRect(this.x - this.w / 2, ny - 4, this.w, 8)) {
      ny = Math.floor(ny / TILE) * TILE; this.vy = 0; this.grounded = true;
    } else this.grounded = false;
    this.y = ny;
    let nx = this.x + (this.vx || 0) * dt;
    if (world.solidRect(nx - this.w / 2, this.y - this.h + 6, this.w, this.h - 10)) { this.vx = 0; }
    else this.x = nx;
    if (!['charge'].includes(this.state)) this.vx = (this.vx || 0) * Math.max(0, 1 - friction * dt);
  }
}

// ================================================================ patterns
const UPDATES = {
  // ---------------------------------------------------------- THE TOLLMASTER
  tollmaster(b, dt, ctx, world) {
    const p = ctx.player;
    b._contact(ctx, 1);
    b._groundedPhysics(dt, world);
    const fast = b.phase >= 3 ? 1.35 : 1;
    b.facing = p.x < b.x ? -1 : 1;
    switch (b.state) {
      case 'idle': {
        b.vx = b.facing * 46 * fast;
        if (b.cd <= 0) {
          const d = Math.abs(p.x - b.x);
          if (b.phase >= 2 && d > 260 && Math.random() < .6) { b.state = 'tele_charge'; b.t = 0; }
          else if (Math.random() < .4) { b.state = 'tele_toll'; b.t = 0; }
          else { b.state = 'tele_swing'; b.t = 0; }
        }
        break;
      }
      case 'tele_swing':
        b.vx = 0;
        if (b.t > .6 / fast) {
          b.state = 'swing'; b.t = 0;
          world.enemyMelee(b, { x: b.x + b.facing * 14, y: b.y - 100, w: 120, h: 100 }, 1);
          world.spawnShock(b.x + b.facing * 50, b.y, 1, b.facing);
          if (b.phase >= 3) world.spawnShock(b.x + b.facing * 50, b.y, 1, b.facing);
          ctx.audio.sfx('clang', { vol: 1 }); ctx.fx.addShake(4);
        }
        break;
      case 'swing':
        if (b.t > .4) { b.state = 'idle'; b.t = 0; b.cd = 1.1 / fast; }
        break;
      case 'tele_toll':
        b.vx = 0;
        if (b.t > .55 / fast) {
          b.state = 'toll'; b.t = 0;
          const sp = b.phase >= 3 ? 340 : 260;
          world.spawnProj({ x: b.x, y: b.y - 40, vx: sp, vy: 0, g: 0, r: 16, dmg: 1, life: 2.2, kind: 'ring', color: '#ffd9a0', glow: true });
          world.spawnProj({ x: b.x, y: b.y - 40, vx: -sp, vy: 0, g: 0, r: 16, dmg: 1, life: 2.2, kind: 'ring', color: '#ffd9a0', glow: true });
          ctx.audio.sfx('toll', { vol: .8 });
          b._tollLow = 1.1; // bell drops -> vulnerable window
        }
        break;
      case 'toll':
        b.vx = 0;
        if (b.t > .9) { b.state = 'idle'; b.t = 0; b.cd = 1 / fast; }
        break;
      case 'tele_charge':
        b.vx = 0;
        if (b.t > .7) { b.state = 'charge'; b.t = 0; b.vx = b.facing * 470; ctx.audio.sfx('dash'); }
        break;
      case 'charge':
        b.vx = b.facing * 470;
        if (b.t > .8) { b.state = 'idle'; b.t = 0; b.cd = 1.4; }
        break;
      case 'roar':
        if (b.t > 1.2) { b.state = 'idle'; b.t = 0; b.cd = .6; }
        break;
      default: b.state = 'idle';
    }
    // summon once at 60%
    if (b.phase >= 2 && !b._sub.summoned && b.hp < b.maxHp * .62) {
      b._sub.summoned = true; b.minionBudget = 2;
      b._spawnMinion(ctx, 'cinderling', b.x - 160, b.y);
      b._spawnMinion(ctx, 'cinderling', b.x + 160, b.y);
    }
  },

  // ---------------------------------------------------------- THE ROOTWIFE
  rootwife(b, dt, ctx, world) {
    const p = ctx.player;
    b._contact(ctx, 1);
    const W = world.roomW();
    b.arenaX = W / 2;
    // thorn zones from P2 handled via world.zones
    switch (b.state) {
      case 'idle': {
        if (b.cd <= 0) {
          const roll = Math.random();
          if (roll < .4) { b.state = 'tele_vines'; b.t = 0; b._targets = [p.x - 70, p.x, p.x + 70]; }
          else if (roll < .75) { b.state = 'tele_seeds'; b.t = 0; }
          else { b.state = 'tele_sweep'; b.t = 0; b._sweepDir = p.x < b.x ? -1 : 1; }
        }
        break;
      }
      case 'tele_vines':
        if (b.t > .7) {
          b.state = 'vines'; b.t = 0;
          for (const tx of b._targets) {
            world.zones.push({ x: tx - 26, y: b.y - 150, w: 52, h: 150, t: 0, life: .5, dmg: 1, kind: 'vine', delay: 0 });
          }
          ctx.audio.sfx('break', { vol: .7 }); ctx.fx.addShake(3);
        }
        break;
      case 'vines':
        if (b.t > .8) { b.state = 'idle'; b.t = 0; b.cd = 1.3; }
        break;
      case 'tele_seeds':
        if (b.t > .6) {
          b.state = 'seeds'; b.t = 0; b._seedN = 0;
        }
        break;
      case 'seeds':
        if (b._seedN < 4 && b.t > b._seedN * .28) {
          const dx = (p.x - b.x) * .35 + (b._seedN - 1.5) * 90;
          world.spawnProj({
            x: b.x, y: b.y - b.h * .8, vx: clamp(dx * .9, -420, 420), vy: -620,
            g: 1300, r: 9, dmg: 1, life: 3, kind: 'seed', color: '#c9f29b', glow: true,
          });
          ctx.audio.sfx('sonde', { vol: .6 });
          b._seedN++;
        }
        if (b.t > 1.6) { b.state = 'idle'; b.t = 0; b.cd = 1.2; }
        break;
      case 'tele_sweep':
        if (b.t > .55) {
          b.state = 'sweep'; b.t = 0;
          world.enemyMelee(b, { x: b.x + b._sweepDir * 30 - 20, y: b.y - 36, w: 150, h: 36 }, 1);
          ctx.audio.sfx('swing', { vol: .8 });
        }
        break;
      case 'sweep':
        if (b.t > .5) { b.state = 'idle'; b.t = 0; b.cd = 1.1; }
        break;
      case 'roar':
        if (b.t > 1.1) { b.state = 'idle'; b.t = 0; b.cd = .5; }
        break;
      case 'stunned':
        if (b.t > 2.4) { b.state = 'idle'; b.t = 0; b.cd = .8; }
        break;
      default: b.state = 'idle';
    }
    // pollen rain P3
    if (b.phase >= 3) {
      b._pollen = (b._pollen || 0) - dt;
      if (b._pollen <= 0) {
        b._pollen = .5;
        world.spawnProj({ x: b.x + (Math.random() - .5) * W * .7, y: b.y - 340, vx: 0, vy: 120, g: 160, r: 7, dmg: 1, life: 4, kind: 'pollen', color: '#eaffcf', glow: true });
      }
    }
    // stun on 25% chunks
    const chunk = Math.floor((1 - b.hp / b.maxHp) / .25);
    if (chunk > (b._sub.stunChunk || 0) && b.state !== 'roar') {
      b._sub.stunChunk = chunk;
      b.state = 'stunned'; b.t = 0;
      ctx.audio.sfx('warn', { vol: .7 });
      ctx.ui.toastFloat('\u266a \u266a');
    }
  },

  // ---------------------------------------------------------- CANTOR-MARSHAL
  choirmarshal(b, dt, ctx, world) {
    const p = ctx.player;
    const W = world.roomW(), floorY = Math.floor(world.roomH() / TILE - 6) * TILE;
    b.arenaX = W / 2;
    b._contact(ctx, 1);
    b._sub.anchors = b._sub.anchors || [[W * .22, floorY - 170], [W * .5, floorY - 240], [W * .78, floorY - 170]];
    if (!b._sub.anchor) { b._sub.anchor = 1; b.x = b._sub.anchors[1][0]; b.y = b._sub.anchors[1][1]; }
    const spd = b.phase >= 2 ? 2.2 : 1.5;
    switch (b.state) {
      case 'idle': {
        // glide to anchor
        const a = b._sub.anchors[b._sub.anchor];
        b.x = lerp(b.x, a[0], 1 - Math.pow(.2, dt * spd));
        b.y = lerp(b.y, a[1], 1 - Math.pow(.2, dt * spd));
        if (b.cd <= 0) {
          const roll = Math.random();
          if (b.phase >= 3 && roll < .35) { b.state = 'casting'; b.t = 0; b._beat = 0; }
          else if (roll < .55) { b.state = 'tele_slam'; b.t = 0; b._slamX = p.x; }
          else if (roll < .8) { b.state = 'tele_gears'; b.t = 0; }
          else { b.state = 'tele_beam'; b.t = 0; }
        }
        break;
      }
      case 'tele_slam': {
        const gx = b._slamX;
        if (b.t > .6) {
          b.state = 'slam'; b.t = 0;
          b.x = gx; b.y = floorY - 320;
        }
        break;
      }
      case 'slam':
        b.vy = (b.vy || 0) + 3800 * dt;
        b.y += b.vy * dt;
        if (b.y >= floorY) {
          b.y = floorY;
          world.enemyMelee(b, { x: b.x - 90, y: floorY - 80, w: 180, h: 80 }, 1);
          world.spawnShock(b.x, floorY, 1);
          ctx.audio.sfx('clang', { vol: 1 }); ctx.fx.addShake(5);
          b.state = 'vulnerable'; b.t = 0; b.vy = 0;
        }
        break;
      case 'vulnerable':
        if (b.t > .9) { b.state = 'rise'; b.t = 0; }
        break;
      case 'rise':
        b.y = lerp(b.y, b._sub.anchors[b._sub.anchor][1], 1 - Math.pow(.1, dt));
        if (b.t > .7) {
          b.state = 'idle'; b.t = 0; b.cd = 1.2;
          b._sub.anchor = (b._sub.anchor + (Math.random() < .5 ? 1 : 2)) % 3;
        }
        break;
      case 'tele_gears':
        if (b.t > .5) {
          b.state = 'idle'; b.t = 0; b.cd = 1.5;
          const n = b.phase >= 2 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            world.spawnProj({ x: 30, y: floorY - 20, vx: 240 + i * 40, vy: 0, g: 0, r: 15, dmg: 1, life: 6, kind: 'gear', color: '#e09a5a', ground: floorY });
            world.spawnProj({ x: W - 30, y: floorY - 20, vx: -(240 + i * 40), vy: 0, g: 0, r: 15, dmg: 1, life: 6, kind: 'gear', color: '#e09a5a', ground: floorY });
          }
          ctx.audio.sfx('clang', { vol: .6 });
        }
        break;
      case 'tele_beam':
        if (b.t > .55) {
          b.state = 'idle'; b.t = 0; b.cd = 1.4;
          world.spawnBeam({ x: b.x, y: b.y, dir: p.x < b.x ? -1 : 1, len: 500, dmg: 1, t: 0, color: '#ffd090' });
          b.facing = p.x < b.x ? -1 : 1;
        }
        break;
      case 'casting': {
        // rhythmic shockwaves on the beat; then overture window
        const beat = .75;
        if (b.t > b._beat * beat) {
          b._beat++;
          world.spawnProj({ x: 30, y: floorY - 20, vx: 300, vy: 0, g: 0, r: 14, dmg: 1, life: 5, kind: 'gear', color: '#ffd9a0', glow: true, ground: floorY });
          ctx.audio.sfx('tick', { vol: .9 });
        }
        if (b._beat > 4) { b.state = 'overture'; b.t = 0; b.vy = 0; }
        break;
      }
      case 'overture':
        b.y = lerp(b.y, floorY - 10, 1 - Math.pow(.02, dt));
        b.x = lerp(b.x, W / 2, 1 - Math.pow(.2, dt));
        if (b.t > 3.2) { b.state = 'rise'; b.t = 0; }
        break;
      case 'roar':
        if (b.t > 1.1) { b.state = 'idle'; b.t = 0; b.cd = .5; }
        break;
      default: b.state = 'idle';
    }
    if (b.phase >= 2 && !b._sub.summoned) {
      b._sub.summoned = true; b.minionBudget = 1;
      b._spawnMinion(ctx, 'stoker', b.x < W / 2 ? W - 120 : 120, floorY);
    }
  },

  // ---------------------------------------------------------- WARDEN OF HUSH
  warden(b, dt, ctx, world) {
    const p = ctx.player;
    b._contact(ctx, 1);
    const W = world.roomW(), floorY = Math.floor(world.roomH() / TILE - 4) * TILE;
    b.arenaX = W / 2; b.arenaY = world.roomH() / 2;
    const calm = b.noise < .2 && b.state === 'swim';
    b._sub.segs = b._sub.segs || Array.from({ length: 7 }, () => ({ x: b.x, y: b.y - 20 }));
    const calmFactor = calm ? .35 : 1;
    switch (b.state) {
      case 'swim': {
        // ghost through the arena toward the player's noise
        const tx = p.x + Math.sin(b.anim * .8) * 140;
        const ty = floorY - 90 + Math.sin(b.anim * 1.3) * 90;
        b.x = lerp(b.x, tx, 1 - Math.pow(.4, dt * calmFactor));
        b.y = lerp(b.y, ty, 1 - Math.pow(.4, dt * calmFactor));
        if (b.cd <= 0) {
          const noisy = b.noise > .9;
          if (Math.random() < (noisy ? .75 : .3)) { b.state = 'tele_burst'; b.t = 0; b._burstX = p.x; }
          else { b.state = 'tele_leap'; b.t = 0; }
        }
        break;
      }
      case 'tele_burst':
        if (b.t > .6) {
          b.state = 'burst'; b.t = 0;
          b.x = b._burstX; b.y = floorY + 10;
          world.enemyMelee(b, { x: b.x - 44, y: floorY - 90, w: 88, h: 96 }, 1);
          ctx.audio.sfx('break', { vol: .8 }); ctx.fx.addShake(4);
          ctx.fx.burst(b.x, floorY, 12, { color: '#39415e', speed: 160, life: .5 });
        }
        break;
      case 'burst':
        if (b.t > .5) { b.state = 'swim'; b.t = 0; b.cd = (calm ? 3.4 : 1.4) / (b.phase >= 2 ? 1.3 : 1); }
        break;
      case 'tele_leap':
        if (b.t > .45) {
          b.state = 'leap'; b.t = 0;
          b._leapVx = clamp((p.x - b.x) * 1.1, -520, 520);
          b._leapVy = -720;
          ctx.audio.sfx('dash');
        }
        break;
      case 'leap': {
        b._leapVy += 2000 * dt;
        b.x += b._leapVx * dt; b.y += b._leapVy * dt;
        if (b.y >= floorY) {
          b.y = floorY; b.state = 'swim'; b.t = 0;
          world.spawnShock(b.x, floorY, 1);
          b.cd = (calm ? 3 : 1.2);
        }
        break;
      }
      case 'roar':
        if (b.t > 1) { b.state = 'swim'; b.t = 0; b.cd = .8; }
        break;
      default: b.state = 'swim';
    }
    // segment trail
    let px = b.x, py = b.y - 30;
    for (const s of b._sub.segs) {
      s.x = lerp(s.x, px, 1 - Math.pow(.0001, dt));
      s.y = lerp(s.y, py, 1 - Math.pow(.0001, dt));
      px = s.x; py = s.y;
    }
  },

  // ---------------------------------------------------------- THE LIBRARIAN
  librarian(b, dt, ctx, world) {
    const p = ctx.player;
    b._contact(ctx, 1);
    const W = world.roomW(), floorY = Math.floor(world.roomH() / TILE - 4) * TILE;
    b.arenaX = W / 2;
    // rising water in phase 2
    if (b.phase >= 2) {
      b._water = Math.min((b._water || 0) + dt * 6, 80);
      world.zones.push({ x: 0, y: floorY - b._water, w: W, h: b._water, t: 0, life: .1, dmg: 0, kind: 'inkwater', delay: 0 });
    }
    switch (b.state) {
      case 'idle':
        if (b.cd <= 0) {
          const roll = Math.random();
          if (roll < .4) { b.state = 'tele_tents'; b.t = 0; b._targets = [p.x - 80, p.x + 20, p.x + 110]; }
          else if (roll < .7) { b.state = 'tele_fish'; b.t = 0; }
          else if (b.phase >= 2) { b.state = 'tele_pages'; b.t = 0; }
          else { b.state = 'blink'; b.t = 0; }
        }
        break;
      case 'tele_tents':
        if (b.t > .65) {
          b.state = 'tents'; b.t = 0;
          for (const tx of b._targets) {
            world.zones.push({ x: tx - 24, y: floorY - 140, w: 48, h: 140, t: 0, life: .45, dmg: 1, kind: 'tentacle', delay: 0 });
          }
          ctx.audio.sfx('break', { vol: .5 });
        }
        break;
      case 'tents':
        if (b.t > .8) { b.state = 'idle'; b.t = 0; b.cd = b.phase >= 2 ? .9 : 1.4; }
        break;
      case 'tele_fish':
        if (b.t > .5) {
          b.state = 'idle'; b.t = 0; b.cd = 1.3;
          for (let i = 0; i < 3; i++) {
            world.spawnProj({
              x: b.x, y: b.y - b.h * .8, vx: (p.x - b.x) * .5 + (i - 1) * 130, vy: -560,
              g: 1200, r: 8, dmg: 1, life: 3, kind: 'fish', color: '#5ab0a8', glow: true,
            });
          }
          ctx.audio.sfx('sonde', { vol: .6 });
        }
        break;
      case 'tele_pages':
        if (b.t > .5) {
          b.state = 'idle'; b.t = 0; b.cd = 1.6;
          for (let i = 0; i < 4; i++) {
            world.spawnProj({
              x: b.x, y: b.y - b.h - 20, vx: (Math.random() - .5) * 200, vy: -200 - Math.random() * 100,
              g: 260, r: 9, dmg: 1, life: 4, kind: 'page', color: '#d8c79a',
            });
          }
        }
        break;
      case 'blink': // reposition (invulnerable)
        if (b.t > .5) {
          b.x = clamp(p.x + (Math.random() < .5 ? -1 : 1) * (220 + Math.random() * 120), 80, W - 80);
          ctx.fx.burst(b.x, b.y - 40, 12, { color: '#28485a', speed: 140, life: .5 });
          b.state = 'idle'; b.t = 0; b.cd = .9;
        }
        break;
      case 'roar':
        if (b.t > 1) { b.state = 'idle'; b.t = 0; b.cd = .6; }
        break;
      default: b.state = 'idle';
    }
    if (b.phase >= 2 && !b._sub.summoned) {
      b._sub.summoned = true; b.minionBudget = 2;
      b._spawnMinion(ctx, 'drownedquill', b.x - 200, floorY - 20);
      b._spawnMinion(ctx, 'drownedquill', b.x + 200, floorY - 20);
    }
  },

  // ---------------------------------------------------------- THE ANTIPHON
  antiphon(b, dt, ctx, world) {
    const p = ctx.player;
    const W = world.roomW(), floorY = Math.floor(world.roomH() / TILE - 6) * TILE;
    b.arenaX = W / 2; b.arenaY = floorY - 200;
    b._contact(ctx, 1);
    b._sub.hang = floorY - 420;   // y of the bell's mouth when raised
    const hang = b._sub.hang;
    switch (b.state) {
      case 'idle': {
        // pendulum sway, hanging high
        b.x = W / 2 + Math.sin(b.anim * .5) * 60;
        b.y = lerp(b.y, hang, 1 - Math.pow(.05, dt));
        if (b.cd <= 0) {
          const roll = Math.random();
          if (roll < .4) { b.state = 'tele_toll'; b.t = 0; }
          else if (roll < .7) { b.state = 'tele_beams'; b.t = 0; }
          else if (b.phase >= 2) { b.state = 'tele_shards'; b.t = 0; }
          else { b.state = 'tele_toll'; b.t = 0; }
        }
        break;
      }
      case 'tele_toll':
        if (b.t > .7) {
          b.state = 'toll'; b.t = 0;
          const n = b.phase >= 2 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            setTimeout(() => {
              if (b.dead) return;
              const sp = 300;
              world.spawnProj({ x: b.x, y: floorY - 26, vx: sp, vy: 0, g: 0, r: 14, dmg: 1, life: 3, kind: 'ring', color: '#e8d8ff', glow: true });
              world.spawnProj({ x: b.x, y: floorY - 26, vx: -sp, vy: 0, g: 0, r: 14, dmg: 1, life: 3, kind: 'ring', color: '#e8d8ff', glow: true });
              ctx.audio.sfx('toll', { vol: .9 });
            }, i * 450);
          }
        }
        break;
      case 'toll':
        // the bell drops low — melee window
        b.y = lerp(b.y, floorY - 130, 1 - Math.pow(.02, dt));
        b.x = lerp(b.x, W / 2, 1 - Math.pow(.2, dt));
        if (b.t > 1.4) { b.state = 'idle'; b.t = 0; b.cd = 1.4; }
        break;
      case 'tele_beams':
        if (b.t > .7) {
          b.state = 'idle'; b.t = 0; b.cd = 1.5;
          const dir = p.x < b.x ? -1 : 1;
          world.spawnBeam({ x: b.x + dir * 60, y: floorY - 60, dir, len: W, dmg: 1, t: 0, color: '#e8d8ff' });
          if (b.phase >= 3) world.spawnBeam({ x: b.x + dir * 60, y: floorY - 150, dir, len: W, dmg: 1, t: .2, color: '#e8d8ff' });
        }
        break;
      case 'tele_shards':
        if (b.t > .6) {
          b.state = 'idle'; b.t = 0; b.cd = 1.3;
          for (let i = 0; i < (b.phase >= 3 ? 6 : 4); i++) {
            const x = 60 + Math.random() * (W - 120);
            world.zones.push({ x: x - 16, y: floorY - 8, w: 32, h: 8, t: 0, life: .9, dmg: 0, kind: 'mark', delay: .55 });
            setTimeout(() => {
              if (b.dead) return;
              world.spawnProj({ x, y: floorY - 360, vx: 0, vy: 480, g: 300, r: 8, dmg: 1, life: 2, kind: 'shard', color: '#fff2ff', glow: true });
            }, 550);
          }
          ctx.audio.sfx('warn', { vol: .7 });
        }
        break;
      case 'final': {
        // last stand: hands of light + slow drift; always vulnerable
        b.y = lerp(b.y, floorY - 140, 1 - Math.pow(.05, dt));
        b._hands = (b._hands || 0) - dt;
        if (b._hands <= 0) {
          b._hands = .8;
          const gap = Math.floor(Math.random() * 5);
          for (let i = 0; i < 6; i++) {
            if (i === gap || i === gap + 1) continue;
            world.zones.push({ x: 40 + i * (W - 80) / 6, y: floorY - 150, w: (W - 80) / 6 - 14, h: 150, t: 0, life: .7, dmg: 1, kind: 'hand', delay: .35 });
          }
          ctx.audio.sfx('warn', { vol: .6 });
        }
        if (Math.random() < .02) {
          if (ctx.settings.flashes) ctx.fx.doFlash('#fff2ff', .2);
        }
        break;
      }
      case 'roar':
        if (b.t > 1.2) { b.state = 'idle'; b.t = 0; b.cd = .6; }
        break;
      default: b.state = 'idle';
    }
    if (b.phase >= 3 && !b._sub.final) {
      b._sub.final = true;
      setTimeout(() => { if (!b.dead) { b.state = 'final'; b.t = 0; } }, 4000);
    }
    if (b.phase >= 2 && !b._sub.summoned) {
      b._sub.summoned = true; b.minionBudget = 2;
      b._spawnMinion(ctx, 'echoshade', b.x - 260, floorY);
      b._spawnMinion(ctx, 'echoshade', b.x + 260, floorY);
    }
  },
};

// ================================================================ drawing
export function drawBoss(c, b, time, world) {
  const boil = Math.floor(time * 8);
  const n = s => Math.sin(s * 12.9898 + boil * 78.233) * 1.5;
  c.save();
  if (b.flash > 0) c.filter = 'brightness(2.2)';
  DRAWB[b.id](c, b, n, time, world);
  c.restore();
  if (b.state === 'dying') {
    c.save();
    c.globalAlpha = Math.max(0, 1 - b.deathT / 1.8);
    c.translate(b.x, b.y);
    c.rotate(b.deathT * .12);
    c.translate(-b.x, -b.y);
    DRAWB[b.id](c, b, n, time, world);
    c.restore();
  }
}

const DRAWB = {
  tollmaster(c, b, n, time) {
    const lean = b.state === 'tele_charge' ? -b.facing * .18 : b.state === 'charge' ? b.facing * .1 : Math.sin(b.anim * 1.5) * .03;
    c.save();
    c.translate(b.x, b.y);
    c.rotate(lean);
    c.scale(b.facing < 0 ? -1 : 1, 1);
    if (b.state === 'dying') c.rotate(b.deathT * .3), c.globalAlpha = 1 - b.deathT / 1.8;
    // body: heavy bronze plate
    c.fillStyle = '#6e5a3a';
    c.strokeStyle = '#3a2e1a'; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-34, 0); c.lineTo(-38, -70); c.quadraticCurveTo(-30, -96, 0, -100);
    c.quadraticCurveTo(30, -96, 38, -70); c.lineTo(34, 0); c.closePath();
    c.fill(); c.stroke();
    // plates
    c.strokeStyle = '#574427'; c.lineWidth = 2;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-34, -24 - i * 24); c.lineTo(34, -24 - i * 24); c.stroke(); }
    // bell head — huge
    const hy = -128;
    c.fillStyle = '#c9a86a';
    c.beginPath();
    c.moveTo(-8, hy - 22); c.bezierCurveTo(-38, hy - 18, -44, hy + 22, -40, hy + 34);
    c.lineTo(40, hy + 34); c.bezierCurveTo(44, hy + 22, 38, hy - 18, 8, hy - 22);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#8a6a30'; c.fillRect(-42, hy + 32, 84, 7);
    c.strokeRect(-42, hy + 32, 84, 7);
    // mouth shadow + eyes
    c.fillStyle = '#1c1710';
    c.beginPath(); c.ellipse(0, hy + 18, 28, 10, 0, 0, 7); c.fill();
    const angry = b.phase >= 2;
    c.fillStyle = angry ? '#ffb0a0' : '#ffe9b8';
    c.beginPath(); c.ellipse(-11, hy + 17, 4, 5, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(11, hy + 17, 4, 5, 0, 0, 7); c.fill();
    // toll glow
    if (b.state === 'tele_toll' || b.state === 'toll') {
      c.strokeStyle = `rgba(255,217,160,${.4 + Math.sin(time * 18) * .3})`;
      c.lineWidth = 3;
      c.beginPath(); c.arc(0, hy + 8, 56 + Math.sin(time * 10) * 6, 0, 7); c.stroke();
    }
    // maul
    c.save();
    c.translate(38, -66);
    const swing = b.state === 'tele_swing' ? -2.2 + Math.sin(b.t * 12) * .15 : b.state === 'swing' ? 1.1 : .4 + Math.sin(b.anim * 1.5) * .08;
    c.rotate(swing);
    c.strokeStyle = '#3a2e1a'; c.lineWidth = 8;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(52, 0); c.stroke();
    c.fillStyle = '#8a744e'; c.fillRect(48, -22, 26, 44);
    c.strokeStyle = '#3a2e1a'; c.lineWidth = 3; c.strokeRect(48, -22, 26, 44);
    c.restore();
    // legs
    c.strokeStyle = '#3a2e1a'; c.lineWidth = 9;
    const sw = Math.sin(b.anim * 3) * 5;
    c.beginPath(); c.moveTo(-16, -6); c.lineTo(-18 + sw, 0); c.stroke();
    c.beginPath(); c.moveTo(16, -6); c.lineTo(18 - sw, 0); c.stroke();
    c.restore();
  },

  rootwife(c, b, n, time, world) {
    const W = world ? world.roomW() : 1000;
    c.save();
    c.translate(b.x, b.y);
    if (b.state === 'dying') c.globalAlpha = 1 - b.deathT / 1.8;
    // great trunk
    c.fillStyle = '#4e4030';
    c.strokeStyle = '#2e2618'; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-40, 0);
    c.bezierCurveTo(-54, -80, -30, -150, -16, -200);
    c.lineTo(16, -200);
    c.bezierCurveTo(30, -150, 54, -80, 40, 0);
    c.closePath(); c.fill(); c.stroke();
    // roots into ground
    c.strokeStyle = '#3a2f20'; c.lineWidth = 8;
    for (const rx of [-46, -20, 20, 46]) {
      c.beginPath(); c.moveTo(rx * .6, -6); c.quadraticCurveTo(rx, 4, rx * 1.3, 0); c.stroke();
    }
    // mask face (higher up)
    c.fillStyle = '#d8cfae';
    c.strokeStyle = '#5a5138'; c.lineWidth = 2.4;
    c.beginPath(); c.ellipse(0, -168, 26, 32, 0, 0, 7); c.fill(); c.stroke();
    // closed serene eyes / open when stunned
    c.strokeStyle = '#5a5138'; c.lineWidth = 3;
    if (b.state === 'stunned' || b.state === 'dying') {
      c.fillStyle = '#2e2618';
      c.beginPath(); c.ellipse(-10, -170, 4.4, 5.4, 0, 0, 7); c.fill();
      c.beginPath(); c.ellipse(10, -170, 4.4, 5.4, 0, 0, 7); c.fill();
    } else {
      c.beginPath(); c.moveTo(-16, -170); c.quadraticCurveTo(-10, -174, -4, -170); c.stroke();
      c.beginPath(); c.moveTo(4, -170); c.quadraticCurveTo(10, -174, 16, -170); c.stroke();
    }
    // moss crown + blooms
    for (let i = 0; i < 5; i++) {
      const bx = -30 + i * 15, by = -204 - Math.abs(n(i)) * 4;
      c.strokeStyle = '#5e7e52'; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(bx, -200); c.quadraticCurveTo(bx + 4, by + 8, bx + 2, by); c.stroke();
      c.fillStyle = ['#c9f29b', '#eaffcf', '#9fd47a'][i % 3];
      c.beginPath(); c.arc(bx + 2, by, 3.4, 0, 7); c.fill();
    }
    // the two hittable pods (side blooms)
    for (const side of [-1, 1]) {
      const px = side * 96, py = -b.h * .72 + 8;
      const pulse = b.state === 'stunned' ? 1.2 : 1 + Math.sin(time * 3 + side) * .06;
      c.fillStyle = b.state === 'stunned' ? '#eaffcf' : '#7fae5e';
      c.strokeStyle = '#46602f'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(px, py, 20 * pulse, 22 * pulse, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#d2f7a8';
      c.beginPath(); c.arc(px, py, 6, 0, 7); c.fill();
      // vine connecting
      c.strokeStyle = '#4e5e3a'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(side * 30, -120); c.quadraticCurveTo(side * 70, py, px, py); c.stroke();
    }
    // telegraphs: vine target cracks
    if (b.state === 'tele_vines' && b._targets) {
      for (const tx of b._targets) {
        c.strokeStyle = `rgba(201,242,155,${.4 + Math.sin(time * 16) * .3})`;
        c.lineWidth = 3;
        c.beginPath(); c.moveTo(tx - world.cam.x + world.cam.x - b.x - 24, 0);
        c.lineTo(tx - b.x - 24, 0); // simplified; actual marks drawn in world layer
        c.stroke();
      }
    }
    c.restore();
  },

  choirmarshal(c, b, n, time, world) {
    c.save();
    c.translate(b.x, b.y);
    c.scale(b.facing < 0 ? -1 : 1, 1);
    if (b.state === 'dying') c.globalAlpha = 1 - b.deathT / 1.8, c.rotate(b.deathT * .2);
    const float = Math.sin(b.anim * 2) * 4;
    c.translate(0, float - b.h / 2);
    // cape
    c.fillStyle = '#4e2c3a';
    c.beginPath();
    c.moveTo(-14, -30); c.quadraticCurveTo(-34, 4, -24, 42 + n(1));
    c.lineTo(24, 42 + n(2)); c.quadraticCurveTo(34, 4, 14, -30);
    c.closePath(); c.fill();
    // armor torso
    c.fillStyle = '#8a7a5a';
    c.strokeStyle = '#3e3428'; c.lineWidth = 2.6;
    c.beginPath(); c.ellipse(0, -12, 20, 26, 0, 0, 7); c.fill(); c.stroke();
    // helm: conductor's crest
    c.fillStyle = '#a89468';
    c.beginPath(); c.arc(0, -40, 13, 0, 7); c.fill(); c.stroke();
    c.strokeStyle = '#3e3428'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-12, -40); c.lineTo(12, -40); c.stroke();
    // plume
    c.strokeStyle = '#c46a6a'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -52); c.quadraticCurveTo(6, -64 + n(3), 14, -62); c.stroke();
    // eyeslit
    c.fillStyle = '#ffd9a0';
    c.fillRect(-7, -43, 14, 3);
    // hammer-baton
    c.save();
    c.translate(16, -16);
    const swing = b.state === 'tele_slam' ? -2.4 : b.state === 'slam' ? 1.3 : b.state === 'casting' ? Math.sin(b.t * 9) * .9 - .4 : .5 + Math.sin(b.anim * 2) * .12;
    c.rotate(swing);
    c.strokeStyle = '#3e3428'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(40, 0); c.stroke();
    c.fillStyle = '#b09a66'; c.fillRect(36, -13, 18, 26);
    c.strokeStyle = '#3e3428'; c.strokeRect(36, -13, 18, 26);
    c.restore();
    // gear platform beneath
    c.strokeStyle = '#6a5a3a'; c.lineWidth = 3;
    c.save(); c.translate(0, 52); c.rotate(b.anim * .8);
    for (let i = 0; i < 8; i++) {
      c.rotate(Math.PI / 4);
      c.beginPath(); c.moveTo(18, 0); c.lineTo(26, 0); c.stroke();
    }
    c.beginPath(); c.arc(0, 0, 18, 0, 7); c.stroke();
    c.restore();
    c.restore();
  },

  warden(c, b, n, time, world) {
    const calm = b.noise < .2;
    c.save();
    if (b.state === 'dying') c.globalAlpha = 1 - b.deathT / 1.8;
    // segments (behind head)
    if (b._sub.segs) {
      for (let i = b._sub.segs.length - 1; i >= 0; i--) {
        const s = b._sub.segs[i];
        const r = 20 - i * 2;
        c.fillStyle = calm ? '#1c2136' : '#2a3050';
        c.beginPath(); c.ellipse(s.x, s.y, r + 4, r - 4, 0, 0, 7); c.fill();
        // ear-fringes
        c.strokeStyle = calm ? '#39415e' : '#aab4d4';
        c.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const a = b.anim * 2 + i + k * 2.1;
          c.beginPath();
          c.moveTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r * .8);
          c.lineTo(s.x + Math.cos(a) * (r + 8), s.y + Math.sin(a) * (r + 2) * .8);
          c.stroke();
        }
      }
    }
    // head: pale ear-mass
    c.translate(b.x, b.y - 30);
    c.fillStyle = b.state === 'tele_burst' ? '#d8def0' : (calm ? '#3a4266' : '#4a5478');
    c.beginPath(); c.ellipse(0, 0, 30, 24, 0, 0, 7); c.fill();
    c.strokeStyle = '#12162a'; c.lineWidth = 2.4; c.stroke();
    // no eyes — a crown of ears
    c.strokeStyle = '#d8def0'; c.lineWidth = 2.2;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + (i / 6) * Math.PI;
      c.beginPath();
      c.moveTo(Math.cos(a) * 18, Math.sin(a) * 14);
      c.quadraticCurveTo(Math.cos(a) * 30, Math.sin(a) * 22, Math.cos(a) * 34, Math.sin(a) * 28);
      c.stroke();
    }
    // maw line
    c.beginPath(); c.moveTo(-14, 8); c.quadraticCurveTo(0, 14, 14, 8); c.stroke();
    c.restore();
  },

  librarian(c, b, n, time, world) {
    c.save();
    c.translate(b.x, b.y);
    if (b.state === 'dying') c.globalAlpha = 1 - b.deathT / 1.8;
    if (b.state === 'blink') c.globalAlpha = .3;
    // book stack body
    const books = ['#6a4a3a', '#3a5a52', '#8a6a4a', '#2e4454', '#5a4a62'];
    for (let i = 0; i < 5; i++) {
      c.fillStyle = books[i];
      c.strokeStyle = '#1c1410'; c.lineWidth = 2;
      const w = 110 - i * 8, h = 17;
      c.save();
      c.translate(Math.sin(i * 2 + b.anim) * 3, -10 - i * 19);
      c.rotate(Math.sin(b.anim + i) * .03);
      c.fillRect(-w / 2, -h, w, h); c.strokeRect(-w / 2, -h, w, h);
      // pages edge
      c.fillStyle = '#d8c79a';
      c.fillRect(-w / 2 + 4, -h + 3, w - 8, 4);
      c.restore();
    }
    // the restricted book (glowing core)
    const glow = .6 + Math.sin(time * 3) * .3;
    c.fillStyle = `rgba(122,224,208,${glow})`;
    c.save(); c.translate(0, -112); c.rotate(Math.sin(b.anim) * .06);
    c.fillRect(-16, -12, 32, 24);
    c.strokeStyle = '#7ae0d0'; c.strokeRect(-16, -12, 32, 24);
    c.restore();
    // ink tentacles at base
    c.strokeStyle = '#1e3240'; c.lineWidth = 7;
    for (let i = 0; i < 4; i++) {
      const a = b.anim * 1.2 + i * 1.7;
      c.beginPath();
      c.moveTo(-40 + i * 26, -6);
      c.quadraticCurveTo(-40 + i * 26 + Math.sin(a) * 20, 6, -40 + i * 26 + Math.sin(a) * 34, 0);
      c.stroke();
    }
    // spectacles ghost-face
    c.fillStyle = 'rgba(216,222,240,.85)';
    c.beginPath(); c.arc(-12, -92, 5, 0, 7); c.fill();
    c.beginPath(); c.arc(12, -92, 5, 0, 7); c.fill();
    c.strokeStyle = 'rgba(216,222,240,.85)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-7, -92); c.lineTo(7, -92); c.stroke();
    c.restore();
  },

  antiphon(c, b, n, time, world) {
    const W = world ? world.roomW() : 1000;
    const low = ['toll', 'low', 'vulnerable', 'final'].includes(b.state);
    c.save();
    if (b.state === 'dying') c.globalAlpha = 1 - b.deathT / 1.8;
    // the great chain / mount
    c.strokeStyle = '#5a5170'; c.lineWidth = 10;
    c.beginPath(); c.moveTo(b.x, 0); c.lineTo(b.x, b.y - b.h); c.stroke();
    // colossal bell
    const bw = b.w, bh = b.h;
    c.translate(b.x, b.y - bh);
    const tilt = low ? 0 : Math.sin(b.anim * .5) * .06;
    c.rotate(tilt);
    c.fillStyle = low ? '#d8cef0' : '#a89ac8';
    c.strokeStyle = '#4a4066'; c.lineWidth = 5;
    c.beginPath();
    c.moveTo(-30, -bh + 20);
    c.bezierCurveTo(-bw / 2, -bh + 60, -bw / 2 + 10, -60, -bw / 2 + 4, 0);
    c.lineTo(bw / 2 - 4, 0);
    c.bezierCurveTo(bw / 2 - 10, -60, bw / 2, -bh + 60, 30, -bh + 20);
    c.closePath(); c.fill(); c.stroke();
    // rim
    c.fillStyle = '#6a5f92';
    c.fillRect(-bw / 2 + 2, -4, bw - 4, 12);
    c.strokeRect(-bw / 2 + 2, -4, bw - 4, 12);
    // the crack (weak point glow)
    const crackGlow = low ? 1 : .35;
    c.strokeStyle = `rgba(255,242,255,${crackGlow * (.7 + Math.sin(time * 5) * .3)})`;
    c.lineWidth = 4;
    c.beginPath(); c.moveTo(-6, -bh + 40); c.lineTo(8, -bh + 90); c.lineTo(-4, -140); c.stroke();
    // face of hands: rows of small reaching hands embossed
    c.strokeStyle = `rgba(74,64,102,${.5 + crackGlow * .3})`; c.lineWidth = 2;
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 5; i++) {
        const hx = -bw / 3 + i * bw / 6 + Math.sin(time * 2 + row + i) * 2;
        const hy = -bh + 90 + row * 34;
        c.beginPath();
        c.moveTo(hx, hy + 12);
        c.lineTo(hx, hy);
        for (let f = 0; f < 3; f++) { c.moveTo(hx - 4 + f * 4, hy); c.lineTo(hx - 4 + f * 4, hy - 5); }
        c.stroke();
      }
    }
    // toll ring glow
    if (b.state === 'tele_toll' || b.state === 'toll') {
      c.strokeStyle = `rgba(232,216,255,${.5 + Math.sin(time * 20) * .4})`;
      c.lineWidth = 6;
      c.beginPath(); c.arc(0, -bh / 2, bw * .6, 0, 7); c.stroke();
    }
    c.restore();
  },
};
