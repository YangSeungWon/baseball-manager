"""Create DUGOUT's original skinned athlete and modular equipment.
Run: blender -b --python tools/blender/build-player.py
Coordinates below are game axes: X right, Y up, Z forward.
"""
import bpy, math, random
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[2]
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def xyz(p):return (p[0],-p[2],p[1])
def material(name,hexcolor,rough=.7):
 h=hexcolor.lstrip('#');m=bpy.data.materials.new(name);srgb=[int(h[i:i+2],16)/255 for i in (0,2,4)];m.diffuse_color=tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in srgb)+(1,);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=m.diffuse_color;bs.inputs['Roughness'].default_value=rough
 return m
M={k:material(k,c,r) for k,c,r in [('Team','#c96845',.65),('Cream','#eee9d6',.82),('Skin','#c98b62',.68),('Dark','#202d36',.6),('Leather','#81512e',.87),('Pocket','#593622',.95),('Stitch','#d9af6c',.9),('Eye','#faf6e8',.3),('Iris','#49392d',.4)]}
parts=[]
def finish(o,name,mat,bone=None,smooth=True):
 o.name=name;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.data.materials.append(M[mat])
 for f in o.data.polygons:f.use_smooth=smooth
 if bone:o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))),1,'REPLACE')
 parts.append(o);return o
def ell(name,p,s,mat,bone=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=8 if name=='PocketBinding' else 16,ring_count=6 if name=='PocketBinding' else 10,location=xyz(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1]);return finish(o,name,mat,bone)
def box(name,p,s,mat,bone=None,bevel=.015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  m=o.modifiers.new('Soft edges','BEVEL');m.width=bevel;m.segments=2;bpy.ops.object.modifier_apply(modifier=m.name)
 return finish(o,name,mat,bone,False)
def taper(name,p,height,top,bottom,depth,mat,bone):
 verts=[];faces=[];n=12
 for y,rx in [(-height/2,bottom),(height/2,top)]:
  for i in range(n):
   a=i*2*math.pi/n;verts.append(xyz((p[0]+rx*math.cos(a),p[1]+y,p[2]+rx*depth*math.sin(a))))
 for i in range(n):j=(i+1)%n;faces.append((i,j,n+j,n+i))
 faces.extend([tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]);mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);return finish(o,name,mat,bone)
def profile(name,x,rings,mat,bone):
 verts=[];faces=[];n=16
 for y,rx,rz in rings:
  for i in range(n):
   a=i*2*math.pi/n;verts.append(xyz((x+rx*math.cos(a),y,rz*math.sin(a))))
 for j in range(len(rings)-1):
  for i in range(n):k=j*n+i;l=j*n+(i+1)%n;faces.append((k,l,l+n,k+n))
 faces.extend([tuple(range(n-1,-1,-1)),tuple(range((len(rings)-1)*n,len(rings)*n))]);me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);return finish(o,name,mat,bone)
def text(name,word,p,size,mat,bone,back=False):
 curve=bpy.data.curves.new(name,'FONT');curve.body=word;curve.size=size;curve.extrude=.001;curve.align_x='CENTER';curve.align_y='CENTER'
 o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.location=xyz(p);o.rotation_euler=(math.pi/2,0,math.pi if back else 0)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return finish(bpy.context.object,name,mat,bone,False)
def join(name):
 global parts
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name=name;parts=[];return o
# A tapered athletic torso with sewn shirt panels and a distinct waist.
profile('Jersey',0,[(.83,.197,.14),(.96,.21,.152),(1.19,.265,.16),(1.30,.26,.15),(1.355,.21,.105),(1.39,.095,.073)],'Team','Spine')
# Union the shirt and sloping sleeves into a single cloth surface, then blend
# shoulder weights. Separate capped sleeve meshes looked like shoulder pads.
for side in [-1,1]:
 profile('Sleeve',side*.29,[(1.086,.078,.078),(1.12,.082,.08),(1.23,.086,.089),(1.29,.083,.085),(1.315,.065,.065),(1.325,.015,.02)],'Team',None)
