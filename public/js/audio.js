// Music: the "roundtrip" track from public/audio/. Sound effects are synthesised
// with WebAudio so the game needs no other sound files.

const MUSIC_SRC = 'audio/roundtrip.mp3';
const MUSIC_VOLUME = 0.55;

let actx = null;
let master = null;
let music = null;
let musicOk = true;
let wantMusic = false; // the game wants the song playing right now
let primed = false;
let tapeStopTimer = null;
let hiccupTimer = null;
let hiccuping = false;
let muffleK = 0;

// When the song is routed through WebAudio we can muffle it (slipping, pause)
// and make it hiccup (lag). Gain also makes mute work on iOS, where
// HTMLMediaElement.volume is read-only.
let routed = false;
let musicGain = null;
let musicFilter = null;
let musicLevel = MUSIC_VOLUME;

let muted = false;
try {
  muted = localStorage.getItem('rt:muted') === '1';
} catch {}

export const isMuted = () => muted;
export const musicElement = () => music; // for tests and debugging

function ensureContext() {
  if (actx) return actx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(actx.destination);
  return actx;
}

function ensureMusic() {
  if (music || !musicOk) return music;
  music = new Audio();
  music.src = MUSIC_SRC;
  music.loop = true;
  music.preload = 'auto';
  music.preservesPitch = false; // so the tape-stop drops in pitch
  music.mozPreservesPitch = false;
  music.webkitPreservesPitch = false;
  music.addEventListener('error', () => {
    musicOk = false;
    music = null;
  });
  applyLevel();
  return music;
}

function routeMusic() {
  if (routed || !actx || !music) return;
  try {
    const src = actx.createMediaElementSource(music);
    musicFilter = actx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 22000;
    musicFilter.Q.value = 0.8;
    musicGain = actx.createGain();
    src.connect(musicFilter).connect(musicGain).connect(actx.destination);
    routed = true;
    music.volume = 1;
  } catch {
    routed = false;
  }
  applyLevel();
}

function applyLevel(level = musicLevel) {
  musicLevel = level;
  const out = muted ? 0 : level;
  if (routed) musicGain.gain.setTargetAtTime(out, actx.currentTime, 0.015);
  else if (music) {
    music.volume = out;
    music.muted = muted; // iOS ignores volume, but honours muted
  }
}

// Must be called from inside a user gesture (see input.js onGesture).
export function unlockAudio() {
  const c = ensureContext();
  if (c && c.state === 'suspended') c.resume();
  const m = ensureMusic();
  routeMusic();
  if (m && !primed) {
    // Play muted once so later play() calls outside a gesture are allowed (iOS).
    primed = true;
    if (!wantMusic) m.muted = true;
    const done = () => {
      if (!wantMusic) m.pause();
      m.muted = !routed && muted;
    };
    m.play().then(done, done);
  }
}

export function playMusic() {
  wantMusic = true;
  clearInterval(tapeStopTimer);
  const m = ensureMusic();
  if (!m) return;
  m.playbackRate = 1;
  m.muted = !routed && muted;
  applyLevel(MUSIC_VOLUME);
  setMuffle(0);
  m.play().catch(() => {});
}

export function pauseMusic() {
  wantMusic = false;
  music?.pause();
}

export function resumeMusic() {
  wantMusic = true;
  music?.play().catch(() => {});
}

// 0 = clear, 1 = heavily muffled (as if underwater). Cheap to call every frame.
export function setMuffle(k) {
  k = Math.max(0, Math.min(1, k));
  if (Math.abs(k - muffleK) < 0.02 && (k > 0 || muffleK === 0)) return;
  muffleK = k;
  applyMuffle();
}

function applyMuffle() {
  if (!routed || hiccuping) return;
  musicFilter.frequency.setTargetAtTime(22000 * Math.pow(0.035, muffleK), actx.currentTime, 0.08);
}

// A short stumble in the song: dip, slow, recover.
export function musicHiccup() {
  const m = music;
  if (!m || m.paused || !wantMusic) return;
  clearTimeout(hiccupTimer);
  hiccuping = true;
  try {
    m.playbackRate = 0.84;
  } catch {}
  if (routed) {
    musicGain.gain.setTargetAtTime(muted ? 0 : musicLevel * 0.35, actx.currentTime, 0.01);
    musicFilter.frequency.setTargetAtTime(1200, actx.currentTime, 0.01);
  }
  hiccupTimer = setTimeout(() => {
    hiccuping = false;
    if (!wantMusic) return;
    try {
      m.playbackRate = 1;
    } catch {}
    applyLevel();
    applyMuffle();
  }, 140);
}

// Slow the song down and stop it, like pulling the plug on a tape deck.
export function tapeStop(duration = 0.9) {
  wantMusic = false;
  clearTimeout(hiccupTimer);
  hiccuping = false;
  const m = music;
  if (!m || m.paused) return;
  clearInterval(tapeStopTimer);
  const start = performance.now();
  tapeStopTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - start) / (duration * 1000));
    try {
      m.playbackRate = Math.max(0.25, 1 - 0.75 * k);
    } catch {}
    applyLevel(MUSIC_VOLUME * (1 - k));
    if (k >= 1) {
      clearInterval(tapeStopTimer);
      m.pause();
      m.playbackRate = 1;
      setMuffle(0);
    }
  }, 30);
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('rt:muted', muted ? '1' : '0');
  } catch {}
  if (master) master.gain.value = muted ? 0 : 0.5;
  applyLevel();
  return muted;
}

