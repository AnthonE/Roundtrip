// Storage. Redis holds the hot state (runs in progress, the leaderboard sorted
// set, rate-limit counters); MongoDB keeps the durable record (every banked
// level, best score per nickname) and rebuilds the Redis board if it's lost.
//
// Redis is driven with raw commands so behaviour doesn't drift between client
// versions. Replies are normalised for both RESP2 and RESP3.
import { randomBytes } from 'node:crypto';

const RUN_TTL = 6 * 60 * 60; // seconds a run stays open
const LB = 'rt:lb';

export function newRunId() {
  return randomBytes(12).toString('base64url');
}

// [[member, score], ...] from either a flat RESP2 array or RESP3 pairs.
function pairs(reply) {
  if (!Array.isArray(reply)) return [];
  if (reply.length && Array.isArray(reply[0])) return reply.map(([m, s]) => [String(m), Number(s)]);
  const out = [];
  for (let i = 0; i < reply.length; i += 2) out.push([String(reply[i]), Number(reply[i + 1])]);
  return out;
}

function hash(reply) {
  if (!reply) return {};
  if (Array.isArray(reply)) {
    const o = {};
    for (let i = 0; i < reply.length; i += 2) o[String(reply[i])] = String(reply[i + 1]);
    return o;
  }
  if (reply instanceof Map) return Object.fromEntries([...reply].map(([k, v]) => [String(k), String(v)]));
  return Object.fromEntries(Object.entries(reply).map(([k, v]) => [k, String(v)]));
}

function runFromHash(h) {
  if (!h || !h.level) return null;
  return {
    level: Number(h.level),
    banked: Number(h.banked),
    startedAt: Number(h.startedAt),
    lastAt: Number(h.lastAt),
    nick: h.nick || null,
    key: h.key || null,
  };
}

export async function createRedisMongoStore({ redisUrl, mongoUrl, mongoDb, log = console }) {
  const { createClient } = await import('redis');
  const { MongoClient } = await import('mongodb');

  const redis = createClient({ url: redisUrl });
  redis.on('error', (e) => log.error('[redis]', e.message));
  await redis.connect();
  const r = (...args) => redis.sendCommand(args.map(String));

  const mongo = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 5000 });
  await mongo.connect();
  const db = mongo.db(mongoDb);
  const levels = db.collection('levels');
  const board = db.collection('leaderboard');
  await levels.createIndex({ runId: 1, level: 1 }, { unique: true });
  await levels.createIndex({ at: -1 });
  await board.createIndex({ score: -1 });

  async function rebuildIfEmpty() {
    if (Number(await r('EXISTS', LB))) return 0;
    const rows = await board.find({}, { sort: { score: -1 }, limit: 5000 }).toArray();
    for (const row of rows) {
      await r('ZADD', LB, row.score, row._id);
      await r('HSET', `rt:nick:${row._id}`, 'nick', row.nick, 'level', row.level, 'score', row.score);
    }
    if (rows.length) log.info(`[store] rebuilt leaderboard from mongo (${rows.length} rows)`);
    return rows.length;
  }
  await rebuildIfEmpty();

  async function bump(key, nick, score, level, runId) {
    // Best score per nickname. ZADD GT only ever raises it.
    const changed = Number(await r('ZADD', LB, 'GT', 'CH', score, key));
    const isNew = !Number(await r('HEXISTS', `rt:nick:${key}`, 'nick'));
    if (changed || isNew) await r('HSET', `rt:nick:${key}`, 'nick', nick, 'level', level, 'score', score);
    const better = { $gt: [score, { $ifNull: ['$score', -1] }] };
    await board.updateOne(
      { _id: key },
      [
        {
          $set: {
            nick: { $cond: [better, nick, '$nick'] },
            level: { $cond: [better, level, '$level'] },
            runId: { $cond: [better, runId, '$runId'] },
            updatedAt: { $cond: [better, '$$NOW', '$updatedAt'] },
            score: { $max: [{ $ifNull: ['$score', -1] }, score] },
          },
        },
      ],
      { upsert: true },
    );
  }

  async function rankOf(key) {
    const rank = await r('ZREVRANK', LB, key);
    if (rank === null || rank === undefined) return null;
    const h = hash(await r('HGETALL', `rt:nick:${key}`));
    return { rank: Number(rank) + 1, nick: h.nick || key, score: Number(h.score), level: Number(h.level) || 1 };
  }

  return {
    kind: 'redis+mongo',

    async createRun({ now }) {
      const id = newRunId();
      await r('HSET', `rt:run:${id}`, 'level', 1, 'banked', 0, 'startedAt', now, 'lastAt', now);
      await r('EXPIRE', `rt:run:${id}`, RUN_TTL);
      return id;
    },

    async getRun(id) {
      return runFromHash(hash(await r('HGETALL', `rt:run:${id}`)));
    },

    // One submission per level, even if two requests race.
    async lockLevel(id, level) {
      return (await r('SET', `rt:lock:${id}:${level}`, 1, 'NX', 'EX', 120)) !== null;
    },

    async saveLevel(id, run, cp) {
      const banked = run.banked + cp.score;
      await r('HSET', `rt:run:${id}`, 'level', cp.level + 1, 'banked', banked, 'lastAt', cp.at);
      await r('EXPIRE', `rt:run:${id}`, RUN_TTL);
      await levels.insertOne({
        runId: id,
        level: cp.level,
        coins: cp.coins,
        score: cp.score,
        banked,
        clientMs: cp.durationMs ?? null,
        serverMs: cp.serverMs,
        nick: run.nick,
        ip: cp.ipHash,
        at: new Date(cp.at),
      });
      if (run.key) await bump(run.key, run.nick, banked, cp.level, id);
      return { ...run, level: cp.level + 1, banked, lastAt: cp.at };
    },

    async setName(id, run, nick, key) {
      await r('HSET', `rt:run:${id}`, 'nick', nick, 'key', key);
      if (run.banked > 0) await bump(key, nick, run.banked, run.level - 1, id);
      return rankOf(key);
    },

    async top(limit) {
      const rows = pairs(await r('ZREVRANGE', LB, 0, limit - 1, 'WITHSCORES'));
      const meta = await Promise.all(rows.map(([key]) => r('HGETALL', `rt:nick:${key}`)));
      return rows.map(([key, score], i) => {
        const h = hash(meta[i]);
        return { rank: i + 1, nick: h.nick || key, score, level: Number(h.level) || 1 };
      });
    },

    rankOf,

    async hit(bucket, ip, limit, windowSec, now) {
      const slot = Math.floor(now / 1000 / windowSec);
      const k = `rt:rl:${bucket}:${ip}:${slot}`;
      const n = Number(await r('INCR', k));
      if (n === 1) await r('EXPIRE', k, windowSec + 1);
      return n <= limit;
    },

    async ping() {
      await r('PING');
      await db.command({ ping: 1 });
      return true;
    },

    async close() {
      await (redis.close?.() ?? redis.quit());
      await mongo.close();
    },
  };
}