cloth=join('JerseyCloth')
remesh=cloth.modifiers.new('Continuous shoulder cloth','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.012;remesh.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=cloth.modifiers.new('Relax cloth','SMOOTH');smooth.factor=.7;smooth.iterations=3;bpy.ops.object.modifier_apply(modifier=smooth.name)
decimate=cloth.modifiers.new('Mobile cloth budget','DECIMATE');decimate.ratio=.30;bpy.ops.object.modifier_apply(modifier=decimate.name)
cloth.vertex_groups.clear()
groups={name:cloth.vertex_groups.new(name=name) for name in ['Spine','UpperArmL','UpperArmR']}
for v in cloth.data.vertices:
 t=max(0,min(1,(abs(v.co.x)-.19)/.12)) if v.co.z>1.075 else 0
 weight=t*t*(3-2*t)
 groups['Spine'].add([v.index],1-weight,'REPLACE')
 if weight:groups['UpperArmL' if v.co.x<0 else 'UpperArmR'].add([v.index],weight,'REPLACE')
cloth.data.materials.clear();cloth.data.materials.append(M['Team']);cloth.data.materials.append(M['Cream'])
for face in cloth.data.polygons:
 center=sum((cloth.data.vertices[i].co for i in face.vertices),Vector())/len(face.vertices)
 face.material_index=0
parts.append(cloth)
ell('Hips',(0,.79,0),(.215,.09,.15),'Cream','Root')
box('Belt',(0,.815,0),(.425,.035,.31),'Dark','Root')
box('Buckle',(0,.815,.165),(.065,.046,.018),'Stitch','Root',.006)
box('Placket',(0,1.075,.157),(.016,.38,.016),'Cream','Spine',.004)
for y in [.93,1.04,1.15]:ell('Button',(0,y,.166),(.013,.013,.009),'Dark','Spine')
text('ChestMark','D',(-.105,1.19,.159),.105,'Cream','Spine')
text('Number','17',(0,1.115,-.166),.225,'Cream','Spine',True)
ell('Neck',(0,1.42,0),(.085,.11,.08),'Skin','Spine')
head=ell('Face',(0,1.615,.006),(.182,.222,.17),'Skin','Head')
# Sculpt the jaw instead of retaining a spherical silhouette.
for v in head.data.vertices:
 if v.co.z<1.55:v.co.x*=.82
for side in [-1,1]:ell('Ear',(side*.155,1.615,-.002),(.032,.052,.027),'Skin','Head')
for side,suffix in [(-1,'L'),(1,'R')]:
 x=side*.315
 profile('Forearm',x,[(.82,.054,.054),(.93,.061,.061),(1.03,.069,.069),(1.085,.06,.06),(1.11,.018,.018)],'Skin','Forearm'+suffix)
 taper('Wristband',(x,.812,0),.045,.058,.058,1,'Dark','Hand'+suffix)
 ell('Palm',(x,.756,.015),(.065,.086,.036),'Skin','Hand'+suffix)
 for j in range(4):ell('Finger',(x+(j-1.5)*.027,.70,.018),(.017,.04,.02),'Skin','Hand'+suffix)
 lx=side*.125
 taper('Thigh',(lx,.59,0),.32,.115,.091,1.05,'Cream','Thigh'+suffix)
 profile('Trouser',lx,[(.155,.073,.073),(.29,.086,.089),(.43,.098,.10),(.49,.065,.067),(.51,.018,.018)],'Cream','Shin'+suffix)
 box('TrouserStripe',(lx+side*.10,.56,0),(.017,.26,.024),'Team','Thigh'+suffix,.005)
 taper('Sock',(lx,.145,0),.10,.072,.069,1,'Dark','Shin'+suffix)
 box('CleatSole',(lx,.035,.072),(.19,.06,.32),'Dark','Foot'+suffix,.025)
 ell('Cleat',(lx,.088,.074),(.098,.065,.165),'Dark','Foot'+suffix)
 box('ShoePanel',(lx+side*.07,.085,.085),(.024,.04,.135),'Cream','Foot'+suffix,.008)
 for z in [.065,.10,.135]:box('Lace',(lx,.139,z),(.08,.009,.012),'Cream','Foot'+suffix,.003)
body=join('Athlete')
# Facial controls remain separate from the skinned body. Runtime attaches this
# socket-local group to Head and drives blinks, gaze, brows and mouth shapes.
face=bpy.data.objects.new('FaceFeatures',None);bpy.context.collection.objects.link(face)
def facial(o):
 parts.remove(o);o.parent=face;return o
for side,suffix in [(-1,'L'),(1,'R')]:
 facial(ell('Eye'+suffix,(side*.059,.163,.138),(.030,.015,.008),'Eye'))
 facial(ell('Iris'+suffix,(side*.059,.162,.147),(.012,.012,.004),'Iris'))
 facial(ell('Pupil'+suffix,(side*.059,.162,.152),(.006,.008,.003),'Dark'))
 facial(box('Brow'+suffix,(side*.059,.194,.150),(.072,.011,.010),'Dark',bevel=.004))
facial(ell('Nose',(0,.112,.151),(.018,.026,.015),'Skin'))
facial(box('MouthL',(-.027,.056,.153),(.030,.007,.005),'Dark',bevel=.003))
facial(box('MouthR',(.027,.056,.153),(.030,.007,.005),'Dark',bevel=.003))
# Parallel bone axes keep the runtime pose adapter predictable.
bpy.ops.object.select_all(action='DESELECT');bpy.ops.object.armature_add();rig=bpy.context.object;rig.name='AthleteRig';bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
bones={'Root':((0,0,0),None),'Spine':((0,.85,0),'Root'),'Head':((0,1.48,0),'Spine')}
for side,suffix in [(-1,'L'),(1,'R')]:
 bones.update({'UpperArm'+suffix:((side*.315,1.30,0),'Spine'),'Forearm'+suffix:((side*.315,1.03,0),'UpperArm'+suffix),'Hand'+suffix:((side*.315,.80,0),'Forearm'+suffix),'Thigh'+suffix:((side*.125,.76,0),'Root'),'Shin'+suffix:((side*.125,.43,0),'Thigh'+suffix),'Foot'+suffix:((side*.125,.10,0),'Shin'+suffix)})
for name,(p,parent) in bones.items():
 b=rig.data.edit_bones.new(name);b.head=xyz(p);b.tail=xyz((p[0],p[1]+.12,p[2]));
 if parent:b.parent=rig.data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');body.parent=rig;mod=body.modifiers.new('Skin','ARMATURE');mod.object=rig
# Modular equipment, exported at its socket's origin.
def dome(name,helmet=False):
 n=20;verts=[];faces=[]
 for j in range(7):
  a=j*math.pi/12
  for i in range(n):
   t=i*2*math.pi/n;verts.append(xyz((.204*math.sin(a)*math.cos(t),.24+.155*math.cos(a),.005+.194*math.sin(a)*math.sin(t))))
 for j in range(6):
  for i in range(n):k=j*n+i;l=j*n+(i+1)%n;faces.append((k,l,l+n,k+n))
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);finish(o,name,'Team')
 ell('Bill',(0,.239,.20),(.202,.019,.15),'Team')
 box('Badge',(0,.302,.184),(.048,.055,.009),'Cream',bevel=.007)
 if helmet:
  for side in [-1,1]:
   ell('EarGuard',(side*.184,.145,0),(.039,.106,.111),'Team')
   ell('Vent',(side*.216,.155,.015),(.006,.032,.039),'Dark')
 return join(name)
