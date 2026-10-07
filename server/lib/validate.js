// Input rules for the API. Pure functions, unit-tested.
import {
  ITEMS_PER_LEVEL,
  NICK_MAX,
  maxCoinsFor,
  maxLevelScore,
  minLevelSeconds,
} from '../../public/js/rules.js';

// A real level can't be finished faster than the item timer allows.
// 10% slack covers clock jitter between the player's device and us.
export const MIN_LEVEL_MS = Math.floor(minLevelSeconds() * 1000 * 0.9);

const NICK_RE = /^[A-Za-z0-9 _.\-]+$/;

// Kept short on purpose: substrings that are never part of an innocent name.
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'faggot', 'nazi', 'hitler', 'kike', 'chink', 'retard', 'whore', 'slut'];

export const RUN_ID_RE = /^[A-Za-z0-9_-]{16}$/;

export function normalizeNick(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'nickname required' };
  const nick = raw.replace(/\s+/g, ' ').trim();
  if (!nick) return { ok: false, error: 'nickname required' };
  if (nick.length > NICK_MAX) return { ok: false, error: `max ${NICK_MAX} characters` };
  if (!NICK_RE.test(nick)) return { ok: false, error: 'letters, numbers, space . _ - only' };
  const key = nick.toLowerCase();
  const squashed = key
    .replace(/[^a-z0-9]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't');
  if (BLOCKED.some((w) => squashed.includes(w))) return { ok: false, error: 'pick another nickname' };
  return { ok: true, nick, key };
}

const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= 1e7;

/**
 * Check a level-complete report against what the run could plausibly have done.
 * run: { level, lastAt } as stored by the server. now: server clock in ms.
 * Returns { ok: true, score } or { ok: false, status, error }.
 */
export function checkLevel(run, body, now) {
  const fail = (error, status = 400) => ({ ok: false, status, error });
  if (!body || typeof body !== 'object') return fail('bad request');
  const { level, coins, items, score } = body;
  if (![level, coins, items, score].every(isCount)) return fail('bad numbers');
  if (level < run.level) return fail('level already submitted', 409);
  if (level > run.level) return fail('levels must be played in order', 409);
  if (items !== ITEMS_PER_LEVEL) return fail('level not complete');
  const elapsed = now - run.lastAt;
  if (elapsed < MIN_LEVEL_MS) return fail('too fast', 422);
  if (coins > maxCoinsFor(level, elapsed / 1000)) return fail('too many coins', 422);
  if (score > maxLevelScore(level, coins, items)) return fail('score too high', 422);
  return { ok: true, score };
}

export function clampLimit(raw, def = 10, max = 50) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(max, n);
}
