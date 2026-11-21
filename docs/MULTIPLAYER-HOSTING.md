# Putting multiplayer online

Multiplayer (accounts, saved characters, the live shared garden with chat and fist fights, Fight Night, the shared
weather lever, and six-player Beyond Eden rooms) is all in `server/eden-server.mjs`. It already works locally
(`server/README.md`). Netlify can't run it: Netlify serves static files and short functions, while multiplayer needs one
process that stays up and holds WebSockets and streams open. So the game gets its own small host, and Netlify keeps the
main site.

```
breakthyrule.com        → Netlify (shop, collections, about; as today, built from main)
play.breakthyrule.com   → game server container (the whole site plus /api/social, /api/expedition)
```

The game server serves the site's files itself, so the game page and its API share one origin. That keeps cookies
simple (`SameSite=Lax`, no cross-site sign-in) and means WebSockets don't need to pass through Netlify, whose proxy
doesn't carry them.

## What the host needs

- Runs a Docker image (`Dockerfile` in the repo root) **as exactly one instance**. No autoscaling and no second
  replica: rooms and accounts live in that one process, and a second writer refuses to start.
- A **persistent volume** mounted at `/data` (accounts, sessions, expedition checkpoints). About 1 GB is plenty.
- HTTPS in front, with WebSocket upgrades and unbuffered streaming passed through. Fly.io, Render (with a disk),
  Railway (with a volume) and a small VPS behind Caddy all do this.
- The image includes the site's assets (about 1.2 GB), so a region near most players helps.

## Settings

| Variable | Set by | Meaning |
|---|---|---|
| `EDEN_PUBLIC_ORIGIN` | **you** | The exact public URL, e.g. `https://play.breakthyrule.com`. Turns on production mode (below). |
| `EDEN_TRUST_PROXY` | image (`1`) | Read the player's address from `X-Forwarded-For` so rate limits are per player, not per proxy. Set it to `0` if the container port is ever reachable without the proxy. |
| `PORT`, `EDEN_HOST` | image (`8080`, `0.0.0.0`) | Where the process listens inside the container. |
| `EDEN_DATA_DIR` | image (`/data`) | The volume. |
| `EDEN_ALLOWED_ORIGINS` | optional | Extra exact origins allowed to call the API (comma-separated). |
| `EDEN_ENABLE_LAB` | optional | Leave unset. The Garment Lab's orders live in the Netlify function; a second store here would split customer data. |

Production mode (any `EDEN_PUBLIC_ORIGIN`) does the following:
- Session cookies get `Secure`, and the public origin passes the origin check.
- The prop editor (`PUT /assets/props/scene.json`) and the local Garment Lab store are turned off.
- Static files are served with ETags (`no-cache` plus 304s), so a deploy shows up at once and unchanged models aren't
  downloaded again.
- Responses carry the same security headers as `netlify.toml`, plus HSTS.

The server always does the following:
- Pings every live socket every 25 s so hosting proxies don't drop idle players, and closes a socket that has been
  silent for 75 s.
- Expires sessions after 30 days.
- Refuses to start if `accounts.json` can't be parsed, rather than overwriting it.
- Answers `GET /healthz` (used by the image's health check).

## Example: Fly.io

```bash
fly launch --no-deploy --name breakthyrule-eden   # take the Dockerfile; say no to databases
fly volumes create eden_data --size 1 --region <closest>
```

In `fly.toml`, set `internal_port = 8080`, set `auto_stop_machines = "off"`, keep `min_machines_running = 1`, and add:

```toml
[env]
  EDEN_PUBLIC_ORIGIN = "https://play.breakthyrule.com"

[mounts]
  source = "eden_data"
  destination = "/data"
```

```bash
fly deploy
fly certs add play.breakthyrule.com   # then add the DNS record it prints
fly scale count 1                     # never more than one
```

## Free: Oracle Cloud Always Free

`tools/deploy/oracle-setup.sh` does all of this on the server. It installs Docker, opens the server's own firewall, and
runs the game plus Caddy for free HTTPS. It updates from `main` every 15 minutes and backs up player data daily. Without a
domain the address is `https://<ip-with-dashes>.sslip.io/showroom`.

1. **Compute → Instances → Create instance.** Image: Canonical Ubuntu 24.04. Shape: Ampere `VM.Standard.A1.Flex` with
   2 OCPUs and 12 GB (inside Always Free). Networking: a public subnet with a public IPv4 address. Download the SSH key.
2. Same page, **Advanced options → Management → Initialization script → Paste cloud-init script**:
   ```bash
   #!/bin/bash
   curl -fsSL https://raw.githubusercontent.com/armonon/breakthyrule-eden-showroom/main/tools/deploy/oracle-setup.sh | bash
   ```
3. **Open ports 80 and 443.** Go to Networking → Virtual cloud networks → the instance's VCN → Security Lists → Default
   → Add Ingress Rules. Use source `0.0.0.0/0`, protocol TCP, destination port `80,443`.
4. Wait about 10 minutes (the first build is slow on ARM), then open `https://<public-ip-with-dashes>.sslip.io/showroom`.
   For example, `129.146.10.20` becomes `https://129-146-10-20.sslip.io/showroom`.

The setup log is in `/var/log/eden-setup.log`. To use your own domain:
1. Point an A record (e.g. `play.breakthyrule.com`) at the server's IP.
2. Run `curl -fsSL …/oracle-setup.sh | sudo EDEN_DOMAIN=play.breakthyrule.com bash` over SSH.
3. Sessions are tied to the address, so players sign in again after the move.

Oracle may reclaim Always Free servers that sit under 20% CPU for 7 days, and a quiet game server often does. Upgrading
the account to Pay As You Go keeps Always Free resources free; check Oracle's terms on reclaiming before relying on it.
Backups stay on the same disk (`/var/backups/eden`), so copy them off now and then:
`scp -i key ubuntu@<ip>:/var/backups/eden/*.tgz .`. To restore one:
1. Stop the `eden` container.
2. Untar the backup into the `eden-deploy_eden-data` volume.
3. Delete `expedition/writer.lock` from it.
4. Start the container again.

## Linking it from the main site

The Netlify build serves `deployment.js` with `mode: "preview"`, so the showroom there stays solo, which is correct.
To send players to multiplayer, point the main site's "Play" links at `https://play.breakthyrule.com/showroom`. Don't
add a Netlify proxy for `/api/social` or `/api/expedition`: Netlify's proxy doesn't carry WebSockets.

## Keeping it updated

The game host builds from `main` like Netlify does (connect the repo, or run `fly deploy` after `tools/ship.sh`). A
deploy restarts the process. Expedition rooms resume from their checkpoint if players come back within 60 s. Garden
presence reconnects on its own.

## Before opening it to the public

- **Back up `/data`** on a schedule. It holds every account. Treat backups as personal data.
- Accounts have names, passwords and recovery codes only: no email, so no password reset beyond the recovery code.
- Chat isn't moderated beyond the rate limits (8 messages per 10 s, 280 characters each). Decide whether you need
  reporting or blocking before a big launch.
- Movement is validated, not simulated, by the server (protocol v1). The fully server-authoritative version (protocol v2)
  is built but not wired to the browser yet; see `docs/expedition/RELEASE-COVERAGE.md`. That matters for cheating in
  competitive play, not for playing together.
- Capacity: 64 expedition rooms of 6 players per process. The garden is one shared room. A small machine
  (1 shared CPU, 512 MB to 1 GB) is fine to start; watch `/healthz` and memory.
