"""Create DUGOUT's original skinned athlete and modular equipment.
Run: blender -b --python tools/blender/build-player.py
Coordinates below are game axes: X right, Y up, Z forward.
"""
import bpy, math
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
M={k:material(k,c,r) for k,c,r in [('Team','#c96845',.65),('Cream','#eee9d6',.82),('Skin','#c98b62',.68),('Dark','#202d36',.6),('Leather','#9d6234',.9),('Stitch','#d9af6c',.9),('Eye','#faf6e8',.3),('Iris','#49392d',.4)]}
parts=[]
def finish(o,name,mat,bone=None,smooth=True):
 o.name=name;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.data.materials.append(M[mat])
 for f in o.data.polygons:f.use_smooth=smooth
 if bone:o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))),1,'REPLACE')
 parts.append(o);return o
def ell(name,p,s,mat,bone=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,location=xyz(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1]);return finish(o,name,mat,bone)
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
profile('Jersey',0,[(.83,.222,.157),(.96,.238,.175),(1.19,.29,.192),(1.30,.275,.176),(1.355,.21,.12),(1.39,.095,.073)],'Team','Spine')
ell('Hips',(0,.79,0),(.235,.115,.17),'Cream','Root')
box('Belt',(0,.815,0),(.46,.045,.345),'Dark','Root')
box('Buckle',(0,.815,.183),(.065,.046,.018),'Stitch','Root',.006)
box('Placket',(0,1.075,.173),(.016,.38,.016),'Cream','Spine',.004)
for y in [.93,1.04,1.15]:ell('Button',(0,y,.185),(.013,.013,.009),'Dark','Spine')
text('ChestMark','D',(-.105,1.19,.19),.105,'Cream','Spine')
text('Number','17',(0,1.115,-.19),.225,'Cream','Spine',True)
ell('Neck',(0,1.42,0),(.085,.11,.08),'Skin','Spine')
head=ell('Face',(0,1.615,.006),(.182,.222,.17),'Skin','Head')
# Sculpt the jaw instead of retaining a spherical silhouette.
for v in head.data.vertices:
 if v.co.z<1.55:v.co.x*=.82
for side in [-1,1]:
 ell('Ear',(side*.177,1.615,0),(.04,.065,.035),'Skin','Head')
 ell('Eye',(side*.067,1.665,.153),(.038,.028,.009),'Eye','Head')
 ell('Iris',(side*.067,1.664,.164),(.018,.022,.005),'Iris','Head')
 ell('Pupil',(side*.067,1.664,.17),(.009,.014,.004),'Dark','Head')
 box('Brow',(side*.067,1.714,.156),(.09,.018,.022),'Dark','Head',.005)
ell('Nose',(0,1.614,.174),(.028,.04,.026),'Skin','Head')
box('Smile',(0,1.547,.172),(.063,.009,.007),'Dark','Head',.003)
for side,suffix in [(-1,'L'),(1,'R')]:
 x=side*.315
 sleeve=profile('Sleeve',x,[(1.086,.098,.098),(1.12,.101,.101),(1.22,.108,.108),(1.30,.11,.108),(1.36,.085,.08),(1.39,.018,.018)],'Team','UpperArm'+suffix)
 sleeve.data.materials.append(M['Cream'])
 for face in sleeve.data.polygons[:16]:face.material_index=1
 profile('Forearm',x,[(.82,.054,.054),(.93,.070,.070),(1.03,.081,.081),(1.085,.06,.06),(1.11,.018,.018)],'Skin','Forearm'+suffix)
 taper('Wristband',(x,.812,0),.045,.058,.058,1,'Dark','Hand'+suffix)
 ell('Palm',(x,.756,.015),(.065,.086,.036),'Skin','Hand'+suffix)
 for j in range(4):ell('Finger',(x+(j-1.5)*.027,.70,.018),(.017,.04,.02),'Skin','Hand'+suffix)
 lx=side*.125
 taper('Thigh',(lx,.59,0),.32,.13,.10,1.05,'Cream','Thigh'+suffix)
 profile('Trouser',lx,[(.155,.073,.073),(.29,.086,.089),(.43,.098,.10),(.49,.065,.067),(.51,.018,.018)],'Cream','Shin'+suffix)
 box('TrouserStripe',(lx+side*.10,.56,0),(.017,.26,.024),'Team','Thigh'+suffix,.005)
 taper('Sock',(lx,.145,0),.10,.072,.069,1,'Dark','Shin'+suffix)
 box('CleatSole',(lx,.035,.072),(.19,.06,.32),'Dark','Foot'+suffix,.025)
 ell('Cleat',(lx,.088,.074),(.098,.065,.165),'Dark','Foot'+suffix)
 box('ShoePanel',(lx+side*.07,.085,.085),(.024,.04,.135),'Cream','Foot'+suffix,.008)
 for z in [.065,.10,.135]:box('Lace',(lx,.139,z),(.08,.009,.012),'Cream','Foot'+suffix,.003)
body=join('Athlete')
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
ell('GlovePalm',(0,-.055,.027),(.13,.17,.07),'Leather')
for i in range(4):
 x=(i-1.5)*.06;ell('GloveFinger',(x,-.025,.033),(.044,.175-.012*abs(i-1.5),.061),'Leather')
 box('GloveLace',(x,-.03,.092),(.012,.20,.01),'Stitch',bevel=.004)
ell('Thumb',(.115,-.095,.042),(.073,.11,.07),'Leather')
box('Webbing',(.074,-.006,.073),(.08,.095,.022),'Stitch',bevel=.01)
glove=join('Glove')
taper('Barrel',(0,-.50,0),.55,.043,.029,1,'Stitch',None)
taper('Handle',(0,-.115,0),.25,.019,.026,1,'Dark',None)
ell('Knob',(0,.02,0),(.031,.018,.031),'Dark')
bat=join('Bat')
# Export reusable body + equipment. Runtime attaches equipment to matching bones.
for p in [ROOT/'web/models',ROOT/'assets/players']:p.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'web/models/athlete.glb'),export_format='GLB',export_animations=False,export_skins=True,export_yup=True,export_materials='EXPORT')
# Save an assembled, editable Blender original after exporting socket-local gear.
for obj,bone,point in [(cap,'Head',(0,1.48,0)),(helmet,'Head',(0,1.48,0)),(glove,'HandL',(-.315,.80,0)),(bat,'HandR',(.315,.80,0))]:
 obj.parent=rig;obj.parent_type='BONE';obj.parent_bone=bone;bpy.context.view_layer.update();obj.matrix_world=Matrix.Translation(xyz(point))
helmet.hide_set(True);bat.hide_set(True);rig.show_in_front=True
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/players/athlete.blend'))
print('DUGOUT MODEL:',(ROOT/'web/models/athlete.glb').stat().st_size,'bytes;',sum(len(o.data.polygons) for o in bpy.data.objects if o.type=='MESH'),'faces')
