// Gameplay world: the spinning globe, the girl, coins, self-care and red candles.
//
// Angles are radians measured clockwise from the top of the globe. The globe's
// rotation G grows over time; something fixed to the globe at angle phi shows
// on screen at phi - G, so pickups come over the right horizon and slide left.
import { PLAYER, SPAWN, GLOBE, FX } from './config.js';
import {
  ITEMS_PER_LEVEL,
  COIN_VALUE,
  MAX_MULT,
  ITEM_VALUE,
  LEVEL_BONUS,
  BASE_SPIN,
  ITEM_FIRST_DELAY,
  ITEM_INTERVAL_MIN,
  ITEM_INTERVAL_MAX,
  PATTERN_GAP_MIN,
  spinFor,
} from './rules.js';
import { S, ITEM_KINDS, GIRL_ANCHOR } from './sprites.js';
import { drawGlobe } from './globe.js';
import { view } from './render.js';

const R = GLOBE.r;
const ROT_STEP = Math.PI / 24; // the girl's tilt snaps to 7.5° steps to stay crisp

export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// scale: a number, or [sx, sy] for squash and stretch.
export function drawSprite(ctx, img, x, y, angle = 0, scale = 1, ax = img.width / 2, ay = img.height / 2) {
  const [sx, sy] = Array.isArray(scale) ? scale : [scale, scale];
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (angle) ctx.rotate(angle);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.drawImage(img, -ax, -ay);
  ctx.restore();
}

const ease = (k) => 1 - (1 - k) * (1 - k);

export function moonPos() {
  return { x: view.W - 30, y: 48, r: 16 };
}

export class World {
  constructor({ level = 1, seed = (Math.random() * 2 ** 32) >>> 0, onEvent = () => {} } = {}) {
    this.level = level;
    this.spin = spinFor(level);
    this.pace = Math.sqrt(this.spin / BASE_SPIN);
    this.rand = makeRng(seed);
    this.emit = onEvent;

    this.G = 0;
    this.t = 0;
    this.spinMult = 1;
    this.phase = 'play'; // play | dying | gone | leap | landed

    this.player = {
      theta: 0,
      h: 0,
      vy: 0,
      air: false,
      holding: false,
      scale: 1,
      fromScale: 1,
      growT: 0,
      runT: 0,
      streak: 0,
      airGot: 0,
      airCleared: 0,
      invuln: 0,
      buffer: 0,
      dangerT: 0,
      airT: 0,
      highCue: false,
      sqx: 1, // squash and stretch, eased back to 1
      sqy: 1,
    };

    this.pickups = [];
    this.candles = [];
    this.items = 0;
    this.itemKinds = [];
    this.coins = 0;
    this.levelScore = 0;
    this.itemTimer = ITEM_FIRST_DELAY;
    this.moonReady = false;
    this.moonRise = 0;

    // Fill the visible arc so the level doesn't start empty.
    this.nextPhi = 0.55;
    while (this.nextPhi < SPAWN.at) this.spawnPattern();
  }

  get mult() {
    return Math.min(MAX_MULT, 1 + this.player.streak);
  }

  get unrealized() {
    return this.levelScore;
  }

  bankValue() {
    return this.levelScore + LEVEL_BONUS * this.level;
  }

  // ---- positions ----------------------------------------------------------

  pos(angle, radius) {
    return {
      x: view.globeX + radius * Math.sin(angle),
      y: view.globeY - radius * Math.cos(angle),
    };
  }

  displayScale() {
    const p = this.player;
    if (p.growT > 0) return Math.floor(p.growT * 18) % 2 ? p.fromScale : p.scale;
    return p.scale;
  }

  playerCenter() {
    const p = this.player;
    return this.pos(p.theta, R + p.h + (PLAYER.bodyH * p.scale) / 2);
  }

  // ---- spawning -----------------------------------------------------------

