#!/usr/bin/env python3
"""Place the asset workshop's models in Beyond Eden and the garden: writes world-props-layout.js, read by world-props.js.

  uv run --no-project --with numpy python tools/world/build-props-layout.py manifest.json collision.json slices.json garden.json

manifest: the workshop's models; collision: the district's walls and surfaces; slices: each landmark's mesh cut into
three height bands on a 12.5 cm grid; garden: solid points and plants. Deterministic. Models face +Z at turn 0 (seen
on the front renders), and turns are quarter turns, so in the district a model's collision is its measured box.
"""
import json, struct, sys, os, math
import numpy as np
from collections import Counter, defaultdict
M, C, SL, GD = [json.load(open(p)) for p in sys.argv[1:5]]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
L = json.load(open(os.path.join(ROOT, 'night-layout.json'))); LM = {s['id']: s for s in L['landmarks']}
FAM = 'wood limestone sandstone granite terracotta bronze iron wooden stone'.split()
ADJ = 'plain sturdy worn ancient chipped old ornate rustic weathered simple'.split()
def kind(a):
    p = a.replace('white-painted-', '').split('-')
    while p and p[0] in ADJ: p = p[1:]
    if len(p) > 1 and p[0] in FAM: p = p[1:]
    return {'road-milestone': 'milestone', 'armillary-sphere': 'armillary', 'lion-statue': 'statue'}.get('-'.join(p), '-'.join(p))
def size(p):
    d = open(p, 'rb').read(); n = struct.unpack('<I', d[12:16])[0]; g = json.loads(d[20:20+n])
    a = g['accessors'][g['meshes'][0]['primitives'][0]['attributes']['POSITION']]
    return [round(b-c, 3) for b, c in zip(a['max'], a['min'])]
# From the contact sheet. Shattered: floating fragments, left out. Rough: a plain block, only good as rubble.
SHATTERED = {107,133,216,243,271,284,295,305,399,437,601,602,648,709,724,748,750,769,774,777,782,784}
ROUGH = {8,9,47,49,50,53,54,55,56,57,58,60,105,143,334,341,514,522,612,632,706,720,722,723,781}
# Models after FIRST are added in a second pass, so what is already in the game never moves.
FIRST = 780
pool = defaultdict(list); later = defaultdict(list); shattered = []
for o in M:
    if 'dup' in o: continue
    o['k'] = kind(o['asset']); o['s'] = size(o['glb'])
    if o['n'] in SHATTERED: shattered.append(o['n'])
    else: (later if o['n'] > FIRST else pool)['rubble' if o['n'] in ROUGH else o['k']].append(o)
S = .125; X0, X1, Z0, Z1 = -77.5, 97.5, -110, -27; NX, NZ = int((X1-X0)/S), int((Z1-Z0)/S)
solid = np.zeros((NZ, NX), bool); keep = np.zeros((NZ, NX), bool)  # keep: free ground that must stay open
def cut(a, b, c, d): return slice(max(0, math.floor((c-Z0)/S+1e-6)), max(0, math.ceil((d-Z0)/S-1e-6))), slice(max(0, math.floor((a-X0)/S+1e-6)), max(0, math.ceil((b-X0)/S-1e-6)))
def fill(g, a, b, c, d): g[cut(a, b, c, d)] = True
for x, z, w, d, *_ in C['walls']: fill(solid, x-w/2, x+w/2, z-d/2, z+d/2)
for a, b, c, d, top, bottom in C['surfaces']:
    if bottom < 2.5 and top > .1: fill(solid, a, b, c, d)
for s in SL.values():
    g = np.zeros(s['nx']*s['nz'], bool)
    for band in s['g']: g |= np.frombuffer(band.encode(), np.uint8) == 49
    for j, i in np.argwhere(g.reshape(s['nz'], s['nx'])):
        z, x = s['z0']+j*S, s['x0']+i*S; jj, ii = int((z-Z0)/S), int((x-X0)/S)
        if 0 <= jj < NZ and 0 <= ii < NX: solid[jj, ii] = True
