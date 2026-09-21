// game/enemies.js — data-driven enemies. Each enemy: stats from data/enemies.js,
// behavior from the BEHAVIORS table, drawing from the DRAW table.
// Add a new enemy = add stats here + a behavior fn + a draw fn. Nothing else.
import { TILE, clamp, noise1, aabb } from '../core/utils.js';
import { ENEMIES } from '../data/enemies.js';

const GRAV = 2200;

export class Enemy {
  constructor(id, tx, ty, elite = false) {
    const def = ENEMIES[elite ? 'wardenEcho' : id];
    this.id = id; this.elite = elite || !!def.elite;
    this.def = def;
    this.w = def.w; this.h = def.h;
    this.x = tx * TILE + TILE / 2; this.y = ty * TILE + TILE;
    this.sx = this.x; this.sy = this.y;
    this.vx = 0; this.vy = 0;
    this.hp = def.hp; this.maxHp = def.hp;
    this.facing = -1;
    this.grounded = false;
    this.state = 'idle'; this.stateT = 0; this.cd = 1 + Math.random();
    this.flash = 0; this.touchCd = 0; this.stun = 0;
    this.awake = def.behavior !== 'sleeper';
    this.anim = Math.random() * 10;
    this.dead = false;
    if (def.behavior.includes('aquatic')) this._waterY = this.y;
    this.rect = () => ({ x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h });
  }

  update(dt, ctx) {
    const { world, player, fx, audio } = ctx;
    this.anim += dt; this.stateT += dt; this.cd -= dt;
    this.flash -= dt; this.touchCd -= dt;
    if (this.stun > 0) { this.stun -= dt; this._gravity(dt, world); this._integrate(dt, world); return; }
    const b = BEHAVIORS[this.def.behavior] || BEHAVIORS.walker;
    b(this, dt, ctx);
    this._gravity(dt, world);
    this._integrate(dt, world);
    // contact damage
    if (this.def.dmg > 0 && this.touchCd <= 0 && !player.invuln()) {
      const pr = player.rect(), er = this.rect();
      if (aabb(pr.x, pr.y, pr.w, pr.h, er.x, er.y, er.w, er.h)) {
        if (player.hurt(this.def.dmg, this.x, ctx)) this.touchCd = .6;
      }
    }
    // eye glow particles for dark zones
    if (this.def.zone === 'hush' && Math.random() < .02) {
      fx.spawn({ x: this.x, y: this.y - this.h * .7, vy: -10, life: 1, size: 1.5, color: '#aab4d4', glow: true, layer: 1 });
    }
  }

  _gravity(dt, world) {
    if (this.def.behavior.includes('aquatic') || this.def.behavior === 'flyer' || this.def.behavior === 'diver') return;
    this.vy += GRAV * dt;
    if (this.vy > 800) this.vy = 800;
  }

  _integrate(dt, world) {
    // x
    let nx = this.x + this.vx * dt;
    if (world.solidRect(nx - this.w / 2, this.y - this.h + 4, this.w, this.h - 8)) {
      if (this.def.behavior === 'charger' && Math.abs(this.vx) > 200) { this.state = 'stunned'; this.stateT = 0; }
      if (this.def.behavior !== 'charger') this.facing *= -1;
      this.vx = 0;
    } else this.x = nx;
    // y
    let ny = this.y + this.vy * dt;
    if (this.vy > 0 && world.solidRect(this.x - this.w / 2, ny - 4, this.w, 6)) {
      ny = Math.floor(ny / TILE) * TILE;
      if (this.def.behavior === 'hopper' && this.state === 'leap') { this.state = 'land'; this.stateT = 0; this.vx = 0; }
      this.vy = 0; this.grounded = true;
    } else {
      if (this.vy < 0 && world.solidRect(this.x - this.w / 2, ny - this.h, this.w, 6)) { this.vy = 0; ny = this.y; }
      this.grounded = false;
    }
    this.y = ny;
  }

  _edgeAhead(world, dir) {
    return world.solidRect(this.x + dir * (this.w / 2 + 6), this.y + 6, 4, 8);
  }

  hit(dmg, info, ctx) {
    const { world, player, fx, audio } = ctx;
    // armored frontal block
    const frontal = Math.sign(this.x - info.fromX) !== this.facing ? false : Math.sign(info.fromX - this.x) === -this.facing;
    const blocksFront = ['armored', 'sentinel'].includes(this.def.behavior) && this.stun <= 0 &&
      ((info.fromX < this.x && this.facing < 0) || (info.fromX > this.x && this.facing > 0));
    if (blocksFront && !info.charged && !info.down) {
      fx.burst(info.hx, info.hy, 5, { color: '#ffe9b8', speed: 120, life: .3, shape: 'spark' });
      audio.sfx('clang');
      fx.addShake(1.5);
      return { blocked: true, died: false };
    }
    this.hp -= dmg;
    this.flash = .13;
    if (blocksFront) this.stun = 1.5; // guard break
    if (this.def.behavior !== 'turret' && this.def.behavior !== 'beam turret' && this.def.behavior !== 'grazer') {
      this.vx = (info.fromX < this.x ? 1 : -1) * 150;
    }
    if (this.def.behavior === 'sleeper') this.awake = true;
    fx.burst(info.hx, info.hy, 8, { color: ['#ffd9a0', '#ffefc0', this.def.palette], speed: 180, life: .35, shape: 'spark' });
    fx.floater(info.hx, info.hy - 8, Math.round(dmg), '#ffefc0', 12);
    audio.sfx('hit');
    if (this.hp <= 0) {
      this.dead = true;
      world.onEnemyKilled(this, ctx);
      return { died: true };
    }
    return { died: false };
  }
}

