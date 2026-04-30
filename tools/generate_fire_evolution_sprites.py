from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SPRITE_ROOT = ROOT / "public" / "assets" / "sprites" / "fire-family"
CANVAS_SIZE = 160
ROWS = 2
COLS = 3
DURATION_MS = 120


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("source sprite has no visible pixels")
    return bbox


def crop_visible(image: Image.Image) -> Image.Image:
    return image.crop(alpha_bbox(image))


def multiply_alpha(image: Image.Image, alpha: float) -> Image.Image:
    result = image.copy()
    channel = result.getchannel("A").point(lambda value: int(value * alpha))
    result.putalpha(channel)
    return result


def tint_toward(image: Image.Image, color: tuple[int, int, int], strength: float) -> Image.Image:
    if strength <= 0:
        return image
    result = image.convert("RGBA")
    r, g, b, a = result.split()
    overlay = Image.new("RGBA", result.size, (*color, 0))
    overlay.putalpha(a.point(lambda value: int(value * strength)))
    return Image.alpha_composite(result, overlay)


def white_silhouette(image: Image.Image, strength: float) -> Image.Image:
    if strength <= 0:
        return image
    result = image.convert("RGBA")
    silhouette = Image.new("RGBA", result.size, (255, 255, 255, 0))
    silhouette.putalpha(result.getchannel("A"))
    return Image.blend(result, silhouette, min(1, strength))


def paste_centered(canvas: Image.Image, sprite: Image.Image, scale: float, alpha: float, y_offset: int = 0) -> None:
    if alpha <= 0 or scale <= 0:
        return

    visible = crop_visible(sprite)
    width = max(1, int(visible.width * scale))
    height = max(1, int(visible.height * scale))
    resized = visible.resize((width, height), Image.Resampling.NEAREST)
    resized = multiply_alpha(resized, alpha)
    x = (CANVAS_SIZE - width) // 2
    y = CANVAS_SIZE - height - 15 + y_offset
    canvas.alpha_composite(resized, (x, y))


def draw_glow(canvas: Image.Image, progress: float, intensity: float) -> None:
    if intensity <= 0:
        return

    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    center = (CANVAS_SIZE // 2, CANVAS_SIZE // 2 - 5)
    radius = int(22 + 54 * progress)
    alpha = int(190 * intensity)
    draw.ellipse(
        (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius),
        outline=(255, 244, 170, alpha),
        width=5,
    )
    draw.ellipse(
        (center[0] - radius // 2, center[1] - radius // 2, center[0] + radius // 2, center[1] + radius // 2),
        fill=(255, 255, 255, int(72 * intensity)),
    )
    for index in range(8):
        angle = index * math.tau / 8 + progress * 1.8
        inner = radius * 0.55
        outer = radius * 1.05
        x1 = center[0] + math.cos(angle) * inner
        y1 = center[1] + math.sin(angle) * inner
        x2 = center[0] + math.cos(angle) * outer
        y2 = center[1] + math.sin(angle) * outer
        draw.line((x1, y1, x2, y2), fill=(255, 247, 180, alpha), width=3)
    canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(0.6)))


def draw_particles(canvas: Image.Image, frame_index: int, intensity: float) -> None:
    if intensity <= 0:
        return

    draw = ImageDraw.Draw(canvas)
    points = [(-48, -18), (45, -34), (-35, 25), (52, 16), (-5, -48), (12, 38)]
    center_x = CANVAS_SIZE // 2
    center_y = CANVAS_SIZE // 2 - 2
    for index, (base_x, base_y) in enumerate(points):
        spread = 1 + frame_index * 0.18
        x = int(center_x + base_x * spread + ((index % 2) * 4))
        y = int(center_y + base_y * spread)
        alpha = int(230 * intensity)
        draw.rectangle((x - 2, y - 2, x + 2, y + 2), fill=(255, 221, 83, alpha))
        draw.line((x - 5, y, x + 5, y), fill=(255, 247, 180, alpha), width=2)
        draw.line((x, y - 5, x, y + 5), fill=(255, 247, 180, alpha), width=2)


def make_frame(old_sprite: Image.Image, new_sprite: Image.Image, frame_index: int) -> Image.Image:
    specs = [
        {"old_alpha": 1.00, "new_alpha": 0.00, "old_white": 0.00, "new_white": 0.00, "glow": 0.08},
        {"old_alpha": 1.00, "new_alpha": 0.00, "old_white": 0.92, "new_white": 0.00, "glow": 0.48},
        {"old_alpha": 0.72, "new_alpha": 0.46, "old_white": 1.00, "new_white": 1.00, "glow": 0.82},
        {"old_alpha": 0.34, "new_alpha": 0.88, "old_white": 1.00, "new_white": 1.00, "glow": 0.82},
        {"old_alpha": 0.00, "new_alpha": 1.00, "old_white": 0.00, "new_white": 0.72, "glow": 0.44},
        {"old_alpha": 0.00, "new_alpha": 1.00, "old_white": 0.00, "new_white": 0.00, "glow": 0.06},
    ][frame_index]

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    draw_glow(canvas, frame_index / 5, specs["glow"])

    old_tinted = white_silhouette(old_sprite, specs["old_white"])
    new_tinted = white_silhouette(new_sprite, specs["new_white"])
    paste_centered(canvas, old_tinted, 1.0, specs["old_alpha"], y_offset=0)
    paste_centered(canvas, new_tinted, 1.0, specs["new_alpha"], y_offset=0)

    draw_particles(canvas, frame_index, min(1, specs["glow"] + 0.2))
    enhancer = ImageEnhance.Contrast(canvas)
    return enhancer.enhance(1.04)


def generate_transition(from_stage: int, to_stage: int) -> None:
    label = f"stage{from_stage}_evolve_to_stage{to_stage}"
    output_dir = SPRITE_ROOT / label
    output_dir.mkdir(parents=True, exist_ok=True)

    old_sprite = Image.open(SPRITE_ROOT / f"stage{from_stage}_idle" / f"stage{from_stage}_idle-1.png").convert("RGBA")
    new_sprite = Image.open(SPRITE_ROOT / f"stage{to_stage}_idle" / f"stage{to_stage}_idle-1.png").convert("RGBA")

    frames = [make_frame(old_sprite, new_sprite, index) for index in range(ROWS * COLS)]
    for index, frame in enumerate(frames, start=1):
        frame.save(output_dir / f"{label}-{index}.png")

    sheet = Image.new("RGBA", (CANVAS_SIZE * COLS, CANVAS_SIZE * ROWS), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        x = (index % COLS) * CANVAS_SIZE
        y = (index // COLS) * CANVAS_SIZE
        sheet.alpha_composite(frame, (x, y))
    sheet.save(output_dir / "sheet-transparent.png")

    frames[0].save(
        output_dir / "animation.gif",
        save_all=True,
        append_images=frames[1:],
        duration=DURATION_MS,
        loop=0,
        disposal=2,
    )

    metadata = {
        "source": "programmatic composite from existing idle transparent frames",
        "fromStage": from_stage,
        "toStage": to_stage,
        "rows": ROWS,
        "cols": COLS,
        "frameWidth": CANVAS_SIZE,
        "frameHeight": CANVAS_SIZE,
        "durationMs": DURATION_MS,
        "frames": [f"{label}-{index}.png" for index in range(1, ROWS * COLS + 1)],
    }
    (output_dir / "pipeline-meta.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def main() -> None:
    generate_transition(1, 2)
    generate_transition(2, 3)


if __name__ == "__main__":
    main()