A = L['arena']; zz, xx = np.mgrid[0:NZ, 0:NX]; keep |= np.hypot(X0+(xx+.5)*S-A['x'], Z0+(zz+.5)*S-A['z']) < A['r']
fill(keep, 11.7-4.2, 11.7+4.2, -120, 0); fill(keep, 5, 19, -30, 0)
fill(keep, 15, 28, -42, -27); fill(keep, -2, 7, -43, -27); fill(keep, 55, 75, -83, -64)  # parkour courses
fill(keep, 74.2, 99, -112, -75.2); fill(keep, 66, 76, -96.5, -89.5)                      # the castle, and the way to its gate
for s in L['landmarks']:
    x, f = s['x'], s['z']+s['d']/2
    fill(keep, x-1.7, x+1.7, s['z']-s['d']/2-3, f+9.5)       # through both doors
    fill(keep, x-5.2, x+5.2, f+3.4, f+9.5)                     # match bots and supply drops
    fill(keep, x-s['w']/2+1, x+s['w']/2-1, f+1.9, f+3.5)      # weapon pads
    fill(keep, min(x, 11.7)-1, max(x, 11.7)+1, f+1.4, f+4.6)  # the lane from the road
for i in ('temple', 'observatory', 'gardens', 'playhouse'):
    s = LM[i]; fill(keep, s['x']-s['w']/2, s['x']+s['w']/2, s['z']-s['d']/2, s['z']+s['d']/2)
indoor = np.zeros((NZ, NX), bool)   # only a room's own furniture goes inside
for s in L['landmarks']:
    if s['id'] != 'gardens': fill(indoor, s['x']-s['w']/2, s['x']+s['w']/2, s['z']-s['d']/2, s['z']+s['d']/2)
out = []
def rect(x, z, o, turn):
    w, d = (o['s'][2], o['s'][0]) if turn % 2 else (o['s'][0], o['s'][2]); return x-w/2, x+w/2, z-d/2, z+d/2
def clear(r, gap=0, lanes=True):
    a, b, c, d = r
    if a-gap < X0 or b+gap > X1 or c-gap < Z0 or d+gap > Z1: return False
    q = cut(a-gap, b+gap, c-gap, d+gap); p = cut(a, b, c, d)
    return not solid[q].any() and not (lanes and keep[p].any())
def put(o, x, z, turn, y=0, c='box', scene='', mark=True):
    out.append(dict(f=o['file'], n=o['n'], k=o['k'], y=scene, s=o['s'], p=[round(x, 3), round(y, 3), round(z, 3)], r=turn % 4, c=c)); o['used'] = 1
    if mark: fill(solid, *rect(x, z, o, turn))
def left(*ks): return [o for k in ks for o in pool[k] if not o.get('used')]
def facing(o, n): # turn so the model's front looks along wall normal n; pieces modelled sideways get a quarter turn
    t = {(0, 1): 0, (1, 0): 1, (0, -1): 2, (-1, 0): 3}[n]
    return t+1 if (o['k'] in ('radiator', 'weapon-rack', 'filing-cabinet', 'bookcase') and o['s'][2] > o['s'][0]*1.4) or (o['k'] in ('asylum-bed', 'four-poster-bed') and o['s'][0] > o['s'][2]*1.25) else t
def along_wall(o, plane, n, lo, hi, gap, scene, y=0, reach=.9, c='box', want=None):
    """Back o onto the wall at `plane` (an x for n=(+-1,0), a z for n=(0,+-1)), facing n, somewhere in lo..hi."""
    t = facing(o, n); a, b, cc, d = rect(0, 0, o, t); w, dep = (d-cc, b-a) if n[0] else (b-a, d-cc)
    ps = np.arange(lo+w/2, hi-w/2+1e-6, .125)
    for p in sorted(ps, key=lambda v: abs(v-(want if want is not None else lo))):
        for off in np.arange(.03, reach, .0625):
            q = plane+n[0 if n[0] else 1]*(off+dep/2); x, z = (q, p) if n[0] else (p, q); r = rect(x, z, o, t)
            if clear(r):
                g = (r[0], r[1], r[2]-gap, r[3]+gap) if n[0] else (r[0]-gap, r[1]+gap, r[2], r[3])
                if solid[cut(*(g[0]+.1 if n[0] else g[0], g[1]-.1 if n[0] else g[1], g[2] if n[0] else g[2]+.1, g[3] if n[0] else g[3]-.1))].any(): break
                put(o, x, z, t, y, c, scene); return True
    return False
