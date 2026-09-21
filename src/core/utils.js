// core/utils.js — small math & helper toolkit for THE LONG QUIET
export const TILE = 32;

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = v => v < 0 ? -1 : v > 0 ? 1 : 0;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const approach = (v, target, step) => v < target ? Math.min(v + step, target) : Math.max(v - step, target);

// deterministic 32-bit RNG (mulberry32)
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function overlap(a, b) {
  return aabb(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h);
}

export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeInCubic = t => t * t * t;
export const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// seedable value noise for hand-drawn "boil" wobble
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const h = n => { let k = (n * 374761393 + seed * 668265263) | 0; k = (k ^ k >> 13) * 1274126177 | 0; return ((k ^ k >> 16) >>> 0) / 4294967296 * 2 - 1; };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}

// darker/lighter hex
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}

export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// enumerate solid rects from a tile grid — used for AI ground checks etc.
export function tilesInRect(grid, cols, x, y, w, h) {
  const out = [];
  const x0 = Math.floor(x / TILE), y0 = Math.floor(y / TILE);
  const x1 = Math.floor((x + w - 1) / TILE), y1 = Math.floor((y + h - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tx < 0 || ty < 0 || tx >= cols || ty >= grid.length / cols) { out.push(1); continue; }
    out.push(grid[ty * cols + tx]);
  }
  return out;
}
