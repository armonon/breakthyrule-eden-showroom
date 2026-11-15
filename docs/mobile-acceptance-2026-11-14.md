# Mobile input acceptance — 2026-11-14

This change covers the existing Eden exploration and expedition touch adapters. Browser rendering, viewport measurements and physical-device checks must be recorded separately from the event-level regression suite below. Historical Chrome checks in the other mobile documents do not certify this source revision.

## Input defects fixed

- Touch buttons send canonical game actions even after desktop keys are remapped. They do not follow the keyboard's physical-key assignment.
- Hiding an unavailable action releases the action held by that finger. Switching modes still releases the action captured at press time.
- Unarmed mode hides the overlapping Aim, Reload and Melee controls.
- Both adapters release held movement, camera ownership and buttons when the visual viewport changes, including mobile browser chrome or keyboard resizing.
- Eden checks current readiness and world activation on each input, so a mode switch cannot accept another action during the 180 ms HUD synchronization interval.
- Eden button ownership resets on interruption and releases outside the original button. A later second-finger View or Menu press can work normally. Menu scrolling continues to use native browser gestures.
- Narrow Eden layouts retain left/right safe-area clearance.

## Automated evidence

Run `node --test tools/expedition/mobile-input-test.mjs` from the game root. Fourteen behavioral tests exercise the shipped adapter scripts with an event-driven DOM fixture. The first run reproduced seven failures across the original nine tests. After merging the latest shared controls, the suite also covers walk/sprint circle boundaries, returning from sprint to walk, and exactly-once held-jump releases for both adapters.

The cases cover simultaneous move/look/crouch; pointer ownership; pointer up, cancel and lost capture; touch action semantics; disappearing buttons; unarmed visibility; mode changes; blur, page hiding, orientation, window and visual-viewport resizing; immediate dialog interruption; stale readiness; disposal; secondary-finger activation; outside-button release; and assistive click activation.

The fixture does not emulate CSS, Safari gesture arbitration, WebGL, real touch hardware, safe-area values or performance. Passing it is not physical iPhone/Android acceptance.

## Browser and physical-device checklist

Record browser/OS, source commit, viewport, DPR and whether hardware or emulation was used. Use real pointer/touch input for the following checks:

| Check | Acceptance condition |
| --- | --- |
| 320×568 and 390×844 portrait | Stick, action buttons, settings, help, journal and toolbar remain reachable; no button overlaps another; controls are at least 44 CSS px; content does not cause horizontal page scrolling. |
| 844×390 landscape and tablet | Safe areas clear the notch/home gesture; toolbar remains usable; control regions leave enough room to look; dialogs can scroll to their last field and close. |
| Move + look + action | Three fingers can maintain movement and camera look while jumping/crouching/firing; releasing one does not release the others. |
| Walk, sprint and jump | Verify the current joystick's walk/sprint boundary and return to walking; hold/release Jump exercises the current variable-height jump behavior. |
| Interruption | Open Settings, journal or chat during movement/crouch; background the page, rotate, show keyboard, and return. Movement and fire stop, no stuck capture, controls resume after closing. |
| Desktop remapping with touch | Remap movement/interact/fire/reload, reload the page, then verify touch actions still perform their named function. |
| View/menu second finger | Hold the stick while another finger taps View or Menu. Scroll a menu row instead of tapping it; it must not activate. Cancel a tap, then try again. |
| Solo route | Start solo, interact with the bell, use a flare/reload, collect pages, use bail/recovery, and complete or lose a hunt without a keyboard. |
| Device endurance | Run an active ten-minute route on physical iPhone/Safari and Android/Chrome; record frame-time distribution, resource growth, disconnect/background behavior and thermal changes. |

Physical-device and endurance acceptance remain pending until those devices are actually exercised. Do not label responsive desktop or synthetic input checks as those results.

## Recorded desktop browser checks — 2026-11-14

The following checks used the Codex in-app browser on macOS with native browser keyboard and mouse input. A local-only proxy inserts `window.ontouchstart = null` before the game scripts to expose the existing touch interface. This is responsive desktop testing, not mobile-device emulation or physical touch input. Browser version and DPR were not recorded for this check.