def room_walls(s, inset=.3):
    x, z, w, d = s['x'], s['z'], s['w'], s['d']
    return [(x-w/2+inset, (1, 0), z-d/2+.5, z+d/2-.5), (x+w/2-inset, (-1, 0), z-d/2+.5, z+d/2-.5),
            (z-d/2+inset, (0, 1), x-w/2+.4, x-1.9), (z-d/2+inset, (0, 1), x+1.9, x+w/2-.4), (z+d/2-inset, (0, -1), x-w/2+.4, x-1.9), (z+d/2-inset, (0, -1), x+1.9, x+w/2-.4)]
def furnish(ids, wall, free, scene):
    items = left(*wall); items = [o for t in zip_kinds(items) for o in t]
    for o in items:
        for i in ids:
            if any(along_wall(o, p, n, lo, hi, .25, scene) for p, n, lo, hi in room_walls(LM[i])): break
    for o in [o for t in zip_kinds(left(*free)) for o in t]:
        for i in ids:
            s = LM[i]; done = False
            for dz in np.arange(-s['d']/2+2, s['d']/2-2, .25):
                for side in (-1, 1):
                    for dx in np.arange(2.3, s['w']/2-.8, .25):
                        x, z = s['x']+side*dx, s['z']+dz
                        if clear(rect(x, z, o, 0), .75): put(o, x, z, 0, scene=scene); done = True; break
                    if done: break
                if done: break
            if done: break
def zip_kinds(items):
    by = defaultdict(list)
    for o in items: by[o['k']].append(o)
    n = max([len(v) for v in by.values()] or [0]); return [[v[i] for v in by.values() if i < len(v)] for i in range(n)]
# ---- the castle's keep: furniture clear of its stairs, partitions and doors (castle coordinates), chandeliers overhead
def keep_room(items, y, x0, x1, z0, z1):
    x, z, row = x0, z0, 0
    for o in items:
        sx, sy, sz = o['s']
        if o.get('used') or sy > 2.6: continue
        if x+sx > x1: x, z, row = x0, z+row+.8, 0
        if x+sx > x1 or z+sz > z1: continue
        put(o, 87+x+sx/2, -93+z+sz/2, 0, y, scene='castle', mark=False); x += sx+.8; row = max(row, sz)
for (c, ps), _ in zip([(3.35, [(1.9, z) for z in (-6.5, -3.2, 0, 3.2, 6.5)]), (6.95, [(2, z) for z in (-6.5, -3.4, 2.2, 4.6, 6.8)]), (10.55, [(3.4, z) for z in (-7, -5.2, 0, 5.2, 7)])], range(3)):
    for (x, z), o in zip(ps, left('chandelier')): put(o, 87+x, -93+z, 0, c-o['s'][1], 'none', 'castle', False)
keep_room(left('throne')[:1]+left('chest')[:2], 0, 3.9, 5.7, -8, -3); keep_room(left('suit-of-armour')[:3], 0, 3.9, 5.7, 3, 7.4)
keep_room(left('bookcase')[:2], 3.6, 3.4, 5.6, -3.6, -.6); keep_room(left('chest')[:2], 3.6, 3.4, 5.6, .6, 3.6)
keep_room(left('four-poster-bed')[:1], 7.2, 2.4, 5.6, -2.6, 2.6); keep_room(left('weapon-rack')[:2], 7.2, 2.4, 5.6, 4.2, 7.4)
keep_room(left('barrel', 'crate')[:5], 0, -9.2, -6.2, -8.5, -4); keep_room(left('trough', 'anvil')[:3], 0, -9.2, -6.2, 4, 8)
# ---- the garden of Eden first, so it gets the best of the sculpture
GS = .25; gx0, gz0 = -20, -20; G = np.zeros((int(47/GS), int(40/GS)), bool)
def gmark(x, z, r):
    a, b, c, d = [int((v-o)/GS) for v, o in ((x-r, gx0), (x+r+GS, gx0), (z-r, gz0), (z+r+GS, gz0))]; G[max(0, c):max(0, d), max(0, a):max(0, b)] = True
