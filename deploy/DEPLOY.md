# Deploying ROUNDTRIP on your VM

The setup: nginx serves the game as static files from `public/` and proxies `/api/` to
one small Node process. That process talks to the Redis and MongoDB you already run.
No Docker, no build step, no framework.

```
browser ──► nginx (roundtrip.example.com)
              ├─ /          → /opt/roundtrip/public   (static files)
              └─ /api/      → 127.0.0.1:8787          (node server.js)
                                 ├─ Redis   live leaderboard, open runs, rate limits
                                 └─ MongoDB every banked level, best score per nickname
```

Replace `roundtrip.example.com` everywhere below with your subdomain.

## What you need

| | Version | Check |
| --- | --- | --- |
| Node.js | 20.12+ (22 LTS recommended), installed system-wide | `node -v` |
| Redis | 6.2+ (the board uses `ZADD GT`) | `redis-server --version` |
| MongoDB | 4.2+ | `mongod --version` |
| nginx + certbot | any recent | `nginx -v` |

If Node came from nvm under your home folder, the hardened systemd unit can't see it.
Install it system-wide instead (for example from NodeSource:
`curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs`).

## 1. DNS

Add an `A` record (and `AAAA` if you use IPv6) for the subdomain pointing at the VM.

## 2. Code and user

```bash
sudo useradd --system --home /opt/roundtrip --shell /usr/sbin/nologin roundtrip
sudo git clone https://github.com/AnthonE/Roundtrip.git /opt/roundtrip
sudo chown -R roundtrip:roundtrip /opt/roundtrip
cd /opt/roundtrip/server
sudo -u roundtrip npm ci --omit=dev
```

## 3. The song

Nothing to do: "roundtrip (Remastered)" ships in the repo at `public/audio/roundtrip.mp3`.
To swap it later, see `public/audio/README.md`.

## 4. Configure

```bash
cd /opt/roundtrip/server
sudo -u roundtrip cp .env.example .env
sudo -u roundtrip nano .env        # REDIS_URL, MONGO_URL, ALLOWED_ORIGIN, IP_SALT
sudo chmod 600 .env
```

- `REDIS_URL`: point it at a spare DB index (the example uses `/2`) so the `rt:*` keys stay
  out of your other site's way. Add `:password@` if your Redis has `requirepass`.
- `MONGO_URL`: add `user:pass@...?authSource=admin` if Mongo has auth on. The app creates
  its own indexes in the `roundtrip` database on first start.
- `ALLOWED_ORIGIN`: `https://roundtrip.example.com`. Write requests from other sites get a 403.
- `IP_SALT`: any random string (`openssl rand -hex 16`). IPs are only stored as salted hashes.

Smoke test before wiring up systemd:

```bash
sudo -u roundtrip node server.js
# roundtrip api on http://127.0.0.1:8787 (store: redis+mongo)
curl -s localhost:8787/api/health      # {"ok":true,"store":"redis+mongo"}
```

## 5. systemd

```bash
sudo cp /opt/roundtrip/deploy/systemd/roundtrip-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now roundtrip-api
systemctl status roundtrip-api
journalctl -u roundtrip-api -f
```

## 6. nginx and HTTPS

```bash
sudo cp /opt/roundtrip/deploy/nginx/roundtrip.conf /etc/nginx/sites-available/roundtrip.conf
sudo sed -i 's/roundtrip.example.com/YOUR.SUBDOMAIN/' /etc/nginx/sites-available/roundtrip.conf
sudo ln -s /etc/nginx/sites-available/roundtrip.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d YOUR.SUBDOMAIN
```

nginx needs read access to `/opt/roundtrip/public` (it has it by default: the files are
world-readable).

Open the subdomain, play a level, enter a nickname, and check the board:
`curl -s https://YOUR.SUBDOMAIN/api/leaderboard`.

## Updating

```bash
sudo /opt/roundtrip/deploy/update.sh
```

It fast-forwards to `origin/main`, reinstalls server deps, restarts the API and prints the
health check. Static files take effect immediately (nginx revalidates JS/CSS on every load).
Set `BRANCH=...` to deploy another branch.

`update.sh` doesn't touch nginx. When `deploy/nginx/roundtrip.conf` changes, copy the changed
lines into `/etc/nginx/sites-available/roundtrip.conf` by hand (certbot edited that file, so
don't overwrite it), then `sudo nginx -t && sudo systemctl reload nginx`.

## Playing in the X (Twitter) timeline

`index.html` declares a player card, so X frames the game itself at 480×480. That relies on
two lines in the nginx config: `frame-ancestors` allowing twitter.com and x.com, and the
`sub_filter` that turns `%ORIGIN%` into absolute URLs. Check with
`curl -s https://YOUR.SUBDOMAIN/ | grep twitter:player`. X decides per domain whether to
render player cards inline; where it doesn't, the post shows the image with a link.

## Day-2 notes

**Logs**: `journalctl -u roundtrip-api`. Rejected level reports show up as 4xx in the nginx
access log for `/api/runs/*/level`.

**Backups**: Mongo is the source of truth; Redis can be wiped at any time. On start, the API
rebuilds the Redis leaderboard from Mongo if the `rt:lb` key is missing.

```bash
mongodump --db roundtrip --out /var/backups/roundtrip-$(date +%F)
```

**Remove a nickname** (e.g. something rude got past the blocklist):

```bash
redis-cli -n 2 ZREM rt:lb somekey && redis-cli -n 2 DEL rt:nick:somekey
mongosh roundtrip --eval 'db.leaderboard.deleteOne({ _id: "somekey" })'
```

Keys are the lowercase nickname. The blocklist lives in `server/lib/validate.js`.

**Reset the whole board** (new season):

```bash
redis-cli -n 2 --scan --pattern 'rt:*' | xargs -r redis-cli -n 2 DEL
mongosh roundtrip --eval 'db.leaderboard.deleteMany({})'
```

`db.levels` keeps the full history, so you can always recompute.

**Collections**: `levels` has one document per banked level, with run id, coins, score,
running total, client and server timings, and hashed IP. `leaderboard` has the best
score per nickname.
