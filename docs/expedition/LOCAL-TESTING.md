# Test the actual integrated game

Use the repository root with Node 20.18 or newer. A fresh checkout needs the locked dependencies: the tests import Three.js and the local server imports the Garment Lab's Netlify storage package even when using local test data. Existing vendored browser/Jolt assets are also required.

    npm ci

    node tools/expedition/check.mjs
    node tools/expedition/check.mjs --soak

The first command runs core, input, camera, physics, room, persistence and legal full-route tests. The optional soak advances thirty simulated minutes faster than real time. Neither certifies rendering performance or real-time browser endurance.

Start an isolated local server with fresh test-only data (do not use the production/account directory):

    TEST_DATA=$(mktemp -d)
    node server/eden-server.mjs --host 127.0.0.1 --port 0 --data "$TEST_DATA"

Open the printed localhost address plus /expedition.html. /showroom.html remains the full Eden showroom. Stop this test server with Ctrl-C. The data directory contains only the test accounts/rooms you create in it. Do not expose this local server publicly without a suitable authenticated HTTPS deployment and approved hosting.

## Solo checks

Enter Solo. Movement uses WASD and Shift, Space jump/ledge catch, C crouch/slide, E bell/page interaction, F flashlight, G defensive flare and R reload. The View button switches cameras. Bail defaults to B and can be remapped to N in expedition preferences. Reset position works only during safe solo exploration. The bell starts an announced countdown, then the hunt. Recover all eight pages and reach the pyramid. Check loss/retry and Return to Eden as well as winning.

The settings panel provides independent view sensitivity/FOV, motion-effect switches, hold/toggle controls and optional aim assistance. Reduced-motion defaults disable camera effects. Three total flares use a two-round magazine plus one reserve. The Watcher cannot be killed.

## Release status

See RELEASE-COVERAGE.md for verified evidence and remaining gates. Current Node room persistence is single-host, not a distributed database lease. Saved-character admission is enforced by the existing service; protocol-v2 browser/HTTP integration, public multiplayer hosting, prediction/reconciliation acceptance and production promotion remain final-stage work. A passing local command is not production approval.