for x, z in GD['solid']: gmark(x, z, .4)
for x, z, h, name in GD['trees']:
    if name == 'Garden of Eden' and h > 1.3: gmark(x, z, .3)
for p in json.load(open(os.path.join(ROOT, 'assets/props/scene.json')))['props']:
    for q in p['placements']: gmark(q['position'][0], q['position'][2], p['radius']+.5)
px = lambda z: math.sin((z-3)*.15)*1.5
for z in np.arange(-8, 26, .25): gmark(px(z) if z < 22 else -2.2, z, 1.45)
for z in np.arange(-20, -8, .25): gmark(11.7, z, 3.4)
for i in range(60): t = i/59; gmark(px(-5)+(11.7-px(-5))*t, -5-5*t, 1.5)   # toward the library and the road door
gmark(-11, 11, 8.8); gmark(-9.8, -1, 4.6); gmark(3.1, -5.7, 4.8); gmark(9.9, -9, 3.2)
garden = []
def gput(o, x, z, look, reach=2.2):
    if o is None: return False
    r = max(o['s'][0], o['s'][2])/2
    for rr in np.arange(0, reach+1.3, .25):
        for a in np.arange(0, 6.28, .4):
            qx, qz = x+math.cos(a)*rr, z+math.sin(a)*rr
            if abs(qx) > 18.5 or qz > 24.6 or qz < -18 or math.hypot(qx, qz) > 25.5: continue
            m = r+.2; q = G[max(0, int((qz-m-gz0)/GS)):int((qz+m-gz0)/GS)+1, max(0, int((qx-m-gx0)/GS)):int((qx+m-gx0)/GS)+1]
            if q.size and not q.any():
                gmark(qx, qz, r+.1); o['used'] = 1
                garden.append(dict(f=o['file'], n=o['n'], k=o['k'], y='garden', s=o['s'], p=[round(qx, 2), -.08, round(qz, 2)], a=round(math.atan2(look[0]-qx, look[1]-qz), 3), c='round')); return True
    return False
def take(k): l = left(k); return l[0] if l else None
CX, CZ = 11.5, 18.5   # the sculpture court, on the open south-east lawn
gput(take('fountain'), CX, CZ, (CX, CZ+9))
for i, k in enumerate(['statue', 'column', 'bust', 'statue', 'column', 'bust', 'statue', 'column']):
    a = i*math.pi/4+.4; gput(take(k), CX+math.cos(a)*5, CZ+math.sin(a)*4.6, (CX, CZ), 1.5)
for i, k in enumerate(['bench', 'planter', 'bench', 'planter', 'bench', 'urn']): a = i*math.pi/3; gput(take(k), CX+math.cos(a)*2.9, CZ+math.sin(a)*2.9, (CX, CZ), 1)
for i, (k, z) in enumerate(zip(['urn', 'bust', 'lantern', 'pot', 'sundial', 'birdbath', 'amphora', 'lantern', 'armillary', 'urn', 'pedestal', 'pot', 'obelisk', 'bust', 'lantern', 'amphora', 'planter', 'gate-pillar', 'gate-pillar'], np.arange(-3, 22, 1.35))):
    sd = 1 if i % 2 else -1; gput(take(k), px(z)+sd*2.3, z, (px(z), z), 2)
