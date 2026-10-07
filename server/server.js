// ROUNDTRIP leaderboard API. Plain node:http, no framework.
//
//   POST /api/runs                 start a run          -> { runId }
//   POST /api/runs/:id/level       bank a finished level -> { banked, level }
//   POST /api/runs/:id/name        put a nickname on it  -> { rank, nick, score, level }
//   GET  /api/leaderboard?limit=&nick=                   -> { top, you }
//   GET  /api/health
//
// In production nginx serves public/ and proxies /api here. With DEV_STATIC=1
// this process serves public/ too, so `npm run dev` is all you need locally.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRedisMongoStore, createMemoryStore } from './lib/store.js';
import { normalizeNick, checkLevel, clampLimit, RUN_ID_RE } from './lib/validate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '../public');
const MAX_BODY = 2048;

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 8787),
    host: env.HOST || '127.0.0.1',
    store: env.STORE || 'redis',
    redisUrl: env.REDIS_URL || 'redis://127.0.0.1:6379',
    mongoUrl: env.MONGO_URL || 'mongodb://127.0.0.1:27017',
    mongoDb: env.MONGO_DB || 'roundtrip',
    trustProxy: env.TRUST_PROXY === '1',
    allowedOrigin: env.ALLOWED_ORIGIN || '',
    devStatic: env.DEV_STATIC === '1',
    salt: env.IP_SALT || 'roundtrip',
    limits: {
      runs: Number(env.LIMIT_RUNS || 30), // per IP per minute
      writes: Number(env.LIMIT_WRITES || 60),
      reads: Number(env.LIMIT_READS || 240),
    },
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    const type = req.headers['content-type'] || '';
    if (!type.startsWith('application/json')) {
      // Only JSON. A cross-site form can't send it without a CORS preflight, which we never allow.
      reject(new HttpError(415, 'json only'));
      req.resume();
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolveBody({});
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'bad json'));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

async function serveStatic(req, res, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const file = join(PUBLIC, rel.endsWith('/') || rel === '' || rel === '.' ? join(rel, 'index.html') : rel);
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}

export function createApp(store, config, { now = () => Date.now(), log = console } = {}) {
  const ipOf = (req) => {
    if (config.trustProxy) {
      const real = req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (real) return real;
    }
    return req.socket.remoteAddress || 'unknown';
  };
  const hashIp = (ip) => createHash('sha256').update(config.salt + ip).digest('hex').slice(0, 16);

  async function limit(bucket, ip, max) {
    if (!(await store.hit(bucket, ip, max, 60, now()))) throw new HttpError(429, 'slow down');
  }

  async function loadRun(id) {
    if (!RUN_ID_RE.test(id)) throw new HttpError(404, 'unknown run');
    const run = await store.getRun(id);
    if (!run) throw new HttpError(404, 'unknown run');
    return run;
  }

  async function route(req, res, url) {
    const ip = ipOf(req);
    const path = url.pathname;
    const m = path.match(/^\/api\/runs\/([^/]+)\/(level|name)$/);

    if (req.method === 'POST' && (path.startsWith('/api/') && config.allowedOrigin)) {
      const origin = req.headers.origin;
      if (origin && origin !== config.allowedOrigin) throw new HttpError(403, 'bad origin');
    }

    if (path === '/api/health' && req.method === 'GET') {
      await store.ping();
      return send(res, 200, { ok: true, store: store.kind });
    }

    if (path === '/api/runs' && req.method === 'POST') {
      await limit('runs', ip, config.limits.runs);
      await readJson(req);
      const runId = await store.createRun({ now: now() });
      return send(res, 201, { runId });
    }

    if (m && req.method === 'POST' && m[2] === 'level') {
      await limit('writes', ip, config.limits.writes);
      const body = await readJson(req);
      const id = m[1];
      const run = await loadRun(id);
      const t = now();
      const verdict = checkLevel(run, body, t);
      if (!verdict.ok) throw new HttpError(verdict.status, verdict.error);
      if (!(await store.lockLevel(id, body.level))) throw new HttpError(409, 'level already submitted');
      const next = await store.saveLevel(id, run, {
        level: body.level,
        coins: body.coins,
        score: verdict.score,
        durationMs: Number.isFinite(body.durationMs) ? Math.round(body.durationMs) : null,
        serverMs: t - run.lastAt,
        ipHash: hashIp(ip),
        at: t,
      });
      return send(res, 200, { banked: next.banked, level: next.level });
    }

    if (m && req.method === 'POST' && m[2] === 'name') {
      await limit('writes', ip, config.limits.writes);
      const body = await readJson(req);
      const id = m[1];
      const run = await loadRun(id);
      const n = normalizeNick(body.nickname);
      if (!n.ok) throw new HttpError(400, n.error);
      const rank = await store.setName(id, run, n.nick, n.key);
      return send(res, 200, rank ?? { rank: null, nick: n.nick, score: run.banked, level: run.level - 1 });
    }

    if (path === '/api/leaderboard' && req.method === 'GET') {
      await limit('reads', ip, config.limits.reads);
      const top = await store.top(clampLimit(url.searchParams.get('limit')));
      const n = normalizeNick(url.searchParams.get('nick') || '');
      const you = n.ok ? await store.rankOf(n.key) : null;
      return send(res, 200, { top, you });
    }

    if (path.startsWith('/api/')) throw new HttpError(404, 'not found');
    if (config.devStatic && (req.method === 'GET' || req.method === 'HEAD')) return serveStatic(req, res, path);
    throw new HttpError(404, 'not found');
  }

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      await route(req, res, url);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      log.error('[api]', req.method, url.pathname, e);
      if (!res.headersSent) send(res, 500, { error: 'server error' });
    }
  };
}

export async function main() {
  try {
    process.loadEnvFile();
  } catch {}
  const config = loadConfig();
  const store =
    config.store === 'memory'
      ? createMemoryStore()
      : await createRedisMongoStore({ redisUrl: config.redisUrl, mongoUrl: config.mongoUrl, mongoDb: config.mongoDb });
  const server = http.createServer(createApp(store, config));
  server.headersTimeout = 10_000;
  server.requestTimeout = 10_000;
  server.listen(config.port, config.host, () => {
    console.log(`roundtrip api on http://${config.host}:${config.port} (store: ${store.kind}${config.devStatic ? ', serving public/' : ''})`);
  });
  const stop = async () => {
    server.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