// ---------------------------------------------------------------- behaviors
const distToPlayer = (e, ctx) => Math.hypot(ctx.player.x - e.x, (ctx.player.y - 20) - (e.y - e.h / 2));

const BEHAVIORS = {
  walker(e, dt, ctx) {
    const p = ctx.player;
    const d = distToPlayer(e, ctx);
    const speed = d < e.def.aggro ? e.def.speed * 1.8 : e.def.speed;
    if (!e.grounded && e.def.behavior === 'walker') { }
    if (e.grounded) {
      if (!e._edgeAhead(ctx.world, e.facing)) e.facing *= -1;
      e.vx = e.facing * speed;
      if (d < e.def.aggro) e.facing = p.x < e.x ? -1 : 1;
    }
  },

  flyer(e, dt, ctx) {
    const p = ctx.player;
    const d = distToPlayer(e, ctx);
    if (d < e.def.aggro) {
      const dx = p.x - e.x, dy = (p.y - 24) - (e.y - e.h / 2);
      const dd = Math.hypot(dx, dy) || 1;
      e.vx += (dx / dd) * 220 * dt; e.vy += (dy / dd) * 220 * dt;
    } else {
      e.vx += Math.sin(e.anim * .7) * 40 * dt;
      e.vy += Math.cos(e.anim * .9) * 40 * dt;
    }
    const sp = Math.hypot(e.vx, e.vy), max = e.def.speed;
    if (sp > max) { e.vx *= max / sp; e.vy *= max / sp; }
    e.facing = e.vx < 0 ? -1 : 1;
  },

  turret(e, dt, ctx) {
    const p = ctx.player;
    e.vx = 0;
    const d = Math.abs(p.x - e.x);
    if (e.state === 'tele' && e.stateT > .5) {
      e.state = 'idle'; e.stateT = 0; e.cd = 2.4;
      const dx = p.x - e.x, dy = (p.y - 20) - (e.y - e.h / 2);
      const t = .8;
      const vx = dx / t, vy = dy / t - .5 * 1400 * t;
      ctx.world.spawnProj({ x: e.x, y: e.y - e.h * .7, vx, vy, g: 1400, r: 7, dmg: 1, life: 3, kind: 'spore', color: e.def.palette, glow: true });
      ctx.audio.sfx('sonde', { vol: .5 });
    } else if (d < e.def.range && e.cd <= 0) {
      e.state = 'tele'; e.stateT = 0;
    }
  },

  'beam turret'(e, dt, ctx) {
    const p = ctx.player;
    e.vx = 0;
    const d = Math.abs(p.x - e.x);
    if (e.state === 'tele') {
      if (e.stateT > .65) {
        e.state = 'fire'; e.stateT = 0;
        const dir = p.x < e.x ? -1 : 1; e.facing = dir;
        ctx.world.spawnBeam({ owner: e, x: e.x + dir * 14, y: e.y - e.h * .6, dir, len: e.def.range, dmg: 1, t: .3, color: '#ffd090' });
        ctx.audio.sfx('sonde');
      }
    } else if (e.state === 'fire') {
      if (e.stateT > .3) { e.state = 'idle'; e.stateT = 0; e.cd = 2.6; }
    } else if (d < e.def.range && Math.abs(p.y - (e.y - 20)) < 120 && e.cd <= 0) {
      e.state = 'tele'; e.stateT = 0; e.facing = p.x < e.x ? -1 : 1;
      ctx.audio.sfx('warn', { vol: .6 });
    }
  },

  charger(e, dt, ctx) {
    const p = ctx.player;
    const d = Math.abs(p.x - e.x);
    if (e.state === 'stunned') { if (e.stateT > .9) { e.state = 'idle'; e.stateT = 0; } e.vx = 0; return; }
    if (e.state === 'tele') {
      e.vx = 0;
      e.facing = p.x < e.x ? -1 : 1;
      if (e.stateT > .45) { e.state = 'charge'; e.stateT = 0; ctx.audio.sfx('dash'); }
    } else if (e.state === 'charge') {
      e.vx = e.facing * e.def.charge;
      if (e.stateT > 1.4) { e.state = 'idle'; e.stateT = 0; }
    } else {
      if (e.grounded) {
        if (!e._edgeAhead(ctx.world, e.facing)) e.facing *= -1;
        e.vx = e.facing * e.def.speed;
      }
      if (d < e.def.aggro && e.cd <= 0 && e.grounded) { e.state = 'tele'; e.stateT = 0; e.cd = 2.2; }
    }
  },

  grazer(e, dt, ctx) {
    const p = ctx.player;
    const d = distToPlayer(e, ctx);
    // also fear nearby chargers
    let fear = d < 220;
    for (const o of ctx.world.enemies) {
      if (o !== e && !o.dead && o.def.behavior === 'charger' && Math.hypot(o.x - e.x, o.y - e.y) < 150) fear = true;
    }
    if (fear) {
      e.facing = p.x < e.x ? 1 : -1;
      e.vx = e.facing * e.def.speed * 1.4;
      if (e.grounded && Math.random() < .05) e.vy = -320;
    } else {
      if (Math.random() < .008) e.facing *= -1;
      if (e.grounded) {
        if (!e._edgeAhead(ctx.world, e.facing)) e.facing *= -1;
        e.vx = e.facing * 24;
      }
    }
  },

  hopper(e, dt, ctx) {
    const p = ctx.player;
    if (e.state === 'squat') {
      e.vx = 0;
      if (e.stateT > .4) {
        e.state = 'leap'; e.stateT = 0;
        const dx = p.x - e.x;
        e.vx = clamp(dx, -240, 240);
        e.vy = -540;
        ctx.audio.sfx('jump', { vol: .6 });
      }
    } else if (e.state === 'land') {
      if (e.stateT > .05 && !e._shockDone) {
        e._shockDone = true;
        ctx.world.spawnShock(e.x, e.y, 1);
        ctx.fx.addShake(2);
      }
      if (e.stateT > .5) { e.state = 'idle'; e.stateT = 0; e.cd = 1.4 + Math.random() * .8; e._shockDone = false; }
    } else {
      e.vx *= .8;
      if (e.cd <= 0 && e.grounded && Math.abs(p.x - e.x) < e.def.aggro) { e.state = 'squat'; e.stateT = 0; }
    }
  },

  armored(e, dt, ctx) {
    const p = ctx.player;
    const d = Math.abs(p.x - e.x);
    e.facing = p.x < e.x ? -1 : 1;
    if (e.state === 'lunge') {
      if (e.stateT > .5) { e.state = 'idle'; e.stateT = 0; e.cd = 2.8; }
    } else {
      if (e.grounded) {
        if (!e._edgeAhead(ctx.world, e.facing)) e.vx = 0;
        else e.vx = e.facing * e.def.speed;
      }
      if (d < 120 && e.cd <= 0 && e.grounded) {
        e.state = 'lunge'; e.stateT = 0;
        e.vx = e.facing * 300; e.vy = -200;
      }
    }
  },

  sleeper(e, dt, ctx) {
    const p = ctx.player;
    const d = distToPlayer(e, ctx);
    if (!e.awake) {
      e.vx = 0;
      // wakes to motion: player moving fast or dashing nearby
      if (d < e.def.aggro && Math.hypot(p.vx, p.vy) > 240) { e.awake = true; ctx.audio.sfx('warn', { vol: .5 }); }
      return;
    }
    const dx = p.x - e.x;
    e.facing = dx < 0 ? -1 : 1;
    if (e.grounded) {
      if (!e._edgeAhead(ctx.world, e.facing)) { e.vx = 0; if (d < 100) e.vy = -420; }
      else e.vx = e.facing * e.def.speed;
      if (d < 90 && e.cd <= 0) { e.vy = -380; e.cd = 1.2; }
    }
    if (d > 420) e.awake = false;
  },

  diver(e, dt, ctx) {
    const p = ctx.player;
    e.sx = e.sx === undefined ? e.x : e.sx;
    if (e.state === 'dive') {
      if (e.y > e._diveTo) { e.state = 'return'; e.stateT = 0; }
    } else if (e.state === 'return') {
      const dy = e.sy - 60 - e.y;
      e.vy = clamp(dy * 3, -160, 160);
      e.vx = clamp((e.sx - e.x) * 3, -120, 120);
      if (Math.abs(e.y - (e.sy - 60)) < 12) { e.state = 'idle'; e.stateT = 0; }
    } else {
      e.vx = Math.sin(e.anim * 2) * 20;
      e.vy = Math.cos(e.anim * 1.6) * 16;
      if (e.state === 'tele' && e.stateT > .35) {
        e.state = 'dive'; e.stateT = 0;
        e._diveTo = p.y + 60;
        e.vx = clamp((p.x - e.x) * 2, -180, 180);
        e.vy = 480;
        ctx.audio.sfx('warn', { vol: .4 });
      } else if (e.state !== 'tele' && Math.abs(p.x - e.x) < 220 && p.y > e.y && e.cd <= 0) {
        e.state = 'tele'; e.stateT = 0; e.cd = 2.4;
      }
    }
    e.facing = e.vx < 0 ? -1 : 1;
  },

  'aquatic jumper'(e, dt, ctx) {
    const p = ctx.player;
    if (e.state === 'leap') {
      if (e.vy > 0 && e.y >= e._waterY) { e.state = 'idle'; e.stateT = 0; e.cd = 1.2 + Math.random() * .8; e.y = e._waterY; e.vy = 0; }
    } else {
      e.y = e._waterY; e.vy = 0;
      if (e.cd <= 0 && Math.abs(p.x - e.x) < 280) {
        e.state = 'leap'; e.stateT = 0;
        const t = .9;
        e.vx = clamp((p.x - e.x) / t, -260, 260);
        e.vy = -520;
        ctx.audio.sfx('swing', { vol: .4 });
      }
    }
    e.facing = e.vx < 0 ? -1 : 1;
  },

  'aquatic ambusher'(e, dt, ctx) {
    const p = ctx.player;
    // targets: player if near water; else eats drownedquills (ecology)
    let target = null;
    if (Math.abs(p.x - e.x) < e.def.aggro && Math.abs((p.y - 20) - e.y) < 120) target = p;
    else {
      for (const o of ctx.world.enemies) {
        if (!o.dead && o.def.behavior === 'aquatic jumper' && Math.hypot(o.x - e.x, o.y - e.y) < 140) { target = o; break; }
      }
    }
    if (e.state === 'lunge') {
      if (e.stateT > .8) { e.state = 'idle'; e.stateT = 0; e.cd = 1.8; }
      // eat quills
      for (const o of ctx.world.enemies) {
        if (!o.dead && o.def.behavior === 'aquatic jumper' && Math.abs(o.x - e.x) < 30 && Math.abs(o.y - e.y) < 40) {
          o.dead = true; o.eaten = true;
          ctx.fx.burst(o.x, o.y, 10, { color: '#5ab0a8', speed: 120, life: .5 });
          e.hp = Math.min(e.maxHp, e.hp + 12);
        }
      }
    } else if (e.state === 'tele') {
      if (e.stateT > .4) { e.state = 'lunge'; e.stateT = 0; e.vx = e.facing * e.def.speed; ctx.audio.sfx('dash'); }
    } else if (target) {
      e.facing = target.x < e.x ? -1 : 1;
      if (e.cd <= 0) { e.state = 'tele'; e.stateT = 0; }
      e.vx *= .9;
    } else { e.vx *= .95; }
  },

  mirror(e, dt, ctx) {
    const p = ctx.player;
    const d = Math.abs(p.x - e.x);
    e.facing = p.x < e.x ? -1 : 1;
    if (e.state === 'dashstep') {
      if (e.stateT > .25) { e.state = 'idle'; e.stateT = 0; }
    } else if (e.state === 'slash') {
      e.vx = 0;
      if (e.stateT > .3 && !e._slashed) {
        e._slashed = true;
        const hb = { x: e.x + e.facing * 10, y: e.y - 60, w: 70, h: 60 };
        ctx.world.enemyMelee(e, hb, 1);
        ctx.audio.sfx('swing');
      }
      if (e.stateT > .6) { e.state = 'idle'; e.stateT = 0; e.cd = 1.6; e._slashed = false; }
    } else {
      if (d > 60) e.vx = e.facing * e.def.speed; else e.vx = 0;
      // mimic: player dashes -> it dashes; keeps pressure
      if (d < 340 && p.state === 'dash' && e.cd <= 0) {
        e.state = 'dashstep'; e.stateT = 0;
        e.vx = e.facing * 420;
      }
      if (d < 95 && e.cd <= 0) { e.state = 'slash'; e.stateT = 0; }
    }
  },

  sentinel(e, dt, ctx) {
    const p = ctx.player;
    const d = Math.abs(p.x - e.x);
    e.facing = p.x < e.x ? -1 : 1;
    if (e.state === 'burst') {
      e.vx = 0;
      if (e._shots < 3 && e.stateT > .22 * (e._shots + 1)) {
        e._shots++;
        const dx = p.x - e.x, dy = (p.y - 24) - (e.y - e.h * .6);
        const dd = Math.hypot(dx, dy) || 1;
        ctx.world.spawnProj({ x: e.x + e.facing * 12, y: e.y - e.h * .6, vx: dx / dd * 300, vy: dy / dd * 300, g: 0, r: 6, dmg: 1, life: 2.4, kind: 'wax', color: '#e8dcb8', glow: true });
        ctx.audio.sfx('sonde', { vol: .6 });
      }
      if (e.stateT > 1) { e.state = 'idle'; e.stateT = 0; e.cd = 2.6; }
    } else {
      if (e.grounded) {
        if (!e._edgeAhead(ctx.world, e.facing)) e.vx = 0;
        else e.vx = e.facing * e.def.speed;
      }
      if (d < e.def.range && e.cd <= 0) { e.state = 'burst'; e.stateT = 0; e._shots = 0; }
    }
  },

  elite(e, dt, ctx) {
    const p = ctx.player;
    const d = Math.abs(p.x - e.x);
    e.facing = p.x < e.x ? -1 : 1;
    if (e.state === 'tele') {
      e.vx = 0;
      if (e.stateT > .55) {
        if (e._next === 'slam') {
          ctx.world.enemyMelee(e, { x: e.x + e.facing * 8, y: e.y - 90, w: 90, h: 90 }, 1);
          ctx.world.spawnShock(e.x + e.facing * 40, e.y, 1, e.facing);
          ctx.fx.addShake(4); ctx.audio.sfx('clang', { vol: .8 });
        } else {
          e.vx = e.facing * 460; e.state = 'lunge2'; e.stateT = 0;
          ctx.audio.sfx('dash');
          return;
        }
        e.state = 'idle'; e.stateT = 0; e.cd = 1.6 + Math.random();
      }
    } else if (e.state === 'lunge2') {
      if (e.stateT > .35) { e.state = 'idle'; e.stateT = 0; e.cd = 1.8; }
    } else {
      if (e.grounded) {
        if (!e._edgeAhead(ctx.world, e.facing)) e.vx = 0;
        else e.vx = e.facing * e.def.speed;
      }
      if (e.cd <= 0 && d < 320) {
        e.state = 'tele'; e.stateT = 0;
        e._next = d > 200 ? 'lunge' : 'slam';
      }
    }
  },
};

