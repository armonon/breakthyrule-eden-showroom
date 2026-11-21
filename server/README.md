# Eden local server

One Node process (Node 20.18+) that serves the site and runs the shared garden. Install the repository's locked dependencies first; the Garment Lab storage package is imported by this server even when using local data:

```bash
npm ci
node server/eden-server.mjs            # http://127.0.0.1:8777/
node server/eden-server.mjs --port 8780 --data /path/to/data
EDEN_PUBLIC_ORIGIN=https://play.example.com node server/eden-server.mjs   # production mode, see docs/MULTIPLAYER-HOSTING.md
```

- **Accounts and characters**: `/api/social/{register,login,recover,logout,delete,me,character}`: the contract
  `multiplayer.js` and `social-account.js` already use. Passwords and recovery codes are scrypt-hashed; sessions are
  an HttpOnly cookie. Stored in `server/data/accounts.json` (git-ignored).
- **Presence and chat, live**: WebSocket `/api/social/live?connectionId=…`. Clients send their pose up to 15×/s;
  the server pushes room snapshots ~20×/s while anything changes, and chat at once. Chat keeps the last 80 messages
  in memory; you need a character to chat (guests appear as ghosts). The HTTP `sync` poll still works as a fallback.
  In the game, new messages also show for a few seconds over the garden (bottom left) and Enter opens a quick box to
  answer (a chat button on touch screens); both live in `multiplayer.js`. Text is stripped of control characters and
  direction overrides, cut to 280 characters, and limited to 8 sends per 10 seconds. Tests: `node --test server/social-chat.test.mjs`.
- **Local mode switch**: the server answers `/deployment.js` with `mode: "local"` and the live URL, so the deployed
  preview copy of that file (which disables accounts) is untouched.
- **Prop editor**: `PUT /assets/props/scene.json` (with `?edit`), same as `eden_dev_server.py`, which this replaces.
- **Safety**: listens on 127.0.0.1 only by default; API calls and the socket are refused from other origins; login,
  registration and chat are rate-limited; `/server/` and dotfiles are never served.

To try two players, open the garden in two browsers (or one normal + one private window, since each needs its own
cookie), create an account and a character in each, then walk around and chat.

- **Shared garden state** (`server/world.mjs`): the stage-weather lever is shared by the room, Fight Night results go on
  a Fools' Ladder per account, and progress through the garden's secrets follows the account across devices. See
  `docs/fist-combat-protocol.md` for the messages and endpoints. Tests: `node --test server/world.test.mjs`.

## Expedition multiplayer

The same server now provides six-player expedition rooms in the existing showroom. Open two browser profiles at
`http://127.0.0.1:8777/showroom`, create a room and enter its six-character code in the second profile. Existing
signed-in saved characters carry over and are frozen for the run. Guests can use browser solo; private rooms require an authenticated account and a schema-valid saved character. Ready each player, have the leader start
exploring, then gather at the temple bell. The leader may ring it when everyone is ready. The shared simulation
owns movement validation, pages, capture, escape, flares, and the countdown. Browser-only solo executes the same
`solo-expedition.js` and `expedition-world.js` code.

- `GET /api/expedition`: capability probe.
- `POST /api/expedition`: JSON commands `create`, `join` (code), `solo`, `resume`, `sync`, `pose`, `ready`,
  `start`, `ring-bell`, `collect`, `flare`, `reload`, `interrupt`, `chat`, `leave`. Commands after entry carry the
  returned private `token` and room `generation`. Stale generations are rejected. Player identity cannot be overridden by a request.
- `POST /api/expedition/events`: `{token,generation}` starts a newline-delimited JSON snapshot stream, not EventSource SSE.
  The simulation runs at 60 Hz and publishes at 10 Hz. Slow consumers are disconnected rather than buffered forever.
- Reconnection preserves the room/player for 60 seconds after the last command or stream attachment. Resume with
  the original token and, for accounts, the original authenticated cookie. A replacement stream closes its predecessor.
  Tokens never appear in URLs or other players' snapshots. Explicit leave ends that membership.
- Rooms, inventory, pages, bounded room chat, identity and generation are checkpointed under `<data>/expedition`.
  Clean restart can resume within the original 60-second activity expiry; downtime does not extend that expiry.
  Resume capabilities are stored only as SHA-256 digests, never raw tokens. Existing account cookies are still required.
  Signed-in result counters (runs, escapes, best pages) persist as server-owned `expeditionStats` in the account store.
  Client-authored garden progress cannot overwrite them. There is no separate long-term chat archive.
