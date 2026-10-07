// End-to-end API tests. Runs against the in-memory store by default.
// Set TEST_REDIS_URL and TEST_MONGO_URL to run the same suite against real Redis + MongoDB
// (use throwaway instances: the suite flushes the Redis DB and drops the Mongo database).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp, loadConfig } from '../server.js';
import { createMemoryStore, createRedisMongoStore } from '../lib/store.js';
import { MIN_LEVEL_MS } from '../lib/validate.js';
import { ITEMS_PER_LEVEL, LEVEL_BONUS } from '../../public/js/rules.js';

const backends = [['memory', async () => createMemoryStore()]];
if (process.env.TEST_REDIS_URL && process.env.TEST_MONGO_URL) {
  backends.push([
    'redis+mongo',
    async () => {
      const { createClient } = await import('redis');
      const c = createClient({ url: process.env.TEST_REDIS_URL });
      await c.connect();
      await c.sendCommand(['FLUSHDB']);
      await (c.close?.() ?? c.quit());
      const { MongoClient } = await import('mongodb');
      const m = new MongoClient(process.env.TEST_MONGO_URL);
      await m.connect();
      await m.db('roundtrip_test').dropDatabase();
      await m.close();
      return createRedisMongoStore({
        redisUrl: process.env.TEST_REDIS_URL,
        mongoUrl: process.env.TEST_MONGO_URL,
        mongoDb: 'roundtrip_test',
        log: { info() {}, error() {} },
      });
    },
  ]);
}

