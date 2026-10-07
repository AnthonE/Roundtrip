// Starry night sky from the album art: navy grid, stars, a butterfly nebula and
// layered pastel clouds. The static parts are baked per screen size.
import { view } from './render.js';

let sky; // baked canvas
let stars = []; // twinklers drawn live
let clouds = []; // { canvas, x, y, depth }
let bakedFor = '';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function px(g, x, y, c) {
  g.fillStyle = c;
  g.fillRect(x | 0, y | 0, 1, 1);
}

function nebula(g, cx, cy, s) {
  const rand = rng(7);
  const wing = (ox, oy, rx, ry) => {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (d > 1) continue;
        const r = rand();
        if (r < 0.62 - d * 0.35) px(g, cx + ox + x, cy + oy + y, d < 0.35 && r < 0.3 ? '#8a5fc4' : '#6b4aa8');
        else if (r < 0.75 - d * 0.2) px(g, cx + ox + x, cy + oy + y, '#4c3a8c');
      }
    }
  };
  wing(-9 * s, -6 * s, 9 * s, 7 * s);
  wing(9 * s, -6 * s, 9 * s, 7 * s);
  wing(-6 * s, 7 * s, 6 * s, 6 * s);
  wing(6 * s, 7 * s, 6 * s, 6 * s);
  // glowing diamonds
  const diamond = (x0, y0, r, c, hi) => {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) if (Math.abs(x) + Math.abs(y) <= r) px(g, x0 + x, y0 + y, c);
    px(g, x0, y0, hi);
    px(g, x0, y0 - 1, hi);
  };
  diamond(cx - 7 * s, cy - 4 * s, 3, '#ff5fae', '#ffd1ea');
  diamond(cx + 6 * s, cy - 6 * s, 3, '#3fd8e8', '#d1fbff');
  for (let i = 0; i < 14; i++) px(g, cx + (rand() - 0.5) * 34 * s, cy + (rand() - 0.5) * 26 * s, '#ffb84d');
}

// Rainbow cloud: union of circles, coloured in bands top to bottom.
function makeCloud(w, h, seed) {
  const rand = rng(seed);
  const c = document.createElement('canvas');
  c.width = w + 4;
  c.height = h + 4;
  const g = c.getContext('2d');
  const blobs = [];
  const n = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = (h / 2) * (0.55 + 0.45 * Math.sin(Math.PI * t)) * (0.85 + rand() * 0.3);
    blobs.push([2 + r + t * (w - 2 * r), 2 + h - r - rand() * 2, r]);
  }
  const inside = (x, y) => blobs.some(([bx, by, r]) => (x - bx) ** 2 + (y - by) ** 2 <= r * r);
  const bands = ['#bdf7e4', '#8ee8f0', '#fff09a', '#ffd166', '#ffb3c7', '#ff9ec4', '#c7b8ff', '#a594f0'];
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const edge = !inside(x + 0.5, y + 2.5);
      const t = y / c.height;
      let band = Math.min(bands.length - 1, Math.floor(t * bands.length + ((x + y) % 2) * 0.35));
      if (edge) band = bands.length - 1;
      g.fillStyle = bands[band];
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

export function bakeBackground() {
  const { W, H } = view;
  const key = `${W}x${H}`;
  if (key === bakedFor) return;
  bakedFor = key;
  sky = document.createElement('canvas');
  sky.width = W;
  sky.height = H;
  const g = sky.getContext('2d');
  const rand = rng(42);

  // vertical bands of navy
  const bands = ['#151b4f', '#171e57', '#19215e', '#1b2465'];
  for (let y = 0; y < H; y++) {
    g.fillStyle = bands[Math.min(bands.length - 1, Math.floor((y / H) * bands.length))];
    g.fillRect(0, y, W, 1);
  }
  // faint grid
  g.fillStyle = '#232f74';
  const cell = 34;
  const ox = Math.round((W / 2) % cell);
  for (let x = ox; x < W; x += cell) g.fillRect(x, 0, 1, H);
  for (let y = 10; y < H; y += cell) g.fillRect(0, y, W, 1);

  const portrait = H > W * 1.3;
  nebula(g, Math.round(W * (portrait ? 0.17 : 0.13)), Math.round(H * (portrait ? 0.47 : 0.38)), 1);

  // tiny stars
  const n = Math.round((W * H) / 260);
  const cols = ['#ffffff', '#ffe9a8', '#ffd166', '#a8f0ff', '#ffb3d9'];
  for (let i = 0; i < n; i++) px(g, rand() * W, rand() * H, cols[Math.floor(rand() * cols.length)]);

  // twinkling sparkles, drawn live
  stars = [];
  const m = Math.max(6, Math.round((W * H) / 5200));
  for (let i = 0; i < m; i++) {
    stars.push({
      x: Math.round(rand() * W),
      y: Math.round(rand() * H * 0.75),
      phase: rand() * Math.PI * 2,
      speed: 0.8 + rand() * 1.6,
      col: rand() < 0.4 ? '#ffd166' : '#ffffff',
      big: rand() < 0.35,
    });
  }

  clouds = [
    { canvas: makeCloud(70, 22, 3), fx: 0.66, fy: 0.03, depth: 0.25 },
    { canvas: makeCloud(96, 34, 5), fx: 0.74, fy: 0.3, depth: 0.4 },
    { canvas: makeCloud(60, 26, 9), fx: -0.06, fy: 0.72, depth: 0.55 },
    { canvas: makeCloud(84, 30, 11), fx: 0.82, fy: 0.86, depth: 0.55 },
  ].map((c) => ({ ...c, x: Math.round(c.fx * W), y: Math.round(c.fy * H) }));
}

/** drift: horizontal scroll in pixels (0 for the calm screens). */
export function drawBackground(ctx, t, drift = 0) {
  bakeBackground();
  const { W } = view;
  ctx.drawImage(sky, 0, 0);
  for (const s of stars) {
    const k = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
    ctx.fillStyle = s.col;
    ctx.fillRect(s.x, s.y, 1, 1);
    if (k > 0.45) {
      ctx.fillRect(s.x - 1, s.y, 3, 1);
      ctx.fillRect(s.x, s.y - 1, 1, 3);
    }
    if (s.big && k > 0.8) {
      ctx.fillRect(s.x - 2, s.y, 5, 1);
      ctx.fillRect(s.x, s.y - 2, 1, 5);
    }
  }
  for (const c of clouds) {
    const w = c.canvas.width;
    let x = c.x - drift * c.depth;
    x = ((((x + w) % (W + w)) + (W + w)) % (W + w)) - w;
    ctx.drawImage(c.canvas, Math.round(x), c.y);
  }
}
