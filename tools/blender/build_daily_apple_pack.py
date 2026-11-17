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

cotton=material('White cotton jersey / three tees',(.78,.77,.74),.94)
rib=material('White rib-knit neckline',(.54,.535,.51),.90)
seam=material('White cotton double needle seams',(.79,.785,.76),.88)
inner=material('Inside the folded cotton neckline',(.59,.60,.58),1)
bag=material('Clear flexible polyethylene film',(.92,.96,.96),.16,.075)
edge=material('Thin heat-sealed plastic perimeter',(.85,.93,.93),.22,.085)
crinkle=material('Fine plastic crease highlights',(.96,.99,.99),.11,.23)

ink=material('Packaging typography / dark green',(.025,.055,.043),.75)


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

# Fold the actual collection tee, retaining its rounded hem, ribbed neckline,
# garment-shaped shoulders and sewn details. Shared mesh data keeps three shirts
# inexpensive in glTF. The base is flattened, never replaced with a rectangular box.
from mathutils import Matrix
from mathutils.bvhtree import BVHTree
bpy.ops.import_scene.gltf(filepath=str(ROOT/'core-collection/models/core-tee-black.glb'))
imported=list(bpy.context.selected_objects)
imported_helpers=[o for o in imported if o.type!='MESH']
tee_parts=[]

def fold_position(p):
    x,y,z=p
    y*=.040
    # A monotonic rolled-under sleeve edge prevents surface intersections while
    # compressing the tucked sleeve behind the front of the folded shirt.
    side=-1 if x<0 else 1;distance=abs(x)-.170;radius=.0075
    if distance>0:
        x=side*(.170+radius*(1-math.exp(-distance/radius)))
        y+=.012*(1-math.exp(-distance/.012))+.004*distance/.23
    # Rounded lower fold: strictly monotonic in height, so no triangle can fold
    # back through its neighbor. Original hem irregularities are compressed.
    distance=1.120-z;radius=.080
    if distance>0:
        z=1.120-distance/(1+distance/radius)
        y+=.016*(1-math.exp(-distance/.035))
    # Small uneven jersey folds; the narrow seam curves get the same transform.
    y+=.0015*math.sin(z*48+x*17)*math.exp(-((abs(x)-.135)/.042)**2)
    return Vector((x*.81,y*.81,(z-1.255)*.81))

for o in imported:
    if o.type!='MESH':continue
    if any((m and (m.name.startswith('Core logo') or m.name.startswith('Core eye'))) for m in o.data.materials):
        bpy.data.objects.remove(o,do_unlink=True);continue
    if all(m and 'stitching' in m.name for m in o.data.materials):
        # Separate thread spans are not foldable cloth. Preserve the actual rib
        # collar in the body mesh; omit long stitching strips through the fold.
        bpy.data.objects.remove(o,do_unlink=True);continue
    world=o.matrix_world.copy();o.data=o.data.copy()
    bpy.context.view_layer.objects.active=o
    # Split UV vertices are welded before the bend so the hem stays continuous.
    import bmesh
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0000001)
    bm.to_mesh(o.data);bm.free()
    sub=o.modifiers.new('Cloth fold sampling','SUBSURF');sub.subdivision_type='SIMPLE';sub.levels=1
    bpy.ops.object.modifier_apply(modifier=sub.name)
    bend=o.vertex_groups.new(name='Soft folded corners')
    for vertex in o.data.vertices:
        p=world@vertex.co
        weight=max(min(1,max(0,(abs(p.x)-.135)/.045)),min(1,max(0,(1.10-p.z)/.04)))
        if weight>0:bend.add([vertex.index],weight,'REPLACE')
    for v in o.data.vertices:v.co=fold_position(world@v.co)
    o.matrix_world=Matrix.Identity(4)
    for i,m in enumerate(o.data.materials):
        o.data.materials[i]=rib if m and 'rib knit' in m.name else seam if m and 'stitching' in m.name else cotton
    try:o.data.normals_split_custom_set([(0,0,0)]*len(o.data.loops))
    except Exception:pass
    for p in o.data.polygons:p.use_smooth=True
    o.data.update()
    smooth=o.modifiers.new('Relax folded jersey','SMOOTH');smooth.vertex_group=bend.name;smooth.factor=.70;smooth.iterations=10
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    # The original knit/body are dense enough to reduce without losing the fold.
    if 'cloth' in o.name.lower():
        bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Web garment detail','DECIMATE');mod.ratio=.10
        bpy.ops.object.modifier_apply(modifier=mod.name)
    try:bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception:pass
    tee_parts.append(o)
