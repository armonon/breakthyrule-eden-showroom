# Online fist fights and shared garden state

## Fist fights between visitors: `server/brawl.mjs` (the one protocol)

Visitor-vs-visitor punching is decided on the server. The client only says it threw a punch
(`{t:'punch'}` on the live socket, sent by `player-body.js`); `server/brawl.mjs` picks the nearest
signed-in character within reach in front of the puncher, and the third punch on the same person
within 1.3 s knocks them down. Everyone in the zone receives `{t:'brawl', events}` and plays it.

The jester fights in `fist-combat.js` are single-player (PvE) and run in the browser; they do not
use the shared room. The older client-decided protocol that used to be described here was never
wired up and has been dropped.

## Shared garden state: `server/world.mjs`

| What | How |
| --- | --- |
| **Weather lever** | Live message `{t:'weather', stage}` with `stage` 0 (day), 0.5 (dusk) or 1 (night). Needs a signed-in visitor with a character; 4 pulls per 30 s. Every live client receives `{t:'world', weather:{stage,by,at}, ladder}` (also sent on connect). |
| **Fools' Ladder** | `POST /api/social/ladder {result:'win'\|'loss'\|'decision', seconds}` after a Fight Night bout. Needs a character; one bout per 20 s; seconds 3–130. Returns `{record, ladder}` and broadcasts the top 10 (wins, then fastest knockout). |
| **Progress** | `POST /api/social/progress {progress}` merges glitches seen, garments found, `jesterBeaten`, `doorOpened`, `lever`, `toll`, `wraps` and `roadMeters` into the account. Progress only grows; it comes back on `me` as `user.progress`. |
| **Current state** | `GET /api/social/world` |

Clients keep everything in `localStorage` too, so the public preview (no server) still works; on the
Eden server the browser merges the account's progress in at load and pushes changes as they happen.

Ladder results are reported by the browser after a fight with the jester, so treat the ladder as a
friendly scoreboard rather than anti-cheat proof.

Tests: `node --test server/world.test.mjs` (unit tests plus an end-to-end run against a real server
with two accounts and live sockets).
