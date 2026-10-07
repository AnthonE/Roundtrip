// The globe: a pixel-art Earth baked once, then rotated in-plane every frame
// with a per-pixel nearest-neighbour resample so it stays crisp. Lighting and
// the outline are fixed to the screen, so the world turns under a steady sun.
import { GLOBE } from './config.js';
import { LAND, LAKES, DESERT, JUNGLE, SAVANNA, CITIES } from './geo.js';

const R = GLOBE.r;
const RIM = 14; // room for scenery sticking out of the surface
const T = 2 * (R + RIM); // texture size
const C = T / 2; // texture centre

const LON0 = (0 * Math.PI) / 180; // the face shown: Atlantic, Europe and Africa
const LAT0 = (24 * Math.PI) / 180;

const rgba = (hex, a = 255) => {
  const n = parseInt(hex.slice(1), 16);
  // ImageData is little-endian ABGR when viewed as Uint32.
  return ((a << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
};

const PAL = {
  ocean: rgba('#2f6fe8'),
  ocean2: rgba('#2a63d6'),
  shallow: rgba('#4d8ff2'),
  sparkle: rgba('#7fb2ff'),
  grass: rgba('#46b83f'),
  grass2: rgba('#3aa336'),
  jungle: rgba('#2e8a35'),
  jungle2: rgba('#26752e'),
  savanna: rgba('#9ccc4a'),
  savanna2: rgba('#85b83f'),
  sand: rgba('#f2c76a'),
  sand2: rgba('#e3ad52'),
  snow: rgba('#f2f6ff'),
  snow2: rgba('#cfdcf4'),
  coast: rgba('#1f6b2c'),
  coastSand: rgba('#c98d3c'),
  coastSnow: rgba('#a9bde0'),
  outline: rgba('#120d2a'),
};

// --- geometry helpers -----------------------------------------------------

function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inAny = (polys, x, y) => polys.some((p) => inPoly(p, x, y));

// Screen offset on the unit disk (y up) -> [lon, lat] in degrees, or null if off-sphere.
function unproject(x, y) {
  const rho = Math.hypot(x, y);
  if (rho > 1) return null;
  if (rho === 0) return [(LON0 * 180) / Math.PI, (LAT0 * 180) / Math.PI];
  const c = Math.asin(rho);
  const lat = Math.asin(Math.cos(c) * Math.sin(LAT0) + (y * Math.sin(c) * Math.cos(LAT0)) / rho);
  const lon =
    LON0 + Math.atan2(x * Math.sin(c), rho * Math.cos(c) * Math.cos(LAT0) - y * Math.sin(c) * Math.sin(LAT0));
  let lonDeg = (lon * 180) / Math.PI;
  if (lonDeg > 180) lonDeg -= 360;
  if (lonDeg < -180) lonDeg += 360;
  return [lonDeg, (lat * 180) / Math.PI];
}

function project(lonDeg, latDeg) {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const x = Math.cos(lat) * Math.sin(lon - LON0);
  const y = Math.cos(LAT0) * Math.sin(lat) - Math.sin(LAT0) * Math.cos(lat) * Math.cos(lon - LON0);
  return [x, y];
}

// Cheap deterministic hash noise for dithering.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- scenery sprites (drawn upright, stamped radially on the rim) ---------

const SCENERY_PAL = {
  k: '#120d2a',
  c: '#b8c2f2', // building
  C: '#8d98d8',
  w: '#ffe46b', // lit window
  g: '#5fd655', // tree
  G: '#3a9e38',
  t: '#8a5a2b', // trunk
  r: '#ff6fb5', // roof
  m: '#f2f6ff',
};
const SCENERY = {
  city: [
    '.....k.......',
    '....kck......',
    '....kwk..k...',
    '.k..kck.kck..',
    'kck.kCk.kwk..',
    'kwkkkwk.kck.k',
    'kckckck.kCkck',
    'kCkwkCkkkckwk',
    'kckckwkwkwkck',
    'kwkCkckckckCk',
    'kkkkkkkkkkkkk',
  ],
  trees: [
    '...kkk.......',
    '..kgggk..kk..',
    '.kgggGgk.kggk',
    '.kggggGkkgggk',
    'kggGgggGkgGgk',
    'kgggggGGkgGk.',
    '.kkgGGkkkkk..',
    '...ktk...kt..',
    '...ktk...kt..',
  ],
  pines: [
    '..k....k...',
    '.kgk..kgk..',
    '.kgk..kgk..',
    'kgGgkkgGgk.',
    'kgGgkkgGgk.',
    'kggGgkggGk.',
    '.kktkk.kkt.',
    '...t....t..',
  ],
  house: ['...kk...', '..krrk..', '.krrrrk.', 'krrrrrrk', '.kmmwmk.', '.kmmwmk.', '.kmmmmk.'],
};

function parseSprite(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const px = new Uint32Array(w * h);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = SCENERY_PAL[row[x]];
      if (col) px[y * w + x] = rgba(col);
    }
  });
  return { w, h, px };
}

