from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from generate_fire_evolution_sprites import CANVAS_SIZE, COLS, DURATION_MS, ROWS, make_frame


ROOT = Path(__file__).resolve().parents[1]
SPRITE_ROOT = ROOT / "public" / "assets" / "sprites" / "water-family-v3"


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
        "source": "programmatic water-family composite from existing idle transparent frames",
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
