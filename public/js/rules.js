// Game rules shared by the browser client and the leaderboard server.
// Keep this file pure: no DOM, no Node APIs. The server imports it so both
// sides agree on scoring and on what a legitimate level looks like.

export const ITEMS_PER_LEVEL = 5; // self-care items needed before the moon leap

export const COIN_VALUE = 10;
export const MAX_MULT = 5; // streak multiplier cap
export const ITEM_VALUE = 50;
export const LEVEL_BONUS = 100; // paid when the level is banked (× level multiplier)

// Every level runs on a clock. Run out before the moon and the market closes on you:
// that's a roundtrip. Seconds left when you bank pay a time bonus.
export const LEVEL_TIME = 60; // s
export const TIME_VALUE = 20; // per whole second left (× level multiplier)

export const BASE_SPIN = 0.45; // rad/s at level 1
export const SPIN_GROWTH = 1.15; // per level
export const MAX_SPIN = 2.0;

// Self-care items are spawned on a timer.
export const ITEM_FIRST_DELAY = 4; // s into a level
export const ITEM_INTERVAL_MIN = 5.5; // s
export const ITEM_INTERVAL_MAX = 7.5; // s

// Coin patterns are spawned by globe rotation, so density holds as spin rises.
export const PATTERN_GAP_MIN = 0.3; // rad of globe between patterns
export const MAX_COINS_PER_PATTERN = 5;

export const NICK_MAX = 12;

// Everything earned in a level (coins, items, time and level bonus) is worth
// level × its base value, so pushing on always pays more than replaying easy levels.
export function levelMult(level) {
  return level;
}

export function timeBonus(level, secondsLeft) {
  return Math.floor(Math.max(0, secondsLeft)) * TIME_VALUE * levelMult(level);
}

export function spinFor(level) {
  return Math.min(MAX_SPIN, BASE_SPIN * SPIN_GROWTH ** (level - 1));
}

// Fastest possible level: catch every item the moment it can spawn.
export function minLevelSeconds() {
  return ITEM_FIRST_DELAY + (ITEMS_PER_LEVEL - 1) * ITEM_INTERVAL_MIN;
}

// Generous upper bound on coins collectable in `seconds` of play. A level never
// lasts longer than LEVEL_TIME of play, however long the server clock says it took.
export function maxCoinsFor(level, seconds) {
  const patternsPerSecond = spinFor(level) / PATTERN_GAP_MIN;
  const played = Math.min(seconds, LEVEL_TIME);
  return Math.ceil(played * patternsPerSecond * MAX_COINS_PER_PATTERN) + 10;
}

export function maxLevelScore(level, coins, items) {
  const maxTime = timeBonus(level, LEVEL_TIME - minLevelSeconds());
  return (coins * COIN_VALUE * MAX_MULT + items * ITEM_VALUE + LEVEL_BONUS) * levelMult(level) + maxTime;
}