cap=dome('Cap');helmet=dome('Helmet',True)
# Shallow concave pocket, separate finger stalls and open woven web.
verts=[];faces=[];n=32
for radius,z in [(0,.027),(.5,.037),(1,.075),(1,.035),(.5,-.015),(0,-.025)]:
 for i in range(n):
  angle=i*2*math.pi/n;verts.append(xyz((.108*radius*math.cos(angle),-.055+.125*radius*math.sin(angle),z)))
for j in range(5):
 for i in range(n):k=j*n+i;l=j*n+(i+1)%n;faces.append((k,l,l+n,k+n))
mesh=bpy.data.meshes.new('Pocket');mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new('Pocket',mesh);bpy.context.collection.objects.link(obj);bpy.context.view_layer.objects.active=obj;obj.select_set(True);finish(obj,'Pocket','Pocket')
for i in range(4):
 x=(i-1.5)*.052
 ell('FingerStall',(x,-.158,-.027),(.030,.10-.009*abs(i-1.5),.030),'Leather')
 for y in [-.20,-.17,-.14]:box('FingerStitch',(x,y,.047),(.017,.007,.006),'Stitch',bevel=.002)
ell('Thumb',(.112,-.065,.022),(.040,.106,.036),'Leather')
for y in [-.09,-.065,-.04]:box('WebCross',(.093,y,.065),(.09,.009,.009),'Leather',bevel=.003)
for x in [.065,.092,.12]:box('WebStrand',(x,-.065,.067),(.010,.075,.010),'Leather',bevel=.003)
curve=bpy.data.curves.new('Pocket piping','CURVE');curve.dimensions='3D';curve.bevel_depth=.005;curve.bevel_resolution=2
spline=curve.splines.new('POLY');spline.points.add(63)
for i,point in enumerate(spline.points):
 a=i*math.pi/32;point.co=(*xyz((.108*math.cos(a),-.055+.125*math.sin(a),.076)),1)
