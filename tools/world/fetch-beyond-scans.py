#!/usr/bin/env python3
"""Beyond Eden's photo-scanned surfaces and street props: CC0 scans from polyhaven.com.

  python3 tools/world/fetch-beyond-scans.py <work dir>            download the raw 1k sets (work dir is NOT in the repo)
  python3 tools/world/fetch-beyond-scans.py <work dir> --pack     also write the web copies to assets/beyond-eden/scan/

Requests carry a generic user agent and nothing else (no account, no key, no personal data). Only assets Poly Haven
publishes as CC0 are listed here; CREDITS.txt in the output folder names each one with its page.

--pack needs ffmpeg and cwebp on the PATH for the textures, and for the models node with @gltf-transform/core,
/extensions, /functions, meshoptimizer and sharp (the same packages tools/asset-pipeline uses); point NODE_MODULES at a
node_modules folder that has them if tools/asset-pipeline/node_modules is not installed.

Textures become three files per surface (matrix-world.js builds its two texture arrays from them):
  <layer>-d.webp  albedo            <layer>-n.webp  OpenGL normal
  <layer>-m.webp  grey, 1024 x 2048: roughness on top, height below
Models become one meshopt + WebP .glb each, simplified to a street prop's budget, origin on the ground at the centre.
"""
import json, os, subprocess, sys, tempfile, urllib.request
WORK = os.path.abspath(sys.argv[1]); PACK = '--pack' in sys.argv
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); OUT = os.path.join(ROOT, 'assets', 'beyond-eden', 'scan')
UA = {'User-Agent': 'asset-fetch'}
# layer name (the order is the layer index in matrix-world.js) -> Poly Haven texture
TEXTURES = [('asphalt', 'asphalt_04'), ('concrete', 'cracked_concrete'), ('paving', 'concrete_pavement'),
            ('plaster', 'worn_plaster_wall'), ('brick', 'red_brick_plaster_patch_02'), ('rust', 'rusty_metal_sheet')]
# Poly Haven model -> (file name, triangles kept at most, texture size, options). Options: keep = only nodes whose name
# matches (several sets ship a clean and an aged copy side by side: the aged one is used); lay = turn it to lie on the
# ground; heap = scale and pile the set's loose stones into one rubble heap.
MODELS = {'concrete_road_barrier_02': ('road-barrier', 2600, 1024, {}), 'metal_trash_can': ('trash-can', 2600, 512, {'keep': '_rust'}), 'trashbag': ('trash-bag', 1800, 512, {}),
          'wooden_crate_02': ('wooden-crate', 1800, 512, {}), 'plastic_crate_01': ('plastic-crate', 2600, 512, {}), 'old_tyre': ('old-tyre', 1800, 512, {'lay': 1}),
          'cement_bag': ('cement-bag', 844, 512, {}), 'cardboard_box_01': ('cardboard-box', 1600, 512, {}), 'barrel_03': ('oil-barrel', 1473, 512, {}),
          'rusted_wheel_rim_01': ('wheel-rim', 2200, 512, {'lay': 1}), 'utility_box_01': ('utility-box', 2200, 512, {}), 'fire_hydrant': ('fire-hydrant', 3000, 512, {'keep': '_aged'}),
          'water_manhole_cover': ('manhole-cover', 1200, 512, {}), 'namaqualand_stones_01': ('rubble-stones', 3600, 1024, {'heap': 1}),
          'modular_industrial_pipes_01': ('pipes', 3000, 1024, {'keep': 'pipe0[123]$', 'lay': 1})}
def get(url, path):
    if os.path.exists(path) and os.path.getsize(path): return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r, open(path, 'wb') as f: f.write(r.read())
def files(name):
    with urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + name, headers=UA), timeout=60) as r: return json.load(r)
def info(name):
    with urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/info/' + name, headers=UA), timeout=60) as r: return json.load(r)
credits = []
for layer, name in TEXTURES:
    try:
        f = files(name)
        for kind, key in (('diff', 'Diffuse'), ('nor', 'nor_gl'), ('rough', 'Rough'), ('disp', 'Displacement')):
            get(f[key]['1k']['jpg']['url'], os.path.join(WORK, 'tex', f'{name}-{kind}.jpg'))
        credits.append((layer, name, 'texture', ', '.join(info(name).get('authors', {}).keys()))); print('texture', name)
    except Exception as e: print('FAILED texture', name, e)
