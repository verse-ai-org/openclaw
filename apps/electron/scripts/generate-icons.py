#!/usr/bin/env python3
"""Generate Bossim app icons from resources/icon.png.

macOS (.icns): Icon Composer (Icon.icon + scripts/build_icon.sh) — 824 art, transparent
pad to 1024, system squircle mask (same pipeline as OpenClaw mac app).

Windows (.ico): Icon Composer preview when available; otherwise Pillow with the same
layer scale as Icon.icon (position.scale) and a squircle mask on white.

Usage:
  python3 generate-icons.py           # .icns only (default; icon.png rarely changes)
  python3 generate-icons.py --all     # .icns + .ico
  python3 generate-icons.py --ico-only
"""
from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageChops
except ImportError as exc:  # pragma: no cover
    print("Pillow is required: python3 -m pip install Pillow", file=sys.stderr)
    raise SystemExit(1) from exc

SCRIPT_DIR = Path(__file__).resolve().parent
ELECTRON_DIR = SCRIPT_DIR.parent
REPO_ROOT = ELECTRON_DIR.parent.parent
RESOURCES = ELECTRON_DIR / "resources"
SOURCE = RESOURCES / "icon.png"
ICNS_OUT = RESOURCES / "icon.icns"
ICO_OUT = RESOURCES / "icon.ico"
ICON_ICON = ELECTRON_DIR / "Icon.icon"
ICON_ICON_JSON = ICON_ICON / "icon.json"
ICON_ICON_ASSET = ICON_ICON / "Assets" / "bossim-ring.png"
BUILD_ICON_SH = REPO_ROOT / "scripts" / "build_icon.sh"
ICON_BUILD_OUT = ELECTRON_DIR / "build" / "icon"

CANVAS = 1024
MACOS_ART_SAFE_AREA = 824
# bossim-ring.png is authored at 1.0; Icon.icon applies position.scale (e.g. 1.6).
RING_SCALE_FOR_COMPOSER_ASSET = 1.0
DEFAULT_ICON_LAYER_SCALE = 1.6
# Superellipse exponent approximating macOS squircle (continuous corners).
SQUIRCLE_EXPONENT = 5.0
# Anti-alias band (~px at final size) for squircle mask edge.
SQUIRCLE_FEATHER_PX = 2.0
SQUIRCLE_SUPERSAMPLE = 2
BACKGROUND_RGBA = (255, 255, 255, 255)
BLACK_KEY_THRESHOLD = 40
CENTROID_MIN_ALPHA = 48

ICO_SIZES = (256, 128, 64, 48, 32, 24, 16)

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


def find_ictool() -> Path | None:
    xcode = Path(os.environ.get("XCODE_APP", "/Applications/Xcode.app"))
    for name in ("ictool", "icontool"):
        candidate = (
            xcode
            / "Contents/Applications/Icon Composer.app/Contents/Executables"
            / name
        )
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate
    return None


def can_use_icon_composer() -> bool:
    return (
        sys.platform == "darwin"
        and find_ictool() is not None
        and BUILD_ICON_SH.is_file()
        and ICON_ICON.is_dir()
    )


def load_icon_layer_scale() -> float:
    """Match Icon.icon layer position.scale (bossim-ring)."""
    try:
        data = json.loads(ICON_ICON_JSON.read_text(encoding="utf-8"))
        scale = float(data["groups"][0]["layers"][0]["position"]["scale"])
        if scale > 0:
            return scale
    except (OSError, KeyError, TypeError, ValueError, IndexError):
        pass
    return DEFAULT_ICON_LAYER_SCALE


def load_source() -> Image.Image:
    if not SOURCE.is_file():
        print(f"Missing source icon: {SOURCE}", file=sys.stderr)
        raise SystemExit(1)
    return Image.open(SOURCE).convert("RGBA")


