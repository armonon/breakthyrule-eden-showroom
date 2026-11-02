# Eden local server

One Node process (no dependencies, Node 18+) that serves the site and runs the shared garden:

```bash
node server/eden-server.mjs            # http://127.0.0.1:8777/
node server/eden-server.mjs --port 8780 --data /path/to/data
```

- **Accounts and characters**: `/api/social/{register,login,recover,logout,delete,me,character}`: the contract
  `multiplayer.js` and `social-account.js` already use. Passwords and recovery codes are scrypt-hashed; sessions are
  an HttpOnly cookie. Stored in `server/data/accounts.json` (git-ignored).
- **Presence and chat, live**: WebSocket `/api/social/live?connectionId=…`. Clients send their pose up to 15×/s;
  the server pushes room snapshots ~20×/s while anything changes, and chat at once. Chat keeps the last 80 messages
  in memory; you need a character to chat (guests appear as ghosts). The HTTP `sync` poll still works as a fallback.
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

Not here yet: hosting for players outside this machine, persistence of chat history, and the PvP arena.
