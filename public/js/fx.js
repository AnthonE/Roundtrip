// Particles, pop-up text, screen shake and the glitch post-pass.
// Glitches never flash the whole screen; prefers-reduced-motion softens them further.
import { view, snapshot } from './render.js';
import { drawText } from './font.js';

export const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const parts = [];
let shakeAmt = 0;

export function clearFx() {
  parts.length = 0;
  shakeAmt = 0;
}

export function shake(amount) {
  shakeAmt = Math.max(shakeAmt, reducedMotion ? amount * 0.3 : amount);
}

export function burst(x, y, colors, n = 10, speed = 60) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    parts.push({
      kind: 'px',
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 20,
      g: 120,
      life: 0.4 + Math.random() * 0.4,
      t: 0,
      color: colors[i % colors.length],
      size: Math.random() < 0.3 ? 2 : 1,
    });
  }
}

export function sparkleTrail(x, y, color) {
  parts.push({ kind: 'spark', x, y, vx: 0, vy: 8, g: 0, life: 0.5, t: 0, color });
}

// color may be an array: the text then cycles through it (rainbow callouts).
export function popText(x, y, text, color = '#fff', opts = {}) {
  parts.push({ kind: 'text', x, y, vx: 0, vy: opts.vy ?? -26, g: 0, life: opts.life ?? 0.8, t: 0, text, color, scale: opts.scale ?? 1 });
}

// Puff of dust along the ground. angle = surface angle (0 = top of the globe).
export function dust(x, y, angle, n = 6, speed = 30) {
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  for (let i = 0; i < n; i++) {
    const dir = i % 2 ? 1 : -1;
    const v = speed * (0.5 + Math.random() * 0.7);
    parts.push({
      kind: 'px',
      x: x + tx * dir * 3,
      y: y + ty * dir * 3,
      vx: tx * dir * v + Math.sin(angle) * 6,
      vy: ty * dir * v - Math.cos(angle) * (6 + Math.random() * 10),
      g: 30,
      life: 0.25 + Math.random() * 0.2,
      t: 0,
      color: Math.random() < 0.5 ? '#d9dcf5' : '#a9b0e0',
      size: Math.random() < 0.4 ? 2 : 1,
    });
  }
}

// Expanding dithered ring (shockwave).
export function ring(x, y, color, radius = 24, life = 0.35) {
  parts.push({ kind: 'ring', x, y, vx: 0, vy: 0, g: 0, life, t: 0, color, radius });
}

// A sprite that flies to a point (e.g. a coin to the score), then calls onArrive.
export function flyTo(img, x, y, tx, ty, onArrive, life = 0.4) {
  parts.push({ kind: 'fly', img, x0: x, y0: y, x, y, tx, ty, vx: 0, vy: 0, g: 0, life, t: 0, onArrive });
}

export function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.life) {
      parts.splice(i, 1);
      p.onArrive?.();
      continue;
    }
    if (p.kind === 'fly') {
      // ease in, with a little hop on the way
      const k = p.t / p.life;
      const e = k * k;
      p.x = p.x0 + (p.tx - p.x0) * e;
      p.y = p.y0 + (p.ty - p.y0) * e - Math.sin(k * Math.PI) * 12;
      continue;
    }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  shakeAmt = Math.max(0, shakeAmt - dt * 18);
}

export function drawFx(ctx) {
  for (const p of parts) {
    const k = 1 - p.t / p.life;
    if (p.kind === 'px') {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    } else if (p.kind === 'spark') {
      ctx.fillStyle = p.color;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      ctx.fillRect(x, y, 1, 1);
      if (k > 0.5) {
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
      }
    } else if (p.kind === 'text') {
      if (k < 0.25 && Math.floor(p.t * 20) % 2) continue;
      const color = Array.isArray(p.color) ? p.color[Math.floor(p.t * 14) % p.color.length] : p.color;
      // pop in: one size up for the first few frames
      const scale = p.t < 0.07 ? p.scale + 1 : p.scale;
      drawText(ctx, p.text, p.x, p.y - (scale - p.scale) * 3, { color, align: 'center', outline: '#140f2e', scale });
    } else if (p.kind === 'ring') {
      const r = p.radius * (1 - (1 - p.t / p.life) ** 2);
      const steps = Math.max(12, Math.round(r * 3));
      ctx.fillStyle = p.color;
      for (let i = 0; i < steps; i++) {
        if ((i + Math.floor(p.t * 30)) % 2) continue;
        const a = (i / steps) * Math.PI * 2;
        ctx.fillRect(Math.round(p.x + Math.cos(a) * r), Math.round(p.y + Math.sin(a) * r), 1, 1);
      }
    } else if (p.kind === 'fly') {
      ctx.drawImage(p.img, Math.round(p.x - p.img.width / 2), Math.round(p.y - p.img.height / 2));
    }
  }
}

