"""
Repair the JPEG block structure in the device's roughness maps.

A roughness map is data, not a picture. JPEG quantises in 8x8 blocks, so its
seams survive as steps in the roughness field — and roughness drives the width
of the specular highlight, which means an invisible 1/255 step in a photograph
becomes a visible hard-edged band across a polished surface. It shows worst on
the most reflective finishes, which is why Silver reported it first.

Measured before this ran: differences across the 8-pixel seam were 1.30x and
1.36x the differences inside a block. A lossless roughness map in the same
model measures 1.01x.

The source USDZ ships the same JPEGs byte for byte, so there is no lossless
original to go back to; the data has to be repaired rather than re-extracted.
Only the excess step at each seam is removed — the part the surrounding
gradient does not predict — so real detail is left alone.

    python3 scripts/deblock-roughness.py
"""
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent.parent / 'public' / 'textures'
# Roughness maps only. The colour and normal maps are already PNG, and AO is a
# soft multiplier where a block seam does not survive into the highlight.
TARGETS = ['AdesCnZMSQKQaTi', 'koOAKHwUPGdNOGN']
BLOCK = 8
# The strength is solved for rather than chosen: the target is a seam ratio of
# 1.0, meaning the eight-pixel grid is no longer a special place in the image.
# Removing more than that flattens genuine detail that happens to land on a
# seam, and measures as a ratio BELOW one — smoother at the seams than between
# them, which is its own artefact.
TARGET_RATIO = 1.0


def seam_ratio(a: np.ndarray) -> float:
    """Differences across a block seam, over differences inside a block."""
    d = np.abs(np.diff(a, axis=1))
    cols = np.arange(d.shape[1])
    on = d[:, cols % BLOCK == BLOCK - 1].mean()
    inside = d[:, cols % BLOCK != BLOCK - 1].mean()
    return float(on / max(inside, 1e-9))


def deblock_axis(a: np.ndarray, strength: float) -> np.ndarray:
    """Flatten the excess step at every vertical block seam."""
    out = a.copy()
    h, w = a.shape
    for x in range(BLOCK, w - 1, BLOCK):
        left2, left1 = out[:, x - 2], out[:, x - 1]
        right0, right1 = out[:, x], out[:, x + 1]
        step = right0 - left1
        # What the gradients either side of the seam would have predicted.
        expected = ((left1 - left2) + (right1 - right0)) / 2.0
        excess = (step - expected) * strength
        out[:, x - 1] = left1 + excess / 2.0
        out[:, x] = right0 - excess / 2.0
    return out


def deblock(a: np.ndarray, strength: float) -> np.ndarray:
    # Both axes, by transposing rather than writing it twice.
    return deblock_axis(deblock_axis(a, strength).T, strength).T


def solve_strength(a: np.ndarray) -> float:
    """The gentlest correction that stops the seams standing out."""
    lo, hi = 0.0, 1.0
    for _ in range(24):
        mid = (lo + hi) / 2
        if seam_ratio(deblock(a, mid)) > TARGET_RATIO:
            lo = mid          # still blocky; push harder
        else:
            hi = mid          # already flat enough; ease off
    return (lo + hi) / 2


def main() -> None:
    for name in TARGETS:
        src = HERE / f'{name}.jpg'
        if not src.exists():
            print(f'{name}: already done')
            continue
        img = Image.open(src)
        arr = np.asarray(img.convert('L'), dtype=np.float64)

        before = seam_ratio(arr)
        strength = solve_strength(arr)
        fixed = np.clip(deblock(arr, strength), 0, 255)
        after = seam_ratio(fixed)
        drift = np.abs(fixed - arr).mean()

        out = HERE / f'{name}.png'
        Image.fromarray(fixed.round().astype(np.uint8), mode='L').save(out, optimize=True)
        src.unlink()
        print(f'{name}: seam ratio {before:.2f} -> {after:.2f} '
              f'(strength {strength:.2f}), mean change {drift:.2f}/255, '
              f'written as {out.name}')


if __name__ == '__main__':
    main()