// Small upright city icon painted on the globe face.
const FACE_CITY = parseSprite(['.c....', '.cc.c.', 'cwcCcc', 'cCcwcC']);

// --- baking ---------------------------------------------------------------

let tex; // Uint32Array T×T
let shade; // per output pixel: 0 none, 1 light, 2 dark, 3 darker, 4 outline
let offsets; // [dx, dy] pairs inside R+RIM
let out; // ImageData T×T
let out32;
let canvas; // where `out` is put each frame
let gctx;

function setTex(x, y, col) {
  if (x >= 0 && y >= 0 && x < T && y < T) tex[y * T + x] = col;
}

function stampRadial(sprite, angle, sink = 1) {
  // Map texture pixels back into the sprite so rotation leaves no holes.
  const ux = Math.sin(angle);
  const uy = -Math.cos(angle);
  const rx = Math.cos(angle);
  const ry = Math.sin(angle);
  const bx = C + ux * (R - sink);
  const by = C + uy * (R - sink);
  const reach = Math.hypot(sprite.w, sprite.h) + 2;
  for (let y = Math.floor(by - reach); y <= by + reach; y++) {
    for (let x = Math.floor(bx - reach); x <= bx + reach; x++) {
      const dx = x + 0.5 - bx;
      const dy = y + 0.5 - by;
      const sx = Math.floor(sprite.w / 2 + dx * rx + dy * ry);
      const sy = Math.floor(sprite.h - (dx * ux + dy * uy));
      if (sx < 0 || sy < 0 || sx >= sprite.w || sy >= sprite.h) continue;
      const col = sprite.px[sy * sprite.w + sx];
      if (col) setTex(x, y, col);
    }
  }
}

function bakeTexture() {
  tex = new Uint32Array(T * T);
  const kind = new Uint8Array(T * T); // 0 space, 1 water, 2 land

  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const nx = (x + 0.5 - C) / R;
      const ny = -(y + 0.5 - C) / R;
      if (nx * nx + ny * ny > 1) continue;
      const ll = unproject(nx, ny);
      if (!ll) continue;
      const [lon, lat] = ll;
      const i = y * T + x;
      const land = inAny(LAND, lon, lat) && !inAny(LAKES, lon, lat);
      const n = hash(x, y);
      if (!land) {
        kind[i] = 1;
        tex[i] = n < 0.035 ? PAL.sparkle : (x + y) % 7 === 0 && n < 0.5 ? PAL.ocean2 : PAL.ocean;
        continue;
      }
      kind[i] = 2;
      const polar = lat > 66 || (lon < -15 && lon > -75 && lat > 59); // ice caps + Greenland
      if (polar) tex[i] = n < 0.25 ? PAL.snow2 : PAL.snow;
      else if (inAny(DESERT, lon, lat)) tex[i] = n < 0.22 ? PAL.sand2 : PAL.sand;
      else if (inAny(JUNGLE, lon, lat)) tex[i] = n < 0.3 ? PAL.jungle2 : PAL.jungle;
      else if (inAny(SAVANNA, lon, lat)) tex[i] = n < 0.25 ? PAL.savanna2 : PAL.savanna;
      else tex[i] = n < 0.25 ? PAL.grass2 : PAL.grass;
    }
  }

  // Coastlines: darken land next to water, lighten water next to land.
  const coastOf = (col) =>
    col === PAL.snow || col === PAL.snow2
      ? PAL.coastSnow
      : col === PAL.sand || col === PAL.sand2
        ? PAL.coastSand
        : PAL.coast;
  const copy = tex.slice();
  for (let y = 1; y < T - 1; y++) {
    for (let x = 1; x < T - 1; x++) {
      const i = y * T + x;
      if (!kind[i]) continue;
      const nb = [kind[i - 1], kind[i + 1], kind[i - T], kind[i + T]];
      if (kind[i] === 2 && nb.includes(1)) tex[i] = coastOf(copy[i]);
      if (kind[i] === 1 && nb.includes(2) && hash(y, x) < 0.7) tex[i] = PAL.shallow;
    }
  }

  // Little cities on the face.
  for (const [lon, lat] of CITIES) {
    const [px, py] = project(lon, lat);
    const cx = Math.round(C + px * R) - 3;
    const cy = Math.round(C - py * R) - 4;
    for (let y = 0; y < FACE_CITY.h; y++)
      for (let x = 0; x < FACE_CITY.w; x++) {
        const col = FACE_CITY.px[y * FACE_CITY.w + x];
        if (col && kind[(cy + y) * T + cx + x]) setTex(cx + x, cy + y, col);
      }
  }

  // Scenery around the rim. Angles are clockwise from the top of the texture.
  const sc = Object.fromEntries(Object.entries(SCENERY).map(([k, v]) => [k, parseSprite(v)]));
  const deg = (d) => (d * Math.PI) / 180;
  stampRadial(sc.city, deg(38));
  stampRadial(sc.pines, deg(70));
  stampRadial(sc.trees, deg(112));
  stampRadial(sc.house, deg(150));
  stampRadial(sc.trees, deg(185));
  stampRadial(sc.city, deg(228));
  stampRadial(sc.trees, deg(262));
  stampRadial(sc.pines, deg(292));
  stampRadial(sc.city, deg(322));
  stampRadial(sc.house, deg(350));
}

