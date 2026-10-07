// Client-side feel and layout tuning. Scoring and level rules live in rules.js.

export const VIEW = {
  baseW: 200, // the view is at least this wide (in virtual pixels)...
  baseH: 240, // ...and at least this tall; the rest follows the screen's aspect
  maxW: 460,
  maxH: 460,
};

export const GLOBE = {
  r: 80, // radius in virtual pixels; the same in every screen
  topFrac: 0.58, // the globe's top sits at this fraction of the view height
  maxTopFromBottom: 190, // ...but never further than this from the bottom on tall phones
};

export const PLAYER = {
  // On the ground she runs a little faster than the spin and works back to the top.
  recover: 0.32, // rad/s at level 1
  // In the air she isn't running, so the spin drags her backward. Kept well under
  // the spin itself so coins still sweep toward her mid-jump.
  airDrift: 0.16, // rad/s at level 1
  resiliencePerItem: 0.11, // each self-care item cuts air drift by this fraction
  edge: 1.05, // rad behind the top where she loses her footing
  danger: 0.7, // rad behind the top where the warning starts

  jumpV: 178, // px/s
  gravityHeld: 380, // px/s² while rising with the button held
  gravity: 820, // px/s² otherwise
  releaseCut: 0.5, // vertical speed kept when the button is released early

  growStep: 0.25, // scale gained per self-care item
  lagKnock: 0.15, // rad pushed back by an empty jump
  candleKnock: 0.25, // rad pushed back by a red candle
  invulnerable: 0.9, // s of grace after a hit

  bodyW: 10, // hitbox at scale 1
  bodyH: 24,
};

export const SPAWN = {
  at: 1.32, // screen angle (rad right of top) where pickups appear
  despawn: -1.75,
  heights: { ground: 12, hop: 36, high: 58 }, // coin centre above the surface, scale 1
  candleLevel: 2, // red candles appear from this level
};

export const FX = {
  hitStop: 0.07,
  growTime: 0.4,
};

export const COLORS = {
  ink: '#140f2e',
  sky: '#18205a',
  skyHi: '#1f2a6e',
  grid: '#26347c',
  white: '#ffffff',
  cream: '#fff6d8',
  pink: '#ff6fb5',
  hotPink: '#ff3d9a',
  lavender: '#b9a7ff',
  purple: '#9b5cff',
  neonGreen: '#39ff88',
  neonPurple: '#b34dff',
  yellow: '#ffe14d',
  gold: '#ffc61a',
  cyan: '#57e3ff',
  red: '#ff3b4f',
  dim: '#8a93c9',
};
