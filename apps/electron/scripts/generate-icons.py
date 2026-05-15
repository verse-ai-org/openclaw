#!/usr/bin/env python3
"""Generate macOS .icns and Windows .ico from apps/electron/resources/icon.png.

Apple macOS app icon spec (Dock / Launchpad sizing):
  - Canvas: 1024×1024 px
  - Safe area for artwork: 824×824 px (100 px transparent margin on each side)

Icons drawn edge-to-edge on 1024 look oversized in the Dock; content must stay inside
the 824 safe area. See scripts/build_icon.sh and Apple HIG > App icons.
"""
from __future__ import annotations

import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError as exc:  # pragma: no cover
    print("Pillow is required: python3 -m pip install Pillow", file=sys.stderr)
    raise SystemExit(1) from exc

SCRIPT_DIR = Path(__file__).resolve().parent
RESOURCES = SCRIPT_DIR.parent / "resources"
SOURCE = RESOURCES / "icon.png"
ICNS_OUT = RESOURCES / "icon.icns"
ICO_OUT = RESOURCES / "icon.ico"

CANVAS = 1024
# Apple standard safe area — matches Icon Composer / scripts/build_icon.sh (824 art + pad).
MACOS_SAFE_AREA = 824
MACOS_CANVAS_MARGIN = (CANVAS - MACOS_SAFE_AREA) // 2  # 100 px per side
# White squircle fills the safe area so Dock size matches other macOS apps.
WHITE_TILE_SIZE = MACOS_SAFE_AREA
# Ring outer diameter vs white tile — ~83% keeps ~8% inner margin inside the 824 safe area.
RING_FILL_OF_TILE = 0.83
# Rounded-rect corner radius relative to the white tile edge (~macOS squircle).
SQUIRCLE_CORNER_RATIO = 0.223
BACKGROUND_RGBA = (255, 255, 255, 255)
# Treat near-black pixels as transparent (source icon.png uses a black matte).
BLACK_KEY_THRESHOLD = 40
# Ignore faint fringe pixels when computing visual center (ring body only).
CENTROID_MIN_ALPHA = 48

ICO_SIZES = (256, 128, 64, 48, 32, 24, 16)

# Apple iconset: filename -> pixel size (see TN2314).
ICONSET_ENTRIES: tuple[tuple[str, int], ...] = (
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
)


def load_source() -> Image.Image:
    if not SOURCE.is_file():
        print(f"Missing source icon: {SOURCE}", file=sys.stderr)
        raise SystemExit(1)
    return Image.open(SOURCE).convert("RGBA")


def crop_to_content(img: Image.Image) -> Image.Image:
    """Trim transparent margins so scaling targets the ring, not the full 1024 canvas."""
    bbox = img.getbbox()
    if bbox is None:
        return img
    return img.crop(bbox)


def alpha_centroid(img: Image.Image) -> tuple[float, float]:
    """Alpha-weighted visual center (glow is asymmetric vs bbox)."""
    pixels = img.load()
    width, height = img.size
    total = 0.0
    center_x = 0.0
    center_y = 0.0
    min_alpha = CENTROID_MIN_ALPHA
    for y in range(height):
        for x in range(width):
            alpha = pixels[x, y][3]
            if alpha < min_alpha:
                continue
            total += alpha
            center_x += x * alpha
            center_y += y * alpha
    if total <= 0:
        return width / 2.0, height / 2.0
    return center_x / total, center_y / total


def center_in_square_by_centroid(img: Image.Image) -> Image.Image:
    """Pad to a square canvas with the ring centroid at the exact center."""
    width, height = img.size
    centroid_x, centroid_y = alpha_centroid(img)
    half_side = max(centroid_x, width - centroid_x, centroid_y, height - centroid_y)
    side = max(1, int(math.ceil(half_side * 2)))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    paste_x = int(round(side / 2 - centroid_x))
    paste_y = int(round(side / 2 - centroid_y))
    canvas.paste(img, (paste_x, paste_y), img)
    return canvas


