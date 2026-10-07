// Music: the "roundtrip" track from public/audio/. Sound effects are synthesised
// with WebAudio so the game needs no other sound files.

const MUSIC_SRC = 'audio/roundtrip.mp3';
const MUSIC_VOLUME = 0.55;

let actx = null;
let master = null;
let music = null;
let musicOk = true;
let wantMusic = false;
let primed = false;
let tapeStopTimer = null;

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
  music.volume = muted ? 0 : MUSIC_VOLUME;
  music.preservesPitch = false; // so the tape-stop drops in pitch
  music.mozPreservesPitch = false;
  music.webkitPreservesPitch = false;
  music.addEventListener('error', () => {
    musicOk = false;
    music = null;
  });
  return music;
}

// Must be called from inside a user gesture (see input.js onGesture).
export function unlockAudio() {
  const c = ensureContext();
  if (c && c.state === 'suspended') c.resume();
  const m = ensureMusic();
  if (m && !primed) {
    // Play muted once so later play() calls outside a gesture are allowed (iOS).
    primed = true;
    if (!wantMusic) m.muted = true;
    m.play()
      .then(() => {
        if (!wantMusic) m.pause();
        m.muted = false;
      })
      .catch(() => {
        m.muted = false;
      });
  }
}

export function playMusic() {
  wantMusic = true;
  clearInterval(tapeStopTimer);
  const m = ensureMusic();
  if (!m) return;
  m.playbackRate = 1;
  m.muted = false;
  m.volume = muted ? 0 : MUSIC_VOLUME;
  m.play().catch(() => {});
}

export function pauseMusic() {
  music?.pause();
}

export function resumeMusic() {
  if (wantMusic) music?.play().catch(() => {});
}

// Slow the song down and stop it, like pulling the plug on a tape deck.
export function tapeStop(duration = 0.9) {
  wantMusic = false;
  const m = music;
  if (!m || m.paused) return;
  clearInterval(tapeStopTimer);
  const start = performance.now();
  tapeStopTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - start) / (duration * 1000));
    try {
      m.playbackRate = Math.max(0.25, 1 - 0.75 * k);
    } catch {}
    m.volume = muted ? 0 : MUSIC_VOLUME * (1 - k);
    if (k >= 1) {
      clearInterval(tapeStopTimer);
      m.pause();
      m.playbackRate = 1;
    }
  }, 30);
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem('rt:muted', muted ? '1' : '0');
  } catch {}
  if (master) master.gain.value = muted ? 0 : 0.5;
  if (music) music.volume = muted ? 0 : MUSIC_VOLUME;
  return muted;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    music?.pause();
    actx?.suspend?.();
  } else {
    actx?.resume?.();
    resumeMusic();
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

export const sfx = {
  coin(mult = 1) {
    const base = 988 * 2 ** ((Math.min(mult, 5) - 1) / 12);
    tone(base, 0.06, { vol: 0.12 });
    tone(base * 1.335, 0.14, { vol: 0.12, delay: 0.055 });
  },
  jump(high = false) {
    tone(high ? 300 : 360, 0.16, { type: 'square', vol: 0.08, slide: high ? 760 : 620 });
  },
  item() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12, { vol: 0.1, delay: i * 0.055 }));
  },
  lag() {
    noise(0.18, { vol: 0.16, freq: 2400 });
    tone(220, 0.2, { type: 'sawtooth', vol: 0.07, slide: 90 });
  },
  hit() {
    noise(0.25, { vol: 0.22, freq: 900 });
    tone(160, 0.3, { type: 'sawtooth', vol: 0.1, slide: 50 });
  },
  danger() {
    tone(880, 0.05, { type: 'square', vol: 0.04 });
  },
  roundtrip() {
    noise(0.7, { vol: 0.22, freq: 1400, q: 0.4 });
    tone(440, 0.9, { type: 'sawtooth', vol: 0.09, slide: 55 });
    tone(466, 0.9, { type: 'square', vol: 0.05, slide: 58, delay: 0.05 });
  },
  moonReady() {
    [784, 988, 1175].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.12, delay: i * 0.09 }));
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
  click() {
    tone(660, 0.05, { vol: 0.08 });
  },
};
