from PIL import Image
import os

SRC = r"D:\livestreamEKC\sdaFamily\LowerThirdAssets\clean"
OUT = r"D:\livestreamEKC\sdaFamily\LowerThirdAssets\lowerthird"

os.makedirs(OUT, exist_ok=True)

for file in os.listdir(SRC):
    if not file.endswith(".png"):
        continue

    img = Image.open(os.path.join(SRC, file))
    w, h = img.size

    # Crop bottom 30% (lower-third)
    crop_box = (0, int(h*0.65), w, h)
    cropped = img.crop(crop_box)

    cropped.save(os.path.join(OUT, file))

print("Lower-third cropping done.")