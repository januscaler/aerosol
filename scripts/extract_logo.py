#!/usr/bin/env python3
"""
Crop source logo to a tight frame around non-background pixels (white background kept).
Outputs opaque PNGs for UI + square app icons (white letterboxing) for Tauri.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "images" / "logo.png"
OUT_UI = ROOT / "public" / "logo.png"
ICONS_DIR = ROOT / "src-tauri" / "icons"


def as_rgb_on_white(im: Image.Image) -> Image.Image:
    """Flatten transparency onto white so edge pixels classify correctly."""
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[3])
        return bg
    return im.convert("RGB")


def is_background_pixel(r: int, g: int, b: int, *, white_floor: int = 238, sat_max: int = 32) -> bool:
    """Flat white / light gray margins typical of marketing PNGs."""
    if r < white_floor or g < white_floor or b < white_floor:
        return False
    mx, mn = max(r, g, b), min(r, g, b)
    return (mx - mn) <= sat_max


def content_bbox(im: Image.Image):
    im_rgb = as_rgb_on_white(im)
    w, h = im_rgb.size
    px = im_rgb.load()
    min_x, min_y = w, h
    max_x, max_y = -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if not is_background_pixel(r, g, b):
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if max_x < 0:
        return None
    return (min_x, min_y, max_x + 1, max_y + 1)


def crop_with_padding(im: Image.Image, pad: int = 28) -> Image.Image:
    flat = as_rgb_on_white(im)
    bbox = content_bbox(flat)
    if bbox is None:
        return flat
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(flat.width, r + pad)
    b = min(flat.height, b + pad)
    return flat.crop((l, t, r, b))


def paste_on_white_square(im_rgb: Image.Image, side: int = 1024, margin: float = 0.08) -> Image.Image:
    """Scale uniformly to fit inside side×side with white border."""
    w, h = im_rgb.size
    inner = int(side * (1.0 - 2 * margin))
    scale = min(inner / w, inner / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = im_rgb.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (side, side), (255, 255, 255))
    ox = (side - nw) // 2
    oy = (side - nh) // 2
    canvas.paste(resized, (ox, oy))
    return canvas


def main() -> int:
    if not SRC.is_file():
        print(f"Missing source: {SRC}", file=sys.stderr)
        return 1
    im = Image.open(SRC)
    print(f"Source {SRC.name}: {im.size} {im.mode}")

    cropped = crop_with_padding(im, pad=28)
    OUT_UI.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(OUT_UI, "PNG", optimize=True)
    print(f"Wrote UI logo: {OUT_UI} ({cropped.size})")

    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    master = paste_on_white_square(cropped, 1024)
    icon_png = ICONS_DIR / "icon.png"
    master.save(icon_png, "PNG", optimize=True)
    print(f"Wrote {icon_png}")

    for name, size in [
        ("32x32.png", 32),
        ("128x128.png", 128),
        ("128x128@2x.png", 256),
    ]:
        resized = master.resize((size, size), Image.Resampling.LANCZOS)
        dest = ICONS_DIR / name
        resized.save(dest, "PNG", optimize=True)
        print(f"Wrote {dest}")

    print("Next: npx tauri icon src-tauri/icons/icon.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
