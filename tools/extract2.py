#!/usr/bin/env python3
"""Path-aware extraction of per-variant UsdPreviewSurface params, partitioned by device group."""
import re, json, os, collections

VARIANTS = ["Black", "Burgundy", "Glacier", "Silver"]
def_re  = re.compile(r'^(\s*)(?:def|over|class)\s+(?:\w+\s+)?"([^"]+)"')
close_re= re.compile(r'^(\s*)\}\s*$')
attr_re = re.compile(r'^\s*(?:uniform\s+)?(\w+[\w\[\]]*)\s+([\w:\.]+)\s*=\s*(.+?)\s*$')
conn_re = re.compile(r'^\s*(?:uniform\s+)?\w+[\w\[\]]*\s+([\w:]+)\.connect\s*=\s*<([^>]+)>')
mat_re  = re.compile(r'^(\s*)def Material "([^"]+)"')
sh_re   = re.compile(r'^(\s*)def Shader "([^"]+)"')

def parse_value(v):
    v = v.strip().rstrip('(').strip()
    if v.startswith('@') and v.endswith('@'): return ('asset', v[1:-1])
    if v.startswith('('):
        nums = re.findall(r'-?\d*\.?\d+(?:[eE][+-]?\d+)?', v)
        try: return ('tuple', [float(n) for n in nums])
        except ValueError: return ('raw', v)
    if v.startswith('"'): return ('str', v.strip('"'))
    try: return ('num', float(v))
    except ValueError: return ('raw', v)

def parse(path):
    """-> {material_prim_path: {shaders:{...}}}"""
    mats = {}
    stack = []           # (indent, name)
    cur_mat = None; cur_mat_indent = -1
    cur_sh  = None; cur_sh_indent  = -1
    with open(path) as f:
        for line in f:
            d = def_re.match(line)
            if d:
                ind, name = len(d.group(1)), d.group(2)
                while stack and stack[-1][0] >= ind: stack.pop()
                stack.append((ind, name))
                if mat_re.match(line):
                    cur_mat_indent = ind
                    cur_mat = '/' + '/'.join(n for _, n in stack)
                    mats.setdefault(cur_mat, {"shaders": {}})
                    cur_sh = None
                elif sh_re.match(line) and cur_mat is not None:
                    cur_sh_indent, cur_sh = ind, name
                    mats[cur_mat]["shaders"].setdefault(name, {"inputs": {}, "connects": {}, "id": None})
                continue
            c = close_re.match(line)
            if c:
                ind = len(c.group(1))
                if cur_sh is not None and ind <= cur_sh_indent: cur_sh = None
                if cur_mat is not None and ind <= cur_mat_indent: cur_mat = None
                while stack and stack[-1][0] >= ind: stack.pop()
                continue
            if cur_mat is None or cur_sh is None: continue
            cc = conn_re.match(line)
            if cc:
                key = cc.group(1)
                if key.startswith('inputs:'): key = key[7:]
                mats[cur_mat]["shaders"][cur_sh]["connects"][key] = cc.group(2).split('/')[-1].split('.')[0]
                continue
            a = attr_re.match(line)
            if a:
                _t, name, val = a.groups()
                if name == 'info:id': mats[cur_mat]["shaders"][cur_sh]["id"] = val.strip('"')
                elif name.startswith('inputs:'): mats[cur_mat]["shaders"][cur_sh]["inputs"][name[7:]] = parse_value(val)
    return mats

SCALARS = ["diffuseColor","metallic","roughness","opacity","clearcoat","clearcoatRoughness",
           "ior","emissiveColor","occlusion","normal","specularColor"]

def summarise(mats):
    out = {}
    for mpath, m in mats.items():
        sh = m["shaders"]
        surf = next(((n, s) for n, s in sh.items() if s["id"] == "UsdPreviewSurface"), None)
        if not surf: continue
        _n, s = surf
        rec = {"params": {}, "maps": {}}
        for k in SCALARS:
            if k in s["inputs"]: rec["params"][k] = s["inputs"][k][1]
            if k in s["connects"]:
                t = sh.get(s["connects"][k])
                if t and t["id"] == "UsdUVTexture":
                    f = t["inputs"].get("file")
                    rec["maps"][k] = {
                        "file": os.path.basename(f[1]) if f else None,
                        "scale": t["inputs"].get("scale", (None, None))[1],
                        "wrapS": t["inputs"].get("wrapS", (None, None))[1],
                        "wrapT": t["inputs"].get("wrapT", (None, None))[1],
                        "sourceColorSpace": t["inputs"].get("sourceColorSpace", (None, None))[1],
                    }
        out[mpath] = rec
    return out

all_v = {}
for v in VARIANTS:
    all_v[v] = summarise(parse(f'/tmp/flat_{v}.usda'))
    print(f"{v}: {len(all_v[v])} material prims")

# partition by device group (4th path component)
devices = collections.defaultdict(set)
for p in all_v["Black"]:
    parts = p.strip('/').split('/')
    if len(parts) >= 3: devices[parts[2]].add(p)
print("\nDEVICE GROUPS:")
for d, ps in devices.items(): print(f"  {d}: {len(ps)} materials")

json.dump(all_v, open('/tmp/mats_by_path.json','w'), indent=1)
print("wrote /tmp/mats_by_path.json")
