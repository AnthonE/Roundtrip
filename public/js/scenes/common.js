// Shared pieces for the calm poster screens (title, nickname, leaderboard).
import { view } from '../render.js';
import { drawBackground } from '../background.js';
import { drawGlobe, GLOBE_R } from '../globe.js';
import { S, GIRL_ANCHOR } from '../sprites.js';
import { drawSprite } from '../game.js';
import { drawText, drawBandedText, textWidth } from '../font.js';

export const POSTER_ANGLE = 0.0;

// Static globe with small her standing on top. No glitches on these screens.
export function drawPoster(ctx, t) {
  drawBackground(ctx, t, 0);
  drawGlobe(ctx, view.globeX, view.globeY, POSTER_ANGLE);
  drawSprite(ctx, S.girl.idle, view.globeX, view.globeY - GLOBE_R, 0, 1, GIRL_ANCHOR.x, GIRL_ANCHOR.y);
}

const LOGO_BANDS = ['#fff6a8', '#ffe14d', '#ffd166', '#ffb3c7', '#ff8fc2', '#ff6fb5', '#e65aa6'];

export function drawLogo(ctx, cx, y, scale) {
  const word = 'ROUNDTRIP';
  const w = textWidth(word, scale);
  // album-art glitch stripes behind the logo
  ctx.fillStyle = '#39ff88';
  ctx.fillRect(Math.round(cx - w / 2 - 6), Math.round(y + scale * 2), Math.round(w * 0.45), scale);
  ctx.fillStyle = '#b34dff';
  ctx.fillRect(Math.round(cx - w * 0.1), Math.round(y + scale * 5), Math.round(w * 0.6 + 6), scale);
  drawText(ctx, word, cx, y + scale, { scale, align: 'center', color: '#140f2e' });
  drawText(ctx, word, cx - 1, y, { scale, align: 'center', color: '#39ff88' });
  drawText(ctx, word, cx + 1, y, { scale, align: 'center', color: '#b34dff' });
  drawBandedText(ctx, word, cx, y, scale, LOGO_BANDS);
  return w;
}

export function blink(t, rate = 1.6) {
  return Math.floor(t * rate * 2) % 2 === 0;
}

export function shareText(run, level) {
  const banked = Math.round(run?.banked ?? 0).toLocaleString('en-US');
  return `I roundtripped on level ${level} with ${banked} banked. Can you make it to the moon?`;
}

export async function share(text) {
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'ROUNDTRIP', text, url });
      return 'SHARED!';
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'COPIED!';
  } catch {
    return null;
  }
}