  spawnPattern() {
    const s = this.player.scale;
    const H = SPAWN.heights;
    const sp = 11 * s;
    const r = this.rand();
    let coins;
    if (r < 0.16) coins = [[0, H.ground], [sp, H.ground], [2 * sp, H.ground]];
    else if (r < 0.4) {
      const n = 1 + Math.floor(this.rand() * 3);
      coins = Array.from({ length: n }, (_, i) => [i * sp, H.hop]);
    } else if (r < 0.58) {
      const n = 1 + Math.floor(this.rand() * 2);
      coins = Array.from({ length: n }, (_, i) => [i * sp, H.high]);
    } else if (r < 0.8) {
      coins = [
        [0, H.hop - 8],
        [sp, H.hop + 8],
        [2 * sp, H.high],
        [3 * sp, H.hop + 8],
        [4 * sp, H.hop - 8],
      ];
    } else {
      coins = [[0, H.ground + 8], [sp * 1.2, H.hop], [sp * 2.4, H.high]];
    }
    const phi = this.nextPhi;
    let width = 0;
    for (const [dx, h] of coins) {
      const hh = h * s;
      const a = phi + dx / (R + hh);
      width = Math.max(width, a - phi);
      this.pickups.push({ type: 'coin', phi: a, h: hh, scale: s, seed: this.rand() * 4 });
    }
    const gap = PATTERN_GAP_MIN + this.rand() * 0.28;
    // Red candles sit in some of the gaps from level 2.
    if (this.level >= SPAWN.candleLevel && this.rand() < Math.min(0.65, 0.3 + 0.08 * (this.level - SPAWN.candleLevel))) {
      this.candles.push({ phi: phi + width + gap * 0.55, h: 10 + Math.floor(this.rand() * 6), prev: null });
    }
    this.nextPhi = phi + width + gap;
  }

  spawnItem() {
    const s = this.player.scale;
    const phi = Math.max(this.G + SPAWN.at, this.nextPhi);
    const r = this.rand();
    const tier = r < 0.25 ? 'ground' : r < 0.7 ? 'hop' : 'high';
    const kind = ITEM_KINDS[Math.floor(this.rand() * ITEM_KINDS.length)];
    this.pickups.push({ type: 'item', kind, phi, h: SPAWN.heights[tier] * s, scale: s, seed: this.rand() * 6 });
    this.candles = this.candles.filter((c) => Math.abs(c.phi - phi) > 0.12);
    this.nextPhi = phi + 0.3;
  }

  // ---- update -------------------------------------------------------------

  update(dt, ctl) {
    this.t += dt;
    this.G += this.spin * this.spinMult * dt;
    if (this.phase === 'dying' || this.phase === 'gone') return this.updateDying(dt);
    if (this.phase === 'leap' || this.phase === 'landed') return this.updateLeap(dt);

    const p = this.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.growT = Math.max(0, p.growT - dt);
    const ease = Math.min(1, dt * 14);
    p.sqx += (1 - p.sqx) * ease;
    p.sqy += (1 - p.sqy) * ease;
    p.buffer = Math.max(0, p.buffer - dt);
    if (ctl.pressed) p.buffer = 0.12;
    if (this.moonReady) this.moonRise = Math.min(1, this.moonRise + dt / 1.2);

    // jump (or leap)
    if (!p.air && p.buffer > 0) {
      p.buffer = 0;
      if (this.moonReady && this.moonRise > 0.5) {
        this.startLeap();
        return;
      }
      p.air = true;
      p.vy = PLAYER.jumpV * p.scale;
      p.holding = ctl.held;
      p.airGot = 0;
      p.airCleared = 0;
      p.airT = 0;
      p.highCue = false;
      p.sqx = 0.8;
      p.sqy = 1.25;
      this.emit('jump', { ...this.pos(p.theta, R), theta: p.theta });
    }

    if (p.air) {
      p.airT += dt;
      if (p.holding && !p.highCue && p.airT > 0.16) {
        p.highCue = true; // still holding: this is a high jump
        this.emit('highJump', this.pos(p.theta, R + p.h));
      }
      if (p.holding && !ctl.held) {
        p.holding = false;
        if (p.vy > 0) p.vy *= PLAYER.releaseCut;
      }
      const g = (p.holding && p.vy > 0 ? PLAYER.gravityHeld : PLAYER.gravity) * p.scale;
      p.vy -= g * dt;
      p.h += p.vy * dt;
      const resilience = 1 - PLAYER.resiliencePerItem * this.items;
      p.theta -= PLAYER.airDrift * this.pace * resilience * dt;
      if (p.h <= 0) this.land();
    } else {
      p.theta = Math.min(0, p.theta + PLAYER.recover * this.pace * dt);
      p.runT += dt * (9 + 3 * this.pace);
    }

    // slipping
    if (!p.air && p.theta < -PLAYER.edge) {
      this.startDying();
      return;
    }
    if (p.theta < -PLAYER.danger) {
      // beeps speed up like a heartbeat the closer she gets to the edge
      const depth = this.dangerDepth();
      p.dangerT += dt;
      if (p.dangerT > 0.45 - 0.3 * depth) {
        p.dangerT = 0;
        this.emit('danger', { depth });
      }
    } else p.dangerT = 0;

    // spawns
    while (this.G + SPAWN.at >= this.nextPhi) this.spawnPattern();
    if (!this.moonReady) {
      this.itemTimer -= dt;
      const pending = this.pickups.filter((k) => k.type === 'item').length;
      if (this.itemTimer <= 0 && this.items + pending < ITEMS_PER_LEVEL) {
        this.spawnItem();
        this.itemTimer = ITEM_INTERVAL_MIN + this.rand() * (ITEM_INTERVAL_MAX - ITEM_INTERVAL_MIN);
      }
    }

    this.collide();
  }