const BAYER = [0, 2, 3, 1];

function bakeShade() {
  offsets = [];
  const list = [];
  const L = [-0.48, -0.62, 0.62];
  const ll = Math.hypot(...L);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const dx = x + 0.5 - C;
      const dy = y + 0.5 - C;
      const d = Math.hypot(dx, dy);
      if (d > R + RIM) continue;
      let s = 0;
      if (d <= R + 0.5 && d > R - 0.7) s = 4;
      else if (d <= R - 0.7) {
        const nx = dx / R;
        const ny = dy / R;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lit = (nx * L[0] + ny * L[1] + nz * L[2]) / ll;
        const b = BAYER[(y & 1) * 2 + (x & 1)] / 4;
        if (lit > 0.9 + b * 0.06) s = 1;
        else if (lit < 0.02 + b * 0.18) s = 3;
        else if (lit < 0.28 + b * 0.16) s = 2;
      }
      offsets.push(x, y);
      list.push(s);
    }
  }
  offsets = Int16Array.from(offsets);
  shade = Uint8Array.from(list);
}

export function initGlobe() {
  bakeTexture();
  bakeShade();
  canvas = document.createElement('canvas');
  canvas.width = T;
  canvas.height = T;
  gctx = canvas.getContext('2d');
  out = gctx.createImageData(T, T);
  out32 = new Uint32Array(out.data.buffer);
}

function lighten(c) {
  const r = c & 0xff;
  const g = (c >>> 8) & 0xff;
  const b = (c >>> 16) & 0xff;
  return (
    ((c & 0xff000000) |
      (Math.min(255, b + 28) << 16) |
      (Math.min(255, g + 26) << 8) |
      Math.min(255, r + 22)) >>>
    0
  );
}
function darken(c, k, blue) {
  const r = (c & 0xff) * k;
  const g = ((c >>> 8) & 0xff) * k;
  const b = Math.min(255, ((c >>> 16) & 0xff) * k + blue);
  return ((c & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * Draw the globe centred at (cx, cy), rotated by `angle` (radians; increasing
 * angle moves the surface at the top to the left).
 */
export function drawGlobe(ctx, cx, cy, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  out32.fill(0);
  const outline = PAL.outline;
  for (let k = 0, n = shade.length; k < n; k++) {
    const x = offsets[2 * k];
    const y = offsets[2 * k + 1];
    const s = shade[k];
    const o = y * T + x;
    if (s === 4) {
      out32[o] = outline;
      continue;
    }
    const dx = x + 0.5 - C;
    const dy = y + 0.5 - C;
    const sx = (C + dx * cos - dy * sin) | 0;
    const sy = (C + dx * sin + dy * cos) | 0;
    if (sx < 0 || sy < 0 || sx >= T || sy >= T) continue;
    const col = tex[sy * T + sx];
    if (!col) continue;
    out32[o] = s === 0 ? col : s === 1 ? lighten(col) : s === 2 ? darken(col, 0.78, 18) : darken(col, 0.58, 30);
  }
  gctx.putImageData(out, 0, 0);
  ctx.drawImage(canvas, Math.round(cx - C), Math.round(cy - C));
}

export const GLOBE_R = R;