- Limits: six players per room, 64 rooms per process, 20 entry attempts/IP/minute, 60 commands/player/second,
  eight chat messages/player/10 seconds, 280 characters/message, 16 KiB request bodies. Empty/expired rooms are removed.

Tests: `node --test server/expedition.test.mjs server/expedition-http.test.mjs server/expedition-storage.test.mjs server/world.test.mjs`
(service lifecycle/security, real six-player simulation and real HTTP routes), plus
`node --test tools/expedition/solo-expedition-test.mjs` for shared gameplay. Use `--data` with a temporary directory for integration tests;
never point automated test accounts at `server/data`.

### Single-host persistence and recovery

Persistence is enabled by default. `--expedition-memory true` explicitly opts into ephemeral rooms. The embedding
service API accepts an optional `storageDir`; omitting it uses memory only. Checkpoints use private files, an atomic
rename and fsync. Gameplay transitions are saved immediately; pose/simulation checkpoints are batched to once a second.
A sudden stop can lose up to that interval of movement. Timers are rebased across restart, but no offline movement
or capture is simulated. A graceful SIGTERM/SIGINT writes a final checkpoint and releases ownership.

Only one process may own an expedition directory. `writer.lock` is created exclusively; a second writer fails at
startup. A crash leaves that lock in place deliberately. Before manually removing a stale lock, inspect its PID/host,
stop every process using that volume and confirm the former writer cannot restart. Never remove a live writer's lock.
Back up the checkpoint first. Corrupt or unknown checkpoint versions fail startup rather than silently reset players.
Do not mount the same volume into replicas, use autoscaling, or rely on sticky routing with multiple writers.
This implementation is single-host, not a distributed room service. Existing account storage also requires one writer.

Use a private, writable persistent local volume with atomic rename and exclusive-create semantics, outside the
static document root. Protect its backups like account data: room state includes character and chat information.
Do not hand-edit checkpoints or accept checkpoints from clients. The trusted engine restore API is never a public action.

### Hosting boundary

The current `netlify.toml` is a static-site configuration and deliberately returns 404 for `/api/*`. It does not run
this Node server. Multiplayer needs one long-lived Node 20.18+ process, persistent storage for accounts, HTTPS with
a same-origin reverse proxy for `/api/expedition` and `/api/social`, WebSocket upgrade forwarding for garden presence,
and streaming without proxy buffering. Use exactly one writer with the persistent volume described above.
Accounts require backups and a proper production deployment/security review. Set `EDEN_ALLOWED_ORIGINS` to the exact
public HTTPS origin (comma-separated for an intentional allowlist, no wildcards or paths), for example
`https://game.example.com`. This permits that Origin header without trusting client-supplied forwarding headers.
The reverse proxy must preserve cookies, stream responses without buffering, and restrict access to the local listener.
Terminate TLS at the proxy, keep the Node bind address on loopback/private networking, and disable public access to
editor endpoints. Secure-cookie enforcement and account-server production hardening must be reviewed before exposure.
Do not disable origin checks or expose an unauthenticated local editor as a shortcut.

Local loopback play is free and needs no external provider. No existing free public multiplayer host is configured
in this checkout. Public hosting, reverse proxies, tunnels, paid infrastructure and production rollout have not been
enabled by this change. Do not expose the local editor/account server directly to the Internet.

Public hosting: the server now has a production mode (`EDEN_PUBLIC_ORIGIN`) and a `Dockerfile`; see
`docs/MULTIPLAYER-HOSTING.md` for running it as one container with a volume. Still single-instance: no distributed
multi-instance room service.

### Input-authority development module (not enabled)

`createInputExpeditionService` in `expedition-authority.mjs` is a separate protocol-v2 factory for the same expedition engine. It uses the actual selected character skeleton, canonical animation state and Jolt ragdoll solver at 60 Hz simulation / 120 Hz physics, with complete build-bound checkpoints. Its default capacity is four rooms / 24 actors; six characters per room. Resource preparation is asynchronous and outside the fixed tick. Entry requires authenticated saved characters.

The shipped HTTP server and browser still use the protocol-v1 service documented above. Do not select the new factory without the matching browser input adapter: poses and direct gameplay commands are rejected by v2. Input frames, generation and connection epoch must travel together; reconnect resets prediction and action receipts. Full native solver checkpoints are server-only, never accepted from public requests.

Client prediction, action acknowledgement and physical interpolation modules are included for the remaining integration; they are not wired to the player entry. The six-actor service/checkpoint tests are focused runtime checks, not a real-browser network or endurance result. See `docs/expedition/RELEASE-COVERAGE.md` for the remaining work.