  // 0 at the warning line, 1 at the edge.
  dangerDepth() {
    const d = (-this.player.theta - PLAYER.danger) / (PLAYER.edge - PLAYER.danger);
    return Math.max(0, Math.min(1, d));
  }

  land() {
    const p = this.player;
    p.air = false;
    p.h = 0;
    p.vy = 0;
    p.holding = false;
    p.sqx = 1.3;
    p.sqy = 0.75;
    this.emit('touchdown', { ...this.pos(p.theta, R), theta: p.theta, high: p.highCue });
    if (p.airGot === 0 && p.airCleared === 0) {
      // An empty jump is a bad trade: lag spike.
      p.theta -= PLAYER.lagKnock;
      p.streak = 0;
      this.emit('lag', this.playerCenter());
    } else {
      const before = this.mult;
      p.streak++;
      this.emit('land', { streak: p.streak, mult: this.mult, multUp: this.mult > before });
    }
  }

  collide() {
    const p = this.player;
    const bw = (PLAYER.bodyW * p.scale) / 2;
    const bh = (PLAYER.bodyH * p.scale) / 2;
    const bodyMid = p.h + bh;

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      const a = k.phi - this.G;
      if (a < SPAWN.despawn) {
        this.pickups.splice(i, 1);
        continue;
      }
      const pr = (k.type === 'coin' ? 4 : 5) * k.scale;
      const arc = (a - p.theta) * (R + k.h);
      const rad = k.h - bodyMid;
      if (Math.abs(arc) < bw + pr && Math.abs(rad) < bh + pr) {
        this.pickups.splice(i, 1);
        const at = this.pos(a, R + k.h);
        if (p.air) p.airGot++;
        if (k.type === 'coin') {
          const value = COIN_VALUE * this.mult;
          this.coins++;
          this.levelScore += value;
          this.emit('coin', { ...at, value, mult: this.mult, combo: p.air ? p.airGot - 1 : 0 });
        } else {
          this.items++;
          this.itemKinds.push(k.kind);
          this.levelScore += ITEM_VALUE;
          p.fromScale = p.scale;
          p.scale = 1 + PLAYER.growStep * this.items;
          p.growT = FX.growTime;
          this.emit('item', { ...at, kind: k.kind, items: this.items });
          if (this.items >= ITEMS_PER_LEVEL) {
            this.moonReady = true;
            this.pickups = this.pickups.filter((q) => q.type !== 'item');
            this.emit('moonReady', {});
          }
        }
      }
    }