spline.use_cyclic_u=True
obj=bpy.data.objects.new('Pocket piping',curve);bpy.context.collection.objects.link(obj);bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');finish(bpy.context.object,'Pocket piping','Leather')
for i in range(18):
 a=i*math.pi/9
 box('RimStitch',(.103*math.cos(a),-.055+.12*math.sin(a),.078),(.006,.008,.003),'Stitch',bevel=.001)
box('WristStrap',(0,.065,.005),(.16,.032,.043),'Leather',bevel=.009)
glove=join('Glove')
# Small embedded, deterministic leather color and normal maps, authored here.
bpy.context.view_layer.objects.active=glove;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
rng=random.Random(17);size=128;grain=[rng.random() for _ in range(size*size)];colors=[];normals=[]
for y in range(size):
 for x in range(size):
  i=y*size+x;g=grain[i];shade=.86+g*.20-.16*(g<.10)+.035*math.sin(x*.17)*math.sin(y*.13)
  colors.extend([.42*shade,.25*shade,.13*shade,1])
  dx=(grain[y*size+(x+1)%size]-grain[y*size+(x-1)%size])*.22
  dy=(grain[((y+1)%size)*size+x]-grain[((y-1)%size)*size+x])*.22
  normal=Vector((-dx,-dy,1)).normalized();normals.extend([normal.x*.5+.5,normal.y*.5+.5,normal.z*.5+.5,1])
def embedded(name,pixels,noncolor=False):
 image=bpy.data.images.new(name,width=size,height=size,alpha=True)
 if noncolor:image.colorspace_settings.name='Non-Color'
 image.pixels=pixels;image.pack();return image
color_image=embedded('Leather grain',colors);normal_image=embedded('Leather pores',normals,True)
for key in ['Leather','Pocket']:
 mat=M[key];nodes=mat.node_tree.nodes;links=mat.node_tree.links;shader=nodes.get('Principled BSDF')
 tex=nodes.new('ShaderNodeTexImage');tex.image=color_image;links.new(tex.outputs['Color'],shader.inputs['Base Color'])
 tex=nodes.new('ShaderNodeTexImage');tex.image=normal_image;normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.45;links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
taper('Barrel',(0,-.50,0),.55,.043,.029,1,'Stitch',None)
taper('Handle',(0,-.115,0),.25,.019,.026,1,'Dark',None)
ell('Knob',(0,.02,0),(.031,.018,.031),'Dark')
bat=join('Bat')
# Refine the silhouette consistently across weighted vertices and bone sockets.
# Longer legs, smaller head/gear, and less barrel-shaped shoulders.
def height(y):return y*1.16 if y<.85 else y+.136
for v in body.data.vertices:
 old=v.co.z
 if old>=1.48:
  v.co.x*=.88;v.co.y*=.9;v.co.z=height(1.48)+(old-1.48)*.88
 else:v.co.z=height(old)
for obj in [cap,helmet]:
 for v in obj.data.vertices:v.co.x*=.88;v.co.y*=.9;v.co.z*=.88
bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for b in rig.data.edit_bones:
 b.head.z=height(b.head.z);b.tail.z=height(b.tail.z)
bpy.ops.object.mode_set(mode='OBJECT')
# Export reusable body + equipment. Runtime attaches equipment to matching bones.
for p in [ROOT/'web/models',ROOT/'assets/players']:p.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'web/models/athlete.glb'),export_format='GLB',export_animations=False,export_skins=True,export_yup=True,export_materials='EXPORT')
# Save an assembled, editable Blender original after exporting socket-local gear.
for obj,bone,point in [(face,'Head',(0,1.48,0)),(cap,'Head',(0,1.48,0)),(helmet,'Head',(0,1.48,0)),(glove,'HandL',(-.315,.80,0)),(bat,'HandR',(.315,.80,0))]:
 obj.parent=rig;obj.parent_type='BONE';obj.parent_bone=bone;bpy.context.view_layer.update();obj.matrix_world=Matrix.Translation(xyz((point[0],height(point[1]),point[2])))
helmet.hide_set(True);bat.hide_set(True);rig.show_in_front=True
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/players/athlete.blend'))
print('DUGOUT MODEL:',(ROOT/'web/models/athlete.glb').stat().st_size,'bytes;',sum(len(o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'faces')
