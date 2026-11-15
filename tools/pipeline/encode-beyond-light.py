#!/usr/bin/env python3
"""Encode the Beyond Cycles bake. Runtime irradiance = Cycles DIFFUSE bake * pi."""
import sys,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
src,out=map(Path,sys.argv[1:3]);out.mkdir(parents=True,exist_ok=True)
meta=json.loads((src/'probes.json').read_text())
ground=np.maximum(0,np.load(src/'ground_indirect.npy'))*np.pi
probes=np.maximum(0,np.load(src/'probes.npy'))*np.pi
sun=np.clip(np.load(src/'ground_sun.npy'),0,1)
visibility=np.clip(np.load(src/'probe_sun.npy'),0,1)
assert all(np.isfinite(a).all() for a in [ground,probes,sun,visibility])
scale=float(max(.01,np.percentile(ground,99.9),np.percentile(probes,99.9))*1.2)
def blur(a):
 p=np.pad(a,[(1,1),(1,1)]+([(0,0)] if a.ndim==3 else []),mode='edge')
 return sum(p[y:y+a.shape[0],x:x+a.shape[1]] for y in range(3) for x in range(3))/9
Image.fromarray((np.sqrt(np.clip(blur(ground)/scale,0,1))[::-1]*255+.5).astype('uint8')).save(out/'lightmap.jpg',quality=94,subsampling=0)
Image.fromarray((blur(sun)[::-1]*255+.5).astype('uint8')).save(out/'sun.jpg',quality=94)
mean=probes.mean(axis=3);lum=probes@np.array([.2126,.7152,.0722]);L=lum.mean(axis=3)[...,None]+1e-5
d=np.stack([lum[...,0]-lum[...,1],lum[...,2]-lum[...,3],lum[...,4]-lum[...,5]],-1)/2/L
A=np.concatenate([np.sqrt(np.clip(mean/scale,0,1)),np.ones(mean.shape[:-1]+(1,))],-1)
B=np.concatenate([np.clip(d*.5+.5,0,1),visibility[...,None]],-1)
(np.concatenate([A,B],-1)*255+.5).astype('uint8').tofile(out/'probes.bin')
meta.update(scale=scale,format=2,unit='linear irradiance; RGB=sqrt(irradiance/scale), probe B alpha=moon visibility',lighting=json.loads((src/'lighting.json').read_text()))
meta['assets']={n:hashlib.sha256((out/n).read_bytes()).hexdigest() for n in ['lightmap.jpg','sun.jpg','probes.bin']}
(out/'bake.json').write_text(json.dumps(meta,indent=2)+'\n')
(out/'CREDITS.txt').write_text('Beyond Eden lighting bake — generated for Break Thy Rule in Blender Cycles.\nDerived only from existing project geometry and materials; source licences remain in assets/night/SOURCE.md and the Eden foliage asset credits.\nReproduce with tools/agent/export-static-scene.mjs, tools/blender/bake_beyond_light.py and tools/pipeline/encode-beyond-light.py.\n')
print(json.dumps({'scale':scale,'groundMean':float(ground.mean()),'probeMean':float(mean.mean()),'dims':meta['dims'],'bytes':sum(p.stat().st_size for p in out.iterdir())}))
