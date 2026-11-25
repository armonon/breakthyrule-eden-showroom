#!/usr/bin/env python3
"""Open sightlines through the Commons' trees: python3 tools/world/thin-grove.py
Runs after courtyard-layout.py. Takes out the trees that stand between the altar and the fronts of the landmarks round it and
two from the inner ring that hid the lamps, and leaves the rest of world-props-layout.js as it is. Running it again changes nothing."""
import json, os
F = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'world-props-layout.js'); s = open(F).read()
i = s.index('=', s.index('worldPropsLayout')) + 1; tail = ';' if s.rstrip().endswith(';') else ''; end = '\n' if s.endswith('\n') else ''
D = json.loads(s[i:].rstrip().rstrip(';'))
OUT = [(26.71, -47.66), (29.14, -72.28), (-3.3, -76.92), (-1.35, -47.01), (40.05, -56.44), (17.31, -49.7), (6.14, -74.05), (20.34, -42.57), (-15.68, -53.87)]
T = D['courtyard']['trees']; D['courtyard']['trees'] = [t for t in T if (t['x'], t['z']) not in OUT]
open(F, 'w').write(s[:i] + json.dumps(D, separators=(',', ':')) + tail + end); print(len(T), '->', len(D['courtyard']['trees']))