for i, k in enumerate(['basin', 'birdbath', 'boulder', 'bench', 'lantern', 'basin', 'boulder', 'pot', 'amphora', 'boulder']): a = i*math.pi/5; gput(take(k), 5.7+math.cos(a)*5.4, 3.5+math.sin(a)*7.2, (5.7, 3.5), 2)
for k, x, z in [('armillary', 16, 2), ('shrine', 16.5, 7), ('obelisk', 17, -6), ('fountain', -15, 8), ('birdbath', -17, -8), ('shrine', -16, -13), ('well', 7, 21), ('cart', -17, 24), ('torii-frame', 17, 12), ('statue', -6, -14), ('sundial', 4, 23), ('column', -14, -10), ('urn', 8.2, -13), ('urn', 15.2, -13), ('gate-pillar', 8, -17), ('gate-pillar', 15.4, -17), ('basin', 18, 19), ('amphora', 2, 18), ('pedestal', 17, 22), ('armillary', 5, 17), ('bust', -14, 23), ('trough', -18, 14)]:
    gput(take(k), x, z, (0, 4), 3.5)
# ---- rooms
furnish(['girard', 'latheatre'], ['asylum-bed', 'radiator'], ['wheelchair', 'gurney'], 'asylum ward')
furnish(['methodist', 'latheatre'], ['bathtub', 'washbasin', 'medicine-cabinet'], ['operating-table', 'examination-chair'], 'asylum treatment')
furnish(['vibiana', 'latheatre'], ['filing-cabinet', 'cell-door'], ['desk', 'stool'], 'asylum records')
furnish(['hotel', 'baptist', 'stjames', 'christian'], ['fireplace', 'four-poster-bed', 'throne'], ['banquet-table'], 'great rooms')
furnish(['firstcong', 'christian'], ['bookcase'], ['table'], 'library')
furnish(['immanuel', 'christian'], ['weapon-rack', 'suit-of-armour', 'chest'], ['anvil'], 'armoury')
# ---- doors flanked by pairs, wall torches beside them
pairs = iter([o for k in ('gargoyle', 'statue', 'brazier', 'urn', 'gate-pillar', 'column', 'bust', 'bell') for o in left(k)])
for s in L['landmarks']:
    f = s['z']+s['d']/2
    if s['id'] == 'gardens': continue
    for sd in (-1, 1):
        for _ in range(3):
            o = next(pairs, None)
            if o is None: break
            if along_wall(o, f+.2, (0, 1), s['x']+(2.1 if sd > 0 else -s['w']/2), s['x']+(s['w']/2 if sd > 0 else -2.1), .1, 'doorways', want=s['x']+sd*3, reach=1.6) and True: break
        o = take('wall-torch'); sl = SL[s['id']]
        if o:
            band = np.frombuffer(sl['g'][2].encode(), np.uint8).reshape(sl['nz'], sl['nx']) == 49
            i = int((s['x']+sd*2.35-sl['x0'])/S); col = np.where(band[:, i-1:i+2].any(1))[0]
            if len(col):
                z = sl['z0']+(col.max()+1)*S
                if abs(z-f) < 1.5: put(o, s['x']+sd*2.35, z+o['s'][2]/2-.04, 0, 1.75, 'none', 'doorways', False)
# ---- against the buildings' outside walls
def outside(ks, scene, per, gap=.5, ids=None):
    n = Counter()
    for o in [o for t in zip_kinds(left(*ks)) for o in t]:
        for s in (L['landmarks'] if not ids else [LM[i] for i in ids]):
            if n[s['id']] >= per or s['id'] in ('gardens', 'temple', 'observatory'): continue
            x, z, w, d = s['x'], s['z'], s['w'], s['d']
            if any(along_wall(o, p, nn, lo, hi, gap, scene, reach=1.2) for p, nn, lo, hi in [(x-w/2-.25, (-1, 0), z-d/2, z+d/2), (x+w/2+.25, (1, 0), z-d/2, z+d/2), (z-d/2-.25, (0, -1), x-w/2, x-2), (z-d/2-.25, (0, -1), x+2, x+w/2)]): n[s['id']] += 1; break