def crop_to_content(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    if bbox is None:
        return img
    return img.crop(bbox)


def alpha_centroid(img: Image.Image) -> tuple[float, float]:
    pixels = img.load()
    width, height = img.size
    total = 0.0
    center_x = 0.0
    center_y = 0.0
    for y in range(height):
        for x in range(width):
            alpha = pixels[x, y][3]
            if alpha < CENTROID_MIN_ALPHA:
                continue
            total += alpha
            center_x += x * alpha
            center_y += y * alpha
    if total <= 0:
        return width / 2.0, height / 2.0
    return center_x / total, center_y / total


def center_in_square_by_centroid(img: Image.Image) -> Image.Image:
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
    img = src.convert("RGBA")
    pixels = img.load()
    width, height = img.size
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if red <= BLACK_KEY_THRESHOLD and green <= BLACK_KEY_THRESHOLD and blue <= BLACK_KEY_THRESHOLD:
                pixels[x, y] = (red, green, blue, 0)
    return img


_SQUIRCLE_MASK_CACHE: dict[int, Image.Image] = {}


def squircle_mask(size: int, exponent: float = SQUIRCLE_EXPONENT) -> Image.Image:
    """macOS-style superellipse alpha mask with soft edges (anti-aliased)."""
    cached = _SQUIRCLE_MASK_CACHE.get(size)
    if cached is not None:
        return cached

    ss = max(1, SQUIRCLE_SUPERSAMPLE)
    work = size * ss
    mask = Image.new("L", (work, work), 0)
    pixels = mask.load()
    half = work / 2.0
    radius = half
    # Normalized "val" feather band (~SQUIRCLE_FEATHER_PX at output size).
    feather = max((SQUIRCLE_FEATHER_PX * ss) / radius, 1e-6)

    for y in range(work):
        ny = (y - half + 0.5) / radius
        abs_ny = abs(ny) ** exponent
        for x in range(work):
            nx = (x - half + 0.5) / radius
            val = abs(nx) ** exponent + abs_ny
            t = (1.0 - val) / feather
            alpha = int(max(0, min(255, round(t * 255))))
            pixels[x, y] = alpha

    out = mask if ss == 1 else mask.resize((size, size), Image.Resampling.LANCZOS)
    _SQUIRCLE_MASK_CACHE[size] = out
    return out


def apply_squircle(img: Image.Image) -> Image.Image:
    """Clip icon to squircle (matches Icon Composer / Dock shape)."""
    rgba = img.convert("RGBA")
    mask = squircle_mask(rgba.size[0])
    red, green, blue, alpha = rgba.split()
    alpha = ImageChops.multiply(alpha, mask)
    return Image.merge("RGBA", (red, green, blue, alpha))


def layout_ring_on_canvas(
    src: Image.Image,
    *,
    layer_scale: float,
    background: tuple[int, int, int, int] | None,
) -> Image.Image:
    foreground = center_in_square_by_centroid(crop_to_content(remove_near_black(src)))
    width, height = foreground.size
    target = int(round(MACOS_ART_SAFE_AREA * layer_scale))
    scale = min(target / width, target / height)
    new_w = max(1, int(round(width * scale)))
    new_h = max(1, int(round(height * scale)))
    logo = foreground.resize((new_w, new_h), Image.Resampling.LANCZOS)

    bg = background if background is not None else (0, 0, 0, 0)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), bg)
    center = CANVAS / 2
    centroid_x, centroid_y = alpha_centroid(logo)
    offset_x = int(round(center - centroid_x))
    offset_y = int(round(center - centroid_y))
    canvas.paste(logo, (offset_x, offset_y), logo)
    return canvas


def compose_ring_layer(src: Image.Image) -> Image.Image:
    """Transparent 1024×1024 ring for Icon.icon / ictool (scale applied in icon.json)."""
    return layout_ring_on_canvas(
        src,
        layer_scale=RING_SCALE_FOR_COMPOSER_ASSET,
        background=None,
    )