for o in imported_helpers:bpy.data.objects.remove(o,do_unlink=True)

# Surface-following Apple patch, fitted by ray casting onto the real front cloth.
bpy.context.view_layer.update()
cloth=next(o for o in tee_parts if 'cloth' in o.name.lower())
surface=BVHTree.FromObject(cloth,bpy.context.evaluated_depsgraph_get())
lv=[];lf=[];lu=[];segments=14;cx=.067;cz=.094;sz=.050
for j in range(segments+1):
    for i in range(segments+1):
        u=i/segments;v=j/segments;x=cx+(u-.5)*sz;z=cz+(v-.5)*sz
        hit,normal,face,distance=surface.ray_cast(Vector((x,-1,z)),Vector((0,1,0)))
        y=hit.y-.00055 if hit else -.005
        lv.append((x,y,z));lu.append((u,v))
for j in range(segments):
    for i in range(segments):
        a=j*(segments+1)+i;lf.append((a,a+1,a+segments+2,a+segments+1))
patch=mesh('Original bitmap Apple / left chest',lv,lf,logo,lu)
objects.remove(patch);tee_parts.append(patch)

for index in range(3):
    offset=Vector(([-.001,.004,-.003][index],[-.016,.000,.016][index],[-.006,.000,.006][index]))
    for base in tee_parts:
        o=base.copy();o.data=base.data;bpy.context.collection.objects.link(o)
        o.name=f'Tee {index+1} / '+('chest Apple' if base==patch else base.name)
        o.location=offset;o.rotation_euler.z=[-.012,.014,-.007][index]
        o['pack_piece']=index+1;o['garment']='Folded white crew-neck cotton tee'
        o['artwork']='site/eden-apple-red-bitmap.png';objects.append(o)
for o in tee_parts:bpy.data.objects.remove(o,do_unlink=True)

# Retail pack proportions follow the supplied multipack reference: wide sealed
# strip, gathered clear shoulders, a softly padded rectangular shirt stack.
TOP=.276;BOTTOM=-.194

def smoothstep(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)

def outline(v):
    z=(TOP+BOTTOM)/2+v*(TOP-BOTTOM)/2
    return .154+.021*smoothstep(.168,.230,z)-.005*max(0,-v)**16+.0011*math.sin(v*13)*(1-smoothstep(.218,.235,z))

def panel_point(u,v,back=False):
    w=outline(v);x=u*w
    z=(TOP+BOTTOM)/2+v*(TOP-BOTTOM)/2
    below_header=1-smoothstep(.217,.232,z)
    z+=below_header*(.0018*math.sin(u*14+.8)*abs(v)**9+.0012*math.cos(u*27)*abs(v)**12)
    z+=.006*abs(u)**9*max(0,-v)**8
    top_gather=smoothstep(.151,.231,z)
    y=(.052 if back else -.040)*(1-top_gather)+(.0012 if back else -.0012)*top_gather
    shoulder=math.exp(-((z-.195)/.028)**2)
    side=abs(u)**6
    wrinkle=(.0022*math.sin(u*31+v*12)+.0013*math.sin(u*56-v*17))*(side+.8*shoulder)*below_header
    y+=wrinkle
    y+=(1 if back else -1)*.0065*(1-u*u)*(1-v*v)*(1-top_gather)
    return (x,y,z)