// Same interface, in memory. For local development and tests only.
export function createMemoryStore() {
  const runs = new Map();
  const locks = new Set();
  const best = new Map(); // key -> { nick, score, level }
  const hits = new Map();
  const levels = [];

  const sorted = () => [...best.entries()].sort((a, b) => b[1].score - a[1].score);
  const rankOf = async (key) => {
    const i = sorted().findIndex(([k]) => k === key);
    return i < 0 ? null : { rank: i + 1, ...best.get(key) };
  };
  const bump = (key, nick, score, level) => {
    const old = best.get(key);
    if (!old || score > old.score) best.set(key, { nick, score, level });
  };

  return {
    kind: 'memory',
    levels,
    async createRun({ now }) {
      const id = newRunId();
      runs.set(id, { level: 1, banked: 0, startedAt: now, lastAt: now, nick: null, key: null });
      return id;
    },
    async getRun(id) {
      const run = runs.get(id);
      return run ? { ...run } : null;
    },
    async lockLevel(id, level) {
      const k = `${id}:${level}`;
      if (locks.has(k)) return false;
      locks.add(k);
      return true;
    },
    async saveLevel(id, run, cp) {
      const next = { ...run, level: cp.level + 1, banked: run.banked + cp.score, lastAt: cp.at };
      runs.set(id, next);
      levels.push({ runId: id, ...cp, banked: next.banked });
      if (run.key) bump(run.key, run.nick, next.banked, cp.level);
      return next;
    },
    async setName(id, run, nick, key) {
      runs.set(id, { ...run, nick, key });
      if (run.banked > 0) bump(key, nick, run.banked, run.level - 1);
      return rankOf(key);
    },
    async top(limit) {
      return sorted()
        .slice(0, limit)
        .map(([, v], i) => ({ rank: i + 1, ...v }));
    },
    rankOf,
    async hit(bucket, ip, limit, windowSec, now) {
      const k = `${bucket}:${ip}:${Math.floor(now / 1000 / windowSec)}`;
      const n = (hits.get(k) || 0) + 1;
      hits.set(k, n);
      return n <= limit;
    },
    async ping() {
      return true;
    },
    async close() {},
  };
}
