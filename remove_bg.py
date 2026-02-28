from PIL import Image
import os

SRC = r"D:\livestreamEKC\sdaFamily\LowerThirdAssets\slides"
OUT = r"D:\livestreamEKC\sdaFamily\LowerThirdAssets\clean"

os.makedirs(OUT, exist_ok=True)

for file in os.listdir(SRC):
    if not file.endswith(".png"):
        continue

    img = Image.open(os.path.join(SRC, file)).convert("RGBA")
    data = img.getdata()

    new_data = []
    for item in data:
        # Remove white-ish backgrounds
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            new_data.append((255,255,255,0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(os.path.join(OUT, file))

print("Background cleaning done.")