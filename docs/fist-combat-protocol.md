# Fist combat: shared-room protocol

Fighting the Violet Trickster runs entirely in the browser. Player-vs-player
fights need two small additions to the social API (`/api/social/*`, which
lives outside this repository).

## 1. Pass `pose.combat` through `sync`

Each client already posts `{pose:{x,z,yaw}}`. It now also sends:

```json
"combat": {"hp": 84, "down": false, "ko": false, "block": false,
           "punch": {"seq": 12, "hand": 1, "kind": "cross"}}
```

Echo it back on that person's entry in `people[]` as `combat`. Other clients
use it to ragdoll knocked-down visitors and animate their punches.

## 2. `POST /api/social/combat`

Body: `{target, kind: "jab"|"cross"|"power", damage, direction:[x,z], nonce, connectionId}`.

The server should check the sender is signed in with a character, the target
is in the room and within ~2.5 m of the sender's last pose, clamp `damage` to
25, rate-limit (about 4 per second), and then queue an event:

```json
{"id": "evt_…", "from": "<senderId>", "target": "<targetId>", "kind": "cross",
 "damage": 12, "direction": [0.6, -0.8], "time": 1730500000}
```

Return recent events (last ~5 s) as `combat: [...]` in every `sync` response.
The target's client applies the damage to itself and reports `down`/`ko`
back through its pose; the victim's client is the authority on its own health.

Until the endpoint exists the client notices the 404, stops sending, and
fighting other visitors only shows local hit effects.

## Other shared-room upgrades (optional)

These features work today per visitor (saved in the browser). To make them
shared, the social API would need:

- **Weather lever** (`eden-secrets.js`): store the current stage (`day` /
  `dusk` / `night`) in the room and return it in `sync`; clients call
  `garden.nightRoad.setStage()` with it.
- **Fools' Ladder** (`eden-extras.js`): `POST /api/social/ladder` with
  `{result, seconds}` after a bout, and a top-10 list in `sync`.
- **Road distance**: add each visitor's `roadMeters` to a room total for a
  "the world has walked N km" mile marker.
- **Unlocks** (`progress.wraps`, hidden garments found): store on the account
  so they follow the visitor across devices.

The hourly Drop needs nothing: every client derives it from the clock.
