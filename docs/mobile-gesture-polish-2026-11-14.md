# Mobile gesture protection and input polish — 2026-11-14

Looking around could start browser text selection, copy/lookup menus, or native image dragging. `game-input-guard.css` and `game-input-guard.js` now scope gesture protection to gameplay surfaces in Eden and the standalone expedition. Chat, search, inputs, reading dialogs, and explicitly selectable content retain native selection and context menus. The stylesheet includes Safari touch-callout and text-selection rules; no global zoom restriction is added.

Eden now releases pointer capture when gestures end or are interrupted, suppresses menu-button activation after scrolling, and keeps the two-finger Menu behavior. The shared touch adapter gives each gesture a single pointer owner, cancels held actions when hidden or interrupted, and releases the action originally pressed if the game mode changes. Expedition touch actions use E for interaction and G for nonlethal flares. Direct movement/crouch hooks keep touch release independent of keyboard toggle preferences.

The standalone expedition has a compact safe-area-aware mobile layout, larger separated thumb controls, a horizontally scrollable tools row, and usable portrait/landscape placement. Duplicate flare/reload/view buttons are removed from the upper toolbar when the touch controls provide them.

Also restores the foliage module’s forest-only path required by the standalone expedition. Without it, startup dereferenced Eden’s absent valley data and failed before controls could appear. The garden path is unchanged. The landmark loader’s prepare/dispose and shader-warmup hooks are also restored to match the expedition scene controller; its architecture and game rules are unchanged.

Validation is limited to syntax checks and targeted Chrome mouse/touch emulation, including long press plus camera drag, simultaneous move/look, native-selection prevention, reading/editing exceptions, action bindings, mode-change release, modal interruption, and phone-width layout. Physical iPhone/Safari and Android testing is still recommended; this is not a sustained frame-rate certification.

Deployment: apply the changed-file overlay to the current full production inventory, preserving its `lab` function and restored store assets. The full live site has additional files outside the game's Git main tree; deploying only that incomplete tree would remove unrelated site content. This source change is saved on a dedicated branch rather than triggering that destructive full-tree build.