for back in (False,True):
    nx=42;nz=56;verts=[];faces=[];uv=[]
    for j in range(nz+1):
        v=j/nz*2-1
        for i in range(nx+1):
            u=i/nx*2-1;verts.append(panel_point(u,v,back));uv.append(((u+1)/2,(v+1)/2))
    for j in range(nz):
        for i in range(nx):
            a=j*(nx+1)+i;q=(a,a+1,a+nx+2,a+nx+1);faces.append(q[::-1] if back else q)
    mesh('Clear retail bag / '+('rear soft film' if back else 'front crinkled film'),verts,faces,bag,uv)

# The heat seals are thin film ribbons, not hard frame pieces.
for side in (-1,1):
    for back in (False,True):
        vv=[];ff=[]
        for j in range(65):
            v=j/64*2-1;vv.extend([panel_point(side*.974,v,back),panel_point(side,v,back)])
        for j in range(64):ff.append((j*2,j*2+1,j*2+3,j*2+2))
        mesh('Retail bag / narrow welded side',vv,ff,edge)
    vv=[];ff=[]
    for j in range(65):
        v=j/64*2-1;vv.extend([panel_point(side,v,False),panel_point(side,v,True)])
    for j in range(64):ff.append((j*2,j*2+1,j*2+3,j*2+2))
    mesh('Retail bag / folded side film',vv,ff,bag)
for top in (-1,1):
    for back in (False,True):
        vv=[];ff=[]
        for i in range(65):
            u=i/64*2-1;vv.extend([panel_point(u,top*.976,back),panel_point(u,top,back)])
        for i in range(64):ff.append((i*2,i*2+1,i*2+3,i*2+2))
        mesh('Retail bag / top heat seal' if top>0 else 'Retail bag / soft bottom weld',vv,ff,edge)
    vv=[];ff=[]
    for i in range(65):
        u=i/64*2-1;vv.extend([panel_point(u,top,False),panel_point(u,top,True)])
    for i in range(64):ff.append((i*2,i*2+1,i*2+3,i*2+2))
    mesh('Retail bag / sealed film return',vv,ff,bag)

# Creases gathered beneath the sealed strip and along the sides: broad, tapered
# reflected streaks with an adjacent low-alpha edge keep the center truly clear.
creases=[(-.96,.77,-.55,.51,.018),(-.85,.81,-.68,.53,.014),(-.68,.78,-.25,.57,.012),(-.25,.79,.08,.55,.013),(.13,.79,.36,.57,.016),(.46,.78,.65,.51,.015),(.78,.80,.86,.42,.018),(.97,.74,.71,.43,.019),(-.96,.44,-.86,.10,.010),(-.97,-.10,-.88,-.50,.011),(.97,.32,.86,-.12,.010),(.96,-.39,.83,-.73,.013),(-.95,-.91,-.60,-.72,.016),(.96,-.92,.62,-.77,.015),(-.56,-.97,-.31,-.89,.012)]
for index,(ua,va,ub,vb,span) in enumerate(creases):
    vv=[];ff=[]
    for i in range(25):
        t=i/24;u=ua+(ub-ua)*t+.024*math.sin(t*math.pi);v=va+(vb-va)*t
        width=span*math.sin(t*math.pi)**1.3
        for du in (-width,width):
            x,y,z=panel_point(u+du,v);vv.append((x,y-.00055,z))
    for i in range(24):ff.append((i*2,i*2+1,i*2+3,i*2+2))
    mesh('Retail bag / gathered light crease '+str(index+1),vv,ff,crinkle)

