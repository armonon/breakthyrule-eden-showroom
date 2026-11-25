#!/usr/bin/env python3
"""Gather Beyond Eden's outdoor models into the Commons (the courtyard round the altar) and plan its trees.

  python3 tools/world/courtyard-layout.py collision.json

Runs after build-props-layout.py and rewrites world-props-layout.js in place: models from the street, park, market, fences
and ruins move in (those fixed to a building stay), each facing the altar, with every lane, the chests, the altar and the
landmarks' doors left open. collision.json: {walls:[[x,z,w,d,h]],surfaces:[[x0,x1,z0,z1,top,bottom]]} without the models'
own. Deterministic, and running it again gives the same result. Whatever does not fit stays where it was.
"""
import json, math, os, sys, hashlib
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'); F = os.path.join(ROOT, 'world-props-layout.js')
src = open(F).read(); D = json.loads(src[src.index('=', src.index('worldPropsLayout'))+1:].rstrip().rstrip(';'))
C = json.load(open(sys.argv[1])); L = json.load(open(os.path.join(ROOT, 'night-layout.json')))
CX, CZ, S, R = L['arena']['x'], L['arena']['z'], .25, 31
N = int(2*R/S); G = [bytearray(N) for _ in range(N)]
def cells(a, b, c, d):
    i0, i1 = max(0, math.floor((a-CX+R)/S)), min(N, math.ceil((b-CX+R)/S)); j0, j1 = max(0, math.floor((c-CZ+R)/S)), min(N, math.ceil((d-CZ+R)/S)); return i0, i1, j0, j1
def fill(a, b, c, d):
    i0, i1, j0, j1 = cells(a, b, c, d)
    for j in range(j0, j1): G[j][i0:max(i0, i1)] = b'\1'*max(0, i1-i0)
def free(a, b, c, d):
    if a < CX-R or b > CX+R or c < CZ-R or d > CZ+R: return False
    i0, i1, j0, j1 = cells(a, b, c, d); return not any(1 in G[j][i0:i1] for j in range(j0, j1))
for x, z, w, d, *_ in C['walls']: fill(x-w/2-.5, x+w/2+.5, z-d/2-.5, z+d/2+.5)
for a, b, c, d, top, bottom in C['surfaces']:
    if bottom < 2.5 and top > .1: fill(a-.4, b+.4, c-.4, d+.4)
fill(11.7-3.4, 11.7+3.4, -200, 0)                       # the brick road
fill(CX-R, CX+R, -66, -61)                              # the lane across, to the playhouse and the hotel
for s in L['landmarks']:
    x, f = s['x'], s['z']+s['d']/2
    fill(x-1.9, x+1.9, s['z']-s['d']/2-3, f+9.5); fill(x-5.2, x+5.2, f+3.4, f+9.5); fill(x-s['w']/2, x+s['w']/2, f+1.4, f+3.8)
    fill(x-s['w']/2-1.2, x+s['w']/2+1.2, s['z']-s['d']/2-1.2, f+1.2)
for j in range(N):
    for i in range(N):
        if math.hypot((i+.5)*S-R, (j+.5)*S-R) < 8.4: G[j][i] = 1
MOVE = {'ruins', 'park', 'fences', 'avenue', 'market', 'stores', 'street', 'street arches', 'asylum yard', 'courtyard'}
stay = [p for p in D['props'] if p['y'] not in MOVE]
for p in stay:
    if p['p'][1] < .1:
        w, d = (p['s'][2], p['s'][0]) if p['r'] % 2 else (p['s'][0], p['s'][2]); fill(p['p'][0]-w/2-.5, p['p'][0]+w/2+.5, p['p'][2]-d/2-.5, p['p'][2]+d/2+.5)
