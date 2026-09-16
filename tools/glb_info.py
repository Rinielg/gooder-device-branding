#!/usr/bin/env python3
import struct, json, sys, math

def load(path):
    with open(path,'rb') as f: data = f.read()
    magic, ver, length = struct.unpack('<III', data[:12])
    assert magic == 0x46546C67, "not a GLB"
    off = 12; js = None; bin_ = None
    while off < length:
        clen, ctype = struct.unpack('<II', data[off:off+8]); off += 8
        chunk = data[off:off+clen]; off += clen
        if ctype == 0x4E4F534A: js = json.loads(chunk)
        elif ctype == 0x004E4942: bin_ = chunk
    return js, bin_

def node_matrix(n):
    if 'matrix' in n:
        m = n['matrix']
        return [[m[0],m[4],m[8],m[12]],[m[1],m[5],m[9],m[13]],[m[2],m[6],m[10],m[14]],[m[3],m[7],m[11],m[15]]]
    t = n.get('translation',[0,0,0]); r = n.get('rotation',[0,0,0,1]); s = n.get('scale',[1,1,1])
    x,y,z,w = r
    R = [[1-2*(y*y+z*z), 2*(x*y-z*w),   2*(x*z+y*w)],
         [2*(x*y+z*w),   1-2*(x*x+z*z), 2*(y*z-x*w)],
         [2*(x*z-y*w),   2*(y*z+x*w),   1-2*(x*x+y*y)]]
    M = [[R[i][j]*s[j] for j in range(3)]+[t[i]] for i in range(3)]
    M.append([0,0,0,1]); return M

def mul(A,B):
    return [[sum(A[i][k]*B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
def xform(M,p):
    return [sum(M[i][k]*p[k] for k in range(3)) + M[i][3] for i in range(3)]

js, _ = load(sys.argv[1])
print("meshes", len(js.get('meshes',[])), "materials", len(js.get('materials',[])),
      "images", len(js.get('images',[])), "nodes", len(js.get('nodes',[])))
mats = [m.get('name') for m in js.get('materials',[])]
print("material names sample:", mats[:6], "... total", len(mats))
print("has KSynYqGGNGMUJti:", 'KSynYqGGNGMUJti' in mats)

acc = js['accessors']
lo=[1e9]*3; hi=[-1e9]*3
screen_lo=[1e9]*3; screen_hi=[-1e9]*3
def walk(ni, parent):
    global lo,hi,screen_lo,screen_hi
    n = js['nodes'][ni]
    M = mul(parent, node_matrix(n))
    if 'mesh' in n:
        for prim in js['meshes'][n['mesh']]['primitives']:
            a = acc[prim['attributes']['POSITION']]
            is_screen = prim.get('material') is not None and mats[prim['material']]=='KSynYqGGNGMUJti'
            for corner in [(a['min'][0],a['min'][1],a['min'][2]),(a['max'][0],a['max'][1],a['max'][2]),
                           (a['min'][0],a['max'][1],a['min'][2]),(a['max'][0],a['min'][1],a['max'][2]),
                           (a['min'][0],a['min'][1],a['max'][2]),(a['max'][0],a['max'][1],a['min'][2]),
                           (a['min'][0],a['max'][1],a['max'][2]),(a['max'][0],a['min'][1],a['min'][2])]:
                w = xform(M, corner)
                for i in range(3):
                    lo[i]=min(lo[i],w[i]); hi[i]=max(hi[i],w[i])
                    if is_screen:
                        screen_lo[i]=min(screen_lo[i],w[i]); screen_hi[i]=max(screen_hi[i],w[i])
    for c in n.get('children',[]): walk(c, M)

I = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
for ni in js['scenes'][js.get('scene',0)]['nodes']: walk(ni, I)
size=[round((hi[i]-lo[i]),5) for i in range(3)]
print("MODEL bounds min", [round(v,5) for v in lo], "max", [round(v,5) for v in hi])
print("MODEL size (gltf units)", size, "-> mm", [round(v*10,3) for v in size])
ssize=[round((screen_hi[i]-screen_lo[i]),5) for i in range(3)]
print("SCREEN size (gltf units)", ssize, "-> mm", [round(v*10,3) for v in ssize])
print("SCREEN centre", [round((screen_lo[i]+screen_hi[i])/2,5) for i in range(3)])
ax = sorted(range(3), key=lambda i: ssize[i])
print("SCREEN thin axis =", 'XYZ'[ax[0]], " planar mm:", [round(ssize[ax[1]]*10,3), round(ssize[ax[2]]*10,3)],
      "aspect", round(ssize[ax[1]]/ssize[ax[2]],5))