    for (let i = this.candles.length - 1; i >= 0; i--) {
      const c = this.candles[i];
      const a = c.phi - this.G;
      if (a < SPAWN.despawn) {
        this.candles.splice(i, 1);
        continue;
      }
      const rel = a - p.theta;
      const arc = rel * R;
      if (p.invuln <= 0 && Math.abs(arc) < bw + 2 && p.h < c.h - 1) {
        this.candles.splice(i, 1);
        p.theta -= PLAYER.candleKnock;
        p.streak = 0;
        p.invuln = PLAYER.invulnerable;
        this.emit('hit', this.pos(a, R + c.h / 2));
        continue;
      }
      if (c.prev !== null && c.prev > 0 && rel <= 0 && p.air && p.h >= c.h - 1) {
        p.airCleared++;
        this.emit('cleared', this.pos(a, R + c.h + 4));
      }
      c.prev = rel;
    }
  }

  // ---- roundtrip ----------------------------------------------------------

  startDying() {
    const p = this.player;
    this.phase = 'dying';
    this.dying = { t: 0, stage: 'glitch', rot: 0, attach: null, x: 0, y: 0, vx: 0, vy: 0, h0: p.h };
    this.emit('roundtrip', this.playerCenter());
  }

  forceRoundtrip() {
    if (this.phase === 'play') this.startDying();
  }

  updateDying(dt) {
    const d = this.dying;
    const p = this.player;
    if (this.phase === 'gone') {
      this.spinMult = Math.max(1, this.spinMult - dt * 2);
      return;
    }
    d.t += dt;
    if (d.stage === 'glitch') {
      this.spinMult = 0.25;
      if (d.t > 0.7) {
        d.stage = 'fall';
        d.t = 0;
      }
    } else if (d.stage === 'fall') {
      this.spinMult = 0.6;
      const k = Math.min(1, d.t / 0.35);
      d.rot = -Math.PI / 2 * ease(k);
      p.h = Math.max(0, d.h0 * (1 - k));
      if (k >= 1) {
        d.stage = 'carried';
        d.t = 0;
        d.attach = this.G + p.theta;
      }
    } else if (d.stage === 'carried') {
      this.spinMult = Math.min(3.2, this.spinMult + dt * 3);
      p.theta = d.attach - this.G;
      if (p.theta < -1.62) {
        d.stage = 'void';
        d.t = 0;
        const at = this.pos(p.theta, R + 3);
        d.x = at.x;
        d.y = at.y;
        d.vx = -24;
        d.vy = -10;
        this.emit('drop', at);
      }
    } else if (d.stage === 'void') {
      this.spinMult = Math.max(1, this.spinMult - dt * 2);
      d.vy += 260 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot -= dt * 2.2;
      if (d.t > 1.2) {
        this.phase = 'gone';
        this.emit('gone', {});
      }
    }
  }

  // ---- moon ---------------------------------------------------------------

  startLeap() {
    const p = this.player;
    const from = this.pos(p.theta, R);
    const m = moonPos();
    this.phase = 'leap';
    this.leap = {
      t: 0,
      dur: 1.35,
      from,
      to: { x: m.x, y: m.y - m.r + 2 },
      scale0: p.scale,
      trail: 0,
    };
    this.pickups = [];
    this.emit('leap', from);
  }

  updateLeap(dt) {
    const l = this.leap;
    this.moonRise = 1;
    l.t += dt;
    if (this.phase === 'leap' && l.t >= l.dur) {
      this.phase = 'landed';
      this.emit('moon', l.to);
    }
  }

  leapPoint() {
    const l = this.leap;
    const k = Math.min(1, l.t / l.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const cx = l.from.x + (l.to.x - l.from.x) * 0.35;
    const cy = l.to.y - 24;
    const u = 1 - e;
    return {
      x: u * u * l.from.x + 2 * u * e * cx + e * e * l.to.x,
      y: u * u * l.from.y + 2 * u * e * cy + e * e * l.to.y,
      k,
    };
  }

  // ---- drawing ------------------------------------------------------------

  draw(ctx, t, opts = {}) {
    this.drawMoon(ctx, t);
    drawGlobe(ctx, view.globeX, view.globeY, this.G);

    for (const c of this.candles) {
      const a = c.phi - this.G;
      if (a > 1.9 || a < -1.9) continue;
      const at = this.pos(a, R - 1);
      drawSprite(ctx, S.candle, at.x, at.y, Math.round(a / ROT_STEP) * ROT_STEP, 1, 2.5, S.candle.height);
    }

    for (const k of this.pickups) {
      const a = k.phi - this.G;
      if (a > 1.9) continue;
      const at = this.pos(a, R + k.h);
      if (k.type === 'coin') {
        const f = Math.floor(t * 8 + k.seed) % 4;
        drawSprite(ctx, S.coin[f], at.x, at.y, 0, k.scale);
      } else {
        const bob = Math.sin(t * 4 + k.seed) * 1.5;
        const flash = Math.floor(t * 6 + k.seed) % 9 === 0;
        drawSprite(ctx, flash ? S.itemsWhite[k.kind] : S.items[k.kind], at.x, at.y + bob, 0, k.scale);
      }
    }

    this.drawPlayer(ctx, t, opts);
  }

  drawMoon(ctx, t) {
    if (this.moonRise <= 0) return;
    const m = moonPos();
    const k = ease(this.moonRise);
    const y = m.y + (1 - k) * 40;
    if (this.moonRise < 1 && Math.floor(t * 20) % 2) return;
    // dithered halo
    ctx.fillStyle = '#fff3c4';
    const hr = m.r + 5 + Math.round(Math.sin(t * 3));
    for (let a = 0; a < 64; a++) {
      if (a % 2) continue;
      const ang = (a / 64) * Math.PI * 2;
      ctx.fillRect(Math.round(m.x + Math.cos(ang) * hr), Math.round(y + Math.sin(ang) * hr), 1, 1);
    }
    drawSprite(ctx, S.moon, m.x, y, 0, 2);
  }

  girlFrame() {
    const p = this.player;
    if (p.air) return 'jump';
    return ['run0', 'run1', 'run2', 'run3'][Math.floor(p.runT) % 4];
  }

  drawPlayer(ctx, t, opts) {
    const p = this.player;
    if (this.phase === 'leap' || this.phase === 'landed') return this.drawLeaper(ctx);
    if (this.phase === 'dying' || this.phase === 'gone') return this.drawDying(ctx);
    if (p.invuln > 0 && Math.floor(t * 16) % 2) return;
    const frame = opts.frame ?? this.girlFrame();
    const ds = this.displayScale();
    const scale = [ds * p.sqx, ds * p.sqy];
    const rot = Math.round(p.theta / ROT_STEP) * ROT_STEP;
    const at = this.pos(p.theta, R + p.h);
    if (opts.ghost) {
      const off = opts.ghost;
      drawSprite(ctx, S.girlGreen[frame], at.x - off, at.y, rot, scale, GIRL_ANCHOR.x, GIRL_ANCHOR.y);
      drawSprite(ctx, S.girlPurple[frame], at.x + off, at.y, rot, scale, GIRL_ANCHOR.x, GIRL_ANCHOR.y);
    }
    const img = p.growT > 0 && Math.floor(p.growT * 30) % 3 === 0 ? S.girlWhite[frame] : S.girl[frame];
    drawSprite(ctx, img, at.x, at.y, rot, scale, GIRL_ANCHOR.x, GIRL_ANCHOR.y);
  }

  drawDying(ctx) {
    const d = this.dying;
    const p = this.player;
    const scale = p.scale;
    if (d.stage === 'glitch') {
      // stutter: jump around, drop frames, ghost in neon
      if (Math.random() < 0.25) return;
      const at = this.pos(p.theta, R + p.h);
      const j = () => Math.round((Math.random() - 0.5) * 6);
      const frame = Math.random() < 0.5 ? 'jump' : this.girlFrame();
      const rot = Math.round(p.theta / ROT_STEP) * ROT_STEP;
      drawSprite(ctx, S.girlGreen[frame], at.x - 3 + j(), at.y + j(), rot, scale, GIRL_ANCHOR.x, GIRL_ANCHOR.y);
      drawSprite(ctx, S.girlPurple[frame], at.x + 3 + j(), at.y + j(), rot, scale, GIRL_ANCHOR.x, GIRL_ANCHOR.y);
      drawSprite(ctx, S.girl[frame], at.x + j(), at.y, rot, scale, GIRL_ANCHOR.x, GIRL_ANCHOR.y);
      return;
    }
    if (d.stage === 'fall' || d.stage === 'carried') {
      const at = this.pos(p.theta, R + p.h);
      const rot = Math.round((p.theta + d.rot) / ROT_STEP) * ROT_STEP;
      // Tip over backwards around the heels; shifting the pivot to her back
      // as she goes down leaves her lying on the surface, not sunk into it.
      const k = d.stage === 'carried' ? 1 : Math.min(1, d.t / 0.35);
      drawSprite(ctx, S.girl.jump, at.x, at.y, rot, scale, GIRL_ANCHOR.x - 6 * k, GIRL_ANCHOR.y);
      return;
    }
    if (d.stage === 'void') {
      if (d.t > 0.5 && Math.random() < (d.t - 0.5) * 1.4) return; // dissolve into static
      const img = Math.random() < 0.15 ? S.girlWhite.jump : S.girl.jump;
      drawSprite(ctx, img, d.x, d.y, Math.round(d.rot / ROT_STEP) * ROT_STEP, scale, GIRL_ANCHOR.x, GIRL_ANCHOR.y / 2);
    }
  }

  drawLeaper(ctx) {
    const l = this.leap;
    if (this.phase === 'landed') {
      drawSprite(ctx, S.girl.idle, l.to.x, l.to.y, 0, 1, GIRL_ANCHOR.x, GIRL_ANCHOR.y);
      return;
    }
    const pt = this.leapPoint();
    const scale = l.scale0 + (1 - l.scale0) * pt.k;
    drawSprite(ctx, S.girl.jump, pt.x, pt.y, (pt.k - 0.3) * 0.5, scale, GIRL_ANCHOR.x, GIRL_ANCHOR.y);
  }
}