for name, (out, tris, size, _) in MODELS.items():
    try:
        g = files(name)['gltf']['1k']['gltf']; base = os.path.join(WORK, 'models', name)
        get(g['url'], os.path.join(base, name + '.gltf'))
        for rel, f in g['include'].items(): get(f['url'], os.path.join(base, rel))
        credits.append((out, name, 'model', ', '.join(info(name).get('authors', {}).keys()))); print('model', name, sum(f['size'] for f in g['include'].values()) // 1024, 'KB')
    except Exception as e: print('FAILED model', name, e)
if not PACK: sys.exit()

os.makedirs(os.path.join(OUT, 'models'), exist_ok=True)
def run(*a): subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
with tempfile.TemporaryDirectory() as tmp:
    for layer, name in TEXTURES:
        src = lambda k: os.path.join(WORK, 'tex', f'{name}-{k}.jpg')
        run('cwebp', '-quiet', '-q', '80', '-m', '6', '-resize', '1024', '1024', src('diff'), '-o', os.path.join(OUT, layer + '-d.webp'))
        run('cwebp', '-quiet', '-q', '82', '-m', '6', '-resize', '1024', '1024', src('nor'), '-o', os.path.join(OUT, layer + '-n.webp'))
        m = os.path.join(tmp, layer + '-m.png')
        run('ffmpeg', '-y', '-i', src('rough'), '-i', src('disp'), '-filter_complex', '[0:v]scale=1024:1024,format=gray[a];[1:v]scale=1024:1024,format=gray[b];[a][b]vstack=inputs=2,format=gray', '-frames:v', '1', m)
        run('cwebp', '-quiet', '-q', '78', '-m', '6', m, '-o', os.path.join(OUT, layer + '-m.webp'))
        print('packed', layer)
    js = os.path.join(tmp, 'pack.mjs')
    open(js, 'w').write(r'''
import {createRequire} from 'node:module';import path from 'node:path';import fs from 'node:fs';
const require=createRequire(path.join(process.env.NODE_MODULES,'x.js'));
const {NodeIO}=require('@gltf-transform/core'),{ALL_EXTENSIONS}=require('@gltf-transform/extensions'),F=require('@gltf-transform/functions'),{MeshoptSimplifier,MeshoptEncoder}=require('meshoptimizer'),sharp=require('sharp');
await MeshoptSimplifier.ready;await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
const [work,out,list]=process.argv.slice(2);const report={};
for(const [name,[file,tris,size,opt]] of Object.entries(JSON.parse(list))){
 const src=path.join(work,'models',name,name+'.gltf');if(!fs.existsSync(src))continue;
 const doc=await io.read(src);const scene0=doc.getRoot().listScenes()[0];
 if(opt.keep){const re=new RegExp(opt.keep);for(const node of doc.getRoot().listNodes())if(node.getMesh()&&!re.test(node.getName()))node.dispose();}
 if(opt.heap){ // loose stones, each a few centimetres: enlarged and piled, deterministic
  const stones=doc.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>{const a=n.getMesh().listPrimitives()[0].getAttribute('POSITION'),lo=a.getMin([]),hi=a.getMax([]);return {mesh:n.getMesh(),c:[(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2],r:Math.max(hi[0]-lo[0],hi[2]-lo[2])/2,n};});
  let seed=7;const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<17;i++){const s=stones[i%stones.length],k=(i<5?.24:.11+.1*rnd())/s.r,ang=rnd()*6.283,rad=i<5?.12+.42*rnd():.3+.62*Math.sqrt(rnd()),yaw=rnd()*6.283,tilt=(rnd()-.5)*.5;
   const q=[Math.sin(tilt/2)*Math.cos(yaw/2),Math.cos(tilt/2)*Math.sin(yaw/2),-Math.sin(tilt/2)*Math.sin(yaw/2),Math.cos(tilt/2)*Math.cos(yaw/2)];
   const holder=doc.createNode('heap'+i).setTranslation([Math.cos(ang)*rad,-.02*k*s.r,Math.sin(ang)*rad]).setRotation(q).setScale([k,k*(.8+.5*rnd()),k]);
   holder.addChild(doc.createNode('stone'+i).setMesh(s.mesh).setTranslation([-s.c[0],-s.c[1],-s.c[2]]));scene0.addChild(holder);}
  for(const s of stones)s.n.dispose();}
 if(opt.lay){const turn=doc.createNode('lay').setRotation([-Math.SQRT1_2,0,0,Math.SQRT1_2]);for(const node of scene0.listChildren())turn.addChild(node);scene0.addChild(turn);}
 await doc.transform(F.dedup(),F.flatten(),F.join(),F.weld());
 let n=0;for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())n+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
 if(n>tris)await doc.transform(F.simplify({simplifier:MeshoptSimplifier,ratio:tris/n,error:.02,lockBorder:false}));
 // Origin on the ground at the centre of the footprint, so a layout position is where it stands.
 const b=F.getBounds(doc.getRoot().listScenes()[0]);const scene=doc.getRoot().listScenes()[0];
 for(const node of scene.listChildren()){const t=node.getTranslation();node.setTranslation([t[0]-(b.min[0]+b.max[0])/2,t[1]-b.min[1],t[2]-(b.min[2]+b.max[2])/2]);}
 await doc.transform(F.textureCompress({encoder:sharp,targetFormat:'webp',quality:80,resize:[size,size]}),F.prune(),F.meshopt({encoder:MeshoptEncoder,level:'medium'}));
 let after=0;for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())after+=p.getIndices().getCount()/3;
 const dest=path.join(out,'models',file+'.glb');await io.write(dest,doc);
 report[file]={source:name,size:[b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]].map(v=>+v.toFixed(3)),triangles:after,from:Math.round(n),bytes:fs.statSync(dest).size};
 console.log('packed',file,JSON.stringify(report[file]));
}
fs.writeFileSync(path.join(out,'models','sizes.json'),JSON.stringify(report,null,1)+'\n');
''')
    env = dict(os.environ); env.setdefault('NODE_MODULES', os.path.join(ROOT, 'tools', 'asset-pipeline', 'node_modules'))
    subprocess.run(['node', js, WORK, OUT, json.dumps(MODELS)], check=True, env=env)
with open(os.path.join(OUT, 'CREDITS.txt'), 'w') as f:
    f.write('Beyond Eden scanned surfaces and street props. Everything here is from Poly Haven (https://polyhaven.com), licence CC0 1.0\n'
            '(https://creativecommons.org/publicdomain/zero/1.0/): free to use for any purpose, no attribution required. Credited anyway.\n'
            'Fetched and converted by tools/world/fetch-beyond-scans.py (1k sources; web copies are WebP, models meshopt .glb).\n\n')
    for out, name, kind, authors in credits:
        files_ = f'{out}-d.webp, {out}-n.webp, {out}-m.webp' if kind == 'texture' else f'models/{out}.glb'
        f.write(f'{files_}\n  {kind}: "{name}" by {authors or "Poly Haven"}, CC0\n  https://polyhaven.com/a/{name}\n\n')
print('wrote', OUT)
