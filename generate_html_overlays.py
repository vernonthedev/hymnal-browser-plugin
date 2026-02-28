import os

# ===== PATHS =====
IMG_DIR = r"D:\livestreamEKC\sdaFamily\LowerThirdAssets\lowerthird"
WEB_DIR = r"D:\livestreamEKC\web"
OVERLAYS_DIR = os.path.join(WEB_DIR, "overlays")
ASSETS_DIR = os.path.join(WEB_DIR, "assets", "images")

# ===== CREATE DIRS =====
os.makedirs(OVERLAYS_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR, exist_ok=True)

print("======================================")
print("   GENERATING HTML OVERLAYS FOR OBS")
print("======================================")

# ===== COPY IMAGES TO WEB ASSETS =====
print("\n[+] Copying images to web assets folder...")

for img in os.listdir(IMG_DIR):
    if img.lower().endswith(".png"):
        src = os.path.join(IMG_DIR, img)
        dst = os.path.join(ASSETS_DIR, img)
        if not os.path.exists(dst):
            with open(src, "rb") as fsrc:
                with open(dst, "wb") as fdst:
                    fdst.write(fsrc.read())

print("[✓] Images copied")

# ===== HTML TEMPLATE =====
template = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Lower Third Overlay</title>
<style>
body {{
    margin: 0;
    padding: 0;
    background: transparent;
    overflow: hidden;
    font-family: Arial, sans-serif;
}}

.container {{
    position: absolute;
    bottom: 6%;
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
}}

img {{
    max-width: 92%;
    height: auto;
    animation: fadeIn 0.6s ease-in-out;
    filter: drop-shadow(0px 4px 10px rgba(0,0,0,0.6));
}}

@keyframes fadeIn {{
    from {{ opacity: 0; transform: translateY(15px); }}
    to {{ opacity: 1; transform: translateY(0); }}
}}
</style>
</head>

<body>
    <div class="container">
        <img src="../assets/images/{img}">
    </div>
</body>
</html>
"""

# ===== GENERATE HTML FILES =====
count = 0

for img in sorted(os.listdir(ASSETS_DIR)):
    if not img.lower().endswith(".png"):
        continue

    name = os.path.splitext(img)[0]
    html_content = template.format(img=img)

    html_path = os.path.join(OVERLAYS_DIR, f"{name}.html")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    count += 1

print(f"\n[✓] Generated {count} HTML overlay pages")
print("\nSystem ready for OBS Browser Sources.")