# Blue print lies directly on the top film, like the supplied retail package.
blue=material('Daily Apple / cobalt printed film',(.008,.032,.35),.40)
cyan=material('Daily Apple / cyan label border',(.008,.39,.68),.65)
whiteink=material('Daily Apple / white package ink',(.94,.96,.94),.70)
redink=material('Daily Apple / red brand stamp',(.67,.012,.023),.66)
for back in (False,True):
    vv=[];ff=[]
    for j in range(5):
        z=.233+j*.036/4;v=(z-(TOP+BOTTOM)/2)/((TOP-BOTTOM)/2)
        for i in range(33):
            u=(i/32*2-1)*.975;x,y,zz=panel_point(u,v,back);vv.append((x,y+(.0003 if back else -.0003),zz))
    for j in range(4):
        for i in range(32):
            a=j*33+i;q=(a,a+1,a+34,a+33);ff.append(q[::-1] if back else q)
    mesh('Daily Apple / blue printed top strip '+str(back),vv,ff,blue)
text('Top strip / pack count','3',(-.161,-.0025,.237),.036,whiteink)
text('Top strip / Daily Apple','DAILY APPLE',(-.126,-.0026,.251),.018,whiteink)
text('Top strip / subtitle','WHITE TEES  /  THREE PACK',(-.125,-.0026,.237),.0085,whiteink)
text('Top strip / brand','BREAKTHYRULE',(.083,-.0026,.246),.0072,whiteink)

# A thin insert card, slightly left of center, preserves the chest Apple beside
# it and uses only the real product's name and contents (no invented claims).
label_x=-.037;label_z=.087;label_y=-.0275
box('Daily Apple / slim cyan insert',(label_x,label_y,label_z),(.111,.00045,.153),cyan,.003)
box('Daily Apple / blue insert face',(label_x,label_y-.00035,label_z+.002),(.101,.00025,.142),blue,.002)
text('Insert / Daily Apple','DAILY APPLE',(label_x,label_y-.00065,.139),.011,whiteink,'CENTER')
text('Insert / count','3',(label_x-.038,label_y-.0007,.102),.041,whiteink)
text('Insert / tees','WHITE TEES',(label_x-.009,label_y-.0007,.109),.0079,whiteink)
# Printed tee pictogram, deliberately flat on the card.
x=label_x;y=label_y-.0008;z=.071;w=.036;h=.038
icon=[(-.22,.5),(-.08,.44),(.08,.44),(.22,.5),(.5,.29),(.36,.09),(.23,.19),(.23,-.5),(-.23,-.5),(-.23,.19),(-.36,.09),(-.5,.29)]
mesh('Insert / flat white tee pictogram',[(x+a*w,y,z+b*h) for a,b in icon],[tuple(range(len(icon)))],whiteink)
text('Insert / footer','BREAKTHYRULE',(label_x,label_y-.0008,.030),.0073,whiteink,'CENTER')
# A small red brand tab echoes the site's red apple without copying Hanes marks.
box('Daily Apple / small red brand tab',(label_x-.018,label_y-.001,.162),(.078,.0003,.022),redink,.001)
text('Insert / brand tab','BREAKTHYRULE',(label_x-.018,label_y-.0013,.158),.0073,whiteink,'CENTER')

# Font/curve geometry must be explicit meshes in the shipped GLB.
for o in objects:
    if o.type in ('CURVE','FONT'):
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.65
scene.world.color=(.30,.30,.30)
for name,loc,power,size in [('Key',(-.5,-.7,.85),22,.65),('Fill',(.6,-.35,.3),10,.6),('Rim',(.3,.55,.65),24,.45)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.025))-o.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('Catalog camera');cam=bpy.data.objects.new('Catalog camera',camdata);scene.collection.objects.link(cam)
cam.location=(.27,-1.45,.31);target=Vector((0,0,.01));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=.57;scene.camera=cam
scene['product']='Daily Apple 3-Pack';scene['pieces']=3;scene['source_artwork']='site/eden-apple-red-bitmap.png';scene['packaging']='Clear flexible polybag visualization'
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
for o in objects:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
report={'model':str(path),'bytes':path.stat().st_size,'triangles':triangles,'dimensionsMm':[round(v*1000,1) for v in high-low],'shirts':3,'artwork':'Original site bitmap Apple','packaging':'Clear retail multipack with sealed printed film','hanesWordmarkAdded':False,'revision':'retail-bag-3'}
(WORK/'validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
