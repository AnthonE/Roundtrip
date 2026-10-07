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

export function popText(x, y, text, color = '#fff', opts = {}) {
  parts.push({ kind: 'text', x, y, vx: 0, vy: -26, g: 0, life: opts.life ?? 0.8, t: 0, text, color, scale: opts.scale ?? 1 });
}

export function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.life) {
      parts.splice(i, 1);
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
      drawText(ctx, p.text, p.x, p.y, { color: p.color, align: 'center', outline: '#140f2e', scale: p.scale });
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

// Chromatic ghosting for a sprite: draw tinted copies offset either side.
export function ghost(ctx, drawFn, k) {
  if (reducedMotion) k *= 0.5;
  const off = Math.max(1, Math.round(k * 3));
  drawFn('green', -off);
  drawFn('purple', off);
}
