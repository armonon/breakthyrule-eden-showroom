#!/usr/bin/env python3
"""Dress Beyond Eden's road and courtyard with the photo-scanned street props (assets/beyond-eden/scan/models).

  python3 tools/world/scan-props-layout.py [collision.json]

Runs after courtyard-layout.py and rewrites world-props-layout.js in place: every entry with "y":"scan" is replaced, the
rest is untouched, so running it again gives the same file. Each prop below is a wish (model, x, z, yaw in degrees); it is
nudged up to 1.6 m to a free spot, or left out if there is none. Kept clear: the road itself, the lane across the Commons,
the altar's circle, every landmark and its door approach, every model already placed and the courtyard's trees.
collision.json (optional, as for courtyard-layout.py): {walls:[[x,z,w,d,h]],surfaces:[[x0,x1,z0,z1,top,bottom]]}.

Sizes come from assets/beyond-eden/scan/models/sizes.json (written by fetch-beyond-scans.py --pack). Collision follows the
other models: "box" is something to walk round or climb on, "none" is litter you walk through.
"""
import json, math, os, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'); F = os.path.join(ROOT, 'world-props-layout.js')
src = open(F).read(); head = src[:src.index('window.worldPropsLayout')]; D = json.loads(src[src.index('=', src.index('worldPropsLayout'))+1:].rstrip().rstrip(';'))
L = json.load(open(os.path.join(ROOT, 'night-layout.json'))); SIZES = json.load(open(os.path.join(ROOT, 'assets', 'beyond-eden', 'scan', 'models', 'sizes.json')))
C = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else {'walls': [], 'surfaces': []}
RX, AX, AZ = 11.7, L['arena']['x'], L['arena']['z']
SOLID = {'road-barrier', 'trash-can', 'oil-barrel', 'utility-box', 'fire-hydrant', 'wooden-crate'}
D['props'] = [p for p in D['props'] if p.get('y') != 'scan']
rects = []                                                  # everything already standing: (x0, x1, z0, z1)
def fill(a, b, c, d): rects.append((a, b, c, d))
for x, z, w, d, *_ in C['walls']: fill(x-w/2-.4, x+w/2+.4, z-d/2-.4, z+d/2+.4)
for a, b, c, d, top, bottom in C['surfaces']:
    if bottom < 2.5 and top > .1: fill(a-.3, b+.3, c-.3, d+.3)
for s in L['landmarks']:
    x, f = s['x'], s['z']+s['d']/2
    fill(x-s['w']/2-1.2, x+s['w']/2+1.2, s['z']-s['d']/2-1.2, f+1.2); fill(x-1.9, x+1.9, s['z']-s['d']/2-3, f+9.5)
for p in D['props']:
    if p['p'][1] < .1 and p['p'][2] < -20:
        w, d = (p['s'][2], p['s'][0]) if p['r'] % 2 else (p['s'][0], p['s'][2]); fill(p['p'][0]-w/2-.25, p['p'][0]+w/2+.25, p['p'][2]-d/2-.25, p['p'][2]+d/2+.25)
for t in D.get('courtyard', {}).get('trees', []): fill(t['x']-.6, t['x']+.6, t['z']-.6, t['z']+.6)
def free(x, z, w, d, solid):
    a, b, c, e = x-w/2, x+w/2, z-d/2, z+d/2
    if any(a < r[1] and b > r[0] and c < r[3] and e > r[2] for r in rects): return False
    if math.hypot(x-AX, z-AZ) < 8.8+max(w, d)/2: return False                       # the altar and its steps
    if solid and (abs(x-RX) < 2.35+w/2 or (abs(z+63.5) < 2.6+d/2 and abs(x-AX) < 32)): return False   # the road, the lane
    return True
