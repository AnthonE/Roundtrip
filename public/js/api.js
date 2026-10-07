// Leaderboard client. Talks to the self-hosted API at /api; if that isn't
// reachable (opened from a file, or no server yet) it falls back to a board
// kept in this browser so the game still works end to end.
import { NICK_MAX } from './rules.js';

const BASE = 'api';
const LOCAL_KEY = 'rt:localBoard';
let online = true;

async function call(method, path, body) {
  const post = method !== 'GET';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: post ? { 'content-type': 'application/json' } : undefined,
    body: post ? JSON.stringify(body ?? {}) : undefined,
    cache: 'no-store',
  });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('no api');
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `http ${res.status}`);
    err.status = res.status;
    err.api = true;
    throw err;
  }
  return data;
}

export function cleanNick(raw) {
  return String(raw ?? '')
    .replace(/[^A-Za-z0-9 _.\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICK_MAX);
}

export function savedNick() {
  try {
    return localStorage.getItem('rt:nick') || '';
  } catch {
    return '';
  }
}

export function rememberNick(nick) {
  try {
    localStorage.setItem('rt:nick', nick);
  } catch {}
}

// --- local fallback --------------------------------------------------------

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocal(rows) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows.slice(0, 50)));
  } catch {}
}

function localBoard(limit, nick) {
  const rows = readLocal().sort((a, b) => b.score - a.score);
  const top = rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
  const key = nick?.toLowerCase();
  const i = key ? rows.findIndex((r) => r.nick.toLowerCase() === key) : -1;
  return { top, you: i >= 0 ? { rank: i + 1, ...rows[i] } : null, local: true };
}

function localClaim(nick, score, level) {
  const rows = readLocal();
  const key = nick.toLowerCase();
  const old = rows.find((r) => r.nick.toLowerCase() === key);
  if (old) {
    if (score > old.score) Object.assign(old, { nick, score, level });
  } else rows.push({ nick, score, level });
  writeLocal(rows.sort((a, b) => b.score - a.score));
}

// --- public API ------------------------------------------------------------

export async function startRun() {
  try {
    const r = await call('POST', '/runs');
    online = true;
    return r.runId;
  } catch (e) {
    if (!e.api) online = false;
    return null;
  }
}

/** Report a finished level. Resolves to the server's banked total, or null. */
export async function submitLevel(runId, stats) {
  if (!runId) return null;
  try {
    return await call('POST', `/runs/${encodeURIComponent(runId)}/level`, stats);
  } catch (e) {
    if (!e.api) online = false;
    return { error: e.message };
  }
}

/** Put a nickname on the run's banked score. */
export async function claimName(runId, nick, banked, level) {
  if (runId && online) {
    try {
      return await call('POST', `/runs/${encodeURIComponent(runId)}/name`, { nickname: nick });
    } catch (e) {
      if (e.api) return { error: e.message };
      online = false;
    }
  }
  localClaim(nick, banked, level);
  return { local: true, ...localBoard(10, nick).you };
}

export async function fetchBoard(limit = 10, nick = '') {
  if (online) {
    try {
      const q = new URLSearchParams({ limit: String(limit) });
      if (nick) q.set('nick', nick);
      return await call('GET', `/leaderboard?${q}`);
    } catch (e) {
      if (e.api) return { top: [], you: null, error: e.message };
      online = false;
    }
  }
  return localBoard(limit, nick);
}
