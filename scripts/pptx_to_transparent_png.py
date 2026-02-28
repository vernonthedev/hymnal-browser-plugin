import os
from pathlib import Path
import win32com.client

SOURCE_DIR = r"D:\livestreamEKC\sdaFamily\Converted_PowerPoints"
OUTPUT_DIR = r"D:\livestreamEKC\sdaFamily\LowerThirdAssets\slides"

os.makedirs(OUTPUT_DIR, exist_ok=True)

ppApp = win32com.client.Dispatch("PowerPoint.Application")

for ppt in Path(SOURCE_DIR).glob("*.pptx"):
    print(f"[+] Processing {ppt.name}")
    pres = ppApp.Presentations.Open(str(ppt), WithWindow=False)

    for i, slide in enumerate(pres.Slides, 1):
        out = os.path.join(OUTPUT_DIR, f"{ppt.stem}_slide_{i}.png")

        # Export slide as PNG
        slide.Export(out, "PNG")

    pres.Close()

ppApp.Quit()