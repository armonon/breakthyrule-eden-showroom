"""Build the Daily Apple three-tee product visualization from the site's artwork.

Run with Blender --background --python tools/blender/build_daily_apple_pack.py.
The bag is a visualization, not a claim about an existing packaging supplier.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'accessory-collection'
WORK=ROOT.parent.parent/'three-shirt-previews'/'daily-apple'
WORK.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
objects=[]

def material(name,color,roughness=.8,alpha=1):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness;p.inputs['Alpha'].default_value=alpha
    p.inputs['Specular IOR Level'].default_value=.28
    m.diffuse_color=(*color,alpha)
    if alpha<1:m.surface_render_method='BLENDED';m.use_transparency_overlap=False
    return m

cotton=material('White cotton jersey / three tees',(.91,.90,.87),.94)
rib=material('White rib-knit neckline',(.84,.835,.81),.90)
seam=material('White cotton double needle seams',(.79,.785,.76),.88)
inner=material('Inside the folded cotton neckline',(.59,.60,.58),1)
bag=material('Frosted clear recycled zip bag',(.73,.79,.79),.29,.10)
edge=material('Heat-sealed translucent bag edges',(.72,.78,.79),.40,.52)
header=material('Frosted zip header',(.67,.74,.75),.43,.76)
zipmat=material('Zip closure / charcoal',(.13,.17,.17),.52)
ink=material('Packaging typography / dark green',(.025,.055,.043),.75)
red=material('Apple red zip marker',(.68,.008,.022),.5)

# A tiny embedded, repeating jersey normal texture works in both Blender and glTF.
N=128;pixels=[]
for y in range(N):
    for x in range(N):
        dx=.10*math.sin(x/N*math.tau*16)
        dy=.07*math.sin(y/N*math.tau*16+x/N*math.pi)
        nz=math.sqrt(max(0,1-dx*dx-dy*dy));pixels.extend((dx*.5+.5,dy*.5+.5,nz*.5+.5,1))
normal=bpy.data.images.new('Daily Apple cotton yarn normal',width=N,height=N,alpha=False)
normal.colorspace_settings.name='Non-Color';normal.pixels=pixels;normal.pack()
for m in (cotton,rib):
    nodes=m.node_tree.nodes;links=m.node_tree.links
    tex=nodes.new('ShaderNodeTexImage');tex.image=normal;tex.extension='REPEAT'
    mapping=nodes.new('ShaderNodeMapping');mapping.inputs['Scale'].default_value=(12,14,1)
    uv=nodes.new('ShaderNodeTexCoord');n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.32
    links.new(uv.outputs['UV'],mapping.inputs['Vector']);links.new(mapping.outputs['Vector'],tex.inputs['Vector'])
    links.new(tex.outputs['Color'],n.inputs['Color']);links.new(n.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])

def mesh(name,verts,faces,mat,uvs=None):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.materials.append(mat);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);objects.append(o)
    for p in data.polygons:p.use_smooth=True
    if uvs:
        layer=data.uv_layers.new(name='UVMap')
        for p in data.polygons:
            for li,vi in zip(p.loop_indices,p.vertices):layer.data[li].uv=uvs[vi]
    return o

def box(name,location,scale,mat,bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if bevel:
        b=o.modifiers.new('Soft folded edges','BEVEL');b.width=bevel;b.segments=3
        bpy.ops.object.modifier_apply(modifier=b.name)
    for p in o.data.polygons:p.use_smooth=True
    n=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');n.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=n.name)
    objects.append(o);return o

def line(name,points,radius,mat):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=1
    curve.bevel_depth=radius;curve.bevel_resolution=2
    p=curve.splines.new('POLY');p.points.add(len(points)-1)
    for v,co in zip(p.points,points):v.co=(*co,1)
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);curve.materials.append(mat)
    objects.append(o);return o

def text(name,body,location,size,mat,align='LEFT'):
    data=bpy.data.curves.new(name,'FONT');data.body=body;data.size=size;data.align_x=align;data.extrude=.00003
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=location;o.rotation_euler=(math.pi/2,0,0)
    data.materials.append(mat);objects.append(o);return o

logo_image=bpy.data.images.load(str(ROOT/'site/eden-apple-red-bitmap.png'));logo_image.pack()
logo=bpy.data.materials.new('Original red bitmap Apple / chest print');logo.use_nodes=True
p=logo.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.92
t=logo.node_tree.nodes.new('ShaderNodeTexImage');t.image=logo_image;t.interpolation='Closest'
logo.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color']);logo.node_tree.links.new(t.outputs['Alpha'],p.inputs['Alpha'])
logo.surface_render_method='DITHERED';logo.alpha_threshold=.3

def make_tee(index):
    # Three discrete folded shirts, staggered enough to expose all three collars.
    ox=-.008*index; oy=.027*index; oz=.018*index-.022
    width=.264;height=.316;thickness=.025
    nx=32;nz=32;verts=[];uv=[];faces=[]
    def front_y(x,z):
        bulge=.0045*(1-(x/(width*.5))**2)*math.sin(math.pi*(z/height+.5))
        wrinkle=.0009*math.sin(x*86+z*24)*math.sin(z*39)*(abs(x)/(width*.5))**2
        return oy-.042-bulge+wrinkle
    for back in (False,True):
        for j in range(nz+1):
            v=j/nz
            for i in range(nx+1):
                u=i/nx;x=(u-.5)*width
                neckline=.029*math.sqrt(max(0,1-(x/.046)**2)) if abs(x)<.046 and not back else 0
                z=-height/2+v*(height-neckline)
                y=front_y(x,z)+(thickness if back else 0)
                verts.append((x+ox,y,z+oz));uv.append((u,v))
    layer=(nx+1)*(nz+1)
    for b in (0,1):
        for j in range(nz):
            for i in range(nx):
                a=b*layer+j*(nx+1)+i
                quad=(a,a+1,a+nx+2,a+nx+1);faces.append(quad if b==0 else quad[::-1])
    # Close the fold volume with soft fabric sides, not a flat card.
    boundaries=[list(range(nx+1)),[j*(nx+1)+nx for j in range(nz+1)],list(range(nz*(nx+1),layer)),[j*(nx+1) for j in range(nz+1)]]
    for edge_ids in boundaries:
        for a,b in zip(edge_ids,edge_ids[1:]):faces.append((a,b,b+layer,a+layer))
    o=mesh(f'Tee {index+1} / separately folded white cotton',verts,faces,cotton,uv)
    o['pack_piece']=index+1;o['garment']='white crew-neck tee';o['artwork']='site/eden-apple-red-bitmap.png'
    # Raised U-shaped rib neck and inner folded collar lip.
    pts=[]
    for i in range(49):
        theta=math.pi+math.pi*i/48;x=.046*math.cos(theta);z=height/2+.029*math.sin(theta)
        pts.append((ox+x,front_y(x,z)-.0012,oz+z))
    line(f'Tee {index+1} / ribbed crew neckline',pts,.0039,rib)
    line(f'Tee {index+1} / neckline inner seam',[(x,y-.0008,z+.001) for x,y,z in pts],.00065,seam)
    # Visible two-fold edges and a double needle hem.
    for zoffset in (.009,.013):
        z=-height/2+zoffset
        line(f'Tee {index+1} / double needle hem',[(ox+x,front_y(x,z)-.00055,oz+z) for x in [-.127+k*.254/30 for k in range(31)]],.00038,seam)
    for side in (-1,1):
        x=side*(width/2-.007)
        line(f'Tee {index+1} / tucked sleeve fold',[(ox+x,front_y(x,z)-.0005,oz+z) for z in [-.13+k*.26/22 for k in range(23)]],.0005,seam)
    # A printed original Apple, positioned on the wearer's left chest.
    x=.064;z=.066;sz=.050;lv=[];lf=[];lu=[];segments=12
    for j in range(segments+1):
        for i in range(segments+1):
            u=i/segments;v=j/segments;xx=x+(u-.5)*sz;zz=z+(v-.5)*sz
            lv.append((ox+xx,front_y(xx,zz)-.0009,oz+zz));lu.append((u,v))
    for j in range(segments):
        for i in range(segments):
            a=j*(segments+1)+i;lf.append((a,a+1,a+segments+2,a+segments+1))
    mesh(f'Tee {index+1} / bitmap Apple left-chest print',lv,lf,logo,lu)

# Back-to-front creation gives transparent sorting a stable, natural hierarchy.
for i in (2,1,0):make_tee(i)

W=.334;H=.438;YFRONT=-.057;YBACK=.055;ZCENTER=.025
def bag_y(z,back=False):
    fold=max(0,min(1,(z-.172)/.072))
    return (YBACK if back else YFRONT)*(1-fold)+(.006 if back else -.006)*fold
# The two softly rippled bag panels are separate from the folded clothes.
for back in (False,True):
    nx=18;nz=22;verts=[];faces=[];uv=[]
    for j in range(nz+1):
        v=j/nz
        for i in range(nx+1):
            u=i/nx;x=(u-.5)*W;z=(v-.5)*H+ZCENTER
            wave=.0014*math.sin(u*math.pi*8+v*math.pi*3)*math.sin(math.pi*u)*math.sin(math.pi*v)
            y=bag_y(z,back)+wave
            verts.append((x,y,z));uv.append((u,v))
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i;face=(a,a+1,a+nx+2,a+nx+1);faces.append(face[::-1] if back else face)
    panel=mesh('Zip bag / '+('back panel' if back else 'clear front window'),verts,faces,bag,uv)
    panel.data.materials.append(header)
    for poly in panel.data.polygons:
        if sum(panel.data.vertices[v].co.z for v in poly.vertices)/len(poly.vertices)>.198:poly.material_index=1
for side in (-1,1):
    x=side*W/2
    vv=[];ff=[]
    for j in range(23):
        z=ZCENTER-H/2+j*H/22;vv.extend([(x,bag_y(z),z),(x,bag_y(z,True),z)])
    for j in range(22):ff.append((j*2,j*2+1,j*2+3,j*2+2))
    mesh('Zip bag / folded side gusset',vv,ff,bag)
    for back in (False,True):
        line('Zip bag / heat sealed side',[(x,bag_y(ZCENTER-H/2+j*H/22,back),ZCENTER-H/2+j*H/22) for j in range(23)],.0014,edge)
box('Zip bag / folded bottom gusset',(0,0,ZCENTER-H/2),(W,.112,.005),edge,.0018)
for dz in (0,.0038):
    z=ZCENTER+H/2-.047+dz
    line('Zip bag / double press seal',[(x,bag_y(z)-.0007,z) for x in [-W/2+.006+i*(W-.012)/50 for i in range(51)]],.0012,zipmat)
box('Zip bag / red closure tab',(.135,bag_y(ZCENTER+H/2-.041)-.002,ZCENTER+H/2-.041),(.016,.006,.012),red,.002)
title=text('Daily Apple package title','DAILY APPLE',(0,bag_y(ZCENTER+H/2-.027)-.0008,ZCENTER+H/2-.027),.024,ink,'CENTER')
title.rotation_euler.x=math.atan2(1,(.057-.006)/.072)
text('Pack quantity label','3 WHITE TEES',(0,YFRONT-.002,ZCENTER-H/2+.019),.012,ink,'CENTER')

# Creased highlights at corners make the film read as a soft bag at every angle.
for side in (-1,1):
    x=side*(W/2-.004)
    line('Zip bag / corner crease',[(x,YFRONT-.0007,ZCENTER-H/2+.010),(x-side*.020,YFRONT-.001,ZCENTER-H/2+.029),(x-side*.024,YFRONT-.0003,ZCENTER-H/2+.065)],.00055,edge)

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.8
scene.world.color=(.35,.35,.35)
for name,loc,power,size in [('Key',(-.5,-.7,.85),22,.65),('Fill',(.6,-.35,.3),12,.6),('Rim',(.3,.55,.65),24,.45)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.025))-o.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('Catalog camera');cam=bpy.data.objects.new('Catalog camera',camdata);scene.collection.objects.link(cam)
cam.location=(.47,-1.35,.42);target=Vector((0,0,.023));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=.54;scene.camera=cam

for o in objects:
    if o.type in ('CURVE','FONT'):
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
scene['product']='Daily Apple 3-Pack';scene['pieces']=3;scene['source_artwork']='site/eden-apple-red-bitmap.png'
bpy.ops.wm.save_as_mainfile(filepath=str(WORK/'daily-apple-3-pack.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
path=OUT/'models/daily-apple-3-pack.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_yup=True,export_apply=True,export_normals=True,export_tangents=False)
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(WORK/'daily-apple-3-pack.png');bpy.ops.render.render(write_still=True)
pts=[o.matrix_world@Vector(corner) for o in objects for corner in o.bound_box]
low=Vector([min(p[i] for p in pts) for i in range(3)]);high=Vector([max(p[i] for p in pts) for i in range(3)])
triangles=0
for o in objects:
    o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
report={'model':str(path),'bytes':path.stat().st_size,'triangles':triangles,'dimensionsMm':[round(v*1000,1) for v in high-low],'shirts':3,'artwork':'Original site bitmap Apple','packaging':'Product visualization','hanesWordmarkAdded':False}
(WORK/'validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