// Phone buzz (Android; iOS has no vibration API). Off when muted, and only
// after a real tap: browsers refuse vibration before one.
let tapped = false;
export function enableHaptics() {
  tapped = true;
}

export function haptic(pattern) {
  if (muted || !tapped || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    music?.pause();
    actx?.suspend?.();
  } else {
    actx?.resume?.();
    if (wantMusic) music?.play().catch(() => {});
  }
});

// --- synth ----------------------------------------------------------------

function tone(freq, dur, { type = 'square', vol = 0.18, slide = null, delay = 0 } = {}) {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

let noiseBuf = null;
function noise(dur, { vol = 0.2, freq = 1800, delay = 0, q = 0.8 } = {}) {
  if (!actx || muted) return;
  if (!noiseBuf) {
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = actx.currentTime + delay;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  const f = actx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = actx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const seq = (notes, step, opts) => notes.forEach((f, i) => f && tone(f, opts.dur ?? step * 1.4, { ...opts, delay: i * step }));

export const sfx = {
  // Coins climb in pitch with the multiplier, and again for each coin in one jump.
  coin(mult = 1, combo = 0) {
    const base = 988 * 2 ** ((Math.min(mult, 5) - 1 + Math.min(combo, 8) * 2) / 12);
    tone(base, 0.06, { vol: 0.12 });
    tone(base * 1.335, 0.14, { vol: 0.12, delay: 0.055 });
  },
  jump() {
    tone(360, 0.12, { type: 'square', vol: 0.07, slide: 640 });
  },
  highJump() {
    tone(520, 0.2, { type: 'triangle', vol: 0.09, slide: 1250 });
    noise(0.14, { vol: 0.05, freq: 5000, q: 0.5 });
  },
  land() {
    tone(150, 0.07, { type: 'triangle', vol: 0.09, slide: 70 });
    noise(0.05, { vol: 0.05, freq: 500 });
  },
  multUp(mult) {
    const f = 1047 * 2 ** ((mult - 2) * 2 / 12);
    tone(f, 0.07, { type: 'square', vol: 0.06 });
    tone(f * 1.5, 0.1, { type: 'square', vol: 0.06, delay: 0.06 });
  },
  maxMult() {
    seq([1319, 1568, 2093, 2637], 0.05, { type: 'square', vol: 0.06, dur: 0.09 });
  },
  item() {
    seq([523, 659, 784, 1047, 1319], 0.055, { vol: 0.1, dur: 0.12 });
  },
  lag() {
    noise(0.18, { vol: 0.16, freq: 2400 });
    tone(220, 0.2, { type: 'sawtooth', vol: 0.07, slide: 90 });
  },
  hit() {
    noise(0.25, { vol: 0.22, freq: 900 });
    tone(160, 0.3, { type: 'sawtooth', vol: 0.1, slide: 50 });
  },
  dodge() {
    noise(0.09, { vol: 0.08, freq: 4200, q: 1.2 });
    tone(880, 0.06, { type: 'triangle', vol: 0.05, slide: 1320, delay: 0.03 });
  },
  danger(depth = 0) {
    tone(700 + depth * 400, 0.05, { type: 'square', vol: 0.04 });
  },
  ready() {
    seq([523, 659, 784, 1047], 0.08, { type: 'triangle', vol: 0.09, dur: 0.12 });
  },
  roundtrip() {
    noise(0.7, { vol: 0.22, freq: 1400, q: 0.4 });
    tone(440, 0.9, { type: 'sawtooth', vol: 0.09, slide: 55 });
    tone(466, 0.9, { type: 'square', vol: 0.05, slide: 58, delay: 0.05 });
  },
  drop() {
    tone(1100, 1.0, { type: 'sine', vol: 0.08, slide: 140 });
  },
  sad() {
    seq([466, 440, 415], 0.22, { type: 'triangle', vol: 0.1, dur: 0.2 });
    tone(392, 0.7, { type: 'triangle', vol: 0.1, slide: 370, delay: 0.66 });
  },
  moonReady() {
    seq([784, 988, 1175], 0.09, { type: 'triangle', vol: 0.12, dur: 0.18 });
  },
  leap() {
    tone(260, 0.6, { type: 'triangle', vol: 0.12, slide: 1400 });
  },
  moon() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
      tone(f, 0.16, { type: i % 2 ? 'triangle' : 'square', vol: 0.09, delay: i * 0.09 }),
    );
  },
  bank() {
    tone(1568, 0.04, { vol: 0.05 });
  },
  kaching() {
    noise(0.08, { vol: 0.1, freq: 6000, q: 0.7 });
    tone(2093, 0.25, { type: 'square', vol: 0.06, delay: 0.04 });
    tone(2637, 0.4, { type: 'square', vol: 0.06, delay: 0.1 });
  },
  rank(first = false) {
    if (first) seq([523, 659, 784, 1047, 0, 784, 1047, 1319, 1568], 0.08, { type: 'square', vol: 0.07, dur: 0.12 });
    else seq([784, 988, 1175, 1568], 0.07, { type: 'triangle', vol: 0.1, dur: 0.12 });
  },
  click() {
    tone(660, 0.05, { vol: 0.08 });
  },
};
