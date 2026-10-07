// Canvas buttons and panels in the pixel style.
import { drawText, textWidth } from './font.js';
import { COLORS } from './config.js';

export function drawPanel(ctx, x, y, w, h, { fill = 'rgba(20,15,46,0.88)', border = COLORS.lavender } = {}) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = border;
  ctx.fillRect(x + 2, y, w - 4, 1);
  ctx.fillRect(x + 2, y + h - 1, w - 4, 1);
  ctx.fillRect(x, y + 2, 1, h - 4);
  ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
  ctx.fillRect(x + 1, y + 1, 1, 1);
  ctx.fillRect(x + w - 2, y + 1, 1, 1);
  ctx.fillRect(x + 1, y + h - 2, 1, 1);
  ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
}

export class Button {
  constructor(label, onClick, { primary = false, w = null } = {}) {
    this.label = label;
    this.onClick = onClick;
    this.primary = primary;
    this.fixedW = w;
    this.x = 0;
    this.y = 0;
    this.w = 0;
    this.h = 15;
    this.pressedT = 0;
    this.visible = true;
  }

  place(cx, y, w = null) {
    this.w = w ?? this.fixedW ?? textWidth(this.label) + 16;
    this.x = Math.round(cx - this.w / 2);
    this.y = Math.round(y);
    return this;
  }

  hit(px, py) {
    return this.visible && px >= this.x - 2 && px <= this.x + this.w + 2 && py >= this.y - 2 && py <= this.y + this.h + 2;
  }

  draw(ctx, dt = 0) {
    if (!this.visible) return;
    this.pressedT = Math.max(0, this.pressedT - dt);
    const down = this.pressedT > 0 ? 1 : 0;
    const face = this.primary ? COLORS.hotPink : '#3b3480';
    const edge = this.primary ? '#a8166a' : '#231c5c';
    // drop edge
    ctx.fillStyle = edge;
    ctx.fillRect(this.x + 1, this.y + 2, this.w - 2, this.h - 1);
    drawPanel(ctx, this.x, this.y + down, this.w, this.h - 1, {
      fill: face,
      border: this.primary ? '#ffd1ea' : COLORS.lavender,
    });
    drawText(ctx, this.label, this.x + this.w / 2, this.y + 4 + down, {
      align: 'center',
      color: '#ffffff',
      shadow: edge,
    });
  }
}

// Returns true if a pointer-down landed on one of the buttons (and fires it).
export function pressButtons(buttons, ev) {
  for (const b of buttons) {
    if (b.hit(ev.x, ev.y)) {
      b.pressedT = 0.12;
      b.onClick();
      return true;
    }
  }
  return false;
}
