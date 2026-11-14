# Netlify release merge — 2026-11-14

Prepared from game commit `32f28b79ad30a51c2864b46672d846e47fc667f5` and live Netlify deployment `6af8aa2e319e6f35dab2091e`.

The live site had newer accessory/navigation updates. The game loader pages retain its current asset-loader version and shared navigation. The app merges its page-visibility suspension with the expedition work. Original uploaded HTML was fetched through the Netlify API; automatically injected snippets are not embedded into source.

Deployment uses the current site's complete file digest manifest plus the game runtime overlay, retaining every other published asset and the exact existing `lab` function digest. It excludes server, tools, test fixtures and local credentials. This is an atomic Netlify release with the previous deployment retained for rollback.

New animations, solo movement, recovery and loading changes are the live runtime update. Protocol-v2 input-authoritative multiplayer remains disabled pending browser/HTTP integration and persistent hosting. No account service or internet audio relay is created by this static deployment.

See the live `game-release.json` for the published source commit, base deployment and overlay content version. Earlier behavioral/performance evidence predates this merge; only bounded release checks accompany publication.
