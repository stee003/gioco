// game/render.js — the hand-drawn look: pre-rendered wobbly tile rooms, layered
// procedural parallax per region, darkness + lights, water, props, weather.
import { TILE, clamp, makeRng, rgba } from '../core/utils.js';
import { REGIONS, SOLID, PLAT, SPIKE, BREAK, WATERD, WATERS, VEIL } from '../data/world.js';

export class Renderer {
  constructor() {
    this.roomCanvas = null;
    this.roomCacheId = null;
    this.parallaxSeed = 1;
  }

  // ------------------------------------------------------------ room tiles
  renderRoom(world) {
    const { room, roomId, def } = world;
    if (this.roomCacheId === roomId && this.roomCanvas) return this.roomCanvas;
    const cv = document.createElement('canvas');
    cv.width = room.w * TILE; cv.height = room.h * TILE;
    const c = cv.getContext('2d');
    const pal = REGIONS[def.region].pal;
    const rng = makeRng(roomId.split('').reduce((a, ch) => a + ch.charCodeAt(0) * 31, 7));
    for (let ty = 0; ty < room.h; ty++) {
      for (let tx = 0; tx < room.w; tx++) {
        const v = room.grid[ty * room.w + tx];
        const x = tx * TILE, y = ty * TILE;
        if (v === SOLID || v === BREAK) {
          this._rock(c, x, y, v === BREAK, pal, rng, def.region);
        } else if (v === PLAT) {
          this._plat(c, x, y, pal, rng, def.region);
        } else if (v === SPIKE) {
          this._spikes(c, x, y, pal);
        }
        // water drawn dynamically
      }
    }
    this.roomCanvas = cv;
    this.roomCacheId = roomId;
    this.parallaxSeed = roomId.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 13) >>> 0;
    return cv;
  }

  _rock(c, x, y, brk, pal, rng, region) {
    const j = () => (rng() - .5) * 3;
    if (brk) {
      c.fillStyle = pal.rockLit;
      c.fillRect(x, y, TILE, TILE);
      c.strokeStyle = 'rgba(0,0,0,.4)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(x + 6 + j(), y); c.lineTo(x + 12 + j(), y + 16); c.lineTo(x + 4 + j(), y + 32);
      c.moveTo(x + 20 + j(), y); c.lineTo(x + 26 + j(), y + 18); c.lineTo(x + 20 + j(), y + 32);
      c.stroke();
      c.strokeStyle = pal.accent; c.globalAlpha = .35;
      c.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
      c.globalAlpha = 1;
      return;
    }
    c.fillStyle = pal.rock;
    c.fillRect(x, y, TILE, TILE);
    // subtle stone variation
    c.fillStyle = rng() < .5 ? pal.rockDark : pal.rockLit;
    c.globalAlpha = .25 + rng() * .2;
    c.fillRect(x + 2 + j(), y + 2 + j(), TILE - 4, TILE - 4);
    c.globalAlpha = 1;
    // brick seams
    c.strokeStyle = 'rgba(0,0,0,.28)';
    c.lineWidth = 1.4;
    c.strokeRect(x + .7, y + .7, TILE - 1.4, TILE - 1.4);
  }

  _plat(c, x, y, pal, rng, region) {
    // one-way ledge: organic slab
    c.fillStyle = pal.rockLit;
    c.beginPath();
    c.moveTo(x + 2, y + 6);
    c.quadraticCurveTo(x + 16, y + (rng() * 6 - 3), x + TILE - 2, y + 4);
    c.lineTo(x + TILE - 3, y + TILE * .55);
    c.quadraticCurveTo(x + 16, y + TILE * .68, x + 3, y + TILE * .55);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.4; c.stroke();
    if (region === 'root') { // moss fringe
      c.strokeStyle = pal.accent; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + 3, y + 6);
      for (let i = 0; i <= 6; i++) c.lineTo(x + 3 + i * 4.5, y + 4 + (rng() * 3));
      c.stroke();
    }
  }

  _spikes(c, x, y, pal) {
    c.fillStyle = pal.rockDark;
    c.strokeStyle = 'rgba(0,0,0,.4)';
    for (let i = 0; i < 4; i++) {
      const sx = x + i * 8;
      c.beginPath();
      c.moveTo(sx, y + TILE); c.lineTo(sx + 4, y + 6); c.lineTo(sx + 8, y + TILE);
      c.closePath(); c.fill(); c.stroke();
    }
  }

  // ------------------------------------------------------------ parallax
  drawParallax(c, world, time) {
    const W = 1280, H = 720;
    const { cam } = world;
    const region = REGIONS[world.def.region];
    const pal = region.pal;
    const seed = this.parallaxSeed;
    const h = (i, k) => { let x = (i * 374761393 + k * 668265263 + seed * 69069) | 0; x = (x ^ x >> 13) * 1274126177 | 0; return ((x ^ x >> 16) >>> 0) / 4294967296; };

    // sky gradient
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.sky0); g.addColorStop(1, pal.sky1);
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    switch (region.parallax) {
      case 'gate': this._pxArch(c, cam, h, pal, time); break;
      case 'root': this._pxRoots(c, cam, h, pal, time); break;
      case 'bell': this._pxFoundry(c, cam, h, pal, time); break;
      case 'hush': this._pxHush(c, cam, h, pal, time); break;
      case 'scr': this._pxStacks(c, cam, h, pal, time); break;
      case 'heart': this._pxHeart(c, cam, h, pal, time); break;
    }
    // fog band
    c.fillStyle = pal.fog;
    c.fillRect(0, 0, W, H);
  }

  _layer(c, cam, factor, period, fn) {
    const i0 = Math.floor((cam.x * factor) / period) - 1;
    const i1 = i0 + Math.ceil(1280 / period) + 2;
    for (let i = i0; i <= i1; i++) fn(i, i * period - cam.x * factor);
  }

  _pxArch(c, cam, h, pal, time) {
    // layer far: colossal broken arches
    this._layer(c, cam, .12, 420, (i, x) => {
      const ht = 300 + h(i, 1) * 260, w = 90 + h(i, 2) * 80;
      c.fillStyle = 'rgba(30,40,66,.8)';
      if (h(i, 3) < .5) { // standing arch
        c.beginPath();
        c.moveTo(x, 720); c.lineTo(x, 720 - ht + 60);
        c.quadraticCurveTo(x + w / 2, 720 - ht - 70, x + w, 720 - ht + 60);
        c.lineTo(x + w, 720);
        c.lineTo(x + w - 26, 720); c.lineTo(x + w - 26, 720 - ht + 70);
        c.quadraticCurveTo(x + w / 2, 720 - ht + 10, x + 26, 720 - ht + 70);
        c.lineTo(x + 26, 720); c.closePath(); c.fill();
      } else { // broken pillar
        c.fillRect(x, 720 - ht * .6, w * .5, ht * .6);
      }
    });
    // mid: chains + hanging cables
    this._layer(c, cam, .3, 300, (i, x) => {
      c.strokeStyle = 'rgba(20,26,44,.9)'; c.lineWidth = 3;
      const len = 120 + h(i, 4) * 260;
      c.beginPath(); c.moveTo(x, 0);
      c.quadraticCurveTo(x + 30 * Math.sin(time * .4 + i), len * .6, x + 10 * Math.sin(time * .3 + i), len);
      c.stroke();
      if (h(i, 5) < .3) { c.fillStyle = 'rgba(30,40,66,.9)'; c.beginPath(); c.arc(x + 10, len + 10, 12, 0, 7); c.fill(); }
    });
    // near: rubble silhouettes
    this._layer(c, cam, .55, 240, (i, x) => {
      c.fillStyle = 'rgba(14,18,32,.95)';
      const hh = 40 + h(i, 6) * 90;
      c.beginPath();
      c.moveTo(x, 720); c.lineTo(x + 10, 720 - hh); c.lineTo(x + 60, 720 - hh * .8); c.lineTo(x + 90, 720);
      c.closePath(); c.fill();
    });
  }

  _pxRoots(c, cam, h, pal, time) {
    // far: glowing canopy haze
    this._layer(c, cam, .08, 500, (i, x) => {
      const r = 180 + h(i, 1) * 160;
      const g = c.createRadialGradient(x, 200 + h(i, 2) * 200, 0, x, 200 + h(i, 2) * 200, r);
      g.addColorStop(0, 'rgba(110,190,120,.13)'); g.addColorStop(1, 'rgba(110,190,120,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, 200 + h(i, 2) * 200, r, 0, 7); c.fill();
    });
    // mid: giant roots
    this._layer(c, cam, .22, 340, (i, x) => {
      c.strokeStyle = 'rgba(24,52,34,.9)'; c.lineWidth = 30 + h(i, 3) * 40;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x, -20);
      c.bezierCurveTo(x + 80, 200, x - 60, 420, x + 40 + Math.sin(time * .2 + i) * 6, 720);
      c.stroke();
    });
    // near: fronds
    this._layer(c, cam, .5, 220, (i, x) => {
      c.fillStyle = 'rgba(12,30,18,.95)';
      c.beginPath();
      c.moveTo(x, 720);
      c.quadraticCurveTo(x + 40 + Math.sin(time * .5 + i) * 12, 560 + h(i, 4) * 80, x + 100, 720);
      c.closePath(); c.fill();
    });
  }

  _pxFoundry(c, cam, h, pal, time) {
    // far: skyline of chimneys
    this._layer(c, cam, .1, 260, (i, x) => {
      c.fillStyle = 'rgba(40,24,20,.85)';
      const w = 50 + h(i, 1) * 60, ht = 260 + h(i, 2) * 300;
      c.fillRect(x, 720 - ht, w, ht);
      if (h(i, 3) < .6) { c.fillRect(x + w * .3, 720 - ht - 60 - h(i, 4) * 60, w * .3, 80); }
    });
    // mid: colossal gear
    this._layer(c, cam, .2, 900, (i, x) => {
      c.save();
      c.translate(x + 300, 300 + h(i, 5) * 200);
      c.rotate(time * .05 * (i % 2 ? 1 : -1));
      c.strokeStyle = 'rgba(50,32,26,.9)'; c.lineWidth = 16;
      c.beginPath(); c.arc(0, 0, 130, 0, 7); c.stroke();
      for (let k = 0; k < 10; k++) {
        c.rotate(Math.PI / 5);
        c.beginPath(); c.moveTo(130, 0); c.lineTo(160, 0); c.stroke();
      }
      c.restore();
    });
    // near: pipes
    this._layer(c, cam, .45, 300, (i, x) => {
      c.fillStyle = 'rgba(24,14,12,.95)';
      c.fillRect(x, 720 - 60 - h(i, 6) * 200, 24, 400);
      c.fillRect(x - 40, 720 - 60 - h(i, 6) * 200, 104, 18);
    });
  }

  _pxHush(c, cam, h, pal, time) {
    // far: barely-there stalagmites
    this._layer(c, cam, .1, 400, (i, x) => {
      c.fillStyle = 'rgba(16,20,36,.6)';
      const ht = 120 + h(i, 1) * 200;
      c.beginPath(); c.moveTo(x - 40, 720); c.lineTo(x, 720 - ht); c.lineTo(x + 40, 720); c.closePath(); c.fill();
    });
    // mid: faint watching eyes that blink
    this._layer(c, cam, .25, 380, (i, x) => {
      const blink = Math.sin(time * .5 + i * 2.7) > .96;
      if (blink) return;
      const y = 200 + h(i, 2) * 300;
      c.fillStyle = 'rgba(170,180,212,.14)';
      c.beginPath(); c.ellipse(x, y, 7, 4, 0, 0, 7); c.fill();
      c.beginPath(); c.ellipse(x + 22, y, 7, 4, 0, 0, 7); c.fill();
    });
    // near: floor mist
    const g = c.createLinearGradient(0, 560, 0, 720);
    g.addColorStop(0, 'rgba(10,12,22,0)'); g.addColorStop(1, 'rgba(10,12,22,.8)');
    c.fillStyle = g; c.fillRect(0, 560, 1280, 160);
  }

  _pxStacks(c, cam, h, pal, time) {
    // far: receding shelf walls
    for (let l = 0; l < 3; l++) {
      const f = .08 + l * .1, yb = 720 - l * 10;
      this._layer(c, cam, f, 200 + l * 40, (i, x) => {
        c.fillStyle = `rgba(20,44,52,${.5 + l * .18})`;
        for (let s = 0; s < 5; s++) {
          const sy = 140 + s * 110 + h(i, s + l * 7) * 20;
          c.fillRect(x, sy, 160 + l * 30, 14);
        }
        c.fillRect(x, 120, 10, 600);
      });
    }
    // chains
    this._layer(c, cam, .4, 280, (i, x) => {
      c.strokeStyle = 'rgba(12,24,30,.9)'; c.lineWidth = 3;
      const len = 100 + h(i, 1) * 200;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + Math.sin(time * .3 + i) * 6, len); c.stroke();
    });
  }

  _pxHeart(c, cam, h, pal, time) {
    // stars
    this._layer(c, cam, .04, 300, (i, x) => {
      for (let s = 0; s < 3; s++) {
        const sx = x + h(i, s) * 260, sy = h(i, s + 3) * 500;
        const tw = .3 + Math.abs(Math.sin(time * 1.4 + i + s)) * .7;
        c.fillStyle = `rgba(232,216,255,${tw * .5})`;
        c.fillRect(sx, sy, 2, 2);
      }
    });
    // aurora bands
    for (let b = 0; b < 3; b++) {
      c.fillStyle = `rgba(${140 + b * 30},${110 + b * 20},255,${.05 + b * .015})`;
      c.beginPath();
      c.moveTo(0, 140 + b * 90);
      for (let x = 0; x <= 1280; x += 40) {
        c.lineTo(x, 140 + b * 90 + Math.sin(x * .006 + time * .4 + b * 2) * 40);
      }
      c.lineTo(1280, 0); c.lineTo(0, 0); c.closePath(); c.fill();
    }
    // floating geometry
    this._layer(c, cam, .18, 340, (i, x) => {
      const y = 200 + h(i, 1) * 300, r = 20 + h(i, 2) * 40, rot = time * .1 + i;
      c.save(); c.translate(x, y); c.rotate(rot);
      c.strokeStyle = 'rgba(160,140,220,.35)'; c.lineWidth = 3;
      c.strokeRect(-r / 2, -r / 2, r, r);
      c.restore();
    });
    // distant Velmora ghost skyline
    this._layer(c, cam, .3, 420, (i, x) => {
      c.fillStyle = 'rgba(90,80,130,.35)';
      const ht = 160 + h(i, 3) * 220;
      c.fillRect(x, 720 - ht, 70 + h(i, 4) * 50, ht);
      if (h(i, 5) < .3) { // broken bell tower
        c.fillRect(x + 10, 720 - ht - 90, 26, 90);
      }
    });
  }

  // ------------------------------------------------------------ main draw
  draw(ctx2d, world, time, settings) {
    const c = ctx2d;
    const { cam, fx } = { cam: world.cam, fx: world.ctx.fx };
    const shakeX = world.ctx.fx.shakeX * settings.shake, shakeY = world.ctx.fx.shakeY * settings.shake;
    const camX = Math.round(cam.x - shakeX), camY = Math.round(cam.y - shakeY);
    const region = REGIONS[world.def.region];
    const pal = region.pal;

    this.drawParallax(c, world, time);

    // ambient particles (spawned here, drawn via fx layer 0)
    this._ambient(c, world, time);

    c.save();
    c.translate(-camX, -camY);

    // room tiles
    const rc = this.renderRoom(world);
    c.drawImage(rc, 0, 0);

    // water
    this._water(c, world, time);

    // fx back layer
    fx.drawBack(c, camX, camY);

    // props behind entities
    for (const p of world.props) this._drawProp(c, p, world, time);

    // reverberation (death echo)
    if (world.reverberation && world.reverberation.room === world.roomId) this._drawReverberation(c, world.reverberation, time);

    // enemies
    for (const e of world.enemies) {
      drawEnemyRef(c, e, time);
    }

    // boss
    if (world.boss) drawBossRef(c, world.boss, time, world);

    // zones
    this._drawZones(c, world, time);

    // player
    world.ctx.player.draw(c, time, {});

    // projectiles
    for (const pr of world.projectiles) this._drawProjectile(c, pr, time);

    // beams
    for (const b of world.beams) {
      if (b.t < .65) {
        c.strokeStyle = `rgba(255,208,144,${.3 + Math.sin(time * 20) * .2})`;
        c.lineWidth = 2; c.setLineDash([8, 8]);
        c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x + b.dir * b.len, b.y); c.stroke();
        c.setLineDash([]);
      } else {
        const a = 1 - (b.t - .65) / .3;
        c.fillStyle = `rgba(255,208,144,${a})`;
        const bx = b.dir > 0 ? b.x : b.x - b.len;
        c.fillRect(bx, b.y - 9, b.len, 18);
        c.fillStyle = `rgba(255,240,210,${a})`;
        c.fillRect(bx, b.y - 3, b.len, 6);
      }
    }

    // shockwaves
    for (const s of world.shocks) {
      c.fillStyle = `rgba(255,217,160,${1 - s.t / s.life})`;
      c.beginPath();
      c.moveTo(s.x - 14, s.y); c.lineTo(s.x, s.y - 26); c.lineTo(s.x + 14, s.y);
      c.closePath(); c.fill();
    }

    // echo pickups
    for (const ep of world.echoPickups) {
      const pul = 1 + Math.sin(time * 6 + ep.x) * .2;
      c.fillStyle = '#bfe8ff';
      c.shadowColor = '#bfe8ff'; c.shadowBlur = 10;
      c.beginPath(); c.arc(ep.x, ep.y, 4 * pul, 0, 7); c.fill();
      c.shadowBlur = 0;
    }

    // fx front layer
    fx.draw(c, camX, camY);

    // veils (over entities, translucent)
    this._drawVeils(c, world, time);

    c.restore();

    // ---- lighting & atmosphere (screen space)
    this._lighting(c, world, camX, camY, region, settings, time);
    // vignette
    const vg = c.createRadialGradient(640, 360, 320, 640, 360, 760);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
    c.fillStyle = vg; c.fillRect(0, 0, 1280, 720);

    // transition fade
    if (world.transition) {
      const tr = world.transition;
      const a = tr.phase === 'out' ? Math.min(1, tr.t / .3) : Math.max(0, 1 - tr.t / .35);
      c.fillStyle = `rgba(3,4,8,${a})`;
      c.fillRect(0, 0, 1280, 720);
    }
    if (fx.flash > 0) {
      c.fillStyle = fx.flashColor;
      c.globalAlpha = fx.flash;
      c.fillRect(0, 0, 1280, 720);
      c.globalAlpha = 1;
    }
  }

  _ambient(c, world, time) {
    const region = world.def.region;
    const fx = world.ctx.fx;
    const cam = world.cam;
    const spawn = (opts) => fx.spawn({ x: cam.x + Math.random() * 1280, y: cam.y + Math.random() * 720, layer: 0, ...opts });
    if (region === 'root' && Math.random() < .35) {
      spawn({ vx: (Math.random() - .5) * 20, vy: -14 - Math.random() * 10, life: 3 + Math.random() * 3, size: 2.2, color: Math.random() < .3 ? '#d2f7a8' : '#9fd47a', glow: Math.random() < .4, drag: 1 });
    } else if (region === 'bell' && Math.random() < .3) {
      spawn({ vx: (Math.random() - .5) * 30, vy: -30 - Math.random() * 40, life: 1.5 + Math.random(), size: 2, color: Math.random() < .5 ? '#e09a5a' : '#ffb877', glow: true, drag: .99 });
    } else if ((region === 'gate' || region === 'scr') && Math.random() < .18) {
      spawn({ vx: (Math.random() - .5) * 10, vy: 12 + Math.random() * 10, life: 4, size: 1.6, color: 'rgba(190,200,230,.5)', drag: 1 });
    } else if (region === 'heart' && Math.random() < .3) {
      spawn({ vx: (Math.random() - .5) * 16, vy: -8 - Math.random() * 14, life: 4, size: 2, color: '#e8d8ff', glow: true });
    } else if (region === 'hush' && Math.random() < .08) {
      spawn({ vx: (Math.random() - .5) * 8, vy: -6, life: 3, size: 1.6, color: 'rgba(170,180,212,.4)', glow: true });
    }
  }

  _water(c, world, time) {
    const { room, grid } = world;
    const w = room.w, h = room.h;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const v = grid[ty * w + tx];
        if (v !== WATERD && v !== WATERS) continue;
        const x = tx * TILE, y = ty * TILE;
        const deep = v === WATERD;
        const above = ty > 0 ? grid[(ty - 1) * w + tx] : 0;
        const surface = above !== WATERD && above !== WATERS;
        c.fillStyle = deep ? 'rgba(10,40,52,.72)' : 'rgba(30,90,96,.5)';
        if (surface) {
          c.beginPath();
          c.moveTo(x, y + 6);
          for (let i = 0; i <= 8; i++) {
            c.lineTo(x + i * 4, y + 6 + Math.sin(time * 2.2 + tx + i * .8) * 2.4);
          }
          c.lineTo(x + TILE, y + TILE); c.lineTo(x, y + TILE);
          c.closePath(); c.fill();
          c.strokeStyle = 'rgba(122,224,208,.5)'; c.lineWidth = 1.6;
          c.beginPath();
          for (let i = 0; i <= 8; i++) {
            const yy = y + 6 + Math.sin(time * 2.2 + tx + i * .8) * 2.4;
            i === 0 ? c.moveTo(x + i * 4, yy) : c.lineTo(x + i * 4, yy);
          }
          c.stroke();
        } else {
          c.fillRect(x, y, TILE, TILE);
        }
      }
    }
  }

  _drawVeils(c, world, time) {
    const { room, grid } = world;
    for (let ty = 0; ty < room.h; ty++) for (let tx = 0; tx < room.w; tx++) {
      if (grid[ty * room.w + tx] !== VEIL) continue;
      const x = tx * TILE, y = ty * TILE;
      const a = .3 + Math.sin(time * 2 + tx * 2 + ty) * .12;
      const g = c.createLinearGradient(x, y, x + TILE, y + TILE);
      g.addColorStop(0, `rgba(190,230,255,${a})`);
      g.addColorStop(.5, `rgba(255,255,255,${a * 1.4})`);
      g.addColorStop(1, `rgba(150,200,255,${a})`);
      c.fillStyle = g;
      c.fillRect(x, y, TILE, TILE);
      if ((tx + ty) % 3 === 0) {
        c.strokeStyle = `rgba(255,255,255,${a})`;
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(x + 4, y); c.quadraticCurveTo(x + 16, y + 16, x + 4, y + TILE); c.stroke();
      }
    }
  }

  _drawZones(c, world, time) {
    for (const z of world.zones) {
      if (z.kind === 'inkwater') {
        c.fillStyle = 'rgba(16,40,52,.55)';
        c.fillRect(z.x, z.y, z.w, z.h);
        c.strokeStyle = 'rgba(90,176,168,.4)'; c.lineWidth = 2;
        c.beginPath();
        c.moveTo(z.x, z.y + 3);
        for (let x = 0; x <= z.w; x += 40) c.lineTo(z.x + x, z.y + 3 + Math.sin(time * 2 + x * .02) * 2.5);
        c.stroke();
        continue;
      }
      if (!z.active) {
        // telegraph marks
        if (z.kind === 'mark' || z.kind === 'vine' || z.kind === 'tentacle' || z.kind === 'hand') {
          const bl = Math.floor(time * 12) % 2 === 0;
          c.strokeStyle = bl ? 'rgba(255,150,110,.7)' : 'rgba(255,220,180,.4)';
          c.lineWidth = 2;
          if (z.kind === 'mark') c.strokeRect(z.x, z.y - 4, z.w, z.h + 4);
          else c.strokeRect(z.x, z.y, z.w, z.h);
        }
        continue;
      }
      switch (z.kind) {
        case 'vine': {
          c.strokeStyle = '#6a8a4a'; c.lineWidth = 10;
          const gr = Math.min(1, z.t / (z.delay || 0) === 0 ? 1 : (z.t / (z.life * .5)));
          c.beginPath(); c.moveTo(z.x + z.w / 2, z.y + z.h);
          c.quadraticCurveTo(z.x + z.w / 2 + 8, z.y + z.h * .5, z.x + z.w / 2, z.y + z.h * (1 - gr));
          c.stroke();
          c.strokeStyle = '#9fd47a'; c.lineWidth = 3;
          for (let i = 0; i < 3; i++) {
            c.beginPath(); c.moveTo(z.x + z.w / 2, z.y + z.h * (1 - gr) + i * 30);
            c.lineTo(z.x + z.w / 2 + (i % 2 ? 16 : -16), z.y + z.h * (1 - gr) + i * 30 - 12);
            c.stroke();
          }
          break;
        }
        case 'tentacle': {
          c.strokeStyle = '#1e3240'; c.lineWidth = 12;
          const sway = Math.sin(time * 10) * 6;
          c.beginPath(); c.moveTo(z.x + z.w / 2, z.y + z.h);
          c.quadraticCurveTo(z.x + z.w / 2 + sway, z.y + z.h * .5, z.x + z.w / 2 + sway * 1.6, z.y);
          c.stroke();
          break;
        }
        case 'hand': {
          c.fillStyle = 'rgba(232,216,255,.75)';
          c.fillRect(z.x, z.y, z.w, z.h);
          c.strokeStyle = '#fff2ff'; c.lineWidth = 3;
          c.beginPath(); c.moveTo(z.x, z.y); c.lineTo(z.x, z.y + z.h); c.stroke();
          c.beginPath(); c.moveTo(z.x + z.w, z.y); c.lineTo(z.x + z.w, z.y + z.h); c.stroke();
          break;
        }
        case 'mark': {
          c.fillStyle = 'rgba(255,242,255,.5)';
          c.fillRect(z.x, z.y - 4, z.w, z.h + 4);
          break;
        }
      }
    }
  }

  _drawProjectile(c, pr, time) {
    c.save();
    c.translate(pr.x, pr.y);
    switch (pr.kind) {
      case 'sonde': {
        c.rotate(Math.atan2(pr.vy, pr.vx));
        c.fillStyle = '#ffe9b8'; c.shadowColor = '#ffd9a0'; c.shadowBlur = 12;
        c.beginPath(); c.moveTo(-10, 0); c.lineTo(8, -4); c.lineTo(8, 4); c.closePath(); c.fill();
        break;
      }
      case 'ring': {
        c.strokeStyle = pr.color; c.lineWidth = 3; c.shadowColor = pr.color; c.shadowBlur = 14;
        c.beginPath(); c.arc(0, 0, pr.r + Math.sin(time * 20) * 2, 0, 7); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.4;
        c.beginPath(); c.arc(0, 0, pr.r * .55, 0, 7); c.stroke();
        break;
      }
      case 'gear': {
        c.rotate(time * 6 * Math.sign(pr.vx));
        c.fillStyle = '#7a6242'; c.strokeStyle = '#3e3020'; c.lineWidth = 2;
        c.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * Math.PI * 2;
          c.lineTo(Math.cos(a) * pr.r * 1.25, Math.sin(a) * pr.r * 1.25);
          c.lineTo(Math.cos(a + .2) * pr.r, Math.sin(a + .2) * pr.r);
        }
        c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.arc(0, 0, pr.r * .4, 0, 7); c.stroke();
        break;
      }
      case 'seed': case 'spore': {
        c.fillStyle = pr.color; c.shadowColor = pr.color; c.shadowBlur = 8;
        c.beginPath(); c.ellipse(0, 0, pr.r, pr.r * .8, pr.t * 6, 0, 7); c.fill();
        break;
      }
      case 'pollen': {
        c.fillStyle = pr.color; c.shadowColor = pr.color; c.shadowBlur = 6;
        c.beginPath(); c.arc(0, 0, pr.r, 0, 7); c.fill();
        break;
      }
      case 'fish': {
        c.rotate(Math.atan2(pr.vy, pr.vx));
        c.fillStyle = pr.color;
        c.beginPath(); c.ellipse(0, 0, pr.r * 1.5, pr.r * .7, 0, 0, 7); c.fill();
        c.beginPath(); c.moveTo(-pr.r * 1.2, 0); c.lineTo(-pr.r * 2, -4); c.lineTo(-pr.r * 2, 4); c.fill();
        break;
      }
      case 'page': {
        c.rotate(Math.sin(pr.t * 8) * .6);
        c.fillStyle = pr.color;
        c.fillRect(-7, -9, 14, 18);
        c.strokeStyle = '#8a7a5a'; c.lineWidth = 1;
        c.strokeRect(-7, -9, 14, 18);
        break;
      }
      case 'wax': case 'shard': {
        c.fillStyle = pr.color; c.shadowColor = pr.color; c.shadowBlur = 8;
        c.beginPath(); c.arc(0, 0, pr.r, 0, 7); c.fill();
        break;
      }
      default: {
        c.fillStyle = pr.color || '#fff';
        c.beginPath(); c.arc(0, 0, pr.r, 0, 7); c.fill();
      }
    }
    c.restore();
  }

  _drawReverberation(c, r, time) {
    c.save();
    c.translate(r.x, r.y);
    const pul = 1 + Math.sin(time * 3) * .06;
    c.globalAlpha = .5 + Math.sin(time * 2) * .15;
    c.fillStyle = '#bfe8ff';
    c.shadowColor = '#bfe8ff'; c.shadowBlur = 18;
    // ghost bell silhouette
    c.beginPath();
    c.moveTo(-4, -50); c.bezierCurveTo(-16, -46, -18, -22, -16, -8);
    c.lineTo(16, -8); c.bezierCurveTo(18, -22, 16, -46, 4, -50);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(190,232,255,.8)';
    c.beginPath(); c.arc(0, -30 * pul, 3, 0, 7); c.fill();
    // ripple rings
    c.strokeStyle = 'rgba(190,232,255,.5)'; c.lineWidth = 1.6;
    for (let i = 0; i < 2; i++) {
      const rr = ((time * .6 + i * .5) % 1) * 30 + 8;
      c.globalAlpha = (1 - (rr - 8) / 30) * .5;
      c.beginPath(); c.arc(0, -26, rr, 0, 7); c.stroke();
    }
    c.restore();
  }

  // ------------------------------------------------------------ props
  _drawProp(c, p, world, time) {
    const lit = world.flags.has(`lit_${world.roomId}`);
    switch (p.type) {
      case 'chime': {
        c.save(); c.translate(p.x, p.y);
        // stand
        c.strokeStyle = '#5a4a2e'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(-14, 0); c.lineTo(-14, -34); c.quadraticCurveTo(0, -46, 14, -34); c.lineTo(14, 0); c.stroke();
        // bell
        const sway = lit ? Math.sin(time * 1.2) * .06 : Math.sin(time * .5) * .02;
        c.rotate(sway);
        c.fillStyle = lit ? '#e8c878' : '#8a744e';
        c.beginPath();
        c.moveTo(-3, -46); c.bezierCurveTo(-13, -42, -14, -28, -12, -22);
        c.lineTo(12, -22); c.bezierCurveTo(14, -28, 13, -42, 3, -46);
        c.closePath(); c.fill();
        c.strokeStyle = '#4e4028'; c.lineWidth = 2; c.stroke();
        c.fillStyle = '#4e4028'; c.fillRect(-13, -23, 26, 3);
        if (lit) {
          c.fillStyle = `rgba(255,217,160,${.6 + Math.sin(time * 3) * .2})`;
          c.beginPath(); c.arc(0, -34, 5, 0, 7); c.fill();
        }
        c.restore();
        break;
      }
      case 'tram': {
        c.save(); c.translate(p.x, p.y);
        const on = world.flags.has(`tram_${world.roomId}`);
        c.strokeStyle = '#3a3648'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -70); c.stroke();
        c.beginPath(); c.moveTo(-40, -70); c.quadraticCurveTo(0, -80, 40, -70); c.stroke();
        c.fillStyle = on ? '#ffd9a0' : '#4a4456';
        c.beginPath(); c.arc(0, -70, 8, 0, 7); c.fill();
        if (on) {
          c.shadowColor = '#ffd9a0'; c.shadowBlur = 16;
          c.beginPath(); c.arc(0, -70, 8, 0, 7); c.fill();
          c.shadowBlur = 0;
        }
        c.fillStyle = '#2c2838'; c.fillRect(-10, -30, 20, 30);
        c.strokeStyle = '#4a4456'; c.strokeRect(-10, -30, 20, 30);
        c.restore();
        break;
      }
      case 'stele': {
        c.save(); c.translate(p.x, p.y);
        c.fillStyle = '#3e4458';
        c.strokeStyle = '#20242f'; c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-13, 0); c.lineTo(-15, -44); c.quadraticCurveTo(0, -56, 15, -44); c.lineTo(13, 0);
        c.closePath(); c.fill(); c.stroke();
        c.strokeStyle = 'rgba(216,168,90,.6)'; c.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) {
          c.beginPath(); c.moveTo(-8, -12 - i * 9); c.lineTo(8 - (i % 2) * 5, -12 - i * 9); c.stroke();
        }
        c.restore();
        break;
      }
      case 'memory': {
        c.save(); c.translate(p.x, p.y - 26 + Math.sin(time * 1.6 + p.x) * 5);
        c.fillStyle = 'rgba(191,232,255,.85)';
        c.shadowColor = '#bfe8ff'; c.shadowBlur = 14;
        c.beginPath(); c.arc(0, 0, 7, 0, 7); c.fill();
        c.shadowBlur = 0;
        c.strokeStyle = 'rgba(191,232,255,.5)'; c.lineWidth = 1.4;
        c.beginPath(); c.arc(0, 0, 12 + Math.sin(time * 2) * 2, 0, 7); c.stroke();
        c.restore();
        break;
      }
      case 'chest': {
        c.save(); c.translate(p.x, p.y);
        const open = p.used;
        c.fillStyle = '#5a4a30';
        c.strokeStyle = '#2e2416'; c.lineWidth = 2;
        if (open) {
          c.fillRect(-13, -16, 26, 16); c.strokeRect(-13, -16, 26, 16);
          c.save(); c.translate(0, -16); c.rotate(-.9);
          c.fillRect(-13, -10, 26, 10); c.strokeRect(-13, -10, 26, 10);
          c.restore();
        } else {
          c.fillRect(-13, -20, 26, 20); c.strokeRect(-13, -20, 26, 20);
          c.fillStyle = '#c9a86a';
          c.beginPath(); c.moveTo(-13, -20); c.quadraticCurveTo(0, -30, 13, -20); c.closePath(); c.fill(); c.stroke();
          c.fillStyle = '#ffd9a0'; c.fillRect(-2, -14, 4, 6);
        }
        c.restore();
        break;
      }
      case 'shrine': {
        c.save(); c.translate(p.x, p.y);
        const got = p.used;
        c.fillStyle = '#46405c';
        c.strokeStyle = '#2a2540'; c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-14, 0); c.lineTo(-10, -14); c.lineTo(10, -14); c.lineTo(14, 0);
        c.closePath(); c.fill(); c.stroke();
        if (!got) {
          const fy = -30 + Math.sin(time * 2) * 4;
          c.fillStyle = '#e8d8ff'; c.shadowColor = '#e8d8ff'; c.shadowBlur = 16;
          c.save(); c.translate(0, fy); c.rotate(time * .8);
          c.fillRect(-6, -6, 12, 12);
          c.restore();
          c.shadowBlur = 0;
          c.strokeStyle = `rgba(232,216,255,${.4 + Math.sin(time * 4) * .2})`;
          c.lineWidth = 1.6;
          c.beginPath(); c.arc(0, -30, 14 + Math.sin(time * 2) * 3, 0, 7); c.stroke();
        }
        c.restore();
        break;
      }
      case 'pickup': {
        c.save(); c.translate(p.x, p.y - 18 + Math.sin(time * 2 + p.x * .01) * 4);
        if (p.used) break;
        c.shadowBlur = 12;
        if (p.item === 'seed') {
          c.fillStyle = '#c9f29b'; c.shadowColor = '#c9f29b';
          c.beginPath(); c.ellipse(0, 0, 5, 7, .4, 0, 7); c.fill();
          c.strokeStyle = '#7fae5e'; c.lineWidth = 1.6;
          c.beginPath(); c.moveTo(0, -6); c.quadraticCurveTo(5, -12, 2, -14); c.stroke();
        } else if (p.item === 'ariamask') {
          c.fillStyle = '#e8d8c8'; c.shadowColor = '#ffd9a0';
          c.beginPath(); c.ellipse(0, 0, 8, 10, 0, 0, 7); c.fill();
          c.strokeStyle = '#5a4a3a';
          c.beginPath(); c.moveTo(-4, -2); c.lineTo(-1, -2); c.stroke();
          c.beginPath(); c.moveTo(1, -2); c.lineTo(4, -2); c.stroke();
          c.strokeStyle = '#5a4a3a';
          c.beginPath(); c.moveTo(-4, -2); c.lineTo(-1, -2); c.moveTo(1, -2); c.lineTo(4, -2); c.stroke();
          c.beginPath(); c.moveTo(0, -6); c.lineTo(0, 2); c.stroke();
        } else if (p.item === 'codex') {
          c.rotate(Math.sin(time * 1.4) * .2);
          c.fillStyle = '#d8c79a'; c.shadowColor = '#7ae0d0';
          c.fillRect(-7, -9, 14, 18);
          c.strokeStyle = '#6a5a3a'; c.strokeRect(-7, -9, 14, 18);
          c.strokeStyle = 'rgba(106,90,58,.7)';
          for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-4, -5 + i * 4); c.lineTo(4, -5 + i * 4); c.stroke(); }
        }
        c.restore();
        break;
      }
      case 'npc': {
        drawNpcRef(c, p, world, time);
        break;
      }
      case 'station': {
        c.save(); c.translate(p.x, p.y);
        c.fillStyle = '#5a5170';
        c.strokeStyle = '#342e4c'; c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-12, 0); c.lineTo(-8, -52); c.lineTo(8, -52); c.lineTo(12, 0);
        c.closePath(); c.fill(); c.stroke();
        const glyph = ['✕', '♪', '❋', '↑'][p.idx];
        c.fillStyle = `rgba(232,216,255,${.5 + Math.sin(time * 2 + p.idx) * .3})`;
        c.font = '600 16px Georgia'; c.textAlign = 'center';
        c.fillText(glyph, 0, -30);
        c.restore();
        break;
      }
      case 'gateDoor': {
        const sealed = p.seal && !world.flags.has(p.seal);
        c.save(); c.translate(p.x, p.y);
        if (sealed) {
          c.fillStyle = '#2c2838';
          c.fillRect(-40, -96, 80, 96);
          c.strokeStyle = '#4a4456'; c.lineWidth = 3;
          c.strokeRect(-40, -96, 80, 96);
          c.beginPath(); c.arc(0, -48, 14, 0, 7); c.stroke();
          c.fillStyle = '#8a744e';
          c.fillRect(-4, -50, 8, 4);
        }
        c.restore();
        break;
      }
      case 'hook': {
        c.save(); c.translate(p.x, p.y);
        c.strokeStyle = `rgba(255,217,160,${.5 + Math.sin(time * 3) * .25})`;
        c.lineWidth = 3;
        c.beginPath(); c.arc(0, 0, 10, 0, 7); c.stroke();
        c.strokeStyle = 'rgba(255,233,184,.8)'; c.lineWidth = 1.6;
        c.beginPath(); c.arc(0, 0, 5, 0, 7); c.stroke();
        c.fillStyle = 'rgba(255,217,160,.9)';
        c.beginPath(); c.arc(0, 0, 2, 0, 7); c.fill();
        c.restore();
        break;
      }
      case 'lantern': {
        c.save(); c.translate(p.x, p.y);
        c.strokeStyle = '#3a3648'; c.lineWidth = 2.6;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -40); c.lineTo(8, -40); c.stroke();
        const flick = .75 + Math.sin(time * 7 + p.x) * .12 + Math.sin(time * 13) * .06;
        c.fillStyle = `rgba(255,200,120,${flick})`;
        c.shadowColor = '#ffb877'; c.shadowBlur = 18;
        c.beginPath(); c.ellipse(8, -36, 4, 6, 0, 0, 7); c.fill();
        c.shadowBlur = 0;
        c.strokeStyle = '#3a3648';
        c.strokeRect(4, -44, 8, 12);
        c.restore();
        break;
      }
      case 'chalk': {
        c.save(); c.translate(p.x, p.y);
        c.strokeStyle = 'rgba(220,220,230,.35)'; c.lineWidth = 1.6;
        // child's chalk bells at courier height
        for (let i = 0; i < 3; i++) {
          const bx = -14 + i * 14;
          c.beginPath();
          c.moveTo(bx - 4, -38); c.quadraticCurveTo(bx - 6, -30, bx - 5, -26);
          c.lineTo(bx + 5, -26); c.quadraticCurveTo(bx + 6, -30, bx + 4, -38);
          c.closePath(); c.stroke();
        }
        c.font = '10px Georgia'; c.fillStyle = 'rgba(220,220,230,.3)';
        c.fillText('mio', 10, -18);
        c.restore();
        break;
      }
      case 'shroom': {
        c.save(); c.translate(p.x, p.y);
        const pul = 1 + Math.sin(time * 1.6 + p.x * .05) * .12;
        c.strokeStyle = '#3a5a4a'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(3, -8, 0, -14); c.stroke();
        c.fillStyle = `rgba(122,224,208,${.7 * pul})`;
        c.shadowColor = '#7ae0d0'; c.shadowBlur = 12;
        c.beginPath(); c.ellipse(0, -16, 8 * pul, 5 * pul, 0, 0, 7); c.fill();
        c.restore();
        break;
      }
      case 'rootsDecor': case 'gearsDecor': {
        // room centerpiece silhouettes
        c.save(); c.translate(p.x, p.y);
        if (p.type === 'rootsDecor') {
          c.strokeStyle = 'rgba(30,60,40,.9)'; c.lineWidth = 26;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(0, -300);
          c.bezierCurveTo(-60, -180, 50, -90, -20, 0);
          c.stroke();
          c.lineWidth = 12;
          c.beginPath(); c.moveTo(-10, -160); c.quadraticCurveTo(60, -120, 80, -60); c.stroke();
          c.beginPath(); c.moveTo(-14, -100); c.quadraticCurveTo(-80, -70, -100, -20); c.stroke();
        } else {
          c.strokeStyle = 'rgba(58,42,36,.9)'; c.lineWidth = 10;
          c.beginPath(); c.arc(0, -140, 60, 0, 7); c.stroke();
          c.save(); c.translate(0, -140); c.rotate(time * .15);
          for (let k = 0; k < 8; k++) { c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(60, 0); c.lineTo(76, 0); c.stroke(); }
          c.restore();
        }
        c.restore();
        break;
      }
      case 'bossTrigger': break;
    }
  }

  // ------------------------------------------------------------ lighting
  _lighting(c, world, camX, camY, region, settings, time) {
    const base = region.darkness * (world.def.region === 'hush' && settings.reduceDarkness ? .45 : 1);
    if (base <= .02) return;
    // darkness layer with light holes (canvas cached across frames)
    if (!this._darkCv) { this._darkCv = document.createElement('canvas'); this._darkCv.width = 1280; this._darkCv.height = 720; }
    const dark = this._darkCv;
    const d = dark.getContext('2d');
    d.fillStyle = `rgba(2,3,8,${base})`;
    d.fillRect(0, 0, 1280, 720);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, strength = 1) => {
      const g = d.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.beginPath(); d.arc(x, y, r, 0, 7); d.fill();
    };
    const p = world.ctx.player;
    hole(p.x - camX, p.y - 24 - camY, 190 * p.stats().lightMul, .95);
    for (const prop of world.props) {
      const sx = prop.x - camX, sy = prop.y - camY;
      if (sx < -300 || sx > 1580) continue;
      if (prop.type === 'lantern') hole(sx + 8, sy - 36, 150, .85);
      else if (prop.type === 'chime' && world.flags.has(`lit_${world.roomId}`)) hole(sx, sy - 34, 170, .9);
      else if (prop.type === 'shrine' && !prop.used) hole(sx, sy - 30, 120, .8);
      else if (prop.type === 'memory') hole(sx, sy - 26, 90, .8);
      else if (prop.type === 'tram' && world.flags.has(`tram_${world.roomId}`)) hole(sx, sy - 60, 130, .8);
      else if (prop.type === 'station') hole(sx, sy - 30, 120, .8);
      else if (prop.type === 'hook') hole(sx, sy, 90, .8);
    }
    for (const pr of world.projectiles) hole(pr.x - camX, pr.y - camY, 70, .7);
    for (const ep of world.echoPickups) hole(ep.x - camX, ep.y - camY, 40, .7);
    if (world.boss) hole(world.boss.x - camX, world.boss.y - 60 - camY, 260, .6);
    c.drawImage(dark, 0, 0);
    // warm tint for lit zones
    if (region.darkness < .5) {
      c.fillStyle = region.pal.fog;
      c.fillRect(0, 0, 1280, 720);
    }
  }
}

// late-bound references to avoid circular imports
import { drawEnemy as drawEnemyRef } from './enemies.js';
import { drawBoss as drawBossRef } from './bosses.js';
import { drawNpc as drawNpcRef } from './npcs.js';
