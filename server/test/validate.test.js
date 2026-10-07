import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNick, checkLevel, clampLimit, MIN_LEVEL_MS } from '../lib/validate.js';
import { ITEMS_PER_LEVEL, maxCoinsFor, maxLevelScore } from '../../public/js/rules.js';

test('nicknames are trimmed, length-checked and keyed case-insensitively', () => {
  assert.deepEqual(normalizeNick('  Brooklyn  '), { ok: true, nick: 'Brooklyn', key: 'brooklyn' });
  assert.equal(normalizeNick('milady 2').nick, 'milady 2');
  assert.equal(normalizeNick('a   b').nick, 'a b');
  assert.equal(normalizeNick('').ok, false);
  assert.equal(normalizeNick('   ').ok, false);
  assert.equal(normalizeNick(42).ok, false);
  assert.equal(normalizeNick('x'.repeat(13)).ok, false);
  assert.equal(normalizeNick('x'.repeat(12)).ok, true);
  assert.equal(normalizeNick('<script>').ok, false);
  assert.equal(normalizeNick('emoji🙂').ok, false);
});

test('blocklist catches simple leetspeak but not innocent names', () => {
  assert.equal(normalizeNick('sh1t').ok, false);
  assert.equal(normalizeNick('N4ZI').ok, false);
  assert.equal(normalizeNick('grapes').ok, true);
  assert.equal(normalizeNick('Dickens').ok, true);
});

const run = (over = {}) => ({ level: 1, lastAt: 0, ...over });
const good = (over = {}) => ({ level: 1, coins: 20, items: ITEMS_PER_LEVEL, score: 400, durationMs: 40000, ...over });

test('a plausible level passes', () => {
  assert.deepEqual(checkLevel(run(), good(), 40_000), { ok: true, score: 400 });
});

test('levels must arrive in order, once', () => {
  assert.equal(checkLevel(run({ level: 2 }), good({ level: 1 }), 40_000).status, 409);
  assert.equal(checkLevel(run(), good({ level: 3 }), 40_000).status, 409);
});

test('levels faster than the item timer allows are rejected', () => {
  const v = checkLevel(run(), good(), MIN_LEVEL_MS - 1);
  assert.equal(v.ok, false);
  assert.equal(v.error, 'too fast');
  assert.equal(checkLevel(run(), good(), MIN_LEVEL_MS).ok, true);
});

test('coin and score caps hold', () => {
  const secs = 40;
  const cap = maxCoinsFor(1, secs);
  assert.equal(checkLevel(run(), good({ coins: cap + 1 }), secs * 1000).error, 'too many coins');
  const maxScore = maxLevelScore(1, 20, ITEMS_PER_LEVEL);
  assert.equal(checkLevel(run(), good({ score: maxScore + 1 }), secs * 1000).error, 'score too high');
  assert.equal(checkLevel(run(), good({ score: maxScore }), secs * 1000).ok, true);
});

test('incomplete or malformed reports are rejected', () => {
  assert.equal(checkLevel(run(), good({ items: 4 }), 40_000).error, 'level not complete');
  assert.equal(checkLevel(run(), good({ coins: -1 }), 40_000).error, 'bad numbers');
  assert.equal(checkLevel(run(), good({ score: 1.5 }), 40_000).error, 'bad numbers');
  assert.equal(checkLevel(run(), good({ level: '1' }), 40_000).error, 'bad numbers');
  assert.equal(checkLevel(run(), null, 40_000).error, 'bad request');
});

test('limit parsing', () => {
  assert.equal(clampLimit('5'), 5);
  assert.equal(clampLimit('500'), 50);
  assert.equal(clampLimit('nope'), 10);
  assert.equal(clampLimit(null), 10);
});