outside(['scaffold-tower', 'ladder'], 'building works', 2); outside(['drainpipe'], 'drains', 2); outside(['castle-door', 'arched-doorway'], 'side doors', 3); outside(['crate', 'barrel', 'cart', 'barricade', 'sandbag-stack'], 'stores', 3)
# ---- arches over the lanes from the road, opening along the lane
for s in sorted(L['landmarks'], key=lambda s: abs(s['x']-11.7)):
    f = s['z']+s['d']/2+3; sd = 1 if s['x'] > 11.7 else -1
    for dist in (8, 10, 12, 14, 16):
        o = take('street-arch')
        x = 11.7+sd*(abs(s['x']-11.7)-s['w']/2-2 if abs(s['x']-11.7) > 45 else dist)
        if o and min(o['s'][0], 9) > 2.2 and math.hypot(x-A['x'], f-A['z']) > A['r']+2 and clear(rect(x, f, o, 1), .3, False): put(o, x, f, 1, c='posts', scene='street arches'); break
# ---- spots: nearest free place to an anchor, facing a point, with a walkable gap
def near(o, ax, az, turn, gap, reach, scene, c='box'):
    best = None
    for dx in np.arange(-reach, reach+.1, .5):
        for dz in np.arange(-reach, reach+.1, .5):
            q = dx*dx+dz*dz
            if q <= reach*reach and (best is None or q < best[0]) and clear(rect(ax+dx, az+dz, o, turn), gap) and not indoor[cut(*rect(ax+dx, az+dz, o, turn))].any(): best = (q, ax+dx, az+dz)
    if best: put(o, best[1], best[2], turn, c=c, scene=scene)
    return bool(best)
# the avenue to the pyramid, and the market either side of it
z = -88.5
for o in [o for t in zip_kinds(left('balustrade', 'obelisk', 'milestone', 'bollard', 'column')) for o in t]:
    for sd in (-1, 1):
        if near(o, 11.7+sd*5.6, -97.5, (3 if sd > 0 else 1), .55, 12, 'avenue'): break
