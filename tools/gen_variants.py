#!/usr/bin/env python3
import json, os, collections, shutil, sys

SRC_TEX = sys.argv[1]   # unzipped usdz texture dir
OUT_DIR = sys.argv[2]   # public/ root
d = json.load(open('/tmp/mats_by_path.json'))
USD_V = ["Black","Burgundy","Glacier","Silver"]
DEV = {"UBGArkKGrAMRRnj":"iphone-18-pro", "wUOhcMgiBmCgGaw":"iphone-18-pro-max"}

def split(v):
    out = collections.defaultdict(dict)
    for p, rec in d[v].items():
        parts = p.strip('/').split('/')
        out[DEV[parts[2]]][parts[-1]] = rec
    return out
by_v = {v: split(v) for v in USD_V}

# ---- verify the .lsd friendly names line up with the USD variants, by value ----
lsd = json.load(open(sys.argv[3]))
probe = {e["@states"][0]: e["TsCoKngnEdcjZrd"]["colorR"] for e in lsd if "TsCoKngnEdcjZrd" in e}
usd_probe = {v: by_v[v]["iphone-18-pro-max"]["NTEUvFZCGwiAbXI"]["params"]["diffuseColor"][0] for v in USD_V}
print("value cross-check (.lsd colorR  vs  USD diffuseColor.r):")
name_map = {}
for lname, lval in probe.items():
    match = min(USD_V, key=lambda v: abs(usd_probe[v]-lval))
    ok = abs(usd_probe[match]-lval) < 1e-6
    name_map[match] = lname.replace('_',' ')
    print(f"  .lsd {lname:9s} {lval:.8f}  ->  USD {match:9s} {usd_probe[match]:.8f}  {'MATCH' if ok else 'NO MATCH'}")

SWATCH = {"Black":"#1b1b1d","Burgundy":"#5b3a48","Glacier":"#a8c4dd","Silver":"#d8d8d6"}

os.makedirs(os.path.join(OUT_DIR,'textures'), exist_ok=True)
needed, manifest = set(), {}

for devkey in DEV.values():
    # materials whose spec differs across variants
    base = by_v["Black"][devkey]
    changing = [m for m in base if any(by_v[v][devkey].get(m) != base[m] for v in USD_V[1:])]
    variants = {}
    for v in USD_V:
        mats = {}
        for m in changing:
            rec = by_v[v][devkey][m]
            entry = {}
            p = rec["params"]
            if "diffuseColor" in p:  entry["color"] = [round(c,6) for c in p["diffuseColor"]]
            if "metallic" in p:      entry["metalness"] = round(p["metallic"],6)
            if "roughness" in p:     entry["roughness"] = round(p["roughness"],6)
            if "clearcoat" in p:     entry["clearcoat"] = round(p["clearcoat"],6)
            if "clearcoatRoughness" in p: entry["clearcoatRoughness"] = round(p["clearcoatRoughness"],6)
            maps = {}
            KEYMAP = {"diffuseColor":"map","emissiveColor":"emissiveMap","normal":"normalMap",
                      "roughness":"roughnessMap","metallic":"metalnessMap","occlusion":"aoMap"}
            for k, mm in rec["maps"].items():
                if not mm["file"]: continue
                maps[KEYMAP.get(k,k)] = mm["file"]
                needed.add(mm["file"])
                if k == "emissiveColor" and mm["scale"]:
                    entry["emissiveIntensity"] = round(mm["scale"][0], 4)
            if maps: entry["maps"] = maps
            mats[m] = entry
        variants[v] = {"id": v, "label": name_map.get(v, v), "swatch": SWATCH[v], "materials": mats}
    manifest[devkey] = {"changingMaterials": changing, "variants": variants}
    print(f"\n{devkey}: {len(changing)} variant-dependent materials")

# copy textures
copied = 0
for root, _, files in os.walk(SRC_TEX):
    for f in files:
        if f in needed:
            shutil.copy2(os.path.join(root,f), os.path.join(OUT_DIR,'textures',f)); copied += 1
size = sum(os.path.getsize(os.path.join(OUT_DIR,'textures',f)) for f in os.listdir(os.path.join(OUT_DIR,'textures')))
print(f"\ntextures needed {len(needed)}, copied {copied}, total {size/1e6:.2f} MB")

json.dump(manifest, open(os.path.join(OUT_DIR,'models','variants.json'),'w'), indent=1)
print("wrote", os.path.join(OUT_DIR,'models','variants.json'))
