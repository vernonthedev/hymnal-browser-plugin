from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = ROOT / "assets" / "logo.png"
OUTPUT_PATH = ROOT / "assets" / "icon-source.png"
TARGET_SIZE = 1024


def main() -> None:
    image = Image.open(SOURCE_PATH).convert("RGBA")
    width, height = image.size

    crop_size = min(height - 96, width - 520)
    crop_size = max(768, min(crop_size, height))
    crop_left = (width - crop_size) // 2
    crop_top = max(28, (height - crop_size) // 2 - 12)
    crop_box = (
        crop_left,
        crop_top,
        crop_left + crop_size,
        crop_top + crop_size,
    )

    cropped = image.crop(crop_box)
    resized = cropped.resize((TARGET_SIZE, TARGET_SIZE), Image.Resampling.LANCZOS)

    # Tighten the mark further inside the icon so Windows shortcut sizes
    # preserve the central artwork instead of the wide banner composition.
    inset = 44
    inner_size = TARGET_SIZE - (inset * 2)
    framed = resized.resize((inner_size, inner_size), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (TARGET_SIZE, TARGET_SIZE), (24, 54, 34, 255))
    canvas.paste(framed, (inset, inset), framed)

    shadow = canvas.filter(ImageFilter.GaussianBlur(radius=14))
    final = Image.blend(shadow, canvas, 0.82)
    final.save(OUTPUT_PATH)


if __name__ == "__main__":
    main()