for i, o in enumerate(left('market-stall')): near(o, 11.7+(10 if i % 2 else -10), -90-(i//2)*2.6, 3 if i % 2 else 1, .7, 9, 'market')
for i, o in enumerate(left('lamp-post', 'signpost', 'lantern')): near(o, [-30, 11.7+5.2, 50, 11.7-5.2, -30, 30][i % 6], [-60, -88, -58, -88, -84, -40][i % 6]-(i//6)*4, 0, .3, 14, 'street')
for i, o in enumerate(left('barrel', 'crate', 'cart', 'sandbag-stack', 'trough', 'pot', 'amphora', 'table', 'bench', 'stool', 'basin', 'planter', 'barricade', 'ladder')): near(o, 11.7+(12 if i % 2 else -12), -98, 1, .6, 16, 'market')
# the gardens landmark, and the park around it
for o in left('torii-frame', 'statue', 'bust', 'urn', 'fountain', 'birdbath', 'sundial', 'pedestal', 'shrine', 'gate-pillar', 'armillary', 'well', 'bell', 'brazier', 'gargoyle', 'street-arch', 'arched-doorway'):
    near(o, -30, -92, 0, .7, 22, 'park', 'posts' if o['k'] in ('torii-frame', 'street-arch', 'arched-doorway') else 'box')
# fences: gates and portcullises along the castle's outer side and the park's far edge
for o in [o for t in zip_kinds(left('iron-gate', 'portcullis')) for o in t]:
    for x, lo, hi in ((72.6, -110, -97.5), (72.6, -88.5, -76), (-29, -110, -60), (50.5, -110, -60), (-57, -110, -60)):
        done = False
        for zc in np.arange(lo+1.5, hi-1.5, .25):
            if clear(rect(x, zc, o, 3), .12) and not indoor[cut(*rect(x, zc, o, 3))].any(): put(o, x, zc, 3, scene='fences'); done = True; break
        if done: break
# ruins and masonry on the waste ground round the castle and the far east
for o in sorted(left('battlement-wall', 'turret-top', 'spiral-staircase', 'straight-staircase', 'steps', 'wall-section', 'boulder', 'chimney-stack', 'balcony', 'column', 'milestone', 'rubble'), key=lambda o: -o['s'][0]*o['s'][2]):
    near(o, 78, -42, o['n'] % 4, .8, 20, 'ruins') or near(o, 50, -100, o['n'] % 4, .8, 16, 'ruins') or near(o, 76, -68, o['n'] % 4, .8, 14, 'ruins') or near(o, -30, -60, o['n'] % 4, .8, 22, 'ruins') or near(o, -60, -106, o['n'] % 4, .8, 18, 'ruins')
for o in left('barred-window', 'wall-torch', 'cell-door', 'castle-door'): pass   # no wall left that suits them
for i, o in enumerate(left('wheelchair', 'gurney', 'asylum-bed', 'radiator', 'bathtub', 'washbasin')): near(o, -57, -66, i % 4, .8, 20, 'asylum yard')
# ---- later models: each goes to the scene its kind belongs to, around what is there
for k, v in later.items(): pool[k] += v
furnish(['girard', 'latheatre', 'methodist', 'vibiana'], ['asylum-bed', 'radiator', 'bathtub', 'washbasin', 'medicine-cabinet'], ['wheelchair', 'gurney', 'operating-table', 'examination-chair'], 'asylum treatment')
furnish(['vibiana', 'latheatre'], ['filing-cabinet', 'cell-door'], ['desk', 'stool'], 'asylum records')
furnish(['hotel', 'baptist', 'stjames', 'christian'], ['fireplace', 'four-poster-bed', 'throne'], ['banquet-table'], 'great rooms')
furnish(['firstcong', 'christian'], ['bookcase'], ['table'], 'library')
furnish(['immanuel', 'christian'], ['weapon-rack', 'suit-of-armour', 'chest'], ['anvil'], 'armoury')
outside(['scaffold-tower', 'ladder'], 'building works', 2); outside(['drainpipe'], 'drains', 2); outside(['castle-door', 'arched-doorway'], 'side doors', 3)
for o in left('barrel', 'crate', 'cart', 'trough', 'pot', 'amphora', 'table', 'bench', 'stool', 'basin', 'planter', 'barricade'): near(o, 11.7+(12 if o['n'] % 2 else -12), -98, 1, .6, 16, 'market')
for o in left('statue', 'bust', 'urn', 'fountain', 'birdbath', 'sundial', 'pedestal', 'shrine', 'gate-pillar', 'armillary', 'well', 'bell', 'brazier', 'gargoyle'): near(o, -30, -92, 0, .7, 22, 'park')
for o in left('balustrade', 'obelisk', 'milestone', 'bollard', 'column'): near(o, 11.7+(5.6 if o['n'] % 2 else -5.6), -97.5, 3 if o['n'] % 2 else 1, .55, 12, 'avenue')
for o in left('battlement-wall', 'turret-top', 'spiral-staircase', 'straight-staircase', 'steps', 'wall-section', 'boulder', 'chimney-stack', 'balcony', 'rubble'):
    near(o, 78, -42, o['n'] % 4, .8, 20, 'ruins') or near(o, 50, -100, o['n'] % 4, .8, 16, 'ruins') or near(o, 76, -68, o['n'] % 4, .8, 14, 'ruins') or near(o, -30, -60, o['n'] % 4, .8, 22, 'ruins') or near(o, -60, -106, o['n'] % 4, .8, 18, 'ruins')
unplaced = [o for v in pool.values() for o in v if not o.get('used')]
open(os.path.join(ROOT, 'world-props-layout.js'), 'w').write('// Generated by tools/world/build-props-layout.py.\nwindow.worldPropsLayout=' + json.dumps({'version': 2, 'props': out, 'garden': garden}, separators=(',', ':')) + ';\n')
print('district', len(out), dict(Counter(o['y'] for o in out)))
print('garden', len(garden), dict(Counter(o['k'] for o in garden)))
print('left out: shattered', len(shattered), '| no sensible place', len(unplaced), dict(Counter(o['k'] for o in unplaced)))
