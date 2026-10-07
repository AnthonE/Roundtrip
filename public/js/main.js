// Boot, main loop and global UI (mute button, pause on hide, debug hooks).
import { initRender, ctx, view, present } from './render.js';
import { initGlobe } from './globe.js';
import { bakeSprites, S } from './sprites.js';
import { bakeBackground } from './background.js';
import { initInput, drainInput, onGesture } from './input.js';
import { toggleMute, isMuted, unlockAudio } from './audio.js';
import { shakeOffset } from './fx.js';
import { PLAYER } from './config.js';
import { director } from './director.js';
import { title } from './scenes/title.js';
import { play } from './scenes/play.js';
import { nickname } from './scenes/nickname.js';

const STEP = 1 / 120;

const canvas = document.getElementById('game');
initRender(canvas);
bakeSprites();
initGlobe();
bakeBackground();
initInput(canvas);
onGesture(unlockAudio);

director.scenes = { title, play, nickname };

// Mute toggle in the top-right corner of every screen.
const MUTE = { w: 13, h: 11 };
function muteRect() {
  return { x: view.W - MUTE.w - 1, y: 1, w: MUTE.w, h: MUTE.h };
}
function hitMute(ev) {
  if (ev.viaKey) return false;
  const r = muteRect();
  return ev.x >= r.x - 2 && ev.x <= r.x + r.w + 2 && ev.y >= r.y - 2 && ev.y <= r.y + r.h + 2;
}

function dispatch(events) {
  const sc = director.scene;
  for (const ev of events) {
    if (ev.type === 'down') {
      if (hitMute(ev)) {
        unlockAudio();
        toggleMute();
        continue;
      }
      sc.onDown?.(ev);
    } else if (ev.type === 'up') sc.onUp?.(ev);
    else if (ev.type === 'key') {
      if (ev.code === 'KeyM') toggleMute();
      else sc.onKey?.(ev.code);
    }
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) director.scene?.onHidden?.();
});

let last = performance.now();
let acc = 0;
let time = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  dispatch(drainInput());
  acc += dt;
  while (acc >= STEP) {
    director.scene.update(STEP);
    acc -= STEP;
    time += STEP;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  director.scene.draw(ctx, time, dt);
  const r = muteRect();
  ctx.drawImage(isMuted() ? S.icons.soundOff : S.icons.soundOn, r.x + 3, r.y + 2);
  const [sx, sy] = shakeOffset();
  present(sx, sy);
  requestAnimationFrame(frame);
}

// --- start ------------------------------------------------------------------

const params = new URLSearchParams(location.search);
const debugScene = params.get('scene');
startDebug(debugScene);
requestAnimationFrame((t) => {
  last = t;
  requestAnimationFrame(frame);
});

// ?scene=title|play|grow|moon|roundtrip|nickname|board jumps straight to a screen
// (used for screenshots and testing). &level=N picks the level, &seed=N the RNG.
function startDebug(name) {
  const level = Math.max(1, parseInt(params.get('level') || '1', 10) || 1);
  const seed = params.has('seed') ? parseInt(params.get('seed'), 10) >>> 0 : undefined;
  switch (name) {
    case 'play':
    case 'grow':
    case 'moon':
    case 'roundtrip': {
      director.newRun();
      director.go('play', { level, seed });
      const w = play.world;
      if (name === 'grow') debugGrant(w, 2);
      if (name === 'moon') debugGrant(w, 5);
      if (name === 'roundtrip') w.forceRoundtrip();
      break;
    }
    case 'nickname':
    case 'levelup': {
      const run = director.newRun();
      run.banked = 1240;
      run.level = level + 1;
      director.go('nickname', { mode: 'levelup', level });
      break;
    }
    case 'final': {
      const run = director.newRun();
      run.banked = 860;
      director.go('nickname', { mode: 'final', level });
      break;
    }
    case 'board':
      director.go('nickname', { mode: 'board' });
      break;
    default:
      director.go('title');
  }
}

// Drop self-care items right on her so the normal pickup path runs.
function debugGrant(w, n) {
  const p = w.player;
  for (let i = 0; i < n; i++) {
    w.pickups.push({ type: 'item', kind: ['milk', 'gummy', 'sun'][i % 3], phi: w.G + p.theta, h: 12, scale: 1, seed: i });
  }
}

window.__rt = { director, play, debugGrant, view, PLAYER };
