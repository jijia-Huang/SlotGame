from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SPRITE_ROOT = ROOT / "public" / "assets" / "sprites" / "fire-family"
SOURCE_WITH_WINGS = SPRITE_ROOT / "stage3_hit"
TARGET_NO_WINGS = SPRITE_ROOT / "stage3_hit_wingfix"
FRAME_COUNT = 4
FRAME_SIZE = 128


def make_wing_mask(source: Image.Image) -> Image.Image:
    rgba = source.convert("RGBA")
    mask = Image.new("L", rgba.size, 0)
    pixels = rgba.load()
    out = mask.load()

    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue

            is_teal_membrane = g >= 70 and b >= 55 and r <= 90
            is_deep_wing_shadow = r <= 55 and 45 <= g <= 120 and 45 <= b <= 120
            if is_teal_membrane or is_deep_wing_shadow:
                out[x, y] = 255

    # Pull in the black outline and orange struts immediately adjacent to teal membrane.
    return mask.filter(ImageFilter.MaxFilter(9))


def extract_wings(source: Image.Image) -> Image.Image:
    rgba = source.convert("RGBA")
    mask = make_wing_mask(rgba)
    wing_layer = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    wing_layer.paste(rgba, (0, 0), mask)
    return wing_layer


def compose_frame(index: int) -> Image.Image:
    source = Image.open(SOURCE_WITH_WINGS / f"stage3_hit-{index}.png").convert("RGBA")
    target = Image.open(TARGET_NO_WINGS / f"stage3_hit_wingfix-{index}.png").convert("RGBA")
    canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(extract_wings(source))
    canvas.alpha_composite(target)
    return canvas


def main() -> None:
    frames = [compose_frame(index) for index in range(1, FRAME_COUNT + 1)]

    for index, frame in enumerate(frames, start=1):
      frame.save(TARGET_NO_WINGS / f"stage3_hit_wingfix-{index}.png")

    sheet = Image.new("RGBA", (FRAME_SIZE * 2, FRAME_SIZE * 2), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, ((index % 2) * FRAME_SIZE, (index // 2) * FRAME_SIZE))
    sheet.save(TARGET_NO_WINGS / "sheet-transparent.png")

    frames[0].save(
        TARGET_NO_WINGS / "animation.gif",
        save_all=True,
        append_images=frames[1:],
        duration=140,
        loop=0,
        disposal=2,
    )

    metadata = {
        "source": "programmatic wing composite",
        "baseFrames": str(TARGET_NO_WINGS),
        "wingReferenceFrames": str(SOURCE_WITH_WINGS),
        "frames": [f"stage3_hit_wingfix-{index}.png" for index in range(1, FRAME_COUNT + 1)],
    }
    (TARGET_NO_WINGS / "wingfix-meta.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