export function shakeOffset() {
  if (shakeAmt <= 0.05) return [0, 0];
  return [(Math.random() - 0.5) * 2 * shakeAmt, (Math.random() - 0.5) * 2 * shakeAmt];
}

/**
 * Glitch pass over the finished frame. k in 0..1.
 * Horizontal tears, neon green/purple stripes from the album art, a little static.
 */
export function glitch(ctx, k, focusY = null) {
  if (k <= 0.01) return;
  if (reducedMotion) k *= 0.35;
  const { W, H } = view;
  const src = snapshot();
  const tears = 1 + Math.floor(k * 7);
  for (let i = 0; i < tears; i++) {
    const y = Math.floor(focusY !== null && Math.random() < 0.6 ? focusY + (Math.random() - 0.5) * 60 : Math.random() * H);
    const h = 1 + Math.floor(Math.random() * (2 + k * 12));
    const dx = Math.round((Math.random() - 0.5) * k * 30);
    ctx.drawImage(src, 0, y, W, h, dx, y, W, h);
  }
  // neon stripes
  const stripes = Math.floor(k * 4);
  for (let i = 0; i < stripes; i++) {
    const y = Math.floor(Math.random() * H);
    ctx.globalAlpha = 0.35 + k * 0.3;
    ctx.fillStyle = Math.random() < 0.5 ? '#39ff88' : '#b34dff';
    const x = Math.floor(Math.random() * W * 0.6);
    ctx.fillRect(x, y, Math.floor(W * (0.2 + Math.random() * 0.5)), 1 + Math.floor(Math.random() * 2));
  }
  ctx.globalAlpha = 1;
  if (reducedMotion) return;
  // static in a band
  const n = Math.floor(k * 220);
  const by = Math.floor(focusY ?? Math.random() * H);
  for (let i = 0; i < n; i++) {
    const v = Math.random();
    ctx.fillStyle = v < 0.5 ? '#ffffff' : v < 0.75 ? '#9aa3d6' : '#39ff88';
    ctx.fillRect(Math.floor(Math.random() * W), by + Math.floor((Math.random() - 0.5) * 50 * k), 1, 1);
  }
}

// Pulsing danger tint around the screen edges, dithered so it stays pixel-art.
export function vignette(ctx, k, color = '#ff3b4f') {
  if (k <= 0) return;
  const { W, H } = view;
  ctx.fillStyle = color;
  const band = (inset, alpha, step) => {
    ctx.globalAlpha = alpha * k;
    for (let x = inset; x < W - inset; x += step) {
      ctx.fillRect(x, inset, 1, 1);
      ctx.fillRect(x, H - 1 - inset, 1, 1);
    }
    for (let y = inset; y < H - inset; y += step) {
      ctx.fillRect(inset, y, 1, 1);
      ctx.fillRect(W - 1 - inset, y, 1, 1);
    }
  };
  band(0, 0.95, 1);
  band(1, 0.8, 1);
  band(2, 0.7, 1);
  band(3, 0.6, 2);
  band(4, 0.55, 2);
  band(6, 0.45, 2);
  band(8, 0.35, 3);
  band(11, 0.25, 4);
  band(14, 0.18, 5);
  ctx.globalAlpha = 1;
}

// --- scene transition: the old frame dissolves away in a Bayer dither -------

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
let trans = null; // { img: ImageData, t, dur }

export function startTransition(ctx, dur = 0.32) {
  const { W, H } = view;
  trans = { img: ctx.getImageData(0, 0, W, H), t: 0, dur };
}

export function drawTransition(ctx, dt) {
  if (!trans) return;
  const { W, H } = view;
  trans.t += dt;
  const k = 1 - trans.t / trans.dur; // share of the old frame still showing
  if (k <= 0 || trans.img.width !== W || trans.img.height !== H) {
    trans = null;
    return;
  }
  const cur = ctx.getImageData(0, 0, W, H);
  const a = new Uint32Array(cur.data.buffer);
  const b = new Uint32Array(trans.img.data.buffer);
  const level = k * 16;
  for (let y = 0; y < H; y++) {
    const row = (y & 3) * 4;
    for (let x = 0; x < W; x++) if (BAYER4[row + (x & 3)] < level) a[y * W + x] = b[y * W + x];
  }
  ctx.putImageData(cur, 0, 0);
}