def remove_near_black(src: Image.Image) -> Image.Image:
    """Key out the black matte so the ring can sit on a white background."""
    img = src.convert("RGBA")
    pixels = img.load()
    width, height = img.size
    threshold = BLACK_KEY_THRESHOLD
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if red <= threshold and green <= threshold and blue <= threshold:
                pixels[x, y] = (red, green, blue, 0)
    return img


def white_tile_geometry() -> tuple[int, int, int]:
    """Return (tile_size, inset_offset, corner_radius) inside the macOS 824 safe area."""
    tile_size = WHITE_TILE_SIZE
    inset = MACOS_CANVAS_MARGIN
    radius = max(1, int(round(tile_size * SQUIRCLE_CORNER_RATIO)))
    return tile_size, inset, radius


def white_squircle_background() -> Image.Image:
    tile_size, inset, radius = white_tile_geometry()
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (inset, inset, inset + tile_size - 1, inset + tile_size - 1),
        radius=radius,
        fill=BACKGROUND_RGBA,
    )
    return canvas


def compose_icon(src: Image.Image) -> Image.Image:
    foreground = center_in_square_by_centroid(crop_to_content(remove_near_black(src)))
    width, height = foreground.size
    tile_size, _, _ = white_tile_geometry()
    target = int(round(tile_size * RING_FILL_OF_TILE))
    scale = min(target / width, target / height)
    new_w = max(1, int(round(width * scale)))
    new_h = max(1, int(round(height * scale)))
    logo = foreground.resize((new_w, new_h), Image.Resampling.LANCZOS)

    canvas = white_squircle_background()
    # Align ring centroid with white-tile center (= canvas center when tile is centered).
    tile_center = CANVAS / 2
    centroid_x, centroid_y = alpha_centroid(logo)
    offset_x = int(round(tile_center - centroid_x))
    offset_y = int(round(tile_center - centroid_y))
    canvas.paste(logo, (offset_x, offset_y), logo)
    return canvas


def flatten_for_ico(img: Image.Image) -> Image.Image:
    """ICO writers on Windows often reject RGBA; composite onto white like the app icon."""
    if img.mode == "RGB":
        return img
    rgba = img.convert("RGBA")
    flat = Image.new("RGB", rgba.size, BACKGROUND_RGBA[:3])
    flat.paste(rgba, mask=rgba.split()[3])
    return flat


def write_ico(master: Image.Image, out_path: Path) -> None:
    images = [
        flatten_for_ico(master.resize((size, size), Image.Resampling.LANCZOS)) for size in ICO_SIZES
    ]
    try:
        images[0].save(
            out_path,
            format="ICO",
            sizes=[(img.width, img.height) for img in images],
            append_images=images[1:],
        )
    except OSError as exc:
        # Older Pillow on Windows: save largest frame only (electron-builder accepts it).
        images[0].save(out_path, format="ICO")
        print(f"Wrote {out_path} (single size; multi-size ICO failed: {exc})", file=sys.stderr)
        return
    print(f"Wrote {out_path} ({len(ICO_SIZES)} sizes)")


def write_icns(master: Image.Image, out_path: Path) -> None:
    iconutil = shutil.which("iconutil")
    sips = shutil.which("sips")
    if not iconutil or not sips:
        print("sips/iconutil not found; skipping .icns (macOS only)", file=sys.stderr)
        return

    with tempfile.TemporaryDirectory(prefix="bossim-icon-") as tmp:
        tmp_path = Path(tmp)
        master_path = tmp_path / "master_1024.png"
        master.save(master_path)

        iconset = tmp_path / "icon.iconset"
        iconset.mkdir()

        for filename, size in ICONSET_ENTRIES:
            dest = iconset / filename
            subprocess.run(
                [sips, "-z", str(size), str(size), str(master_path), "--out", str(dest)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        subprocess.run([iconutil, "-c", "icns", str(iconset), "-o", str(out_path)], check=True)

    print(f"Wrote {out_path}")


def main() -> None:
    master = compose_icon(load_source())
    write_ico(master, ICO_OUT)
    write_icns(master, ICNS_OUT)
    print("Done.")


if __name__ == "__main__":
    main()
