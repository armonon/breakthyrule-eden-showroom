"""Build display copies of the owner's Meshy sculptures; leave source GLBs untouched.

Blender --background --python tools/assets/build-museum-sculptures.py -- \
  --source '/path/to/BELTS AND PENDENTS ' --output assets/museum-sculptures
"""
import argparse, hashlib, json, sys
from pathlib import Path
import bpy
from mathutils import Vector

parser=argparse.ArgumentParser()
parser.add_argument('--source',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
source=Path(args.source);out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
selection=[('ethereal-insight','Ethereal_Insight',60000),('neon-shamrock','Neon_Shamrock',20000),
 ('crimson-sentinel','Crimson_Sentinel',100000),('absolute-darkness','Absolute_Darkness',80000),
 ('equine-reverie','Equine_Reverie',80000),('lion-rampant','Lion_Rampant',70000),('peaceful-flight','Peaceful_Flight',35000)]
report=[]
for slug,name,budget in selection:
 paths=sorted(source.glob('**/Meshy_AI_'+name+'_*/Meshy_AI_model.glb'))
 if len(paths)!=1: raise RuntimeError('Expected one source for '+name)
 path=paths[0]
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(path))
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0]
 bpy.ops.object.join();obj=bpy.context.object
 bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 obj.data.calc_loop_triangles();original=len(obj.data.loop_triangles)
 if original>budget:
  modifier=obj.modifiers.new('Museum display reduction','DECIMATE')
  modifier.ratio=budget/original
  modifier.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=modifier.name)
 obj.data.validate(clean_customdata=True)
 obj.data.update()
 for face in obj.data.polygons:face.use_smooth=True
 obj.data.materials.clear()
 # Geometry is the supplied sculpture; only scale, centering and polygon count change.
 points=[obj.matrix_world@Vector(v) for v in obj.bound_box]
 lo=Vector(tuple(min(v[a] for v in points) for a in range(3)))
 hi=Vector(tuple(max(v[a] for v in points) for a in range(3)))
 factor=1/(hi.z-lo.z)
 obj.location-=Vector(((hi.x+lo.x)/2,(hi.y+lo.y)/2,lo.z))
 obj.location*=factor;obj.scale*=factor
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 obj.name=slug
 target=out/(slug+'.glb')
 bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,
  export_materials='NONE',export_texcoords=False,export_normals=True,export_yup=True,
  export_animations=False,export_cameras=False,export_lights=False)
 obj.data.calc_loop_triangles()
 report.append({'id':slug,'title':name.replace('_',' '),'file':'/assets/museum-sculptures/'+target.name,
  'sourceFolder':path.parent.name,'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
  'sourceTriangles':original,'triangles':len(obj.data.loop_triangles),'bytes':target.stat().st_size,
  'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
 print('SCULPTURE_READY',slug,report[-1]['triangles'],report[-1]['bytes'],flush=True)
(out/'catalog.json').write_text(json.dumps({'origin':'Owner-supplied Meshy exports','sculptures':report},indent=2)+'\n')
