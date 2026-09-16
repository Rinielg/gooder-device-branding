import bpy, sys, os, json, mathutils
argv = sys.argv[sys.argv.index("--")+1:]
SRC, DEVICE_PRIM, DST, REPORT = argv[0], argv[1], argv[2], argv[3]
FLIP = len(argv) > 4 and argv[4] == "1"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.usd_import(filepath=SRC, import_materials=True, import_usd_preview=True,
                      read_mesh_uvs=True, import_cameras=False, import_lights=False,
                      prim_path_mask=DEVICE_PRIM,
                      mtl_name_collision_mode='REFERENCE_EXISTING')

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
report = {"device_prim": DEVICE_PRIM, "meshes": len(meshes),
          "materials": sorted(m.name for m in bpy.data.materials),
          "images": len(bpy.data.images)}
if not meshes:
    report["error"] = "no meshes imported (prim_path_mask may be unsupported)"
    json.dump(report, open(REPORT,'w'), indent=1); print("REPORT_WRITTEN"); sys.exit(0)

def world_bounds(objs):
    lo = mathutils.Vector((1e9,)*3); hi = mathutils.Vector((-1e9,)*3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            for i in range(3): lo[i]=min(lo[i],w[i]); hi[i]=max(hi[i],w[i])
    return lo, hi

lo, hi = world_bounds(meshes)
centre = (lo + hi) / 2.0
report["bounds_before"] = {"min":[round(v,5) for v in lo], "max":[round(v,5) for v in hi],
                           "size_cm":[round(hi[i]-lo[i],5) for i in range(3)]}

# centre the whole device at the origin by moving the top-level roots
for o in bpy.data.objects:
    if o.parent is None:
        o.location = o.location - centre
bpy.context.view_layer.update()

# Normalise orientation. Blender here: +Y = phone top, +/-Z = screen front.
# glTF export_yup maps Blender (x,y,z) -> glTF (x, z, -y).
# Target glTF: +Y = top, +Z = screen front, X = width.
import math as _m
R = mathutils.Matrix.Rotation(_m.radians(90.0), 4, 'X')
if FLIP:
    R = R @ mathutils.Matrix.Rotation(_m.radians(180.0), 4, 'Y')
for o in bpy.data.objects:
    if o.parent is None:
        o.matrix_world = R @ o.matrix_world
bpy.context.view_layer.update()
report["normalise_flip"] = FLIP

lo2, hi2 = world_bounds(meshes)
report["bounds_after"] = {"min":[round(v,5) for v in lo2], "max":[round(v,5) for v in hi2],
                          "size_cm":[round(hi2[i]-lo2[i],5) for i in range(3)]}
report["size_mm"] = [round((hi2[i]-lo2[i])*10, 3) for i in range(3)]

# ---- screen mesh analysis (material KSynYqGGNGMUJti) ----
screens = []
for o in meshes:
    names = [s.material.name for s in o.material_slots if s.material]
    if 'KSynYqGGNGMUJti' not in names: continue
    me = o.data
    slo, shi = world_bounds([o])
    tris = sum(len(p.vertices)-2 for p in me.polygons)
    # normal (area-weighted, world space)
    nrm = mathutils.Vector((0,0,0))
    R = o.matrix_world.to_3x3()
    for p in me.polygons: nrm += (R @ p.normal) * p.area
    if nrm.length: nrm.normalize()
    uv = me.uv_layers.active
    uvb = None
    if uv:
        us = [d.uv[0] for d in uv.data]; vs = [d.uv[1] for d in uv.data]
        uvb = {"u":[round(min(us),5), round(max(us),5)], "v":[round(min(vs),5), round(max(vs),5)]}
    size = [round((shi[i]-slo[i])*10, 4) for i in range(3)]   # mm
    planar = sorted(size)[1:]                                  # drop the ~0 axis
    screens.append({"object": o.name, "tris": tris, "verts": len(me.vertices),
                    "size_mm": size, "planar_mm": planar,
                    "aspect": round(planar[0]/planar[1], 5),
                    "normal": [round(v,4) for v in nrm], "uv_range": uvb,
                    "centre_cm": [round((slo[i]+shi[i])/2, 5) for i in range(3)],
                    "materials": names})
report["screens"] = screens

# per-material texture/image usage
mat_imgs = {}
for m in bpy.data.materials:
    if not m.use_nodes: continue
    imgs = [n.image.name for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]
    if imgs: mat_imgs[m.name] = imgs
report["material_images"] = mat_imgs

os.makedirs(os.path.dirname(DST), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_materials='EXPORT',
                          export_image_format='AUTO', export_yup=True, export_apply=True,
                          export_cameras=False, export_lights=False)
report["glb"] = DST
report["glb_bytes"] = os.path.getsize(DST)
json.dump(report, open(REPORT,'w'), indent=1)
print("REPORT_WRITTEN", REPORT)
