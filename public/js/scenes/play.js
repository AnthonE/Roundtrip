// Screens 2–5: grab the coin, roundtrip, self-care power-up, leap to the moon.
import { view } from '../render.js';
import { drawText, textWidth, formatNumber } from '../font.js';
import { COLORS, FX, PLAYER } from '../config.js';
import { ITEMS_PER_LEVEL, LEVEL_BONUS, spinFor } from '../rules.js';
import { World, moonPos } from '../game.js';
import { S, ITEM_LABEL, ITEM_COLOR } from '../sprites.js';
import { drawBackground } from '../background.js';
import { input } from '../input.js';
import { sfx, tapeStop, playMusic, pauseMusic, resumeMusic } from '../audio.js';
import { clearFx, updateFx, drawFx, burst, popText, sparkleTrail, shake, glitch } from '../fx.js';
import { Button, pressButtons, drawPanel } from '../ui.js';
import { director } from '../director.js';
import { submitLevel } from '../api.js';
import { blink, share, shareText } from './common.js';

const INK = COLORS.ink;

export const play = {
  enter({ level = 1, seed } = {}) {
    this.level = level;
    this.t = 0;
    this.pressed = false;
    this.hitStop = 0;
    this.glitchK = 0;
    this.glitchT = 0;
    this.paused = false;
    this.card = null;
    this.bank = null;
    this.trailT = 0;
    clearFx();
    this.world = new World({ level, seed, onEvent: (type, d) => this.onWorld(type, d) });
    if (!director.run) director.newRun();
    this.run = director.run;
    this.run.level = level;
  },

  exit() {
    this.paused = false;
  },

  glitch(k, dur) {
    this.glitchK = Math.max(this.glitchT > 0 ? this.glitchK : 0, k);
    this.glitchT = Math.max(this.glitchT, dur);
  },

  onWorld(type, d) {
    const w = this.world;
    switch (type) {
      case 'jump':
        sfx.jump();
        break;
      case 'coin':
        sfx.coin(d.mult);
        popText(d.x, d.y - 8, `+${d.value}`, d.mult > 1 ? COLORS.pink : COLORS.yellow);
        burst(d.x, d.y, ['#ffd21f', '#ffffff'], 5, 40);
        break;
      case 'item': {
        sfx.item();
        this.hitStop = FX.hitStop;
        burst(d.x, d.y, [ITEM_COLOR[d.kind], '#ffffff', COLORS.pink, COLORS.cyan], 18, 80);
        const c = w.playerCenter();
        popText(c.x, c.y - 24 * w.player.scale, `${ITEM_LABEL[d.kind]}!`, ITEM_COLOR[d.kind]);
        if (d.items < ITEMS_PER_LEVEL) popText(c.x, c.y - 24 * w.player.scale + 10, 'SELF-CARE +1', '#ffffff', { life: 1 });
        break;
      }
      case 'land':
        if (d.streak >= 1 && d.streak <= 4) {
          const c = w.playerCenter();
          popText(c.x + 14, c.y - 10, `x${w.mult}`, COLORS.pink, { life: 0.5 });
        }
        break;
      case 'lag':
        sfx.lag();
        this.glitch(0.4, 0.28);
        shake(1.5);
        popText(d.x, d.y - 20, 'LAG!', COLORS.neonGreen);
        break;
      case 'hit':
        sfx.hit();
        this.glitch(0.55, 0.35);
        shake(3);
        burst(d.x, d.y, [COLORS.red, '#ff9aa6', '#ffffff'], 14, 70);
        popText(d.x, d.y - 16, 'DUMP!', COLORS.red);
        break;
      case 'cleared':
        popText(d.x, d.y, 'DODGED', COLORS.cyan, { life: 0.5 });
        break;
      case 'danger':
        sfx.danger();
        this.glitch(0.12, 0.1);
        break;
      case 'moonReady':
        sfx.moonReady();
        break;
      case 'leap':
        sfx.leap();
        break;
      case 'moon': {
        sfx.moon();
        const m = moonPos();
        burst(m.x, m.y, ['#fff3c4', COLORS.yellow, COLORS.pink, COLORS.cyan], 26, 90);
        this.startBank();
        break;
      }
      case 'roundtrip':
        sfx.roundtrip();
        tapeStop();
        this.glitch(1, 0.75);
        shake(4);
        break;
      case 'gone':
        this.showCard();
        break;
    }
  },

  // ---- level complete -----------------------------------------------------

  startBank() {
    const w = this.world;
    const run = this.run;
    const add = w.bankValue();
    this.bank = { t: 0, from: run.banked, add, unreal: w.levelScore, bonus: LEVEL_BONUS * this.level, ticked: 0 };
    const stats = {
      level: this.level,
      coins: w.coins,
      items: w.items,
      score: add,
      durationMs: Math.round(w.t * 1000),
    };
    run.banked += add;
    run.level = this.level + 1;
    run.pending = run.ready.then(() => submitLevel(run.id, stats));
  },

  continueFromBank() {
    if (!this.bank || this.bank.t < 1.2) return;
    sfx.click();
    director.go('nickname', { mode: 'levelup', level: this.level });
  },

  // ---- roundtrip card -----------------------------------------------------

  showCard() {
    const run = this.run;
    const buttons = [
      new Button('TRY AGAIN', () => {
        sfx.click();
        playMusic();
        director.newRun();
        director.go('play', { level: 1 });
      }, { primary: true, w: 112 }),
    ];
    if (run.banked > 0 && !run.named) {
      buttons.push(new Button('SAVE SCORE', () => {
        sfx.click();
        director.go('nickname', { mode: 'final', level: this.level });
      }, { w: 112 }));
    }
    buttons.push(
      new Button('SHARE', async () => {
        const msg = await share(shareText(run, this.level));
        if (msg) popText(view.W / 2, this.card.shareY - 4, msg, COLORS.neonGreen);
      }, { w: 112 }),
      new Button('LEADERBOARD', () => {
        sfx.click();
        director.go('nickname', { mode: 'board' });
      }, { w: 112 }),
    );
    this.card = { t: 0, lost: this.world.levelScore, buttons, shareY: 0 };
  },

  // ---- input --------------------------------------------------------------

  onDown(ev) {
    if (this.card) {
      if (this.card.t > 0.4) pressButtons(this.card.buttons, ev);
      return;
    }
    if (this.bank) {
      this.continueFromBank();
      return;
    }
    if (this.paused) {
      this.setPaused(false);
      return;
    }
    this.pressed = true;
  },

  onKey(code) {
    if (code === 'Escape' || code === 'KeyP') this.setPaused(!this.paused);
    if (code === 'Enter') {
      if (this.card && this.card.t > 0.4) this.card.buttons[0].onClick();
      else if (this.bank) this.continueFromBank();
      else if (this.paused) this.setPaused(false);
    }
  },

  setPaused(p) {
    if (this.card || this.bank || this.world.phase !== 'play') return;
    this.paused = p;
    if (p) pauseMusic();
    else resumeMusic();
  },

  onHidden() {
    this.setPaused(true);
  },

  // ---- update -------------------------------------------------------------

  update(dt) {
    this.t += dt;
    updateFx(dt);
    if (this.card) this.card.t += dt;
    if (this.bank) {
      const b = this.bank;
      b.t += dt;
      const k = Math.min(1, Math.max(0, (b.t - 0.5) / 1.1));
      const ticks = Math.floor(k * 12);
      if (ticks > b.ticked) {
        b.ticked = ticks;
        sfx.bank();
      }
    }
    if (this.paused) return;
    this.glitchT = Math.max(0, this.glitchT - dt);
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.pressed = false;
      return;
    }
    const ctl = { pressed: this.pressed, held: input.held };
    this.pressed = false;
    this.world.update(dt, ctl);

    if (this.world.phase === 'leap') {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.03;
        const p = this.world.leapPoint();
        sparkleTrail(p.x + (Math.random() - 0.5) * 8, p.y - 8, [COLORS.yellow, COLORS.pink, COLORS.cyan, '#ffffff'][Math.floor(Math.random() * 4)]);
      }
    }
  },

  // ---- draw ---------------------------------------------------------------

  draw(ctx, t, dt) {
    const w = this.world;
    const { W, H } = view;
    drawBackground(ctx, t, w.G * 30);
    w.draw(ctx, t);
    drawFx(ctx);

    // glitch pass (gameplay screens only)
    let k = this.glitchT > 0 ? this.glitchK : 0;
    let focus = null;
    if (w.phase === 'play' && w.player.theta < -PLAYER.danger && Math.random() < 0.18) k = Math.max(k, 0.1);
    if (w.phase === 'dying') {
      const st = w.dying.stage;
      if (st === 'glitch') k = Math.max(k, 0.9);
      else if (Math.random() < 0.3) k = Math.max(k, 0.25);
      focus = w.playerCenter().y;
    }
    if (w.phase !== 'play' && w.phase !== 'dying') k = 0;
    glitch(ctx, k, focus);

    if (w.phase === 'play') this.drawHud(ctx, t);
    if (w.phase === 'play' && w.player.theta < -PLAYER.danger && blink(t, 4)) {
      const c = w.playerCenter();
      drawText(ctx, 'SLIPPING!', c.x, c.y - 18 * w.player.scale - 12, { align: 'center', color: COLORS.red, outline: INK });
    }
    if (this.bank) this.drawBank(ctx, t);
    if (this.card) this.drawCard(ctx, t, dt);
    if (this.paused) {
      drawPanel(ctx, W / 2 - 60, H * 0.3, 120, 34);
      drawText(ctx, 'PAUSED', W / 2, H * 0.3 + 8, { align: 'center', color: COLORS.yellow, scale: 1 });
      drawText(ctx, 'TAP TO RESUME', W / 2, H * 0.3 + 20, { align: 'center', color: '#ffffff' });
    }
  },

  drawHud(ctx, t) {
    const w = this.world;
    const { W, H } = view;
    drawText(ctx, `BANKED ${formatNumber(this.run.banked)}`, 4, 4, { color: '#ffffff', shadow: INK });
    const ur = `+${formatNumber(w.levelScore)}`;
    drawText(ctx, ur, 4, 13, { color: COLORS.neonGreen, shadow: INK });
    let x = 4 + textWidth(ur) + 5;
    if (W >= 300) {
      drawText(ctx, 'UNREALIZED', x, 13, { color: '#2fb86a', shadow: INK });
      x += textWidth('UNREALIZED') + 5;
    }
    if (w.mult > 1) drawText(ctx, `x${w.mult}`, x, 13, { color: COLORS.pink, shadow: INK });

    // self-care meter
    const step = 11;
    const x0 = W - 16 - ITEMS_PER_LEVEL * step;
    for (let i = 0; i < ITEMS_PER_LEVEL; i++) {
      if (i < w.items) ctx.drawImage(S.items[w.itemKinds[i]], x0 + i * step, 3);
      else ctx.drawImage(S.icons.pip, x0 + i * step + 1, 4);
    }
    drawText(ctx, `LV ${this.level}`, W - 4, 16, { align: 'right', color: COLORS.lavender, shadow: INK });

    // level intro
    if (!this.paused && this.t < 2.6 && (this.t > 2.0 ? blink(this.t, 5) : true)) {
      const y = Math.round(H * 0.24);
      drawText(ctx, `LEVEL ${this.level}`, W / 2, y, { align: 'center', color: COLORS.yellow, outline: INK, scale: 2 });
      const lines =
        this.level === 1
          ? ['TAP: HOP   HOLD: HIGH JUMP', "DON'T SLIDE BACK"]
          : this.level === 2
            ? ['THE WORLD SPINS FASTER', 'HOP THE RED CANDLES']
            : [`SPIN x${(spinFor(this.level) / spinFor(1)).toFixed(2)}`];
      lines.forEach((l, i) => drawText(ctx, l, W / 2, y + 20 + i * 10, { align: 'center', color: '#ffffff', outline: INK }));
    }

    if (w.moonReady && blink(t, 2.5)) {
      drawText(ctx, 'JUMP TO THE MOON!', W / 2, Math.round(H * 0.24), { align: 'center', color: COLORS.yellow, outline: INK });
    }
  },

  drawBank(ctx, t) {
    const b = this.bank;
    if (b.t < 0.35) return;
    const { W, H } = view;
    const pw = Math.min(W - 16, 200);
    const x = Math.round(W / 2 - pw / 2);
    const y = Math.round(H * 0.2);
    drawPanel(ctx, x, y, pw, 84);
    const cx = W / 2;
    drawText(ctx, 'LEVEL COMPLETE', cx, y + 8, { align: 'center', color: COLORS.yellow, scale: 1 });
    drawText(ctx, 'YOU TOOK PROFIT', cx, y + 19, { align: 'center', color: COLORS.neonGreen });
    drawText(ctx, `UNREALIZED  +${formatNumber(b.unreal)}`, cx, y + 33, { align: 'center', color: '#ffffff' });
    drawText(ctx, `LEVEL BONUS +${formatNumber(b.bonus)}`, cx, y + 43, { align: 'center', color: '#ffffff' });
    const k = Math.min(1, Math.max(0, (b.t - 0.5) / 1.1));
    drawText(ctx, `BANKED ${formatNumber(b.from + b.add * k)}`, cx, y + 57, { align: 'center', color: COLORS.pink, scale: 1 });
    if (b.t > 1.2 && blink(t)) drawText(ctx, 'TAP TO CONTINUE', cx, y + 71, { align: 'center', color: COLORS.lavender });
  },

  drawCard(ctx, t, dt) {
    const c = this.card;
    if (c.t < 0.15) return;
    const { W, H } = view;
    const pw = Math.min(W - 16, 200);
    const n = c.buttons.length;
    const ph = 72 + n * 19;
    const x = Math.round(W / 2 - pw / 2);
    const y = Math.max(6, Math.round(H * 0.42 - ph / 2));
    drawPanel(ctx, x, y, pw, ph, { fill: 'rgba(20,15,46,0.92)', border: COLORS.neonPurple });
    const cx = W / 2;
    const j = Math.random() < 0.12 ? Math.round((Math.random() - 0.5) * 4) : 0;
    drawText(ctx, 'ROUNDTRIP', cx - 1 + j, y + 8, { align: 'center', color: COLORS.neonGreen, scale: 3 });
    drawText(ctx, 'ROUNDTRIP', cx + 1 - j, y + 8, { align: 'center', color: COLORS.neonPurple, scale: 3 });
    drawText(ctx, 'ROUNDTRIP', cx, y + 8, { align: 'center', color: '#ffffff', scale: 3 });
    drawText(ctx, c.lost > 0 ? `YOU GAVE BACK +${formatNumber(c.lost)}` : 'NOTHING UNREALIZED. LUCKY.', cx, y + 36, {
      align: 'center',
      color: COLORS.neonGreen,
    });
    drawText(ctx, `BANKED ${formatNumber(this.run.banked)}  LV ${this.level}`, cx, y + 48, {
      align: 'center',
      color: COLORS.pink,
    });
    let by = y + 62;
    for (const b of c.buttons) {
      b.place(cx, by);
      b.draw(ctx, dt);
      if (b.label === 'SHARE') c.shareY = by;
      by += 19;
    }
  },
};