for (const [name, makeStore] of backends) {
  describe(`api (${name})`, () => {
    let server;
    let base;
    let store;
    let clock = 1_000_000;

    before(async () => {
      store = await makeStore();
      const config = { ...loadConfig({}), limits: { runs: 1000, writes: 1000, reads: 1000 } };
      server = http.createServer(createApp(store, config, { now: () => clock, log: { error() {} } }));
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${server.address().port}/api`;
    });

    after(async () => {
      server.close();
      await store.close();
    });

    const post = async (path, body, headers = {}) => {
      const res = await fetch(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body ?? {}),
      });
      return { status: res.status, body: await res.json() };
    };
    const get = async (path) => {
      const res = await fetch(base + path);
      return { status: res.status, body: await res.json() };
    };
    const level = (n, extra = {}) => ({ level: n, coins: 12, items: ITEMS_PER_LEVEL, score: 120 + 250 + LEVEL_BONUS * n, durationMs: 31000, ...extra });

    test('health', async () => {
      const r = await get('/health');
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, true);
    });

    test('a full run: start, bank two levels, claim a name, show on the board', async () => {
      const { status, body } = await post('/runs');
      assert.equal(status, 201);
      const id = body.runId;
      assert.match(id, /^[A-Za-z0-9_-]{16}$/);

      // too fast
      clock += 1000;
      let r = await post(`/runs/${id}/level`, level(1));
      assert.equal(r.status, 422);

      clock += MIN_LEVEL_MS;
      r = await post(`/runs/${id}/level`, level(1));
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.banked, level(1).score);
      assert.equal(r.body.level, 2);

      // replay of the same level
      clock += MIN_LEVEL_MS;
      r = await post(`/runs/${id}/level`, level(1));
      assert.equal(r.status, 409);

      // skipping ahead
      r = await post(`/runs/${id}/level`, level(3));
      assert.equal(r.status, 409);

      r = await post(`/runs/${id}/name`, { nickname: '  Brooklyn ' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.rank, 1);
      assert.equal(r.body.nick, 'Brooklyn');
      assert.equal(r.body.score, level(1).score);

      // once named, banking another level moves the board on its own
      clock += MIN_LEVEL_MS;
      r = await post(`/runs/${id}/level`, level(2));
      assert.equal(r.status, 200);
      const total = level(1).score + level(2).score;
      assert.equal(r.body.banked, total);

      r = await get('/leaderboard?limit=5&nick=brooklyn');
      assert.equal(r.status, 200);
      assert.equal(r.body.top[0].nick, 'Brooklyn');
      assert.equal(r.body.top[0].score, total);
      assert.equal(r.body.top[0].level, 2);
      assert.equal(r.body.you.rank, 1);
    });

    test('a lower score never replaces a nickname\'s best', async () => {
      const { body } = await post('/runs');
      clock += MIN_LEVEL_MS;
      await post(`/runs/${body.runId}/level`, level(1));
      const r = await post(`/runs/${body.runId}/name`, { nickname: 'BROOKLYN' });
      assert.equal(r.status, 200);
      const board = await get('/leaderboard');
      const row = board.body.top.find((x) => x.nick.toLowerCase() === 'brooklyn');
      assert.equal(row.score, level(1).score + level(2).score);
      assert.equal(row.nick, 'Brooklyn');
    });

    test('ranks order by banked score', async () => {
      const { body } = await post('/runs');
      clock += MIN_LEVEL_MS;
      await post(`/runs/${body.runId}/level`, level(1, { score: 300 }));
      const r = await post(`/runs/${body.runId}/name`, { nickname: 'second' });
      assert.equal(r.body.rank, 2);
      const board = await get('/leaderboard');
      assert.deepEqual(board.body.top.map((x) => x.nick), ['Brooklyn', 'second']);
    });

    test('bad input is rejected', async () => {
      const { body } = await post('/runs');
      const id = body.runId;
      assert.equal((await post(`/runs/${id}/name`, { nickname: '' })).status, 400);
      assert.equal((await post(`/runs/${id}/name`, { nickname: 'way too long a name' })).status, 400);
      assert.equal((await post(`/runs/${id}/name`, { nickname: '<b>' })).status, 400);
      assert.equal((await post('/runs/nope/level', level(1))).status, 404);
      assert.equal((await post('/runs/AAAAAAAAAAAAAAAA/level', level(1))).status, 404);
      clock += MIN_LEVEL_MS;
      assert.equal((await post(`/runs/${id}/level`, level(1, { coins: 1e6 }))).status, 422);
      assert.equal((await post(`/runs/${id}/level`, level(1, { items: 3 }))).status, 400);
      const res = await fetch(`${base}/runs`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
      assert.equal(res.status, 415);
      const big = await fetch(`${base}/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'y'.repeat(5000) }) }).catch(() => ({ status: 413 }));
      assert.equal(big.status, 413);
      assert.equal((await get('/nope')).status, 404);
    });

    test('writes from other origins are refused when ALLOWED_ORIGIN is set', async () => {
      const cfg = { ...loadConfig({ ALLOWED_ORIGIN: 'https://roundtrip.example.com' }), limits: { runs: 1000, writes: 1000, reads: 1000 } };
      const s = http.createServer(createApp(store, cfg, { now: () => clock, log: { error() {} } }));
      await new Promise((r) => s.listen(0, '127.0.0.1', r));
      const url = `http://127.0.0.1:${s.address().port}/api/runs`;
      const hit = (origin) =>
        fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: '{}' }).then((r) => r.status);
      assert.equal(await hit('https://evil.example'), 403);
      assert.equal(await hit('https://roundtrip.example.com'), 201);
      assert.equal(await hit(null), 201);
      s.close();
    });

    test('rate limits apply per IP', async () => {
      const tight = { ...loadConfig({}), limits: { runs: 2, writes: 2, reads: 2 } };
      const s = http.createServer(createApp(store, tight, { now: () => clock + 7_000_000, log: { error() {} } }));
      await new Promise((r) => s.listen(0, '127.0.0.1', r));
      const url = `http://127.0.0.1:${s.address().port}/api/runs`;
      const hit = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then((r) => r.status);
      assert.deepEqual([await hit(), await hit(), await hit()], [201, 201, 429]);
      s.close();
    });
  });
}
