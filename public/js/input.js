// One-button input: tap/click/Space to jump, hold for a higher jump.
// Pointer positions are delivered in virtual pixels so scenes can hit-test buttons.
import { toVirtual } from './render.js';

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyX']);

export const input = {
  held: false,
  queue: [], // { type: 'down'|'up'|'key', x, y, code, viaKey }
};

let pointerId = null;
let gestureHook = () => {};

// Runs synchronously inside the browser's own event handler (with tap = true for
// pointers). iOS only lets audio start from there, not from our next animation frame.
export function onGesture(fn) {
  gestureHook = fn;
}

export function initInput(canvas) {
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    gestureHook(true);
    canvas.setPointerCapture?.(e.pointerId);
    const p = toVirtual(e.clientX, e.clientY);
    input.held = true;
    input.queue.push({ type: 'down', x: p.x, y: p.y });
  });
  const up = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    input.held = false;
    const p = toVirtual(e.clientX, e.clientY);
    input.queue.push({ type: 'up', x: p.x, y: p.y });
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    gestureHook(false);
    if (JUMP_KEYS.has(e.code)) {
      e.preventDefault();
      if (e.repeat) return;
      input.held = true;
      input.queue.push({ type: 'down', viaKey: true, x: -1, y: -1 });
      return;
    }
    if (!e.repeat) input.queue.push({ type: 'key', code: e.code });
  });
  window.addEventListener('keyup', (e) => {
    if (JUMP_KEYS.has(e.code)) {
      input.held = pointerId !== null;
      input.queue.push({ type: 'up', viaKey: true, x: -1, y: -1 });
    }
  });
  window.addEventListener('blur', () => {
    pointerId = null;
    input.held = false;
  });
}

export function drainInput() {
  const q = input.queue;
  input.queue = [];
  return q;
}