// ---------------------------------------------------------------- drawing
export function drawEnemy(c, e, time) {
  const boil = Math.floor(time * 8);
  const n = s => noise1(s + boil * 3.7, 91) * 1.4;
  c.save();
  c.translate(e.x, e.y);
  if (e.flash > 0) { c.globalAlpha = 1; }
  const flash = e.flash > 0;
  const P = e.def.palette;
  c.scale(e.facing < 0 ? -1 : 1, 1);
  const D = DRAW[e.id] || DRAW.cinderling;
  D(c, e, n, flash, time);
  c.restore();
  // telegraph indicator (readability): draw warn tint
  if ((e.state === 'tele' || e.state === 'squat') && Math.floor(time * 10) % 2 === 0) {
    c.save();
    c.globalAlpha = .5;
    c.strokeStyle = '#ffdf9a'; c.lineWidth = 2;
    c.strokeRect(e.x - e.w / 2 - 3, e.y - e.h - 3, e.w + 6, e.h + 6);
    c.restore();
  }
}

const DRAW = {
  cinderling(c, e, n, flash, time) {
    // ember-moth larva: segmented glowing caterpillar
    c.fillStyle = flash ? '#fff' : '#3a2a24';
    for (let i = 0; i < 4; i++) {
      const x = -i * 9 - 8, y = -10 + Math.sin(e.anim * 6 - i) * 2 + n(i);
      c.beginPath(); c.ellipse(x, y, 8 - i, 7 - i * .8, 0, 0, 7); c.fill();
    }
    // ember vents
    c.fillStyle = flash ? '#fff' : (Math.floor(time * 6) % 2 ? '#ff9a4a' : '#ffb86a');
    for (let i = 0; i < 3; i++) {
      c.beginPath(); c.arc(-i * 10 - 12, -14 + Math.sin(e.anim * 6 - i) * 2, 2.2, 0, 7); c.fill();
    }
    // eye
    c.fillStyle = '#ffe9b8';
    c.beginPath(); c.arc(3, -14 + n(9), 2, 0, 7); c.fill();
    // mandibles
    c.strokeStyle = '#20180f'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(6, -10); c.lineTo(11, -8 + n(10)); c.stroke();
  },
  palewisplet(c, e, n, flash, time) {
    // ghostly speech-bubble wisp with a mouth
    const fy = Math.sin(e.anim * 3) * 3;
    c.fillStyle = flash ? '#fff' : 'rgba(210,220,240,.8)';
    c.beginPath();
    c.moveTo(0, -20 + fy);
    c.quadraticCurveTo(12 + n(1), -14 + fy, 9, -2 + fy);
    c.quadraticCurveTo(4, 4 + fy, 0, 1 + fy);
    c.quadraticCurveTo(-4, 4 + fy, -9, -2 + fy);
    c.quadraticCurveTo(-12 + n(2), -14 + fy, 0, -20 + fy);
    c.fill();
    // hollow mouth (it almost speaks)
    c.fillStyle = '#0c0e18';
    c.beginPath(); c.ellipse(2, -8 + fy, 2.6, 4 + Math.sin(e.anim * 5) * 1.5, 0, 0, 7); c.fill();
    c.fillStyle = '#dfe8ff';
    c.beginPath(); c.arc(-4, -12 + fy, 1.6, 0, 7); c.fill();
  },
  sporebell(c, e, n, flash, time) {
    const puff = e.state === 'tele' ? 1 + Math.sin(e.stateT * 30) * .15 : 1;
    c.scale(puff, 2 - puff);
    // bell-shaped puffball on a stalk
    c.strokeStyle = '#4a6a3a'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-3, -8, 0, -14); c.stroke();
    c.fillStyle = flash ? '#fff' : '#7fae5e';
    c.beginPath(); c.moveTo(-13, -14); c.quadraticCurveTo(-15, -32 + n(1), 0, -34);
    c.quadraticCurveTo(15, -32 + n(2), 13, -14); c.closePath(); c.fill();
    c.strokeStyle = '#46602f'; c.lineWidth = 2; c.stroke();
    // spots
    c.fillStyle = '#d2f7a8';
    c.beginPath(); c.arc(-5, -24, 2.4, 0, 7); c.fill();
    c.beginPath(); c.arc(5, -20, 2, 0, 7); c.fill();
    c.beginPath(); c.arc(0, -28, 1.8, 0, 7); c.fill();
    if (e.state === 'tele') { c.fillStyle = '#eaffcf'; c.beginPath(); c.arc(0, -22, 4 + Math.sin(time * 24) * 2, 0, 7); c.fill(); }
  },
  thornrunner(c, e, n, flash, time) {
    // boar-ish root beast with thorn crest
    c.fillStyle = flash ? '#fff' : '#4e6e35';
    c.beginPath();
    c.moveTo(-18, -2); c.quadraticCurveTo(-22, -18, -8, -22 + n(1));
    c.quadraticCurveTo(6, -26, 16, -16);
    c.quadraticCurveTo(24, -10, 18, -2); c.closePath(); c.fill();
    // thorns
    c.strokeStyle = '#2c3d1e'; c.lineWidth = 2.4;
    for (let i = 0; i < 4; i++) {
      c.beginPath(); c.moveTo(-10 + i * 7, -20 - i * .5); c.lineTo(-8 + i * 7, -30 - i); c.stroke();
    }
    // tusk + eye
    c.strokeStyle = '#e8e0c8'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(14, -8); c.lineTo(21, -5 + n(2)); c.stroke();
    c.fillStyle = '#ffdf6a';
    c.beginPath(); c.arc(10, -15, 2.2, 0, 7); c.fill();
    // legs
    c.strokeStyle = '#2c3d1e'; c.lineWidth = 3;
    const sw = e.state === 'charge' ? Math.sin(e.anim * 30) * 5 : Math.sin(e.anim * 6) * 2;
    c.beginPath(); c.moveTo(-10, -4); c.lineTo(-10 + sw, 0); c.stroke();
    c.beginPath(); c.moveTo(8, -4); c.lineTo(8 - sw, 0); c.stroke();
  },
  grazer(c, e, n, flash, time) {
    // gentle moss-deer
    c.fillStyle = flash ? '#fff' : '#9cc48c';
    c.beginPath();
    c.ellipse(-2, -12, 14, 9, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(12, -16, 6, 5, 0, 0, 7); c.fill();
    // legs
    c.strokeStyle = '#5e7e52'; c.lineWidth = 2.4;
    const sw = Math.sin(e.anim * 7) * 3;
    for (const lx of [-8, -3, 4, 9]) { c.beginPath(); c.moveTo(lx, -6); c.lineTo(lx + sw * (lx > 0 ? .6 : 1), 0); c.stroke(); }
    // antler-frond
    c.strokeStyle = '#7fae5e'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(12, -20); c.quadraticCurveTo(16, -28 + n(1), 22, -28); c.stroke();
    c.beginPath(); c.moveTo(14, -23); c.lineTo(19, -26); c.stroke();
    // eye
    c.fillStyle = '#1c2418';
    c.beginPath(); c.arc(14, -17, 1.4, 0, 7); c.fill();
  },
  stoker(c, e, n, flash, time) {
    // squat boiler-frame on legs
    const squat = e.state === 'squat' ? 1.25 : 1;
    c.scale(1 / squat, squat);
    c.fillStyle = flash ? '#fff' : '#5a4030';
    c.fillRect(-14, -30, 28, 26);
    c.strokeStyle = '#2c1e14'; c.lineWidth = 2.4; c.strokeRect(-14, -30, 28, 26);
    // rivets + furnace mouth
    c.fillStyle = '#2c1e14';
    for (const rx of [-10, -4, 2, 8]) { c.beginPath(); c.arc(rx, -26, 1.6, 0, 7); c.fill(); }
    c.fillStyle = e.state === 'squat' ? '#ffb86a' : '#7a3a20';
    c.fillRect(-8, -18, 16, 8);
    if (e.state === 'squat') { c.fillStyle = '#ffe9b8'; c.fillRect(-8, -18, 16, 3); }
    // chimney
    c.fillStyle = '#3a2a1e'; c.fillRect(-3, -38, 6, 8);
    // legs
    c.strokeStyle = '#2c1e14'; c.lineWidth = 3.4;
    const sw = Math.sin(e.anim * 8) * 2;
    c.beginPath(); c.moveTo(-8, -4); c.lineTo(-8 + sw, 0); c.stroke();
    c.beginPath(); c.moveTo(8, -4); c.lineTo(8 - sw, 0); c.stroke();
  },
  bellmaw(c, e, n, flash, time) {
    // cracked walking bell with a maw
    c.fillStyle = flash ? '#fff' : '#8a8a96';
    c.beginPath();
    c.moveTo(0, -40);
    c.bezierCurveTo(-22, -38, -24, -12, -20, -4);
    c.lineTo(20, -4);
    c.bezierCurveTo(24, -12, 22, -38, 0, -40);
    c.closePath(); c.fill();
    c.strokeStyle = '#4a4a56'; c.lineWidth = 2.4; c.stroke();
    // crack
    c.strokeStyle = '#3a3a46'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-4, -38); c.lineTo(2, -28); c.lineTo(-3, -18); c.stroke();
    // maw (the blocking face)
    c.fillStyle = '#1a1a24';
    c.beginPath(); c.ellipse(0, -12, 11, 5.4, 0, 0, 7); c.fill();
    c.fillStyle = '#c9c9d4';
    for (let i = -2; i <= 2; i++) { c.fillRect(i * 4 - 1.4, -15, 2.8, 2.4); c.fillRect(i * 4 - 1.4, -11, 2.8, 2.4); }
    // eyes in the shadow
    c.fillStyle = '#ffdf6a';
    c.beginPath(); c.arc(-5, -26, 1.8, 0, 7); c.fill();
    c.beginPath(); c.arc(5, -26, 1.8, 0, 7); c.fill();
    // legs
    c.strokeStyle = '#4a4a56'; c.lineWidth = 4;
    const sw = Math.sin(e.anim * 4) * 2;
    c.beginPath(); c.moveTo(-10, -4); c.lineTo(-10 + sw, 0); c.stroke();
    c.beginPath(); c.moveTo(10, -4); c.lineTo(10 - sw, 0); c.stroke();
  },
  huskcantor(c, e, n, flash, time) {
    // floating choir robe, nobody inside
    const fy = Math.sin(e.anim * 1.8) * 3;
    c.translate(0, fy);
    c.fillStyle = flash ? '#fff' : '#8f8873';
    c.beginPath();
    c.moveTo(0, -38);
    c.quadraticCurveTo(-16, -34, -13, -6);
    c.quadraticCurveTo(-8, 2, -6, 6 + n(1));
    c.lineTo(6, 6 + n(2));
    c.quadraticCurveTo(8, 2, 13, -6);
    c.quadraticCurveTo(16, -34, 0, -38);
    c.closePath(); c.fill();
    c.strokeStyle = '#565040'; c.lineWidth = 2; c.stroke();
    // hood hole — dark
    c.fillStyle = '#0e0c08';
    c.beginPath(); c.ellipse(0, -26, 7, 8, 0, 0, 7); c.fill();
    // humming mouth-light
    const glow = e.state === 'tele' || e.state === 'fire';
    c.fillStyle = glow ? '#ffd090' : '#4a4436';
    c.beginPath(); c.ellipse(0, -22, glow ? 3.4 : 2.2, glow ? 3.4 : 2.2, 0, 0, 7); c.fill();
    if (glow) { c.strokeStyle = 'rgba(255,208,144,.5)'; c.beginPath(); c.arc(0, -22, 9 + Math.sin(time * 20) * 2, 0, 7); c.stroke(); }
  },
  shadelet(c, e, n, flash, time) {
    // a lump of dark; when awake, two pale eyes and long arms
    if (!e.awake) {
      c.fillStyle = flash ? '#fff' : '#181e30';
      c.beginPath(); c.ellipse(0, -12, 13, 11, 0, 0, 7); c.fill();
      c.strokeStyle = '#0c0f1c'; c.lineWidth = 2; c.stroke();
      // closed eyes: two small lines
      c.strokeStyle = '#39415e'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-5, -12); c.lineTo(-2, -12); c.stroke();
      c.beginPath(); c.moveTo(2, -12); c.lineTo(5, -12); c.stroke();
      return;
    }
    c.fillStyle = flash ? '#fff' : '#20263e';
    c.beginPath();
    c.moveTo(-12, 0); c.quadraticCurveTo(-15, -26 + n(1), 0, -32);
    c.quadraticCurveTo(15, -26 + n(2), 12, 0); c.closePath(); c.fill();
    c.strokeStyle = '#0e1222'; c.lineWidth = 2; c.stroke();
    // wide pale eyes
    c.fillStyle = '#dfe8ff';
    c.beginPath(); c.ellipse(-5, -22, 2.6, 3.4, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(5, -22, 2.6, 3.4, 0, 0, 7); c.fill();
    // arms
    c.strokeStyle = '#20263e'; c.lineWidth = 4;
    const reach = e.state !== 'idle' ? Math.sin(e.anim * 10) * 4 : 0;
    c.beginPath(); c.moveTo(-10, -16); c.lineTo(-15 - reach, -4); c.stroke();
    c.beginPath(); c.moveTo(10, -16); c.lineTo(15 + reach, -4); c.stroke();
  },
  gloomwing(c, e, n, flash, time) {
    const flap = Math.sin(e.anim * 10);
    c.fillStyle = flash ? '#fff' : '#2e3654';
    // wings
    c.beginPath(); c.ellipse(-10, -14, 11, 4 + flap * 3, -.5, 0, 7); c.fill();
    c.beginPath(); c.ellipse(10, -14, 11, 4 + flap * 3, .5, 0, 7); c.fill();
    // body
    c.beginPath(); c.ellipse(0, -14, 6, 9, 0, 0, 7); c.fill();
    c.strokeStyle = '#161c30'; c.lineWidth = 1.6; c.stroke();
    c.fillStyle = '#aab4d4';
    c.beginPath(); c.arc(-2, -18, 1.4, 0, 7); c.fill();
    c.beginPath(); c.arc(2, -18, 1.4, 0, 7); c.fill();
  },
  drownedquill(c, e, n, flash, time) {
    // ink-fish with a quill crest
    const wig = Math.sin(e.anim * 8) * 3;
    c.fillStyle = flash ? '#fff' : '#3f8a82';
    c.beginPath();
    c.moveTo(14, -12); c.quadraticCurveTo(0, -22 + wig, -12, -12);
    c.quadraticCurveTo(-18, -12, -20, -16);
    c.lineTo(-18, -8); c.quadraticCurveTo(-16, -8, -12, -8);
    c.quadraticCurveTo(0, -2 + wig, 14, -12);
    c.closePath(); c.fill();
    // quill crest
    c.strokeStyle = '#d8c79a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -20); c.lineTo(3, -28 + n(1)); c.stroke();
    c.beginPath(); c.moveTo(-4, -19); c.lineTo(-4, -26); c.stroke();
    c.fillStyle = '#eafffa';
    c.beginPath(); c.arc(9, -13, 1.6, 0, 7); c.fill();
  },
  inkfang(c, e, n, flash, time) {
    // long shadow-eel with bright teeth
    const wig = Math.sin(e.anim * 6) * 4;
    c.fillStyle = flash ? '#fff' : '#1e3240';
    c.beginPath();
    c.moveTo(22, -14);
    c.quadraticCurveTo(0, -26 + wig, -24, -16);
    c.quadraticCurveTo(-40, -12 + wig * .5, -30, -8);
    c.quadraticCurveTo(-10, -2, 14, -6);
    c.quadraticCurveTo(24, -8, 22, -14);
    c.closePath(); c.fill();
    // teeth
    c.fillStyle = '#eafff6';
    for (let i = 0; i < 4; i++) {
      c.beginPath(); c.moveTo(20 - i * 5, -9); c.lineTo(18 - i * 5, -3); c.lineTo(16 - i * 5, -9); c.fill();
    }
    // eyes
    c.fillStyle = '#7ae0d0';
    c.beginPath(); c.arc(14, -18, 2.2, 0, 7); c.fill();
    if (e.state === 'tele') {
      c.strokeStyle = 'rgba(122,224,208,.6)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(14, -14, 10 + Math.sin(time * 18) * 3, 0, 7); c.stroke();
    }
  },
  echoshade(c, e, n, flash, time) {
    // a flickering mirror of a courier
    c.globalAlpha = .75 + Math.sin(e.anim * 7) * .2;
    c.fillStyle = flash ? '#fff' : '#4a3e70';
    c.beginPath();
    c.moveTo(-8, -2); c.quadraticCurveTo(-12, -30, -8, -36);
    c.lineTo(8, -36); c.quadraticCurveTo(12, -30, 8, -2);
    c.closePath(); c.fill();
    // bell-head, but wrong (cracked)
    c.fillStyle = flash ? '#fff' : '#6a5a96';
    c.beginPath(); c.moveTo(-9, -38); c.quadraticCurveTo(-11, -52, 0, -54);
    c.quadraticCurveTo(11, -52, 9, -38); c.closePath(); c.fill();
    c.strokeStyle = '#2c2444'; c.lineWidth = 1.6; c.stroke();
    // crack lines
    c.beginPath(); c.moveTo(-2, -54); c.lineTo(2, -46); c.stroke();
    c.fillStyle = '#c9baff';
    c.beginPath(); c.arc(-3.4, -45, 1.6, 0, 7); c.fill();
    c.beginPath(); c.arc(3.4, -45, 1.6, 0, 7); c.fill();
    c.globalAlpha = 1;
  },
  waxsentinel(c, e, n, flash, time) {
    // candle-wax armored guard
    c.fillStyle = flash ? '#fff' : '#b8aecb';
    c.fillRect(-13, -38, 26, 36);
    c.strokeStyle = '#5a5170'; c.lineWidth = 2.4; c.strokeRect(-13, -38, 26, 36);
    // dripping wax
    c.fillStyle = '#d8cfe8';
    for (const dx of [-10, -2, 6]) {
      const dl = 2 + Math.abs(noise1(dx, 5)) * 4;
      c.fillRect(dx, -4, 4, dl + n(dx));
    }
    // helmet with candle
    c.fillStyle = '#8f86a8';
    c.beginPath(); c.arc(0, -38, 9, Math.PI, 0); c.fill();
    c.fillStyle = '#ffe9b8';
    c.fillRect(-1.6, -52, 3.2, 7);
    c.beginPath(); c.ellipse(0, -54, 2.2, 3 + Math.sin(time * 9) * .8, 0, 0, 7); c.fill();
    // visor eyes
    c.fillStyle = '#2c2440';
    c.fillRect(-6, -34, 4, 3); c.fillRect(2, -34, 4, 3);
    // legs
    c.strokeStyle = '#5a5170'; c.lineWidth = 3.4;
    const sw = Math.sin(e.anim * 5) * 2;
    c.beginPath(); c.moveTo(-6, -3); c.lineTo(-6 + sw, 0); c.stroke();
    c.beginPath(); c.moveTo(6, -3); c.lineTo(6 - sw, 0); c.stroke();
  },
  wardenEcho(c, e, n, flash, time) {
    // echo of the Tollmaster: bell-helm warden, dimmer
    c.fillStyle = flash ? '#fff' : '#8a7450';
    c.fillRect(-16, -44, 32, 40);
    c.strokeStyle = '#4e4028'; c.lineWidth = 2.6; c.strokeRect(-16, -44, 32, 40);
    // bell helm
    c.fillStyle = flash ? '#fff' : '#b09a66';
    c.beginPath(); c.moveTo(-12, -44); c.quadraticCurveTo(-14, -62, 0, -64);
    c.quadraticCurveTo(14, -62, 12, -44); c.closePath(); c.fill();
    c.strokeStyle = '#4e4028'; c.stroke();
    c.fillStyle = '#241c10';
    c.beginPath(); c.ellipse(0, -48, 8, 3.4, 0, 0, 7); c.fill();
    c.fillStyle = '#ffdf9a';
    c.beginPath(); c.arc(-3.4, -48, 1.6, 0, 7); c.fill();
    c.beginPath(); c.arc(3.4, -48, 1.6, 0, 7); c.fill();
    // maul
    c.save();
    c.translate(14, -36); c.rotate(e.state === 'tele' ? -2 + Math.sin(e.stateT * 20) * .1 : .5 + Math.sin(e.anim * 3) * .1);
    c.strokeStyle = '#4e4028'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(22, 0); c.stroke();
    c.fillStyle = '#6a5a3a'; c.fillRect(20, -9, 12, 18);
    c.restore();
    // legs
    c.strokeStyle = '#4e4028'; c.lineWidth = 4;
    const sw = Math.sin(e.anim * 5) * 3;
    c.beginPath(); c.moveTo(-8, -4); c.lineTo(-8 + sw, 0); c.stroke();
    c.beginPath(); c.moveTo(8, -4); c.lineTo(8 - sw, 0); c.stroke();
  },
};