def export_icon_composer_preview_1024(src: Image.Image) -> Image.Image | None:
    """Render Icon.icon via ictool (824 art + pad), matching macOS .icns appearance."""
    ictool = find_ictool()
    if ictool is None:
        return None

    prepare_icon_composer_asset(src)
    sips = shutil.which("sips")
    if not sips:
        return None

    # Appearance name varies by Xcode / Icon Composer (older: "macOS Default").
    appearances = ("macOS", "macOS Default")
    with tempfile.TemporaryDirectory(prefix="bossim-icon-") as tmp:
        tmp_path = Path(tmp)
        art_824 = tmp_path / "icon_art_824.png"
        art_1024 = tmp_path / "icon_1024.png"
        last_error: subprocess.CalledProcessError | None = None
        for appearance in appearances:
            try:
                subprocess.run(
                    [
                        str(ictool),
                        str(ICON_ICON),
                        "--export-preview",
                        appearance,
                        "824",
                        "824",
                        "1",
                        "-45",
                        str(art_824),
                    ],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                last_error = None
                break
            except subprocess.CalledProcessError as exc:
                last_error = exc
        if last_error is not None:
            return None
        subprocess.run(
            [sips, "--padToHeightWidth", "1024", "1024", str(art_824), "--out", str(art_1024)],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        return Image.open(art_1024).convert("RGBA")


def compose_ico_master_pillow(src: Image.Image) -> Image.Image:
    """White 1024×1024 + ring at Icon.icon layer scale + squircle."""
    layer_scale = load_icon_layer_scale()
    canvas = layout_ring_on_canvas(
        src,
        layer_scale=layer_scale,
        background=BACKGROUND_RGBA,
    )
    return canvas


def compose_ico_master(src: Image.Image) -> Image.Image:
    preview: Image.Image | None = None
    if can_use_icon_composer():
        try:
            preview = export_icon_composer_preview_1024(src)
        except subprocess.CalledProcessError:
            preview = None
    if preview is not None:
        # ictool exports square art; macOS applies squircle at display time for .icns.
        # Bake squircle + white interior into .ico so Windows previews/taskbar match Dock.
        flat = Image.new("RGBA", preview.size, BACKGROUND_RGBA)
        flat.paste(preview, mask=preview.split()[3])
        return flat
    return compose_ico_master_pillow(src)


def finalize_ico_master(img: Image.Image) -> Image.Image:
    """Apply squircle once at full resolution; ICO sizes are downscaled from this."""
    return apply_squircle(img.convert("RGBA"))


def prepare_icon_composer_asset(src: Image.Image) -> None:
    ICON_ICON_ASSET.parent.mkdir(parents=True, exist_ok=True)
    compose_ring_layer(src).save(ICON_ICON_ASSET)


def build_icns_via_icon_composer() -> None:
    src = load_source()
    prepare_icon_composer_asset(src)
    env = {**os.environ, "DEST_ICNS": str(ICNS_OUT)}
    subprocess.run(
        ["bash", str(BUILD_ICON_SH), str(ICON_ICON), "Bossim", str(ICON_BUILD_OUT)],
        check=True,
        env=env,
        cwd=str(REPO_ROOT),
    )


def write_icns_pillow_fallback(master: Image.Image, out_path: Path) -> None:
    iconutil = shutil.which("iconutil")
    sips = shutil.which("sips")
    if not iconutil or not sips:
        print("sips/iconutil not found; skipping .icns", file=sys.stderr)
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
    print(f"Wrote {out_path} (Pillow fallback)")


def write_ico(master: Image.Image, out_path: Path) -> None:
    # Downscale already anti-aliased 1024 master — do not re-clip per size (causes jaggies).
    images = [master.resize((size, size), Image.Resampling.LANCZOS) for size in ICO_SIZES]
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


def main() -> None:
    generate_all = "--all" in sys.argv
    ico_only = "--ico-only" in sys.argv
    if generate_all and ico_only:
        print("Use only one of --all or --ico-only", file=sys.stderr)
        raise SystemExit(1)

    # Default: .icns only (icon.png rarely changes). Windows packaging uses --ico-only.
    build_icns = not ico_only
    build_ico = generate_all or ico_only

    src = load_source()

    if build_icns:
        if can_use_icon_composer():
            build_icns_via_icon_composer()
        else:
            print(
                "Icon Composer unavailable; using Pillow .icns fallback (macOS build may look wrong).",
                file=sys.stderr,
            )
            write_icns_pillow_fallback(finalize_ico_master(compose_ico_master(src)), ICNS_OUT)

    if build_ico:
        write_ico(finalize_ico_master(compose_ico_master(src)), ICO_OUT)

    print("Done.")


if __name__ == "__main__":
    main()
