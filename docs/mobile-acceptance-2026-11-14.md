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
