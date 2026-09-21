// core/fx.js — pooled particle system, floaters (damage/labels), hitstop & shake helpers.
import { makeRng } from './utils.js';

const MAX = 900;

export class FX {
  constructor() {
    this.parts = [];
    this.free = [];
    for (let i = 0; i < MAX; i++) this.parts.push({});
    this.floaters = [];
    this.shake = 0; this.shakeX = 0; this.shakeY = 0;
    this.hitstop = 0;
    this.flash = 0; this.flashColor = '#fff';
    this.rng = makeRng(1234567);
  }

  spawn(o) {
    const p = this.free.length ? this.free.pop() : this.parts.find(p => !p.on);
    if (!p) return null;
    Object.assign(p, {
      on: true, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 1,
      life: .5, t: 0, size: 3, size2: null, color: '#fff', glow: false,
      shape: 'dot', rot: 0, vr: 0, fade: true, layer: 1
    }, o);
    return p;
  }

  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.angle !== undefined ? opts.angle + (this.rng() - .5) * (opts.spread || Math.PI * 2) : this.rng() * Math.PI * 2;
      const sp = (opts.speed || 90) * (.3 + this.rng() * .9);
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: opts.g ?? 260, drag: opts.drag ?? .99,
        life: (opts.life || .5) * (.6 + this.rng() * .8),
        size: (opts.size || 3) * (.6 + this.rng() * .8),
        color: Array.isArray(opts.color) ? opts.color[(this.rng() * opts.color.length) | 0] : (opts.color || '#fff'),
        glow: opts.glow || false, shape: opts.shape || 'dot', layer: opts.layer || 1,
      });
    }
  }

  floater(x, y, text, color = '#fff', size = 13) {
    this.floaters.push({ x, y, text, color, size, t: 0, life: .9 });
  }

  addShake(amount) { this.shake = Math.min(14, this.shake + amount); }
  doHitstop(f) { this.hitstop = Math.max(this.hitstop, f); }
  doFlash(color = '#ffffff', a = .5) { this.flash = a; this.flashColor = color; }

  update(dt, shakeScale = 1) {
    for (const p of this.parts) {
      if (!p.on) continue;
      p.t += dt;
      if (p.t >= p.life) { p.on = false; this.free.push(p); continue; }
      p.vy += p.g * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt; f.y -= 26 * dt;
      if (f.t > f.life) this.floaters.splice(i, 1);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 30);
      const s = this.shake * shakeScale;
      this.shakeX = (this.rng() * 2 - 1) * s;
      this.shakeY = (this.rng() * 2 - 1) * s;
    } else { this.shakeX = this.shakeY = 0; }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.hitstop > 0) this.hitstop -= dt;
  }

  draw(ctx, camX, camY) {
    // layer 0 (behind entities) drawn by world; this draws layer 1+
    this._drawLayer(ctx, camX, camY, 1);
    ctx.font = '600 13px Georgia, serif';
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      const a = 1 - f.t / f.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.font = `600 ${f.size}px Georgia, serif`;
      ctx.fillText(f.text, f.x - camX, f.y - camY);
    }
    ctx.globalAlpha = 1;
  }

  _drawLayer(ctx, camX, camY, layer) {
    for (const p of this.parts) {
      if (!p.on || p.layer !== layer) continue;
      const a = p.fade ? 1 - p.t / p.life : 1;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const x = p.x - camX, y = p.y - camY;
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 8; }
      const s = p.size2 ? p.size + (p.size2 - p.size) * (p.t / p.life) : p.size;
      if (p.shape === 'dot') { ctx.beginPath(); ctx.arc(x, y, Math.max(.4, s), 0, 7); ctx.fill(); }
      else if (p.shape === 'spark') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(0, -s * .3, s * 2.6, s * .6); ctx.restore();
      }
      else if (p.shape === 'ring') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, s * (1 + p.t / p.life * 2.4), 0, 7); ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
  drawBack(ctx, camX, camY) { this._drawLayer(ctx, camX, camY, 0); }
}
