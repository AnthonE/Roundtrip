// Screen 6: WRITE YOUR NICKNAME. Calm poster with the leaderboard.
// Modes: 'levelup' (after the moon), 'final' (after a roundtrip), 'board' (view only).
import { view, toCss } from '../render.js';
import { drawText, formatNumber, textWidth } from '../font.js';
import { COLORS } from '../config.js';
import { NICK_MAX } from '../rules.js';
import { Button, pressButtons, drawPanel } from '../ui.js';
import { director } from '../director.js';
import { sfx, playMusic } from '../audio.js';
import { fetchBoard, claimName, cleanNick, rememberNick, savedNick } from '../api.js';
import { drawPoster } from './common.js';

const INK = COLORS.ink;
const ROW_H = 9;
const BOARD_W = 168;

export const nickname = {
  enter({ mode = 'levelup', level = 1 } = {}) {
    this.mode = mode;
    this.level = level;
    this.t = 0;
    this.board = null;
    this.status = '';
    this.statusColor = COLORS.lavender;
    this.saving = false;
    this.el = document.getElementById('nick');
    const run = director.run;
    this.showInput = mode !== 'board' && !(run && run.named);

    if (this.showInput) {
      this.el.value = run?.nick || savedNick();
      this.el.maxLength = NICK_MAX;
      this.el.hidden = false;
      this.el.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.save();
        }
      };
      if (matchMedia('(pointer: fine)').matches) setTimeout(() => this.el.focus(), 50);
    }
    this.buildButtons();
    this.refresh();
  },

  exit() {
    this.el.hidden = true;
    this.el.blur();
    this.el.onkeydown = null;
  },

  buildButtons() {
    const next = () => {
      sfx.click();
      playMusic();
      director.go('play', { level: this.level + 1 });
    };
    const toTitle = () => {
      sfx.click();
      director.go('title');
    };
    const again = () => {
      sfx.click();
      playMusic();
      director.newRun();
      director.go('play', { level: 1 });
    };
    if (this.mode === 'board') {
      this.buttons = [new Button('BACK', toTitle, { primary: true, w: 70 })];
    } else if (this.showInput) {
      this.buttons = [
        new Button('SAVE', () => this.save(), { primary: true, w: 62 }),
        new Button('SKIP', this.mode === 'levelup' ? next : toTitle, { w: 62 }),
      ];
    } else if (this.mode === 'levelup') {
      this.buttons = [new Button(`LEVEL ${this.level + 1} >`, next, { primary: true, w: 100 })];
    } else {
      this.buttons = [new Button('PLAY AGAIN', again, { primary: true, w: 80 }), new Button('TITLE', toTitle, { w: 50 })];
    }
  },

  async refresh() {
    const run = director.run;
    if (this.mode !== 'board' && run) {
      const res = await run.pending;
      if (res?.error) {
        this.status = 'SCORE CHECK FAILED';
        this.statusColor = COLORS.red;
      }
      // Already named: the server updates the board on its own. Offline, update the local board.
      if (run.named && run.nick) await claimName(run.id, run.nick, run.banked, this.level);
    }
    this.board = await fetchBoard(10, run?.nick || savedNick());
    if (!this.showInput && this.mode !== 'board' && this.board?.you) {
      this.status = `${run.nick} IS #${this.board.you.rank}`;
      this.statusColor = COLORS.yellow;
    }
  },

  async save() {
    if (this.saving) return;
    const nick = cleanNick(this.el.value);
    this.el.value = nick;
    if (!nick) {
      this.status = 'TYPE A NICKNAME';
      this.statusColor = COLORS.red;
      return;
    }
    sfx.click();
    this.el.blur();
    this.saving = true;
    this.status = 'SAVING...';
    this.statusColor = COLORS.lavender;
    const run = director.run;
    await run.ready;
    await run.pending;
    const res = await claimName(run.id, nick, run.banked, this.level);
    this.saving = false;
    if (res?.error) {
      this.status = String(res.error).toUpperCase().slice(0, 30);
      this.statusColor = COLORS.red;
      return;
    }
    run.nick = nick;
    run.named = true;
    rememberNick(nick);
    this.showInput = false;
    this.el.hidden = true;
    this.buildButtons();
    this.board = await fetchBoard(10, nick);
    const rank = res.rank;
    // No rank back means the server never banked this run (e.g. a level failed its checks).
    this.status = rank ? `YOU'RE #${rank}!` : 'SCORE NOT VERIFIED';
    this.statusColor = rank ? COLORS.yellow : COLORS.red;
  },

  update(dt) {
    this.t += dt;
  },

  onDown(ev) {
    if (pressButtons(this.buttons, ev)) return;
    this.el.blur();
  },

  onKey(code) {
    if (code === 'Enter' && !this.showInput) this.buttons[0].onClick();
    if (code === 'Escape' && this.mode === 'board') director.go('title');
  },

  layout() {
    const { W, globeY } = view;
    const wide = W >= 330;
    const globeTop = globeY - 80;
    if (wide) {
      const boardX = W - 8 - BOARD_W;
      return { wide, cx: Math.round(boardX / 2), top: 14, boardX, boardY: 12, globeTop };
    }
    const top = Math.max(8, Math.round((globeTop - 30 - 200) / 2));
    return { wide, cx: Math.round(W / 2), top, boardX: Math.round(W / 2 - BOARD_W / 2), boardY: null, globeTop };
  },

  draw(ctx, t, dt) {
    drawPoster(ctx, t);
    const run = director.run;
    const L = this.layout();
    const { cx } = L;
    let y = L.top;

    const heading = this.mode === 'board' ? 'LEADERBOARD' : this.mode === 'levelup' ? 'LEVEL UP!' : 'SAVE YOUR SCORE';
    const hs = textWidth(heading, 2) <= (L.wide ? L.boardX - 8 : view.W - 8) ? 2 : 1;
    drawText(ctx, heading, cx, y, { align: 'center', color: COLORS.yellow, outline: INK, scale: hs });
    y += 7 * hs + 5;

    if (this.mode !== 'board' && run) {
      drawText(ctx, `BANKED ${formatNumber(run.banked)}`, cx, y, { align: 'center', color: COLORS.pink, outline: INK });
      y += 14;
    }

    if (this.showInput) {
      drawText(ctx, 'WRITE YOUR NICKNAME', cx, y, { align: 'center', color: '#ffffff', outline: INK });
      y += 10;
      const iw = 124;
      const ih = 16;
      drawPanel(ctx, cx - iw / 2 - 2, y - 2, iw + 4, ih + 4, { fill: '#0f0b29', border: COLORS.pink });
      const r = toCss(cx - iw / 2, y, iw, ih);
      const s = this.el.style;
      s.left = `${r.left}px`;
      s.top = `${r.top}px`;
      s.width = `${r.width}px`;
      s.height = `${r.height}px`;
      s.fontSize = `${Math.round(r.height * 0.62)}px`;
      y += ih + 8;
    }

    if (this.buttons.length === 2) {
      this.buttons[0].place(cx - 34, y);
      this.buttons[1].place(cx + 34, y);
    } else this.buttons[0].place(cx, y);
    for (const b of this.buttons) b.draw(ctx, dt);
    y += 20;

    if (this.status) {
      drawText(ctx, this.status, cx, y, { align: 'center', color: this.statusColor, outline: INK });
    }
    y += 12;

    // Fit as many rows as there is sky above her head (at least 3).
    const by = L.boardY ?? y;
    const room = L.wide ? view.H - by - 8 : L.globeTop - 30 - by - 16;
    this.drawBoard(ctx, L.boardX, by, run, Math.max(3, Math.min(10, Math.floor(room / ROW_H))));
  },

  drawBoard(ctx, x, y, run, maxRows = 10) {
    const rows = (this.board?.top ?? []).slice(0, maxRows);
    const n = Math.max(rows.length, 1);
    const extra = this.board?.you && this.board.you.rank > rows.length ? 1 : 0;
    const h = 16 + (n + extra) * ROW_H + (this.board?.local ? 10 : 0);
    drawPanel(ctx, x, y, BOARD_W, h);
    drawText(ctx, `TOP ${maxRows}`, x + BOARD_W / 2, y + 5, { align: 'center', color: COLORS.lavender });
    let ry = y + 15;
    if (!this.board) {
      drawText(ctx, 'LOADING...', x + BOARD_W / 2, ry, { align: 'center', color: COLORS.dim });
      return;
    }
    if (!rows.length) {
      drawText(ctx, 'NO SCORES YET. BE FIRST!', x + BOARD_W / 2, ry, { align: 'center', color: COLORS.dim });
      ry += ROW_H;
    }
    const me = (run?.nick || '').toLowerCase();
    const medal = [COLORS.yellow, '#d9e1ff', '#ffb36b'];
    const row = (r, color) => {
      drawText(ctx, String(r.rank).padStart(2, ' '), x + 6, ry, { color: medal[r.rank - 1] ?? COLORS.dim });
      drawText(ctx, String(r.nick).toUpperCase().slice(0, 12), x + 22, ry, { color });
      drawText(ctx, formatNumber(r.score), x + BOARD_W - 26, ry, { align: 'right', color });
      drawText(ctx, `L${r.level ?? 1}`, x + BOARD_W - 6, ry, { align: 'right', color: COLORS.dim });
      ry += ROW_H;
    };
    for (const r of rows) row(r, r.nick.toLowerCase() === me ? COLORS.pink : '#ffffff');
    if (extra) row(this.board.you, COLORS.pink);
    if (this.board.local) {
      drawText(ctx, 'SAVED ON THIS DEVICE', x + BOARD_W / 2, ry + 1, { align: 'center', color: COLORS.dim });
    }
  },
};
