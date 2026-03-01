import os
import argparse
from PIL import Image, ImageDraw, ImageOps

def smarter_remove_bg(src_dir, out_dir, tolerance=15):
    """
    Better background removal using Flood Fill from the corners.
    This preserves white text in the center while removing white backgrounds.
    """
    os.makedirs(out_dir, exist_ok=True)
    
    # Common background colors (usually white)
    bg_targets = [(255, 255, 255)] 

    files = [f for f in os.listdir(src_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    print(f"[*] Found {len(files)} files. Starting cleanup...")

    for i, file in enumerate(files):
        img_path = os.path.join(src_dir, file)
        try:
            # Open and ensure RGBA
            img = Image.open(img_path).convert("RGBA")
            width, height = img.size
            
            # Start a mask (all transparent)
            mask = Image.new("L", (width, height), 0)
            
            # Flood fill from all four corners
            corners = [(0, 0), (width-1, 0), (0, height-1), (width-1, height-1)]
            
            for corner in corners:
                # Target the color at the corner
                target_color = img.getpixel(corner)
                # Only flood if it's "close enough" to common backgrounds or the target
                # We use Pillow's floodfill on a separate mask
                ImageOps.floodfill(img, corner, (0,0,0,0), thresh=tolerance)

            # Save the result
            out_path = os.path.join(out_dir, file.rsplit('.', 1)[0] + ".png")
            img.save(out_path, "PNG")
            
            if (i+1) % 10 == 0:
                print(f"    - Processed {i+1}/{len(files)}")
                
        except Exception as e:
            print(f"    - Error on {file}: {e}")

    print("[+] Background cleaning done.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean background from hymn slides.")
    parser.add_argument("--src", default=r"D:\livestreamEKC\sdaFamily\LowerThirdAssets\slides", help="Source directory")
    parser.add_argument("--out", default=r"D:\livestreamEKC\sdaFamily\LowerThirdAssets\clean", help="Output directory")
    parser.add_argument("--tolerance", type=int, default=30, help="Color tolerance for flood fill")
    
    args = parser.parse_args()
    smarter_remove_bg(args.src, args.out, args.tolerance)