# model, x, z, yaw (degrees). Grouped as someone would have left them: a roadblock pushed aside, bins and bags by the
# lamps, a tyre fitter's leavings, works by the lane, rubble where the paving gives out.
R = RX
WISH = [
 # the gate: a roadblock dragged open
 ('road-barrier', R-3.1, -27.2, 96), ('road-barrier', R-3.3, -29.0, 84), ('road-barrier', R+3.2, -27.6, 80), ('road-barrier', R+3.9, -29.6, 48),
 ('manhole-cover', R+.7, -29.5, 20), ('rubble-stones', R+3.4, -31.6, 0), ('cement-bag', R-3.0, -30.8, 30), ('cement-bag', R-3.3, -31.5, 115),
 # down the road to the Commons
 ('trash-can', R-2.9, -34.2, 0), ('trash-bag', R-3.4, -34.9, 40), ('trash-bag', R-2.8, -35.2, 200), ('cardboard-box', R-3.6, -33.6, 15),
 ('fire-hydrant', R+2.8, -36.5, 90), ('old-tyre', R+3.3, -39.2, 0), ('old-tyre', R+3.5, -39.9, 50), ('wheel-rim', R+2.9, -40.0, 0),
 ('oil-barrel', R+3.4, -41.2, 0), ('oil-barrel', R+4.1, -41.0, 130), ('utility-box', R-2.9, -41.5, 90), ('plastic-crate', R-3.2, -42.6, 20),
 ('pipes', R-3.9, -45.2, 8), ('manhole-cover', R-.6, -44.0, 0), ('road-barrier', R+3.0, -47.2, 92), ('trash-bag', R+3.2, -48.6, 70),
 ('rubble-stones', R-3.6, -49.2, 140),
 # the Commons: round the paving and by the lane
 ('trash-can', AX+9.6, AZ+4.4, 0), ('trash-bag', AX+10.3, AZ+4.9, 120), ('wooden-crate', AX-9.8, AZ+5.2, 90), ('cardboard-box', AX-10.5, AZ+4.2, 60),
 ('plastic-crate', AX-9.6, AZ+6.3, 10), ('oil-barrel', AX+10.4, AZ-5.0, 0), ('old-tyre', AX+11.2, AZ-5.6, 0), ('cement-bag', AX-10.2, AZ-5.4, 75),
 ('fire-hydrant', AX+15.5, AZ+1.6, 180), ('utility-box', AX-16.5, AZ+1.7, 0), ('road-barrier', AX+19.0, AZ+1.8, 2),
 ('road-barrier', AX+17.0, AZ-6.0, 178), ('trash-bag', AX-15.6, AZ+1.9, 300),
 # the road on to the pyramid
 ('road-barrier', R-3.0, -75.4, 88), ('road-barrier', R+3.1, -76.2, 95), ('trash-can', R+2.9, -79.0, 0), ('trash-bag', R+3.5, -79.6, 10),
 ('wooden-crate', R-3.2, -81.2, 5), ('cardboard-box', R-3.0, -82.3, 40), ('manhole-cover', R+.5, -84.0, 0), ('old-tyre', R-3.4, -87.0, 0),
 ('wheel-rim', R-3.0, -87.7, 0), ('oil-barrel', R+3.3, -90.0, 0), ('rubble-stones', R+3.6, -93.5, 220), ('pipes', R-3.8, -96.0, 185),
 ('utility-box', R+2.9, -99.0, 270), ('cement-bag', R-3.1, -101.0, 20), ('road-barrier', R+3.2, -104.5, 86), ('fire-hydrant', R-2.8, -105.5, 270),
]
n = max(p['n'] for p in D['props'])+1; placed = []; skipped = []
for model, x, z, yaw in WISH:
    sx, sy, sz = SIZES[model]['size']; r = round(yaw/90) % 4; w, d = (sz, sx) if r % 2 else (sx, sz); solid = model in SOLID; flat = model == 'manhole-cover'
    spot = None
    for k in range(0, 33):                                  # the wish, then rings of 0.2 m steps round it
        ring, a = (k+7)//8, k*math.pi/4+(k//8)*.4; px, pz = x+math.cos(a)*ring*.4, z+math.sin(a)*ring*.4
        if flat and abs(px-RX) < 1.5 or not flat and free(px, pz, w+.1, d+.1, solid): spot = (px, pz); break
    if not spot: skipped.append((model, x, z)); continue
    px, pz = spot; fill(px-w/2-.1, px+w/2+.1, pz-d/2-.1, pz+d/2+.1)
    p = {'f': 'scan:'+model, 'n': n, 'k': model, 'y': 'scan', 's': [sx, sy, sz], 'p': [round(px, 3), .03 if flat else 0.0, round(pz, 3)], 'r': r, 'c': 'box' if solid else 'none'}
    if abs(yaw-r*90) % 360 > .5: p['a'] = round(math.radians(yaw), 4)
    D['props'].append(p); placed.append(p); n += 1
open(F, 'w').write(head.rstrip('\n').split('\n')[0].rstrip('.')+('' if 'scan-props-layout' in head else ', then tools/world/scan-props-layout.py')+'.\nwindow.worldPropsLayout='+json.dumps(D, separators=(',', ':'))+';\n')
print('placed', len(placed), 'scanned props;', 'left out', skipped)
