#!/usr/bin/env bash
# Rebuild the web assets from iphone-18-pro.usdz.
#
# The USDZ holds two devices (iPhone 18 Pro and Pro Max) and a "Color" variant
# set with four colourways. glTF cannot carry USD variants, so this script
# exports one GLB per device with the Black colourway baked in, and emits
# variants.json describing what every other colourway changes.
#
# Requires: Blender 3.3+, Apple USD tools (/usr/bin/usdcat), Python 3.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
SRC="$ROOT/iphone-18-pro.usdz"
WORK="${TMPDIR:-/tmp}/mockup-model-build"
PUBLIC="$ROOT/app/public"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"

VARIANTS=(Black Burgundy Glacier Silver)
DEVICE_PRIM_ROOT="/KvFiGLnoDCgrTiu/xYOCLbDjKmKlJoU"

echo "==> unpacking $SRC"
rm -rf "$WORK"; mkdir -p "$WORK/usdz"
unzip -oq "$SRC" -d "$WORK/usdz"

echo "==> flattening each colourway"
cd "$WORK/usdz"
for v in "${VARIANTS[@]}"; do
  cat > "sel_$v.usda" <<USDA
#usda 1.0
(
    defaultPrim = "KvFiGLnoDCgrTiu"
    metersPerUnit = 0.01
    upAxis = "Y"
)

def "KvFiGLnoDCgrTiu" (
    prepend references = @./NUgMcWchqkPjlni.usdc@</KvFiGLnoDCgrTiu>
    variants = {
        string Color = "$v"
    }
)
{
}
USDA
  /usr/bin/usdcat --flatten "sel_$v.usda" -o "/tmp/flat_$v.usda"
done

echo "==> exporting GLBs"
# UBGArkKGrAMRRnj is the Pro; its screen faces -Z, hence the flip flag.
"$BLENDER" -b --python "$HERE/build_model.py" -- \
  "$WORK/usdz/sel_Black.usda" "$DEVICE_PRIM_ROOT/UBGArkKGrAMRRnj" \
  "$PUBLIC/models/iphone-18-pro.glb" "$WORK/report-pro.json" 1 >/dev/null
"$BLENDER" -b --python "$HERE/build_model.py" -- \
  "$WORK/usdz/sel_Black.usda" "$DEVICE_PRIM_ROOT/wUOhcMgiBmCgGaw" \
  "$PUBLIC/models/iphone-18-pro-max.glb" "$WORK/report-promax.json" 0 >/dev/null

echo "==> extracting colourway material data"
python3 "$HERE/extract2.py"
python3 "$HERE/gen_variants.py" \
  "$WORK/usdz/jRjgayqEXbzTktO/gXchPUVGRAkMWSE" "$PUBLIC" \
  "$ROOT/iphone-18-pro-color-variants.lsd"

echo "==> verifying"
for k in pro pro-max; do python3 "$HERE/glb_info.py" "$PUBLIC/models/iphone-18-$k.glb"; done
echo "done — assets written to $PUBLIC"
