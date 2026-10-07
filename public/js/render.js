// Low-res pixel buffer, scaled up to the screen with nearest-neighbour sampling.
import { VIEW, GLOBE } from './config.js';

export const view = {
  W: VIEW.baseW,
  H: VIEW.baseH,
  scale: 1, // CSS pixels per virtual pixel
  offX: 0, // CSS pixels of letterbox on the left/top
  offY: 0,
  dpr: 1,
  globeX: 0,
  globeY: 0, // globe centre in virtual pixels
};

let screen; // visible canvas
let sctx;
export let buf; // virtual-resolution canvas everything draws into
export let ctx;
let scratch; // copy of buf for post effects
let scratchCtx;

const listeners = [];
export function onResize(fn) {
  listeners.push(fn);
}

export function initRender(canvas) {
  screen = canvas;
  sctx = screen.getContext('2d');
  buf = document.createElement('canvas');
  ctx = buf.getContext('2d');
  scratch = document.createElement('canvas');
  scratchCtx = scratch.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
}

function resize() {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  // Fit the base box, then extend the short side to fill the screen.
  const scale = Math.min(cssW / VIEW.baseW, cssH / VIEW.baseH);
  const W = Math.min(VIEW.maxW, Math.round(cssW / scale));
  const H = Math.min(VIEW.maxH, Math.round(cssH / scale));

  view.W = W;
  view.H = H;
  view.scale = scale;
  view.dpr = dpr;
  view.offX = Math.round((cssW - W * scale) / 2);
  view.offY = Math.round((cssH - H * scale) / 2);
  const top = Math.max(Math.round(H * GLOBE.topFrac), H - GLOBE.maxTopFromBottom);
  view.globeX = Math.round(W / 2);
  view.globeY = top + GLOBE.r;

  screen.width = Math.round(cssW * dpr);
  screen.height = Math.round(cssH * dpr);
  screen.style.width = cssW + 'px';
  screen.style.height = cssH + 'px';
  buf.width = W;
  buf.height = H;
  scratch.width = W;
  scratch.height = H;
  ctx.imageSmoothingEnabled = false;
  for (const fn of listeners) fn(view);
}

// Snapshot of the current frame, for effects that smear the image onto itself.
export function snapshot() {
  scratchCtx.clearRect(0, 0, view.W, view.H);
  scratchCtx.drawImage(buf, 0, 0);
  return scratch;
}

export function present(shakeX = 0, shakeY = 0) {
  const { dpr, scale, offX, offY, W, H } = view;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.fillStyle = '#0b0f2e';
  sctx.fillRect(0, 0, screen.width, screen.height);
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(
    buf,
    0,
    0,
    W,
    H,
    Math.round((offX + shakeX * scale) * dpr),
    Math.round((offY + shakeY * scale) * dpr),
    Math.round(W * scale * dpr),
    Math.round(H * scale * dpr),
  );
}

// CSS-pixel point -> virtual pixel point.
export function toVirtual(clientX, clientY) {
  return {
    x: (clientX - view.offX) / view.scale,
    y: (clientY - view.offY) / view.scale,
  };
}

// Virtual rect -> CSS-pixel rect (used to place the HTML nickname input).
export function toCss(x, y, w, h) {
  return {
    left: view.offX + x * view.scale,
    top: view.offY + y * view.scale,
    width: w * view.scale,
    height: h * view.scale,
  };
}