# Trees first: an inner grove that frames the altar, an outer one that closes the courtyard.
trees = []
def rnd(*k): return int(hashlib.md5(repr(k).encode()).hexdigest()[:8], 16)/0xffffffff
def tree(r, a, kind, s):
    for k in range(9):
        aa = a+(k-4)*.045*(1 if rnd(r, a) > .5 else -1)*(1 if k % 2 else -1); x, z = CX+math.cos(aa)*r, CZ+math.sin(aa)*r
        if free(x-.6, x+.6, z-.6, z+.6) and all(math.hypot(x-t['x'], z-t['z']) > (3.2 if kind == 'cypress' else 4.2) for t in trees):
            trees.append(dict(x=round(x, 2), z=round(z, 2), s=round(s, 2), k=kind, b=int(rnd(x, z) > .45))); fill(x-.55, x+.55, z-.55, z+.55); return
for i in range(8): tree(13.4, (i+.5)*math.pi/4+.12, 'jacaranda', .62+.16*rnd(i, 1))
for i in range(8): tree(10.6, (i+.5)*math.pi/4-.28, 'cypress', .52+.1*rnd(i, 7))
for i in range(16): tree(19.5+2*rnd(i, 2), i*math.pi/8+.2, 'jacaranda', .78+.22*rnd(i, 3))
for i in range(22): tree(26.5+2.5*rnd(i, 4), i*math.pi/11, 'jacaranda' if i % 3 else 'cypress', .95+.25*rnd(i, 5))
RING = [(8.6, 10.2, ['balustrade']),
        (9.2, 14, ['fountain', 'statue', 'shrine', 'obelisk', 'armillary', 'sundial', 'birdbath', 'pedestal', 'lamp-post', 'lantern', 'brazier', 'bench', 'gargoyle', 'planter', 'bollard', 'milestone', 'basin']),
        (12, 20, ['market-stall', 'well', 'torii-frame', 'signpost', 'trough', 'cart', 'pot', 'amphora', 'barricade', 'sandbag-stack', 'crate', 'anvil', 'fireplace', 'boulder', 'gurney', 'steps', 'arched-doorway', 'bust', 'urn']),
        (16, 30, ['street-arch', 'battlement-wall', 'turret-top', 'spiral-staircase', 'straight-staircase', 'iron-gate', 'portcullis', 'wall-section', 'balcony', 'chimney-stack', 'barred-window'])]
moving = [p for p in D['props'] if p['y'] in MOVE]; done = 0; used = {}
def place(p, lo, hi, gap):
    key = p['n']; start = rnd(key)*2*math.pi; best = None
    for rr in range(int((hi-lo)/.5)+1):
        r = lo+rr*.5; n = max(24, int(r*8))
        for i in range(n):
            a = start+i*2*math.pi/n; x, z = CX+math.cos(a)*r, CZ+math.sin(a)*r; dx, dz = CX-x, CZ-z
            t = (0 if dz > 0 else 2) if abs(dz) >= abs(dx) else (1 if dx > 0 else 3)
            w, d = (p['s'][2], p['s'][0]) if t % 2 else (p['s'][0], p['s'][2])
            if free(x-w/2-gap, x+w/2+gap, z-d/2-gap, z+d/2+gap): return x, z, t, w, d
    return None
for lo, hi, kinds in RING:
    items = [p for p in moving if p['k'] in kinds]; items.sort(key=lambda p: (-(p['s'][0]*p['s'][2] > 3), kinds.index(p['k']), p['n']) if lo > 14 else (rnd(p['n'], 'o'),))
    for p in items:
        for gap in (.75, .5):
            q = place(p, lo, hi, gap) or place(p, lo, 30, gap)
            if q: break
        if not q: continue
        x, z, t, w, d = q; p.update(p=[round(x, 3), 0.0, round(z, 3)], r=t, y='courtyard'); fill(x-w/2, x+w/2, z-d/2, z+d/2); done += 1
D['courtyard'] = {'x': CX, 'z': CZ, 'r': 30, 'trees': trees}
open(F, 'w').write('// Generated by tools/world/build-props-layout.py, then tools/world/courtyard-layout.py.\nwindow.worldPropsLayout='+json.dumps(D, separators=(',', ':'))+';\n')
print('moved', done, 'of', len(moving), 'outdoor models; trees', len(trees), '| not moved', len(moving)-done)
