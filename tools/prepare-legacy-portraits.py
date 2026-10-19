#!/usr/bin/env python3
"""Regenerate the neutral legacy portrait placeholders.

`mia` and `frankie` stay stable character ids because the authored legacy mission
catalogue (`src/missions/catalogue.json`) and the dialogue preview reference them.
Their supplied raster portraits are no longer shipped, so each id falls back to a
clearly neutral placeholder card: flat slate artwork, a featureless silhouette and
the initials only. These cards never pretend to be the supplied portraits and are
not a portrait of any current cast member.

The cards are drawn from original geometry plus the small bitmap glyph set defined
below, so the tool never reads a system font (no Arial, no downloaded webfont) and
renders the same bytes on any machine. The supplied raster portraits are never
touched; only `legacy-mia.png` and `legacy-frankie.png` are written.

Dependency: Pillow (https://python-pillow.org), e.g. `python3 -m pip install Pillow`.

Usage:
  python3 tools/prepare-legacy-portraits.py               # regenerate the committed cards
  python3 tools/prepare-legacy-portraits.py --check       # verify committed bytes match
  python3 tools/prepare-legacy-portraits.py --output DIR  # write the cards into DIR
"""
from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "assets" / "characters"

W, H = 256, 296
BACKDROP = (47, 59, 65)
FRAME = (122, 140, 148)
FIGURE = (108, 124, 132)
INK = (240, 230, 207)
NOTE = (150, 166, 173)

# id -> initials drawn on the card.
CARDS = {"legacy-mia": "M", "legacy-frankie": "F"}
LABEL = "LEGACY PLACEHOLDER"

# 5x7 bitmap glyphs, original to this tool. Each row is five cells of "#" (ink) or
# "." (blank). Only the initials and the label letters are defined, so no font file
# is read and no glyph is traced from a third-party typeface.
GLYPHS = {
    "A": (".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    "C": (".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."),
    "D": ("####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."),
    "E": ("#####", "#....", "#....", "####.", "#....", "#....", "#####"),
    "F": ("#####", "#....", "#....", "####.", "#....", "#....", "#...."),
    "G": (".###.", "#...#", "#....", "#..##", "#...#", "#...#", ".###."),
    "H": ("#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    "L": ("#....", "#....", "#....", "#....", "#....", "#....", "#####"),
    "M": ("#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"),
    "O": (".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    "P": ("####.", "#...#", "#...#", "####.", "#....", "#....", "#...."),
    "R": ("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"),
    "Y": ("#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."),
    " ": (".....", ".....", ".....", ".....", ".....", ".....", "....."),
}
GLYPH_W, GLYPH_H = 5, 7
GAP = 1


def text_width(text: str, scale: int) -> int:
    """Pixel width of `text` at `scale`, matching the spacing `draw_text` uses."""
    return len(text) * (GLYPH_W + GAP) * scale - GAP * scale


def draw_text(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, scale: int, fill: tuple[int, int, int]) -> None:
    for index, char in enumerate(text):
        glyph = GLYPHS[char]
        origin_x = x + index * (GLYPH_W + GAP) * scale
        for row, line in enumerate(glyph):
            for col, cell in enumerate(line):
                if cell != "#":
                    continue
                left, top = origin_x + col * scale, y + row * scale
                draw.rectangle([left, top, left + scale - 1, top + scale - 1], fill=fill)


def card(initials: str) -> Image.Image:
    image = Image.new("RGB", (W, H), BACKDROP)
    draw = ImageDraw.Draw(image)

    # A plain frame reads as a placeholder rather than a supplied photograph.
    draw.rectangle([6, 6, W - 7, H - 7], outline=FRAME, width=2)

    # Featureless silhouette: a head and shoulders with no face, so the card cannot
    # be mistaken for the removed raster art or for any current cast member.
    draw.ellipse([W // 2 - 52, 62, W // 2 + 52, 166], fill=FIGURE)
    draw.polygon(
        [(W // 2 - 96, H - 46), (W // 2 - 60, 168), (W // 2 + 60, 168), (W // 2 + 96, H - 46)],
        fill=FIGURE,
    )

    big_scale = 10
    draw_text(draw, initials, (W - text_width(initials, big_scale)) // 2, 88, big_scale, INK)
    small_scale = 2
    draw_text(draw, LABEL, (W - text_width(LABEL, small_scale)) // 2, H - 40, small_scale, NOTE)
    return image


def render(initials: str) -> bytes:
    """Encode the card exactly as it is written to disk, so `--check` can compare bytes."""
    buffer = io.BytesIO()
    card(initials).save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--check", action="store_true", help="verify the committed cards match regeneration byte for byte")
    parser.add_argument("--output", type=Path, default=None, help="write the cards into this directory instead of the committed location")
    args = parser.parse_args(argv)

    failures = 0
    for name, initials in CARDS.items():
        data = render(initials)
        if args.check:
            target = OUT / f"{name}.png"
            actual = target.read_bytes() if target.exists() else None
            if actual == data:
                print(f"ok {target.relative_to(ROOT)} ({len(data)} bytes)")
            else:
                print(f"stale {target.relative_to(ROOT)}: run python3 tools/prepare-legacy-portraits.py")
                failures += 1
        else:
            target = (args.output or OUT) / f"{name}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            print(f"wrote {target} ({len(data)} bytes)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