The browser checks below exercised source `71cb5b6`. Upstream `9d30bd6` was subsequently merged into `cb4c5d9`, adding the boolean held-jump callback protocol while retaining returned release callbacks and separate `jumpUp`. On that merge, the mobile input suite passed 14/14 and the upstream mobile controls suite passed 9/9. These event-level results do not extend the earlier browser check to every final-merge behavior; the final browser smoke is recorded separately when completed.

| Observed check | Result and scope |
| --- | --- |
| Settled viewports: 320×568, 390×844, 844×390, 768×1024 | Page width matched viewport width. All six expedition touch buttons were inside the viewport, at least 44 CSS px in both dimensions, and did not overlap one another. The tools row intentionally scrolls horizontally. No notch or home-indicator inset was simulated. |
| Keyboard remapping | Forward changed from W to I; flashlight changed from F to L. Assigning S to the conflicting movement action was rejected. Saved assignments survived a page reload. F no longer toggled the flashlight; L did. |
| Shared settings and view | Eden's Controls & help opened the shared remapper. The View button continued to work after remapping. Opening the menu hid gameplay controls; closing it restored them. |
| Joystick and navigation | Native mouse dragging moved the onscreen joystick and releasing stopped its held input. Return to Eden opened the showroom. This did not exercise simultaneous physical fingers. |
| Browser error observation | The browser's observed error list was empty on both game pages during these checks. This is not a claim about every game route. |

Local evidence from this run:

- [Measured responsive button bounds](/Users/lillypad/Documents/Codex/2026-11-13/d/outputs/evidence/mobile-responsive-bounds.json)
- [Small portrait controls](/Users/lillypad/Documents/Codex/2026-11-13/d/outputs/mobile-small-phone.png)
- [Portrait controls](/Users/lillypad/Documents/Codex/2026-11-13/d/outputs/mobile-portrait-controls.png)
- [Landscape controls](/Users/lillypad/Documents/Codex/2026-11-13/d/outputs/mobile-landscape-controls.png)
- [Remapping panel](/Users/lillypad/Documents/Codex/2026-11-13/d/outputs/remapping-mobile.png)
- [Eden controls](/Users/lillypad/Documents/Codex/2026-11-13/d/outputs/mobile-eden-controls.png)

### Reproduce the local checks

Use Node 20.18 or newer and the locked dependencies. From the local checkout:

```sh
cd /Users/lillypad/Documents/Codex/2026-11-13/d/work/game
npm ci
node --test tools/expedition/mobile-input-test.mjs tools/movement/mobile-controls-test.mjs
```

Start the game server in one terminal with isolated test data:

```sh
cd /Users/lillypad/Documents/Codex/2026-11-13/d/work/game
MOBILE_QA_DATA=$(mktemp -d)
node server/eden-server.mjs --host 127.0.0.1 --port 53946 --data "$MOBILE_QA_DATA"
```

In a second terminal, start the existing local-only capability proxy:

```sh
node /Users/lillypad/Documents/Codex/2026-11-13/d/work/mobile-qa-proxy.mjs
```

Open `http://127.0.0.1:53947/expedition.html` and `http://127.0.0.1:53947/showroom.html` in the browser. Resize the viewport to each recorded size and allow the layout to settle before measuring. Repeat the settings, persistence, flashlight, menu, View, joystick-release and Return to Eden checks with native input. Stop both servers with Ctrl-C afterward. The proxy is a local QA artifact outside the game checkout; its capability override is not shipped.

Still unverified: physical iPhone/Safari and Android/Chrome, actual safe-area/notch behavior, soft-keyboard interaction, concurrent physical fingers, an active ten-minute device run, and a complete touch-only bell/pages/win-or-loss route. These remain explicit acceptance gaps.

Final browser smoke on `cb4c5d943d58b58ca26d03fc0810f149839f282e`: restarted the isolated local server, loaded the merged expedition, entered solo, verified persisted L flashlight toggling, held and released the Jump button, and switched View. No console errors were observed. The portrait screenshot was refreshed. Physical-device limits above still apply.
