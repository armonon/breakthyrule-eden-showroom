# Jester animations (optional Mixamo clips)

The Violet Trickster ships with hand-built procedural moves (`jester-moves.js`):
Guard, Jab, Cross, Uppercut, Tackle, Hit, Taunt, Dizzy, Toprock and a full
Breakdance routine (toprock → drop → backspin → hat-tip headspin → flip up).

You can swap any of them for Mixamo motion capture without touching code:

1. On mixamo.com pick any character, find a clip (e.g. "Breakdance Freezes",
   "Headspin", "Cross Punch", "Football Tackle", "Hit Reaction", "Taunt").
   Tick **In Place** when offered and download as **FBX, Without Skin**.
2. Convert each FBX to GLB (Blender: File → Import FBX → Export glTF Binary,
   or `npx fbx2gltf`). Put the `.glb` files in this folder.
3. Create `manifest.json` here, mapping clip names to files:

```json
{
  "clips": {
    "Breakdance": "breakdance.glb",
    "Toprock": {"file": "toprock.glb", "loop": true},
    "Cross": {"file": "cross-punch.glb", "hit": 0.35},
    "Tackle": {"file": "tackle.glb", "hit": 0.5}
  }
}
```

`hit` is the second the blow should land (used to time damage). Clips are
retargeted onto the jester's 16-bone rig at load time by matching world-space
bone swings, so Mixamo's T-pose and the jester's A-pose line up. Without a
manifest the procedural moves are used and nothing extra is requested.

Mixamo animations are free to use in your own projects, but must be
downloaded with your own Adobe account; they are not bundled here.
