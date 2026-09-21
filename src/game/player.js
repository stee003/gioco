// game/player.js — the Knell: a bell-headed courier-automaton.
// Movement: run / jump (variable) / coyote / buffer / dash (Toll Step) / double jump
// (Reprise) / wall cling & jump (Chime Grasp) / hook (Echo Hook) / phase veils /
// water (Undertow). Combat: 3-hit Tine combo, up/down slashes, pogo, charged
// overhead, Sonde (ranged), Commune (heal). All stats modified by relics.
import { TILE, clamp, lerp, noise1, easeOutCubic } from '../core/utils.js';

export const GRAV = 2500, MAXFALL = 920, RUN = 300;
export const PW = 22, PH = 40;

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;         // center-x, feet-y
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.grounded = false; this.wasGrounded = false;
    this.state = 'normal';          // normal|dash|hurt|dead|hook|commune
    this.coyote = 0; this.jumpBuf = 0; this.jumps = 0;
    this.dashT = 0; this.dashCd = 0; this.airDash = 0;
    this.wallDir = 0; this.wallSlide = false;
    this.atkT = 0; this.atkPhase = 0; this.combo = 0; this.comboReset = 0;
    this.chargeT = 0; this.charging = false;
    this.hurtT = 0; this.invulnT = 0; this.deadT = 0;
    this.communeT = 0; this.communeFx = 0;
    this.hookT = null;              // {x,y}
    this.hookCd = 0;
    this.sondeCd = 0;
    this.landT = 0; this.idleT = 0; this.runT = 0;
    this.pogoChain = 0;
    this.scarf = []; for (let i = 0; i < 6; i++) this.scarf.push({ x, y });
    this.afterimgs = [];
    this.unlocked = new Set(['commune']);     // ability ids
    this.relics = new Set();        // equipped (max 4 cords)
    this.relicsOwned = new Set();   // everything carried, equipped or not
    this.maxChimes = 5; this.chimes = 5;
    this.maxAria = 99; this.aria = 0;
    this.noHitSince = 0;            // for the Unrung achievement (tollmaster fight)
    this._statsCache = null;
  }

  has(ab) { return this.unlocked.has(ab); }

  stats() {
    // recompute when relics change
    const r = this.relics;
    const s = {
      runMul: 1, jumpMul: 1, dashDurMul: 1, atkSpeedMul: 1, dmgMul: 1,
      ariaMul: 1, echoMul: 1, healAmount: 1, healCostMul: 1, maxChimesAdd: 0,
      maxChimesMul: 1, maxAriaAdd: 0, dmgReduce: 0, wallSlide: 150, wallJumpMul: 1,
      lightMul: 1, veilFast: false, secretSight: false, mapStelae: false,
    };
    if (r.has('feather')) { s.runMul *= 1.12; s.jumpMul *= 1.06; }
    if (r.has('bellheart')) { s.runMul *= 0.9; s.maxChimesAdd += 2; }
    if (r.has('brittle')) { s.dmgMul *= 1.35; s.maxChimesMul *= 0.75; }
    if (r.has('longtoll')) s.dashDurMul *= 1.4;
    if (r.has('deepcommune')) { s.healAmount = 2; s.healCostMul *= 1.5; }
    if (r.has('edge')) s.ariaMul *= 1.5;
    if (r.has('plate')) { s.dmgReduce += 1; s.atkSpeedMul *= 0.87; }
    if (r.has('lamp')) s.lightMul *= 1.9;
    if (r.has('silk')) { s.wallSlide = 60; s.wallJumpMul *= 1.09; }
    if (r.has('lure')) s.echoMul *= 1.3;
    if (r.has('stillaria')) s.maxAriaAdd += 25;
    if (r.has('tempered')) s.atkSpeedMul *= 1.2;
    if (r.has('veil')) { s.veilFast = true; s.secretSight = true; }
    if (r.has('seal')) s.mapStelae = true;
    return s;
  }

  rect() { return { x: this.x - PW / 2, y: this.y - PH, w: PW, h: PH }; }
  cx() { return this.x; }
  top() { return this.y - PH; }

  // ------------------------------------------------------------------ damage
  invuln() { return this.invulnT > 0 || this.state === 'dash' || this.state === 'dead'; }
  hurt(dmg, fromX, ctx) {
    if (this.invulnT > 0 || this.state === 'dead' || this.state === 'dash') return false;
    const st = this.stats();
    let d = dmg - st.dmgReduce; if (d < 1) d = 1;
    this.chimes -= d;
    this.invulnT = 1.1; this.hurtT = 0.32;
    this.state = 'hurt';
    const dir = this.x < fromX ? -1 : 1;
    this.vx = dir * 240; this.vy = -260;
    this.communeT = 0;
    ctx.fx.addShake(5); ctx.fx.doHitstop(0.06);
    ctx.fx.burst(this.x, this.y - PH / 2, 10, { color: ['#ffd9a0', '#fff'], speed: 160, life: .4 });
    ctx.audio.sfx('hurt');
    this.pogoChain = 0;
    if (this.chimes <= 0) { this.die(ctx); }
    return true;
  }

  die(ctx) {
    this.state = 'dead'; this.deadT = 0; this.chimes = 0;
    ctx.world.onPlayerDeath();
  }

  heal(n) { this.chimes = Math.min(this.maxChimes, this.chimes + n); }

  // ------------------------------------------------------------------ update
  update(dt, input, ctx) {
    const S = ctx.world; // world provides collision + spawn helpers
    this.wasGrounded = this.grounded;
    const st = this.stats();
    this.invulnT -= dt; this.hurtT -= dt; this.dashCd -= dt; this.landT -= dt;
    this.sondeCd -= dt; this.hookCd -= dt; this.comboReset -= dt;

    if (this.state === 'dead') { this.deadT += dt; this._deadPhysics(dt, S); return; }

    // ------- intent
    const move = (input.down.right ? 1 : 0) - (input.down.left ? 1 : 0);
    if (move !== 0 && this.state !== 'hurt') this.facing = move;

    // ------- commune (heal channel)
    if (input.down.heal && this.state === 'normal' && this.grounded && Math.abs(this.vx) < 8 && move === 0 && this.aria >= 33 * st.healCostMul && this.chimes < this.maxChimes) {
      this.communeT += dt;
      this.communeFx += dt;
      this.aria -= 33 * st.healCostMul * dt / 0.85;
      if (this.communeT >= 0.85) {
        this.heal(st.healAmount);
        this.communeT = 0;
        ctx.audio.sfx('heal');
        ctx.fx.burst(this.x, this.y - 20, 14, { color: '#bfe8ff', glow: true, speed: 90, g: -60, life: .8 });
        if (this.chimes >= this.maxChimes) this.communeT = 0;
      }
    } else this.communeT = 0;

    // ------- states
    if (this.state === 'dash') {
      this.dashT -= dt;
      this.vx = this.facing * 560;
      this.vy = 0;
      if (this.dashT <= 0) { this.state = 'normal'; this.vx *= .5; }
    } else if (this.state === 'hook' && this.hookT) {
      // pull toward ring
      const dx = this.hookT.x - this.x, dy = this.hookT.y - (this.y - PH / 2);
      const d = Math.hypot(dx, dy);
      if (d < 26) {
        this.state = 'normal'; this.hookT = null;
        this.vx *= .4; this.vy = Math.min(this.vy, -80);
        this.jumps = 0; this.airDash = 0;
      } else {
        const sp = 700;
        this.vx = dx / d * sp; this.vy = dy / d * sp;
      }
    } else {
      this.state = this.state === 'hurt' && this.hurtT <= 0 ? 'normal' : (this.state === 'hurt' ? 'hurt' : 'normal');
    }

    // ------- horizontal accel
    if (this.state === 'normal') {
      const acc = this.grounded ? 3800 : 2400, dec = this.grounded ? 4600 : 900;
      const top = RUN * st.runMul * (this.charging ? .55 : 1);
      if (move !== 0) this.vx = clamp(this.vx + move * acc * dt, -top, top);
      else {
        const s = Math.sign(this.vx);
        this.vx -= s * dec * dt;
        if (Math.sign(this.vx) !== s) this.vx = 0;
      }
    }

    // ------- jump logic
    const canWall = this.has('grasp') && this.wallDir !== 0 && !this.grounded;
    if (this.grounded) { this.coyote = .1; this.jumps = 0; this.airDash = 0; this.pogoChain = 0; }
    else this.coyote -= dt;
    if (input.pressed.jump) this.jumpBuf = .12;
    this.jumpBuf -= dt;

    if (this.jumpBuf > 0 && this.state !== 'hook' && this.state !== 'hurt') {
      if (this.grounded || this.coyote > 0) {
        this.vy = -790 * st.jumpMul; this.jumpBuf = 0; this.coyote = 0;
        ctx.audio.sfx('jump');
        ctx.fx.burst(this.x, this.y, 4, { color: '#cfd8ec', speed: 40, life: .3, g: 100 });
      } else if (canWall) {
        this.vy = -740 * st.wallJumpMul; this.vx = -this.wallDir * 400;
        this.facing = -this.wallDir; this.jumpBuf = 0;
        ctx.audio.sfx('jump');
        ctx.fx.burst(this.x + this.wallDir * 12, this.y - 20, 6, { color: '#cfd8ec', speed: 80, life: .3 });
      } else if (this.has('reprise') && this.jumps < 1 && this.state !== 'hurt') {
        this.vy = -700 * st.jumpMul; this.jumps++; this.jumpBuf = 0;
        ctx.audio.sfx('bell', { vol: .5 }); ctx.audio.sfx('jump');
        ctx.fx.burst(this.x, this.y - PH / 2, 8, { color: '#ffd9a0', glow: true, speed: 70, g: 0, life: .5, shape: 'ring', size: 5 });
      }
    }
    // variable jump height
    if (input.released.jump && this.vy < -200) this.vy *= .45;

    // ------- dash (Toll Step)
    if (this.has('tollstep') && input.pressed.dash && this.dashCd <= 0 && this.state === 'normal' && (this.grounded || this.airDash < 1)) {
      this.state = 'dash'; this.dashT = .16 * st.dashDurMul; this.dashCd = .45;
      if (!this.grounded) this.airDash++;
      ctx.audio.sfx('dash');
      ctx.fx.burst(this.x, this.y - 20, 8, { color: '#ffd9a0', glow: true, speed: 60, g: 0, life: .35, angle: this.facing > 0 ? Math.PI : 0, spread: .9 });
    }

    // ------- wall detection
    this.wallDir = 0;
    if (!this.grounded && this.state !== 'dash' && this.state !== 'hook') {
      const probe = 3;
      if (move !== 0 || true) {
        const l = S.solidRect(this.x - PW / 2 - probe, this.y - PH + 6, probe, PH - 12);
        const r = S.solidRect(this.x + PW / 2, this.y - PH + 6, probe, PH - 12);
        if (l && (move < 0 || input.down.left || this.pushWall(-1))) this.wallDir = -1;
        else if (r && (move > 0 || input.down.right || this.pushWall(1))) this.wallDir = 1;
      }
      this.wallSlide = this.has('grasp') && this.wallDir !== 0 && this.vy > 0;
      if (this.wallSlide) {
        this.vy = Math.min(this.vy, st.wallSlide);
        if (Math.random() < .3) ctx.fx.spawn({ x: this.x + this.wallDir * 12, y: this.y - 20 + Math.random() * 20, vx: -this.wallDir * 20, vy: 30, life: .4, size: 2, color: '#9aa4c0', layer: 1 });
      }
    }

    // ------- gravity
    if (this.state === 'normal' || this.state === 'hurt') {
      this.vy += GRAV * dt;
      if (this.vy > MAXFALL) this.vy = MAXFALL;
    }

    // ------- attacks
    this._updateAttack(dt, input, ctx, S);

    // ------- sonde
    if (this.has('sonde') && input.pressed.sonde && this.sondeCd <= 0 && this.aria >= 25 && this.state !== 'hook') {
      this.aria -= 25; this.sondeCd = .5;
      S.spawnSonde(this.x + this.facing * 14, this.y - 26, this.facing * 640, 0);
      ctx.audio.sfx('sonde');
    }

    // ------- hook (Echo Hook)
    if (this.has('hook') && input.pressed.hook && this.state === 'normal') {
      const ring = S.nearestHookRing(this.x, this.y - 20, 190);
      if (ring && this.hookCd <= 0) {
        this.state = 'hook'; this.hookT = { x: ring.x, y: ring.y };
        this.hookCd = .5;
        ctx.audio.sfx('phase');
        ctx.fx.burst(ring.x, ring.y, 8, { color: '#ffd9a0', glow: true, speed: 90, g: 0, life: .4, shape: 'ring', size: 4 });
      }
    }

    // ------- integrate & collide
    this._moveAndCollide(dt, S, ctx);

    // ------- veil crossing (Phase Step)
    const inVeil = S.veilAt(this.x, this.y - PH / 2);
    if (inVeil && !this.has('phase')) {
      // blocked: push back
      this.x += (inVeil.x + inVeil.w / 2 > this.x ? -1 : 1) * 160 * dt;
      if (Math.random() < .2) S.hint('hud.notyet.veil');
    }

    // ------- water
    const waterDepth = S.waterAt(this.x, this.y - PH / 2);
    if (waterDepth === 'deep' && !this.has('undertow') && this.state !== 'hook') {
      this.y -= 60 * dt; this.vy = Math.min(this.vy, -140);
      if (Math.random() < .02) S.hint('hud.notyet.water');
    } else if (waterDepth) {
      this.vy *= .92; this.vx *= .96;
      if (Math.random() < .08) ctx.fx.spawn({ x: this.x + (Math.random() - .5) * 16, y: this.y - 30, vy: -30, life: .6, size: 2, color: '#7ae0d0', glow: true, layer: 1 });
    }

    // ------- scarf physics (follow-through)
    let px = this.x - this.facing * 8, py = this.y - PH + 12;
    for (const p of this.scarf) {
      p.x = lerp(p.x, px, 1 - Math.pow(.0001, dt));
      p.y = lerp(p.y, py + 2, 1 - Math.pow(.0001, dt)) + Math.min(20, Math.abs(this.vx) * dt * .8);
      px = p.x; py = p.y;
    }

    // ------- afterimages during dash
    if (this.state === 'dash' && Math.random() < .9) {
      this.afterimgs.push({ x: this.x, y: this.y, f: this.facing, t: .25 });
    }
    for (let i = this.afterimgs.length - 1; i >= 0; i--) {
      this.afterimgs[i].t -= dt;
      if (this.afterimgs[i].t <= 0) this.afterimgs.splice(i, 1);
    }

    // timers for anim
    if (this.grounded && Math.abs(this.vx) > 30) this.runT += dt * Math.abs(this.vx) / 300; else this.runT = 0;
    if (this.grounded && Math.abs(this.vx) < 5) this.idleT += dt; else this.idleT = 0;
    if (this.grounded && !this.wasGrounded) {
      this.landT = .18;
      ctx.audio.sfx('land', { vol: Math.min(1, Math.abs(this.vyLand || 400) / 900) });
      ctx.fx.burst(this.x, this.y, 5, { color: '#8a94b0', speed: 60, life: .3 });
      this.vyLand = 0;
    }
    if (this.vy > 200) this.vyLand = this.vy;
  }

  pushWall(d) { return false; }

  _updateAttack(dt, input, ctx, S) {
    const st = this.stats();
    const atkRate = st.atkSpeedMul;
    if (this.atkT > 0) {
      this.atkT -= dt;
      const t = this._atkTotal - this.atkT; // time since start
      if (this.atkPhase === 0 && t >= .05 * atkRate) {
        this.atkPhase = 1;
        // spawn hitbox
        const up = this._atkDir === 'up', down = this._atkDir === 'down';
        let hb;
        if (up) hb = { x: this.x - 24, y: this.y - PH - 34, w: 48, h: 40 };
        else if (down) hb = { x: this.x - 22, y: this.y - 2, w: 44, h: 40 };
        else hb = { x: this.facing > 0 ? this.x + 2 : this.x - 62, y: this.y - PH - 8, w: 60, h: 44 };
        if (this._charged) { hb.x -= 14; hb.w += 28; hb.y -= 6; hb.h += 14; }
        const dmg = (this._charged ? 26 : this.combo === 3 ? 14 : 10) * st.dmgMul;
        const res = S.playerStrike(hb, dmg, {
          dir: this.facing, down, up, charged: this._charged, pogo: down && !this.grounded,
        });
        if (res.pogoed) {
          this.vy = -620; this.jumps = 0; this.airDash = 0;
          this.pogoChain++;
          ctx.audio.sfx('pogo');
        }
        if (res.hits > 0) { ctx.fx.doHitstop(this._charged ? .09 : .045); }
      }
      if (this.atkT <= 0) { this.atkPhase = 0; }
      return;
    }
    if (input.down.attack && this.state !== 'hook' && this.state !== 'hurt' && this.state !== 'commune') {
      this.chargeT += dt;
      this.charging = this.chargeT > .45;
      if (this.charging && Math.random() < .5) {
        ctx.fx.spawn({ x: this.x + (Math.random() - .5) * 40, y: this.y - 24 + (Math.random() - .5) * 30, vx: 0, vy: -40, life: .4, size: 2.5, color: '#ffd9a0', glow: true, layer: 1 });
      }
    } else if (this.chargeT > 0) {
      const charged = this.charging;
      const dir = input.down.up ? 'up' : (input.down.down && !this.grounded ? 'down' : 'side');
      this._charged = charged; this._atkDir = dir;
      this._atkTotal = (charged ? .5 : .3) / atkRate;
      this.atkT = this._atkTotal; this.atkPhase = 0;
      if (charged) { this.combo = 3; } else { this.combo = this.comboReset > 0 ? (this.combo % 3) + 1 : 1; this.comboReset = .6; }
      this.chargeT = 0; this.charging = false;
      ctx.audio.sfx('swing');
    }
  }

  _moveAndCollide(dt, S, ctx) {
    // horizontal
    let nx = this.x + this.vx * dt;
    const r = this.rect();
    const hbx = { x: nx - PW / 2, y: this.y - PH, w: PW, h: PH };
    if (S.solidRect(hbx.x, hbx.y, hbx.w, hbx.h)) {
      // step in small increments
      const step = Math.sign(this.vx) * 2;
      let moved = 0;
      while (moved !== step * Math.ceil(Math.abs(this.vx * dt) / 2)) {
        const test = this.x + step;
        if (!S.solidRect(test - PW / 2, this.y - PH, PW, PH)) { this.x = test; moved += step; }
        else break;
        if (Math.abs(moved) > Math.abs(this.vx * dt)) break;
      }
      if (this.state === 'dash') { this.state = 'normal'; this.vx = 0; }
      else this.vx = 0;
    } else this.x = nx;

    // vertical
    const prevY = this.y;
    let ny = this.y + this.vy * dt;
    if (this.vy > 0) {
      const hitSolid = S.solidRect(this.x - PW / 2, ny - PH, PW, PH);
      const hitPlat = S.platformAt(this.x - PW / 2, ny, PW, prevY);
      if (hitSolid || hitPlat) {
        this.y = Math.floor(ny / TILE) * TILE;
        this.grounded = true;
        this.vy = 0;
      } else { this.y = ny; this.grounded = false; }
    } else if (this.vy < 0) {
      if (S.solidRect(this.x - PW / 2, ny - PH, PW, PH)) {
        this.y = Math.ceil((ny - PH) / TILE) * TILE + PH;
        this.vy = 0;
      } else this.y = ny;
      this.grounded = false;
    } else {
      this.grounded = S.solidRect(this.x - PW / 2, this.y + 2, PW, 4) || S.platformAt(this.x - PW / 2, this.y + 2, PW, this.y);
    }
    this.x = clamp(this.x, 8, S.roomW() - 8);
  }

  _deadPhysics(dt, S) {
    this.vy += GRAV * dt;
    this.y += this.vy * dt * .3;
  }

  // ------------------------------------------------------------------ draw
  draw(ctx, time, opts = {}) {
    const c = ctx;
    const bob = Math.sin(this.idleT * 2.4) * 2;
    const land = Math.max(0, this.landT) * 40;
    const boil = Math.floor(time * 9);
    const n = s => noise1(s + boil * 7.13, 42) * 1.6;

    c.save();
    c.translate(this.x, this.y);
    if (this.invulnT > 0 && Math.floor(this.invulnT * 14) % 2 === 0) c.globalAlpha = .45;
    if (this.state === 'dead') {
      c.globalAlpha = Math.max(0, 1 - this.deadT);
      c.rotate(this.deadT * 2);
    }
    c.scale(this.facing, 1);
    if (land > 0) c.translate(0, land * .3);

    // afterimages
    c.restore();
    for (const a of this.afterimgs) {
      c.save(); c.globalAlpha = a.t * 1.4;
      c.translate(a.x, a.y); c.scale(a.f, 1);
      c.fillStyle = '#ffd9a0';
      c.beginPath(); c.ellipse(0, -24, 10, 20, 0, 0, 7); c.fill();
      c.restore();
    }
    c.save();
    c.translate(this.x, this.y);
    if (this.invulnT > 0 && Math.floor(this.invulnT * 14) % 2 === 0) c.globalAlpha = .45;
    if (this.state === 'dead') { c.globalAlpha = Math.max(0, 1 - this.deadT); c.rotate(this.deadT * 2); }
    c.scale(this.facing, 1);

    // ---- scarf (drawn behind)
    c.strokeStyle = '#7a4a4a'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-6, -PH + 14 + n(1));
    for (const p of this.scarf) c.lineTo(p.x - this.x, p.y - this.y + n(p.x * .01));
    c.stroke();
    c.strokeStyle = '#a05a50'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-6, -PH + 14 + n(2));
    for (const p of this.scarf) c.lineTo(p.x - this.x, p.y - this.y + 1);
    c.stroke();

    // ---- cloak body
    const runSwing = this.grounded && Math.abs(this.vx) > 30 ? Math.sin(this.runT * 9) * 4 : 0;
    c.fillStyle = '#3d4256';
    c.strokeStyle = '#20242f'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-9, -PH + 12 + n(3) * .5);
    c.quadraticCurveTo(-13 + runSwing * .4, -PH + 26, -10 + runSwing, -2 + n(4) * .5);
    c.lineTo(10 + runSwing, -2 + n(5) * .5);
    c.quadraticCurveTo(13 + runSwing * .4, -PH + 26, 9, -PH + 12);
    c.closePath(); c.fill(); c.stroke();
    // cloak trim
    c.fillStyle = '#565f7a';
    c.fillRect(-9 + runSwing, -4, 19, 2.4);

    // ---- legs
    c.strokeStyle = '#20242f'; c.lineWidth = 3.4;
    if (!this.grounded) {
      c.beginPath(); c.moveTo(-4, -6); c.lineTo(-6, 1 + n(6)); c.stroke();
      c.beginPath(); c.moveTo(4, -6); c.lineTo(6, 0 + n(7)); c.stroke();
    } else if (Math.abs(this.vx) > 30) {
      const sw = Math.sin(this.runT * 9);
      c.beginPath(); c.moveTo(-3, -6); c.lineTo(-3 + sw * 7, 0); c.stroke();
      c.beginPath(); c.moveTo(3, -6); c.lineTo(3 - sw * 7, 0); c.stroke();
    } else {
      c.beginPath(); c.moveTo(-3.4, -6); c.lineTo(-4, 0); c.stroke();
      c.beginPath(); c.moveTo(3.4, -6); c.lineTo(4, 0); c.stroke();
    }

    // ---- bell helm (the head — a hand-bell)
    const hy = -PH - 9 + bob * .6 + n(8) * .4;
    c.fillStyle = '#c9a86a';
    c.strokeStyle = '#6e5426'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-4, hy - 12);                      // crown loop
    c.bezierCurveTo(-16, hy - 10, -17, hy + 6, -15, hy + 10); // left flare
    c.lineTo(15, hy + 10);
    c.bezierCurveTo(17, hy + 6, 16, hy - 10, 4, hy - 12);
    c.closePath(); c.fill(); c.stroke();
    // crown handle
    c.beginPath(); c.arc(0, hy - 12, 4.4, Math.PI, 0); c.stroke();
    // rim
    c.fillStyle = '#8a6a30';
    c.fillRect(-15.5, hy + 8.5, 31, 3.4);
    c.strokeRect(-15.5, hy + 8.5, 31, 3.4);
    // face shadow inside rim
    c.fillStyle = '#1c1710';
    c.beginPath(); c.ellipse(0, hy + 5, 11, 4.2, 0, 0, 7); c.fill();
    // eyes (two warm glints)
    const blink = (Math.sin(time * .7) > .985) ? .2 : 1;
    c.fillStyle = '#ffe9b8';
    c.beginPath(); c.ellipse(-4.4, hy + 5, 2, 2.4 * blink, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(4.4, hy + 5, 2, 2.4 * blink, 0, 0, 7); c.fill();
    // verdigris patina
    c.fillStyle = 'rgba(110,160,140,.25)';
    c.beginPath(); c.ellipse(-8, hy + 2, 3.4, 6, -.4, 0, 7); c.fill();

    // ---- arm & the Tine (tuning-fork blade)
    const atk = this.atkT > 0;
    const armAng = atk ? this._armAngle() : (this.charging ? -1.2 + Math.sin(time * 30) * .05 : .35);
    c.save();
    c.translate(7, -PH + 20);
    c.rotate(armAng);
    // arm
    c.strokeStyle = '#20242f'; c.lineWidth = 3.2;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(10, 0); c.stroke();
    // blade: a short tuning fork
    c.translate(10, 0);
    c.fillStyle = '#d8d3c4';
    c.strokeStyle = '#55503f'; c.lineWidth = 1.6;
    c.fillRect(0, -1.8, 7, 3.6);
    c.fillRect(7, -8, 3.4, 16);
    c.fillRect(12, -8, 3.4, 16);
    c.fillRect(7, -9, 8.4, 2.2);
    c.strokeRect(7, -8, 3.4, 16); c.strokeRect(12, -8, 3.4, 16);
    // hum when attacking
    if (atk) {
      c.strokeStyle = `rgba(255,217,160,${.4 + Math.random() * .4})`;
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(10, -12); c.lineTo(10, 12); c.stroke();
      c.beginPath(); c.moveTo(16, -12); c.lineTo(16, 12); c.stroke();
    }
    c.restore();

    // charge glow
    if (this.charging) {
      c.strokeStyle = `rgba(255,217,160,${.5 + Math.sin(time * 20) * .3})`;
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, -PH / 2, 24 + Math.sin(time * 12) * 3, 0, 7); c.stroke();
    }
    // commune glow
    if (this.communeT > 0) {
      c.strokeStyle = `rgba(190,230,255,${.4 + Math.sin(time * 10) * .25})`;
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, -PH / 2, 26, 0, 7); c.stroke();
      c.fillStyle = 'rgba(190,230,255,.9)';
      c.font = '600 10px Georgia'; c.textAlign = 'center';
      c.fillText('\u266a', 0, -PH - 20 - Math.sin(time * 6) * 3);
    }
    c.restore();
  }

  _armAngle() {
    const t = 1 - this.atkT / this._atkTotal;
    const dir = this._atkDir;
    const swing = Math.sin(Math.min(1, t * 1.6) * Math.PI);
    if (dir === 'up') return -1.9 - swing * .6;
    if (dir === 'down') return 1.7;
    return -0.5 + swing * 2.2;
  }
}
