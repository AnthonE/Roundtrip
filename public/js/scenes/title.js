// Screen 1: PRESS START. A calm, static poster.
import { view } from '../render.js';
import { drawText } from '../font.js';
import { COLORS } from '../config.js';
import { Button, pressButtons } from '../ui.js';
import { director } from '../director.js';
import { unlockAudio, playMusic, sfx } from '../audio.js';
import { drawPoster, drawLogo, blink } from './common.js';

export const title = {
  enter() {
    this.t = 0;
    this.buttons = [
      new Button('LEADERBOARD', () => {
        sfx.click();
        director.go('nickname', { mode: 'board' });
      }),
    ];
  },

  start() {
    unlockAudio();
    playMusic();
    sfx.click();
    director.newRun();
    director.go('play', { level: 1 });
  },

  update(dt) {
    this.t += dt;
  },

  onDown(ev) {
    unlockAudio();
    if (pressButtons(this.buttons, ev)) return;
    this.start();
  },

  onKey(code) {
    if (code === 'Enter') this.start();
  },

  draw(ctx, t, dt) {
    const { W, H, globeY } = view;
    drawPoster(ctx, t);
    const cx = W / 2;
    const scale = W >= 300 ? 4 : 3;
    const top = Math.max(18, Math.round(H * 0.12));
    drawLogo(ctx, cx, top, scale);
    drawText(ctx, 'A GAME FOR THE SONG BY BUBBLEGUM', cx, top + 7 * scale + 8, {
      align: 'center',
      color: COLORS.lavender,
      shadow: COLORS.ink,
    });

    const midY = top + 7 * scale + 26;
    const headY = globeY - 80 - 28; // top of her head
    const wide = W >= 300;
    const y0 = wide ? midY : midY + Math.max(0, Math.floor((headY - midY - 50) * 0.3));
    if (blink(this.t)) {
      drawText(ctx, 'PRESS START', cx, y0, { align: 'center', color: COLORS.yellow, outline: COLORS.ink, scale: 2 });
    }
    const hints = [
      ['TAP: HOP', '#ffffff'],
      ['HOLD: HIGH JUMP', '#ffffff'],
      ['SELF-CARE ×5', COLORS.pink],
      ['= THE MOON', COLORS.pink],
    ];
    if (wide) {
      hints.forEach(([txt, color], i) =>
        drawText(ctx, txt, W - 8, H - 50 + i * 10, { align: 'right', color, outline: COLORS.ink }),
      );
    } else {
      drawText(ctx, 'TAP: HOP   HOLD: HIGH JUMP', cx, y0 + 22, { align: 'center', color: '#ffffff', shadow: COLORS.ink });
      drawText(ctx, 'SELF-CARE ×5 = THE MOON', cx, y0 + 33, { align: 'center', color: COLORS.pink, shadow: COLORS.ink });
    }

    this.buttons[0].place(W >= 300 ? 52 : cx, H - 22);
    this.buttons[0].draw(ctx, dt);
  },
};
